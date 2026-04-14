import type { FreeDiagnoseResponse } from './types';
import { runFreeDiagnoseWorkflow } from './workflow';
import { runDeepDiagnoseWorkflow } from './v2/workflow';
import { logWarn, logInfo } from '../error-handler';

// 惰性导入 prisma，避免 build 阶段 eager 加载 pg 驱动
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

export interface DiagnoseInput {
  resume_text: string;
  resume_paragraphs?: string[];
  target_role: string;
  jd_text?: string;
  tier: 'free' | 'paid';
  source_type?: 'paste' | 'pdf';
  uploaded_file_id?: string;
  diagnose_mode?: 'basic' | 'deep';
}

/**
 * 运行诊断工作流（共享逻辑，供旧接口和 worker 共用）
 */
export async function runDiagnosis(input: DiagnoseInput): Promise<FreeDiagnoseResponse> {
  const { resume_text, resume_paragraphs, target_role, jd_text = '', tier, diagnose_mode } = input;
  const dualAiEnabled = process.env.DUAL_AI_ENABLED === 'true';
  const mode = diagnose_mode || 'basic';

  logInfo('DiagnoseService', '诊断模式决策', {
    mode,
    dualAiEnabled,
    enteringDeepMode: mode === 'deep' && dualAiEnabled,
  });

  if (mode === 'deep' && dualAiEnabled) {
    // 深度诊断：先运行基础诊断，再运行深度工作流
    const basicResult = await runFreeDiagnoseWorkflow({
      resume_text,
      resume_paragraphs,
      target_role,
      jd_text,
      tier,
    });

    logInfo('DiagnoseService', '进入深度诊断工作流', {
      hasBasicResult: !!basicResult,
      basicResultScenario: basicResult?.scenario,
    });

    try {
      return await runDeepDiagnoseWorkflow({
        resume_text,
        resume_paragraphs,
        target_role,
        jd_text,
        tier,
      }, basicResult);
    } catch (deepError) {
      // 深度诊断失败：返回基础诊断 + 显式 fallback 标记
      logWarn('DiagnoseService', '深度诊断失败，返回基础诊断 + fallback 标记', {
        error: deepError instanceof Error ? deepError.message : String(deepError),
      });
      const result = { ...basicResult };
      result.metadata.diagnose_mode = 'deep';
      result.metadata.deep_diagnosis = false;
      result.metadata.deep_fallback_reason = 'server_unavailable';
      result.metadata.deep_fallback_message = '服务器开小差，先给你基础诊断结果';
      return result;
    }
  } else if (mode === 'deep' && !dualAiEnabled) {
    // 用户请求 deep 但 feature flag 未开启
    logWarn('DiagnoseService', 'deep 模式请求但 DUAL_AI_ENABLED 未开启，返回 basic + fallback 标记');
    const result = await runFreeDiagnoseWorkflow({
      resume_text,
      resume_paragraphs,
      target_role,
      jd_text,
      tier,
    });
    result.metadata.diagnose_mode = 'deep';
    result.metadata.deep_diagnosis = false;
    result.metadata.deep_fallback_reason = 'server_unavailable';
    result.metadata.deep_fallback_message = '服务器开小差，先给你基础诊断结果';
    return result;
  } else {
    // 基础诊断
    return runFreeDiagnoseWorkflow({
      resume_text,
      resume_paragraphs,
      target_role,
      jd_text,
      tier,
    });
  }
}

/**
 * 保存诊断结果到数据库（共享逻辑）
 * 返回 reportId
 */
export async function saveDiagnosisResult(
  result: FreeDiagnoseResponse,
  input: { resume_text: string; target_role: string; jd_text: string; tier: 'free' | 'paid'; source_type?: 'paste' | 'pdf'; uploaded_file_id?: string }
): Promise<string | null> {
  try {
    const prisma = await getPrisma();

    const session = await prisma.diagnoseSession.create({
      data: {
        targetRole: input.target_role,
        jdText: input.jd_text || null,
        resumeText: input.resume_text,
        sourceType: input.uploaded_file_id ? 'pdf' : (input.source_type || 'paste'),
        uploadedFileId: input.uploaded_file_id || null,
        jdQuality: result.metadata.jd_quality || 'none',
        inputQuality: result.scenario === 'insufficient_input' ? 'insufficient' : 'sufficient',
        scenario: result.scenario,
        schemaVersion: result.metadata.schema_version || '2.0',
        tier: input.tier,
      },
    });

    const report = await prisma.diagnoseReport.create({
      data: {
        sessionId: session.id,
        mainJudgment: result.main_judgment,
        reportJson: JSON.parse(JSON.stringify(result)),
        modelName: 'deepseek-chat',
        confidence: null,
        auditJson: result.audit_rows ? JSON.parse(JSON.stringify({
          rows: result.audit_rows,
          grouped_by_section: result.grouped_issues_by_section || {},
          grouped_by_dimension: result.grouped_issues_by_dimension || {},
          missing_info_summary: result.missing_info_summary || [],
        })) : undefined,
        providerTraceJson: JSON.parse(JSON.stringify({
          research_provider_requested: result.metadata.research_provider_requested,
          research_provider_actual: result.metadata.research_provider_actual,
          research_fallback_used: result.metadata.research_fallback_used,
          research_fallback_reason: result.metadata.research_fallback_reason,
          research_fallback_from: result.metadata.research_fallback_from,
          research_fallback_to: result.metadata.research_fallback_to,
          deep_diagnosis_executed: result.metadata.deep_diagnosis_executed,
        })) || undefined,
        coverageVersion: '1.0',
      },
    });

    return report.id;
  } catch (dbError) {
    logWarn('DiagnoseService', '数据库落库失败', {
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    return null;
  }
}

/**
 * 完整的诊断流程：运行诊断 + 保存结果
 */
export async function runDiagnosisAndSave(
  input: DiagnoseInput
): Promise<{ result: FreeDiagnoseResponse; reportId: string | null }> {
  // 1. 运行诊断
  const result = await runDiagnosis(input);

  // 2. 保存结果
  const reportId = await saveDiagnosisResult(result, {
    resume_text: input.resume_text,
    target_role: input.target_role,
    jd_text: input.jd_text || '',
    tier: input.tier,
    source_type: input.source_type,
    uploaded_file_id: input.uploaded_file_id,
  });

  return { result, reportId };
}