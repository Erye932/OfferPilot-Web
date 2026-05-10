// 三库加载器
// 负责加载 diagnosis-rules, insider-views, rewrite-patterns 三个知识库

import type { DiagnosisRule, InsiderView, RewritePattern, Persona } from './types';

// 使用 require 导入 JSON 文件，避免 TypeScript 模块解析问题
import diagnosisRulesData from '../../offerpilot-corpus/distilled/diagnosis-rules.json';
import insiderViewsData from '../../offerpilot-corpus/distilled/insider-views.json';
import rewritePatternsData from '../../offerpilot-corpus/distilled/rewrite-patterns.json';

// 类型断言
const diagnosisRules = diagnosisRulesData as DiagnosisRule[];
const insiderViews = insiderViewsData as InsiderView[];
const rewritePatterns = rewritePatternsData as RewritePattern[];

// 按 issue_type 索引的查找表
const rulesByIssueType: Record<string, DiagnosisRule> = {};
const viewsByIssueType: Record<string, InsiderView> = {};
const patternsByIssueType: Record<string, RewritePattern> = {};

// 构建索引
diagnosisRules.forEach(rule => {
  rulesByIssueType[rule.issue_type] = rule;
});

insiderViews.forEach(view => {
  viewsByIssueType[view.issue_type] = view;
});

rewritePatterns.forEach(pattern => {
  patternsByIssueType[pattern.issue_type] = pattern;
});

// 导出函数

/**
 * 获取所有诊断规则
 */
export function getDiagnosisRules(): DiagnosisRule[] {
  return diagnosisRules;
}

/**
 * 按 issue_type 获取诊断规则
 */
export function getRuleByIssueType(issueType: string): DiagnosisRule | undefined {
  return rulesByIssueType[issueType];
}

/**
 * 按 issue_type 获取内行视角
 */
export function getViewByIssueType(issueType: string): InsiderView | undefined {
  return viewsByIssueType[issueType];
}

/**
 * 按 issue_type 获取改写模式
 */
export function getPatternByIssueType(issueType: string): RewritePattern | undefined {
  return patternsByIssueType[issueType];
}

/**
 * 获取核心问题类型（免费版 V1 支持的5种）
 */
export function getCoreIssueTypes(): string[] {
  return [
    'lack_of_result_evidence',
    'keyword_alignment_weak',
    'weak_role_boundary',
    'jd_direction_mismatch',
    'overclaim_risk'
  ];
}

/**
 * 检查是否为核心问题类型
 */
export function isCoreIssueType(issueType: string): boolean {
  return getCoreIssueTypes().includes(issueType);
}

/**
 * 获取所有内行视角
 */
export function getAllInsiderViews(): InsiderView[] {
  return insiderViews;
}

/**
 * 获取所有改写模式
 */
export function getAllRewritePatterns(): RewritePattern[] {
  return rewritePatterns;
}

// ─── Persona Filter ──────────────────────────────────────────
// 语义（与 types.ts 的 applicable_personas 一致）：
//   - 条目 applicable_personas 缺省 / undefined / 空数组 → 通用池，对任何 persona 都入选
//   - 条目 applicable_personas 非空 → 仅当目标 persona 被列出时才入选
// 这样"通用池 + persona 特化池"可同时存在，tag 缺省也不会误丢条目。

interface WithApplicablePersonas {
  applicable_personas?: Persona[];
}

/**
 * 通用 persona filter：用泛型避免三份重复实现
 *
 * @param items - 任何带 applicable_personas? 字段的条目
 * @param persona - 目标 persona
 * @returns 命中通用池 + 特化池的条目
 */
export function filterByPersona<T extends WithApplicablePersonas>(
  items: readonly T[],
  persona: Persona
): T[] {
  return items.filter((item) => {
    // 缺省 / undefined / 空数组 → 通用池
    if (!item.applicable_personas || item.applicable_personas.length === 0) {
      return true;
    }
    // 非空 → 特化池，要求包含目标 persona
    return item.applicable_personas.includes(persona);
  });
}

/** 按 persona 过滤诊断规则 */
export function filterRulesByPersona(persona: Persona): DiagnosisRule[] {
  return filterByPersona(diagnosisRules, persona);
}

/** 按 persona 过滤内行视角 */
export function filterViewsByPersona(persona: Persona): InsiderView[] {
  return filterByPersona(insiderViews, persona);
}

/** 按 persona 过滤改写模式 */
export function filterPatternsByPersona(persona: Persona): RewritePattern[] {
  return filterByPersona(rewritePatterns, persona);
}

/**
 * 仅返回**特化池**条目（applicable_personas 明确包含目标 persona 的，排除通用池）。
 *
 * 使用场景：prompt 注入时，我们只想加入"这个 persona 特别需要注意的内容"，
 * 而不是把通用信息重复塞给 LLM。
 */
export function filterSpecializedByPersona<T extends WithApplicablePersonas>(
  items: readonly T[],
  persona: Persona
): T[] {
  return items.filter(
    (item) =>
      item.applicable_personas !== undefined &&
      item.applicable_personas.length > 0 &&
      item.applicable_personas.includes(persona)
  );
}

/** 获取 persona 专属的内行视角（排除通用池） */
export function getSpecializedViewsForPersona(persona: Persona): InsiderView[] {
  return filterSpecializedByPersona(insiderViews, persona);
}

/** 获取 persona 专属的改写模式（排除通用池） */
export function getSpecializedPatternsForPersona(persona: Persona): RewritePattern[] {
  return filterSpecializedByPersona(rewritePatterns, persona);
}

/**
 * 按 persona + issue_type 取一条诊断规则
 * 仅命中 applicable_personas 匹配的版本；若未命中则回退到缺省条目。
 */
export function getRuleByPersonaAndIssue(
  persona: Persona,
  issueType: string
): DiagnosisRule | undefined {
  const filtered = filterRulesByPersona(persona);
  return filtered.find((r) => r.issue_type === issueType);
}

// 导出原始数据（供其他模块使用）
export {
  diagnosisRules,
  insiderViews,
  rewritePatterns
};