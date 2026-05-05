"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppTopNav from "@/components/offerpilot/AppTopNav";

type UploadState = "idle" | "uploading" | "ready";
type UploadStage = "uploading" | "extracting" | "structuring";

// sessionStorage key constants
const SS_REFILL = "diagnoseRefill";
const SS_RESULT = "diagnoseResult";
const SS_DATA = "diagnoseData";

const STAGE_LABELS: Record<UploadStage, { primary: string; secondary: string }> = {
  uploading:   { primary: "正在上传文件",     secondary: "将简历传至服务器" },
  extracting:  { primary: "正在提取文本",     secondary: "从 PDF 中读取可编辑内容" },
  structuring: { primary: "正在整理结构",     secondary: "识别段落，准备分析" },
};

// Numeric progress target per stage (used for smooth animated fill)
const STAGE_PROGRESS: Record<UploadStage, number> = {
  uploading:   28,
  extracting:  62,
  structuring: 88,
};

// Demo resume example for interactive testing
const DEMO_RESUME_EXAMPLE = `张三

联系电话：138-8888-8888 | 邮箱：zhangsan@example.com
求职意向：内容运营 / 产品助理

教育背景
- 北京大学，新闻与传播学院，传播学专业，本科（2020-2024）
- GPA：3.7/4.0，连续三年获得校级奖学金

实习经历
1. 字节跳动，内容运营实习生（2023.06-2023.09）
   - 负责旗下短视频平台的内容策划与数据分析
   - 协助运营账号，月均阅读量提升 150%
   - 策划的#职场话题活动获得 10w+ 参与量

2. 腾讯，产品助理实习生（2022.07-2022.10）
   - 参与社交产品用户调研与需求分析
   - 协助撰写产品需求文档，跟进开发进度
   - 提出的 3 项改进建议被团队采纳并上线

项目经历
- 校园媒体「未名新闻」主编（2021-2023）
  - 带领 15 人团队，负责选题策划与内容审核
  - 公众号粉丝从 5000 增长至 20000+

技能证书
- 语言：英语六级（CET-6），能无障碍阅读英文文献
- 工具：熟练使用 Office、Photoshop、Figma
- 证书：新媒体运营师（中级）

自我评价
热爱内容创作与用户运营，具备较强的数据分析能力和团队协作精神。希望能在贵公司发挥所长，共同成长。`;

function useProgressAnimation(target: number) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const currentRef = useRef(0);

  useEffect(() => {
    const animate = () => {
      const diff = target - currentRef.current;
      if (Math.abs(diff) < 0.3) {
        currentRef.current = target;
        setProgress(target);
        return;
      }
      // Ease toward target — faster when far, slower as it approaches
      currentRef.current += diff * 0.07;
      setProgress(currentRef.current);
      rafRef.current = requestAnimationFrame(animate);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return progress;
}

function validateInputQuality(text: string): { isValid: boolean; message?: string } {
  const trimmed = text.trim();
  if (trimmed.length < 100) {
    return { isValid: false, message: "简历文本长度不足100字，请补充更多内容。" };
  }
  if (/^\d+$/.test(trimmed)) {
    return { isValid: false, message: "简历文本不能仅为数字，请粘贴有效的简历内容。" };
  }
  const unusualCharRegex = /[^\u4e00-\u9fa5a-zA-Z0-9\s，。；：！？、（）《》【】""''…—\-\.,\;\!\?\(\)\[\]\{\}\<\>\:\"\'\`\~]/g;
  const matches = trimmed.match(unusualCharRegex);
  if (matches && matches.length > trimmed.length * 0.1) {
    return { isValid: false, message: "检测到较多异常字符，可能是乱码或格式错误，请检查粘贴内容。" };
  }
  return { isValid: true };
}

export default function DiagnoseInput() {
  const router = useRouter();

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadStage, setUploadStage] = useState<UploadStage>("uploading");
  const [fileName, setFileName] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeParagraphs, setResumeParagraphs] = useState<string[]>([]);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [inputQualityError, setInputQualityError] = useState<string | null>(null);
  const [canReturnToResult, setCanReturnToResult] = useState(false);
  // PDF parse quality fields
  const [extractionQuality, setExtractionQuality] = useState<'high' | 'medium' | 'low' | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'pdf' | 'paste'>('pdf');
  const [needsParseReview, setNeedsParseReview] = useState(false);
  const [parseReviewConfirmed, setParseReviewConfirmed] = useState(false);
  const [rawExtractedText, setRawExtractedText] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [usingDemo, setUsingDemo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derived: whether PDF parse is in flight
  const isParsingPdf = uploadState === "uploading";

  // Smooth progress bar
  const progressTarget = isParsingPdf ? STAGE_PROGRESS[uploadStage] : (uploadState === "ready" ? 100 : 0);
  const progressValue = useProgressAnimation(progressTarget);

  // Restore from sessionStorage refill (continue-optimize flow)
  useEffect(() => {
    try {
      const refill = sessionStorage.getItem(SS_REFILL);
      if (refill) {
        const data = JSON.parse(refill);
        if (data.resumeText) setResumeText(data.resumeText);
        if (data.targetRole) setTargetRole(data.targetRole);
        if (data.jobDescription) setJobDescription(data.jobDescription);
        setUploadState("ready");
        setFileName(data.fileName || "继续优化的简历");
        // Restore source info for continue-optimize flow
        if (data.sourceType) setSourceType(data.sourceType);
        if (data.uploadedFileId !== undefined) setUploadedFileId(data.uploadedFileId);
        if (data.fromResult && sessionStorage.getItem(SS_RESULT)) {
          setCanReturnToResult(true);
        }
        sessionStorage.removeItem(SS_REFILL);

        if (data.scrollTo) {
          setTimeout(() => {
            const textarea = document.getElementById("resumeText") as HTMLTextAreaElement | null;
            if (!textarea) return;
            const text = data.resumeText || "";
            const snippet = data.scrollTo.text_snippet;
            if (snippet) {
              const idx = text.indexOf(snippet.substring(0, 30));
              if (idx >= 0) {
                const linesBefore = text.substring(0, idx).split("\n").length;
                textarea.scrollTop = Math.max(0, (linesBefore - 3) * 28);
                textarea.setSelectionRange(idx, Math.min(idx + snippet.length, text.length));
                textarea.focus();
              }
            } else if (data.scrollTo.paragraph_index !== undefined) {
              const paragraphs = text.split(/\n\s*\n/);
              let charOffset = 0;
              for (let i = 0; i < data.scrollTo.paragraph_index && i < paragraphs.length; i++) {
                charOffset += paragraphs[i].length + 2;
              }
              const linesBefore = text.substring(0, charOffset).split("\n").length;
              textarea.scrollTop = Math.max(0, (linesBefore - 3) * 28);
              textarea.focus();
            }
          }, 500);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const hasJdWarning = !jobDescription.trim();
  const canStart =
    uploadState === "ready" &&
    targetRole.trim().length > 0 &&
    resumeText.trim().length > 0 &&
    // For low/medium quality PDFs, user must confirm parse review
    !(sourceType === 'pdf' && (extractionQuality === 'low' || extractionQuality === 'medium') && !parseReviewConfirmed);

  const handleFileSelect = () => fileInputRef.current?.click();

  const parsePdfFile = async (file: File) => {
    setCanReturnToResult(false);
    setPdfError(null);
    setUploadState("uploading");
    setUploadStage("uploading");

    const formData = new FormData();
    formData.append("file", file);

    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      setUploadStage("extracting");

      const response = await fetch("/api/pdf/parse", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `PDF解析失败: ${response.status}`);
      }

      setUploadStage("structuring");
      await new Promise((resolve) => setTimeout(resolve, 350));

      const result = await response.json();
      const {
        text,
        paragraphs,
        fileName: parsedFileName,
        extraction_quality: extractionQuality,
        uploadedFileId: uploadedFileId,
      } = result;

      if (!text || typeof text !== "string") {
        throw new Error("解析结果格式错误");
      }

      const pArr: string[] =
        Array.isArray(paragraphs) && paragraphs.length > 0 ? paragraphs : [];
      const displayText = pArr.length > 0 ? pArr.join("\n\n") : text;

      setResumeText(displayText);
      setResumeParagraphs(pArr);
      setFileName(parsedFileName || file.name);
      setSourceType('pdf');
      setUploadedFileId(uploadedFileId || null);
      setExtractionQuality(extractionQuality || 'high');
      setRawExtractedText(text); // Store original extracted text for preview
      setShowPreview(false);

      // Low/medium quality → show review state
      if (extractionQuality === 'low') {
        setNeedsParseReview(true);
        setParseReviewConfirmed(false);
        setUploadState("ready");
      } else if (extractionQuality === 'medium') {
        setNeedsParseReview(true);
        setParseReviewConfirmed(false);
        setUploadState("ready");
      } else {
        setNeedsParseReview(false);
        setParseReviewConfirmed(true); // High quality doesn't need confirmation
        setUploadState("ready");
      }
    } catch (error) {
      console.error("PDF解析失败:", error);
      setPdfError(
        error instanceof Error
          ? error.message
          : "PDF解析失败，请改为手动粘贴简历文本"
      );
      setUploadState("idle");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setPdfError("仅支持PDF文件，请选择PDF文件或手动粘贴文本");
      return;
    }
    parsePdfFile(file);
  };

  const handleManualPaste = () => {
    setCanReturnToResult(false);
    setPdfError(null);
    setNeedsParseReview(false);
    setParseReviewConfirmed(false);
    setSourceType('paste');
    setUploadedFileId(null);
    setExtractionQuality('high');
    setUploadState("ready");
    setFileName("手动输入的简历文本");
    setUsingDemo(false);
  };

  const handleDemoExample = () => {
    setCanReturnToResult(false);
    setPdfError(null);
    setNeedsParseReview(false);
    setParseReviewConfirmed(false);
    setSourceType('paste');
    setUploadedFileId(null);
    setExtractionQuality('high');
    setUploadState("ready");
    setFileName("示例简历");
    setResumeText(DEMO_RESUME_EXAMPLE);
    setUsingDemo(true);
    // Set sample target role and job description for demo
    if (!targetRole.trim()) {
      setTargetRole("内容运营 / 产品助理");
    }
    if (!jobDescription.trim()) {
      setJobDescription("岗位职责：\n- 负责新媒体平台的内容策划与运营\n- 进行用户调研与数据分析\n- 协助产品功能迭代与优化\n\n任职要求：\n- 本科及以上学历，传播学/新闻学/市场营销相关专业优先\n- 有内容运营或产品实习经验者优先\n- 具备良好的数据分析能力和文案功底");
    }
  };

  const handleReplace = () => {
    setCanReturnToResult(false);
    setUploadState("idle");
    setFileName("");
    setPdfError(null);
    setParseReviewConfirmed(false);
    setUsingDemo(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleStartDiagnose = () => {
    if (!canStart) return;
    setInputQualityError(null);
    const validation = validateInputQuality(resumeText);
    if (!validation.isValid) {
      setInputQualityError(validation.message || "输入内容质量不足，请检查后重试。");
      return;
    }
    const diagnoseData = {
      resumeText,
      resumeParagraphs,
      targetRole,
      jobDescription,
      tier: "free" as const,
      uploadedFileId,
      sourceType,
    };
    sessionStorage.setItem(SS_DATA, JSON.stringify(diagnoseData));
    router.push("/diagnose/loading");
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <AppTopNav current="diagnose" />

      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-8 text-center">
          <div className="text-xs font-bold tracking-widest uppercase text-neutral-500">
            Diagnose
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            开始诊断
          </h1>
        </div>

        <div className="rounded-lg border border-neutral-300 bg-white p-6 sm:p-8">
          {canReturnToResult && (
            <div className="mb-6 rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-3">
              <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-sm text-neutral-700">
                  你正在查看原文定位。可直接回到上次诊断结果继续查看。
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/diagnose/result")}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  返回诊断结果
                </button>
              </div>
            </div>
          )}

          {/* ── Idle: Upload zone ── */}
          {uploadState === "idle" && (
            <section className="mx-auto max-w-3xl">
              <div className="rounded-lg border border-dashed border-neutral-400 bg-neutral-100 px-6 py-10 text-center sm:px-8 sm:py-12">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-neutral-200 text-neutral-600">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
                    <path d="M14 2v7h7" />
                    <path d="M12 18v-6" />
                    <path d="M9.5 14.5 12 12l2.5 2.5" />
                  </svg>
                </div>

                <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
                  上传 PDF 简历
                </h2>

                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleFileSelect}
                  disabled={isParsingPdf}
                  className="mt-6 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-neutral-300"
                >
                  选择文件
                </button>

                {pdfError && (
                  <div className="mt-4 rounded-lg border border-neutral-300 bg-neutral-100 p-4">
                    <p className="text-sm font-medium text-neutral-700">{pdfError}</p>
                    <button
                      type="button"
                      onClick={handleManualPaste}
                      className="mt-3 rounded-md border border-neutral-400 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      改为手动粘贴文本
                    </button>
                  </div>
                )}

                {!pdfError && (
                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      onClick={handleManualPaste}
                      className="text-sm font-medium text-neutral-600 transition hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      或手动粘贴文本
                    </button>
                    <div className="text-xs text-neutral-500">或</div>
                    <button
                      type="button"
                      onClick={handleDemoExample}
                      className="text-sm font-medium text-primary transition hover:text-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      使用示例简历体验诊断
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-1 text-sm text-slate-500">
                <p>仅支持 PDF。</p>
                <p>如果是 Word 简历，下一步直接粘贴文本即可。</p>
              </div>
            </section>
          )}

          {/* ── Uploading: Three-stage progress ── */}
          {uploadState === "uploading" && (
            <section className="mx-auto max-w-3xl">
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  正在解析简历
                </h2>
              </div>

              <div className="rounded-lg border border-neutral-300 bg-neutral-100 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-neutral-600">{fileName}</div>
                    <div className="mt-1 text-sm font-medium text-neutral-900">
                      {STAGE_LABELS[uploadStage].primary}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {STAGE_LABELS[uploadStage].secondary}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleReplace}
                    className="text-sm font-medium text-neutral-700 transition hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    更改文件
                  </button>
                </div>

                {/* Smooth animated progress bar */}
                <div className="mt-4 h-1 overflow-hidden rounded-full bg-neutral-300">
                  <div
                    className="h-1 rounded-full bg-primary"
                    style={{
                      width: `${progressValue}%`,
                      transition: "none", // rAF loop handles it
                    }}
                  />
                </div>

                {/* Stage dots */}
                <div className="mt-3 flex items-center gap-1.5">
                  {(["uploading", "extracting", "structuring"] as UploadStage[]).map((s) => {
                    const stages: UploadStage[] = ["uploading", "extracting", "structuring"];
                    const isActive = s === uploadStage;
                    const isPast = stages.indexOf(s) < stages.indexOf(uploadStage);
                    return (
                      <div
                        key={s}
                        className={`h-1 rounded-full transition-all duration-300 ease-out ${
                          isPast
                            ? "w-5 bg-primary"
                            : isActive
                            ? "w-6 bg-primary"
                            : "w-2.5 bg-neutral-400"
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* ── Ready: Input form ── */}
          {uploadState === "ready" && (
            <section className="mx-auto max-w-3xl">
              {/* Parse quality banner */}
              {needsParseReview && extractionQuality === 'low' && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.282 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-neutral-900">解析质量较低</h3>
                      <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                        这份 PDF 可能是扫描版或排版复杂，建议检查提取结果后再决定是否继续。
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setNeedsParseReview(false);
                            setParseReviewConfirmed(true);
                          }}
                          className="rounded-md border border-neutral-400 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
                        >
                          继续使用解析结果
                        </button>
                        <button
                          type="button"
                          onClick={handleManualPaste}
                          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-dark"
                        >
                          改为手动粘贴
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {needsParseReview && extractionQuality === 'medium' && (
                <div className="mb-4 rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-neutral-600">
                      PDF 解析质量一般，建议在下方检查提取的文本是否完整。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setNeedsParseReview(false);
                        setParseReviewConfirmed(true);
                      }}
                      className="ml-3 rounded-md border border-neutral-400 bg-white px-3 py-1 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                    >
                      我已确认继续使用
                    </button>
                  </div>
                </div>
              )}

              {/* Parse quality preview panel */}
              {needsParseReview && rawExtractedText && (
                <div className="mb-6 rounded-lg border border-neutral-300 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-900">解析质量预览</h3>
                      <p className="mt-1 text-xs text-neutral-600">
                        原始提取文本与处理后的文本对比，检查提取是否完整。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPreview(!showPreview)}
                      className="rounded-md border border-neutral-400 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
                    >
                      {showPreview ? '隐藏对比' : '展开对比'}
                    </button>
                  </div>

                  {showPreview && (
                    <div className="mt-4 space-y-4">
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-neutral-900">原始提取文本</h4>
                          <span className="text-xs text-neutral-500">{rawExtractedText.length} 字符</span>
                        </div>
                        <div className="rounded border border-neutral-300 bg-neutral-50 p-3">
                          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-700">
                            {rawExtractedText}
                          </pre>
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-neutral-900">处理后文本（将用于诊断）</h4>
                          <span className="text-xs text-neutral-500">{resumeText.length} 字符</span>
                        </div>
                        <div className="rounded border border-neutral-300 bg-neutral-50 p-3">
                          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-700">
                            {resumeText}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mb-6 flex items-center justify-between gap-4 pb-4">
                <div className="min-w-0">
                  <div className="truncate text-sm text-neutral-600">{fileName}</div>
                  <div className="mt-1 flex items-center gap-2 text-sm font-medium text-neutral-900">
                    <span>已解析</span>
                    {extractionQuality && sourceType === 'pdf' && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        extractionQuality === 'high' ? 'bg-green-100 text-green-700' :
                        extractionQuality === 'medium' ? 'bg-neutral-200 text-neutral-600' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {extractionQuality === 'high' ? '解析质量高' : extractionQuality === 'medium' ? '解析质量一般' : '解析质量较低'}
                      </span>
                    )}
                    {usingDemo && (
                      <span className="inline-flex items-center rounded-full bg-primary-light px-2 py-0.5 text-[10px] font-medium text-primary-dark">
                        示例简历
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleReplace}
                  className="shrink-0 text-sm font-medium text-neutral-700 transition hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  更改文件
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label
                    htmlFor="targetRole"
                    className="mb-2 block text-sm font-semibold text-neutral-900"
                  >
                    目标岗位
                  </label>
                  <input
                    id="targetRole"
                    value={targetRole}
                    onChange={(event) => setTargetRole(event.target.value)}
                    placeholder="例如：内容运营 / 产品助理 / 用户运营"
                    className="w-full rounded-md border border-neutral-400 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-500 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-offset-0"
                  />
                </div>

                <div>
                  <label
                    htmlFor="jobDescription"
                    className="mb-2 block text-sm font-semibold text-neutral-900"
                  >
                    岗位要求
                  </label>
                  <textarea
                    id="jobDescription"
                    value={jobDescription}
                    onChange={(event) => setJobDescription(event.target.value)}
                    rows={6}
                    placeholder="粘贴岗位职责和任职要求"
                    className="w-full rounded-md border border-neutral-400 bg-white px-4 py-3 text-sm leading-relaxed text-neutral-900 outline-none transition placeholder:text-neutral-500 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-offset-0"
                  />
                  {hasJdWarning && (
                    <div className="mt-2 rounded-lg border border-neutral-300 bg-neutral-100 p-3">
                      <p className="text-xs font-medium text-neutral-700">未填写岗位描述时，匹配判断会受限。</p>
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="resumeText"
                    className="mb-2 block text-sm font-semibold text-neutral-900"
                  >
                    简历文本
                  </label>
                  <textarea
                    id="resumeText"
                    value={resumeText}
                    onChange={(event) => {
                      const newText = event.target.value;
                      setResumeText(newText);
                      if (usingDemo && newText !== DEMO_RESUME_EXAMPLE) {
                        setUsingDemo(false);
                      }
                    }}
                    onPaste={(event) => {
                      event.preventDefault();
                      const pasted = event.clipboardData.getData("text/plain");
                      const textarea = event.currentTarget;
                      const start = textarea.selectionStart;
                      const end = textarea.selectionEnd;
                      const newText =
                        resumeText.substring(0, start) +
                        pasted +
                        resumeText.substring(end);
                      setResumeText(newText);
                      setUsingDemo(false);
                    }}
                    rows={10}
                    placeholder="如果是 Word 简历，请直接粘贴文本。粘贴后会保留原有段落和分行。"
                    className="w-full rounded-md border border-neutral-400 bg-white px-4 py-3 text-sm leading-relaxed text-neutral-900 whitespace-pre-line outline-none transition placeholder:text-neutral-500 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 focus:ring-offset-0"
                  />
                </div>
              </div>

              <div className="mt-8">
                {inputQualityError && (
                  <div className="mb-4 rounded-lg border border-neutral-300 bg-neutral-100 p-4">
                    <p className="text-sm font-medium text-neutral-700">{inputQualityError}</p>
                  </div>
                )}

                {/* Parse review confirmation required */}
                {sourceType === 'pdf' && (extractionQuality === 'low' || extractionQuality === 'medium') && !parseReviewConfirmed && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-medium text-amber-700">请先确认解析结果可用</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleStartDiagnose}
                  disabled={!canStart}
                  className="w-full rounded-md bg-primary px-5 py-3 text-base font-semibold text-white transition hover:bg-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-neutral-300"
                >
                  开始诊断
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
