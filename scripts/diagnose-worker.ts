#!/usr/bin/env tsx

import { prisma } from '../lib/prisma';
import { logError, logInfo, logWarn } from '../lib/error-handler';
import { runV4DiagnosisAndSave, type V4DiagnoseInput } from '../lib/diagnose/service';
import { sweepExpiredResearchCache } from '../lib/diagnose/v4/research-cache';

interface WorkerOptions {
  once: boolean;
  idleExit: boolean;
  pollMs: number;
  batchSize: number;
  staleRunningMs: number;
  researchSweepMs: number;
}

type DiagnoseTaskRecord = NonNullable<Awaited<ReturnType<typeof claimNextTask>>>;

let shuttingDown = false;

void main().catch(async (error) => {
  logError('DiagnoseWorkerProcess', error);
  await prisma.$disconnect();
  process.exit(1);
});

async function main() {
  const options = getWorkerOptions();

  process.on('SIGINT', requestShutdown);
  process.on('SIGTERM', requestShutdown);

  logInfo('DiagnoseWorkerProcess', 'worker started', {
    once: options.once,
    idleExit: options.idleExit,
    pollMs: options.pollMs,
    batchSize: options.batchSize,
    staleRunningMs: options.staleRunningMs,
  });

  let lastResearchSweepAt = 0;

  while (!shuttingDown) {
    const staleSwept = await sweepStaleRunningTasks(options.staleRunningMs);
    const processed = await processBatch(options.batchSize);

    if (staleSwept > 0 || processed > 0) {
      logInfo('DiagnoseWorkerProcess', 'cycle complete', {
        staleSwept,
        processed,
      });
    }

    if (Date.now() - lastResearchSweepAt > options.researchSweepMs) {
      const swept = await sweepExpiredResearchCache();
      lastResearchSweepAt = Date.now();
      if (swept > 0) {
        logInfo('DiagnoseWorkerProcess', 'research cache swept', { swept });
      }
    }

    if (options.once || (options.idleExit && processed === 0)) {
      break;
    }

    if (processed === 0) {
      await sleep(options.pollMs);
    }
  }

  await prisma.$disconnect();
  logInfo('DiagnoseWorkerProcess', 'worker stopped');
}

function getWorkerOptions(): WorkerOptions {
  const args = new Set(process.argv.slice(2));

  return {
    once: args.has('--once') || process.env.DIAGNOSE_WORKER_ONCE === 'true',
    idleExit: args.has('--idle-exit') || process.env.DIAGNOSE_WORKER_IDLE_EXIT === 'true',
    pollMs: readPositiveInt(process.env.DIAGNOSE_WORKER_POLL_MS, 3000),
    batchSize: readPositiveInt(process.env.DIAGNOSE_WORKER_BATCH_SIZE, 1),
    staleRunningMs: readPositiveInt(process.env.DIAGNOSE_STALE_RUNNING_MS, 5 * 60 * 1000),
    researchSweepMs: readPositiveInt(process.env.DIAGNOSE_RESEARCH_SWEEP_MS, 10 * 60 * 1000),
  };
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requestShutdown() {
  shuttingDown = true;
  logWarn('DiagnoseWorkerProcess', 'shutdown requested');
}

async function sweepStaleRunningTasks(staleRunningMs: number): Promise<number> {
  const threshold = new Date(Date.now() - staleRunningMs);
  const result = await prisma.diagnoseTask.updateMany({
    where: {
      status: 'running',
      startedAt: { lt: threshold },
    },
    data: {
      status: 'failed',
      errorMessage: '诊断任务运行超时，请重新提交',
      finishedAt: new Date(),
    },
  });

  return result.count;
}

async function processBatch(batchSize: number): Promise<number> {
  let processed = 0;

  for (let index = 0; index < batchSize && !shuttingDown; index += 1) {
    const task = await claimNextTask();
    if (!task) break;

    await processTask(task);
    processed += 1;
  }

  return processed;
}

async function claimNextTask() {
  const nextTask = await prisma.diagnoseTask.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
  });

  if (!nextTask) return null;

  const claimed = await prisma.diagnoseTask.updateMany({
    where: {
      id: nextTask.id,
      status: 'queued',
    },
    data: {
      status: 'running',
      startedAt: new Date(),
      finishedAt: null,
      errorMessage: null,
    },
  });

  if (claimed.count !== 1) return null;

  return prisma.diagnoseTask.findUnique({
    where: { id: nextTask.id },
  });
}

async function processTask(task: DiagnoseTaskRecord): Promise<void> {
  const startedAt = Date.now();
  logInfo('DiagnoseWorkerProcess', 'task started', { taskId: task.id });

  const rawInput = typeof task.inputJson === 'object' && task.inputJson !== null
    ? (task.inputJson as Record<string, unknown>)
    : {};

  const onProgress = async (step: string, label: string, progress: number) => {
    try {
      const latestTask = await prisma.diagnoseTask.findUnique({
        where: { id: task.id },
        select: { inputJson: true },
      });
      const currentData = typeof latestTask?.inputJson === 'object' && latestTask.inputJson !== null
        ? (latestTask.inputJson as Record<string, unknown>)
        : {};
      await prisma.diagnoseTask.update({
        where: { id: task.id },
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
    } catch {
      // heartbeats are best-effort
    }
  };

  try {
    const input = rawInput as unknown as V4DiagnoseInput;
    const { reportId } = await runV4DiagnosisAndSave(input, { onProgress });

    if (!reportId) {
      throw new Error('诊断报告落库失败，请检查数据库连接');
    }

    await prisma.diagnoseTask.update({
      where: { id: task.id },
      data: {
        status: 'done',
        reportId,
        finishedAt: new Date(),
      },
    });

    logInfo('DiagnoseWorkerProcess', 'task completed', {
      taskId: task.id,
      reportId,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.diagnoseTask.update({
      where: { id: task.id },
      data: {
        status: 'failed',
        errorMessage: message.slice(0, 2000),
        finishedAt: new Date(),
      },
    });

    logError('DiagnoseWorkerProcess', error, {
      taskId: task.id,
      durationMs: Date.now() - startedAt,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
