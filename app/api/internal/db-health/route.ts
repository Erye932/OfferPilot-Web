import { NextResponse } from 'next/server';
import { logWarn } from '@/lib/error-handler';

const STAGE_TIMEOUT_MS = 2500;

type PrismaInitStatus = 'ok' | 'fail';
type DbPingStatus = 'ok' | 'fail';
type DiagnoseTasksTableStatus = 'exists' | 'missing' | 'unknown';
type HealthStage = 'prisma_init' | 'db_ping' | 'diagnose_tasks_table';

interface DbHealthResponse {
  ok: boolean;
  prisma_init: PrismaInitStatus;
  db_ping: DbPingStatus;
  diagnose_tasks_table: DiagnoseTasksTableStatus;
  error?: string;
  timings: {
    total_ms: number;
    prisma_init_ms: number;
    db_ping_ms: number;
    diagnose_tasks_table_ms: number;
  };
}

class StageTimeoutError extends Error {
  constructor(public readonly stage: HealthStage) {
    super(`Timeout while waiting for ${stage}`);
    this.name = 'StageTimeoutError';
  }
}

async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

async function withTimeout<T>(promise: Promise<T>, stage: HealthStage): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new StageTimeoutError(stage)), STAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function sanitizeError(error: unknown): string {
  const parts: string[] = [];
  const err = error as { code?: string; message?: string; meta?: { modelName?: string } };

  if (err?.code) {
    parts.push(`code=${err.code}`);
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message) {
    parts.push(
      message
        .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
        .replace(/prisma:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
        .replace(/(password|pwd)=([^\s&]+)/gi, '$1=[REDACTED]')
        .replace(/(user|username)=([^\s&]+)/gi, '$1=[REDACTED]')
        .trim()
    );
  }

  if (err?.meta?.modelName) {
    parts.push(`model=${err.meta.modelName}`);
  }

  return parts.filter(Boolean).join(' | ');
}

function createBaseResponse(): DbHealthResponse {
  return {
    ok: false,
    prisma_init: 'fail',
    db_ping: 'fail',
    diagnose_tasks_table: 'unknown',
    timings: {
      total_ms: 0,
      prisma_init_ms: 0,
      db_ping_ms: 0,
      diagnose_tasks_table_ms: 0,
    },
  };
}

export async function GET() {
  const startedAt = Date.now();
  const result = createBaseResponse();

  try {
    const prismaInitStartedAt = Date.now();
    const prisma = await withTimeout(getPrisma(), 'prisma_init');
    result.prisma_init = 'ok';
    result.timings.prisma_init_ms = Date.now() - prismaInitStartedAt;

    const dbPingStartedAt = Date.now();
    await withTimeout(prisma.$queryRaw`SELECT 1`, 'db_ping');
    result.db_ping = 'ok';
    result.timings.db_ping_ms = Date.now() - dbPingStartedAt;

    const tableCheckStartedAt = Date.now();
    const tableRows = await withTimeout<Array<{ exists: string | null }>>(
      prisma.$queryRaw`
        SELECT to_regclass('public.diagnose_tasks') AS exists
      `,
      'diagnose_tasks_table'
    );
    result.diagnose_tasks_table = tableRows[0]?.exists ? 'exists' : 'missing';
    result.timings.diagnose_tasks_table_ms = Date.now() - tableCheckStartedAt;

    result.ok =
      result.prisma_init === 'ok' &&
      result.db_ping === 'ok' &&
      result.diagnose_tasks_table === 'exists';
  } catch (error) {
    result.error = sanitizeError(error);

    if (error instanceof StageTimeoutError) {
      if (error.stage === 'prisma_init') {
        result.prisma_init = 'fail';
      }
      if (error.stage === 'db_ping') {
        result.prisma_init = 'ok';
        result.db_ping = 'fail';
      }
      if (error.stage === 'diagnose_tasks_table') {
        result.prisma_init = 'ok';
        result.db_ping = 'ok';
        result.diagnose_tasks_table = 'unknown';
      }
    } else {
      const knownError = error as { code?: string; meta?: { modelName?: string } };
      if (knownError?.code === 'ECONNREFUSED') {
        if (result.prisma_init !== 'ok') {
          result.prisma_init = 'ok';
        }
        result.db_ping = 'fail';
        result.diagnose_tasks_table = 'unknown';
      }
    }

    logWarn('DBHealth', '数据库健康检查失败', {
      error: result.error,
      prisma_init: result.prisma_init,
      db_ping: result.db_ping,
      diagnose_tasks_table: result.diagnose_tasks_table,
    });
  }

  result.timings.total_ms = Date.now() - startedAt;

  const status = result.ok ? 200 : 503;
  return NextResponse.json(result, { status });
}
