import type { DiagnoseReport, DiagnoseRequest } from './types';
import { runV4DiagnoseWorkflow } from './v4/workflow';
import { getCachedReport, setCachedReport, invalidateCachedReport } from './cache';
import { logWarn, logInfo } from '../error-handler';

// 惰性导入 prisma，避免 build 阶段 eager 加载 pg 驱动
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

// ════════════════════════════════════════════════════════════════
// V4 入口（统一工作流）
// ════════════════════════════════════════════════════════════════

export interface V4DiagnoseInput {
  resume_text: string;
  resume_paragraphs?: string[];
  target_role: string;
  jd_text?: string;
  tier?: 'free' | 'paid';                 // 仅供限流，对报告内容无影响
  source_type?: 'paste' | 'pdf';
  uploaded_file_id?: string;
  force_refresh?: boolean;                 // 跳过缓存
}

/**
 * V4 诊断主入口：先查缓存，未命中则跑 V4 工作流并写缓存
 */
export async function runV4Diagnosis(input: V4DiagnoseInput): Promise<DiagnoseReport> {
  const { resume_text, target_role, jd_text = '', force_refresh = false } = input;

  // 1. 缓存查询（force_refresh 时跳过）
  if (!force_refresh) {
    const cached = getCachedReport({ resume_text, target_role, jd_text });
    if (cached) {
      logInfo('V4Diagnose', '缓存命中，直接返回', {
        cache_hit: true,
        target_role,
      });
      return cached;
    }
  } else {
    invalidateCachedReport({ resume_text, target_role, jd_text });
    logInfo('V4Diagnose', 'force_refresh：已主动失效缓存');
  }

  // 2. 跑 V4 工作流
  const request: DiagnoseRequest = {
    resume_text,
    resume_paragraphs: input.resume_paragraphs,
    target_role,
    jd_text,
    tier: input.tier ?? 'free',
  };
  const report = await runV4DiagnoseWorkflow(request);

  // 3. 写缓存（即使 force_refresh 也写入，供后续命中）
  setCachedReport({ resume_text, target_role, jd_text }, report);

  return report;
}

/**
 * 把 V4 DiagnoseReport 落库（复用 DiagnoseSession + DiagnoseReport 表）
 */
export async function saveV4DiagnoseReport(
  report: DiagnoseReport,
  input: V4DiagnoseInput
): Promise<string | null> {
  try {
    const prisma = await getPrisma();

    const meta = report.metadata ?? ({} as DiagnoseReport['metadata']);
    const totalAssessment = report.total_assessment ?? '（总评数据缺失）';
    const scenario = report.scenario ?? 'normal';

    const session = await prisma.diagnoseSession.create({
      data: {
        targetRole: input.target_role,
        jdText: input.jd_text || null,
        resumeText: input.resume_text,
        sourceType: input.uploaded_file_id ? 'pdf' : (input.source_type ?? 'paste'),
        uploadedFileId: input.uploaded_file_id || null,
        jdQuality: meta.has_jd ? 'sufficient' : 'none',
        inputQuality: scenario === 'insufficient_input' ? 'insufficient' : 'sufficient',
        scenario,
        schemaVersion: meta.schema_version ?? '4.0',
        tier: input.tier ?? 'free',
      },
    });

    const dbReport = await prisma.diagnoseReport.create({
      data: {
        sessionId: session.id,
        mainJudgment: totalAssessment.slice(0, 500),
        reportJson: JSON.parse(JSON.stringify(report)),
        modelName: 'deepseek-chat',
        confidence: null,
        auditJson: undefined,
        providerTraceJson: JSON.parse(JSON.stringify({
          schema_version: meta.schema_version,
          workflow_steps: meta.workflow_steps,
          workflow_duration_ms: meta.workflow_duration_ms,
          cache_hit: meta.cache_hit ?? false,
        })) || undefined,
        coverageVersion: '4.0',
      },
    });

    return dbReport.id;
  } catch (dbError) {
    logWarn('V4Diagnose', 'V4 落库失败', {
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    return null;
  }
}

/**
 * V4 完整流程：诊断 + 保存
 */
export async function runV4DiagnosisAndSave(
  input: V4DiagnoseInput
): Promise<{ report: DiagnoseReport; reportId: string | null }> {
  const report = await runV4Diagnosis(input);

  // 缓存命中时不重复落库
  if (report.metadata?.cache_hit) {
    logInfo('V4Diagnose', '缓存命中，跳过落库');
    return { report, reportId: null };
  }

  const reportId = await saveV4DiagnoseReport(report, input);
  return { report, reportId };
}