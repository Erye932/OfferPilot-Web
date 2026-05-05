import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { diagnoseRequestSchema } from '@/lib/diagnose/types';
import { logInfo, logWarn, Errors } from '@/lib/error-handler';

const DB_STEP_TIMEOUT_MS = 2500;

class StageTimeoutError extends Error {
  constructor(public readonly stage: 'prisma_import' | 'diagnose_task_create') {
    super(`Timeout while waiting for ${stage}`);
    this.name = 'StageTimeoutError';
  }
}

async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

async function withStageTimeout<T>(promise: Promise<T>, stage: StageTimeoutError['stage']): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new StageTimeoutError(stage)), DB_STEP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();

  try {
    const body = await request.json();
    const parsed = diagnoseRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      const { response, status } = Errors.validationError(firstError?.message || '请求参数格式错误');
      return NextResponse.json(response, { status });
    }

    const { resume_text, target_role } = parsed.data;
    if (!resume_text?.trim() || !target_role?.trim()) {
      const { response, status } = Errors.validationError('缺少必要参数：resume_text 和 target_role');
      return NextResponse.json(response, { status });
    }

    const validatedAt = Date.now();
    const prisma = await withStageTimeout(getPrisma(), 'prisma_import');
    const prismaReadyAt = Date.now();

    const task = await withStageTimeout(
      prisma.diagnoseTask.create({
        data: {
          status: 'queued',
          inputJson: JSON.parse(JSON.stringify(parsed.data)),
        },
      }),
      'diagnose_task_create'
    );

    const finishedAt = Date.now();
    logInfo('DiagnoseTaskAPI', '创建诊断任务', {
      taskId: task.id,
      total_ms: finishedAt - requestStartedAt,
      parse_and_validate_ms: validatedAt - requestStartedAt,
      prisma_import_ms: prismaReadyAt - validatedAt,
      diagnose_task_create_ms: finishedAt - prismaReadyAt,
    });

    return NextResponse.json({ task_id: task.id, status: 'queued' });
  } catch (error) {
    const elapsed = Date.now() - requestStartedAt;

    if (error instanceof StageTimeoutError) {
      logWarn('DiagnoseTaskAPI', '数据库步骤超时', {
        stage: error.stage,
        elapsed_ms: elapsed,
        timeout_ms: DB_STEP_TIMEOUT_MS,
      });

      const message = error.stage === 'prisma_import'
        ? 'Prisma 初始化超时，接口已提前返回，请检查 Prisma/Neon 连接配置'
        : 'DiagnoseTask 写入超时，接口已提前返回，请检查 Neon 连通性、diagnose_tasks 表状态或迁移';

      return NextResponse.json({
        error: {
          code: 'DB_WRITE_TIMEOUT',
          message,
          stage: error.stage,
          timeout_ms: DB_STEP_TIMEOUT_MS,
        },
      }, { status: 503 });
    }

    logWarn('DiagnoseTaskAPI', '创建任务失败', {
      error: error instanceof Error ? error.message : String(error),
      elapsed_ms: elapsed,
    });

    const knownError = error as { code?: string; message?: string; meta?: { modelName?: string } };

    if (knownError?.code === 'ECONNREFUSED') {
      return NextResponse.json({
        error: {
          code: 'DB_CONNECTION_REFUSED',
          message: '数据库连接被拒绝，DiagnoseTask 没有写进去，请检查 Prisma/Neon/Postgres 是否可连通',
          stage: 'diagnose_task_create',
          model: knownError.meta?.modelName,
        },
      }, { status: 503 });
    }

    if (error instanceof Error && error.message.includes('does not exist')) {
      return NextResponse.json({
        error: {
          code: 'DB_TABLE_MISSING',
          message: 'DiagnoseTask 表不存在，请先运行 prisma db push',
          details: error.message,
        },
      }, { status: 500 });
    }

    const { response, status } = Errors.internalError(
      error instanceof Error ? error.message : undefined
    );
    return NextResponse.json(response, { status });
  }
}
