import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runV4DiagnosisAndSave } from '@/lib/diagnose/service';
import { logInfo, logError, Errors } from '@/lib/error-handler';
import type { V4DiagnoseInput } from '@/lib/diagnose/service';

// V4 workflow runs ~12 sequential AI calls; ask Vercel for the full budget.
// Hobby caps at 60s; Pro extends to 300s.
export const maxDuration = 60;

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
    const { task_id, force_restart = false } = body;

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

    // 2. 检查任务状态与并发控制
    // 如果任务已在 running 状态，且未指定 force_restart 并且最近有活跃心跳（<45s），则不重复执行
    if (task.status === 'running' && !force_restart) {
      const inputObj = typeof task.inputJson === 'object' && task.inputJson !== null
        ? (task.inputJson as Record<string, unknown>)
        : {};
      const progressMeta = inputObj._progress as { last_heartbeat_at?: string } | undefined;
      const lastHeartbeat = progressMeta?.last_heartbeat_at
        ? new Date(progressMeta.last_heartbeat_at).getTime()
        : task.updatedAt.getTime();

      const isRecentlyActive = (Date.now() - lastHeartbeat) < 45_000;
      if (isRecentlyActive) {
        return NextResponse.json({
          success: true,
          message: '任务正在活跃诊断中',
          task_id: task.id,
          status: 'running',
        });
      }
    }

    if (task.status === 'done') {
      return NextResponse.json({
        success: true,
        message: '任务已完成',
        task_id: task.id,
        status: 'done',
        report_id: task.reportId,
      });
    }

    const rawInput = typeof task.inputJson === 'object' && task.inputJson !== null
      ? (task.inputJson as Record<string, unknown>)
      : {};

    // 3. 更新任务状态为 running 并初始化心跳
    await prisma.diagnoseTask.update({
      where: { id: task_id },
      data: {
        status: 'running',
        startedAt: task.startedAt || new Date(),
        inputJson: {
          ...rawInput,
          _progress: {
            current_step: 'prep',
            step_label: '准备启动深度诊断工作流...',
            progress: 5,
            last_heartbeat_at: new Date().toISOString(),
          },
        },
      },
    });

    logInfo('DiagnoseWorker', '开始执行诊断任务', { taskId: task_id });

    // 4. 解析输入并运行 V4 诊断（传入心跳回调）
    const input = rawInput as unknown as V4DiagnoseInput;

    const onProgress = async (step: string, label: string, progress: number) => {
      try {
        const latestTask = await prisma.diagnoseTask.findUnique({
          where: { id: task_id },
          select: { inputJson: true },
        });
        const currentData = typeof latestTask?.inputJson === 'object' && latestTask.inputJson !== null
          ? (latestTask.inputJson as Record<string, unknown>)
          : {};
        await prisma.diagnoseTask.update({
          where: { id: task_id },
          data: {
            status: 'running',
            inputJson: {
              ...currentData,
              _progress: {
                current_step: step,
                step_label: label,
                progress,
                last_heartbeat_at: new Date().toISOString(),
              },
            },
          },
        });
      } catch (err) {
        logInfo('DiagnoseWorker', '心跳更新略过', { error: String(err) });
      }
    };

    try {
      const { reportId } = await runV4DiagnosisAndSave(input, { onProgress });

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