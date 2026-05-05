/**
 * DimensionChapter — 按维度展示该维度下所有 comments
 *
 * 6 个章节，每个章节可折叠
 * 章节内 comments 按严重度降序
 */
'use client';

import { useState } from 'react';
import type { DiagnoseReport, V4Dimension } from '@/lib/diagnose/types';
import CommentCard from './CommentCard';
import { DIMENSION_META, clsx } from './shared';

interface DimensionChapterProps {
  report: DiagnoseReport;
  /** 默认全部展开还是收起 */
  defaultExpanded?: boolean;
}

const DIM_ORDER: V4Dimension[] = [
  'evidence',         // 量化证据 — 最重要先放前
  'role_fit',         // 岗位贴合
  'credibility',      // 可信度
  'expression',       // 表达
  'structure',        // 结构
  'missing_info',     // 缺失（最末）
];

export default function DimensionChapter({ report, defaultExpanded = false }: DimensionChapterProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-neutral-800 mb-2">按维度细查</h2>
      {DIM_ORDER.map((dim) => {
        const comments = report.comments_by_dimension?.[dim];
        if (!comments || comments.length === 0) return null;
        return (
          <ChapterBlock
            key={dim}
            dimension={dim}
            comments={comments}
            defaultExpanded={defaultExpanded}
          />
        );
      })}
    </section>
  );
}

interface ChapterBlockProps {
  dimension: V4Dimension;
  comments: DiagnoseReport['comments_by_dimension'][V4Dimension];
  defaultExpanded: boolean;
}

function ChapterBlock({ dimension, comments, defaultExpanded }: ChapterBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const meta = DIMENSION_META[dimension];

  // 统计严重度分布（仅计 UI 真实展示的三档）
  const sevCount = {
    must_fix: comments.filter((c) => c.severity === 'must_fix').length,
    should_fix: comments.filter((c) => c.severity === 'should_fix').length,
    optional: comments.filter((c) => c.severity === 'optional').length,
  };

  return (
    <div className={clsx('rounded-xl border bg-white shadow-sm', meta.borderColor)}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${expanded ? '折叠' : '展开'}${meta.label}章节`}
        className={clsx(
          'flex w-full items-center justify-between gap-3 rounded-t-xl px-5 py-3 text-left',
          meta.bgColor
        )}
      >
        <div className="flex items-center gap-3">
          <h3 className={clsx('text-base font-bold', meta.textColor)}>
            {meta.label}
          </h3>
          <span className="text-xs text-neutral-500">{comments.length} 条</span>
        </div>

        <div className="flex items-center gap-2">
          {sevCount.must_fix > 0 && (
            <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
              必改 {sevCount.must_fix}
            </span>
          )}
          {sevCount.should_fix > 0 && (
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              建议 {sevCount.should_fix}
            </span>
          )}
          {sevCount.optional > 0 && (
            <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">
              可选 {sevCount.optional}
            </span>
          )}
          <svg
            className={clsx('h-4 w-4 text-neutral-400 transition-transform', expanded && 'rotate-180')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 px-3 py-3">
          {comments.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              hideDimension
              defaultExpanded={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
