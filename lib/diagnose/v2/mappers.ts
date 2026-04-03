// 双 AI 结果映射器 - 映射回 FreeDiagnoseResponse
import type { FreeDiagnoseResponse, CoreIssue, RewriteExample, NormalizedInput } from '../types';
import type { FinalDualDiagnoseResult } from './schemas';

export function mapToFreeDiagnoseResponse(
  dualResult: FinalDualDiagnoseResult,
  input: NormalizedInput
): FreeDiagnoseResponse {
  // 映射 core_issues
  const coreIssues: CoreIssue[] = dualResult.core_issues.map((issue, idx) => ({
    title: issue.title,
    summary: issue.summary,
    evidence: issue.evidence,
    insider_view: `来源: ${issue.source === 'hr' ? 'HR视角' : issue.source === 'master' ? '重写专家' : '双AI共识'}${
      issue.incremental_value ? ` | 增量价值: ${issue.incremental_value}` : ''
    }`,
    suggestion: issue.suggestion,
    follow_up_question: '',
    priority: idx + 1,
    screening_impact: issue.screening_impact || issue.summary,
    is_structural: issue.is_structural || false,
    jd_relevance: issue.jd_relevance || 'medium',
    dimension: issue.dimension || 'other',
    rewrite_examples: issue.rewrite_example ? [{
      original: '',
      rewritten: issue.rewrite_example,
      change_summary: '深度诊断提供的改写示例',
    }] : undefined,
  }));

  // 映射 rewrite_examples
  const rewriteExamples: RewriteExample[] = dualResult.rewrite_examples.map(ex => ({
    original: ex.original,
    rewritten: ex.rewritten,
    change_summary: ex.change_summary,
  }));

  // 确定 scenario
  // 深度诊断模式不应被标记为 excellent，以免被基础 excellent 页面短路
  const isDeepMode = !!dualResult.deep_report || dualResult.basic_summary;
  const scenario = isDeepMode ? 'normal' : (dualResult.overall_score >= 85 ? 'excellent' : 'normal');

  return {
    scenario,
    main_judgment: dualResult.executive_summary,
    core_issues: coreIssues,
    core_issues_summary: {
      total_count: coreIssues.length,
      shown_count: coreIssues.length,
    },
    priority_actions: dualResult.next_actions.map(action => ({
      title: action,
      description: action,
    })),
    rewrite_direction: dualResult.key_conclusions.join('；'),
    minor_suggestions: [],
    rewrite_examples: rewriteExamples,
    follow_up_prompts: [],
    excellent_score: dualResult.overall_score,
    quality_tier: dualResult.overall_score >= 90 ? 'excellent' :
                  dualResult.overall_score >= 72 ? 'strong' :
                  dualResult.overall_score >= 50 ? 'medium' : 'weak',
    basic_summary: dualResult.basic_summary,
    deep_report: dualResult.deep_report,
    metadata: {
      target_role: input.target_role,
      has_jd: input.jd_quality !== 'none',
      generated_at: new Date().toISOString(),
      tier: input.tier,
      jd_quality: input.jd_quality,
      schema_version: '6.0-dual',
      diagnose_mode: dualResult.basic_summary ? 'deep' : 'basic',
      deep_diagnosis: !!dualResult.deep_report,
      based_on_basic_report: !!dualResult.basic_summary,
      deep_value_summary: dualResult.deep_value_summary,
      ats_risk_level: dualResult.ats_risk_level,
      hr_risk_level: dualResult.hr_risk_level,
      enrichment_safety_flags: dualResult.enrichment_safety_flags,
    },
  };
}
