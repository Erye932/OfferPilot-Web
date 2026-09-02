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
热爱内容创作与用户运营，具备较强的数据分析能力和团队协作精神，希望能在贵公司发挥所长，共同成长`;

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
    return { isValid: false, message: "简历文本长度不足100字，请补充更多内容" };
  }
  if (/^\d+$/.test(trimmed)) {
    return { isValid: false, message: "简历文本不能仅为数字，请粘贴有效的简历内容" };
  }
  const unusualCharRegex = /[^\u4e00-\u9fa5a-zA-Z0-9\s，。；：！？、（）《》【】""''…—\-\.,\;\!\?\(\)\[\]\{\}\<\>\:\"\'\`\~]/g;
  const matches = trimmed.match(unusualCharRegex);
  if (matches && matches.length > trimmed.length * 0.1) {
    return { isValid: false, message: "检测到较多异常字符，可能是乱码或格式错误，请检查粘贴内容" };
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

  const handleStartDiagnose = () => {
    if (!canStart) return;
    setInputQualityError(null);
    const validation = validateInputQuality(resumeText);
    if (!validation.isValid) {
      setInputQualityError(validation.message || "输入内容质量不足，请检查后重试");
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
    <div className="op-page">
      <AppTopNav current="diagnose" />

      <main className="op-section op-wrap">
        <h1 className="op-section-title">开始诊断</h1>

        {canReturnToResult && (
          <div className="mb-8 flex items-center justify-between gap-4 border-t border-[var(--op-soft-line)] pt-5 text-sm text-[var(--op-muted)]">
            <span>你正在查看原文定位，可直接回到上次诊断结果继续查看</span>
            <button type="button" onClick={() => router.push("/diagnose/result")} className="op-link">
              返回诊断结果
            </button>
          </div>
        )}

        <div className="op-input-grid">
          <aside className="op-upload">
            <h2>简历</h2>
            <p>{uploadState === "uploading" ? STAGE_LABELS[uploadStage].primary : fileName || "PDF 或文本"}</p>

            <input
              type="file"
              accept=".pdf,application/pdf"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="op-upload-actions">
              <button type="button" onClick={handleFileSelect} disabled={isParsingPdf} className="op-link disabled:opacity-35">
                选择 PDF
              </button>
              <button type="button" onClick={handleManualPaste} className="op-link">
                粘贴文本
              </button>
              <button type="button" onClick={handleDemoExample} className="op-link">
                示例简历
              </button>
            </div>

            {uploadState === "uploading" && (
              <div className="mt-7 h-px overflow-hidden bg-[var(--op-soft-line)]">
                <div
                  className="h-px bg-[var(--op-ink)]"
                  style={{ width: `${progressValue}%`, transition: "none" }}
                />
              </div>
            )}

            {pdfError && (
              <p className="mt-5 text-sm leading-7 text-[var(--op-red)]">{pdfError}</p>
            )}
          </aside>

          <div className="op-form">
            {(needsParseReview || inputQualityError) && (
              <div className="op-field">
                {needsParseReview && (
                  <div className="flex items-center justify-between gap-4 text-sm text-[var(--op-muted)]">
                    <span>建议检查 PDF 解析结果</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNeedsParseReview(false);
                        setParseReviewConfirmed(true);
                      }}
                      className="op-link"
                    >
                      确认继续
                    </button>
                  </div>
                )}
                {inputQualityError && (
                  <p className="text-sm text-[var(--op-red)]">{inputQualityError}</p>
                )}
              </div>
            )}

            <div className="op-field">
              <label htmlFor="targetRole">目标岗位</label>
              <input
                id="targetRole"
                value={targetRole}
                onChange={(event) => setTargetRole(event.target.value)}
                placeholder="后端工程师"
              />
            </div>

            <div className="op-field">
              <label htmlFor="jobDescription">岗位要求</label>
              <textarea
                id="jobDescription"
                value={jobDescription}
                onChange={(event) => setJobDescription(event.target.value)}
                placeholder="粘贴 JD，可跳过"
              />
              {hasJdWarning && (
                <p className="text-xs text-[var(--op-faint)]">未填写岗位描述时，匹配判断会受限</p>
              )}
            </div>

            <div className="op-field">
              <label htmlFor="resumeText">简历内容</label>
              <textarea
                id="resumeText"
                value={resumeText}
                onChange={(event) => {
                  const newText = event.target.value;
                  if (uploadState !== "ready") {
                    setUploadState("ready");
                    setFileName("手动输入的简历文本");
                    setSourceType("paste");
                    setUploadedFileId(null);
                    setExtractionQuality("high");
                  }
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
                  if (uploadState !== "ready") {
                    setUploadState("ready");
                    setFileName("手动输入的简历文本");
                    setSourceType("paste");
                    setUploadedFileId(null);
                    setExtractionQuality("high");
                  }
                  setResumeText(newText);
                  setUsingDemo(false);
                }}
                placeholder="PDF 解析后显示在这里"
              />
            </div>

            <div className="op-submit">
              <span>完成后进入诊断报告</span>
              <button type="button" onClick={handleStartDiagnose} disabled={!canStart} className="op-link disabled:opacity-35">
                开始诊断
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
