/**
 * ReportV4 — V4 诊断报告主容器
 *
 * 布局（从上到下）：
 * 1. ScoreBreakdown          — 总分 + 总评 + 6 维度评分
 * 2. BeforeAfter             — 改前/改后对比
 * 3. HeatmapMatrix           — 段落 × 维度热图（核心）
 * 4. CrossSectionSummary     — 跨段汇总（必改 / 改写库 / 风险 / 可信度 / JD）
 * 5. DimensionChapter        — 按维度细查
 */
'use client';

import type { DiagnoseReport } from '@/lib/diagnose/types';
import ScoreBreakdown from './ScoreBreakdown';
import BeforeAfter from './BeforeAfter';
import HeatmapMatrix from './HeatmapMatrix';
import CrossSectionSummary from './CrossSectionSummary';
import DimensionChapter from './DimensionChapter';

interface ReportV4Props {
  report: DiagnoseReport;
}

export default function ReportV4({ report }: ReportV4Props) {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      {/* Hero */}
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-neutral-900">简历诊断报告</h1>
        <p className="text-xs text-neutral-500">
          目标岗位：{report.metadata.target_role}
          {report.metadata.role_resolution &&
            ` · 职位类别：${report.metadata.role_resolution.role_family}`}
          {' · 生成时间：'}
          {new Date(report.metadata.generated_at).toLocaleString('zh-CN')}
        </p>
      </header>

      {/* 1. 总分 + 6 维度 */}
      <ScoreBreakdown report={report} />

      {/* 2. 改前/改后 */}
      <BeforeAfter beforeAfter={report.before_after} />

      {/* 3. 热图 */}
      <HeatmapMatrix report={report} />

      {/* 4. 跨段汇总 */}
      <CrossSectionSummary summary={report.cross_section_summary} />

      {/* 5. 按维度细查 */}
      <DimensionChapter report={report} defaultExpanded={false} />

      {/* Footer */}
      <footer className="border-t border-neutral-200 pt-4 text-center text-[11px] text-neutral-400">
        OfferPilot 简历诊断 · {new Date(report.metadata.generated_at).toLocaleDateString('zh-CN')}
      </footer>
    </div>
  );
}
