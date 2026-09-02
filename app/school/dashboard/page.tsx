'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppTopNav from '@/components/offerpilot/AppTopNav';
import { readSchoolTaskSubmissions, type SchoolTaskSubmission } from '@/lib/school-demo-storage';

interface DashboardMetricSet {
  studentCount: number;
  reportCount: number;
  outcomeCount: number;
  highRiskCount: number;
  averageScoreBefore: number | null;
  averageScoreAfter: number | null;
  positiveOutcomeRate: number;
}

interface TaskMetrics {
  submissionRate: number;
  revisionRate: number;
  passRate: number;
  pendingReviewCount: number;
  needsRevisionCount: number;
}

interface ActiveTask {
  id: string;
  title: string;
  owner: string;
  cohort: string;
  deadline: string;
  status: string;
  studentTotal: number;
  submittedCount: number;
  revisedCount: number;
  passedCount: number;
  needsRevisionCount: number;
}

type WorkflowStatus = 'done' | 'active' | 'pending';

interface WorkflowStep {
  label: string;
  status: WorkflowStatus;
  description: string;
}

type ReviewStatus = 'not_submitted' | 'submitted' | 'needs_revision' | 'passed' | 'key_guidance';

interface ReviewStudent {
  id: string;
  name: string;
  className: string;
  targetRole: string;
  status: ReviewStatus;
  score: number;
  revisionCount: number;
  issue: string;
  lastUpdated: string;
}

interface NamedCount {
  name: string;
  count: number;
}

interface FunnelItem {
  stage: string;
  label: string;
  count: number;
}

interface HighRiskSample {
  id: string;
  targetRole: string;
  score: number;
  issue: string;
}

interface SchoolDashboardData {
  dataMode: 'demo' | 'live';
  generatedAt: string;
  metrics: DashboardMetricSet;
  taskMetrics: TaskMetrics;
  activeTask: ActiveTask;
  workflow: WorkflowStep[];
  readinessDistribution: Array<{ label: string; count: number }>;
  topIssues: NamedCount[];
  roleGaps: NamedCount[];
  funnel: FunnelItem[];
  highRiskSamples: HighRiskSample[];
  reviewQueue: ReviewStudent[];
}

const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; className: string }> = {
  not_submitted: { label: '未提交', className: 'border-neutral-200 bg-neutral-50 text-neutral-500' },
  submitted: { label: '待审核', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  needs_revision: { label: '需修改', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  passed: { label: '已通过', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  key_guidance: { label: '重点辅导', className: 'border-red-200 bg-red-50 text-red-700' },
};

const WORKFLOW_STATUS_META: Record<WorkflowStatus, { className: string; dotClassName: string }> = {
  done: { className: 'border-emerald-200 bg-emerald-50 text-emerald-800', dotClassName: 'bg-emerald-500' },
  active: { className: 'border-neutral-900 bg-neutral-900 text-white', dotClassName: 'bg-white' },
  pending: { className: 'border-neutral-200 bg-white text-neutral-500', dotClassName: 'bg-neutral-300' },
};

const LOCAL_REVIEW_STATUS_KEY = 'offerpilot.schoolDashboard.reviewStatuses.v1';
const REVIEW_ACTIONS: Array<{ status: ReviewStatus; label: string }> = [
  { status: 'passed', label: '通过' },
  { status: 'needs_revision', label: '需修改' },
  { status: 'key_guidance', label: '重点辅导' },
];

function MetricCard({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <div className="mt-3 flex items-end gap-1">
        <span className="text-3xl font-semibold tracking-tight text-neutral-950">{value}</span>
        {suffix && <span className="pb-1 text-sm text-neutral-400">{suffix}</span>}
      </div>
    </div>
  );
}

function ProgressMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-neutral-500">{label}</span>
        <span className="text-lg font-semibold text-neutral-950">{value}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-neutral-950" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
      </div>
      <p className="mt-2 text-xs text-neutral-400">{detail}</p>
    </div>
  );
}

function CountList({ items, emptyText }: { items: NamedCount[]; emptyText: string }) {
  const max = Math.max(...items.map((item) => item.count), 1);

  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.name}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="line-clamp-1 text-neutral-700">{item.name}</span>
            <span className="font-medium text-neutral-900">{item.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-neutral-900" style={{ width: `${Math.max((item.count / max) * 100, 6)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-950">{title}</h2>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const meta = REVIEW_STATUS_META[status] ?? REVIEW_STATUS_META.submitted;

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function readLocalReviewStatuses(): Record<string, ReviewStatus> {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(LOCAL_REVIEW_STATUS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, ReviewStatus] => {
        const [, status] = entry;
        return typeof status === 'string' && status in REVIEW_STATUS_META;
      })
    );
  } catch {
    return {};
  }
}

function writeLocalReviewStatuses(statuses: Record<string, ReviewStatus>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_REVIEW_STATUS_KEY, JSON.stringify(statuses));
}

function needsFollowUp(status: ReviewStatus) {
  return status === 'needs_revision' || status === 'key_guidance';
}

function formatSubmissionDate(submittedAt: string) {
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return submittedAt;
  return date.toISOString().slice(0, 10);
}

function incrementNamedCount(items: NamedCount[], name: string) {
  const next = items.map((item) => item.name === name ? { ...item, count: item.count + 1 } : item);
  if (next.some((item) => item.name === name)) return next;
  return [...next, { name, count: 1 }];
}

function toReviewStudent(submission: SchoolTaskSubmission): ReviewStudent {
  return {
    id: submission.id,
    name: submission.studentName,
    className: submission.className,
    targetRole: submission.targetRole,
    status: 'submitted',
    score: submission.score,
    revisionCount: submission.revisionCount,
    issue: submission.issue,
    lastUpdated: formatSubmissionDate(submission.submittedAt),
  };
}

function applyLocalSubmissions(data: SchoolDashboardData, submissions: SchoolTaskSubmission[]): SchoolDashboardData {
  if (submissions.length === 0) return data;

  const existingIds = new Set(data.reviewQueue.map((student) => student.id));
  const newSubmissions = submissions.filter((submission) => !existingIds.has(submission.id));
  const newStudents = newSubmissions.map(toReviewStudent);

  if (newStudents.length === 0) return data;

  const submittedCount = data.activeTask.submittedCount + newStudents.length;
  const studentTotal = Math.max(data.activeTask.studentTotal, submittedCount);
  const pendingReviewCount = data.taskMetrics.pendingReviewCount + newStudents.length;
  const submissionRate = studentTotal > 0 ? Math.round((submittedCount / studentTotal) * 100) : data.taskMetrics.submissionRate;

  return {
    ...data,
    metrics: {
      ...data.metrics,
      studentCount: Math.max(data.metrics.studentCount, studentTotal),
    },
    activeTask: {
      ...data.activeTask,
      studentTotal,
      submittedCount,
    },
    taskMetrics: {
      ...data.taskMetrics,
      submissionRate,
      pendingReviewCount,
      passRate: submittedCount > 0 ? Math.round((data.activeTask.passedCount / submittedCount) * 100) : data.taskMetrics.passRate,
    },
    roleGaps: newSubmissions.reduce((items, submission) => incrementNamedCount(items, submission.targetRole), data.roleGaps),
    topIssues: newSubmissions.reduce((items, submission) => incrementNamedCount(items, submission.issue), data.topIssues),
    reviewQueue: [...newStudents, ...data.reviewQueue],
  };
}

function applySingleReviewStatus(data: SchoolDashboardData, studentId: string, status: ReviewStatus): SchoolDashboardData {
  const currentStudent = data.reviewQueue.find((student) => student.id === studentId);
  if (!currentStudent || currentStudent.status === status) return data;

  const reviewQueue = data.reviewQueue.map((student) =>
    student.id === studentId
      ? { ...student, status, lastUpdated: '刚刚更新' }
      : student
  );

  const passedDelta = (status === 'passed' ? 1 : 0) - (currentStudent.status === 'passed' ? 1 : 0);
  const needsRevisionDelta = (needsFollowUp(status) ? 1 : 0) - (needsFollowUp(currentStudent.status) ? 1 : 0);
  const pendingReviewDelta = (status === 'submitted' ? 1 : 0) - (currentStudent.status === 'submitted' ? 1 : 0);
  const passedCount = Math.max(data.activeTask.passedCount + passedDelta, 0);
  const needsRevisionCount = Math.max(data.activeTask.needsRevisionCount + needsRevisionDelta, 0);
  const pendingReviewCount = Math.max(data.taskMetrics.pendingReviewCount + pendingReviewDelta, 0);

  return {
    ...data,
    activeTask: {
      ...data.activeTask,
      passedCount,
      needsRevisionCount,
    },
    taskMetrics: {
      ...data.taskMetrics,
      pendingReviewCount,
      needsRevisionCount,
      passRate: data.activeTask.submittedCount > 0
        ? Math.round((passedCount / data.activeTask.submittedCount) * 100)
        : data.taskMetrics.passRate,
    },
    reviewQueue,
  };
}

function applyReviewStatuses(data: SchoolDashboardData, statuses: Record<string, ReviewStatus>) {
  return Object.entries(statuses).reduce(
    (dashboard, [studentId, status]) => applySingleReviewStatus(dashboard, studentId, status),
    data
  );
}

function downloadQualityReport(data: SchoolDashboardData) {
  const lines = [
    `# ${data.activeTask.title}`,
    '',
    `任务编号：${data.activeTask.id}`,
    `负责老师：${data.activeTask.owner}`,
    `覆盖范围：${data.activeTask.cohort}`,
    `截止日期：${data.activeTask.deadline}`,
    `生成时间：${new Date(data.generatedAt).toLocaleString('zh-CN')}`,
    '',
    '## 核心指标',
    `- 学生总数：${data.activeTask.studentTotal}`,
    `- 已提交：${data.activeTask.submittedCount}`,
    `- 已修改：${data.activeTask.revisedCount}`,
    `- 已通过：${data.activeTask.passedCount}`,
    `- 需修改：${data.activeTask.needsRevisionCount}`,
    `- 提交率：${data.taskMetrics.submissionRate}%`,
    `- 修改率：${data.taskMetrics.revisionRate}%`,
    `- 通过率：${data.taskMetrics.passRate}%`,
    '',
    '## 常见问题',
    ...data.topIssues.map((item, index) => `${index + 1}. ${item.name}：${item.count} 人次`),
    '',
    '## 重点学生',
    ...data.reviewQueue
      .filter((student) => student.status === 'key_guidance' || student.status === 'needs_revision')
      .map((student) => `- ${student.name}（${student.className} / ${student.targetRole}）：${student.issue}，当前分数 ${student.score}`),
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${data.activeTask.id}-就业材料质量报告.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function SchoolDashboardPage() {
  const [data, setData] = useState<SchoolDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localReviewStatuses, setLocalReviewStatuses] = useState<Record<string, ReviewStatus>>({});

  useEffect(() => {
    let aborted = false;

    fetch('/api/school/dashboard')
      .then((response) => response.json())
      .then((dashboard) => {
        if (aborted) return;
        const statuses = readLocalReviewStatuses();
        const submissions = readSchoolTaskSubmissions();
        setLocalReviewStatuses(statuses);
        setData(applyReviewStatuses(applyLocalSubmissions(dashboard, submissions), statuses));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!aborted) setIsLoading(false);
      });

    return () => {
      aborted = true;
    };
  }, []);

  const improvement = useMemo(() => {
    if (!data?.metrics.averageScoreBefore || !data.metrics.averageScoreAfter) return null;
    return data.metrics.averageScoreAfter - data.metrics.averageScoreBefore;
  }, [data]);

  const handleReviewStatusChange = (studentId: string, status: ReviewStatus) => {
    setLocalReviewStatuses((current) => {
      const next = { ...current, [studentId]: status };
      writeLocalReviewStatuses(next);
      return next;
    });
    setData((current) => current ? applySingleReviewStatus(current, studentId, status) : current);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <AppTopNav current="diagnose" />
        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500 shadow-sm">正在加载学校看板...</div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <AppTopNav current="diagnose" />
        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
            <p className="text-sm text-neutral-500">学校看板暂时不可用。</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <AppTopNav current="diagnose" />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex flex-col gap-6 border-b border-neutral-200 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500">
              {data.dataMode === 'demo' ? '演示数据' : '真实数据'} · {new Date(data.generatedAt).toLocaleString('zh-CN')}
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">就业材料质量管理工作台</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-500">
              面向学校 / 老师的任务制闭环：创建诊断任务、追踪学生提交、查看 AI 诊断、审核修改结果，并导出班级质量报告。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/school/task/submit"
              className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:border-neutral-500"
            >
              学生提交入口
            </Link>
            <button
              type="button"
              onClick={() => downloadQualityReport(data)}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:border-neutral-500"
            >
              导出质量报告
            </button>
            <Link
              href="/diagnose"
              className="inline-flex items-center justify-center rounded-xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              新增学生诊断
            </Link>
          </div>
        </header>

        <section className="mt-8 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm text-neutral-500">{data.activeTask.id}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950">{data.activeTask.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-neutral-500">{data.activeTask.cohort}</p>
                </div>
                <span className="inline-flex w-fit rounded-full bg-neutral-950 px-3 py-1 text-xs font-medium text-white">
                  {data.activeTask.status}
                </span>
              </div>
              <div className="mt-6 grid gap-3 text-sm text-neutral-500 sm:grid-cols-2">
                <div className="rounded-2xl bg-neutral-50 p-4">负责方：{data.activeTask.owner}</div>
                <div className="rounded-2xl bg-neutral-50 p-4">截止日期：{data.activeTask.deadline}</div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="任务学生数" value={data.activeTask.studentTotal} />
              <MetricCard label="已提交" value={data.activeTask.submittedCount} />
              <MetricCard label="已修改" value={data.activeTask.revisedCount} />
              <MetricCard label="已通过" value={data.activeTask.passedCount} />
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <ProgressMetric label="提交率" value={data.taskMetrics.submissionRate} detail={`${data.activeTask.submittedCount} / ${data.activeTask.studentTotal} 人已提交`} />
          <ProgressMetric label="修改率" value={data.taskMetrics.revisionRate} detail={`${data.activeTask.revisedCount} 人已完成至少一轮修改`} />
          <ProgressMetric label="通过率" value={data.taskMetrics.passRate} detail={`${data.activeTask.passedCount} 人已达到投递标准`} />
        </section>

        <div className="mt-8">
          <SectionCard title="B2B2C 任务闭环流程">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              {data.workflow.map((step, index) => {
                const meta = WORKFLOW_STATUS_META[step.status] ?? WORKFLOW_STATUS_META.pending;
                return (
                  <div key={`${step.label}-${index}`} className={`rounded-2xl border p-4 ${meta.className}`}>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClassName}`} />
                      <span className="text-sm font-semibold">{step.label}</span>
                    </div>
                    <p className="mt-3 text-xs leading-5 opacity-80">{step.description}</p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="学生 / 会话" value={data.metrics.studentCount} />
          <MetricCard label="诊断报告" value={data.metrics.reportCount} />
          <MetricCard label="待老师审核" value={data.taskMetrics.pendingReviewCount} />
          <MetricCard label="需修改 / 重点辅导" value={data.taskMetrics.needsRevisionCount} />
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-3">
          <MetricCard label="改前平均分" value={data.metrics.averageScoreBefore ?? '-'} />
          <MetricCard label="改后预估分" value={data.metrics.averageScoreAfter ?? '-'} />
          <MetricCard label="准备度提升" value={improvement === null ? '-' : `+${improvement}`} />
        </section>

        <div className="mt-8">
          <SectionCard
            title="老师审核队列"
            action={<span className="text-sm text-neutral-400">通过 / 需修改 / 重点辅导</span>}
          >
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
                <thead className="bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">学生</th>
                    <th className="px-4 py-3 font-medium">班级</th>
                    <th className="px-4 py-3 font-medium">目标岗位</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">分数</th>
                    <th className="px-4 py-3 font-medium">修改轮次</th>
                    <th className="px-4 py-3 font-medium">主要问题</th>
                    <th className="px-4 py-3 font-medium">老师操作</th>
                    <th className="px-4 py-3 font-medium">更新</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.reviewQueue.map((student) => (
                    <tr key={student.id} className="bg-white">
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-950">{student.name}</div>
                        <div className="text-xs text-neutral-400">{student.id}</div>
                      </td>
                      <td className="px-4 py-3 text-neutral-600">{student.className}</td>
                      <td className="px-4 py-3 text-neutral-900">{student.targetRole}</td>
                      <td className="px-4 py-3"><ReviewStatusBadge status={student.status} /></td>
                      <td className={student.score < 60 ? 'px-4 py-3 font-semibold text-red-600' : 'px-4 py-3 font-semibold text-neutral-950'}>{student.score}</td>
                      <td className="px-4 py-3 text-neutral-600">{student.revisionCount}</td>
                      <td className="px-4 py-3 text-neutral-600">{student.issue}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {REVIEW_ACTIONS.map((action) => {
                            const isActive = student.status === action.status;
                            const isLocallySaved = localReviewStatuses[student.id] === action.status;

                            return (
                              <button
                                key={action.status}
                                type="button"
                                onClick={() => handleReviewStatusChange(student.id, action.status)}
                                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                                  isActive
                                    ? 'border-neutral-950 bg-neutral-950 text-white'
                                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400'
                                }`}
                              >
                                {action.label}{isLocallySaved ? ' ✓' : ''}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-400">{student.lastUpdated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <SectionCard title="就业准备度分布">
            <div className="space-y-4">
              {data.readinessDistribution.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3">
                  <span className="text-sm text-neutral-600">{item.label}</span>
                  <span className="text-xl font-semibold text-neutral-950">{item.count}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="投递转化漏斗">
            <div className="space-y-3">
              {data.funnel.map((item) => (
                <div key={item.stage} className="flex items-center justify-between border-b border-neutral-100 pb-3 last:border-b-0 last:pb-0">
                  <span className="text-sm text-neutral-600">{item.label}</span>
                  <span className="text-xl font-semibold text-neutral-950">{item.count}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="常见问题 Top 6">
            <CountList items={data.topIssues} emptyText="暂无诊断问题数据" />
          </SectionCard>

          <SectionCard title="目标岗位分布">
            <CountList items={data.roleGaps} emptyText="暂无岗位方向数据" />
          </SectionCard>
        </div>

        <SectionCard title="高风险学生样例">
          {data.highRiskSamples.length === 0 ? (
            <p className="text-sm text-neutral-400">暂无 60 分以下样例。</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-neutral-200">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">学生</th>
                    <th className="px-4 py-3 font-medium">目标岗位</th>
                    <th className="px-4 py-3 font-medium">分数</th>
                    <th className="px-4 py-3 font-medium">主要问题</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.highRiskSamples.map((student) => (
                    <tr key={student.id}>
                      <td className="px-4 py-3 text-neutral-600">{student.id}</td>
                      <td className="px-4 py-3 text-neutral-900">{student.targetRole}</td>
                      <td className="px-4 py-3 font-semibold text-red-600">{student.score}</td>
                      <td className="px-4 py-3 text-neutral-600">{student.issue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
}
