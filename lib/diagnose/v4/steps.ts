/**
 * V4 工作流 — 各 Step 的 AI 调用封装
 *
 * 每个 step：
 * 1. 接受上游 step 的输出作为上下文
 * 2. 调用 prompts.ts 的对应 build...Prompt
 * 3. 经 aiRouter 路由到合适 provider
 * 4. 用 schemas.ts 的 zod 校验输出
 * 5. 返回类型化结果
 */

import type { NormalizedInput } from '../types';
import { aiRouter } from '../../ai/router';
import { logInfo, logError } from '../../error-handler';
import { safeParseJson } from './utils';
import {
  baseAnalyzerOutputSchema,
  hrSimulatorOutputSchema,
  resumeMasterOutputSchema,
  jdKeywordCoverageOutputSchema,
  credibilityCheckOutputSchema,
  selfCritiqueOutputSchema,
  finalSynthesisOutputSchema,
  type BaseAnalyzerOutput,
  type HrSimulatorOutput,
  type ResumeMasterOutput,
  type JdKeywordCoverageOutput,
  type CredibilityCheckOutput,
  type SelfCritiqueOutput,
  type FinalSynthesisOutput,
  type ResearchContext,
} from './schemas';
import {
  buildBaseAnalyzerPrompt,
  buildHrSimulatorPrompt,
  buildResumeMasterPrompt,
  buildJdKeywordCoveragePrompt,
  buildCredibilityCheckPrompt,
  buildSelfCritiquePrompt,
  buildFinalSynthesisPrompt,
} from './prompts';

// ════════════════════════════════════════════════════════════════
// Step 1: BaseAnalyzer
// ════════════════════════════════════════════════════════════════

export async function runBaseAnalyzer(
  input: NormalizedInput,
  research?: ResearchContext
): Promise<BaseAnalyzerOutput> {
  logInfo('V4.BaseAnalyzer', 'start');
  const prompt = buildBaseAnalyzerPrompt(input, research);

  const response = await aiRouter.route({
    type: 'baseline',
    prompt,
    systemPrompt: '你是简历快速分析器。严格输出 JSON。',
    temperature: 0.3,
    maxTokens: 1500,
    requireJson: true,
  });

  return safeParseJson(response.content, baseAnalyzerOutputSchema);
}

// ════════════════════════════════════════════════════════════════
// Step 3a: HrSimulator
// ════════════════════════════════════════════════════════════════

export async function runHrSimulator(
  input: NormalizedInput,
  base: BaseAnalyzerOutput,
  research?: ResearchContext
): Promise<HrSimulatorOutput> {
  logInfo('V4.HrSimulator', 'start');
  const prompt = buildHrSimulatorPrompt(input, base, research);

  try {
    const response = await aiRouter.route({
      type: 'hr_review',
      prompt,
      systemPrompt: '你是资深 HR 招聘经理。严格输出 JSON。',
      temperature: 0.4,
      maxTokens: 2500,
      requireJson: true,
    });

    return safeParseJson(response.content, hrSimulatorOutputSchema);
  } catch (e) {
    logError('V4.HrSimulator', e);
    logInfo('V4.HrSimulator', '启用降级（fallback 空模板）');
    return buildEmptyHrSimulator(base);
  }
}

// ════════════════════════════════════════════════════════════════
// Step 3b: ResumeMaster
// ════════════════════════════════════════════════════════════════

export async function runResumeMaster(
  input: NormalizedInput,
  base: BaseAnalyzerOutput,
  research?: ResearchContext
): Promise<ResumeMasterOutput> {
  logInfo('V4.ResumeMaster', 'start');
  const prompt = buildResumeMasterPrompt(input, base, research);

  try {
    const response = await aiRouter.route({
      type: 'rewrite_review',
      prompt,
      systemPrompt: '你是顶级简历改写专家。严格输出 JSON。',
      temperature: 0.4,
      maxTokens: 3500,
      requireJson: true,
    });

    return safeParseJson(response.content, resumeMasterOutputSchema);
  } catch (e) {
    logError('V4.ResumeMaster', e);
    logInfo('V4.ResumeMaster', '启用降级（fallback 空模板）');
    return buildEmptyResumeMaster();
  }
}

/** HrSimulator 降级模板：用 base.overall_grade 推断决策 */
function buildEmptyHrSimulator(base: BaseAnalyzerOutput): HrSimulatorOutput {
  const sixSecondDecision: HrSimulatorOutput['six_second']['decision'] =
    base.overall_grade === 'excellent' || base.overall_grade === 'strong'
      ? 'continue_reading'
      : base.overall_grade === 'medium'
        ? 'skip_likely'
        : 'skip';
  const thirtySecondDecision: HrSimulatorOutput['thirty_second']['decision'] =
    base.overall_grade === 'excellent' || base.overall_grade === 'strong'
      ? 'interview'
      : base.overall_grade === 'medium'
        ? 'hold'
        : 'reject';
  return {
    six_second: {
      decision: sixSecondDecision,
      impression: 'AI 分析降级，基于 base 评级推断',
      findings: [],
    },
    thirty_second: {
      decision: thirtySecondDecision,
      impression: 'AI 分析降级，未生成细看建议',
      findings: [],
    },
    overall_hr_risk: 'medium',
  };
}

/** ResumeMaster 降级模板：完全空 */
function buildEmptyResumeMaster(): ResumeMasterOutput {
  return {
    rewrite_strategy: '降级模板：未生成详细改写策略',
    section_advice: [],
    global_structure_issues: [],
  };
}

// ════════════════════════════════════════════════════════════════
// Step 3c: JdKeywordCoverage（仅 has_jd 时启用）
// ════════════════════════════════════════════════════════════════

export async function runJdKeywordCoverage(
  input: NormalizedInput,
  research?: ResearchContext
): Promise<JdKeywordCoverageOutput | null> {
  if (!input.jd_text || input.jd_text.trim().length < 20) {
    logInfo('V4.JdKeywordCoverage', 'skip: no JD');
    return null;
  }

  logInfo('V4.JdKeywordCoverage', 'start');
  const prompt = buildJdKeywordCoveragePrompt(input, research);

  try {
    const response = await aiRouter.route({
      type: 'baseline',
      prompt,
      systemPrompt: '你是 ATS 关键词匹配引擎。严格输出 JSON。',
      temperature: 0.2,
      maxTokens: 1500,
      requireJson: true,
    });

    return safeParseJson(response.content, jdKeywordCoverageOutputSchema);
  } catch (e) {
    logError('V4.JdKeywordCoverage', e);
    return null; // 非致命，降级为 null
  }
}

// ════════════════════════════════════════════════════════════════
// Step 3d: CredibilityCheck
// ════════════════════════════════════════════════════════════════

export async function runCredibilityCheck(
  input: NormalizedInput,
  base: BaseAnalyzerOutput,
  research?: ResearchContext
): Promise<CredibilityCheckOutput> {
  logInfo('V4.CredibilityCheck', 'start');
  const prompt = buildCredibilityCheckPrompt(input, base, research);

  try {
    const response = await aiRouter.route({
      type: 'verify',
      prompt,
      systemPrompt: '你是简历可信度审查官（红队视角）。严格输出 JSON。',
      temperature: 0.3,
      maxTokens: 1800,
      requireJson: true,
    });

    return safeParseJson(response.content, credibilityCheckOutputSchema);
  } catch (e) {
    logError('V4.CredibilityCheck', e);
    // 降级：返回空 flags
    return {
      flags: [],
      overall_credibility: 'mostly_credible',
      summary_for_operator: '可信度检查失败，建议手动复核。',
    };
  }
}

// ════════════════════════════════════════════════════════════════
// Step 4: SelfCritiqueLoop
// ════════════════════════════════════════════════════════════════

export async function runSelfCritique(
  input: NormalizedInput,
  base: BaseAnalyzerOutput,
  master: ResumeMasterOutput,
  hrBefore: HrSimulatorOutput,
  research?: ResearchContext
): Promise<SelfCritiqueOutput> {
  logInfo('V4.SelfCritique', 'start');
  const prompt = buildSelfCritiquePrompt(input, base, master, hrBefore, research);

  try {
    const response = await aiRouter.route({
      type: 'verify',
      prompt,
      systemPrompt: '你是改前/改后效果模拟器。严格输出 JSON。',
      temperature: 0.3,
      maxTokens: 1500,
      requireJson: true,
    });

    return safeParseJson(response.content, selfCritiqueOutputSchema);
  } catch (e) {
    logError('V4.SelfCritique', e);
    // 降级：用 base 分数轻度提升作为 fallback
    const base6sBefore = hrBefore.six_second.decision;
    return {
      imagined_after_resume_summary: '（SelfCritique 降级：未能模拟改后效果）',
      after_metrics: {
        overall_score: Math.min(100, computeWeightedAverage(base.dimension_scores) + 8),
        hr_6s_pass: base6sBefore === 'skip' ? '可能停留细看' : '应可通过',
        ats_match: '+10-15%',
        interview_risk: hrBefore.overall_hr_risk === 'high' ? 'medium' : 'low',
        decision_estimate: hrBefore.thirty_second.decision === 'reject' ? 'hold' : 'interview',
      },
      improvement_summary: '（SelfCritique 降级：估算改后水平）',
      remaining_issues: ['SelfCritique 步骤失败，未深入审视'],
    };
  }
}

function computeWeightedAverage(scores: BaseAnalyzerOutput['dimension_scores']): number {
  const w = {
    structure: 0.15,
    expression: 0.15,
    evidence: 0.30,
    role_fit: 0.20,
    credibility: 0.10,
    missing_info: 0.10,
  };
  return Math.round(
    scores.structure * w.structure +
    scores.expression * w.expression +
    scores.evidence * w.evidence +
    scores.role_fit * w.role_fit +
    scores.credibility * w.credibility +
    scores.missing_info * w.missing_info
  );
}

// ════════════════════════════════════════════════════════════════
// Step 5: FinalSynthesis
// ════════════════════════════════════════════════════════════════

export async function runFinalSynthesis(
  input: NormalizedInput,
  base: BaseAnalyzerOutput,
  hr: HrSimulatorOutput,
  master: ResumeMasterOutput,
  credibility: CredibilityCheckOutput,
  jdCoverage: JdKeywordCoverageOutput | null,
  selfCritique: SelfCritiqueOutput,
  ruleBasedMissingTitles: string[],
  research?: ResearchContext
): Promise<FinalSynthesisOutput> {
  logInfo('V4.FinalSynthesis', 'start');
  const prompt = buildFinalSynthesisPrompt(
    input,
    base,
    hr,
    master,
    credibility,
    jdCoverage,
    selfCritique,
    ruleBasedMissingTitles,
    research
  );

  try {
    const response = await aiRouter.route({
      type: 'synthesize',
      prompt,
      systemPrompt: '你是诊断报告合成器。严格输出 JSON。',
      temperature: 0.3,
      maxTokens: 8000,
      requireJson: true,
    });

    return safeParseJson(response.content, finalSynthesisOutputSchema);
  } catch (e) {
    logError('V4.FinalSynthesis', e);
    logInfo('V4.FinalSynthesis', '启用降级合成（fallback）');
    return buildFallbackSynthesis(input, base, hr, master, credibility, jdCoverage, selfCritique);
  }
}

/**
 * 降级合成器：当 AI final_synthesis 失败时，用其他 step 的输出
 * 拼出最小可用 FinalSynthesisOutput（让流程能完成而不是整个崩）
 */
function buildFallbackSynthesis(
  _input: NormalizedInput,
  base: BaseAnalyzerOutput,
  hr: HrSimulatorOutput,
  master: ResumeMasterOutput,
  credibility: CredibilityCheckOutput,
  jdCoverage: JdKeywordCoverageOutput | null,
  selfCritique: SelfCritiqueOutput
): FinalSynthesisOutput {
  const comments: FinalSynthesisOutput['comments'] = [];

  // 1. HR findings → comments
  for (const f of [...hr.six_second.findings, ...hr.thirty_second.findings]) {
    comments.push({
      section: f.section,
      section_label: f.section,
      dimension: 'evidence',                 // 默认放 evidence 维度
      status: f.severity === 'must_fix' ? 'problem' : 'warn',
      severity: f.severity,
      title: f.finding.slice(0, 30),
      one_liner: f.finding,
      why_it_hurts: f.why_rejects,
      impact_on: ['hr_30s'],
      fix_type: 'safe_expand',
      evidence_quote: f.evidence_quote,
      evidence_location: undefined,
      rewrite: null,
      insider_view: undefined,
      source: 'hr',
      credibility_concern: undefined,
    });
  }

  // 2. Master rewrite_examples → comments（带 rewrite）
  for (const sec of master.section_advice) {
    for (const r of sec.rewrite_examples) {
      comments.push({
        section: sec.section,
        section_label: sec.section,
        dimension: 'expression',
        status: 'warn',
        severity: 'should_fix',
        title: r.what_changed.slice(0, 30) || '改写建议',
        one_liner: r.what_changed,
        why_it_hurts: '原版表达不够紧凑或量化不足',
        impact_on: ['hr_30s'],
        fix_type: r.enrichment_safety,
        evidence_quote: r.original,
        evidence_location: undefined,
        rewrite: { before: r.original, after: r.rewritten, what_changed: r.what_changed },
        insider_view: undefined,
        source: 'master',
        credibility_concern: undefined,
      });
    }
  }

  // 3. Credibility flags → comments
  for (const flag of credibility.flags) {
    comments.push({
      section: flag.section,
      section_label: flag.section,
      dimension: 'credibility',
      status: 'problem',
      severity: flag.severity === 'high' ? 'must_fix' : flag.severity === 'medium' ? 'should_fix' : 'optional',
      title: flag.description.slice(0, 30),
      one_liner: flag.description,
      why_it_hurts: '可能引发 HR / 面试官质疑',
      impact_on: ['hr_30s', 'interview'],
      fix_type: 'needs_user_input',
      evidence_quote: flag.evidence_quote,
      evidence_location: undefined,
      rewrite: null,
      insider_view: flag.question_for_candidate,
      source: 'credibility',
      credibility_concern: flag.type,
    });
  }

  // 4. JD missing critical → comments
  if (jdCoverage && jdCoverage.missing_critical.length > 0) {
    for (const kw of jdCoverage.missing_critical) {
      comments.push({
        section: 'skill',
        section_label: 'skill',
        dimension: 'role_fit',
        status: 'problem',
        severity: 'must_fix',
        title: `JD 必备关键词缺失: ${kw}`,
        one_liner: `JD 要求 ${kw} 但简历未体现`,
        why_it_hurts: '会影响 ATS 关键词匹配率，可能直接被过滤',
        impact_on: ['ats'],
        fix_type: 'needs_user_input',
        evidence_quote: `（简历中未找到 "${kw}"）`,
        evidence_location: undefined,
        rewrite: null,
        insider_view: undefined,
        source: 'jd_coverage',
        credibility_concern: undefined,
      });
    }
  }

  return {
    comments,
    total_assessment: `${base.one_line_verdict} ${selfCritique.improvement_summary}（注：本次报告由降级合成器生成，AI 合成步骤失败）`,
    scenario: 'normal',
    risks: {
      ats_risk: {
        level: jdCoverage && jdCoverage.coverage_rate < 0.5 ? 'high' : 'medium',
        reasons: jdCoverage ? [`必备关键词覆盖率 ${Math.round(jdCoverage.coverage_rate * 100)}%`] : ['无 JD 提供，无法估算'],
      },
      hr_risk: {
        level: hr.overall_hr_risk,
        reasons: [hr.thirty_second.impression],
      },
      interview_risk: {
        level: selfCritique.after_metrics.interview_risk,
        reasons: selfCritique.remaining_issues.slice(0, 3),
      },
    },
  };
}
