"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AppTopNav from "@/components/offerpilot/AppTopNav";
import type { LoadingStage } from "@/lib/diagnose/types";

const STAGE_CONFIG_BASIC: Record<
  LoadingStage,
  { label: string; progress: number; duration: number }
> = {
  reading_resume: { label: "正在读取简历内容...", progress: 5, duration: 400 },
  parsing_resume: { label: "正在解析简历结构...", progress: 15, duration: 600 },
  validating_input: { label: "正在校验输入质量...", progress: 25, duration: 500 },
  matching_rules: { label: "正在匹配诊断规则...", progress: 40, duration: 800 },
  retrieving_corpus: {
    label: "正在检索专业语料...",
    progress: 55,
    duration: 700,
  },
  generating_report: {
    label: "AI 正在分析并生成改写建议...",
    progress: 75,
    duration: 0,
  },
  formatting_result: {
    label: "正在排序问题、整理改写结果...",
    progress: 92,
    duration: 500,
  },
  complete: { label: "诊断完成", progress: 100, duration: 300 },
  error: { label: "诊断出现问题", progress: 0, duration: 0 },
};

const STAGE_CONFIG_DEEP: Record<
  LoadingStage,
  { label: string; progress: number; duration: number }
> = {
  reading_resume: { label: "正在读取简历内容...", progress: 5, duration: 400 },
  parsing_resume: { label: "正在生成基础诊断...", progress: 20, duration: 600 },
  validating_input: { label: "正在模拟 HR 初筛视角...", progress: 35, duration: 500 },
  matching_rules: { label: "正在生成重写级建议...", progress: 50, duration: 800 },
  retrieving_corpus: {
    label: "正在交叉校验风险与改写方案...",
    progress: 65,
    duration: 700,
  },
  generating_report: {
    label: "正在生成深度长报告...",
    progress: 80,
    duration: 0,
  },
  formatting_result: {
    label: "正在整理深度分析结果...",
    progress: 92,
    duration: 500,
  },
  complete: { label: "深度诊断完成", progress: 100, duration: 300 },
  error: { label: "诊断出现问题", progress: 0, duration: 0 },
};

export default function DiagnoseLoading() {
  const router = useRouter();
  const [stage, setStage] = useState<LoadingStage>("reading_resume");
  const [displayProgress, setDisplayProgress] = useState(0);
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [diagnoseMode, setDiagnoseMode] = useState<'basic' | 'deep'>('basic');
  const [deepFallbackMsg, setDeepFallbackMsg] = useState<string | null>(null);
  const apiDone = useRef(false);
  const resultReady = useRef(false);
  // 防止 React StrictMode 在 dev 下双调 useEffect 导致 /api/diagnose 被发两次
  // V4 工作流要跑 ~2 分钟 + 12 次 AI 调用，重复请求代价非常高
  const apiCalledOnce = useRef(false);

  // 根据模式选择配置
  const STAGE_CONFIG = useMemo(
    () => (diagnoseMode === 'deep' ? STAGE_CONFIG_DEEP : STAGE_CONFIG_BASIC),
    [diagnoseMode]
  );

  // Smooth progress animation
  useEffect(() => {
    const target = STAGE_CONFIG[stage].progress;
    if (displayProgress >= target) return;

    const timer = setInterval(() => {
      setDisplayProgress((prev) => {
        const next = prev + 1;
        if (next >= target) {
          clearInterval(timer);
          return target;
        }
        return next;
      });
    }, 30);

    return () => clearInterval(timer);
  }, [stage, displayProgress, STAGE_CONFIG]);

  // Advance pre-API stages automatically
  useEffect(() => {
    const preApiStages: LoadingStage[] = [
      "reading_resume",
      "parsing_resume",
      "validating_input",
      "matching_rules",
      "retrieving_corpus",
    ];

    const currentIdx = preApiStages.indexOf(stage);
    if (currentIdx === -1 || currentIdx >= preApiStages.length - 1) return;

    const duration = STAGE_CONFIG[stage].duration;
    const timer = setTimeout(() => {
      if (!apiDone.current) {
        setStage(preApiStages[currentIdx + 1]);
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [stage, STAGE_CONFIG]);

  // Call API
  useEffect(() => {
    // 卫兵：StrictMode 双调防护 + 防止任何意外重入
    if (apiCalledOnce.current) return;
    apiCalledOnce.current = true;

    const diagnoseDataStr = sessionStorage.getItem("diagnoseData");
    if (!diagnoseDataStr) {
      setDiagnoseError("诊断数据不存在，请重新输入");
      setStage("error");
      return;
    }

    let diagnoseData;
    try {
      diagnoseData = JSON.parse(diagnoseDataStr);
    } catch {
      setDiagnoseError("数据格式错误，请重新输入");
      setStage("error");
      return;
    }

    const { resumeText, resumeParagraphs, targetRole, jobDescription, tier, diagnoseMode = 'basic', uploadedFileId, sourceType } = diagnoseData;

    // 设置诊断模式
    setDiagnoseMode(diagnoseMode);

    if (!resumeText?.trim() || !targetRole?.trim()) {
      setDiagnoseError("简历文本和目标岗位不能为空");
      setStage("error");
      return;
    }

    // 异步流程：POST /api/diagnose/tasks → 轮询 /api/diagnose/tasks/[id]
    // → done 时 GET /api/diagnose/report/[id] → 落 sessionStorage → 跳转
    const POLL_INTERVAL_MS = 3000;
    const MAX_POLL_MS = 180_000; // 3 分钟硬上限：V4 正常 60-120s，超过即判失败
    let cancelled = false;

    const runAsyncDiagnose = async () => {
      try {
        // 1) 创建任务（应在 ≤3s 内返回）
        const createResp = await fetch("/api/diagnose/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resume_text: resumeText,
            resume_paragraphs: Array.isArray(resumeParagraphs) ? resumeParagraphs : undefined,
            target_role: targetRole,
            jd_text: jobDescription || "",
            tier: tier || "free",
            diagnose_mode: diagnoseMode,
            source_type: sourceType || 'paste',
            uploaded_file_id: uploadedFileId || undefined,
          }),
        });

        if (!createResp.ok) {
          const errorData = await createResp.json().catch(() => ({}));
          if (createResp.status === 422 || createResp.status === 400) {
            throw new Error(errorData.error || "输入内容质量不足，无法生成诊断结果。");
          }
          throw new Error(errorData.error || `创建诊断任务失败: ${createResp.status}`);
        }

        const { task_id: taskId } = await createResp.json();
        if (!taskId) {
          throw new Error("服务端未返回任务 ID，请稍后重试");
        }

        // 2) 轮询任务状态。前端 stage 动画自然推进，不依赖后端节奏
        const startedAt = Date.now();
        let reportId: string | null = null;

        while (!cancelled) {
          if (Date.now() - startedAt > MAX_POLL_MS) {
            throw new Error(
              "诊断超时（3 分钟）。云端 serverless 可能受函数超时限制；建议本地运行或重试。"
            );
          }

          await delay(POLL_INTERVAL_MS);
          if (cancelled) return;

          const statusResp = await fetch(`/api/diagnose/tasks/${taskId}`, { cache: "no-store" });
          if (!statusResp.ok) {
            // 偶发网络错误：继续轮询，不立刻失败
            continue;
          }

          const statusData = await statusResp.json();
          const status: string = statusData.status;

          if (status === "done") {
            reportId = statusData.report_id;
            break;
          }
          if (status === "failed") {
            throw new Error(statusData.error_message || "诊断执行失败，请稍后重试");
          }
          // queued / running → 继续轮询
        }

        if (cancelled) return;
        if (!reportId) {
          throw new Error("诊断完成但未返回报告 ID，请重试");
        }

        // 3) 拉取最终报告
        const reportResp = await fetch(`/api/diagnose/report/${reportId}`, { cache: "no-store" });
        if (!reportResp.ok) {
          const errorData = await reportResp.json().catch(() => ({}));
          throw new Error(errorData.error || `读取诊断报告失败: ${reportResp.status}`);
        }
        const result = await reportResp.json();
        sessionStorage.setItem("diagnoseResult", JSON.stringify(result));

        apiDone.current = true;
        resultReady.current = true;

        // Deep fallback detection
        const isDeepFallback =
          result.metadata?.diagnose_mode === 'deep' &&
          result.metadata?.deep_diagnosis === false &&
          result.metadata?.deep_fallback_message;

        if (isDeepFallback) {
          setDeepFallbackMsg(result.metadata.deep_fallback_message);
          setStage("generating_report");
          await delay(600);
          setStage("formatting_result");
          await delay(400);
          setStage("complete");
          await delay(400);
          setIsTransitioning(true);
          await delay(300);
          router.push(`/diagnose/result/${reportId}`);
          return;
        }

        setStage("generating_report");
        await delay(800);
        setStage("formatting_result");
        await delay(500);
        setStage("complete");
        await delay(400);
        setIsTransitioning(true);
        await delay(300);
        router.push(`/diagnose/result/${reportId}`);
      } catch (error) {
        if (cancelled) return;
        console.error("诊断失败:", error);
        apiDone.current = true;
        setDiagnoseError(
          error instanceof Error ? error.message : "诊断失败，请稍后重试"
        );
        setStage("error");
      }
    };

    runAsyncDiagnose();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const config = STAGE_CONFIG[stage];

  return (
    <div
      className={`min-h-screen bg-neutral-50 text-neutral-900 transition-opacity duration-300 ${
        isTransitioning ? "opacity-0" : "opacity-100"
      }`}
    >
      <AppTopNav current="diagnose" />

      <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-3xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="w-full rounded-lg border border-neutral-400 bg-white p-6 sm:p-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
              {stage === "error" ? "诊断出现问题" : "正在生成结果"}
            </h1>

            {diagnoseError && (
              <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-8 text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-red-700">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-7 w-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-neutral-900">
                  诊断失败
                </h3>
                <p className="mt-3 text-sm leading-7 text-red-700">
                  {diagnoseError}
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/diagnose")}
                  className="mt-6 rounded-2xl bg-red-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-red-700"
                >
                  返回重新输入
                </button>
              </div>
            )}

            {!diagnoseError && (
              <div className="mt-8 rounded-lg border border-neutral-400 bg-neutral-100 p-6">
                {/* Stage icon */}
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-neutral-200 text-neutral-700">
                  {stage === "complete" ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <path d="M22 4 12 14.01l-3-3" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6 animate-spin"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  )}
                </div>

                <h3 className="text-lg font-semibold tracking-tight text-neutral-900">
                  {config.label}
                </h3>

                {/* Progress bar */}
                <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-300">
                  <div
                    className="h-1.5 rounded-full bg-neutral-700 transition-all duration-500 ease-out"
                    style={{ width: `${displayProgress}%` }}
                  />
                </div>

                {/* Stage indicators */}
                <div className="mt-4 flex items-center justify-center gap-1.5">
                  {(
                    [
                      "reading_resume",
                      "parsing_resume",
                      "validating_input",
                      "matching_rules",
                      "retrieving_corpus",
                      "generating_report",
                      "formatting_result",
                    ] as LoadingStage[]
                  ).map((s) => {
                    const stageIdx = Object.keys(STAGE_CONFIG).indexOf(s);
                    const currentIdx = Object.keys(STAGE_CONFIG).indexOf(stage);
                    const isActive = s === stage;
                    const isDone = stageIdx < currentIdx;

                    return (
                      <div
                        key={s}
                        className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                          isActive
                            ? "h-2 w-2 bg-neutral-700"
                            : isDone
                            ? "bg-neutral-500"
                            : "bg-slate-300"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {!diagnoseError && (
              <p className="mt-6 text-xs text-neutral-500">
                {stage === "complete"
                  ? "即将跳转到结果页"
                  : "预计需要 1-2 分钟，期间会持续查询任务状态"}
              </p>
            )}

            {deepFallbackMsg && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-800">深度诊断暂时不可用</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  当前先展示基础诊断结果，你仍然可以先按这份结果修改。
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

