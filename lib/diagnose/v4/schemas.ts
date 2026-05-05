/**
 * V4 工作流 — 各 step 的中间输出 zod 契约
 *
 * 设计原则：
 * 1. 只定义"step 之间传递的数据"
 * 2. 最终对外的 DiagnoseReport 在 lib/diagnose/types.ts 定义
 * 3. AI 输出 JSON 由这些 schema 严格校验，不通过的字段会被忽略或填默认值
 */

import { z } from 'zod';
import type {
  V4Dimension,
  CellStatus,
  Severity,
  FixType,
  ImpactSurface,
  ResumeSectionType,
  CredibilityConcern,
} from '../types';

// ════════════════════════════════════════════════════════════════
// 通用 zod 帮助
// ════════════════════════════════════════════════════════════════

const v4DimensionSchema = z.enum([
  'structure',
  'expression',
  'evidence',
  'role_fit',
  'credibility',
  'missing_info',
]) satisfies z.ZodType<V4Dimension>;

const cellStatusSchema = z.enum(['ok', 'warn', 'problem', 'missing']) satisfies z.ZodType<CellStatus>;

const severitySchema = z.enum(['must_fix', 'should_fix', 'optional', 'nitpicky']) satisfies z.ZodType<Severity>;

const fixTypeSchema = z.enum([
  'safe_expand',
  'needs_user_input',
  'forbidden_to_invent',
]) satisfies z.ZodType<FixType>;

const impactSurfaceSchema = z.enum([
  'ats',
  'hr_6s',
  'hr_30s',
  'interview',
  'combined',
]) satisfies z.ZodType<ImpactSurface>;

const sectionTypeSchema = z.enum([
  'personal_info',
  'education',
  'work_experience',
  'internship',
  'project',
  'skill',
  'self_evaluation',
  'certificate',
  'other',
]) satisfies z.ZodType<ResumeSectionType>;

const credibilityConcernSchema = z.enum([
  'numeric_doubt',
  'overclaim',
  'skill_stuffing',
  'timeline_conflict',
  'vague_role',
]) satisfies z.ZodType<CredibilityConcern>;

const sourceLocationSchema = z
  .object({
    paragraph_index: z.number().nullish(),
    sentence_index: z.number().nullish(),
    text_snippet: z.string().nullish(),
  })
  .nullish()
  .transform((v) => v ?? undefined);

const rewriteSchema = z
  .object({
    before: z.string(),
    after: z.string(),
    what_changed: z.string(),
  })
  .nullable()
  .optional();

// ════════════════════════════════════════════════════════════════
// Step 1: BaseAnalyzer — 6 维度初始评分 + 全局事实
// ════════════════════════════════════════════════════════════════

export const baseAnalyzerOutputSchema = z.object({
  /** 6 维度初始分（0-100，未加权） */
  dimension_scores: z.object({
    structure: z.number().min(0).max(100),
    expression: z.number().min(0).max(100),
    evidence: z.number().min(0).max(100),
    role_fit: z.number().min(0).max(100),
    credibility: z.number().min(0).max(100),
    missing_info: z.number().min(0).max(100),
  }),
  /** 简历整体水平 */
  overall_grade: z.enum(['excellent', 'strong', 'medium', 'weak']),
  /** 1 句话定性 */
  one_line_verdict: z.string(),
  /** 关键事实（用于下游 prompt 上下文） */
  key_facts: z.object({
    experience_level: z.enum(['senior', 'junior', 'neutral']),
    has_internship: z.boolean(),
    has_full_time: z.boolean(),
    project_count: z.number(),
    quantified_achievements_count: z.number(),
    estimated_total_months_of_experience: z.number(),
  }),
  /** 全局红旗（不绑定段落） */
  red_flags: z.array(z.string()),
});

export type BaseAnalyzerOutput = z.infer<typeof baseAnalyzerOutputSchema>;

// ════════════════════════════════════════════════════════════════
// Step 3a: HrSimulator — HR 6s + 30s 双视角扫描
// ════════════════════════════════════════════════════════════════

const hrFinding = z.object({
  /** 简短结论 */
  finding: z.string(),
  /** 命中的简历原句 */
  evidence_quote: z.string(),
  /** 哪个段落 */
  section: sectionTypeSchema,
  /** 严重度 */
  severity: severitySchema,
  /** 拒绝原因（HR 视角） */
  why_rejects: z.string(),
});

export const hrSimulatorOutputSchema = z.object({
  /** HR 6 秒扫描结论 */
  six_second: z.object({
    decision: z.enum(['continue_reading', 'skip_likely', 'skip']),
    impression: z.string(),                     // 一句话第一印象
    findings: z.array(hrFinding),                // 6 秒级问题（标题/公司/学历/排版）
  }),
  /** HR 30 秒细看结论 */
  thirty_second: z.object({
    decision: z.enum(['interview', 'hold', 'reject']),
    impression: z.string(),                     // 30 秒后的判断
    findings: z.array(hrFinding),                // 30 秒级问题（量化/JD匹配/可信度）
  }),
  /** 整体 HR 风险等级 */
  overall_hr_risk: z.enum(['low', 'medium', 'high']),
});

export type HrSimulatorOutput = z.infer<typeof hrSimulatorOutputSchema>;

// ════════════════════════════════════════════════════════════════
// Step 3b: ResumeMaster — 段落级改写 + 表达建议
// ════════════════════════════════════════════════════════════════

const sectionAdvice = z.object({
  section: sectionTypeSchema,
  /** 该段最关键的 1-3 个改写建议 */
  rewrite_examples: z.array(
    z.object({
      original: z.string(),
      rewritten: z.string(),
      what_changed: z.string().nullish().transform((v) => v ?? ''),
      enrichment_safety: fixTypeSchema.nullish().transform((v) => v ?? 'safe_expand' as const),
    })
  ).default([]),
  /** 该段表达层面的提醒（结构 / 语言） */
  expression_notes: z.array(
    z.object({
      title: z.string(),
      one_liner: z.string().nullish().transform((v) => v ?? ''),
      severity: severitySchema.nullish().transform((v) => v ?? 'should_fix' as const),
      evidence_quote: z.string().nullish(),
    })
  ).default([]),
});

export const resumeMasterOutputSchema = z.object({
  rewrite_strategy: z.string(),                  // 整体改写策略（一段）
  section_advice: z.array(sectionAdvice),         // 各段建议
  global_structure_issues: z.array(
    z.object({
      title: z.string(),
      one_liner: z.string(),
      severity: severitySchema,
      affected_sections: z.array(sectionTypeSchema),
    })
  ),
});

export type ResumeMasterOutput = z.infer<typeof resumeMasterOutputSchema>;

// ════════════════════════════════════════════════════════════════
// Step 3c: JdKeywordCoverage — JD 反向覆盖矩阵（仅 has_jd 时）
// ════════════════════════════════════════════════════════════════

export const jdKeywordCoverageOutputSchema = z.object({
  must_have: z.array(
    z.object({
      keyword: z.string(),
      covered: z.boolean(),
      section_hits: z.array(sectionTypeSchema),
    })
  ),
  nice_to_have: z.array(
    z.object({
      keyword: z.string(),
      covered: z.boolean(),
      section_hits: z.array(sectionTypeSchema),
    })
  ),
  /** 必备但未覆盖（即"差距清单"） */
  missing_critical: z.array(z.string()),
  /** 必备覆盖率 0-1 */
  coverage_rate: z.number().min(0).max(1),
  /** ATS 通过预估 */
  ats_pass_estimate: z.string(),
});

export type JdKeywordCoverageOutput = z.infer<typeof jdKeywordCoverageOutputSchema>;

// ════════════════════════════════════════════════════════════════
// Step 3d: CredibilityCheck — 简历真伪侦察
// ════════════════════════════════════════════════════════════════

export const credibilityCheckOutputSchema = z.object({
  flags: z.array(
    z.object({
      type: credibilityConcernSchema,
      description: z.string(),
      evidence_quote: z.string(),
      section: sectionTypeSchema,
      severity: z.enum(['high', 'medium', 'low']),
      question_for_candidate: z.string().optional(),
    })
  ),
  overall_credibility: z.enum(['trustworthy', 'mostly_credible', 'suspicious', 'high_risk']),
  /** 给操盘手的一句话总结 */
  summary_for_operator: z.string(),
});

export type CredibilityCheckOutput = z.infer<typeof credibilityCheckOutputSchema>;

// ════════════════════════════════════════════════════════════════
// Step 4: SelfCritiqueLoop — 应用 must_fix 后重审
// ════════════════════════════════════════════════════════════════

export const selfCritiqueOutputSchema = z.object({
  /** 模拟改写后的简历内容（不写完整简历，只写关键段落改写后效果） */
  imagined_after_resume_summary: z.string(),
  /** 假设改写都做完后，HR 重审结论 */
  after_metrics: z.object({
    overall_score: z.number().min(0).max(100),
    hr_6s_pass: z.string(),                       // 如 "可能跳过" / "可能停留" / "可能通过"
    ats_match: z.string(),                        // 如 "55%" / "78%"
    interview_risk: z.enum(['low', 'medium', 'high']),
    decision_estimate: z.enum(['interview', 'hold', 'reject']),
  }),
  /** 改前/改后变化总结 */
  improvement_summary: z.string(),
  /** 改写后仍存在的残留问题 */
  remaining_issues: z.array(z.string()),
});

export type SelfCritiqueOutput = z.infer<typeof selfCritiqueOutputSchema>;

// ════════════════════════════════════════════════════════════════
// Step 5: FinalSynthesis — 合成 V4Comment 列表 + 总评
// ════════════════════════════════════════════════════════════════

/**
 * AI 在 final_synthesis 阶段输出的单条 comment（不带 id，由代码补）
 *
 * 注意：这里和 V4Comment 几乎一致，仅去掉 id（id 由 mapper 生成）
 */
const synthesizedCommentSchema = z.object({
  section: sectionTypeSchema,
  section_label: z.string(),
  dimension: v4DimensionSchema,
  status: cellStatusSchema,
  severity: severitySchema,
  title: z.string(),
  one_liner: z.string(),
  why_it_hurts: z.string(),
  impact_on: z.array(impactSurfaceSchema).default([]),
  fix_type: fixTypeSchema,
  evidence_quote: z.string(),
  evidence_location: sourceLocationSchema,
  rewrite: rewriteSchema,
  insider_view: z.string().nullish().transform((v) => v ?? undefined),
  source: z.enum(['rule', 'hr', 'master', 'credibility', 'jd_coverage', 'self_critique', 'cross']).nullish().transform((v) => v ?? undefined),
  credibility_concern: credibilityConcernSchema.nullish().transform((v) => v ?? undefined),
});

export const finalSynthesisOutputSchema = z.object({
  /** AI 整合后的全量 comment 列表（不含规则探针出的 missing_info — 那个由代码合并） */
  comments: z.array(synthesizedCommentSchema),

  /** 顶部总评 */
  total_assessment: z.string(),

  /** 整体场景（normal / excellent / insufficient_input） */
  scenario: z.enum(['normal', 'excellent', 'insufficient_input']),

  /** 跨段风险结论 */
  risks: z.object({
    ats_risk: z.object({
      level: z.enum(['low', 'medium', 'high']),
      reasons: z.array(z.string()),
    }),
    hr_risk: z.object({
      level: z.enum(['low', 'medium', 'high']),
      reasons: z.array(z.string()),
    }),
    interview_risk: z.object({
      level: z.enum(['low', 'medium', 'high']),
      reasons: z.array(z.string()),
    }),
  }),
});

export type FinalSynthesisOutput = z.infer<typeof finalSynthesisOutputSchema>;
export type SynthesizedComment = z.infer<typeof synthesizedCommentSchema>;

// ════════════════════════════════════════════════════════════════
// Research Phase: R2 RoleStudy（岗位深度研究，按 target_role 缓存）
// ════════════════════════════════════════════════════════════════

const dataConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const roleStudyOutputSchema = z.object({
  /** 核心能力清单（该岗位 must-have，4-6 条） */
  core_capabilities: z.array(
    z.object({
      name: z.string(),                             // 如 "财务三大表分析"
      description: z.string(),                       // 一句话讲清这能力是什么
      why_it_matters: z.string(),                    // 为什么这岗位非要不可
    })
  ).min(2),
  /** 加分能力（2-4 条） */
  bonus_capabilities: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    })
  ).default([]),
  /** Top 简历常见结构 / 表达模式 */
  top_resume_patterns: z.array(z.string()).default([]),
  /** 该岗位常见 red flags */
  red_flags: z.array(
    z.object({
      flag: z.string(),
      why_critical: z.string(),
    })
  ).default([]),
  /** 行业 jargon（用来检测候选人是否真的"圈内人"） */
  industry_jargon: z.array(z.string()).default([]),
  /** 蒸馏元信息 */
  meta: z.object({
    sources_count: z.number().default(0),           // metaso 返回多少条材料
    data_confidence: dataConfidenceSchema.default('medium'),
    notes: z.string().nullish().transform((v) => v ?? ''),
    research_provider: z.string().optional(),       // 实际调研 provider（metaso / deepseek）
    fallback_used: z.boolean().optional(),           // 是否使用了 fallback
  }),
});

export type RoleStudyOutput = z.infer<typeof roleStudyOutputSchema>;

// ════════════════════════════════════════════════════════════════
// Research Phase: R3 HrInsider（HR 视角深度研究，按 target_role 缓存）
// ════════════════════════════════════════════════════════════════

export const hrInsiderOutputSchema = z.object({
  /** HR 6 秒重点看什么（岗位特化） */
  six_second_focus: z.array(z.string()).min(1),
  /** HR 30 秒细看什么 */
  thirty_second_focus: z.array(z.string()).min(1),
  /** HR 喜欢的简历语言 / 表达风格 */
  preferred_language_patterns: z.array(z.string()).default([]),
  /** 该岗位 HR 常见淘汰理由 */
  common_eliminate_reasons: z.array(
    z.object({
      reason: z.string(),
      frequency: z.enum(['very_common', 'common', 'occasional']).default('common'),
    })
  ).default([]),
  /** 不同梯队 HR 的期待基线（应届 / 1-3 年 / 3-5 年） */
  expectation_baseline: z.object({
    fresh_grad: z.string(),
    junior_1_3y: z.string(),
    mid_3_5y: z.string(),
  }),
  /** 蒸馏元信息 */
  meta: z.object({
    sources_count: z.number().default(0),
    data_confidence: dataConfidenceSchema.default('medium'),
    notes: z.string().nullish().transform((v) => v ?? ''),
    research_provider: z.string().optional(),       // 实际调研 provider（metaso / deepseek）
    fallback_used: z.boolean().optional(),           // 是否使用了 fallback
  }),
});

export type HrInsiderOutput = z.infer<typeof hrInsiderOutputSchema>;

// ════════════════════════════════════════════════════════════════
// Research Phase: R5 ResumeStudy（简历深度研究，吃 R2/R3 作参考系）
// ════════════════════════════════════════════════════════════════

export const resumeStudyOutputSchema = z.object({
  /** 候选人画像 */
  candidate_profile: z.object({
    seniority_tier: z.enum(['fresh_grad', 'junior_1_3y', 'mid_3_5y', 'senior_5y_plus']),
    real_skill_estimate: z.string(),                // "看起来是 fresh grad，但 SQL 能力像 1-2 年从业者"
    packaging_intent: z.string(),                    // "明显在包装为'数据分析师'方向"
  }),
  /** 简历内部信号（矛盾 / red flag / overclaim / gap / strength） */
  internal_signals: z.array(
    z.object({
      type: z.enum(['contradiction', 'red_flag', 'overclaim', 'gap', 'strength']),
      description: z.string(),
      evidence: z.string(),                          // 简历原句
    })
  ).default([]),
  /** 简历主线 */
  narrative: z.object({
    main_thread: z.string(),                         // "应届生 + 数学竞赛 + 量化项目"
    weakest_link: z.string(),                        // "无任何工业经验"
    strongest_link: z.string(),                      // "有真实交易系统作品"
  }),
  /** 与岗位匹配的初步判断（对照 R2 core_capabilities） */
  role_match_initial: z.object({
    fit_summary: z.string(),                         // 整体匹配判断
    obvious_gaps: z.array(z.string()).default([]),   // 对照核心能力的明显缺失
    surprising_strengths: z.array(z.string()).default([]), // 意外亮点
  }),
});

export type ResumeStudyOutput = z.infer<typeof resumeStudyOutputSchema>;

// ════════════════════════════════════════════════════════════════
// ResearchContext - 跨 step 传递的研究上下文集合
// ════════════════════════════════════════════════════════════════

/**
 * 研究阶段产出的上下文集合
 * - 注入给后续诊断 step 作为「行业参考系」
 * - role_study / hr_insider 可缓存（按 target_role）
 * - resume_study 每次重跑（依赖具体简历）
 */
export interface ResearchContext {
  role_study: RoleStudyOutput;
  hr_insider: HrInsiderOutput;
  resume_study: ResumeStudyOutput;
}
