/**
 * ScoreBreakdown — 顶部总评 + 6 维度评分横条
 */
import type { DiagnoseReport, V4Dimension } from '@/lib/diagnose/types';
import { DIMENSION_META, getGradeBadgeClasses, gradeLabel, clsx } from './shared';

interface ScoreBreakdownProps {
  report: DiagnoseReport;
}

const DIM_ORDER: V4Dimension[] = [
  'structure',
  'expression',
  'evidence',
  'role_fit',
  'credibility',
  'missing_info',
];

type ScoreTier = 'excellent' | 'good' | 'warn' | 'bad';

function scoreTier(score: number): ScoreTier {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 55) return 'warn';
  return 'bad';
}

const SCORE_BAR_COLOR: Record<ScoreTier, string> = {
  excellent: 'bg-emerald-500',
  good: 'bg-sky-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
};

const SCORE_TEXT_COLOR: Record<ScoreTier, string> = {
  excellent: 'text-emerald-600',
  good: 'text-sky-600',
  warn: 'text-amber-600',
  bad: 'text-red-600',
};

const DEFAULT_DETAIL = { score: 0, weight: 0, sub_scores: [], notes: '（数据缺失）' };

export default function ScoreBreakdown({ report }: ScoreBreakdownProps) {
  const overall_score = report.overall_score ?? 0;
  const overall_grade = report.overall_grade ?? 'C';
  const total_assessment = report.total_assessment ?? '（总评数据缺失）';
  const score_breakdown = report.score_breakdown ?? ({} as DiagnoseReport['score_breakdown']);
  const metadata = report.metadata ?? ({} as DiagnoseReport['metadata']);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      {/* Meta */}
      {metadata.has_jd && (
        <div className="mb-3">
          <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
            已结合 JD 比对
          </span>
        </div>
      )}

      {/* 总分 + 总评 */}
      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-start gap-2 md:items-center md:justify-center md:border-r md:border-neutral-200 md:pr-6">
          <div className="flex items-baseline gap-1">
            <span className={clsx('text-5xl font-bold', SCORE_TEXT_COLOR[scoreTier(overall_score)])}>
              {overall_score}
            </span>
            <span className="text-lg text-neutral-400">/100</span>
          </div>
          <span className={clsx(
            'rounded-full border px-3 py-0.5 text-xs font-semibold',
            getGradeBadgeClasses(overall_grade)
          )}>
            {gradeLabel(overall_grade)}
          </span>
        </div>

        <div className="md:pl-2">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-widest text-neutral-500">
            总评
          </h3>
          <p className="text-sm leading-relaxed text-neutral-800">{total_assessment}</p>
        </div>
      </div>

      {/* 6 维度横条 */}
      <div className="mt-6">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-neutral-500">
          6 维度评分
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          {DIM_ORDER.map((dim) => {
            const meta = DIMENSION_META[dim];
            const detail = score_breakdown[dim] ?? DEFAULT_DETAIL;
            const score = detail.score ?? 0;
            const weight = detail.weight ?? 0;
            return (
              <div key={dim} className="flex items-center gap-3">
                <div className={clsx('w-20 shrink-0 text-xs font-semibold', meta.textColor)}>
                  {meta.label}
                </div>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-neutral-100">
                  <div
                    className={clsx('h-full transition-all duration-500', SCORE_BAR_COLOR[scoreTier(score)])}
                    style={{ width: `${score}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-end pr-2 text-[10px] font-mono text-white mix-blend-difference">
                    {score}
                  </span>
                </div>
                <div className="w-10 shrink-0 text-right text-[10px] text-neutral-400">
                  {Math.round(weight * 100)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
