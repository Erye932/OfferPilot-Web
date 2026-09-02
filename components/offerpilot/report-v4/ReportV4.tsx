/**
 * ReportV4 — V4 诊断报告主容器
 *
 * 完整模块架构：
 * 1. Hero 概览横幅 (总分、评级、主要结论、统计)
 * 2. ScoreBreakdown (总分 + 总评 + 6 维度评分与权重)
 * 3. BeforeAfter (改前/改后 ATS/HR/面试效果对比)
 * 4. HeatmapMatrix (段落 × 维度互动热图矩阵)
 * 5. CrossSectionSummary (三档风险、必改清单、改写示例库、可信度预警、JD矩阵)
 * 6. DimensionChapter (按维度细查全部诊断点)
 * 7. EvidenceModal (点击“查看诊断依据”即时弹出详情抽屉/浮层)
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import type { DiagnoseReport, V4Comment } from '@/lib/diagnose/types';
import ScoreBreakdown from './ScoreBreakdown';
import BeforeAfter from './BeforeAfter';
import HeatmapMatrix from './HeatmapMatrix';
import CrossSectionSummary from './CrossSectionSummary';
import DimensionChapter from './DimensionChapter';
import {
  DIMENSION_META,
  STATUS_META,
  SEVERITY_META,
  FIX_TYPE_META,
  IMPACT_META,
  CRED_CONCERN_META,
  clsx,
} from './shared';

interface ReportV4Props {
  report: DiagnoseReport;
  reportId?: string;
}

export default function ReportV4({ report, reportId }: ReportV4Props) {
  const [activeEvidenceComment, setActiveEvidenceComment] = useState<V4Comment | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const comments = Object.values(report.comments_by_dimension ?? {}).flat();
  const mustFix = comments.filter((comment) => comment.severity === 'must_fix');
  const topComments = (mustFix.length > 0 ? mustFix : comments).slice(0, 5);

  const generatedAt = new Date(report.metadata?.generated_at ?? Date.now());
  const generatedDate = Number.isNaN(generatedAt.getTime())
    ? ''
    : generatedAt.toLocaleDateString('zh-CN');

  const gradeText =
    report.overall_grade === 'excellent'
      ? '优秀'
      : report.overall_grade === 'strong'
      ? '良好'
      : report.overall_grade === 'medium'
      ? '一般'
      : '较弱';

  const finding = topComments[0]?.title || report.total_assessment || '诊断完成';

  // 复制改写内容
  const handleCopyRewrite = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  }, []);

  // 监听 ESC 键关闭弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveEvidenceComment(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* ── 1. Hero 顶栏概览 ── */}
      <section className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-800 text-white p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono">
              <span>OfferPilot V4</span>
              <span>·</span>
              <span>{report.metadata?.target_role || '产品助理'}</span>
              <span>·</span>
              <span>{generatedDate}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {finding}
            </h1>
            <p className="text-sm text-neutral-300 max-w-2xl leading-relaxed">
              {report.total_assessment}
            </p>
          </div>

          <div className="flex items-center gap-6 shrink-0 border-t border-neutral-700/60 pt-4 md:border-t-0 md:pt-0">
            <div className="text-center">
              <div className="text-4xl sm:text-5xl font-extrabold tracking-tight text-emerald-400">
                {Math.round(report.overall_score || 0)}
              </div>
              <div className="text-xs text-neutral-400 mt-1 font-medium">
                / 100 分 · {gradeText}
              </div>
            </div>
            <div className="h-12 w-px bg-neutral-700/60" />
            <div className="space-y-1 text-xs">
              <div className="text-neutral-300">
                共发现 <strong className="text-white">{comments.length}</strong> 项诊断点
              </div>
              <div className="text-amber-400 font-semibold">
                ⚠️ {mustFix.length} 项必须改
              </div>
              <div className="text-neutral-400 text-[11px]">
                {report.metadata?.has_jd ? '✓ 结合 JD 深度分析' : '未提供 JD（通用模型）'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Top 必须改核心聚焦 ── */}
      {topComments.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50/40 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-red-600">
                Priority Action Items
              </span>
              <h2 className="text-xl font-bold text-neutral-900 mt-0.5">
                这份简历当前最大的问题在哪里
              </h2>
            </div>
            <span className="text-xs text-neutral-500 font-medium">
              点击卡片或“查看诊断依据”查看原文定位与改写
            </span>
          </div>

          <div className="space-y-3">
            {topComments.map((comment, index) => (
              <article
                key={comment.id || index}
                className="rounded-xl border border-red-100 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-red-300 cursor-pointer"
                onClick={() => setActiveEvidenceComment(comment)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                        {String(index + 1).padStart(2, '0')} / {comment.severity === 'must_fix' ? '必须改' : '重点项'}
                      </span>
                      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                        {comment.section_label}
                      </span>
                      <span className="rounded-md bg-sky-50 text-sky-700 px-2 py-0.5 text-xs font-medium">
                        {DIMENSION_META[comment.dimension]?.label}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-neutral-900">
                      {comment.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-600">
                      {comment.why_it_hurts || comment.one_liner}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveEvidenceComment(comment);
                    }}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 px-3 py-2 rounded-lg transition"
                  >
                    查看诊断依据 ↗
                  </button>
                </div>

                {comment.evidence_quote && (
                  <div className="mt-3 rounded-lg bg-neutral-50 border-l-2 border-neutral-300 p-2.5 text-xs text-neutral-600 font-mono">
                    <span className="font-semibold text-neutral-500">原文引用：</span>
                    {comment.evidence_quote.length > 100
                      ? `${comment.evidence_quote.slice(0, 100)}...`
                      : comment.evidence_quote}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── 3. 维度评分分解 ── */}
      <ScoreBreakdown report={report} />

      {/* ── 4. 改前 / 改后对比 ── */}
      {report.before_after && <BeforeAfter beforeAfter={report.before_after} />}

      {/* ── 5. 段落 × 维度 热力矩阵 ── */}
      <HeatmapMatrix
        report={report}
        onCellClick={(cell) => {
          const dimComments = report.comments_by_dimension?.[cell.dimension] ?? [];
          const matched = dimComments.find((c) => c.section === cell.section);
          if (matched) {
            setActiveEvidenceComment(matched);
          }
        }}
      />

      {/* ── 6. 跨段综合汇总 (风险、改写库、可信度、JD) ── */}
      <CrossSectionSummary summary={report.cross_section_summary} />

      {/* ── 7. 按维度深度展开 ── */}
      <DimensionChapter report={report} defaultExpanded={false} />

      {/* ── 8. 诊断依据抽屉 / 弹窗 (Evidence Modal) ── */}
      {activeEvidenceComment && (
        <EvidenceDetailModal
          comment={activeEvidenceComment}
          copiedId={copiedId}
          onCopy={handleCopyRewrite}
          onClose={() => setActiveEvidenceComment(null)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// 诊断依据详情弹窗 / 抽屉 (EvidenceDetailModal)
// ════════════════════════════════════════════════════════════════

interface EvidenceDetailModalProps {
  comment: V4Comment;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onClose: () => void;
}

function EvidenceDetailModal({
  comment: c,
  copiedId,
  onCopy,
  onClose,
}: EvidenceDetailModalProps) {
  const dimMeta = DIMENSION_META[c.dimension];
  const severityMeta = SEVERITY_META[c.severity];
  const statusMeta = STATUS_META[c.status];
  const fixMeta = FIX_TYPE_META[c.fix_type];
  const credMeta = c.credibility_concern ? CRED_CONCERN_META[c.credibility_concern] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-neutral-200 p-6 sm:p-8 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题与关闭按钮 */}
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 pb-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={clsx('rounded-md px-2 py-0.5 text-xs font-semibold', dimMeta.bgColor, dimMeta.textColor)}>
                {dimMeta.label}
              </span>
              <span className="rounded-md bg-neutral-100 text-neutral-700 px-2 py-0.5 text-xs font-medium">
                {c.section_label}
              </span>
              <span className={clsx('rounded-md border px-2 py-0.5 text-xs font-semibold', severityMeta.borderColor, severityMeta.textColor)}>
                {severityMeta.label}
              </span>
              <span className={clsx('rounded-md px-2 py-0.5 text-xs font-medium', statusMeta.bgColor, statusMeta.textColor)}>
                {statusMeta.label}
              </span>
            </div>
            <h2 className="text-xl font-bold text-neutral-900">{c.title}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
            aria-label="关闭"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 1. 命中原文片段 */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            📌 命中简历原文片段
          </h3>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm font-mono text-neutral-800 leading-relaxed">
            {c.evidence_quote || '（未提供具体原文字句引用）'}
          </div>
        </div>

        {/* 2. 为什么扣分 / 诊断分析 */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
            ⚠️ 扣分与影响原因 (Why It Hurts)
          </h3>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-800 leading-relaxed">
            <p className="font-semibold text-neutral-900 mb-1">{c.one_liner}</p>
            <p className="text-neutral-600">{c.why_it_hurts}</p>
          </div>
        </div>

        {/* 3. 内部人视角 / HR 与面试官追问 */}
        {c.insider_view && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              💡 HR / 面试官真实视角
            </h3>
            <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 text-sm text-sky-900 leading-relaxed">
              {c.insider_view}
            </div>
          </div>
        )}

        {/* 4. 针对性改写建议 (Rewrite) */}
        {c.rewrite && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                ✏️ 针对性改写示范
              </h3>
              <button
                type="button"
                onClick={() => onCopy(c.rewrite!.after, c.id)}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 transition"
              >
                {copiedId === c.id ? '✓ 已复制改写内容' : '复制改写示范'}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-3">
                <span className="font-bold text-red-700 block mb-1">改前：</span>
                <p className="text-neutral-700 font-mono leading-relaxed">{c.rewrite.before}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <span className="font-bold text-emerald-700 block mb-1">改后（示范）：</span>
                <p className="text-neutral-800 font-mono leading-relaxed font-semibold">{c.rewrite.after}</p>
              </div>
            </div>
            {c.rewrite.what_changed && (
              <p className="text-xs text-neutral-500 mt-1">
                <span className="font-semibold text-neutral-700">优化亮点：</span> {c.rewrite.what_changed}
              </p>
            )}
          </div>
        )}

        {/* 5. 影响关卡与修复类型 */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 text-xs text-neutral-500 flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <span>影响关卡：</span>
            {c.impact_on?.map((imp) => (
              <span key={imp} className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-700 font-medium">
                {IMPACT_META[imp]?.label || imp}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span>修改指导：</span>
            <span className={clsx('font-medium', fixMeta.textColor)}>{fixMeta.label}</span>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition"
          >
            知道了，返回报告
          </button>
        </div>
      </div>
    </div>
  );
}
