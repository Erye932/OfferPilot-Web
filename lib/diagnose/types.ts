// OfferPilot 统一类型定义
// 所有后端模块和前端消费方必须使用这些类型

import { z } from 'zod';

// ─── Audit Layer Types ─────────────────────────────────────────

/** 审计状态 */
export type AuditStatus = 'ok' | 'issue' | 'missing_info';

/** 证据强度 */
export type EvidenceStrength = 'strong' | 'medium' | 'weak';

/** 修复类型 */
export type FixType = 'safe_expand' | 'needs_user_input' | 'forbidden_to_invent';

/** 严重程度 */
export type Severity = 'must_fix' | 'should_fix' | 'optional' | 'nitpicky';

/**
 * AuditRow — 全量审计底稿中的一行
 * 每个检查点（section × dimension）生成一行结构化审计记录
 */
export interface AuditRow {
  section: string;
  dimension: string;
  status: AuditStatus;
  title: string;
  evidence: string[];
  source_location?: SourceLocation;
  evidence_strength: EvidenceStrength;
  why_it_hurts?: string;
  fix_type?: FixType;
  required_user_inputs?: string[];
  severity?: Severity;
  probability?: 'high' | 'medium' | 'low' | 'very_low';
  impact_surface?: ImpactSurface;
}

/**
 * AuditBundle — 全量审计底稿的集合
 * 包含按 section 和 dimension 分组的结果，以及缺失信息摘要
 */
export interface AuditBundle {
  rows: AuditRow[];
  grouped_by_section: Record<string, AuditRow[]>;
  grouped_by_dimension: Record<string, AuditRow[]>;
  missing_info_summary: string[];
}

// ─── Issue Taxonomy ──────────────────────────────────────────
export const ISSUE_TYPES = [
  'readability',
  'logic_clarity',
  'result_orientation',
  'differentiated_expression',
  'ats_format',
  'structure',
  'redundancy',
  'missing_key_section',
  'role_alignment',
  'jd_keyword_gap',
  'competency_gap',
  'positioning_blur',
  'weak_evidence',
  'generic_claim',
  'missing_context',
  'credibility_risk',
  'ai_tone_risk',
  'input_quality_risk',
  // Legacy V1 types (still valid)
  'lack_of_result_evidence',
  'keyword_alignment_weak',
  'weak_role_boundary',
  'jd_direction_mismatch',
  'overclaim_risk',
] as const;

export type IssueType = typeof ISSUE_TYPES[number];

// ─── Scenario ────────────────────────────────────────────────
export type DiagnoseScenario = 'normal' | 'excellent' | 'insufficient_input';

// ─── JD Quality ──────────────────────────────────────────────
export type JdQuality = 'none' | 'weak' | 'strong';

// ─── Rewrite Example (structured before/after pair) ─────────
export interface RewriteExample {
  original: string;
  rewritten: string;
  change_summary: string;
}

// ─── Follow-up Question (for progressive deepening) ─────────
export interface FollowUpPrompt {
  question: string;
  why: string;
}

// ─── Issue Dimension (for diversity enforcement) ────────────
export type IssueDimension =
  | 'structure'        // 结构/排版
  | 'role_fit'         // 岗位贴合
  | 'evidence'         // 结果证据
  | 'credibility'      // 语言可信度
  | 'expression'       // 表达方式
  | 'missing_info'     // 关键信息缺失
  | 'other';

// ─── Source Location (for return-to-position in input page) ──
export interface SourceLocation {
  paragraph_index?: number;    // 段落索引（从 0 开始）
  sentence_index?: number;     // 句子索引（从 0 开始）
  text_snippet?: string;       // 用于定位的原文片段（前 80 字）
}

// ─── Core Issue ──────────────────────────────────────────────
export interface CoreIssue {
  title: string;
  summary: string;
  evidence: string;
  insider_view: string;
  suggestion: string;
  follow_up_question: string;
  priority: number;
  // V3 extended fields — AI may or may not return these
  screening_impact?: string;
  is_structural?: boolean;
  jd_relevance?: 'high' | 'medium' | 'low' | 'none';
  rewrite_examples?: RewriteExample[];
  // V4: dimension tag for diversity enforcement
  dimension?: IssueDimension;
  // V5: source location for return-to-position
  source_location?: SourceLocation;
}

// ─── Minor Suggestion ────────────────────────────────────────
export interface MinorSuggestion {
  title: string;
  description: string;
  category?: string;
  priority?: number;
}

// ─── Priority Action ────────────────────────────────────────
export interface PriorityAction {
  title: string;
  description: string;
}

// ─── Report Metadata ────────────────────────────────────────
export interface ReportMetadata {
  target_role: string;
  has_jd: boolean;
  generated_at: string;
  tier: 'free' | 'paid';
  jd_quality?: JdQuality;
  schema_version?: string;
  // 深度诊断扩展字段
  diagnose_mode?: 'basic' | 'deep';
  deep_diagnosis?: boolean;
  based_on_basic_report?: boolean;
  deep_value_summary?: string;
  ats_risk_level?: 'low' | 'medium' | 'high';
  hr_risk_level?: 'low' | 'medium' | 'high';
  enrichment_safety_flags?: string[];
  // 深度 fallback 状态（Phase 4 使用）
  deep_fallback_reason?: string;
  deep_fallback_message?: string;
  // 深度研究阶段 provider 追踪（Phase 5 使用）
  research_provider_requested?: string;
  research_provider_actual?: string;
  research_fallback_used?: boolean;
  research_fallback_reason?: string;
  research_fallback_from?: string;
  research_fallback_to?: string;
  research_memo_available?: boolean;
  deep_diagnosis_executed?: boolean;
}

// ─── Request ─────────────────────────────────────────────────
export interface DiagnoseRequest {
  resume_text: string;
  resume_paragraphs?: string[];
  target_role: string;
  jd_text?: string;
  tier: 'free' | 'paid';
  source_type?: 'paste' | 'pdf';
  uploaded_file_id?: string;
  diagnose_mode?: 'basic' | 'deep';
}

// Zod schema for request validation
export const diagnoseRequestSchema = z.object({
  resume_text: z.string().min(1, '简历文本不能为空'),
  resume_paragraphs: z.array(z.string()).optional(),
  target_role: z.string().min(1, '目标岗位不能为空'),
  jd_text: z.string().optional().default(''),
  tier: z.enum(['free', 'paid']).default('free'),
  source_type: z.enum(['paste', 'pdf']).optional().default('paste'),
  uploaded_file_id: z.string().optional(),
  diagnose_mode: z.enum(['basic', 'deep']).optional().default('basic'), // V4 不再使用，但保留以向后兼容
  force_refresh: z.boolean().optional().default(false), // V4：绕过 24h 缓存
});

// ─── Response (Unified Report Schema V3) ────────────────────
export interface FreeDiagnoseResponse {
  // 场景分类 - 必填，后端正式裁决
  scenario: DiagnoseScenario;
  // 主问题 - normal场景下必须是最致命具体问题
  main_judgment: string;
  // 动态核心问题 0~10
  core_issues: CoreIssue[];
  // 核心问题摘要
  core_issues_summary: {
    total_count: number;
    shown_count: number;
  };
  // 优先动作 1~3
  priority_actions: PriorityAction[];
  // 改写方向
  rewrite_direction: string;
  // 独立建议层
  minor_suggestions: MinorSuggestion[];
  // 结构化改写示例（V3: 多对，每对有原句+改后句+变化说明）
  rewrite_examples?: RewriteExample[];
  // 旧字段保留兼容
  before_text?: string;
  after_text?: string;
  // 渐进式追问位
  follow_up_prompts?: FollowUpPrompt[];
  // V5: 优秀简历评分 (0~100)
  excellent_score?: number;
  // V5: 简历质量等级
  quality_tier?: 'excellent' | 'strong' | 'medium' | 'weak';
  // 深度诊断：基础诊断摘要（仅 deep 模式）
  basic_summary?: BasicSummary;
  // 深度诊断报告（仅 deep 模式）
  deep_report?: DeepReport;
  // 元数据
  metadata: ReportMetadata;
  // 审计底稿（Phase 1 新增）
  audit_rows?: AuditRow[];
  // Phase 5 新增：审计底稿分组（输出双层化）
  grouped_issues_by_section?: Record<string, CoreIssue[]>;
  grouped_issues_by_dimension?: Record<string, CoreIssue[]>;
  missing_info_summary?: string[];
}
export interface RoleResolution {
  /** 原始岗位输入 */
  raw_role: string;
  /** 标准化岗位名称 */
  canonical_role: string;
  /** 岗位族系，如 "前端开发", "后端开发", "全栈开发" */
  role_family: string;
  /** 相关岗位别名/变体 */
  alt_roles: string[];
  /** 从简历/JD推断的技能关键词 */
  skills_inferred: string[];
  /** 解析置信度 0-1 */
  confidence: number;
  /** 模糊度说明，如 "输入包含多个可能岗位" */
  ambiguity?: string;
}

// ─── Workflow Internal Types ─────────────────────────────────
export interface NormalizedInput {
  resume_text: string;
  target_role: string;
  jd_text: string;
  tier: 'free' | 'paid';
  resume_sentences: string[];
  resume_paragraphs: string[];
  /** 结构化段落：带段落类型标签 */
  resume_sections: ResumeSection[];
  jd_keywords: string[];
  jd_quality: JdQuality;
  text_quality: 'sufficient' | 'insufficient';
  /** 经验级别：用于调整模拟/校园项目权重 */
  experience_level: 'senior' | 'junior' | 'neutral';
  /** 岗位语义解析结果 */
  role_resolution?: RoleResolution;
}

/** 简历段落类型 */
export type ResumeSectionType =
  | 'personal_info'
  | 'education'
  | 'work_experience'
  | 'project'
  | 'internship'
  | 'skill'
  | 'self_evaluation'
  | 'certificate'
  | 'other';

export interface ResumeSection {
  type: ResumeSectionType;
  title: string;           // 段落标题（如果识别到）
  content: string;         // 段落原始内容
  paragraph_index: number; // 对应 resume_paragraphs 中的索引
}

export interface RuleMatch {
  issue_type: string;
  issue_name: string;
  confidence: number;
  matched_signals: string[];
  evidence_snippets: string[];
}

export interface RuleMatchResult {
  matches: RuleMatch[];
  total_matched: number;
}

export interface IssueEnrichment {
  issue_type: string;
  issue_name: string;
  definition?: string;
  insider_view?: string;
  rewrite_logic?: string;
  before_text?: string;
  after_text?: string;
}

export interface IssueEnrichmentResult {
  enrichments: IssueEnrichment[];
}

// ─── Corpus Types ────────────────────────────────────────────
export interface DiagnosisRule {
  rule_id: string;
  issue_type: string;
  issue_name: string;
  definition: string;
  trigger_signals: string[];
  typical_bad_patterns: string[];
  priority_level: 'high' | 'medium' | 'low';
  applicable_roles: string[];
  source_level: string;
  notes: string;
}

export interface InsiderView {
  view_id: string;
  issue_type: string;
  role_context: string;
  view_text: string;
  tone: string;
  applicable_roles: string[];
  source_level: string;
  notes: string;
}

export interface RewritePattern {
  pattern_id: string;
  issue_type: string;
  role_type: string;
  before_text: string;
  after_text: string;
  rewrite_logic: string;
  key_transformation: string[];
  source_level: string;
  difficulty_level: string;
}

// ─── PDF Parse Result ────────────────────────────────────────
export interface PdfParseResult {
  text: string;
  paragraphs: string[];
  fileName: string;
  pageCount: number;
  textLength: number;
  mimeType: string;
  parseStatus: 'success' | 'no_text' | 'failed';
  extraction_quality: 'high' | 'medium' | 'low';
}

// ─── Loading Stage ───────────────────────────────────────────
export type LoadingStage =
  | 'reading_resume'
  | 'parsing_resume'
  | 'validating_input'
  | 'matching_rules'
  | 'retrieving_corpus'
  | 'generating_report'
  | 'formatting_result'
  | 'complete'
  | 'error';

export interface LoadingStatus {
  stage: LoadingStage;
  progress: number; // 0-100
  message: string;
}

// ─── AI Float Panel (灵动岛轻量助手) ────────────────────────
// 灵动岛助手：只解释诊断、回答"为什么要这样改"、承认错误
export interface AIExplainRequest {
  issue_index: number;
  issue_title: string;
  issue_summary: string;
  issue_suggestion: string;
  resume_excerpt: string;
  user_question?: string;
  // 新增字段：用于增强解释的上下文
  screening_impact?: string;
  dimension?: IssueDimension;
  jd_relevance?: 'high' | 'medium' | 'low' | 'none';
  is_structural?: boolean;
}

export interface AIExplainResponse {
  explanation: string;
  corpus_evidence?: string;     // 来自改良语料库的佐证
  confidence: 'high' | 'medium' | 'low';  // 诊断置信度（基于证据强度）
  might_be_wrong?: string;      // 如果诊断可能有误，承认并给替代建议（仅在证据明显薄弱时提供）
  follow_up_suggestion?: string;
  evidence_strength?: 'strong' | 'moderate' | 'weak'; // 证据强度评估（可选）
}

export interface AIAssistantState {
  visible: boolean;
  expanded: boolean;
  loading: boolean;
  activeIssueIndex: number | null;
  request: AIExplainRequest | null;
  response: AIExplainResponse | null;
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
}

// ─── Basic Summary (for deep mode comparison) ───────────────
export interface BasicSummary {
  scenario: DiagnoseScenario;
  main_judgment: string;
  core_issues_count: number;
  core_issues_titles: string[];
  quality_tier?: 'excellent' | 'strong' | 'medium' | 'weak';
  excellent_score?: number;
  resume_facts: {
    work_experience_count: number;
    project_count: number;
    skills_preview: string;
    total_length: number;
  };
  jd_facts: {
    has_jd: boolean;
    jd_quality?: JdQuality;
    keywords?: string[];
  };
}

// ─── Deep Diagnosis Types ────────────────────────────────────
export type DeepProblemSeverity = 'must_fix' | 'should_fix' | 'optional' | 'nitpicky';
export type ImpactSurface = 'ats' | 'hr_6s' | 'hr_30s' | 'interview' | 'combined';
export type EnrichmentSafety = 'safe_expand' | 'needs_user_input' | 'forbidden_to_invent';

export interface DeepProblem {
  id: string;
  title: string;
  severity: DeepProblemSeverity;
  probability: 'high' | 'medium' | 'low' | 'very_low';
  impact_surface: ImpactSurface;
  evidence: string;
  why_it_hurts: string;
  basic_already_mentioned: boolean;
  incremental_value: string;
  ats_risk?: string;
  hr_risk?: string;
  interview_risk?: string;
  direct_fix?: string;
  rewrite_template?: string;
  rewrite_example?: RewriteExample;
  required_user_inputs?: string[];
  enrichment_safety: EnrichmentSafety;
  source: 'hr' | 'master' | 'both';
  dimension: IssueDimension;
  jd_relevance: 'high' | 'medium' | 'low' | 'none';
  is_structural: boolean;
  follow_up_question?: string;
  source_location?: SourceLocation;
}

/**
 * 风险证据绑定（Phase 4 红队视角核心）
 * 每个高风险项必须能回答：谁会拒你、为什么、基于哪句原文
 */
export interface RiskEvidenceBinding {
  /** 风险描述 */
  risk: string;
  /** 来源原文 */
  evidence: string;
  /** 证据位置 */
  source_location?: SourceLocation;
  /** 谁会因此拒绝这份简历 */
  who_rejects?: 'ats' | 'hr_6s' | 'hr_30s' | 'interviewer';
  /** 拒绝原因（简短） */
  why_rejects?: string;
}

export interface DeepReport {
  deep_value_summary: string;
  current_vs_after_metrics: {
    ats_match_rate: { before: string; after: string };
    hr_6s_pass_rate: { before: string; after: string };
    interview_risk: { before: string; after: string };
  };
  problem_pool: {
    must_fix: DeepProblem[];
    should_fix: DeepProblem[];
    optional_optimize: DeepProblem[];
    nitpicky: DeepProblem[];
  };
  ats_analysis: {
    risk_level: 'low' | 'medium' | 'high';
    keyword_gaps: string[];
    format_risks: string[];
    match_rate_estimate: string;
    /** Phase 4 新增：每个风险项的证据绑定 */
    keyword_gap_evidence?: RiskEvidenceBinding[];
    format_risk_evidence?: RiskEvidenceBinding[];
  };
  hr_analysis: {
    risk_level: 'low' | 'medium' | 'high';
    six_second_risks: string[];
    thirty_second_risks: string[];
    decision_estimate: 'pass' | 'interview' | 'hold';
    /** Phase 4 新增：每个风险项的证据绑定 */
    six_second_risk_evidence?: RiskEvidenceBinding[];
    thirty_second_risk_evidence?: RiskEvidenceBinding[];
  };
  interview_risk_analysis: {
    likely_questions: string[];
    weak_points: string[];
    preparation_suggestions: string[];
    /** Phase 4 新增：每个弱点的证据绑定 */
    weak_point_evidence?: RiskEvidenceBinding[];
  };
  content_expansion_plan: {
    safe_expand: Array<{ location: string; suggestion: string }>;
    needs_user_input: Array<{ location: string; question: string }>;
    forbidden_to_invent: string[];
  };
  rewrite_pack: RewriteExample[];
  impact_projection: {
    score_improvement_estimate: string;
    ats_pass_probability: string;
    hr_pass_probability: string;
    interview_probability: string;
  };
  action_plan: {
    immediate_actions: string[];
    requires_user_input: string[];
    optional_improvements: string[];
  };
}

// ════════════════════════════════════════════════════════════════
// ─── V4 Schema: 段落 × 维度 矩阵报告（操盘工作台版） ────────────
// ════════════════════════════════════════════════════════════════
//
// 设计原则：
// 1. 报告给"操盘手 + AI 半人马"看，专业尖锐、信息密度高、可复制
// 2. 段落 × 维度矩阵作为骨架（顶部热图）
// 3. 复用现有：Severity / FixType / ImpactSurface / RewriteExample /
//              SourceLocation / ResumeSectionType / DiagnoseScenario
// 4. 删除 free/paid tier 概念 — 所有用户拿同一份详尽报告

/**
 * V4 诊断维度（6 个固定维度）
 * 与旧 IssueDimension 不同：去掉 'other'，更聚焦
 */
export type V4Dimension =
  | 'structure'        // 结构 / 排版 / 可读性 / 信息层级
  | 'expression'       // 语言表达 / 动词使用 / 句式
  | 'evidence'         // 量化证据 / 数字 / 具体性
  | 'role_fit'         // 岗位贴合 / JD 关键词 / 技能匹配
  | 'credibility'      // 可信度 / 一致性 / 不夸大
  | 'missing_info';    // 关键信息缺失 / 应说未说

export const V4_DIMENSIONS: V4Dimension[] = [
  'structure',
  'expression',
  'evidence',
  'role_fit',
  'credibility',
  'missing_info',
];

/** V4 维度的中文标签 */
export const V4_DIMENSION_LABELS: Record<V4Dimension, string> = {
  structure: '结构',
  expression: '表达',
  evidence: '证据',
  role_fit: '岗位贴合',
  credibility: '可信度',
  missing_info: '信息缺失',
};

/** 单元格 / 评论状态 */
export type CellStatus = 'ok' | 'warn' | 'problem' | 'missing';

/** 状态对应的中文 + emoji（前端展示用） */
export const CELL_STATUS_META: Record<CellStatus, { label: string; emoji: string; color: string }> = {
  ok:      { label: '良好',     emoji: '🟢', color: 'green' },
  warn:    { label: '提醒',     emoji: '🟡', color: 'yellow' },
  problem: { label: '问题',     emoji: '🔴', color: 'red' },
  missing: { label: '缺失信息', emoji: '⚫', color: 'gray' },
};

/**
 * V4 改写示范（V4Comment.rewrite 字段）
 *
 * 与旧 RewriteExample (original/rewritten/change_summary) 不同，使用更直观的命名。
 */
export interface V4Rewrite {
  before: string;          // 改前原句
  after: string;           // 改后建议
  what_changed: string;    // 简短说明改了什么（如"加入量化"、"动词换主动式"）
}

/**
 * V4 评论来源（便于调试 / 追溯产生路径）
 */
export type V4CommentSource =
  | 'rule'           // MissingInfoProbe 规则探针
  | 'hr'             // HrSimulator
  | 'master'         // ResumeMaster
  | 'credibility'    // CredibilityCheck
  | 'jd_coverage'    // JdKeywordCoverage
  | 'self_critique'  // SelfCritiqueLoop
  | 'cross';         // CrossCritique

/**
 * 可信度问题分类（CredibilityCheck 输出）
 */
export type CredibilityConcern =
  | 'numeric_doubt'      // 数字主张不可信（如应届生过高指标）
  | 'overclaim'          // 过度声称（主导/独立完成 + 资历不符）
  | 'skill_stuffing'     // 技能堆砌但项目无对应证据
  | 'timeline_conflict'  // 时间线冲突（如同期多段全职）
  | 'vague_role';        // 角色模糊（"参与"、"协助"等不可证伪表述）

/**
 * Comment — V4 评论的最小完整单元
 *
 * 比旧 CoreIssue / DeepProblem 更紧凑，字段直接对齐前端 CommentCard
 */
export interface V4Comment {
  id: string;                          // 唯一 ID（用于跳转/折叠）
  section: ResumeSectionType;          // 段落类型
  section_label: string;               // 段落显示名（如「实习经历 - 字节跳动」）
  dimension: V4Dimension;              // 维度
  status: CellStatus;                  // 状态评级（决定颜色）
  severity: Severity;                  // must_fix / should_fix / optional / nitpicky

  title: string;                       // 简短标题
  one_liner: string;                   // 一句话定性
  why_it_hurts: string;                // 1-3 句讲清问题机制

  impact_on: ImpactSurface[];          // 影响哪些环节（4 档可多选）
  fix_type: FixType;                   // 自己改 / 需补料 / 不可编造

  evidence_quote: string;              // 简历原句精确摘录
  evidence_location?: SourceLocation;  // 段落 / 句子定位

  /** 改写示范（V4 字段命名，与旧 RewriteExample 不同） */
  rewrite?: V4Rewrite | null;
  insider_view?: string;               // 行业人视角

  source?: V4CommentSource;            // 评论来源（调试用）
  credibility_concern?: CredibilityConcern; // 来自 CredibilityCheck 时填
}

/**
 * MatrixCell — 矩阵格（段落 × 维度）
 */
export interface V4MatrixCell {
  section: ResumeSectionType;
  section_label: string;
  dimension: V4Dimension;
  status: CellStatus;
  comment_count: number;
  worst_severity: Severity | null;
  summary: string;                     // 这一格的一句话总结（点击展开前先看到）
}

/**
 * SectionGrade — 段落综合评级（热图横向汇总列）
 */
export interface V4SectionGrade {
  section: ResumeSectionType;
  section_label: string;
  status: CellStatus;                  // 该段最差状态
  comment_count: number;
  worst_severity: Severity | null;
}

/**
 * JdKeywordCoverage — JD 关键词反向覆盖矩阵
 * 仅在 has_jd 时产生
 */
export interface V4JdKeywordCoverage {
  must_have: Array<{
    keyword: string;
    covered: boolean;
    section_hits: ResumeSectionType[];   // 哪些段命中
  }>;
  nice_to_have: Array<{
    keyword: string;
    covered: boolean;
    section_hits: ResumeSectionType[];
  }>;
  missing_critical: string[];          // must_have 中未覆盖的关键词
  coverage_rate: number;               // 0-1（must_have 覆盖率）
}

/**
 * CredibilityFlag — 可信度警示标记
 */
export interface V4CredibilityFlag {
  type: CredibilityConcern;
  description: string;                 // 警示描述
  evidence: string;                    // 简历原文
  severity: 'high' | 'medium' | 'low';
  source_location?: SourceLocation;
  question_for_candidate?: string;     // 操盘手该问候选人什么
}

/**
 * BeforeAfterMetrics — 改前/改后量化对比
 * 通过 SelfCritiqueLoop 真实测量得到
 */
export interface V4BeforeAfterMetrics {
  overall_score: { before: number; after: number };
  hr_6s_pass: { before: string; after: string };       // 如 "可能跳过" → "可能通过"
  ats_match: { before: string; after: string };        // 如 "55%" → "78%"
  interview_risk: { before: 'low' | 'medium' | 'high'; after: 'low' | 'medium' | 'high' };
  improvement_summary: string;                          // 一句话总结改后差异
}

/**
 * ScoreBreakdown — 总分细分（6 维度加权）
 *
 * 默认权重设计依据：
 * - evidence (0.30)：量化证据是简历核心
 * - role_fit (0.20)：岗位匹配决定是否进面
 * - structure / expression (各 0.15)：基础门面
 * - credibility (0.10) / missing_info (0.10)：辅助维度
 */
export interface V4ScoreBreakdown {
  structure:    { score: number; weight: number };
  expression:   { score: number; weight: number };
  evidence:     { score: number; weight: number };
  role_fit:     { score: number; weight: number };
  credibility:  { score: number; weight: number };
  missing_info: { score: number; weight: number };
  overall: number;                     // 加权总分（0-100）
}

/** V4 默认权重 */
export const V4_DEFAULT_WEIGHTS: Record<V4Dimension, number> = {
  structure:    0.15,
  expression:   0.15,
  evidence:     0.30,
  role_fit:     0.20,
  credibility:  0.10,
  missing_info: 0.10,
};

/**
 * CrossSectionSummary — 末尾跨段落汇总
 */
export interface V4CrossSectionSummary {
  must_fix_top: V4Comment[];                  // 跨段必改清单（按优先级 top N）
  rewrite_examples: V4Comment[];              // 改写示例库（仅含带 rewrite 的 comments）
  jd_keyword_matrix?: V4JdKeywordCoverage;    // 仅 has_jd 时
  credibility_flags: V4CredibilityFlag[];     // 可信度警示
  risks: {
    ats_risk:       { level: 'low' | 'medium' | 'high'; reasons: string[] };
    hr_risk:        { level: 'low' | 'medium' | 'high'; reasons: string[] };
    interview_risk: { level: 'low' | 'medium' | 'high'; reasons: string[] };
  };
}

/**
 * DiagnoseReport — V4 主报告
 *
 * 与旧 FreeDiagnoseResponse 完全独立
 * 在 Phase 8 路由中通过 schema_version 字段区分
 */
export interface DiagnoseReport {
  // ── 头部 ──
  scenario: DiagnoseScenario;          // normal / excellent / insufficient_input
  overall_score: number;               // 0-100
  overall_grade: 'excellent' | 'strong' | 'medium' | 'weak';
  total_assessment: string;            // 给操盘手的总评（专业尖锐，3-6 句）
  score_breakdown: V4ScoreBreakdown;   // 6 维度加权细分

  // ── 矩阵骨架（顶部热图） ──
  matrix: {
    sections: V4SectionGrade[];        // 横轴（段落 + 段落汇总）
    dimensions: V4Dimension[];         // 纵轴（固定 6 个）
    cells: V4MatrixCell[];             // sections × dimensions 全量格子
  };

  // ── 中部分章（按维度组织所有 comments） ──
  comments_by_dimension: Record<V4Dimension, V4Comment[]>;

  // ── 末尾汇总 ──
  cross_section_summary: V4CrossSectionSummary;

  // ── 改前/改后对比（来自 SelfCritiqueLoop） ──
  before_after: V4BeforeAfterMetrics;

  // ── 元数据 ──
  metadata: {
    target_role: string;
    has_jd: boolean;
    generated_at: string;              // ISO 8601
    schema_version: '4.0';
    workflow_steps: string[];          // 实际执行了哪些步骤（调试用）
    workflow_duration_ms?: number;     // 总耗时
    cache_hit?: boolean;               // 是否命中缓存
    role_resolution?: RoleResolution;  // 岗位语义解析（可选）
    research_providers?: {             // 研究阶段实际使用的 provider
      role_study: string;              // e.g. 'metaso' | 'deepseek'
      hr_insider: string;
      fallback_used: boolean;          // 任一研究步骤是否用了 fallback
    };
  };

  // ── 研究阶段产出（后台养料，前端可选展示）──
  // 由 Phase 1 (R2 RoleStudy + R3 HrInsider) 和 Phase 2 (R5 ResumeStudy) 产生
  // 类型定义在 lib/diagnose/v4/schemas.ts ResearchContext，这里用 unknown 避免循环引用
  research_context?: unknown;
}

/**
 * V4 请求 — 简化版（无 tier、无 diagnose_mode）
 */
export interface DiagnoseReportRequest {
  resume_text: string;
  resume_paragraphs?: string[];
  target_role: string;
  jd_text?: string;
  source_type?: 'paste' | 'pdf';
  uploaded_file_id?: string;
  /** 绕过 24h 缓存，强制重新诊断 */
  force_refresh?: boolean;
}

/** Zod schema for V4 请求校验 */
export const diagnoseReportRequestSchema = z.object({
  resume_text: z.string().min(1, '简历文本不能为空'),
  resume_paragraphs: z.array(z.string()).optional(),
  target_role: z.string().min(1, '目标岗位不能为空'),
  jd_text: z.string().optional().default(''),
  source_type: z.enum(['paste', 'pdf']).optional().default('paste'),
  uploaded_file_id: z.string().optional(),
  force_refresh: z.boolean().optional().default(false),
});

/** 段落类型的中文标签 */
export const SECTION_LABELS: Record<ResumeSectionType, string> = {
  personal_info:   '个人信息',
  education:       '教育背景',
  work_experience: '工作经历',
  internship:      '实习经历',
  project:         '项目经验',
  skill:           '技能清单',
  self_evaluation: '自我评价',
  certificate:     '证书',
  other:           '其他',
};

