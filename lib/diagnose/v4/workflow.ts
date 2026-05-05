/**
 * V4 工作流主入口 — runV4DiagnoseWorkflow
 *
 * 工作流序列：
 *   Phase 0  准备：normalize + MissingInfoProbe（规则，零 AI）
 *   Phase 1  研究阶段（并行）：R2 RoleStudy + R3 HrInsider
 *            按 target_role 缓存（TTL 7 天），命中时秒返
 *   Phase 2  简历研究（吃 R2/R3 当参考系）：R5 ResumeStudy（DeepSeek）
 *   Phase 3  诊断阶段：BaseAnalyzer → 并行四路 → SelfCritique → FinalSynthesis
 *            所有诊断 step 注入 ResearchContext (R2 + R3 + R5) 作为参考系
 *
 * AI 调用估算：
 *   - 全冷启动：5 次（R2-A/B + R3-A/B + R5）+ 7 次诊断 = ~12 次
 *   - R2/R3 缓存命中：1 次（R5）+ 7 次诊断 = ~8 次
 *   - JdKeywordCoverage 在无 JD 时 skip
 */

import type { DiagnoseRequest, NormalizedInput, DiagnoseReport } from '../types';
import { normalizeInput } from '../normalize';
import { logInfo } from '../../error-handler';
import { runMissingInfoProbe } from '../missing-info-probe';
import {
  runBaseAnalyzer,
  runHrSimulator,
  runResumeMaster,
  runJdKeywordCoverage,
  runCredibilityCheck,
  runSelfCritique,
  runFinalSynthesis,
} from './steps';
import {
  runRoleStudy,
  runHrInsider,
  runResumeStudy,
} from './research-steps';
import type { ResearchContext } from './schemas';
import { assembleDiagnoseReport } from './mappers';

export interface V4WorkflowOptions {
  forceRefresh?: boolean;     // 暂时仅作为元信息，缓存层在 service 层处理
  abortSignal?: AbortSignal;
}

/**
 * 运行 V4 诊断工作流
 *
 * 输入: DiagnoseRequest（原始请求）
 * 输出: DiagnoseReport（最终对外结构）
 */
export async function runV4DiagnoseWorkflow(
  request: DiagnoseRequest,
  _options: V4WorkflowOptions = {}
): Promise<DiagnoseReport> {
  const startTime = Date.now();
  const workflowSteps: string[] = [];

  // ════════════════════════════════════════════════════════════════
  // Phase 0: 准备
  // ════════════════════════════════════════════════════════════════
  workflowSteps.push('normalize');
  const input: NormalizedInput = await normalizeInput(request);
  logInfo('V4Workflow', 'Phase0 normalize complete', {
    sections: input.resume_sections.length,
    has_jd: input.jd_text.length > 0,
    target_role: input.target_role,
  });

  workflowSteps.push('missing_info_probe');
  const ruleBasedComments = runMissingInfoProbe(input);
  logInfo('V4Workflow', 'Phase0 missing_info_probe done', {
    comment_count: ruleBasedComments.length,
  });

  // ════════════════════════════════════════════════════════════════
  // Phase 1: 研究阶段（并行 R2/R3，按 target_role 缓存）
  // ════════════════════════════════════════════════════════════════
  workflowSteps.push('phase1_role_research');
  const [roleStudy, hrInsider] = await Promise.all([
    runRoleStudy(input),
    runHrInsider(input),
  ]);
  logInfo('V4Workflow', 'Phase1 role_research done', {
    role_core_caps: roleStudy.core_capabilities.length,
    role_red_flags: roleStudy.red_flags.length,
    role_data_confidence: roleStudy.meta.data_confidence,
    hr_six_focus: hrInsider.six_second_focus.length,
    hr_eliminate_reasons: hrInsider.common_eliminate_reasons.length,
    hr_data_confidence: hrInsider.meta.data_confidence,
  });

  // ════════════════════════════════════════════════════════════════
  // Phase 2: 简历研究（吃 R2/R3，得到 R5）
  // ════════════════════════════════════════════════════════════════
  workflowSteps.push('phase2_resume_study');
  const resumeStudy = await runResumeStudy(input, roleStudy, hrInsider);
  logInfo('V4Workflow', 'Phase2 resume_study done', {
    seniority_tier: resumeStudy.candidate_profile.seniority_tier,
    internal_signals: resumeStudy.internal_signals.length,
    obvious_gaps: resumeStudy.role_match_initial.obvious_gaps.length,
    surprising_strengths: resumeStudy.role_match_initial.surprising_strengths.length,
  });

  // 组装研究上下文，传给后续诊断 step
  const research: ResearchContext = {
    role_study: roleStudy,
    hr_insider: hrInsider,
    resume_study: resumeStudy,
  };

  // ════════════════════════════════════════════════════════════════
  // Phase 3: 诊断阶段（注入 ResearchContext）
  // ════════════════════════════════════════════════════════════════

  // Phase 3.1: BaseAnalyzer（吃 R2 core_caps + red_flags）
  workflowSteps.push('base_analyzer');
  const base = await runBaseAnalyzer(input, research);
  logInfo('V4Workflow', 'Phase3 base_analyzer done', {
    overall_grade: base.overall_grade,
    one_liner: base.one_line_verdict,
  });

  // Phase 3.2: 并行四路（每路注入对应研究子集）
  workflowSteps.push('parallel_analysis');
  const [hr, master, jdCoverage, credibility] = await Promise.all([
    runHrSimulator(input, base, research),
    runResumeMaster(input, base, research),
    runJdKeywordCoverage(input, research),
    runCredibilityCheck(input, base, research),
  ]);
  logInfo('V4Workflow', 'Phase3 parallel_analysis done', {
    hr_findings_6s: hr.six_second.findings.length,
    hr_findings_30s: hr.thirty_second.findings.length,
    master_section_advice: master.section_advice.length,
    jd_covered: jdCoverage !== null,
    credibility_flags: credibility.flags.length,
  });

  // Phase 3.3: SelfCritique（注入 R5 + R3 baseline）
  workflowSteps.push('self_critique');
  const selfCritique = await runSelfCritique(input, base, master, hr, research);
  logInfo('V4Workflow', 'Phase3 self_critique done', {
    after_score: selfCritique.after_metrics.overall_score,
    decision: selfCritique.after_metrics.decision_estimate,
  });

  // Phase 3.4: FinalSynthesis（注入全部研究）
  workflowSteps.push('final_synthesis');
  const ruleBasedTitles = ruleBasedComments.map((c) => `[${c.section_label}] ${c.title}`);
  const finalSynthesis = await runFinalSynthesis(
    input,
    base,
    hr,
    master,
    credibility,
    jdCoverage,
    selfCritique,
    ruleBasedTitles,
    research
  );
  logInfo('V4Workflow', 'Phase3 final_synthesis done', {
    ai_comment_count: finalSynthesis.comments.length,
    scenario: finalSynthesis.scenario,
  });

  // ════════════════════════════════════════════════════════════════
  // Phase 4: assemble
  // ════════════════════════════════════════════════════════════════
  workflowSteps.push('assemble');
  const durationMs = Date.now() - startTime;
  const report = assembleDiagnoseReport({
    input,
    base,
    hr,
    credibility,
    jdCoverage,
    selfCritique,
    finalSynthesis,
    ruleBasedComments,
    workflowSteps,
    workflowDurationMs: durationMs,
    research,
  });

  logInfo('V4Workflow', 'workflow complete', {
    total_comments: ruleBasedComments.length + finalSynthesis.comments.length,
    overall_score: report.overall_score,
    duration_ms: durationMs,
  });

  return report;
}

/**
 * 调试 / 测试用：运行单步并返回完整中间结果（含研究阶段）
 */
export async function runV4Diagnose_debugMode(
  request: DiagnoseRequest
): Promise<{
  report: DiagnoseReport;
  intermediates: {
    input: NormalizedInput;
    research: ResearchContext;
    base: ReturnType<typeof runBaseAnalyzer> extends Promise<infer T> ? T : never;
    hr: ReturnType<typeof runHrSimulator> extends Promise<infer T> ? T : never;
    master: ReturnType<typeof runResumeMaster> extends Promise<infer T> ? T : never;
    jdCoverage: ReturnType<typeof runJdKeywordCoverage> extends Promise<infer T> ? T : never;
    credibility: ReturnType<typeof runCredibilityCheck> extends Promise<infer T> ? T : never;
    selfCritique: ReturnType<typeof runSelfCritique> extends Promise<infer T> ? T : never;
    finalSynthesis: ReturnType<typeof runFinalSynthesis> extends Promise<infer T> ? T : never;
  };
}> {
  const startTime = Date.now();
  const input = await normalizeInput(request);
  const ruleBasedComments = runMissingInfoProbe(input);

  const [roleStudy, hrInsider] = await Promise.all([
    runRoleStudy(input),
    runHrInsider(input),
  ]);
  const resumeStudy = await runResumeStudy(input, roleStudy, hrInsider);
  const research: ResearchContext = {
    role_study: roleStudy,
    hr_insider: hrInsider,
    resume_study: resumeStudy,
  };

  const base = await runBaseAnalyzer(input, research);
  const [hr, master, jdCoverage, credibility] = await Promise.all([
    runHrSimulator(input, base, research),
    runResumeMaster(input, base, research),
    runJdKeywordCoverage(input, research),
    runCredibilityCheck(input, base, research),
  ]);
  const selfCritique = await runSelfCritique(input, base, master, hr, research);

  const ruleBasedTitles = ruleBasedComments.map((c) => `[${c.section_label}] ${c.title}`);
  const finalSynthesis = await runFinalSynthesis(
    input,
    base,
    hr,
    master,
    credibility,
    jdCoverage,
    selfCritique,
    ruleBasedTitles,
    research
  );

  const report = assembleDiagnoseReport({
    input,
    base,
    hr,
    credibility,
    jdCoverage,
    selfCritique,
    finalSynthesis,
    ruleBasedComments,
    workflowSteps: ['normalize', 'missing', 'phase1_research', 'phase2_resume_study', 'base', 'parallel', 'self_critique', 'final', 'assemble'],
    workflowDurationMs: Date.now() - startTime,
    research,
  });

  return {
    report,
    intermediates: { input, research, base, hr, master, jdCoverage, credibility, selfCritique, finalSynthesis },
  };
}
