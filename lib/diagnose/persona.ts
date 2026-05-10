// Persona detector — conservative fresh-grad / other classifier.
//
// Design principle: prefer false-negatives over false-positives.
// Rationale: the product's edge is helping resumes that read as "all-student-projects".
// Misclassifying an experienced professional as a fresh grad feels patronizing.
// False-negatives just route to the universal `other` voice — the existing
// experience is preserved.

import type { NormalizedInput } from './types';

/**
 * Persona = the dominant identity of a resume's owner.
 * - fresh_grad: Chinese new-grad / soon-to-graduate; campus projects + internships only, no full-time work.
 * - other:      Professional experience / overseas experience / career switch; defaults to the universal voice.
 */
export type Persona = 'fresh_grad' | 'other';

/**
 * PersonaResolution — output of persona detection.
 */
export interface PersonaResolution {
  persona: Persona;
  /** Confidence 0–1, mainly for debugging and explainability. */
  confidence: number;
  /** Triggered signals, for logs and regression diffing. */
  signals: string[];
  /** Original choice if the persona came from a UI override. */
  user_override?: Persona;
}

// ─── 信号正则（集中维护，便于单测与后续调优）──────────────

/** 显式应届关键词 */
const EXPLICIT_FRESH_GRAD = /应届(?:生|毕业生)?|在读|预计.{0,8}毕业|即将毕业|准毕业生/;

/** "X 年工作/从业/经验" — 用于锁定职场老将 */
const MULTI_YEAR_WORK = /(\d+)\s*年(?:以上|\+)?\s*(?:工作|从业|经验)/;

/** 资深职位关键词 */
const SENIOR_TITLE = /(?:高级|资深|主管|经理|总监|CTO|CEO|VP|负责人|架构师|Principal|Staff)/;

/** 学生场景 — 用于豁免学生组织里的"主管/负责人" */
const STUDENT_CONTEXT = /(?:社团|学生会|班级|校园|志愿者|学生组织|班长|部长|副部长|社长)/;

/** 学生活动关键词 */
const STUDENT_ACTIVITIES = /社团|学生会|班级|校园活动|支教|志愿者|迎新|课代表|研会|班委/;

/** 教育背景提示词 */
const EDUCATION_TERMS = /毕业|本科|硕士|博士|学士|研究生|MBA/;

/**
 * Detect the dominant persona of a resume.
 *
 * @param input    Normalized input (needs resume_text / resume_sections / experience_level).
 * @param override Manual UI selection — highest priority, fully overrides automatic detection.
 */
export function detectPersona(
  input: NormalizedInput,
  override?: Persona
): PersonaResolution {
  // ─── 手动覆盖优先 ────────────────────────────────────────
  if (override) {
    return {
      persona: override,
      confidence: 1.0,
      signals: ['user_override'],
      user_override: override,
    };
  }

  const signals: string[] = [];
  const { resume_text, resume_sections, experience_level } = input;
  const currentYear = new Date().getFullYear();

  // ─── Tier 1a: 具体数字年限（比模糊 experience_level 更可信）───
  const multiYearMatch = resume_text.match(MULTI_YEAR_WORK);
  if (multiYearMatch && parseInt(multiYearMatch[1], 10) >= 3) {
    signals.push(`work_years_${multiYearMatch[1]}`);
    return { persona: 'other', confidence: 0.9, signals };
  }

  // ─── Tier 1b: 用户显式自称应届（自我声明优先于启发式）────────
  //
  // 注意：这条必须放在 experience_level 检查前。因为 detectExperienceLevel
  // 会把 "工商管理/项目管理" 等教育/课程语境中的 "管理" 误判为 leadership 词，
  // 把明明是应届的简历标成 senior。用户自己写 "应届" 时应该以用户为准。
  if (EXPLICIT_FRESH_GRAD.test(resume_text)) {
    signals.push('explicit_fresh_grad_keyword');
    return { persona: 'fresh_grad', confidence: 0.95, signals };
  }

  // ─── Tier 2: 启发式 experience_level（较弱信号）─────────────
  if (experience_level === 'senior') {
    signals.push('senior_experience_level');
    return { persona: 'other', confidence: 0.9, signals };
  }

  // 毕业年份接近当前年（必须同时看到教育背景提示词，避免把项目时间误判为毕业时间）
  const yearMatches = Array.from(resume_text.matchAll(/\b(20\d{2})\b/g))
    .map((m) => parseInt(m[1], 10))
    .filter((y) => y >= 2010 && y <= currentYear + 3);
  const maxYear = yearMatches.length > 0 ? Math.max(...yearMatches) : null;

  if (maxYear !== null) {
    if (maxYear >= currentYear && EDUCATION_TERMS.test(resume_text)) {
      signals.push(`education_year_${maxYear}`);
      return { persona: 'fresh_grad', confidence: 0.9, signals };
    }
    if (maxYear <= currentYear - 4) {
      // 简历里最近的年份都是 4 年前，几乎不可能是应届
      signals.push(`latest_year_${maxYear}_too_old`);
      return { persona: 'other', confidence: 0.85, signals };
    }
  }

  // ─── Tier 3: 软信号加权 ──────────────────────────────────
  let score = 0;
  const hasWorkExp = resume_sections.some((s) => s.type === 'work_experience');
  const hasInternship = resume_sections.some((s) => s.type === 'internship');
  const hasProject = resume_sections.some((s) => s.type === 'project');

  if (!hasWorkExp && (hasInternship || hasProject)) {
    signals.push('no_work_only_intern_or_project');
    score += 2;
  }
  if (hasWorkExp) {
    signals.push('has_work_experience');
    score -= 3;
  }
  if (experience_level === 'junior') {
    signals.push('junior_level');
    score += 1;
  }
  if (STUDENT_ACTIVITIES.test(resume_text)) {
    signals.push('student_activities');
    score += 1;
  }
  // 仅提及"实习"、无全职段落
  if (/实习/.test(resume_text) && !hasWorkExp) {
    signals.push('only_internship_mentioned');
    score += 1;
  }
  // 非学生场景下的资深职位 → 明确推向 other
  if (SENIOR_TITLE.test(resume_text) && !STUDENT_CONTEXT.test(resume_text)) {
    signals.push('senior_title_non_student_context');
    score -= 2;
  }

  // ─── 决策 ───────────────────────────────────────────────
  if (score >= 3) {
    return {
      persona: 'fresh_grad',
      confidence: Math.min(0.85, 0.5 + score * 0.1),
      signals,
    };
  }

  // 默认：保守判为 other
  return {
    persona: 'other',
    confidence: score <= -2 ? 0.8 : 0.5,
    signals: signals.length > 0 ? signals : ['no_signal'],
  };
}
