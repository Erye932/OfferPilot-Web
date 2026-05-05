/**
 * BeforeAfter — 改前/改后效果对比
 *
 * 4 行：overall_score / hr_6s_pass / ats_match / interview_risk
 * 每行：[before] → [after]，颜色对比
 */
import type { V4BeforeAfterMetrics } from '@/lib/diagnose/types';
import { getRiskBadgeClasses, RISK_LEVEL_LABEL, clsx } from './shared';

interface BeforeAfterProps {
  beforeAfter?: V4BeforeAfterMetrics;
}

const EMPTY_SCORE = { before: 0, after: 0 };
const EMPTY_TEXT = { before: '—', after: '—' };
const EMPTY_RISK_LEVEL = { before: 'medium' as const, after: 'medium' as const };

function ScoreCell({ value, isAfter }: { value: number; isAfter: boolean }) {
  let color = 'text-neutral-600';
  if (isAfter) {
    if (value >= 85) color = 'text-emerald-600';
    else if (value >= 70) color = 'text-sky-600';
    else if (value >= 55) color = 'text-amber-600';
    else color = 'text-red-600';
  } else {
    color = 'text-neutral-500';
  }
  return <span className={clsx('text-xl font-bold tabular-nums', color)}>{value}</span>;
}

export default function BeforeAfter({ beforeAfter }: BeforeAfterProps) {
  const overall_score = beforeAfter?.overall_score ?? EMPTY_SCORE;
  const hr_6s_pass = beforeAfter?.hr_6s_pass ?? EMPTY_TEXT;
  const ats_match = beforeAfter?.ats_match ?? EMPTY_TEXT;
  const interview_risk = beforeAfter?.interview_risk ?? EMPTY_RISK_LEVEL;
  const improvement_summary = beforeAfter?.improvement_summary ?? '（数据缺失）';

  const rows: Array<{ label: string; before: React.ReactNode; after: React.ReactNode }> = [
    {
      label: '总分',
      before: <ScoreCell value={overall_score.before} isAfter={false} />,
      after: <ScoreCell value={overall_score.after} isAfter={true} />,
    },
    {
      label: 'HR 6 秒',
      before: <span className="text-sm text-neutral-600">{hr_6s_pass.before}</span>,
      after: <span className="text-sm font-medium text-emerald-700">{hr_6s_pass.after}</span>,
    },
    {
      label: 'ATS 匹配',
      before: <span className="text-sm text-neutral-600">{ats_match.before}</span>,
      after: <span className="text-sm font-medium text-sky-700">{ats_match.after}</span>,
    },
    {
      label: '面试风险',
      before: (
        <span className={clsx(
          'rounded-full border px-2 py-0.5 text-[11px] font-medium',
          getRiskBadgeClasses(interview_risk.before)
        )}>
          {RISK_LEVEL_LABEL[interview_risk.before]}
        </span>
      ),
      after: (
        <span className={clsx(
          'rounded-full border px-2 py-0.5 text-[11px] font-medium',
          getRiskBadgeClasses(interview_risk.after)
        )}>
          {RISK_LEVEL_LABEL[interview_risk.after]}
        </span>
      ),
    },
  ];

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">改写后预期效果</h3>
        <span className="text-[11px] text-neutral-400">基于必改项改写</span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="text-[11px] font-medium uppercase tracking-widest text-neutral-400" />
        <div className="text-[11px] font-medium uppercase tracking-widest text-neutral-400">改前</div>
        <div className="text-[11px] font-medium uppercase tracking-widest text-neutral-400" />
        <div className="text-[11px] font-medium uppercase tracking-widest text-neutral-400">改后</div>
      </div>

      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-4 items-center gap-2 rounded-lg border border-neutral-100 bg-neutral-50/50 px-3 py-2"
          >
            <div className="text-xs font-medium text-neutral-500">{row.label}</div>
            <div className="text-center">{row.before}</div>
            <div className="text-center text-neutral-400">→</div>
            <div className="text-center">{row.after}</div>
          </div>
        ))}
      </div>

      <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-800">
        <strong>改进总结：</strong>
        {improvement_summary}
      </p>
    </section>
  );
}
