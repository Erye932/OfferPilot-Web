import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { runV4DiagnosisAndSave } from '@/lib/diagnose/service';
import { logInfo, logError, Errors } from '@/lib/error-handler';
import { sweepExpiredResearchCache } from '@/lib/diagnose/v4/research-cache';
import type { V4DiagnoseInput } from '@/lib/diagnose/service';

// Each cron run can process up to 3 tasks; give it the full Vercel budget.
export const maxDuration = 60;

// 惰性导入 prisma
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

// 每轮最多处理的任务数（避免超时）
const MAX_TASKS_PER_RUN = 3;
// 任务在 running 状态超过这个分钟数仍未完成 → 视为 worker 进程被杀，标记为 failed
// V4 工作流正常 60-120s；设 5 分钟做安全余量
const STALE_RUNNING_MIN = 5;

/**
 * 定时任务入口：由 Vercel Cron 每分钟触发
 *
 * 工作流程：
 * 1. 查询所有 status=queued 的任务（按创建时间正序）
 * 2. 逐个处理，最多处理 MAX_TASKS_PER_RUN 个
 * 3. 每个任务：running -> done/failed
 * 4. 返回处理结果统计
 */
export async function POST(request: NextRequest) {
  // 验证 cron secret（可选，生产环境建议配置）
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const { response } = Errors.validationError('未授权的 Cron 调用');
    return NextResponse.json(response, { status: 401 });
  }

  try {
    const prisma = await getPrisma();

    // 0. 清扫僵尸 running 任务：worker 进程被 Vercel 60s 超时杀掉时
    //    数据库里会留下一条永远 running 的脏数据；这里把它们标记为 failed。
    const staleThreshold = new Date(Date.now() - STALE_RUNNING_MIN * 60 * 1000);
    const staleSwept = await prisma.diagnoseTask.updateMany({
      where: {
        status: 'running',
        startedAt: { lt: staleThreshold },
      },
      data: {
        status: 'failed',
        errorMessage: `worker 进程超时被终止（>${STALE_RUNNING_MIN} 分钟未完成）。云端 serverless 受函数超时限制，建议在本地或 Pro 计划下运行 V4。`,
        finishedAt: new Date(),
      },
    });
    if (staleSwept.count > 0) {
      logInfo('DiagnoseCron', '清扫僵尸 running 任务', {
        count: staleSwept.count,
        threshold_min: STALE_RUNNING_MIN,
      });
    }

    // 1. 获取待处理任务（最多 MAX_TASKS_PER_RUN 个）
    const queuedTasks = await prisma.diagnoseTask.findMany({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
      take: MAX_TASKS_PER_RUN,
    });

    if (queuedTasks.length === 0) {
      logInfo('DiagnoseCron', '没有待处理任务');
      return NextResponse.json({
        processed: 0,
        success: 0,
        failed: 0,
        stale_swept: staleSwept.count,
        message: 'No queued tasks',
      });
    }

    logInfo('DiagnoseCron', '开始处理任务', { count: queuedTasks.length });

    let successCount = 0;
    let failedCount = 0;
    const results: Array<{ taskId: string; status: string; reportId?: string; error?: string }> = [];

    // 2. 逐个处理任务
    for (const task of queuedTasks) {
      try {
        // 更新为 running
        await prisma.diagnoseTask.update({
          where: { id: task.id },
          data: { status: 'running', startedAt: new Date() },
        });

        logInfo('DiagnoseCron', '处理任务', { taskId: task.id });

        // 执行 V4 诊断
        const input = task.inputJson as unknown as V4DiagnoseInput;
        const { reportId } = await runV4DiagnosisAndSave(input);

        // 更新为 done
        await prisma.diagnoseTask.update({
          where: { id: task.id },
          data: { status: 'done', reportId, finishedAt: new Date() },
        });

        successCount++;
        results.push({ taskId: task.id, status: 'done', reportId: reportId || undefined });

      } catch (taskError) {
        const errorMsg = taskError instanceof Error ? taskError.message : String(taskError);

        // 更新为 failed
        await prisma.diagnoseTask.update({
          where: { id: task.id },
          data: { status: 'failed', errorMessage: errorMsg, finishedAt: new Date() },
        });

        failedCount++;
        results.push({ taskId: task.id, status: 'failed', error: errorMsg });

        logError('DiagnoseCron', taskError as unknown);
      }
    }

    logInfo('DiagnoseCron', '任务处理完成', { success: successCount, failed: failedCount });

    // 顺便清理过期的研究缓存
    const expiredSwept = await sweepExpiredResearchCache();

    return NextResponse.json({
      processed: queuedTasks.length,
      success: successCount,
      failed: failedCount,
      stale_swept: staleSwept.count,
      results,
      research_cache_swept: expiredSwept,
    });

  } catch (error) {
    logError('DiagnoseCron', error as unknown);
    const { response, status } = Errors.internalError();
    return NextResponse.json(response, { status });
  }
}