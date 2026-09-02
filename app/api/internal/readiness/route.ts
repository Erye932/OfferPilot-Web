import { NextResponse } from 'next/server';
import { isDemoSafeModeEnabled } from '@/lib/demo-safe-mode';

const DB_TIMEOUT_MS = Number.parseInt(process.env.READINESS_DB_TIMEOUT_MS || '1000', 10);
const PDF_MAX_UPLOAD_MB = Number.parseInt(process.env.PDF_MAX_UPLOAD_MB || '10', 10);
const PDF_PARSE_TIMEOUT_MS = Number.parseInt(process.env.PDF_PARSE_TIMEOUT_MS || '30000', 10);

type DependencyStatus = 'ok' | 'degraded' | 'not_configured' | 'skipped';

interface ReadinessDependency {
  status: DependencyStatus;
  detail?: string;
}

interface ReadinessResponse {
  ok: boolean;
  mode: 'demo_safe' | 'live';
  generated_at: string;
  dependencies: {
    app: ReadinessDependency;
    database: ReadinessDependency;
    ai: ReadinessDependency;
    pdf: ReadinessDependency & {
      max_upload_mb: number;
      parse_timeout_ms: number;
    };
  };
}

async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/prisma:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/(password|pwd)=([^\s&]+)/gi, '$1=[REDACTED]')
    .slice(0, 240);
}

async function checkDatabase(): Promise<ReadinessDependency> {
  if (!process.env.DATABASE_URL) {
    return { status: 'not_configured', detail: 'DATABASE_URL is not configured' };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const prisma = await getPrisma();
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`db_timeout_${DB_TIMEOUT_MS}ms`)), DB_TIMEOUT_MS);
      }),
    ]);
    return { status: 'ok' };
  } catch (error) {
    return { status: 'degraded', detail: sanitizeError(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function checkAi(): ReadinessDependency {
  const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const hasMetaso = Boolean(process.env.METASO_API_KEY?.trim());

  if (hasDeepSeek && hasMetaso) {
    return { status: 'ok' };
  }

  if (hasDeepSeek) {
    return { status: 'degraded', detail: 'METASO_API_KEY is not configured; research fallback may be used' };
  }

  return { status: 'not_configured', detail: 'DEEPSEEK_API_KEY is not configured' };
}

export async function GET() {
  const demoSafe = isDemoSafeModeEnabled();
  const ai = demoSafe ? { status: 'skipped' as const, detail: 'DEMO_SAFE_MODE=true' } : checkAi();
  const database = demoSafe
    ? { status: 'skipped' as const, detail: 'DEMO_SAFE_MODE=true' }
    : await checkDatabase();

  const response: ReadinessResponse = {
    ok: demoSafe || (database.status === 'ok' && (ai.status === 'ok' || ai.status === 'degraded')),
    mode: demoSafe ? 'demo_safe' : 'live',
    generated_at: new Date().toISOString(),
    dependencies: {
      app: { status: 'ok' },
      database,
      ai,
      pdf: {
        status: 'ok',
        max_upload_mb: PDF_MAX_UPLOAD_MB,
        parse_timeout_ms: PDF_PARSE_TIMEOUT_MS,
      },
    },
  };

  return NextResponse.json(response, { status: response.ok ? 200 : 503 });
}
