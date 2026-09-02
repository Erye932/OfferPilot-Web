import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Errors } from '@/lib/error-handler';
import { createDemoSafeReportId, isDemoSafeTaskId } from '@/lib/demo-safe-mode';

const STALE_RUNNING_MS = Number(process.env.DIAGNOSE_STALE_RUNNING_MS ?? 5 * 60 * 1000);
const STALE_QUEUED_MS = Number(process.env.DIAGNOSE_STALE_QUEUED_MS ?? 3 * 60 * 1000);

const taskSelect = {
  id: true,
  status: true,
  inputJson: true,
  reportId: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  finishedAt: true,
} as const;

interface TaskProgressMeta {
  current_step?: string;
  step_label?: string;
  progress?: number;
  last_heartbeat_at?: string;
}

function toTaskResponse(task: {
  id: string;
  status: string;
  inputJson: unknown;
  reportId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}) {
  const inputObj = typeof task.inputJson === 'object' && task.inputJson !== null
    ? (task.inputJson as Record<string, unknown>)
    : {};
  const progressMeta = (inputObj._progress as TaskProgressMeta) || {};

  const lastHeartbeatTime = progressMeta.last_heartbeat_at
    ? new Date(progressMeta.last_heartbeat_at).getTime()
    : task.updatedAt.getTime();
  const isAlive = (Date.now() - lastHeartbeatTime) < 45_000;

  return {
    task_id: task.id,
    status: task.status,
    report_id: task.reportId,
    error_message: task.errorMessage,
    current_step: progressMeta.current_step || (task.status === 'queued' ? 'queued' : task.status === 'done' ? 'complete' : 'processing'),
    step_label: progressMeta.step_label || (task.status === 'queued' ? '正在排队等待分析...' : task.status === 'done' ? '诊断完成' : '正在深度诊断分析中...'),
    progress: progressMeta.progress ?? (task.status === 'queued' ? 5 : task.status === 'done' ? 100 : 20),
    last_heartbeat: new Date(lastHeartbeatTime).toISOString(),
    is_alive: isAlive,
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString(),
    started_at: task.startedAt?.toISOString() || null,
    finished_at: task.finishedAt?.toISOString() || null,
  };
}

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

    if (isDemoSafeTaskId(id)) {
      const now = new Date().toISOString();
      return NextResponse.json({
        task_id: id,
        status: 'done',
        report_id: createDemoSafeReportId(id),
        error_message: null,
        current_step: 'complete',
        step_label: '诊断完成',
        progress: 100,
        last_heartbeat: now,
        is_alive: true,
        created_at: now,
        updated_at: now,
        started_at: now,
        finished_at: now,
        mode: 'demo_safe',
      });
    }

    const prisma = await getPrisma();

    const task = await prisma.diagnoseTask.findUnique({
      where: { id },
      select: taskSelect,
    });

    if (!task) {
      const { response, status } = Errors.notFoundError('任务不存在');
      return NextResponse.json(response, { status });
    }

    const now = Date.now();
    const inputObj = typeof task.inputJson === 'object' && task.inputJson !== null
      ? (task.inputJson as Record<string, unknown>)
      : {};
    const progressMeta = (inputObj._progress as TaskProgressMeta) || {};
    const lastHeartbeatTime = progressMeta.last_heartbeat_at
      ? new Date(progressMeta.last_heartbeat_at).getTime()
      : task.updatedAt.getTime();

    // 只有在心跳中断超过 STALE_RUNNING_MS 时才标记为僵尸任务
    const isSilentlyDead = now - lastHeartbeatTime > STALE_RUNNING_MS;
    const runningDead = task.status === 'running' && isSilentlyDead;
    const queuedTooLong = task.status === 'queued' && now - task.createdAt.getTime() > STALE_QUEUED_MS;

    if (runningDead || queuedTooLong) {
      const updated = await prisma.diagnoseTask.update({
        where: { id },
        data: {
          status: 'failed',
          errorMessage: runningDead
            ? '诊断进程心跳中断超时，请重新提交'
            : '诊断任务长时间未启动，请重新提交',
          finishedAt: new Date(),
        },
        select: taskSelect,
      });

      return NextResponse.json(toTaskResponse(updated));
    }

    return NextResponse.json(toTaskResponse(task));

  } catch {
    const { response, status } = Errors.internalError();
    return NextResponse.json(response, { status });
  }
}