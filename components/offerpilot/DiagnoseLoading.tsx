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

    const callAPI = async () => {
      try {
        const response = await fetch("/api/diagnose", {
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

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 422) {
            throw new Error(
              errorData.error || "输入内容质量不足，无法生成诊断结果。"
            );
          }
          throw new Error(errorData.error || `诊断失败: ${response.status}`);
        }

        const result = await response.json();
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
          // Show brief fallback transition before jumping to result
          setStage("generating_report");
          await delay(600);
          setStage("formatting_result");
          await delay(400);
          setStage("complete");
          await delay(400);
          setIsTransitioning(true);
          await delay(300);

          const reportId = result.report_id;
          if (reportId && typeof reportId === 'string') {
            router.push(`/diagnose/result/${reportId}`);
          } else {
            router.push("/diagnose/result");
          }
          return;
        }

        // Advance through final stages
        setStage("generating_report");
        await delay(800);
        setStage("formatting_result");
        await delay(500);
        setStage("complete");
        await delay(400);

        // Smooth transition to result
        setIsTransitioning(true);
        await delay(300);

        // 如果响应中包含 report_id，则跳转到可分享的带ID结果页
        const reportId = result.report_id;
        if (reportId && typeof reportId === 'string') {
          router.push(`/diagnose/result/${reportId}`);
        } else {
          // 否则回退到传统的 sessionStorage 结果页
          router.push("/diagnose/result");
        }
      } catch (error) {
        console.error("诊断失败:", error);
        apiDone.current = true;
        setDiagnoseError(
          error instanceof Error ? error.message : "诊断失败，请稍后重试"
        );
        setStage("error");
      }
    };

    callAPI();
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
                  : "预计需要 10-30 秒"}
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

