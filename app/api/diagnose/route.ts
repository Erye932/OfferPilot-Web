import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runV4DiagnosisAndSave } from '@/lib/diagnose/service';
import { diagnoseRequestSchema } from '@/lib/diagnose/types';
import { getOrCreateAnonymousSessionId, checkRateLimit, recordUsage, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { logError, logWarn, logInfo, Errors } from '@/lib/error-handler';

// V4 诊断 API：唯一入口，输出 DiagnoseReport（schema_version: 4.0）
// 旧版的 diagnose_mode / tier 参数仍兼容接收：
// - diagnose_mode：忽略（V4 没有 basic/deep 区分）
// - tier：仅用于限流（'paid' 不限流）
// - force_refresh：true 时绕过 24h 缓存

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

    const { resume_text, resume_paragraphs, target_role, jd_text, tier, source_type, uploaded_file_id, force_refresh } = parsed.data;

    // 验证必要字段
    if (!resume_text?.trim() || !target_role?.trim()) {
      const { response, status } = Errors.validationError('缺少必要参数：resume_text 和 target_role');
      return NextResponse.json(response, { status });
    }

    // 匿名会话标识与限流（保留 tier 仅用于限流逻辑）
    const sessionId = getOrCreateAnonymousSessionId(request);
    const rateLimit = await checkRateLimit(sessionId, 'diagnose', tier);
    if (!rateLimit.allowed) {
      const headers = setAnonymousSessionCookie(sessionId);
      const { response, status } = Errors.rateLimitExceeded(rateLimit.retryAfter);
      return NextResponse.json(response, { status, headers });
    }

    logInfo('DiagnoseAPI', 'V4 诊断请求', {
      target_role,
      has_jd: (jd_text ?? '').length > 0,
      force_refresh,
      tier,
    });

    // 调用 V4 诊断服务（含缓存查询 + 工作流 + 落库）
    const { report, reportId } = await runV4DiagnosisAndSave({
      resume_text,
      resume_paragraphs,
      target_role,
      jd_text: jd_text || '',
      tier,
      source_type,
      uploaded_file_id,
      force_refresh,
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

    const responseBody: Record<string, unknown> = { ...report };
    if (reportId) responseBody.report_id = reportId;

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