"use client";

import { useState } from "react";
import AppTopNav from "@/components/offerpilot/AppTopNav";
import type { FreeDiagnoseResponse, DeepProblem } from "@/lib/diagnose/types";

type DiagnoseReport = FreeDiagnoseResponse;

interface ProblemPoolData {
  must_fix?: DeepProblem[];
  should_fix?: DeepProblem[];
  optional_optimize?: DeepProblem[];
  nitpicky?: DeepProblem[];
}

interface DeepDiagnoseResultProps {
  report: DiagnoseReport;
  reportId?: string;
}

export default function DeepDiagnoseResult({ report }: DeepDiagnoseResultProps) {
  if (!report.deep_report) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-800">
        <AppTopNav current="result" />
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6">
            <h2 className="text-lg font-normal text-red-800">深度诊断报告数据不完整</h2>
            <p className="mt-2 text-sm text-red-600">
              深度诊断报告生成失败或数据缺失。请返回并尝试基础诊断模式。
            </p>
            <div className="mt-4">
              <a href="/diagnose" className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-normal text-white hover:bg-primary-dark">
                返回诊断页面
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const deepReport = report.deep_report;
  const basicSummary = report.basic_summary;
  const metadata = report.metadata || {};

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-800">
      <AppTopNav current="result" />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {/* ═══ 第一屏：3 个最重要区域 ═══ */}

        {/* ── 区域 1: 深度新增价值 ── */}
        <div className="mb-6 rounded-lg border border-primary-light bg-primary-light/5 p-6">
          <h2 className="text-lg font-normal tracking-tight text-primary-dark">深度诊断新增价值</h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">{deepReport.deep_value_summary ?? '深度诊断价值总结未生成'}</p>
          {basicSummary && (
            <div className="mt-4 rounded-lg bg-white/60 p-4">
              <p className="text-xs font-normal text-neutral-600">
                基础诊断已指出 {basicSummary.core_issues_count} 个问题：{basicSummary.core_issues_titles.slice(0, 3).join('、')}
                {basicSummary.core_issues_count > 3 && '...'}
              </p>
            </div>
          )}
        </div>

        {/* ── 区域 2: 今日先改这 3 件事 ── */}
        {deepReport.action_plan?.immediate_actions && deepReport.action_plan.immediate_actions.length > 0 && (
          <div className="mb-6 rounded-lg border border-primary-light bg-gradient-to-b from-primary-light/5 to-white p-6">
            <h2 className="text-lg font-normal tracking-tight text-primary-dark">今日先改这 {Math.min(deepReport.action_plan.immediate_actions.length, 3)} 件事</h2>
            <div className="mt-4 space-y-2">
              {deepReport.action_plan.immediate_actions.slice(0, 3).map((action, idx) => (
                <div key={idx} className="flex items-start gap-3 rounded-lg bg-white/60 px-4 py-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{idx + 1}</span>
                  <span className="text-sm leading-relaxed text-neutral-800">{action}</span>
                </div>
              ))}
            </div>
            {/* Light action button */}
            <div className="mt-4 pt-4 border-t border-primary-light/20">
              <button
                type="button"
                onClick={() => window.location.href = '/diagnose'}
                className="inline-flex items-center gap-2 rounded-lg border border-primary-light bg-white px-4 py-2 text-sm font-medium text-primary-dark transition hover:bg-primary-light/10"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                回到原文开始改
              </button>
            </div>
          </div>
        )}

        {/* ── 区域 3: 最高优先问题（must_fix 前 3 项） ── */}
        {deepReport.problem_pool?.must_fix && deepReport.problem_pool.must_fix.length > 0 && (
          <div className="mb-6 rounded-lg border border-neutral-100 bg-white p-6">
            <h3 className="text-lg font-normal tracking-tight text-neutral-800">最高优先问题</h3>
            <p className="mt-1 text-xs text-neutral-500">以下问题建议优先处理，对投递影响最大</p>
            <div className="mt-4 space-y-2">
              {deepReport.problem_pool.must_fix.slice(0, 3).map((problem, idx) => (
                <div key={idx} className="rounded-lg border border-red-100 bg-red-50/30 p-4">
                  <div className="flex items-start justify-between">
                    <h4 className="text-sm font-normal text-neutral-800">{problem.title}</h4>
                    <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">必改</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-neutral-600">{problem.why_it_hurts}</p>
                </div>
              ))}
              {deepReport.problem_pool.must_fix.length > 3 && (
                <p className="mt-2 text-xs text-neutral-500">
                  共 {deepReport.problem_pool.must_fix.length} 个必改项，完整问题池见下方
                </p>
              )}
            </div>
          </div>
        )}

        {/* ═══ 以下区域按新顺序排列 ═══ */}

        {/* ── 改写包（前移） ── */}
        {deepReport.rewrite_pack && deepReport.rewrite_pack.length > 0 && (
          <div className="mb-6 rounded-lg border border-neutral-100 bg-white p-6">
            <h3 className="text-lg font-normal tracking-tight text-neutral-800">可直接替换改写包</h3>
            <div className="mt-4 space-y-3">
              {deepReport.rewrite_pack.slice(0, 8).map((ex, idx) => (
                <div key={idx} className="rounded-lg border border-neutral-100 bg-white p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-normal text-neutral-500 mb-1">原文</p>
                      <p className="text-sm leading-relaxed text-neutral-600 whitespace-pre-line">{ex.original}</p>
                    </div>
                    <div>
                      <p className="text-xs font-normal text-primary mb-1">改写后</p>
                      <p className="text-sm leading-relaxed text-neutral-800 whitespace-pre-line">{ex.rewritten}</p>
                    </div>
                  </div>
                  {ex.change_summary && (
                    <div className="mt-3 pt-3 border-t border-neutral-100">
                      <p className="text-xs font-normal text-neutral-600">{ex.change_summary}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 指标看板 ── */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <MetricCard
            title="ATS匹配率"
            before={deepReport.current_vs_after_metrics?.ats_match_rate?.before ?? '未知'}
            after={deepReport.current_vs_after_metrics?.ats_match_rate?.after ?? '未知'}
            description="关键词匹配度提升"
          />
          <MetricCard
            title="HR 6秒通过率"
            before={deepReport.current_vs_after_metrics?.hr_6s_pass_rate?.before ?? '未知'}
            after={deepReport.current_vs_after_metrics?.hr_6s_pass_rate?.after ?? '未知'}
            description="初筛通过概率提升"
          />
          <MetricCard
            title="面试风险"
            before={deepReport.current_vs_after_metrics?.interview_risk?.before ?? '未知'}
            after={deepReport.current_vs_after_metrics?.interview_risk?.after ?? '未知'}
            description="面试暴露风险降低"
          />
        </div>

        {/* ── 头部元信息卡片：风险等级 4 态 ── */}
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-primary-light bg-primary-light/3 p-5">
            <p className="text-xs font-normal text-primary-dark uppercase tracking-wider">诊断模式</p>
            <p className="mt-2 text-lg font-normal text-neutral-800">{metadata.diagnose_mode === 'deep' ? '深度诊断' : '基础诊断'}</p>
            {metadata.deep_diagnosis && (
              <p className="mt-1 text-xs text-neutral-500">基于基础报告增强分析</p>
            )}
            {!metadata.deep_diagnosis && metadata.diagnose_mode === 'deep' && (
              <p className="mt-1 text-xs text-amber-600">深度诊断暂时不可用</p>
            )}
          </div>

          <div className="rounded-lg border border-neutral-100 bg-white p-5">
            <p className="text-xs font-normal text-neutral-600 uppercase tracking-wider">ATS风险等级</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-normal ${
                metadata.ats_risk_level === 'high' ? 'bg-red-100 text-red-700' :
                metadata.ats_risk_level === 'medium' ? 'bg-orange-100 text-orange-700' :
                metadata.ats_risk_level === 'low' ? 'bg-green-100 text-green-700' :
                'bg-neutral-100 text-neutral-500'
              }`}>
                {metadata.ats_risk_level === 'high' ? '高风险' : metadata.ats_risk_level === 'medium' ? '中风险' : metadata.ats_risk_level === 'low' ? '低风险' : '未判定 / 待生成'}
              </span>
              <p className="text-sm text-neutral-600">{deepReport.ats_analysis?.match_rate_estimate ?? '未知'}</p>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-100 bg-white p-5">
            <p className="text-xs font-normal text-neutral-600 uppercase tracking-wider">HR风险等级</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-normal ${
                metadata.hr_risk_level === 'high' ? 'bg-red-100 text-red-700' :
                metadata.hr_risk_level === 'medium' ? 'bg-orange-100 text-orange-700' :
                metadata.hr_risk_level === 'low' ? 'bg-green-100 text-green-700' :
                'bg-neutral-100 text-neutral-500'
              }`}>
                {metadata.hr_risk_level === 'high' ? '高风险' : metadata.hr_risk_level === 'medium' ? '中风险' : metadata.hr_risk_level === 'low' ? '低风险' : '未判定 / 待生成'}
              </span>
              <p className="text-sm text-neutral-600">{deepReport.hr_analysis?.decision_estimate === 'pass' ? '直接通过' :
                deepReport.hr_analysis?.decision_estimate === 'interview' ? '进入面试' : deepReport.hr_analysis?.decision_estimate === 'hold' ? '暂缓考虑' : '未知'}</p>
            </div>
          </div>
        </div>

        {/* ── 风险分析 ── */}
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <RiskCard
            title="ATS风险分析"
            level={deepReport.ats_analysis?.risk_level}
            items={deepReport.ats_analysis?.keyword_gaps || []}
            formatRisks={deepReport.ats_analysis?.format_risks}
          />
          <RiskCard
            title="HR风险分析"
            level={deepReport.hr_analysis?.risk_level}
            items={deepReport.hr_analysis?.six_second_risks || []}
            secondaryItems={deepReport.hr_analysis?.thirty_second_risks}
            decisionEstimate={deepReport.hr_analysis?.decision_estimate}
          />
          <InterviewRiskCard
            title="面试风险分析"
            likelyQuestions={deepReport.interview_risk_analysis?.likely_questions || []}
            weakPoints={deepReport.interview_risk_analysis?.weak_points || []}
            preparationSuggestions={deepReport.interview_risk_analysis?.preparation_suggestions || []}
          />
        </div>

        {/* ── 影响预测 ── */}
        {deepReport.impact_projection && (
          <div className="mb-6 rounded-lg border border-neutral-100 bg-white p-6">
            <h3 className="text-lg font-normal tracking-tight text-neutral-800">优化后影响预测</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4">
                <p className="text-xs font-normal text-neutral-600">分数提升估计</p>
                <p className="mt-1 text-base font-normal text-neutral-800">{deepReport.impact_projection?.score_improvement_estimate ?? '未知'}</p>
              </div>
              <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4">
                <p className="text-xs font-normal text-neutral-600">ATS通过概率</p>
                <p className="mt-1 text-base font-normal text-neutral-800">{deepReport.impact_projection?.ats_pass_probability ?? '未知'}</p>
              </div>
              <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4">
                <p className="text-xs font-normal text-neutral-600">HR通过概率</p>
                <p className="mt-1 text-base font-normal text-neutral-800">{deepReport.impact_projection?.hr_pass_probability ?? '未知'}</p>
              </div>
              <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4">
                <p className="text-xs font-normal text-neutral-600">面试获得概率</p>
                <p className="mt-1 text-base font-normal text-neutral-800">{deepReport.impact_projection?.interview_probability ?? '未知'}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── 全量问题池（must_fix 展开，其余折叠摘要） ── */}
        <div className="mb-6 rounded-lg border border-neutral-100 bg-white p-6">
          <h3 className="text-lg font-normal tracking-tight text-neutral-800">全量问题池</h3>
          <ProblemPool pool={deepReport.problem_pool} />
        </div>

        {/* ── 内容扩展计划 ── */}
        {deepReport.content_expansion_plan && (
          <div className="mb-6 rounded-lg border border-neutral-100 bg-white p-6">
            <h3 className="text-lg font-normal tracking-tight text-neutral-800">内容扩展计划</h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-green-100 bg-green-50/30 p-4">
                <p className="text-xs font-normal text-green-800 mb-2">安全扩展建议</p>
                <div className="space-y-2">
                  {deepReport.content_expansion_plan.safe_expand?.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="text-sm leading-relaxed">
                      <p className="font-normal text-neutral-800">{item.location}</p>
                      <p className="text-neutral-600">{item.suggestion}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-amber-100 bg-amber-50/30 p-4">
                <p className="text-xs font-normal text-amber-800 mb-2">需用户补充信息</p>
                <div className="space-y-2">
                  {deepReport.content_expansion_plan.needs_user_input?.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="text-sm leading-relaxed">
                      <p className="font-normal text-neutral-800">{item.location}</p>
                      <p className="text-neutral-600">{item.question}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4">
                <p className="text-xs font-normal text-neutral-800 mb-2">禁止虚构内容</p>
                <div className="space-y-1">
                  {deepReport.content_expansion_plan.forbidden_to_invent?.slice(0, 3).map((item, idx) => (
                    <p key={idx} className="text-sm text-neutral-600">{item}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 行动清单 ── */}
        <div className="rounded-lg border border-neutral-100 bg-white p-6">
          <h3 className="text-lg font-normal tracking-tight text-neutral-800">行动清单</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="space-y-3">
              <p className="text-sm font-normal text-primary-dark">立即行动</p>
              <div className="space-y-2">
                {deepReport.action_plan?.immediate_actions?.map((action, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span className="text-sm text-neutral-700">{action}</span>
                  </div>
                ))}
              </div>
            </div>

            {deepReport.action_plan?.requires_user_input?.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-normal text-amber-800">需用户输入</p>
                <div className="space-y-2">
                  {deepReport.action_plan?.requires_user_input?.map((action, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-amber-600 mt-1">•</span>
                      <span className="text-sm text-neutral-700">{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deepReport.action_plan?.optional_improvements?.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-normal text-neutral-600">可选优化</p>
                <div className="space-y-2">
                  {deepReport.action_plan?.optional_improvements?.map((action, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-neutral-400 mt-1">•</span>
                      <span className="text-sm text-neutral-600">{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 安全标志 ── */}
        {metadata.enrichment_safety_flags && metadata.enrichment_safety_flags.length > 0 && (
          <div className="mt-6 rounded-lg border border-neutral-100 bg-neutral-50/50 p-5">
            <p className="text-xs font-normal text-neutral-600 uppercase tracking-wider">内容安全标志</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {metadata.enrichment_safety_flags.map((flag, idx) => (
                <span key={idx} className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-xs text-neutral-500 border border-neutral-200">
                  {flag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── 主要闭环动作区 ── */}
        <div className="mt-8 rounded-lg border border-primary-light bg-gradient-to-b from-primary-light/5 to-white p-6">
          <h3 className="text-lg font-normal tracking-tight text-primary-dark mb-4">下一步行动</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => window.location.href = '/diagnose'}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary-dark"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              返回诊断页继续修改
            </button>
            <button
              type="button"
              onClick={() => window.location.href = '/diagnose'}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-5 py-3 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              重新诊断一份简历
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ title, before, after, description }: { title: string; before: string; after: string; description?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs font-normal text-neutral-600">{title}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm text-neutral-500">{before}</span>
        <span className="text-primary">→</span>
        <span className="text-base font-normal text-primary">{after}</span>
      </div>
      {description && <p className="mt-1 text-xs text-neutral-500">{description}</p>}
    </div>
  );
}

function ProblemPool({ pool }: { pool: ProblemPoolData | null }) {
  if (!pool) {
    return <div className="mt-4 text-sm text-neutral-500">问题池数据未生成</div>;
  }

  const mustFix = pool.must_fix ?? [];
  const shouldFix = pool.should_fix ?? [];
  const optional = pool.optional_optimize ?? [];
  const nitpicky = pool.nitpicky ?? [];

  return (
    <div className="mt-4 space-y-3">
      {/* must_fix: always expanded */}
      {mustFix.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-700 mb-2">必改 ({mustFix.length})</p>
          <div className="space-y-2">
            {mustFix.map((p: DeepProblem, idx: number) => (
              <div key={`mf-${idx}`} className="rounded-lg border border-red-100 bg-red-50/20 p-3">
                <div className="flex items-start justify-between">
                  <h4 className="text-sm font-normal text-neutral-800">{p.title}</h4>
                  <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">必改</span>
                </div>
                <p className="mt-1 text-xs text-neutral-600">{p.why_it_hurts}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* should_fix: collapsible summary */}
      {shouldFix.length > 0 && (
        <CollapsibleSection title={`应改 (${shouldFix.length})`} color="orange">
          {shouldFix.slice(0, 5).map((p: DeepProblem, idx: number) => (
            <div key={`sf-${idx}`} className="rounded-lg border border-orange-100 bg-orange-50/20 p-3">
              <div className="flex items-start justify-between">
                <h4 className="text-sm font-normal text-neutral-800">{p.title}</h4>
                <span className="shrink-0 rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">应改</span>
              </div>
              <p className="mt-1 text-xs text-neutral-600">{p.why_it_hurts}</p>
            </div>
          ))}
          {shouldFix.length > 5 && <p className="text-xs text-neutral-400 mt-1">仅显示前 5 项</p>}
        </CollapsibleSection>
      )}

      {/* optional: collapsible summary */}
      {optional.length > 0 && (
        <CollapsibleSection title={`可选 (${optional.length})`} color="blue">
          {optional.slice(0, 3).map((p: DeepProblem, idx: number) => (
            <div key={`op-${idx}`} className="rounded-lg border border-blue-100 bg-blue-50/20 p-3">
              <div className="flex items-start justify-between">
                <h4 className="text-sm font-normal text-neutral-800">{p.title}</h4>
                <span className="shrink-0 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">可选</span>
              </div>
              <p className="mt-1 text-xs text-neutral-600">{p.why_it_hurts}</p>
            </div>
          ))}
          {optional.length > 3 && <p className="text-xs text-neutral-400 mt-1">仅显示前 3 项</p>}
        </CollapsibleSection>
      )}

      {/* nitpicky: collapsed summary */}
      {nitpicky.length > 0 && (
        <CollapsibleSection title={`细节 (${nitpicky.length})`} color="neutral">
          <ul className="space-y-1">
            {nitpicky.slice(0, 3).map((p: DeepProblem, idx: number) => (
              <li key={`np-${idx}`} className="text-xs text-neutral-500">
                • {p.title}
              </li>
            ))}
          </ul>
          {nitpicky.length > 3 && <p className="text-xs text-neutral-400 mt-1">仅显示前 3 项</p>}
        </CollapsibleSection>
      )}

      {mustFix.length === 0 && shouldFix.length === 0 && optional.length === 0 && nitpicky.length === 0 && (
        <p className="text-sm text-neutral-500">问题池为空</p>
      )}
    </div>
  );
}

function CollapsibleSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const colorMap: Record<string, string> = {
    orange: 'text-orange-700 hover:text-orange-800',
    blue: 'text-blue-700 hover:text-blue-800',
    neutral: 'text-neutral-600 hover:text-neutral-700',
  };
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${colorMap[color] || 'text-neutral-600'}`}
      >
        <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {title}
      </button>
      {open && <div className="space-y-2 mt-2">{children}</div>}
    </div>
  );
}

function RiskCard({
  title,
  level,
  items,
  formatRisks,
  secondaryItems,
  decisionEstimate
}: {
  title: string;
  level: string;
  items: string[];
  formatRisks?: string[];
  secondaryItems?: string[];
  decisionEstimate?: 'pass' | 'interview' | 'hold';
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-normal text-neutral-800">{title}</h4>
        <span className={`text-xs px-2 py-0.5 rounded ${
          level === 'high' ? 'bg-red-100 text-red-700' :
          level === 'medium' ? 'bg-orange-100 text-orange-700' :
          level === 'low' ? 'bg-green-100 text-green-700' :
          'bg-neutral-100 text-neutral-500'
        }`}>
          {level === 'high' ? '高' : level === 'medium' ? '中' : level === 'low' ? '低' : level ? '未知' : '未判定'}
        </span>
      </div>

      {decisionEstimate && (
        <div className="mt-2 inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs text-neutral-600">
          {decisionEstimate === 'pass' ? '直接通过' :
           decisionEstimate === 'interview' ? '进入面试' : '暂缓考虑'}
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {items.slice(0, 3).map((item, idx) => (
          <li key={idx} className="text-xs text-neutral-600 flex items-start gap-1.5">
            <span className="text-primary mt-0.5">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {formatRisks && formatRisks.length > 0 && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <p className="text-xs font-normal text-neutral-500 mb-1">格式风险</p>
          <ul className="space-y-0.5">
            {formatRisks.slice(0, 2).map((risk, idx) => (
              <li key={idx} className="text-xs text-neutral-600">• {risk}</li>
            ))}
          </ul>
        </div>
      )}

      {secondaryItems && secondaryItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <p className="text-xs font-normal text-neutral-500 mb-1">30秒细看风险</p>
          <ul className="space-y-0.5">
            {secondaryItems.slice(0, 2).map((item, idx) => (
              <li key={idx} className="text-xs text-neutral-600">• {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InterviewRiskCard({
  title,
  likelyQuestions,
  weakPoints,
  preparationSuggestions
}: {
  title: string;
  likelyQuestions: string[];
  weakPoints: string[];
  preparationSuggestions: string[];
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-normal text-neutral-800">{title}</h4>
        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">
          中等
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <p className="text-xs font-normal text-neutral-500 mb-1">面试可能问题</p>
          <ul className="space-y-1">
            {likelyQuestions.slice(0, 3).map((question, idx) => (
              <li key={idx} className="text-xs text-neutral-600 flex items-start gap-1.5">
                <span className="text-amber-600 mt-0.5">•</span>
                <span>{question}</span>
              </li>
            ))}
          </ul>
        </div>

        {weakPoints.length > 0 && (
          <div className="pt-3 border-t border-neutral-100">
            <p className="text-xs font-normal text-neutral-500 mb-1">薄弱环节</p>
            <ul className="space-y-0.5">
              {weakPoints.slice(0, 2).map((point, idx) => (
                <li key={idx} className="text-xs text-neutral-600">• {point}</li>
              ))}
            </ul>
          </div>
        )}

        {preparationSuggestions.length > 0 && (
          <div className="pt-3 border-t border-neutral-100">
            <p className="text-xs font-normal text-green-600 mb-1">准备建议</p>
            <ul className="space-y-0.5">
              {preparationSuggestions.slice(0, 2).map((suggestion, idx) => (
                <li key={idx} className="text-xs text-neutral-600">• {suggestion}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
