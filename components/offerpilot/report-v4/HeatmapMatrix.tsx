/**
 * HeatmapMatrix — 段落 × 维度 热图（核心可视化组件）
 *
 * 行：每个段落（教育、实习·字节、实习·阿里、项目、技能...）
 * 列：6 个维度（结构、表达、证据、岗位、可信、缺失）
 * 单元格：颜色 = 状态，数字 = comment_count，hover/点击 显示该格的 comments
 */
'use client';

import { useState, useMemo } from 'react';
import type { DiagnoseReport, V4MatrixCell, V4Dimension } from '@/lib/diagnose/types';
import { DIMENSION_META, STATUS_META, SEVERITY_META, clsx } from './shared';

interface HeatmapMatrixProps {
  report: DiagnoseReport;
  onCellClick?: (cell: V4MatrixCell) => void;
}

const DIM_ORDER: V4Dimension[] = [
  'structure',
  'expression',
  'evidence',
  'role_fit',
  'credibility',
  'missing_info',
];

export default function HeatmapMatrix({ report, onCellClick }: HeatmapMatrixProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const cells = useMemo(() => report.matrix?.cells ?? [], [report.matrix?.cells]);
  const sections = useMemo(() => report.matrix?.sections ?? [], [report.matrix?.sections]);

  // 用 (section_label, dimension) 索引 cells
  const cellIndex = useMemo(() => {
    const idx = new Map<string, V4MatrixCell>();
    for (const c of cells) {
      idx.set(`${c.section_label}|${c.dimension}`, c);
    }
    return idx;
  }, [cells]);

  // 当前选中或悬停的 cell
  const activeCell = useMemo(() => {
    if (selected) return cellIndex.get(selected);
    if (hovered) return cellIndex.get(hovered);
    return null;
  }, [hovered, selected, cellIndex]);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">段落 × 维度 热图</h3>
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
          {Object.entries(STATUS_META).map(([k, m]) => (
            <span key={k} className="flex items-center gap-1">
              <span className={clsx('inline-block h-2 w-2 rounded-full border', m.bgColor, m.borderColor)} />
              <span>{m.label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <p className="mb-1 text-[10px] text-neutral-400 md:hidden">← 左右滑动查看完整热图 →</p>
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-32 bg-white p-2 text-left text-xs font-medium text-neutral-500" />
              {DIM_ORDER.map((dim) => {
                const meta = DIMENSION_META[dim];
                return (
                  <th
                    key={dim}
                    className={clsx(
                      'px-1 py-2 text-center text-[11px] font-semibold',
                      meta.textColor
                    )}
                  >
                    {meta.shortLabel}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              return (
                <tr key={section.section_label} className="border-t border-neutral-100">
                  <td className="sticky left-0 z-10 w-32 bg-white px-2 py-2 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-neutral-700 truncate" title={section.section_label}>
                        {section.section_label}
                      </span>
                    </div>
                  </td>

                  {DIM_ORDER.map((dim) => {
                    const key = `${section.section_label}|${dim}`;
                    const cell = cellIndex.get(key);
                    if (!cell) {
                      return (
                        <td key={dim} className="px-1 py-1.5 text-center">
                          <div className="mx-auto h-9 w-9 rounded-md bg-neutral-50" />
                        </td>
                      );
                    }
                    const statusMeta = STATUS_META[cell.status];
                    const isHovered = hovered === key;
                    const isSelected = selected === key;
                    return (
                      <td key={dim} className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onMouseEnter={() => setHovered(key)}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => {
                            setSelected(isSelected ? null : key);
                            onCellClick?.(cell);
                          }}
                          aria-label={`${section.section_label} · ${DIMENSION_META[dim].label} · ${statusMeta.label}${cell.comment_count > 0 ? ` · ${cell.comment_count} 条` : ''}`}
                          aria-pressed={isSelected}
                          className={clsx(
                            'mx-auto flex h-9 w-9 items-center justify-center rounded-md border text-xs font-semibold transition-all',
                            statusMeta.bgColor,
                            statusMeta.borderColor,
                            statusMeta.textColor,
                            (isHovered || isSelected) && `ring-2 ${statusMeta.ringColor}`,
                            'hover:scale-110'
                          )}
                          title={`${cell.summary}${cell.comment_count > 0 ? ` (${cell.comment_count}条)` : ''}`}
                        >
                          {cell.comment_count > 0 ? cell.comment_count : '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 选中或悬停的 cell 详情 */}
      {activeCell && (
        <div className={clsx(
          'mt-4 rounded-lg border p-3 text-sm',
          STATUS_META[activeCell.status].bgColor,
          STATUS_META[activeCell.status].borderColor
        )}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold">
              {activeCell.section_label}
              <span className="mx-1.5 text-neutral-400">|</span>
              <span className={DIMENSION_META[activeCell.dimension].textColor}>
                {DIMENSION_META[activeCell.dimension].label}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className={STATUS_META[activeCell.status].textColor}>
                {STATUS_META[activeCell.status].label}
              </span>
              {activeCell.worst_severity && (
                <span className={clsx(
                  'rounded-full border px-1.5 text-[10px]',
                  SEVERITY_META[activeCell.worst_severity].borderColor,
                  SEVERITY_META[activeCell.worst_severity].bgColor,
                  SEVERITY_META[activeCell.worst_severity].textColor
                )}>
                  {SEVERITY_META[activeCell.worst_severity].label}
                </span>
              )}
              {activeCell.comment_count > 0 && (
                <span className="text-neutral-500">{activeCell.comment_count} 条</span>
              )}
            </span>
          </div>
          <p className="text-neutral-700">{activeCell.summary}</p>
        </div>
      )}
    </section>
  );
}
