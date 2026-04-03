// 双 AI 工作流主入口
import { z } from 'zod';
import type { DiagnoseRequest, FreeDiagnoseResponse, NormalizedInput, CoreIssue, PriorityAction, MinorSuggestion, RewriteExample, FollowUpPrompt, IssueDimension, SourceLocation } from '../types';
import { normalizeInput } from '../normalize';
import { aiRouter } from '../../ai/router';
import type { AIResponse } from '../../ai/types';
import { logInfo, logError, logWarn } from '../../error-handler';
import { runFreeDiagnoseWorkflow } from '../workflow';
import {
  baseAnalyzerResultSchema,
  hrSimulatorResultSchema,
  resumeMasterResultSchema,
  crossCritiqueResultSchema,
  deepReportSchema,
  type BaseAnalyzerResult,
  type HrSimulatorResult,
  type ResumeMasterResult,
  type CrossCritiqueResult,
  type ScenarioSimulationResult,
  type FinalDualDiagnoseResult,
  type DeepReport,
} from './schemas';
import {
  buildBaseAnalyzerPrompt,
  buildHrSimulatorPrompt,
  buildResumeMasterPrompt,
  buildCrossCritiquePrompt,
  buildFinalSynthesisPrompt,
  // @deprecated: old deep prompts, kept for reference only
  buildDeepHrSimulatorPrompt,
  buildDeepResumeMasterPrompt,
  buildDeepCrossCritiquePrompt,
  buildDeepFinalSynthesisPrompt,
  buildDeepReportSynthesisPrompt,
  // new deep prompts — implemented in Phase 3
  buildDeepResearchMemoPrompt,
  buildDeepSynthesisPrompt,
} from './prompts';
import { mapToFreeDiagnoseResponse } from './mappers';

// 尝试修复常见的 JSON 格式问题
function attemptJsonRepair(text: string): string {
  let s = text.trim();
  // 移除尾部多余逗号（对象/数组末尾）
  s = s.replace(/,\s*([}\]])/g, '$1');
  // 补全未闭合的数组和对象（统计括号差值）
  const opens = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
  const arrOpens = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
  for (let i = 0; i < arrOpens; i++) s += ']';
  for (let i = 0; i < opens; i++) s += '}';
  // 修复未闭合字符串（奇数个未转义引号时追加引号）
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) s += '"';
  return s;
}

// 安全 JSON 解析辅助函数
function safeParseJson<T>(content: string, schema?: z.ZodSchema<T>): T {
  // 提取候选 JSON 文本（代码块优先，其次最外层对象/数组）
  const codeBlockMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
  const objectMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  const candidates: string[] = [];
  if (codeBlockMatch?.[1]) candidates.push(codeBlockMatch[1]);
  if (objectMatch?.[1]) candidates.push(objectMatch[1]);
  candidates.push(content);

  let parsed: unknown;
  let lastError: unknown;

  for (const candidate of candidates) {
    // 先直接解析，失败则尝试修复后再解析
    for (const text of [candidate, attemptJsonRepair(candidate)]) {
      try {
        parsed = JSON.parse(text);
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (parsed !== undefined) break;
  }

  if (parsed === undefined) {
    logError('SafeParseJson', `Failed to parse JSON: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    throw new Error(`JSON 解析失败: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  if (schema) {
    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    } else {
      logWarn('SafeParseJson', `Schema validation failed: ${result.error ? JSON.stringify(result.error.issues) : 'unknown error'}`);
      return parsed as T;
    }
  }

  return parsed as T;
}

// ==================== 原始双AI工作流 ====================

// Step 1: BaseAnalyzer
async function runBaseAnalyzer(input: NormalizedInput): Promise<BaseAnalyzerResult> {
  logInfo('DualWorkflow', 'Step 1: BaseAnalyzer');

  const prompt = buildBaseAnalyzerPrompt(input);
  const response = await aiRouter.route({
    type: 'baseline',
    prompt,
    systemPrompt: '你是简历快速分析器，输出结构化JSON。',
    temperature: 0.3,
    maxTokens: 1500,
    requireJson: true,
  });

  return safeParseJson(response.content, baseAnalyzerResultSchema);
}

// Step 2a: HR Simulator
async function runHrSimulator(
  input: NormalizedInput,
  baseResult: BaseAnalyzerResult
): Promise<HrSimulatorResult> {
  logInfo('DualWorkflow', 'Step 2a: HR Simulator');

  const prompt = buildHrSimulatorPrompt(input, baseResult);
  const response = await aiRouter.route({
    type: 'hr_review',
    prompt,
    systemPrompt: '你是资深HR，模拟真实初筛流程。',
    temperature: 0.4,
    maxTokens: 2000,
    requireJson: true,
  });

  return safeParseJson(response.content, hrSimulatorResultSchema);
}

// Step 2b: Resume Master
async function runResumeMaster(
  input: NormalizedInput,
  baseResult: BaseAnalyzerResult
): Promise<ResumeMasterResult> {
  logInfo('DualWorkflow', 'Step 2b: Resume Master');

  const prompt = buildResumeMasterPrompt(input, baseResult);
  const response = await aiRouter.route({
    type: 'rewrite_review',
    prompt,
    systemPrompt: '你是简历优化专家，提供重写级分析。',
    temperature: 0.4,
    maxTokens: 3000,
    requireJson: true,
  });

  return safeParseJson(response.content, resumeMasterResultSchema);
}

// Step 3: Cross Critique
async function runCrossCritique(
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult
): Promise<CrossCritiqueResult> {
  logInfo('DualWorkflow', 'Step 3: Cross Critique');

  const prompt = buildCrossCritiquePrompt(hrResult, masterResult);
  const response = await aiRouter.route({
    type: 'verify',
    prompt,
    systemPrompt: '你是交叉验证分析器。',
    temperature: 0.3,
    maxTokens: 1000,
    requireJson: true,
  });

  return safeParseJson(response.content, crossCritiqueResultSchema);
}

// Step 4: Scenario Simulation (纯逻辑推导，不调用AI)
function runScenarioSimulation(
  baseResult: BaseAnalyzerResult,
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult
): ScenarioSimulationResult {
  logInfo('DualWorkflow', 'Step 4: Scenario Simulation');

  const hr6sImpression = hrResult.hr_decision === 'pass'
    ? '可能通过6秒扫描'
    : '可能在6秒内被跳过';

  const interviewPassRate = hrResult.hr_decision === 'interview'
    ? '60-80%'
    : hrResult.hr_decision === 'pass' ? '40-60%' : '20-40%';

  const atsMatchRate = `${Math.min(95, baseResult.dimension_scores['role_fit'] || 50)}%`;

  return {
    hr_6s_impression: hr6sImpression,
    interview_pass_rate_estimate: interviewPassRate,
    ats_keyword_match_rate: atsMatchRate,
    manual_review_risk: hrResult.screening_red_flags.length > 2 ? '高' : '中',
    top5_gap_estimate: baseResult.overall_score >= 85 ? '接近' : '有差距',
    before_after_comparison: `改前${baseResult.overall_score}分 → 改后预估+10-15分`,
  };
}

// Step 5: Final Synthesis
async function synthesizeFinalReport(
  input: NormalizedInput,
  baseResult: BaseAnalyzerResult,
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult,
  crossResult: CrossCritiqueResult,
  simResult: ScenarioSimulationResult
): Promise<FinalDualDiagnoseResult> {
  logInfo('DualWorkflow', 'Step 5: Final Synthesis');

  const prompt = buildFinalSynthesisPrompt(input, baseResult, hrResult, masterResult, crossResult);
  const response = await aiRouter.route({
    type: 'synthesize',
    prompt,
    systemPrompt: '你是报告合成器，整合多个AI的分析结果。',
    temperature: 0.3,
    maxTokens: 2500,
    requireJson: true,
  });

  const parsed = safeParseJson(response.content) as Record<string, unknown>;

  return {
    executive_summary: (parsed.executive_summary as string) || baseResult.base_summary,
    overall_score: baseResult.overall_score,
    key_conclusions: Array.isArray(parsed.key_conclusions) ? parsed.key_conclusions as string[] : [],
    core_issues: Array.isArray(parsed.core_issues) ? parsed.core_issues as Array<{ title: string; summary: string; evidence: string; suggestion: string; source: 'hr' | 'master' | 'both' }> : [],
    rewrite_examples: masterResult.experience_rewrites.slice(0, 3),
    scenario_simulation_summary: `${simResult.hr_6s_impression}；面试通过率预估${simResult.interview_pass_rate_estimate}`,
    next_actions: Array.isArray(parsed.next_actions) ? parsed.next_actions as string[] : [],
    metadata: {
      base_score: baseResult.overall_score,
      hr_decision: hrResult.hr_decision,
      dual_ai_version: '1.0',
    },
  };
}

// 主工作流入口 - 原始双AI工作流
export async function runDualDiagnoseWorkflow(
  request: DiagnoseRequest
): Promise<FreeDiagnoseResponse> {
  try {
    logInfo('DualWorkflow', '开始双 AI 诊断工作流');

    const normalizedInput = normalizeInput(request);

    const baseResult = await runBaseAnalyzer(normalizedInput);

    const [hrResult, masterResult] = await Promise.all([
      runHrSimulator(normalizedInput, baseResult),
      runResumeMaster(normalizedInput, baseResult),
    ]);

    const crossResult = await runCrossCritique(hrResult, masterResult);

    const simResult = runScenarioSimulation(baseResult, hrResult, masterResult);

    const finalResult = await synthesizeFinalReport(
      normalizedInput,
      baseResult,
      hrResult,
      masterResult,
      crossResult,
      simResult
    );

    const response = mapToFreeDiagnoseResponse(finalResult, normalizedInput);

    logInfo('DualWorkflow', '双 AI 工作流完成');
    return response;
  } catch (error) {
    logError('DualWorkflow', error);
    throw error;
  }
}

// ==================== 深度诊断工作流（新主路径）====================
// 新流程: basic_result + research_memo + deep_synthesis -> final deep response
// 旧多段串联函数已迁移到下方 @deprecated 区域，不再被主路径调用。

/**
 * 深度研究 memo（Metaso，中间产物，非 JSON）
 */
async function runDeepResearchMemo(
  input: NormalizedInput,
  basicSummary: ReturnType<typeof extractBasicDiagnosisSummary>
): Promise<AIResponse> {
  logInfo('DeepWorkflow', 'Step 1: Deep Research Memo (Metaso)');

  const prompt = buildDeepResearchMemoPrompt(input, basicSummary);
  const strictMode = process.env.DEEP_RESEARCH_STRICT_METASO === 'true';

  const response = await aiRouter.route({
    type: 'research',
    prompt,
    systemPrompt: '你是行业研究助手，提供目标岗位的市场洞察和简历优化建议。',
    temperature: 0.4,
    maxTokens: 2000,
    requireJson: false,
  });

  // Strict mode validation: if fallback occurred and strict mode is enabled, throw error
  if (strictMode && response.fallbackUsed) {
    throw new Error(`Deep research strict mode enabled: fallback from ${response.fallbackFrom} to ${response.fallbackTo} not allowed. Reason: ${response.fallbackReason}`);
  }

  return response;
}

/**
 * 深度综合 synthesis（DeepSeek，最终 JSON 输出）
 */
async function runDeepSynthesis(
  input: NormalizedInput,
  basicResult: FreeDiagnoseResponse,
  basicSummary: ReturnType<typeof extractBasicDiagnosisSummary>,
  researchMemo: string
): Promise<FreeDiagnoseResponse> {
  logInfo('DeepWorkflow', 'Step 2: Deep Synthesis (DeepSeek)');

  const prompt = buildDeepSynthesisPrompt(input, basicResult, basicSummary, researchMemo);

  const response = await aiRouter.route({
    type: 'deep_synthesize',
    prompt,
    systemPrompt: '你是深度诊断专家，输出完整的 FreeDiagnoseResponse JSON。',
    temperature: 0.3,
    maxTokens: 4000,
    requireJson: true,
  });

  const parsed = safeParseJson(response.content) as Record<string, unknown>;

  // 从 parsed 中提取深度字段，缺失时 fallback 到 basicResult
  const parsedCoreIssues = safeCoreIssues(parsed.core_issues);
  const parsedPriorityActions = safePriorityActions(parsed.priority_actions);
  const parsedMinorSuggestions = safeMinorSuggestions(parsed.minor_suggestions);
  const parsedRewriteExamples = safeRewriteExamples(parsed.rewrite_examples);
  const parsedFollowUpPrompts = safeFollowUpPrompts(parsed.follow_up_prompts);
  const parsedExcellentScore = typeof parsed.excellent_score === 'number' ? parsed.excellent_score : undefined;
  const parsedQualityTier = safeEnum(parsed.quality_tier, ['excellent', 'strong', 'medium', 'weak']);
  const parsedRewriteDirection = safeString(parsed.rewrite_direction);
  const parsedMainJudgment = safeString(parsed.main_judgment);
  const parsedScenario = safeEnum(parsed.scenario, ['normal', 'excellent', 'insufficient_input']);
  const parsedCoreIssuesSummary = safeCoreIssuesSummary(parsed.core_issues_summary);
  const parsedDeepValueSummary = safeString(parsed.deep_value_summary);

  // 构建 FreeDiagnoseResponse，优先使用 parsed 中的深度字段
  const deepResponse: FreeDiagnoseResponse = {
    scenario: parsedScenario || basicResult.scenario,
    main_judgment: parsedMainJudgment || basicResult.main_judgment,
    core_issues: parsedCoreIssues || basicResult.core_issues,
    core_issues_summary: parsedCoreIssuesSummary || {
      total_count: basicResult.core_issues.length,
      shown_count: basicResult.core_issues.length,
    },
    priority_actions: parsedPriorityActions || basicResult.priority_actions,
    rewrite_direction: parsedRewriteDirection || basicResult.rewrite_direction,
    minor_suggestions: parsedMinorSuggestions || basicResult.minor_suggestions,
    rewrite_examples: parsedRewriteExamples || basicResult.rewrite_examples,
    follow_up_prompts: parsedFollowUpPrompts || basicResult.follow_up_prompts,
    excellent_score: parsedExcellentScore ?? basicResult.excellent_score,
    quality_tier: parsedQualityTier || basicResult.quality_tier,
    metadata: {
      ...basicResult.metadata,
      diagnose_mode: 'deep',
      deep_diagnosis: true,
      based_on_basic_report: true,
      deep_fallback_reason: undefined,
      deep_fallback_message: undefined,
      // deep_value_summary 只在 metadata 中，不在顶层
      deep_value_summary: parsedDeepValueSummary,
      // 从 parsed 中承接深度 metadata 字段
      ats_risk_level: safeEnum(parsed.ats_risk_level, ['low', 'medium', 'high']) || basicResult.metadata.ats_risk_level,
      hr_risk_level: safeEnum(parsed.hr_risk_level, ['low', 'medium', 'high']) || basicResult.metadata.hr_risk_level,
      enrichment_safety_flags: Array.isArray(parsed.enrichment_safety_flags)
        ? parsed.enrichment_safety_flags.filter((f): f is string => typeof f === 'string')
        : basicResult.metadata.enrichment_safety_flags,
    },
  };

  // 注入 deep_report（如提供）
  if (parsed.deep_report) {
    try {
      deepResponse.deep_report = safeParseJson(
        typeof parsed.deep_report === 'string' ? parsed.deep_report : JSON.stringify(parsed.deep_report),
        deepReportSchema
      );
    } catch {
      logWarn('DeepWorkflow', 'deep_report schema validation failed, attaching raw');
      deepResponse.deep_report = parsed.deep_report as DeepReport;
    }
  }

  return deepResponse;
}

// ─── Safe parse helpers for deep synthesis output ─────────────

function safeString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function safeCoreIssues(v: unknown): CoreIssue[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      title: safeString(item.title) || '未命名问题',
      summary: safeString(item.summary) || '',
      evidence: safeString(item.evidence) || '',
      insider_view: safeString(item.insider_view) || '',
      suggestion: safeString(item.suggestion) || '',
      follow_up_question: safeString(item.follow_up_question) || '',
      priority: typeof item.priority === 'number' ? item.priority : 1,
      screening_impact: safeString(item.screening_impact),
      is_structural: typeof item.is_structural === 'boolean' ? item.is_structural : undefined,
      jd_relevance: safeEnum(item.jd_relevance, ['high', 'medium', 'low', 'none']),
      dimension: safeEnum(item.dimension, ['structure', 'role_fit', 'evidence', 'credibility', 'expression', 'missing_info', 'other']) as IssueDimension | undefined,
      source_location: safeSourceLocation(item.source_location),
      rewrite_examples: safeRewriteExamples(item.rewrite_examples),
    }));
}

function safeCoreIssuesSummary(v: unknown): { total_count: number; shown_count: number } | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const obj = v as Record<string, unknown>;
  const total = typeof obj.total_count === 'number' ? obj.total_count : 0;
  const shown = typeof obj.shown_count === 'number' ? obj.shown_count : 0;
  return { total_count: total, shown_count: shown };
}

function safePriorityActions(v: unknown): PriorityAction[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      title: safeString(item.title) || '',
      description: safeString(item.description) || '',
    }))
    .filter((a) => a.title || a.description);
}

function safeMinorSuggestions(v: unknown): MinorSuggestion[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      title: safeString(item.title) || '',
      description: safeString(item.description) || '',
    }))
    .filter((s) => s.title || s.description);
}

function safeEnum<T extends string>(v: unknown, valid: T[]): T | undefined {
  if (typeof v !== 'string') return undefined;
  return valid.includes(v as T) ? (v as T) : undefined;
}

function safeSourceLocation(v: unknown): SourceLocation | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const obj = v as Record<string, unknown>;
  const result: SourceLocation = {};
  if (typeof obj.paragraph_index === 'number') result.paragraph_index = obj.paragraph_index;
  if (typeof obj.sentence_index === 'number') result.sentence_index = obj.sentence_index;
  if (typeof obj.text_snippet === 'string') result.text_snippet = obj.text_snippet;
  if (Object.keys(result).length === 0) return undefined;
  return result;
}

function safeRewriteExamples(v: unknown): RewriteExample[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      original: safeString(item.original) || '',
      rewritten: safeString(item.rewritten) || '',
      change_summary: safeString(item.change_summary) || '',
    }))
    .filter((r) => r.original || r.rewritten);
}

function safeFollowUpPrompts(v: unknown): FollowUpPrompt[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      question: safeString(item.question) || '',
      why: safeString(item.why) || '',
    }))
    .filter((f) => f.question || f.why);
}

// 深度诊断工作流新入口
export async function runDeepDiagnoseWorkflow(
  request: DiagnoseRequest,
  basicResult: FreeDiagnoseResponse
): Promise<FreeDiagnoseResponse> {
  try {
    logInfo('DeepWorkflow', '开始深度诊断工作流（新主路径）');

    const normalizedInput = normalizeInput(request);
    const basicSummary = extractBasicDiagnosisSummary(basicResult, normalizedInput);

    // Step 1: Research memo (Metaso)
    let researchMemo: string = '';
    let researchMemoFailed = false;
    let researchMemoError: string | undefined;
    let researchProviderRequested: string | undefined;
    let researchProviderActual: string | undefined;
    let researchFallbackUsed: boolean | undefined;
    let researchFallbackReason: string | undefined;
    try {
      const researchResponse = await runDeepResearchMemo(normalizedInput, basicSummary);
      researchMemo = researchResponse.content;
      researchProviderRequested = researchResponse.providerRequested;
      researchProviderActual = researchResponse.providerActual;
      researchFallbackUsed = researchResponse.fallbackUsed;
      researchFallbackReason = researchResponse.fallbackReason;
      logInfo('DeepWorkflow', 'Research memo 成功', {
        providerRequested: researchProviderRequested,
        providerActual: researchProviderActual,
        fallbackUsed: researchFallbackUsed,
        fallbackReason: researchFallbackReason,
        contentLength: researchMemo.length,
      });
    } catch (error) {
      researchMemoFailed = true;
      researchMemoError = error instanceof Error ? error.message : String(error);
      logWarn('DeepWorkflow', 'Research memo 失败，继续执行 synthesis', {
        error: researchMemoError,
        normalizedInput: {
          target_role: normalizedInput.target_role,
          jd_quality: normalizedInput.jd_quality,
          text_quality: normalizedInput.text_quality,
        },
        basicSummary: {
          scenario: basicSummary.scenario,
          core_issues_count: basicSummary.core_issues_count,
        },
      });
      researchMemo = '';
    }

    // Step 2: Deep synthesis (DeepSeek)
    const deepResult = await runDeepSynthesis(normalizedInput, basicResult, basicSummary, researchMemo);

    // 设置 research 阶段 metadata
    deepResult.metadata.research_provider_requested = researchProviderRequested;
    deepResult.metadata.research_provider_actual = researchProviderActual;
    deepResult.metadata.research_fallback_used = researchFallbackUsed;
    deepResult.metadata.research_fallback_reason = researchFallbackReason;
    deepResult.metadata.research_fallback_from = researchFallbackUsed ? researchProviderRequested : undefined;
    deepResult.metadata.research_fallback_to = researchFallbackUsed ? researchProviderActual : undefined;
    deepResult.metadata.research_memo_available = !researchMemoFailed && researchMemo.length > 0;
    deepResult.metadata.deep_diagnosis_executed = true; // synthesis executed

    // 如果 research memo 失败，在 metadata 中标记
    if (researchMemoFailed) {
      deepResult.metadata.deep_fallback_reason = 'research_memo_failed';
      deepResult.metadata.deep_fallback_message = researchMemoError
        ? `深度研究阶段失败: ${researchMemoError.substring(0, 100)}`
        : '深度研究阶段失败，已回退到基础诊断增强';
      logWarn('DeepWorkflow', '深度诊断 research memo 失败，已标记 fallback', {
        error: researchMemoError,
        deep_fallback_reason: deepResult.metadata.deep_fallback_reason,
      });
    } else if (researchFallbackUsed) {
      // research succeeded but fallback occurred
      deepResult.metadata.deep_fallback_reason = 'research_provider_fallback';
      deepResult.metadata.deep_fallback_message = `研究阶段从 ${researchProviderRequested} 回退到 ${researchProviderActual}: ${researchFallbackReason}`;
      logWarn('DeepWorkflow', '深度诊断 research provider fallback，已标记 fallback', {
        providerRequested: researchProviderRequested,
        providerActual: researchProviderActual,
        fallbackReason: researchFallbackReason,
      });
    }

    logInfo('DeepWorkflow', '深度诊断工作流完成', {
      researchMemoFailed,
      researchMemoLength: researchMemo.length,
      deepDiagnosis: deepResult.metadata.deep_diagnosis,
      deep_fallback_reason: deepResult.metadata.deep_fallback_reason,
      researchProviderRequested,
      researchProviderActual,
      researchFallbackUsed,
      deep_diagnosis_executed: deepResult.metadata.deep_diagnosis_executed,
    });
    return deepResult;
  } catch (error) {
    logError('DeepWorkflow', error);
    throw error;
  }
}

// ─── 旧深度诊断链路（@deprecated，不再被主路径调用）────────────
// 以下函数保留作为参考，但不应再被任何主流程调用。

// @deprecated: 不再被主路径调用。旧 Step 2 & 3: 并行 HR + Resume Master

// 提取基础诊断摘要
function extractBasicDiagnosisSummary(basicResult: FreeDiagnoseResponse, input: NormalizedInput) {
  return {
    scenario: basicResult.scenario,
    main_judgment: basicResult.main_judgment,
    core_issues_count: basicResult.core_issues.length,
    core_issues_titles: basicResult.core_issues.map(issue => issue.title),
    core_issues_summaries: basicResult.core_issues.map(issue => issue.summary),
    quality_tier: basicResult.quality_tier,
    excellent_score: basicResult.excellent_score,
    // 提取简历关键事实
    resume_facts: extractResumeFacts(input),
    jd_facts: extractJdFacts(input),
  };
}

// 提取简历关键事实（精简版）
function extractResumeFacts(input: NormalizedInput) {
  const sections = input.resume_sections || [];
  const workExp = sections.filter(s => s.type === 'work_experience');
  const projects = sections.filter(s => s.type === 'project');
  const skills = sections.filter(s => s.type === 'skill').map(s => s.content.substring(0, 100));

  return {
    work_experience_count: workExp.length,
    project_count: projects.length,
    skills_preview: skills.join('; '),
    total_length: input.resume_text.length,
  };
}

// 提取JD关键事实
function extractJdFacts(input: NormalizedInput) {
  if (input.jd_quality === 'none') {
    return { has_jd: false };
  }

  const keywords = input.jd_keywords || [];

  return {
    has_jd: true,
    jd_quality: input.jd_quality,
    keywords: keywords.slice(0, 10),
  };
}

// @deprecated: 不再被主路径调用。基于基础摘要的HR Simulator (深度诊断专用)
async function runHrSimulatorWithBasicSummary(
  input: NormalizedInput,
  basicSummary: ReturnType<typeof extractBasicDiagnosisSummary>
): Promise<HrSimulatorResult> {
  logInfo('DeepWorkflow', 'Step 2: HR Simulator (基于基础诊断，深度专用)');

  const prompt = buildDeepHrSimulatorPrompt(input, {
    main_judgment: basicSummary.main_judgment,
    core_issues_titles: basicSummary.core_issues_titles,
    excellent_score: basicSummary.excellent_score,
  });

  const response = await aiRouter.route({
    type: 'hr_review',
    prompt,
    systemPrompt: '你是资深HR，进行深度初筛分析，遵守深度诊断约束。',
    temperature: 0.4,
    maxTokens: 2500,
    requireJson: true,
  });

  return safeParseJson(response.content, hrSimulatorResultSchema);
}

// @deprecated: 不再被主路径调用。基于基础摘要的Resume Master (深度诊断专用)
async function runResumeMasterWithBasicSummary(
  input: NormalizedInput,
  basicSummary: ReturnType<typeof extractBasicDiagnosisSummary>
): Promise<ResumeMasterResult> {
  logInfo('DeepWorkflow', 'Step 3: Resume Master (基于基础诊断，深度专用)');

  const prompt = buildDeepResumeMasterPrompt(input, {
    main_judgment: basicSummary.main_judgment,
    core_issues_titles: basicSummary.core_issues_titles,
    excellent_score: basicSummary.excellent_score,
  });

  const response = await aiRouter.route({
    type: 'rewrite_review',
    prompt,
    systemPrompt: '你是简历优化专家，进行深度重写分析，遵守深度诊断约束。',
    temperature: 0.4,
    maxTokens: 3500,
    requireJson: true,
  });

  return safeParseJson(response.content, resumeMasterResultSchema);
}

// @deprecated: 不再被主路径调用。深度交叉验证 (深度诊断专用)
async function runDeepCrossCritique(
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult,
  basicSummary: ReturnType<typeof extractBasicDiagnosisSummary>
): Promise<CrossCritiqueResult> {
  logInfo('DeepWorkflow', 'Step 4: Cross Critique (深度专用)');

  const prompt = buildDeepCrossCritiquePrompt(hrResult, masterResult, {
    core_issues_titles: basicSummary.core_issues_titles,
  });

  const response = await aiRouter.route({
    type: 'verify',
    prompt,
    systemPrompt: '你是交叉验证分析器，验证深度分析是否提供增量价值。',
    temperature: 0.3,
    maxTokens: 1500,
    requireJson: true,
  });

  return safeParseJson(response.content, crossCritiqueResultSchema);
}

// @deprecated: 不再被主路径调用。基于基础诊断的Scenario Simulation
function runScenarioSimulationFromBasic(
  basicResult: FreeDiagnoseResponse,
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult
): ScenarioSimulationResult {
  logInfo('DeepWorkflow', 'Step 5: Scenario Simulation (基于基础诊断)');

  const hr6sImpression = hrResult.hr_decision === 'pass'
    ? '可能通过6秒扫描'
    : '可能在6秒内被跳过';

  const interviewPassRate = hrResult.hr_decision === 'interview'
    ? '60-80%'
    : hrResult.hr_decision === 'pass' ? '40-60%' : '20-40%';

  const atsMatchRate = `${Math.min(95, basicResult.excellent_score || 50)}%`;

  return {
    hr_6s_impression: hr6sImpression,
    interview_pass_rate_estimate: interviewPassRate,
    ats_keyword_match_rate: atsMatchRate,
    manual_review_risk: hrResult.screening_red_flags.length > 2 ? '高' : '中',
    top5_gap_estimate: (basicResult.excellent_score || 0) >= 85 ? '接近' : '有差距',
    before_after_comparison: `改前${basicResult.excellent_score || 50}分 → 改后预估+10-15分`,
  };
}

// @deprecated: 不再被主路径调用。深度去重与增量价值提取
interface DeepDeltaDedupResult {
  hrResult: HrSimulatorResult;
  masterResult: ResumeMasterResult;
  crossResult: CrossCritiqueResult;
  simResult: ScenarioSimulationResult;
  deepValueSummary: string;
  atsRiskLevel: 'low' | 'medium' | 'high';
  hrRiskLevel: 'low' | 'medium' | 'high';
  enrichmentSafetyFlags: string[];
}

async function runDeepDeltaDedup(
  basicResult: FreeDiagnoseResponse,
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult,
  crossResult: CrossCritiqueResult,
  simResult: ScenarioSimulationResult,
  input: NormalizedInput
): Promise<DeepDeltaDedupResult> {
  logInfo('DeepWorkflow', 'Step 6: Deep Delta Dedup');

  // 1. 提取基础诊断问题关键词
  const basicIssueKeywords = extractIssueKeywords(basicResult.core_issues);

  // 2. 分析HR结果，去重并评估增量价值
  const dedupedHrResult = deduplicateHrResult(hrResult, basicIssueKeywords);

  // 3. 分析Resume Master结果，去重并评估增量价值
  const dedupedMasterResult = deduplicateMasterResult(masterResult, basicIssueKeywords);

  // 4. 评估增量价值类型
  const incrementalValues = assessIncrementalValue(dedupedHrResult, dedupedMasterResult, basicResult);

  // 5. 计算风险等级
  const riskLevels = calculateRiskLevels(dedupedHrResult, dedupedMasterResult, basicResult);

  // 6. 检查丰富化安全标志
  const safetyFlags = checkEnrichmentSafety(dedupedMasterResult);

  return {
    hrResult: dedupedHrResult,
    masterResult: dedupedMasterResult,
    crossResult,
    simResult,
    deepValueSummary: generateDeepValueSummary(incrementalValues),
    atsRiskLevel: riskLevels.ats,
    hrRiskLevel: riskLevels.hr,
    enrichmentSafetyFlags: safetyFlags,
  };
}

// 提取问题关键词用于语义去重
function extractIssueKeywords(coreIssues: any[]): Set<string> {
  const keywords = new Set<string>();
  const stopWords = new Set(['的', '了', '和', '与', '及', '或', '在', '是', '有', '对', '为', '从', '而', '但', '且', '也', '就', '又', '还', '再', '更', '很', '最', '太', '非常', '十分']);

  for (const issue of coreIssues) {
    const text = `${issue.title} ${issue.summary}`.toLowerCase();
    const words = text
      .replace(/[，。、；：！？]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !stopWords.has(w));

    words.forEach(w => keywords.add(w));
  }

  return keywords;
}

// HR结果去重
function deduplicateHrResult(hrResult: HrSimulatorResult, basicKeywords: Set<string>): HrSimulatorResult {
  // 检查HR的红旗是否与基础诊断重复
  const dedupedRedFlags = hrResult.screening_red_flags.filter(flag => {
    const flagKeywords = extractTextKeywords(flag);
    const overlap = countOverlap(flagKeywords, basicKeywords);
    // 如果重叠率超过40%，认为是重复
    return overlap / Math.max(flagKeywords.size, 1) < 0.4;
  });

  // 检查JD匹配风险
  const dedupedJdRisks = hrResult.jd_match_risks.filter(risk => {
    const riskKeywords = extractTextKeywords(risk);
    const overlap = countOverlap(riskKeywords, basicKeywords);
    return overlap / Math.max(riskKeywords.size, 1) < 0.4;
  });

  return {
    ...hrResult,
    screening_red_flags: dedupedRedFlags,
    jd_match_risks: dedupedJdRisks,
  };
}

// Resume Master结果去重
function deduplicateMasterResult(masterResult: ResumeMasterResult, basicKeywords: Set<string>): ResumeMasterResult {
  // 检查改写示例是否提供增量价值
  const dedupedRewrites = masterResult.experience_rewrites.filter(rewrite => {
    const changeKeywords = extractTextKeywords(rewrite.change_summary);
    const overlap = countOverlap(changeKeywords, basicKeywords);
    // 改写示例需要提供新的改写逻辑
    return overlap / Math.max(changeKeywords.size, 1) < 0.5;
  });

  // 检查ATS关键词是否新增
  const dedupedKeywords = masterResult.ats_keywords.filter(keyword => {
    // 检查是否基础诊断已提及类似关键词
    const keywordLower = keyword.toLowerCase();
    for (const basicKw of basicKeywords) {
      if (keywordLower.includes(basicKw) || basicKw.includes(keywordLower)) {
        return false; // 可能是重复
      }
    }
    return true;
  });

  return {
    ...masterResult,
    experience_rewrites: dedupedRewrites,
    ats_keywords: dedupedKeywords,
  };
}

// 评估增量价值
function assessIncrementalValue(
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult,
  basicResult: FreeDiagnoseResponse
): string[] {
  const values: string[] = [];

  // 1. 更深的原因链
  if (hrResult.screening_red_flags.length > 0) {
    values.push('更细的初筛淘汰原因分析');
  }

  // 2. 更落地的改写动作
  if (masterResult.experience_rewrites.length > 0) {
    values.push('可直接使用的简历改写示例');
  }

  // 3. ATS/HR风险具体化
  if (hrResult.jd_match_risks.length > 0) {
    values.push('具体的ATS关键词缺口分析');
  }

  // 4. 稀疏内容丰富化方案
  if (masterResult.content_to_add && masterResult.content_to_add.length > 0) {
    values.push('保守的内容丰富化建议');
  }

  // 5. 改前改后影响分析
  if (masterResult.rewrite_strategy.includes('影响') || masterResult.rewrite_strategy.includes('风险')) {
    values.push('改写前后的预期影响评估');
  }

  return values;
}

// 计算风险等级
function calculateRiskLevels(
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult,
  basicResult: FreeDiagnoseResponse
): { ats: 'low' | 'medium' | 'high', hr: 'low' | 'medium' | 'high' } {
  let atsScore = 0;
  let hrScore = 0;

  // ATS风险评估
  if (masterResult.ats_keywords.length > 5) atsScore += 2;
  else if (masterResult.ats_keywords.length > 2) atsScore += 1;

  if (hrResult.jd_match_risks.length > 3) atsScore += 2;
  else if (hrResult.jd_match_risks.length > 1) atsScore += 1;

  // HR风险评估
  if (hrResult.screening_red_flags.length > 3) hrScore += 2;
  else if (hrResult.screening_red_flags.length > 1) hrScore += 1;

  if (hrResult.hr_decision === 'hold') hrScore += 2;
  else if (hrResult.hr_decision === 'interview') hrScore += 0;
  else hrScore += 1; // pass

  // 转换分数为等级
  const atsLevel = atsScore >= 3 ? 'high' : atsScore >= 1 ? 'medium' : 'low';
  const hrLevel = hrScore >= 3 ? 'high' : hrScore >= 1 ? 'medium' : 'low';

  return { ats: atsLevel, hr: hrLevel };
}

// 检查丰富化安全性
function checkEnrichmentSafety(masterResult: ResumeMasterResult): string[] {
  const flags: string[] = [];

  // 检查改写示例的安全性
  for (const rewrite of masterResult.experience_rewrites) {
    const original = rewrite.original.toLowerCase();
    const rewritten = rewrite.rewritten.toLowerCase();

    // 检查是否编造数据
    if (rewritten.includes('[需要你补充]')) {
      flags.push('needs_user_input_in_rewrite');
    }

    // 检查是否超出事实边界
    const originalWords = extractTextKeywords(original);
    const rewrittenWords = extractTextKeywords(rewritten);
    const newWords = new Set([...rewrittenWords].filter(x => !originalWords.has(x)));

    // 如果新增了大量词汇，可能需要检查
    if (newWords.size > 5 && originalWords.size > 0) {
      flags.push('potential_over_expansion');
    }
  }

  // 检查建议新增内容
  if (masterResult.content_to_add && masterResult.content_to_add.length > 0) {
    flags.push('has_content_addition_suggestions');
  }

  return flags;
}

// 生成深度价值摘要
function generateDeepValueSummary(incrementalValues: string[]): string {
  if (incrementalValues.length === 0) {
    return '本次深度诊断在基础诊断之上未发现明显新增价值';
  }

  return `深度诊断在基础诊断之上提供了：${incrementalValues.join('、')}`;
}

// 辅助函数：提取文本关键词
function extractTextKeywords(text: string): Set<string> {
  const stopWords = new Set(['的', '了', '和', '与', '及', '或', '在', '是', '有', '对', '为', '从', '而', '但', '且', '也', '就', '又', '还', '再', '更', '很', '最', '太', '非常', '十分']);
  const words = text
    .toLowerCase()
    .replace(/[，。、；：！？]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w));

  return new Set(words);
}

// 辅助函数：计算关键词重叠
function countOverlap(set1: Set<string>, set2: Set<string>): number {
  let overlap = 0;
  for (const item of set1) {
    if (set2.has(item)) overlap++;
  }
  return overlap;
}

// @deprecated: 不再被主路径调用。深度诊断报告合成
async function synthesizeDeepDiagnosisReport(
  basicResult: FreeDiagnoseResponse,
  dedupedResults: DeepDeltaDedupResult,
  input: NormalizedInput
): Promise<FinalDualDiagnoseResult> {
  logInfo('DeepWorkflow', 'Step 7: Final Synthesis (深度诊断专用)');

  // 生成兼容旧 schema 的结果
  const compatPrompt = buildDeepFinalSynthesisPrompt(
    input,
    basicResult,
    dedupedResults.hrResult,
    dedupedResults.masterResult,
    dedupedResults.crossResult
  );

  const compatResponse = await aiRouter.route({
    type: 'synthesize',
    prompt: compatPrompt,
    systemPrompt: '你是深度诊断报告合成器，整合深度分析结果，明确展示增量价值。',
    temperature: 0.3,
    maxTokens: 2000,
    requireJson: true,
  });

  const parsed = safeParseJson(compatResponse.content) as Record<string, unknown>;

  // 生成 deep_report
  const deepReportPrompt = buildDeepReportSynthesisPrompt(
    basicResult,
    dedupedResults.hrResult,
    dedupedResults.masterResult,
    dedupedResults.crossResult
  );

  const deepReportResponse = await aiRouter.route({
    type: 'synthesize',
    prompt: deepReportPrompt,
    systemPrompt: '你是深度诊断报告生成器，输出结构化的 deep_report JSON。',
    temperature: 0.3,
    maxTokens: 2500,
    requireJson: true,
  });

  const deepReport = safeParseJson(deepReportResponse.content, deepReportSchema);

  // 构建 basic_summary
  const basicSummary = {
    scenario: basicResult.scenario,
    main_judgment: basicResult.main_judgment,
    core_issues_count: basicResult.core_issues.length,
    core_issues_titles: basicResult.core_issues.map(issue => issue.title),
    quality_tier: basicResult.quality_tier,
    excellent_score: basicResult.excellent_score,
    resume_facts: extractResumeFacts(input),
    jd_facts: extractJdFacts(input),
  };

  return {
    executive_summary: (parsed.executive_summary as string) || `深度诊断：${basicResult.main_judgment}`,
    overall_score: basicResult.excellent_score || 50,
    key_conclusions: Array.isArray(parsed.key_conclusions) ? parsed.key_conclusions as string[] : [],
    core_issues: Array.isArray(parsed.core_issues) ? parsed.core_issues as Array<{ title: string; summary: string; evidence: string; suggestion: string; source: 'hr' | 'master' | 'both' }> : [],
    rewrite_examples: dedupedResults.masterResult.experience_rewrites.slice(0, 3),
    scenario_simulation_summary: `${dedupedResults.simResult.hr_6s_impression}；面试通过率预估${dedupedResults.simResult.interview_pass_rate_estimate}`,
    next_actions: Array.isArray(parsed.next_actions) ? parsed.next_actions as string[] : [],
    metadata: {
      base_score: basicResult.excellent_score || 50,
      hr_decision: dedupedResults.hrResult.hr_decision,
      dual_ai_version: '2.0-deep',
    },
    deep_value_summary: (parsed.deep_value_summary as string) || dedupedResults.deepValueSummary,
    ats_risk_level: safeEnum(parsed.ats_risk_level as string, ['low', 'medium', 'high']) || dedupedResults.atsRiskLevel,
    hr_risk_level: safeEnum(parsed.hr_risk_level as string, ['low', 'medium', 'high']) || dedupedResults.hrRiskLevel,
    enrichment_safety_flags: (parsed.enrichment_safety_flags as string[]) || dedupedResults.enrichmentSafetyFlags,
    basic_summary: basicSummary,
    deep_report: deepReport,
  };
}