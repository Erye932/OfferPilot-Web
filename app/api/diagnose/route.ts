import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runFreeDiagnoseWorkflow } from '@/lib/diagnose/workflow';
import { runDualDiagnoseWorkflow, runDeepDiagnoseWorkflow } from '@/lib/diagnose/v2/workflow';
import { diagnoseRequestSchema } from '@/lib/diagnose/types';
import type { FreeDiagnoseResponse } from '@/lib/diagnose/types';
import { getOrCreateAnonymousSessionId, checkRateLimit, recordUsage, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { logError, logWarn, logInfo, createErrorResponse, Errors } from '@/lib/error-handler';

// 扩展点说明：
// 1. 用户身份验证：从请求中提取登录用户ID，替换匿名会话
// 2. 付费配额检查：基于用户订阅计划调整限流逻辑
// 3. 数据归属：将诊断结果关联到用户账户
// 4. 审计日志：记录敏感操作（如大量诊断请求）

// 惰性导入 prisma，避免 build 阶段 eager 加载 pg 驱动
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

/**
 * 最小可用落库：保存 session + report + usage_record
 * - user_id 允许为空（匿名访客）
 * - 数据库不可连接时仅打 warning，不阻塞主流程
 * - 返回创建的 report.id，用于后续访问
 */
async function persistDiagnoseResult(
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
        // userId 不传 → null（匿名访客）
      },
    });

    const report = await prisma.diagnoseReport.create({
      data: {
        sessionId: session.id,
        mainJudgment: result.main_judgment,
        reportJson: JSON.parse(JSON.stringify(result)),
        modelName: 'deepseek-chat',
        confidence: null,
      },
    });

    return report.id;
  } catch (dbError) {
    // 数据库不可用时不阻塞诊断主流程
    logWarn('PersistDiagnoseResult', '数据库落库失败，诊断结果仍正常返回', {
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Zod validation
    const parsed = diagnoseRequestSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      const { response, status } = Errors.validationError(firstError?.message || '请求参数格式错误');
      return NextResponse.json(response, { status });
    }

    const { resume_text, resume_paragraphs, target_role, jd_text, tier, source_type, uploaded_file_id, diagnose_mode } = parsed.data;

    // 验证必要字段
    if (!resume_text?.trim() || !target_role?.trim()) {
      const { response, status } = Errors.validationError('缺少必要参数：resume_text 和 target_role');
      return NextResponse.json(response, { status });
    }

    // 匿名会话标识与限流
    const sessionId = getOrCreateAnonymousSessionId(request);
    const rateLimit = await checkRateLimit(sessionId, 'diagnose', tier);
    if (!rateLimit.allowed) {
      const headers = setAnonymousSessionCookie(sessionId);
      const { response, status } = Errors.rateLimitExceeded(rateLimit.retryAfter);
      return NextResponse.json(response, { status, headers });
    }

    // 运行诊断工作流 - 根据诊断模式和 feature flag 选择
    const dualAiEnabled = process.env.DUAL_AI_ENABLED === 'true';
    const mode = diagnose_mode || 'basic';

    // 深度诊断入口可观测性日志
    logInfo('DiagnoseAPI', '诊断请求参数检查', {
      diagnose_mode: mode,
      DUAL_AI_ENABLED: dualAiEnabled,
      METASO_API_KEY_exists: !!(process.env.METASO_API_KEY?.trim()),
      METASO_API_BASE_URL_exists: !!(process.env.METASO_API_BASE_URL?.trim()),
      METASO_API_KEY_length: process.env.METASO_API_KEY?.trim().length || 0,
      METASO_API_BASE_URL: process.env.METASO_API_BASE_URL?.trim() || '未设置',
    });

    let result;
    logInfo('DiagnoseAPI', '诊断模式决策', {
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
        jd_text: jd_text || '',
        tier,
      });

      logInfo('DiagnoseAPI', '进入深度诊断工作流', {
        hasBasicResult: !!basicResult,
        basicResultScenario: basicResult?.scenario,
      });
      try {
        result = await runDeepDiagnoseWorkflow({
          resume_text,
          resume_paragraphs,
          target_role,
          jd_text: jd_text || '',
          tier,
        }, basicResult);
      } catch (deepError) {
        // 深度诊断失败：返回基础诊断 + 显式 fallback 标记
        logWarn('DiagnoseAPI', '深度诊断失败，返回基础诊断 + fallback 标记', {
          error: deepError instanceof Error ? deepError.message : String(deepError),
        });
        result = { ...basicResult };
        result.metadata.diagnose_mode = 'deep';
        result.metadata.deep_diagnosis = false;
        result.metadata.deep_fallback_reason = 'server_unavailable';
        result.metadata.deep_fallback_message = '服务器开小差，先给你基础诊断结果';
      }
    } else if (mode === 'deep' && !dualAiEnabled) {
      // 用户请求 deep 但 feature flag 未开启：返回 basic + 显式 fallback 标记
      logWarn('DiagnoseAPI', 'deep 模式请求但 DUAL_AI_ENABLED 未开启，返回 basic + fallback 标记');
      result = await runFreeDiagnoseWorkflow({
        resume_text,
        resume_paragraphs,
        target_role,
        jd_text: jd_text || '',
        tier,
      });
      result.metadata.diagnose_mode = 'deep';
      result.metadata.deep_diagnosis = false;
      result.metadata.deep_fallback_reason = 'server_unavailable';
      result.metadata.deep_fallback_message = '服务器开小差，先给你基础诊断结果';
    } else {
      // 基础诊断
      result = await runFreeDiagnoseWorkflow({
        resume_text,
        resume_paragraphs,
        target_role,
        jd_text: jd_text || '',
        tier,
      });
    }

    // 记录使用量（异步，不阻塞响应）
    recordUsage(sessionId, 'diagnose', tier).catch((err) =>
      logWarn('RateLimitRecord', '记录使用量失败', {
        error: err instanceof Error ? err.message : String(err),
        sessionId,
        actionType: 'diagnose',
        tier,
      })
    );

    // 最小可用落库 — 异步执行，不阻塞响应，但需要 reportId 用于返回
    const reportId = await persistDiagnoseResult(result, { resume_text, target_role, jd_text: jd_text || '', tier, source_type, uploaded_file_id });

    const responseBody = { ...result } as Record<string, unknown>;
    if (reportId) {
      responseBody.report_id = reportId;
    }

    // 设置会话 cookie（如需要）
    const headers = setAnonymousSessionCookie(sessionId);
    return NextResponse.json(responseBody, { headers });

  } catch (error) {
    logError('DiagnoseAPI', error);

    if (error instanceof Error) {
      if (error.message.includes('DEEPSEEK_API_KEY')) {
        const { response, status } = Errors.serverConfigError();
        return NextResponse.json(response, { status });
      }
      if (error.message.includes('DeepSeek API 错误') || error.message.includes('JSON 解析失败')) {
        const { response, status } = Errors.aiServiceUnavailable(error.message);
        return NextResponse.json(response, { status });
      }
    }

    const { response, status } = Errors.internalError();
    return NextResponse.json(response, { status });
  }
}
