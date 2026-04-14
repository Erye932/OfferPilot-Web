import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runDiagnosis, saveDiagnosisResult } from '@/lib/diagnose/service';
import { diagnoseRequestSchema } from '@/lib/diagnose/types';
import type { FreeDiagnoseResponse } from '@/lib/diagnose/types';
import { getOrCreateAnonymousSessionId, checkRateLimit, recordUsage, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { logError, logWarn, logInfo, createErrorResponse, Errors } from '@/lib/error-handler';

// 扩展点说明：
// 1. 用户身份验证：从请求中提取登录用户ID，替换匿名会话
// 2. 付费配额检查：基于用户订阅计划调整限流逻辑
// 3. 数据归属：将诊断结果关联到用户账户
// 4. 审计日志：记录敏感操作（如大量诊断请求）

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

    // 深度诊断入口可观测性日志
    logInfo('DiagnoseAPI', '诊断请求参数检查', {
      diagnose_mode: diagnose_mode,
      DUAL_AI_ENABLED: process.env.DUAL_AI_ENABLED === 'true',
      METASO_API_KEY_exists: !!(process.env.METASO_API_KEY?.trim()),
      METASO_API_BASE_URL_exists: !!(process.env.METASO_API_BASE_URL?.trim()),
      METASO_API_KEY_length: process.env.METASO_API_KEY?.trim().length || 0,
      METASO_API_BASE_URL: process.env.METASO_API_BASE_URL?.trim() || '未设置',
    });

    // 调用共享诊断服务
    const result = await runDiagnosis({
      resume_text,
      resume_paragraphs,
      target_role,
      jd_text: jd_text || '',
      tier,
      diagnose_mode,
    });

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
    const reportId = await saveDiagnosisResult(result, {
      resume_text,
      target_role,
      jd_text: jd_text || '',
      tier,
      source_type,
      uploaded_file_id,
    });

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