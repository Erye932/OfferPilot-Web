import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { FreeDiagnoseResponse } from '@/lib/diagnose/types';
import { createDemoSafeDiagnoseReport, isDemoSafeReportId } from '@/lib/demo-safe-mode';

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

    if (isDemoSafeReportId(id)) {
      const report = createDemoSafeDiagnoseReport({
        resume_text: '比赛安全模式演示简历：参与校园招聘系统项目，负责需求梳理、数据看板和简历诊断流程设计。',
        target_role: 'AI 产品经理 / 就业服务平台运营',
        jd_text: '负责 AI 产品方案、数据分析、用户增长和业务闭环设计。',
      });

      return NextResponse.json({
        ...report,
        metadata: {
          ...report.metadata,
          report_id: id,
          session_id: 'demo-safe-session',
          created_at: report.metadata.generated_at,
        },
      });
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