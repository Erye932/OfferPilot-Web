/**
 * V4 报告组件 - 共享样式 / 常量 / 工具
 */
import type {
  V4Dimension,
  CellStatus,
  Severity,
  FixType,
  ImpactSurface,
  CredibilityConcern,
  ResumeSectionType,
} from '@/lib/diagnose/types';

// ─── 维度元信息 ─────────────────────────────────────
export const DIMENSION_META: Record<V4Dimension, {
  label: string;
  shortLabel: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
}> = {
  structure: {
    label: '结构 / 排版',
    shortLabel: '结构',
    textColor: 'text-violet-700',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
  },
  expression: {
    label: '表达 / 语言',
    shortLabel: '表达',
    textColor: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  evidence: {
    label: '证据 / 量化',
    shortLabel: '证据',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  role_fit: {
    label: '岗位贴合',
    shortLabel: '岗位',
    textColor: 'text-sky-700',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
  },
  credibility: {
    label: '可信度',
    shortLabel: '可信',
    textColor: 'text-rose-700',
    bgColor: 'bg-rose-50',
    borderColor: 'border-rose-200',
  },
  missing_info: {
    label: '信息缺失',
    shortLabel: '缺失',
    textColor: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
};

// ─── 状态元信息（颜色 + label）──────────────
export const STATUS_META: Record<CellStatus, {
  label: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  ringColor: string;
}> = {
  ok: {
    label: '良好',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-300',
    textColor: 'text-emerald-700',
    ringColor: 'ring-emerald-400',
  },
  warn: {
    label: '提醒',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    textColor: 'text-amber-700',
    ringColor: 'ring-amber-400',
  },
  problem: {
    label: '问题',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    textColor: 'text-red-700',
    ringColor: 'ring-red-400',
  },
  missing: {
    label: '缺失',
    bgColor: 'bg-neutral-100',
    borderColor: 'border-neutral-400',
    textColor: 'text-neutral-700',
    ringColor: 'ring-neutral-400',
  },
};

// ─── 严重度元信息 ─────────────────────────────────
export const SEVERITY_META: Record<Severity, {
  label: string;
  shortLabel: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  rank: number;
}> = {
  must_fix: {
    label: '必改',
    shortLabel: 'M',
    textColor: 'text-red-700',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-300',
    rank: 4,
  },
  should_fix: {
    label: '建议改',
    shortLabel: 'S',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-100',
    borderColor: 'border-amber-300',
    rank: 3,
  },
  optional: {
    label: '可选',
    shortLabel: 'O',
    textColor: 'text-sky-700',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    rank: 2,
  },
  nitpicky: {
    label: '吹毛求疵',
    shortLabel: 'N',
    textColor: 'text-neutral-600',
    bgColor: 'bg-neutral-100',
    borderColor: 'border-neutral-200',
    rank: 1,
  },
};

// ─── 修复类型 ─────────────────────────────────────
export const FIX_TYPE_META: Record<FixType, {
  label: string;
  textColor: string;
}> = {
  safe_expand: {
    label: '可自改',
    textColor: 'text-emerald-700',
  },
  needs_user_input: {
    label: '需补料',
    textColor: 'text-amber-700',
  },
  forbidden_to_invent: {
    label: '禁编造',
    textColor: 'text-red-700',
  },
};

// ─── 影响环节 ─────────────────────────────────────
export const IMPACT_META: Record<ImpactSurface, { label: string; shortLabel: string }> = {
  ats: { label: 'ATS', shortLabel: 'ATS' },
  hr_6s: { label: 'HR 6 秒', shortLabel: '6s' },
  hr_30s: { label: 'HR 30 秒', shortLabel: '30s' },
  interview: { label: '面试', shortLabel: '面' },
  combined: { label: '综合', shortLabel: '综' },
};

// ─── 可信度问题 ───────────────────────────────────
export const CRED_CONCERN_META: Record<CredibilityConcern, { label: string }> = {
  numeric_doubt: { label: '数字可疑' },
  overclaim: { label: '过度声称' },
  skill_stuffing: { label: '技能堆砌' },
  timeline_conflict: { label: '时间冲突' },
  vague_role: { label: '角色模糊' },
};

// ─── 段落标签 ─────────────────────────────────────
export const SECTION_META: Record<ResumeSectionType, { label: string }> = {
  personal_info: { label: '个人信息' },
  education: { label: '教育' },
  work_experience: { label: '工作' },
  internship: { label: '实习' },
  project: { label: '项目' },
  skill: { label: '技能' },
  self_evaluation: { label: '自我评价' },
  certificate: { label: '证书' },
  other: { label: '其他' },
};

// ─── 工具函数 ─────────────────────────────────────
export function clsx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function getRiskBadgeClasses(level: 'low' | 'medium' | 'high'): string {
  switch (level) {
    case 'low': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    case 'medium': return 'bg-amber-100 text-amber-700 border-amber-300';
    case 'high': return 'bg-red-100 text-red-700 border-red-300';
  }
}

/** 三档风险/严重度的中文 label —— 用于 risks.level / credibility_flag.severity / interview_risk */
export const RISK_LEVEL_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: '低',
  medium: '中',
  high: '高',
};

export function getGradeBadgeClasses(grade: 'excellent' | 'strong' | 'medium' | 'weak'): string {
  switch (grade) {
    case 'excellent': return 'bg-emerald-100 text-emerald-700 border-emerald-300';
    case 'strong': return 'bg-sky-100 text-sky-700 border-sky-300';
    case 'medium': return 'bg-amber-100 text-amber-700 border-amber-300';
    case 'weak': return 'bg-red-100 text-red-700 border-red-300';
  }
}

export function gradeLabel(grade: 'excellent' | 'strong' | 'medium' | 'weak'): string {
  return { excellent: '优秀', strong: '良好', medium: '中等', weak: '偏弱' }[grade];
}
