/**
 * CommentCard — 单条 V4Comment 卡片
 *
 * 显示：
 * - 段落标签 + 维度标签 + 严重度
 * - 标题 + one_liner
 * - why_it_hurts
 * - evidence_quote (引用块)
 * - rewrite (before/after) 如有
 * - impact_on / fix_type / insider_view / credibility_concern
 */
'use client';

import { useState } from 'react';
import type { V4Comment } from '@/lib/diagnose/types';
import {
  DIMENSION_META,
  STATUS_META,
  SEVERITY_META,
  FIX_TYPE_META,
  IMPACT_META,
  CRED_CONCERN_META,
  clsx,
} from './shared';

interface CommentCardProps {
  comment: V4Comment;
  /** 隐藏哪些字段（避免重复展示） */
  hideSection?: boolean;
  hideDimension?: boolean;
  /** 默认展开 / 收起 */
  defaultExpanded?: boolean;
}

export default function CommentCard({
  comment: c,
  hideSection = false,
  hideDimension = false,
  defaultExpanded = false,
}: CommentCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const dimMeta = DIMENSION_META[c.dimension];
  const statusMeta = STATUS_META[c.status];
  const severityMeta = SEVERITY_META[c.severity];
  const fixMeta = FIX_TYPE_META[c.fix_type];
  const credMeta = c.credibility_concern ? CRED_CONCERN_META[c.credibility_concern] : null;

  return (
    <article className={clsx(
      'rounded-lg border bg-white transition-shadow hover:shadow-sm',
      statusMeta.borderColor
    )}>
      {/* Header */}
      <header className={clsx('flex items-start gap-2 px-3 py-2.5 border-l-4', statusMeta.bgColor, statusMeta.borderColor)}>
        <div className="flex-1 min-w-0">
          <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {!hideSection && (
              <span className="rounded-md bg-white/60 px-1.5 py-0.5 font-medium text-neutral-700">
                {c.section_label}
              </span>
            )}
            {!hideDimension && (
              <span className={clsx('rounded-md bg-white/60 px-1.5 py-0.5 font-medium', dimMeta.textColor)}>
                {dimMeta.shortLabel}
              </span>
            )}
            <span className={clsx(
              'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
              severityMeta.borderColor,
              severityMeta.textColor
            )}>
              {severityMeta.label}
            </span>
            <span className={clsx('text-[11px]', fixMeta.textColor)}>
              {fixMeta.label}
            </span>
            {credMeta && (
              <span className="rounded-md border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                {credMeta.label}
              </span>
            )}
          </div>

          <h4 className="text-sm font-semibold text-neutral-800 leading-snug">
            {c.title}
          </h4>
          <p className="text-xs text-neutral-700 mt-0.5">{c.one_liner}</p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded p-1 text-neutral-400 hover:bg-white/60 hover:text-neutral-600"
          aria-label={expanded ? '折叠' : '展开'}
        >
          <svg
            className={clsx('h-4 w-4 transition-transform', expanded && 'rotate-180')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </header>

      {expanded && (
        <div className="space-y-3 border-t border-neutral-100 px-3 py-3 text-sm">
          {/* why_it_hurts */}
          {c.why_it_hurts && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400">
                为什么扣分
              </div>
              <p className="text-neutral-700 leading-relaxed">{c.why_it_hurts}</p>
            </div>
          )}

          {/* evidence_quote */}
          {c.evidence_quote && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400">
                简历原句
              </div>
              <blockquote className="rounded-md border-l-4 border-neutral-300 bg-neutral-50 px-3 py-2 text-xs italic text-neutral-700">
                “{c.evidence_quote}”
              </blockquote>
            </div>
          )}

          {/* rewrite */}
          {c.rewrite && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400">
                改写示范
              </div>
              <div className="space-y-2">
                <div className="rounded-md border border-red-200 bg-red-50/60 px-3 py-2 text-xs">
                  <div className="mb-1 text-[10px] font-bold uppercase text-red-700">改前</div>
                  <p className="text-neutral-800">{c.rewrite.before}</p>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs">
                  <div className="mb-1 text-[10px] font-bold uppercase text-emerald-700">改后</div>
                  <p className="text-neutral-800">{c.rewrite.after}</p>
                </div>
                <p className="text-[11px] text-neutral-500">
                  <strong>改了什么：</strong>{c.rewrite.what_changed}
                </p>
              </div>
            </div>
          )}

          {/* impact / insider */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
            {c.impact_on.length > 0 && (
              <span className="flex flex-wrap items-center gap-1">
                <span className="font-medium uppercase tracking-widest">影响</span>
                {c.impact_on.map((i) => (
                  <span key={i} className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[10px]">
                    {IMPACT_META[i].label}
                  </span>
                ))}
              </span>
            )}
            {c.insider_view && (
              <span className="text-neutral-600">
                <strong>HR 视角：</strong>{c.insider_view}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
