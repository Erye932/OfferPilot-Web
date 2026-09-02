import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { APPLICATION_OUTCOME_STAGES } from '@/lib/application-outcomes';
import { getOrCreateAnonymousSessionId, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { Errors, logWarn } from '@/lib/error-handler';

async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

const createOutcomeSchema = z.object({
  reportId: z.string().min(1).optional().nullable(),
  targetRole: z.string().max(120).optional().nullable(),
  companyName: z.string().max(120).optional().nullable(),
  jobTitle: z.string().min(1, '岗位名称不能为空').max(120),
  platform: z.string().max(80).optional().nullable(),
  jdText: z.string().max(20000).optional().nullable(),
  resumeVersionLabel: z.string().max(80).optional().nullable(),
  outcomeStage: z.enum(APPLICATION_OUTCOME_STAGES),
  rejectionReason: z.string().max(500).optional().nullable(),
  interviewRound: z.number().int().min(0).max(10).optional().nullable(),
  adoptedSuggestionCount: z.number().int().min(0).max(50).optional().nullable(),
  userNote: z.string().max(1000).optional().nullable(),
  appliedAt: z.string().datetime().optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createOutcomeSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      const { response, status } = Errors.validationError(firstError?.message || '请求参数格式错误');
      return NextResponse.json(response, { status });
    }

    const input = parsed.data;
    const anonymousSessionId = getOrCreateAnonymousSessionId(request);
    const prisma = await getPrisma();

    const report = input.reportId
      ? await prisma.diagnoseReport.findUnique({
          where: { id: input.reportId },
          include: { session: true },
        })
      : null;

    if (input.reportId && !report) {
      return NextResponse.json({ error: '报告不存在，无法绑定投递结果' }, { status: 404 });
    }

    const outcome = await prisma.applicationOutcome.create({
      data: {
        diagnoseReportId: report?.id ?? null,
        diagnoseSessionId: report?.sessionId ?? null,
        anonymousSessionId,
        targetRole: input.targetRole || report?.session?.targetRole || null,
        companyName: input.companyName || null,
        jobTitle: input.jobTitle,
        platform: input.platform || null,
        jdText: input.jdText || report?.session?.jdText || null,
        resumeVersionLabel: input.resumeVersionLabel || null,
        outcomeStage: input.outcomeStage,
        rejectionReason: input.rejectionReason || null,
        interviewRound: input.interviewRound ?? null,
        adoptedSuggestionCount: input.adoptedSuggestionCount ?? null,
        userNote: input.userNote || null,
        appliedAt: input.appliedAt ? new Date(input.appliedAt) : null,
      },
    });

    const headers = setAnonymousSessionCookie(anonymousSessionId);
    return NextResponse.json({ ok: true, outcome }, { headers });
  } catch (error) {
    logWarn('ApplicationOutcomeAPI', '创建投递结果失败', {
      error: error instanceof Error ? error.message : String(error),
    });

    const { response, status } = Errors.internalError(
      error instanceof Error ? error.message : undefined
    );
    return NextResponse.json(response, { status });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');
    const limitParam = Number(searchParams.get('limit') || '20');
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;
    const anonymousSessionId = getOrCreateAnonymousSessionId(request);
    const prisma = await getPrisma();

    const outcomes = await prisma.applicationOutcome.findMany({
      where: reportId ? { diagnoseReportId: reportId } : { anonymousSessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const headers = setAnonymousSessionCookie(anonymousSessionId);
    return NextResponse.json({ outcomes }, { headers });
  } catch (error) {
    logWarn('ApplicationOutcomeAPI', '读取投递结果失败', {
      error: error instanceof Error ? error.message : String(error),
    });

    const { response, status } = Errors.internalError(
      error instanceof Error ? error.message : undefined
    );
    return NextResponse.json(response, { status });
  }
}
