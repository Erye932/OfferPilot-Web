import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { diagnoseRequestSchema } from '@/lib/diagnose/types';
import { getOrCreateAnonymousSessionId, checkRateLimit, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { logInfo, Errors } from '@/lib/error-handler';

// 惰性导入 prisma
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Zod validation - 复用现有 schema
    const parsed = diagnoseRequestSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      const { response, status } = Errors.validationError(firstError?.message || '请求参数格式错误');
      return NextResponse.json(response, { status });
    }

    const { resume_text, target_role } = parsed.data;

    // 验证必要字段
    if (!resume_text?.trim() || !target_role?.trim()) {
      const { response, status } = Errors.validationError('缺少必要参数：resume_text 和 target_role');
      return NextResponse.json(response, { status });
    }

    // 匿名会话限流检查
    const sessionId = getOrCreateAnonymousSessionId(request);
    const rateLimit = await checkRateLimit(sessionId, 'diagnose', parsed.data.tier || 'free');
    if (!rateLimit.allowed) {
      const headers = setAnonymousSessionCookie(sessionId);
      const { response, status } = Errors.rateLimitExceeded(rateLimit.retryAfter);
      return NextResponse.json(response, { status, headers });
    }

    const prisma = await getPrisma();

    // 创建任务单
    const task = await prisma.diagnoseTask.create({
      data: {
        status: 'queued',
        inputJson: JSON.parse(JSON.stringify(parsed.data)),
      },
    });

    logInfo('DiagnoseTaskAPI', '创建诊断任务', { taskId: task.id });

    const headers = setAnonymousSessionCookie(sessionId);
    return NextResponse.json({
      task_id: task.id,
      status: task.status,
    }, { headers });

  } catch (error) {
    const { response, status } = Errors.internalError();
    return NextResponse.json(response, { status });
  }
}