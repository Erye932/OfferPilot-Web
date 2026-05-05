"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppTopNav from "@/components/offerpilot/AppTopNav";
import type {
  FreeDiagnoseResponse,
  RewriteExample,
  AIAssistantState,
} from "@/lib/diagnose/types";
import demoDiagnoseResult from "@/lib/diagnose/mock-data";

type DiagnoseReport = FreeDiagnoseResponse;

// ─── Dimension 标签映射 ─────────────────────────────────────
const DIMENSION_LABELS: Record<string, { label: string; color: string }> = {
  structure:    { label: "结构",    color: "text-[11px] font-medium tracking-widest uppercase text-violet-600" },
  role_fit:     { label: "岗位贴合", color: "text-[11px] font-medium tracking-widest uppercase text-sky-600" },
  evidence:     { label: "成果证据", color: "text-[11px] font-medium tracking-widest uppercase text-amber-600" },
  credibility:  { label: "可信度",  color: "text-[11px] font-medium tracking-widest uppercase text-rose-600" },
  expression:   { label: "表达",    color: "text-[11px] font-medium tracking-widest uppercase text-emerald-600" },
  missing_info: { label: "信息缺失", color: "text-[11px] font-medium tracking-widest uppercase text-orange-600" },
  other:        { label: "其他",    color: "text-[11px] font-medium tracking-widest uppercase text-neutral-500" },
};

export default function DemoDiagnoseResult() {
  const router = useRouter();
  const [detailId, setDetailId] = useState<string>("");
  const [activeIssueId, setActiveIssueId] = useState<string>("");
  // 静态 mock 数据，直接作为初始值赋给状态，避免在 useEffect 中 setState
  const [report] = useState<DiagnoseReport | null>(demoDiagnoseResult);
  const [isLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  // AI assistant: cleaned up — removed unused `visible`, `request`, `chatHistory`
  const [aiAssistant, setAiAssistant] = useState<{
    expanded: boolean;
    loading: boolean;
    activeIssueIndex: number | null;
    response: AIAssistantState["response"] | null;
  }>({
    expanded: false,
    loading: false,
    activeIssueIndex: null,
    response: null,
  });
  const lastClickTime = useRef(0);
  const issueRefs = useRef<Map<string, HTMLElement>>(new Map());


  // ─── Single click select / double click clear all ─────────
  const handleIssueClick = useCallback(
    (id: string) => {
      const now = Date.now();
      const dt = now - lastClickTime.current;
      lastClickTime.current = now;

      if (dt < 300) {
        // Double-click: clear selection
        setActiveIssueId("");
        setDetailId("");
        return;
      }

      // Single-click (debounced)
      setTimeout(() => {
        if (Date.now() - lastClickTime.current >= 280) {
          setActiveIssueId((cur) => (cur === id ? "" : id));
        }
      }, 300);
    },
    []
  );

  const toggleDetail = (id: string) => {
    setDetailId((cur) => (cur === id ? "" : id));
  };

  const handleCopyRewrite = useCallback(async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // ignore
    }
  }, []);

  // ─── Continue-optimize (with optional source location) ─────
  const handleContinueOptimize = (_issueIndex?: number) => {
    // demo模式下，继续优化跳转到诊断页面，但清除可能存在的sessionStorage数据
    try {
      sessionStorage.removeItem("diagnoseData");
      sessionStorage.removeItem("diagnoseRefill");
    } catch {
      // ignore
    }
    router.push("/diagnose");
  };

  // ─── AI explain ────────────────────────────────────────────
  const handleAiExplain = useCallback(
    async (issueIndex: number) => {
      const issue = report?.core_issues?.[issueIndex];
      if (!issue) return;

      if (aiAssistant.activeIssueIndex === issueIndex && aiAssistant.response) {
        setAiAssistant((prev) => ({ ...prev, expanded: !prev.expanded }));
        return;
      }

      setAiAssistant({
        expanded: true,
        activeIssueIndex: issueIndex,
        loading: true,
        response: null,
      });

      // Demo 页面不发请求，直接返回本地 fallback 文案
      setAiAssistant((prev) => ({
        ...prev,
        loading: false,
        response: {
          explanation: `这条诊断基于简历中"${issue.evidence?.substring(0, 30) || "相关内容"}…"部分的分析。${issue.suggestion ?? ''}`,
          confidence:  "low" as const,
          might_be_wrong: "示例页面不提供 AI 动态解释，仅供参考。",
        },
      }));
    },
    [report, aiAssistant.activeIssueIndex, aiAssistant.response]
  );

  // ─── Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-800">
        <AppTopNav current="sample" />
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="rounded-xl border border-neutral-100 bg-white p-6">
            <div className="flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-primary" />
              <p className="ml-3 text-sm leading-relaxed text-neutral-600">正在加载示例结果...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── No data ────────────────────────────────────────────────
  if (!report) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-800">
        <AppTopNav current="sample" />
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="rounded-xl border border-neutral-100 bg-white p-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-normal tracking-tight text-neutral-800">
                示例结果加载失败
              </h2>
              <p className="mt-4 text-lg leading-7 text-neutral-600">
                请稍后重试。
              </p>
              <div className="mt-10">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-normal text-white transition hover:bg-primary-dark"
                >
                  返回首页
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const { scenario } = report;

  // ─── Insufficient input ─────────────────────────────────────
  if (scenario === "insufficient_input") {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-800">
        <AppTopNav current="sample" />
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="grid gap-4 lg:gap-6 lg:grid-cols-12">
            <section className="space-y-5 lg:col-span-8">
              <div className="rounded-xl border border-neutral-100 bg-white p-6">
                <div className="mx-auto max-w-2xl text-center">
                  <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-50/60 text-amber-600">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.282 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-normal leading-normal tracking-tight text-neutral-800 break-words hyphens-auto">
                    {report.main_judgment}
                  </h2>
                  <p className="mt-4 text-base leading-7 text-neutral-600">
                    补充更多简历内容或岗位信息后，能获得更精准的诊断。
                  </p>

                  {report.follow_up_prompts && report.follow_up_prompts.length > 0 && (
                    <div className="mt-4 space-y-2 text-left">
                      <p className="text-sm font-normal text-neutral-700">建议补充以下信息：</p>
                      {report.follow_up_prompts.map((p, i) => (
                        <div key={`fup-${i}`} className="rounded-xl bg-neutral-50/80 p-6">
                          <p className="text-sm font-normal text-neutral-800">{p.question}</p>
                          <p className="mt-1 text-sm leading-relaxed text-neutral-500">{p.why}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <button
                      type="button"
                      onClick={() => handleContinueOptimize()}
                      className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-normal text-white transition hover:bg-primary-dark"
                    >
                      补充信息后重新诊断
                    </button>
                  </div>
                </div>
              </div>
            </section>
            <aside className="lg:col-span-4">
              <ActionSidebar report={report} onContinue={() => handleContinueOptimize()} />
            </aside>
          </div>
        </main>
      </div>
    );
  }

  // ─── Excellent ──────────────────────────────────────────────
  if (scenario === "excellent") {
    const minorSuggestions = report.minor_suggestions || [];
    const excellentScore = report.excellent_score || 0;

    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-800">
        <AppTopNav current="sample" />
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <div className="grid gap-4 lg:gap-6 lg:grid-cols-12">
            <section className="space-y-5 lg:col-span-8">
              <div className="rounded-xl border border-green-200 bg-white p-6">
                <div className="mx-auto max-w-2xl text-center">
                  <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-50/60 text-green-700">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <path d="M22 4 12 14.01l-3-3" />
                    </svg>
                  </div>

                  <div className="mb-4 inline-flex items-center rounded-full bg-green-100 px-4 py-1.5 text-sm font-normal text-green-800">
                    优秀简历{excellentScore >= 90 ? ` · 评分 ${excellentScore}` : ""}
                  </div>

                  <h2 className="text-xl font-normal leading-normal tracking-tight text-neutral-800 break-words hyphens-auto">
                    {report.main_judgment}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                    没有明显核心问题，后续只建议做亮点强化。
                  </p>
                </div>

                {report.rewrite_direction && (
                  <div className="mt-4 rounded-xl bg-neutral-50/80 p-5">
                    <p className="text-sm font-normal text-green-800">你可能没意识到的加分项</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-700">{report.rewrite_direction}</p>
                  </div>
                )}

                {minorSuggestions.map((s, i) => (
                  <div key={`ms-${i}`} className="mt-4 rounded-xl bg-neutral-50 p-5">
                    <p className="text-sm font-normal text-neutral-800">{s.title}</p>
                    <p className="mt-2 text-sm leading-7 text-neutral-600">{s.description}</p>
                  </div>
                ))}

                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <Link href="/diagnose" className="inline-flex items-center justify-center rounded-xl border border-neutral-100 bg-white px-4 py-3 text-sm font-normal text-neutral-800 transition hover:bg-neutral-50">
                    诊断另一份简历
                  </Link>
                </div>
              </div>
            </section>
            <aside className="lg:col-span-4">
              <ActionSidebar report={report} onContinue={() => handleContinueOptimize()} />
            </aside>
          </div>
        </main>
      </div>
    );
  }

  // ─── Normal — animated reveal ───────────────────────────────
  const coreIssues     = report.core_issues     || [];
  const rewriteExamples = report.rewrite_examples || [];
  const followUpPrompts = report.follow_up_prompts || [];

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-800">
      <AppTopNav current="sample" />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="grid gap-4 lg:gap-6 lg:grid-cols-12">
          {/* Left column - Master list */}
          <section className="space-y-2 lg:col-span-5">



            {/* ── Main conclusion ── */}
            <div className="rounded-xl border border-neutral-100 bg-white p-4 sm:p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 break-words">
              <div className="flex items-center justify-between">
                <p className="text-xs font-normal tracking-wider text-primary uppercase">
                  诊断结论
                </p>
                {/* quality tier 标签已移除，顶部只保留 main_judgment 作为唯一结论入口 */}
              </div>
              <h2 className="mt-1 text-lg font-normal leading-normal tracking-tight text-neutral-800 break-words hyphens-auto sm:text-xl">
                {report.main_judgment}
              </h2>
              {/* First action prompt */}
              {report.priority_actions?.length > 0 && (
                <div className="mt-4 rounded-lg border border-primary-light bg-gradient-to-r from-primary-light/10 to-transparent px-4 py-3">
                  <p className="text-[10px] font-medium tracking-widest uppercase text-primary-dark">现在最该先做的一步</p>
                  <p className="mt-1 text-sm font-medium text-neutral-800">{report.priority_actions[0].title}</p>
                  {report.priority_actions[0].description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{report.priority_actions[0].description}
                    </p>
                  )}
                </div>
              )}
              {coreIssues.length > 0 && (
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                  发现 {report.core_issues_summary?.total_count || coreIssues.length} 个可优化项，按影响程度排列。
                  <span className="ml-2 text-xs text-neutral-400">
                    单击选择问题 · 双击清空选择
                  </span>
                </p>
              )}
            </div>


            {/* ── Issue cards ── */}
            {coreIssues.length > 0 && (
              <div className="space-y-2">
                {coreIssues.map((issue, index) => {
                  const issueId = `issue-${index}`;
                  const isActive = activeIssueId === issueId;
                  const dimInfo = DIMENSION_LABELS[issue.dimension || "other"] || DIMENSION_LABELS.other;

                  return (
                    <article
                      key={issueId}
                      ref={(el) => { if (el) issueRefs.current.set(issueId, el); }}
                      className="rounded-xl border border-neutral-100 bg-gradient-to-br from-white to-neutral-50/30 overflow-hidden transition-colors hover:bg-neutral-50/50"
                      style={{
                        animation: "fadeSlideIn 0.32s ease-out",
                        animationDelay: `${index * 60}ms`,
                        animationFillMode: "backwards",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleIssueClick(issueId)}
                        className={`flex w-full items-start gap-3 p-4 text-left transition rounded-xl ${
                          isActive
                            ? "bg-primary-light border border-primary-light"
                            : "border border-transparent hover:bg-neutral-50/50"
                        }`}
                      >
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-50/60 text-xs font-normal text-primary mt-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-base font-normal text-neutral-800 break-words">{issue.title}</h4>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-normal ${dimInfo.color}`}>
                              {dimInfo.label}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-neutral-600 line-clamp-2 break-words">
                            {issue.summary}
                          </p>
                        </div>
                        <svg
                          className={`h-4 w-4 shrink-0 transition-transform duration-250 mt-1 ${isActive ? "text-primary" : "text-neutral-300"}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                    </article>
                  );
                })}
              </div>
            )}

            {/* ── Rewrite examples ── */}
            {rewriteExamples.length > 0 && (
              <div className="rounded-xl bg-white p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                <h3 className="text-lg font-normal tracking-tight text-neutral-800">可直接使用的改写</h3>
                <p className="mt-1 text-sm leading-relaxed text-neutral-500">标注 [需要你补充] 的地方请填入真实数据</p>
                <div className="mt-4 space-y-2">
                  {rewriteExamples.map((ex, idx) => (
                    <InlineDiffCard
                      key={`global-rw-${idx}`}
                      example={ex}
                      index={idx}
                      copiedIdx={copiedIdx}
                      onCopy={handleCopyRewrite}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Minor suggestions 已移到右侧 ActionSidebar，与核心问题栏彻底分开 */}

            {/* ── Follow-up prompts ── */}
            {followUpPrompts.length > 0 && (
              <div className="rounded-xl bg-white p-6 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
                <h3 className="text-base font-normal tracking-tight text-neutral-800">想进一步优化？补充这些信息</h3>
                <div className="mt-3 space-y-2">
                  {followUpPrompts.map((p, i) => (
                    <div key={`fup-${i}`} className="rounded-xl bg-neutral-50/60 p-6">
                      <p className="text-sm font-normal text-neutral-800">{p.question}</p>
                      <p className="mt-1 text-sm leading-relaxed text-neutral-500">{p.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Right column - Detail panel only */}
          <aside className="lg:col-span-7">
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-hide">
              {/* Detail panel for selected issue */}
              {activeIssueId ? (
                <DetailPanel
                  report={report}
                  activeIssueId={activeIssueId}
                  aiAssistant={aiAssistant}
                  copiedIdx={copiedIdx}
                  onAiExplain={handleAiExplain}
                  onCopyRewrite={handleCopyRewrite}
                  onContinueOptimize={handleContinueOptimize}
                  onToggleDetail={toggleDetail}
                  detailId={detailId}
                />
              ) : (
                <div className="rounded-xl border border-neutral-100 bg-gradient-to-b from-neutral-50/60 to-white p-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-normal text-neutral-800">点击左侧问题列表查看详细分析</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                    选择一个优化项，这里将显示完整的诊断建议、改写示例和 AI 解释。
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* ActionSidebar moved to bottom to avoid interference with issue details */}
        <div className="mt-6 lg:mt-8">
          <ActionSidebar report={report} onContinue={() => handleContinueOptimize()} />
        </div>
      </main>

      <style>{`
        @keyframes fadeSlideIn {
          0%   { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Inline Diff Card ────────────────────────────────────────
function InlineDiffCard({
  example,
  index,
  copiedIdx,
  onCopy,
}: {
  example: RewriteExample;
  index: number;
  copiedIdx: number | null;
  onCopy: (text: string, idx: number) => void;
}) {
  return (
    <div className="rounded-xl bg-neutral-50 overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-neutral-200">
        <div className="p-6">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-neutral-200 text-[9px] font-medium text-neutral-600">前</span>
            <span className="text-[11px] font-normal text-neutral-400">原文</span>
          </div>
          <p className="text-sm leading-7 text-neutral-600 whitespace-pre-line">{example.original}</p>
        </div>
        <div className="p-6 bg-white/60">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-primary-light text-[9px] font-medium text-primary">后</span>
              <span className="text-[11px] font-normal text-primary">改写后</span>
            </div>
            <button
              type="button"
              onClick={() => onCopy(example.rewritten, index)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-normal text-neutral-500 transition hover:bg-neutral-200/50 hover:text-neutral-800"
            >
              {copiedIdx === index ? (
                <>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  已复制
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  复制
                </>
              )}
            </button>
          </div>
          <p className="text-sm leading-7 text-neutral-800 whitespace-pre-line">{example.rewritten}</p>
        </div>
      </div>
      <div className="bg-white/40 px-4 py-2.5 border-t border-neutral-100">
        <p className="text-xs leading-5 text-neutral-500">
          <span className="font-normal text-neutral-600">改了什么：</span>
          {example.change_summary}
        </p>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────
function DetailPanel({
  report,
  activeIssueId,
  aiAssistant,
  copiedIdx,
  onAiExplain,
  onCopyRewrite,
  onContinueOptimize,
  onToggleDetail,
  detailId,
}: {
  report: DiagnoseReport;
  activeIssueId: string;
  aiAssistant: {
    expanded: boolean;
    loading: boolean;
    activeIssueIndex: number | null;
    response: AIAssistantState["response"] | null;
  };
  copiedIdx: number | null;
  onAiExplain: (issueIndex: number) => void;
  onCopyRewrite: (text: string, idx: number) => void;
  onContinueOptimize: (issueIndex?: number) => void;
  onToggleDetail: (id: string) => void;
  detailId: string;
}) {
  // Parse issue index from activeIssueId (format: "issue-0")
  const issueIndex = parseInt(activeIssueId.replace("issue-", ""), 10);
  const issue = report.core_issues?.[issueIndex];

  if (!issue) return null;

  const showDetail = detailId === activeIssueId;
  const dimInfo = DIMENSION_LABELS[issue.dimension || "other"] || DIMENSION_LABELS.other;

  return (
    <div className="space-y-6">
      {/* Issue header */}
      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-normal text-primary">
              {issueIndex + 1}
            </div>
            <div>
              <h3 className="text-lg font-normal text-neutral-800">{issue.title}</h3>
              <div className="mt-1 flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-normal ${dimInfo.color}`}>
                  {dimInfo.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm leading-7 text-neutral-600">{issue.summary}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {issue.source_location && (
            <button
              type="button"
              onClick={() => onContinueOptimize(issueIndex)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-dark"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              定位原文
            </button>
          )}

          <button
            type="button"
            onClick={() => onAiExplain(issueIndex)}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
            </svg>
            为什么这样诊断？
          </button>

          <button
            type="button"
            onClick={() => onToggleDetail(activeIssueId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-100 px-3 py-1.5 text-xs font-normal text-neutral-600 transition hover:bg-neutral-50"
          >
            {showDetail ? "收起详细说明" : "查看详细说明"}
            <svg
              className={`h-3 w-3 transition-transform duration-200 ${showDetail ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Suggestion card */}
      <div className="rounded-xl border border-primary-light bg-gradient-to-b from-primary-light/40 to-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h4 className="text-base font-normal text-primary-dark">修改建议</h4>
        </div>
        <p className="text-sm leading-7 text-neutral-700">{issue.suggestion}</p>
      </div>

      {/* Rewrite examples */}
      {issue.rewrite_examples && issue.rewrite_examples.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-base font-normal text-neutral-800">改写示例</h4>
          <div className="space-y-2">
            {issue.rewrite_examples.map((ex, exIdx) => (
              <InlineDiffCard
                key={`detail-rw-${exIdx}`}
                example={ex}
                index={issueIndex * 10 + exIdx}
                copiedIdx={copiedIdx}
                onCopy={onCopyRewrite}
              />
            ))}
          </div>
        </div>
      )}

      {/* AI explain section */}
      {aiAssistant.activeIssueIndex === issueIndex && aiAssistant.expanded && (
        <div className="rounded-xl border border-primary-light bg-gradient-to-b from-neutral-50/60 to-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-light">
                <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375" />
                </svg>
              </div>
              <h4 className="text-base font-normal text-neutral-800">AI 解释</h4>
            </div>
            <button
              type="button"
              onClick={() => onAiExplain(issueIndex)}
              className="flex h-5 w-5 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-600 transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {aiAssistant.loading ? (
            <div className="flex items-center gap-2 py-2">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-100 border-t-primary" />
              <span className="text-xs text-neutral-500">正在分析...</span>
            </div>
          ) : aiAssistant.response && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-normal text-primary mb-1">判断依据</p>
                  <p className="text-sm leading-6 text-neutral-700 bg-white/50 rounded-lg p-3 border border-primary-light">
                    {issue.evidence || "未提供具体片段"}
                  </p>
                </div>

                {aiAssistant.response.explanation && (
                  <div>
                    <p className="text-xs font-normal text-neutral-700 mb-1">分析说明</p>
                    <p className="text-sm leading-6 text-neutral-700">
                      {aiAssistant.response.explanation}
                    </p>
                  </div>
                )}
              </div>

              {aiAssistant.response.confidence && (
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-normal ${
                    aiAssistant.response.confidence === "high"
                      ? "bg-neutral-50/60 text-green-700"
                      : aiAssistant.response.confidence === "medium"
                      ? "bg-neutral-50/60 text-amber-700"
                      : "bg-neutral-100 text-neutral-600"
                  }`}>
                    置信度: {aiAssistant.response.confidence === "high" ? "高" : aiAssistant.response.confidence === "medium" ? "中" : "低"}
                  </span>
                </div>
              )}

              {aiAssistant.response.might_be_wrong && (
                <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3">
                  <p className="text-xs font-normal text-amber-700 mb-1">诚实提醒</p>
                  <p className="text-xs leading-5 text-amber-800">{aiAssistant.response.might_be_wrong}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Detail level content */}
      {showDetail && (
        <div className="space-y-4">
          <h4 className="text-base font-normal text-neutral-800">详细分析</h4>

          <div className="rounded-xl bg-neutral-50 px-4 py-3.5">
            <p className="text-xs font-normal text-neutral-500 mb-1">简历原文</p>
            <p className="leading-7 text-neutral-700 whitespace-pre-line">{issue.evidence}</p>
          </div>

          {issue.screening_impact && (
            <div className="rounded-xl bg-neutral-50 px-4 py-3.5">
              <p className="text-xs font-normal text-neutral-500 mb-1">对初筛的影响</p>
              <p className="leading-7 text-neutral-700">{issue.screening_impact}</p>
            </div>
          )}

          {issue.insider_view && (
            <div className="rounded-xl bg-neutral-50 px-4 py-3.5">
              <p className="text-xs font-normal text-neutral-500 mb-1">招聘方怎么看</p>
              <p className="leading-7 text-neutral-700">{issue.insider_view}</p>
            </div>
          )}

          {issue.follow_up_question && (
            <div className="rounded-xl bg-neutral-50 px-4 py-3.5">
              <p className="text-xs font-normal text-neutral-500 mb-1">面试中可能被问到</p>
              <p className="leading-7 text-neutral-700">{issue.follow_up_question}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Action Sidebar ──────────────────────────────────────────
function ActionSidebar({
  report,
  onContinue,
}: {
  report: DiagnoseReport;
  onContinue: () => void;
}) {
  const priorityActions = report.priority_actions || [];
  const minorSuggestions = report.minor_suggestions || [];

  return (
    <div className="space-y-4">
        {report.scenario === "normal" && priorityActions.length > 0 && (
          <div className="rounded-xl border border-neutral-100 bg-gradient-to-b from-neutral-50/60 to-white p-5">
            <p className="text-sm font-normal text-primary-dark">现在最该先做的事</p>
            <div className="mt-3 space-y-2">
              {priorityActions.map((action, idx) => (
                <div key={`pa-${idx}`} className="flex items-start gap-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-medium text-primary mt-0.5">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-normal text-neutral-800">{action.title}</p>
                    <p className="mt-0.5 text-sm leading-6 text-neutral-600">{action.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.scenario === "normal" && minorSuggestions.length > 0 && (
          <div className="rounded-xl border border-neutral-100 bg-gradient-to-b from-neutral-50/60 to-white p-5">
            <p className="text-sm font-normal text-emerald-800">其他优化建议</p>
            <div className="mt-3 space-y-2">
              {minorSuggestions.map((suggestion, idx) => (
                <div key={`ms-${idx}`} className="flex items-start gap-2.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-medium text-emerald-700 mt-0.5">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-normal text-neutral-800">{suggestion.title}</p>
                    <p className="mt-0.5 text-sm leading-6 text-neutral-600">{suggestion.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {report.scenario === "excellent" && (
          <div className="rounded-xl bg-gradient-to-b from-neutral-50/60 to-white p-5">
            <p className="text-sm font-normal text-green-800">下一步建议</p>
            <p className="mt-3 text-sm leading-7 text-neutral-600">
              {priorityActions[0]?.description || "保持当前简历，直接投递目标岗位。"}
            </p>
          </div>
        )}

        {report.scenario === "insufficient_input" && (
          <div className="rounded-xl bg-gradient-to-b from-neutral-50/60 to-white p-5">
            <p className="text-sm font-normal text-amber-800">下一步</p>
            <p className="mt-3 text-sm leading-7 text-amber-700">
              补足简历内容或岗位信息后再来，获取更精准的诊断。
            </p>
          </div>
        )}

        <div className="rounded-xl bg-white p-6">
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onContinue}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm leading-relaxed text-neutral-700 transition hover:bg-neutral-50/60 hover:text-primary"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
              </svg>
              继续优化当前简历
            </button>
            <Link
              href="/diagnose"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm leading-relaxed text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              重新上传 / 粘贴新简历
            </Link>
          </div>
        </div>

        {report.metadata?.target_role && (
          <div className="rounded-xl bg-neutral-50/50 px-4 py-3">
            <p className="text-xs text-neutral-400">目标岗位：{report.metadata.target_role}</p>
          </div>
        )}
    </div>
  );
}