import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runDiagnosisAndSave } from '@/lib/diagnose/service';
import { logInfo, logError, Errors } from '@/lib/error-handler';
import type { DiagnoseInput } from '@/lib/diagnose/service';

// 惰性导入 prisma
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

/**
 * 内部 worker 接口：执行异步诊断任务
 *
 * 触发方式（外部需自行实现）：
 * 1. Vercel Cron（定时触发）
 * 2. 外部队列系统（如 Redis Queue、RabbitMQ）
 * 3. Coze 调用（需要解决 60 秒超时问题）
 *
 * 当前状态：骨架已完成，触发方式待定
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { task_id } = body;

    if (!task_id || !task_id.trim()) {
      const { response, status } = Errors.validationError('缺少 task_id');
      return NextResponse.json(response, { status });
    }

    const prisma = await getPrisma();

    // 1. 获取任务
    const task = await prisma.diagnoseTask.findUnique({
      where: { id: task_id },
    });

    if (!task) {
      const { response, status } = Errors.notFoundError('任务不存在');
      return NextResponse.json(response, { status });
    }

    // 2. 检查任务状态
    if (task.status !== 'queued') {
      return NextResponse.json({
        success: false,
        message: `任务状态不是 queued，当前状态：${task.status}`,
        task_id: task.id,
        status: task.status,
      });
    }

    // 3. 更新任务状态为 running
    await prisma.diagnoseTask.update({
      where: { id: task_id },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });

    logInfo('DiagnoseWorker', '开始执行诊断任务', { taskId: task_id });

    // 4. 解析输入并运行诊断
    const input = task.inputJson as unknown as DiagnoseInput;

    try {
      const { result, reportId } = await runDiagnosisAndSave(input);

      // 5. 更新任务为 done
      await prisma.diagnoseTask.update({
        where: { id: task_id },
        data: {
          status: 'done',
          reportId,
          finishedAt: new Date(),
        },
      });

      logInfo('DiagnoseWorker', '诊断任务完成', { taskId: task_id, reportId });

      return NextResponse.json({
        success: true,
        task_id: task_id,
        status: 'done',
        report_id: reportId,
      });

    } catch (diagnoseError) {
      // 6. 诊断失败，更新任务为 failed
      const errorMsg = diagnoseError instanceof Error ? diagnoseError.message : String(diagnoseError);

      await prisma.diagnoseTask.update({
        where: { id: task_id },
        data: {
          status: 'failed',
          errorMessage: errorMsg,
          finishedAt: new Date(),
        },
      });

      logError('DiagnoseWorker', diagnoseError as unknown);

      return NextResponse.json({
        success: false,
        task_id: task_id,
        status: 'failed',
        error_message: errorMsg,
      });
    }

  } catch (error) {
    logError('DiagnoseWorker', error as unknown);
    const { response, status } = Errors.internalError();
    return NextResponse.json(response, { status });
  }
}