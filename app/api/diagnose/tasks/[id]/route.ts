import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Errors } from '@/lib/error-handler';

// 惰性导入 prisma
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || !id.trim()) {
      const { response, status } = Errors.validationError('缺少任务ID');
      return NextResponse.json(response, { status });
    }

    const prisma = await getPrisma();

    const task = await prisma.diagnoseTask.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        reportId: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    if (!task) {
      const { response, status } = Errors.notFoundError('任务不存在');
      return NextResponse.json(response, { status });
    }

    return NextResponse.json({
      task_id: task.id,
      status: task.status,
      report_id: task.reportId,
      error_message: task.errorMessage,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
      started_at: task.startedAt?.toISOString() || null,
      finished_at: task.finishedAt?.toISOString() || null,
    });

  } catch (error) {
    const { response, status } = Errors.internalError();
    return NextResponse.json(response, { status });
  }
}