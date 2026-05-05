/**
 * CrossSectionSummary — 跨段汇总
 *
 * 包含 5 个子区块：
 * 1. 必改清单 (must_fix_top)
 * 2. 改写示例库 (rewrite_examples)
 * 3. 三档风险（ATS / HR / 面试）
 * 4. 可信度警示 (credibility_flags)
 * 5. JD 关键词矩阵 (jd_keyword_matrix)
 */
'use client';

import type { V4CrossSectionSummary, V4CredibilityFlag, V4JdKeywordCoverage } from '@/lib/diagnose/types';
import CommentCard from './CommentCard';
import { CRED_CONCERN_META, getRiskBadgeClasses, RISK_LEVEL_LABEL, clsx } from './shared';

interface CrossSectionSummaryProps {
  summary?: V4CrossSectionSummary;
}

const EMPTY_RISK = { level: 'medium' as const, reasons: ['（数据缺失）'] };

export default function CrossSectionSummary({ summary }: CrossSectionSummaryProps) {
  if (!summary) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        跨段汇总数据缺失，请重新诊断
      </section>
    );
  }

  // 防御性兜底：每个子区块都可能因为旧数据 / AI 失败而缺
  const risks = summary.risks ?? {
    ats_risk: EMPTY_RISK,
    hr_risk: EMPTY_RISK,
    interview_risk: EMPTY_RISK,
  };
  const mustFixTop = summary.must_fix_top ?? [];
  const rewriteExamples = summary.rewrite_examples ?? [];
  const credibilityFlags = summary.credibility_flags ?? [];

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-neutral-800">综合分析</h2>
      <RisksPanel risks={risks} />
      <MustFixList comments={mustFixTop} />
      <RewriteExamplesPanel comments={rewriteExamples} />
      {summary.jd_keyword_matrix && <JdMatrixPanel coverage={summary.jd_keyword_matrix} />}
      <CredibilityFlagsPanel flags={credibilityFlags} />
    </section>
  );
}

// ════════════════════════════════════════════════════════════════
// 1. 三档风险
// ════════════════════════════════════════════════════════════════

interface RisksPanelProps {
  risks: V4CrossSectionSummary['risks'];
}

function RisksPanel({ risks }: RisksPanelProps) {
  const ats = risks.ats_risk ?? EMPTY_RISK;
  const hr = risks.hr_risk ?? EMPTY_RISK;
  const interview = risks.interview_risk ?? EMPTY_RISK;
  const cards: Array<{ label: string; level: 'low' | 'medium' | 'high'; reasons: string[] }> = [
    { label: 'ATS 风险', level: ats.level, reasons: ats.reasons ?? [] },
    { label: 'HR 风险', level: hr.level, reasons: hr.reasons ?? [] },
    { label: '面试风险', level: interview.level, reasons: interview.reasons ?? [] },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-neutral-700">三档风险预估</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={clsx('rounded-lg border p-3 text-sm', getRiskBadgeClasses(c.level))}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{c.label}</span>
              <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold">
                {RISK_LEVEL_LABEL[c.level]}
              </span>
            </div>
            <ul className="space-y-1 text-xs">
              {c.reasons.length === 0 ? (
                <li className="text-neutral-500">（无具体原因）</li>
              ) : (
                c.reasons.map((r, i) => (
                  <li key={i} className="leading-snug">· {r}</li>
                ))
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 2. 必改清单
// ════════════════════════════════════════════════════════════════

interface MustFixListProps {
  comments: V4CrossSectionSummary['must_fix_top'];
}

function MustFixList({ comments }: MustFixListProps) {
  if (comments.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        没有必改级别的问题
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-red-700">必改清单 ({comments.length})</h3>
        <span className="text-[11px] text-neutral-500">按段落 / 维度交叉影响排序</span>
      </div>
      <div className="space-y-2">
        {comments.map((c) => (
          <CommentCard key={c.id} comment={c} defaultExpanded={false} />
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 3. 改写示例库
// ════════════════════════════════════════════════════════════════

interface RewriteExamplesPanelProps {
  comments: V4CrossSectionSummary['rewrite_examples'];
}

function RewriteExamplesPanel({ comments }: RewriteExamplesPanelProps) {
  if (comments.length === 0) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">改写示例库 ({comments.length})</h3>
        <span className="text-[11px] text-neutral-500">AI 改写建议</span>
      </div>
      <div className="space-y-2">
        {comments.map((c) => (
          <CommentCard key={c.id} comment={c} defaultExpanded={false} />
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 4. 可信度警示
// ════════════════════════════════════════════════════════════════

interface CredibilityFlagsPanelProps {
  flags: V4CredibilityFlag[];
}

function CredibilityFlagsPanel({ flags }: CredibilityFlagsPanelProps) {
  if (flags.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
        可信度审查未发现明显问题
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-rose-700">
        可信度警示 ({flags.length})
      </h3>
      <div className="space-y-2">
        {flags.map((f, idx) => {
          const meta = CRED_CONCERN_META[f.type];
          const sevColor =
            f.severity === 'high' ? 'border-red-300 bg-red-50' :
            f.severity === 'medium' ? 'border-amber-300 bg-amber-50' :
            'border-sky-300 bg-sky-50';
          return (
            <div key={idx} className={clsx('rounded-lg border p-3 text-sm', sevColor)}>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium">
                <span className="font-semibold">{meta.label}</span>
                <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold">
                  {RISK_LEVEL_LABEL[f.severity]}
                </span>
              </div>
              <p className="text-neutral-800 leading-snug">{f.description}</p>
              {f.evidence && (
                <blockquote className="mt-2 rounded border-l-2 border-neutral-300 bg-white/70 px-2 py-1 text-xs italic text-neutral-600">
                  “{f.evidence}”
                </blockquote>
              )}
              {f.question_for_candidate && (
                <p className="mt-2 text-[11px] text-neutral-600">
                  <strong>建议追问：</strong>{f.question_for_candidate}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 5. JD 关键词矩阵
// ════════════════════════════════════════════════════════════════

interface JdMatrixPanelProps {
  coverage: V4JdKeywordCoverage;
}

function JdMatrixPanel({ coverage }: JdMatrixPanelProps) {
  const { must_have, nice_to_have, missing_critical, coverage_rate } = coverage;
  const ratePercent = Math.round(coverage_rate * 100);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">JD 关键词矩阵</h3>
        <span className={clsx(
          'rounded-full border px-2 py-0.5 text-[11px] font-bold',
          ratePercent >= 80 ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
          ratePercent >= 60 ? 'border-amber-300 bg-amber-50 text-amber-700' :
          'border-red-300 bg-red-50 text-red-700'
        )}>
          覆盖率 {ratePercent}%
        </span>
      </div>

      {/* must_have */}
      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-red-700">
          必备 ({must_have.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {must_have.map((k) => (
            <span
              key={k.keyword}
              className={clsx(
                'rounded-md border px-2 py-0.5 text-xs',
                k.covered
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-red-400 bg-red-50 text-red-700 line-through opacity-90'
              )}
              title={k.section_hits.length > 0 ? `命中段落: ${k.section_hits.join(', ')}` : '未命中'}
            >
              {k.covered ? '·' : '×'} {k.keyword}
            </span>
          ))}
        </div>
      </div>

      {/* nice_to_have */}
      {nice_to_have.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-sky-700">
            加分 ({nice_to_have.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {nice_to_have.map((k) => (
              <span
                key={k.keyword}
                className={clsx(
                  'rounded-md border px-2 py-0.5 text-xs',
                  k.covered
                    ? 'border-sky-300 bg-sky-50 text-sky-700'
                    : 'border-neutral-300 bg-neutral-50 text-neutral-500'
                )}
                title={k.section_hits.length > 0 ? `命中段落: ${k.section_hits.join(', ')}` : '未命中'}
              >
                {k.covered ? '·' : '○'} {k.keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* missing_critical */}
      {missing_critical.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50/60 p-2 text-xs text-red-800">
          <strong>关键缺口 ({missing_critical.length}):</strong>
          <span className="ml-1">{missing_critical.join('、')}</span>
        </div>
      )}
    </div>
  );
}
