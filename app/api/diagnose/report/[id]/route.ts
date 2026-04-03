import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { FreeDiagnoseResponse } from '@/lib/diagnose/types';

// 惰性导入 prisma，避免 build 阶段 eager 加载 pg 驱动
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

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: '缺少报告ID' },
        { status: 400 }
      );
    }

    const prisma = await getPrisma();

    const report = await prisma.diagnoseReport.findUnique({
      where: { id },
      include: {
        session: true,
      },
    });

    if (!report) {
      return NextResponse.json(
        { error: '报告不存在' },
        { status: 404 }
      );
    }

    // 解析 reportJson 并返回
    const result = report.reportJson as unknown as FreeDiagnoseResponse;

    // 可选：添加 metadata 如 report_id 和 session_id
    const response = {
      ...result,
      metadata: {
        ...result.metadata,
        report_id: report.id,
        session_id: report.sessionId,
        created_at: report.createdAt.toISOString(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('获取报告失败:', error);
    return NextResponse.json(
      { error: '服务器内部错误' },
      { status: 500 }
    );
  }
}