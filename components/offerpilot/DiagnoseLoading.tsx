"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AppTopNav from "@/components/offerpilot/AppTopNav";

export default function DiagnoseLoading() {
  const router = useRouter();
  const [currentLabel, setCurrentLabel] = useState<string>("正在连接诊断引擎并解析岗位...");
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [isHealing, setIsHealing] = useState(false);
  const [deepFallbackMsg, setDeepFallbackMsg] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const diagnoseDataStr = sessionStorage.getItem("diagnoseData");
    if (!diagnoseDataStr) {
      setDiagnoseError("诊断数据不存在，请重新输入");
      return;
    }

    let diagnoseData: Record<string, unknown>;
    try {
      diagnoseData = JSON.parse(diagnoseDataStr);
    } catch {
      setDiagnoseError("数据格式错误，请重新输入");
      return;
    }

    const {
      resumeText,
      resumeParagraphs,
      targetRole,
      jobDescription,
      tier,
      diagnoseMode = "basic",
      uploadedFileId,
      sourceType,
    } = diagnoseData as Record<string, string | undefined>;

    if (!resumeText?.trim() || !targetRole?.trim()) {
      setDiagnoseError("简历文本和目标岗位不能为空");
      return;
    }

    const POLL_INTERVAL_MS = 2000;
    const MAX_SILENT_MS = 60_000; // 连续 60 秒没有任何心跳才判定假死

    const runAsyncDiagnose = async () => {
      try {
        let taskId = sessionStorage.getItem("diagnoseTaskId");

        // 1) 如果已有正在进行的任务则复用，否则创建新任务
        if (!taskId) {
          setCurrentLabel("正在创建诊断任务单...");
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
              source_type: sourceType || "paste",
              uploaded_file_id: uploadedFileId || undefined,
            }),
          });

          if (!createResp.ok) {
            const errorData = await createResp.json().catch(() => ({}));
            if (createResp.status === 422 || createResp.status === 400) {
              throw new Error(errorData.error || "输入内容质量不足，无法生成诊断结果");
            }
            throw new Error(errorData.error || `创建诊断任务失败: ${createResp.status}`);
          }

          const createData = await createResp.json();
          taskId = createData.task_id;
          const createdStatus = createData.status;
          const createdReportId = createData.report_id;

          if (!taskId) {
            throw new Error("服务端未返回任务 ID，请稍后重试");
          }

          sessionStorage.setItem("diagnoseTaskId", taskId);

          // 如果直接返回 done（如 demo safe 或同步命中）
          if (createdStatus === "done" && createdReportId) {
            await fetchAndCompleteReport(createdReportId);
            return;
          }
        }

        if (!isMountedRef.current) return;
        setCurrentTaskId(taskId);

        // 触发 worker
        const triggerWorker = (forceRestart = false) => {
          fetch("/api/internal/diagnose-worker", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task_id: taskId, force_restart: forceRestart }),
          }).catch(() => undefined);
        };

        triggerWorker(false);

        // 2) 智能心跳轮询与自愈控制器
        let reportId: string | null = null;
        let lastActiveTimestamp = Date.now();
        let healRetryCount = 0;
        let queuedWaitSec = 0;

        while (isMountedRef.current) {
          await delay(POLL_INTERVAL_MS);
          if (!isMountedRef.current) return;

          const statusResp = await fetch(`/api/diagnose/tasks/${taskId}`, { cache: "no-store" });
          if (!statusResp.ok) {
            // 偶发网络抖动，继续轮询
            continue;
          }

          const statusData = await statusResp.json();
          const status: string = statusData.status;

          // 更新界面阶段文案
          if (statusData.step_label && isMountedRef.current) {
            setCurrentLabel(statusData.step_label);
          }

          if (status === "done") {
            reportId = statusData.report_id;
            break;
          }

          if (status === "failed") {
            sessionStorage.removeItem("diagnoseTaskId");
            throw new Error(statusData.error_message || "诊断执行失败，请稍后重试");
          }

          // 如果任务在排队状态超过 5 秒，立即重新激活 Worker
          if (status === "queued") {
            queuedWaitSec += POLL_INTERVAL_MS / 1000;
            if (queuedWaitSec >= 5) {
              queuedWaitSec = 0;
              triggerWorker(true);
            }
            lastActiveTimestamp = Date.now();
            continue;
          }

          // 任务处于 running 状态：检查活跃心跳
          if (status === "running") {
            const isAlive = statusData.is_alive ?? true;
            if (isAlive) {
              // 活跃中：重置沉默计时器
              lastActiveTimestamp = Date.now();
              healRetryCount = 0;
              if (isMountedRef.current) setIsHealing(false);
            } else {
              // 心跳停滞：超过 25 秒无动静，尝试唤起自愈
              const silentMs = Date.now() - lastActiveTimestamp;
              if (silentMs > 25_000 && healRetryCount < 3) {
                healRetryCount++;
                if (isMountedRef.current) {
                  setIsHealing(true);
                  setCurrentLabel(`正在重新激活分析进程（尝试 ${healRetryCount}/3）...`);
                }
                triggerWorker(true);
              } else if (silentMs > MAX_SILENT_MS) {
                sessionStorage.removeItem("diagnoseTaskId");
                throw new Error("诊断计算进程无响应（心跳中断），已自动停止等待。建议点击下方按钮重新唤醒。");
              }
            }
          }
        }

        if (!isMountedRef.current) return;
        if (!reportId) {
          throw new Error("诊断完成但未返回报告 ID，请重试");
        }

        // 3) 拉取最终报告并跳转
        await fetchAndCompleteReport(reportId);

      } catch (error) {
        if (!isMountedRef.current) return;
        console.error("诊断失败:", error);
        setDiagnoseError(
          error instanceof Error ? error.message : getErrorMessage(error, "诊断失败，请稍后重试")
        );
      }
    };

    const fetchAndCompleteReport = async (targetReportId: string) => {
      if (isMountedRef.current) setCurrentLabel("诊断已完成，正在载入报告...");
      const reportResp = await fetch(`/api/diagnose/report/${targetReportId}`, { cache: "no-store" });
      if (!reportResp.ok) {
        const errorData = await reportResp.json().catch(() => ({}));
        throw new Error(getErrorMessage(errorData, `读取诊断报告失败: ${reportResp.status}`));
      }
      const result = await reportResp.json();
      sessionStorage.setItem("diagnoseResult", JSON.stringify(result));
      sessionStorage.removeItem("diagnoseTaskId");

      // Deep fallback detection
      const isDeepFallback =
        result.metadata?.diagnose_mode === "deep" &&
        result.metadata?.deep_diagnosis === false &&
        result.metadata?.deep_fallback_message;

      if (isDeepFallback && isMountedRef.current) {
        setDeepFallbackMsg(result.metadata.deep_fallback_message);
      }

      if (isMountedRef.current) {
        setCurrentLabel("正在呈现诊断结果...");
        await delay(300);
        setIsTransitioning(true);
        await delay(200);
        router.push(`/diagnose/result/${targetReportId}`);
      }
    };

    runAsyncDiagnose();

    return () => {
      isMountedRef.current = false;
    };
  }, [router]);

  const handleRetryWakeup = () => {
    sessionStorage.removeItem("diagnoseTaskId");
    if (!currentTaskId) {
      router.push("/diagnose");
      return;
    }
    setDiagnoseError(null);
    setIsHealing(true);
    setCurrentLabel("正在重新唤醒诊断任务...");
    fetch("/api/internal/diagnose-worker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: currentTaskId, force_restart: true }),
    }).catch(() => undefined);

    // 重新进入轮询
    window.location.reload();
  };

  return (
    <div
      className={`op-page transition-opacity duration-300 ${
        isTransitioning ? "opacity-0" : "opacity-100"
      }`}
    >
      <AppTopNav current="diagnose" />

      <main className="op-loading op-wrap">
        <div>
          {diagnoseError ? (
            <div>
              <h1 className="op-section-title">诊断出现问题</h1>
              <p className="mt-4 text-sm leading-7 text-[var(--op-muted)]">{diagnoseError}</p>
              <div className="mt-7 flex items-center gap-4">
                <button
                  type="button"
                  onClick={handleRetryWakeup}
                  className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
                >
                  重新激活当前诊断
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/diagnose")}
                  className="op-link text-sm"
                >
                  返回重新输入
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="op-loading-status">
                <span className="op-pulse" />
                <span className="op-loading-copy">
                  {currentLabel.replace(/\./g, "").replace(/。/g, "")}
                </span>
              </div>
              <p className="mt-4 text-xs text-[var(--op-faint)]">
                V4 深度工作流正在进行多阶段推演与多模型交叉验证，通常耗时 40~90 秒，请耐心等待...
              </p>
              {isHealing && (
                <p className="mt-2 text-xs text-amber-600">
                  ⚡ 检测到进程轻微迟滞，正在自动维持心跳与自愈连接...
                </p>
              )}
              {deepFallbackMsg && (
                <p className="mt-5 text-xs leading-6 text-[var(--op-muted)]">
                  {deepFallbackMsg}
                </p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "object") {
    const data = error as { error?: unknown; message?: unknown };
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;
    if (data.error && typeof data.error === "object") {
      const nested = data.error as { message?: unknown };
      if (typeof nested.message === "string") return nested.message;
    }
  }
  return fallback;
}


