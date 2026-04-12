// 双 AI 工作流中间结果 Schema
import { z } from 'zod';
import type { IssueDimension } from '../types';

// ─── Basic Summary Schema ────────────────────────────────────
export const basicSummarySchema = z.object({
  scenario: z.enum(['normal', 'excellent', 'insufficient_input']),
  main_judgment: z.string(),
  core_issues_count: z.number(),
  core_issues_titles: z.array(z.string()),
  quality_tier: z.enum(['excellent', 'strong', 'medium', 'weak']).optional(),
  excellent_score: z.number().optional(),
  resume_facts: z.object({
    work_experience_count: z.number(),
    project_count: z.number(),
    skills_preview: z.string(),
    total_length: z.number(),
  }),
  jd_facts: z.object({
    has_jd: z.boolean(),
    jd_quality: z.enum(['none', 'weak', 'strong']).optional(),
    keywords: z.array(z.string()).optional(),
  }),
});

export type BasicSummary = z.infer<typeof basicSummarySchema>;

// ─── Risk Evidence Binding Schema (Phase 4) ─────────────────────
export const riskEvidenceBindingSchema = z.object({
  risk: z.string(),
  evidence: z.string(),
  source_location: z.object({
    paragraph_index: z.number().optional(),
    sentence_index: z.number().optional(),
    text_snippet: z.string().optional(),
  }).optional(),
  who_rejects: z.enum(['ats', 'hr_6s', 'hr_30s', 'interviewer']).optional(),
  why_rejects: z.string().optional(),
});

export type RiskEvidenceBinding = z.infer<typeof riskEvidenceBindingSchema>;

// ─── Deep Diagnosis Schemas ──────────────────────────────────
export const deepProblemSchema = z.object({
  id: z.string(),
  title: z.string(),
  severity: z.enum(['must_fix', 'should_fix', 'optional', 'nitpicky']),
  probability: z.enum(['high', 'medium', 'low', 'very_low']),
  impact_surface: z.enum(['ats', 'hr_6s', 'hr_30s', 'interview', 'combined']),
  evidence: z.string(),
  why_it_hurts: z.string(),
  basic_already_mentioned: z.boolean(),
  incremental_value: z.string(),
  ats_risk: z.string().optional(),
  hr_risk: z.string().optional(),
  interview_risk: z.string().optional(),
  direct_fix: z.string().optional(),
  rewrite_template: z.string().optional(),
  rewrite_example: z.object({
    original: z.string(),
    rewritten: z.string(),
    change_summary: z.string(),
  }).optional(),
  required_user_inputs: z.array(z.string()).optional(),
  enrichment_safety: z.enum(['safe_expand', 'needs_user_input', 'forbidden_to_invent']),
  source: z.enum(['hr', 'master', 'both']),
  dimension: z.enum(['structure', 'role_fit', 'evidence', 'credibility', 'expression', 'missing_info', 'other']),
  jd_relevance: z.enum(['high', 'medium', 'low', 'none']),
  is_structural: z.boolean(),
  follow_up_question: z.string().optional(),
  source_location: z.object({
    paragraph_index: z.number().optional(),
    sentence_index: z.number().optional(),
    text_snippet: z.string().optional(),
  }).optional(),
});

const atsAnalysisSchema = z.object({
  risk_level: z.enum(['low', 'medium', 'high']),
  keyword_gaps: z.array(z.string()),
  format_risks: z.array(z.string()),
  match_rate_estimate: z.string(),
  /** Phase 4 新增：每个关键词差距的证据绑定（必须回答"哪句原文导致了哪个淘汰风险"） */
  keyword_gap_evidence: z.array(riskEvidenceBindingSchema).optional(),
  /** Phase 4 新增：每个格式风险的证据绑定 */
  format_risk_evidence: z.array(riskEvidenceBindingSchema).optional(),
});

const hrAnalysisSchema = z.object({
  risk_level: z.enum(['low', 'medium', 'high']),
  six_second_risks: z.array(z.string()),
  thirty_second_risks: z.array(z.string()),
  decision_estimate: z.enum(['pass', 'interview', 'hold']),
  /** Phase 4 新增：每个6秒风险的证据绑定（必须回答"谁会拒你、为什么、基于哪句原文"） */
  six_second_risk_evidence: z.array(riskEvidenceBindingSchema).optional(),
  /** Phase 4 新增：每个30秒风险的证据绑定 */
  thirty_second_risk_evidence: z.array(riskEvidenceBindingSchema).optional(),
});

const interviewRiskAnalysisSchema = z.object({
  likely_questions: z.array(z.string()),
  weak_points: z.array(z.string()),
  preparation_suggestions: z.array(z.string()),
  /** Phase 4 新增：每个弱点的证据绑定（必须回答"哪句原文暴露了哪个弱点"） */
  weak_point_evidence: z.array(riskEvidenceBindingSchema).optional(),
});

export const deepReportSchema = z.object({
  deep_value_summary: z.string(),
  current_vs_after_metrics: z.object({
    ats_match_rate: z.object({ before: z.string(), after: z.string() }),
    hr_6s_pass_rate: z.object({ before: z.string(), after: z.string() }),
    interview_risk: z.object({ before: z.string(), after: z.string() }),
  }),
  problem_pool: z.object({
    must_fix: z.array(deepProblemSchema),
    should_fix: z.array(deepProblemSchema),
    optional_optimize: z.array(deepProblemSchema),
    nitpicky: z.array(deepProblemSchema),
  }),
  ats_analysis: atsAnalysisSchema,
  hr_analysis: hrAnalysisSchema,
  interview_risk_analysis: interviewRiskAnalysisSchema,
  content_expansion_plan: z.object({
    safe_expand: z.array(z.object({ location: z.string(), suggestion: z.string() })),
    needs_user_input: z.array(z.object({ location: z.string(), question: z.string() })),
    forbidden_to_invent: z.array(z.string()),
  }),
  rewrite_pack: z.array(z.object({
    original: z.string(),
    rewritten: z.string(),
    change_summary: z.string(),
  })),
  impact_projection: z.object({
    score_improvement_estimate: z.string(),
    ats_pass_probability: z.string(),
    hr_pass_probability: z.string(),
    interview_probability: z.string(),
  }),
  action_plan: z.object({
    immediate_actions: z.array(z.string()),
    requires_user_input: z.array(z.string()),
    optional_improvements: z.array(z.string()),
  }),
});

export type DeepProblem = z.infer<typeof deepProblemSchema>;
export type DeepReport = z.infer<typeof deepReportSchema>;

// ─── Base Schemas ────────────────────────────────────────────

// BaseAnalyzer 输出
export const baseAnalyzerResultSchema = z.object({
  overall_score: z.number().min(0).max(100),
  dimension_scores: z.record(z.string(), z.number()),
  red_flags: z.array(z.string()),
  base_summary: z.string(),
  quick_rewrite_hints: z.array(z.string()).optional(),
});

export type BaseAnalyzerResult = z.infer<typeof baseAnalyzerResultSchema>;

// HR Simulator 输出
export const hrSimulatorResultSchema = z.object({
  hr_decision: z.enum(['pass', 'interview', 'hold']),
  hr_reasoning: z.string(),
  jd_match_risks: z.array(z.string()),
  screening_red_flags: z.array(z.string()),
  likely_interview_questions: z.array(z.string()),
});

export type HrSimulatorResult = z.infer<typeof hrSimulatorResultSchema>;

// Resume Master 输出
export const resumeMasterResultSchema = z.object({
  rewrite_strategy: z.string(),
  summary_rewrite: z.string().optional(),
  experience_rewrites: z.array(z.object({
    original: z.string(),
    rewritten: z.string(),
    change_summary: z.string(),
  })),
  skills_rewrite: z.string().optional(),
  ats_keywords: z.array(z.string()),
  content_to_remove: z.array(z.string()).optional(),
  content_to_add: z.array(z.string()).optional(),
  content_to_frontload: z.array(z.string()).optional(),
});

export type ResumeMasterResult = z.infer<typeof resumeMasterResultSchema>;

// Cross Critique 输出
export const crossCritiqueResultSchema = z.object({
  ai1_on_ai2: z.string(),
  ai2_on_ai1: z.string(),
  conflicts: z.array(z.string()),
  consensus_points: z.array(z.string()).optional(),
});

export type CrossCritiqueResult = z.infer<typeof crossCritiqueResultSchema>;

// Scenario Simulation 输出
export interface ScenarioSimulationResult {
  hr_6s_impression: string;
  interview_pass_rate_estimate: string;
  ats_keyword_match_rate: string;
  manual_review_risk: string;
  top5_gap_estimate: string;
  before_after_comparison: string;
}

// Final Dual Diagnose Result
export interface FinalDualDiagnoseResult {
  executive_summary: string;
  overall_score: number;
  key_conclusions: string[];
  core_issues: Array<{
    title: string;
    summary: string;
    evidence: string;
    suggestion: string;
    source: 'hr' | 'master' | 'both';
    // 深度诊断扩展字段
    dimension?: 'structure' | 'role_fit' | 'evidence' | 'credibility' | 'expression' | 'missing_info' | 'other';
    jd_relevance?: 'high' | 'medium' | 'low' | 'none';
    is_structural?: boolean;
    screening_impact?: string;
    ats_risk?: string;
    hr_risk?: string;
    enrichment_safety?: 'safe_expand' | 'needs_user_input' | 'forbidden_to_invent';
    rewrite_example?: string;
    incremental_value?: string;
  }>;
  rewrite_examples: Array<{
    original: string;
    rewritten: string;
    change_summary: string;
    enrichment_safety?: 'safe_expand' | 'needs_user_input' | 'forbidden_to_invent';
    ats_impact?: string;
    hr_impact?: string;
  }>;
  scenario_simulation_summary: string;
  next_actions: string[];
  metadata: {
    base_score: number;
    hr_decision: string;
    dual_ai_version: string;
  };
  // 深度诊断元数据
  deep_value_summary?: string;
  ats_risk_level?: 'low' | 'medium' | 'high';
  hr_risk_level?: 'low' | 'medium' | 'high';
  enrichment_safety_flags?: string[];
  // 深度诊断：基础诊断摘要（仅 deep 模式）
  basic_summary?: BasicSummary;
  // 深度诊断报告（仅 deep 模式）
  deep_report?: DeepReport;
}
