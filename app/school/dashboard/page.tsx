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
  not_submitted: { label: '未提交', className: 'text-neutral-400 bg-neutral-100' },
  submitted: { label: '待审核', className: 'text-sky-700 bg-sky-50' },
  needs_revision: { label: '需修改', className: 'text-amber-700 bg-amber-50' },
  passed: { label: '已通过', className: 'text-emerald-700 bg-emerald-50' },
  key_guidance: { label: '重点辅导', className: 'text-rose-700 bg-rose-50' },
};

const LOCAL_REVIEW_STATUS_KEY = 'offerpilot.schoolDashboard.reviewStatuses.v1';
const REVIEW_ACTIONS: Array<{ status: ReviewStatus; label: string }> = [
  { status: 'passed', label: '通过' },
  { status: 'needs_revision', label: '需修改' },
  { status: 'key_guidance', label: '重点辅导' },
];

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
      ? { ...student, status, lastUpdated: '刚刚' }
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
      <div className="min-h-screen bg-white text-neutral-900">
        <AppTopNav current="diagnose" />
        <main className="mx-auto max-w-6xl px-6 py-20 text-xs font-mono text-neutral-400">
          加载中...
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <AppTopNav current="diagnose" />
        <main className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-xs font-mono text-neutral-500">暂无数据</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans pb-32">
      <AppTopNav current="diagnose" />

      <main className="mx-auto max-w-6xl px-6 sm:px-8 pt-10 sm:pt-14">
        
        {/* ── 顶部标题栏（纯粹、无废话解释） ── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-8 border-b border-neutral-200">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-950 sm:text-4xl">
              就业材料质量管理工作台
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs font-medium">
            <Link
              href="/school/task/submit"
              className="text-neutral-600 hover:text-neutral-950 transition-colors"
            >
              学生提交入口 ↗
            </Link>
            <button
              type="button"
              onClick={() => downloadQualityReport(data)}
              className="text-neutral-600 hover:text-neutral-950 transition-colors"
            >
              导出质量报告 ↗
            </button>
            <Link
              href="/diagnose"
              className="inline-flex h-9 items-center justify-center bg-neutral-950 px-5 text-xs font-bold text-white transition-colors hover:bg-neutral-800"
            >
              新增学生诊断 ➔
            </Link>
          </div>
        </div>

        {/* ── 核心任务看板 ── */}
        <section className="pt-10 pb-12 border-b border-neutral-200">
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-semibold text-neutral-400">
                {data.activeTask.id}
              </span>
              <span className="text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5">
                {data.activeTask.status}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
              {data.activeTask.title}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 font-mono">
              <span>{data.activeTask.cohort}</span>
              <span>•</span>
              <span>{data.activeTask.owner}</span>
              <span>•</span>
              <span>截止 {data.activeTask.deadline}</span>
            </div>
          </div>

          {/* 4 项关键数据 */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-8 pt-8 border-t border-neutral-100">
            <div>
              <span className="text-xs font-mono text-neutral-400 block">学生数</span>
              <span className="mt-1 block text-3xl font-extrabold font-mono tracking-tight text-neutral-950">
                {data.activeTask.studentTotal}
              </span>
            </div>
            <div>
              <span className="text-xs font-mono text-neutral-400 block">已提交</span>
              <span className="mt-1 block text-3xl font-extrabold font-mono tracking-tight text-neutral-950">
                {data.activeTask.submittedCount}
              </span>
            </div>
            <div>
              <span className="text-xs font-mono text-neutral-400 block">已修改</span>
              <span className="mt-1 block text-3xl font-extrabold font-mono tracking-tight text-neutral-950">
                {data.activeTask.revisedCount}
              </span>
            </div>
            <div>
              <span className="text-xs font-mono text-neutral-400 block">已通过</span>
              <span className="mt-1 block text-3xl font-extrabold font-mono tracking-tight text-neutral-950">
                {data.activeTask.passedCount}
              </span>
            </div>
          </div>

          {/* 3 条进度条（去除重复文本） */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-neutral-100">
            <div>
              <div className="flex items-baseline justify-between text-xs mb-2">
                <span className="text-neutral-500">提交率</span>
                <span className="font-mono font-bold text-neutral-950">{data.taskMetrics.submissionRate}%</span>
              </div>
              <div className="h-1 w-full bg-neutral-100 overflow-hidden">
                <div className="h-full bg-neutral-950" style={{ width: `${data.taskMetrics.submissionRate}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between text-xs mb-2">
                <span className="text-neutral-500">修改率</span>
                <span className="font-mono font-bold text-neutral-950">{data.taskMetrics.revisionRate}%</span>
              </div>
              <div className="h-1 w-full bg-neutral-100 overflow-hidden">
                <div className="h-full bg-neutral-950" style={{ width: `${data.taskMetrics.revisionRate}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between text-xs mb-2">
                <span className="text-neutral-500">通过率</span>
                <span className="font-mono font-bold text-neutral-950">{data.taskMetrics.passRate}%</span>
              </div>
              <div className="h-1 w-full bg-neutral-100 overflow-hidden">
                <div className="h-full bg-neutral-950" style={{ width: `${data.taskMetrics.passRate}%` }} />
              </div>
            </div>
          </div>
        </section>

        {/* ── 闭环流程（纯净节点，删除多余废话解释） ── */}
        <section className="pt-10 pb-12 border-b border-neutral-200">
          <h3 className="mb-6 text-sm font-bold text-neutral-950">
            任务闭环流程
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-6">
            {data.workflow.map((step, index) => {
              return (
                <div key={`${step.label}-${index}`} className="space-y-1">
                  <div className="flex items-center gap-1.5 font-mono text-xs">
                    <span className="font-bold text-neutral-300">0{index + 1}</span>
                    <span className={`text-[11px] ${step.status === 'done' ? 'text-emerald-700 font-medium' : step.status === 'active' ? 'text-neutral-950 font-bold' : 'text-neutral-300'}`}>
                      {step.status === 'done' ? '完成' : step.status === 'active' ? '当前' : '未开始'}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-neutral-950">
                    {step.label}
                  </h4>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 全局数据与提分变化 ── */}
        <section className="pt-10 pb-12 border-b border-neutral-200">
          <h3 className="mb-6 text-sm font-bold text-neutral-950">
            质量与提分指标
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8">
            <div>
              <span className="text-xs font-mono text-neutral-400 block">学生数</span>
              <span className="mt-1 block text-2xl font-bold font-mono text-neutral-950">{data.metrics.studentCount}</span>
            </div>
            <div>
              <span className="text-xs font-mono text-neutral-400 block">报告数</span>
              <span className="mt-1 block text-2xl font-bold font-mono text-neutral-950">{data.metrics.reportCount}</span>
            </div>
            <div>
              <span className="text-xs font-mono text-neutral-400 block">待审核</span>
              <span className="mt-1 block text-2xl font-bold font-mono text-sky-700">{data.taskMetrics.pendingReviewCount}</span>
            </div>
            <div>
              <span className="text-xs font-mono text-neutral-400 block">需辅导</span>
              <span className="mt-1 block text-2xl font-bold font-mono text-amber-700">{data.taskMetrics.needsRevisionCount}</span>
            </div>
            <div>
              <span className="text-xs font-mono text-neutral-400 block">改前均分</span>
              <span className="mt-1 block text-2xl font-bold font-mono text-neutral-500">{data.metrics.averageScoreBefore ?? '-'}</span>
            </div>
            <div>
              <span className="text-xs font-mono text-neutral-400 block">提升幅度</span>
              <span className="mt-1 block text-2xl font-bold font-mono text-emerald-700">
                {improvement === null ? '-' : `+${improvement}`}
              </span>
            </div>
          </div>
        </section>

        {/* ── 老师审核队列 ── */}
        <section className="pt-10 pb-12 border-b border-neutral-200">
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-sm font-bold text-neutral-950">
              审核队列
            </h3>
            <span className="text-xs font-mono text-neutral-400">
              {data.reviewQueue.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-400 font-mono">
                  <th className="py-3 pr-4 font-normal">学生</th>
                  <th className="py-3 pr-4 font-normal">班级</th>
                  <th className="py-3 pr-4 font-normal">意向</th>
                  <th className="py-3 pr-4 font-normal">状态</th>
                  <th className="py-3 pr-4 font-normal">分数</th>
                  <th className="py-3 pr-4 font-normal">轮次</th>
                  <th className="py-3 pr-4 font-normal">主要问题</th>
                  <th className="py-3 pr-4 font-normal">操作</th>
                  <th className="py-3 font-normal text-right">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.reviewQueue.map((student) => (
                  <tr key={student.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-3.5 pr-4">
                      <span className="font-bold text-neutral-950 block">{student.name}</span>
                      <span className="font-mono text-[11px] text-neutral-400">{student.id}</span>
                    </td>
                    <td className="py-3.5 pr-4 text-neutral-600 font-mono">{student.className}</td>
                    <td className="py-3.5 pr-4 font-medium text-neutral-900">{student.targetRole}</td>
                    <td className="py-3.5 pr-4">
                      <span className={`px-2 py-0.5 text-[11px] font-mono font-medium ${REVIEW_STATUS_META[student.status]?.className}`}>
                        {REVIEW_STATUS_META[student.status]?.label}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 font-mono font-bold text-neutral-950">
                      <span className={student.score < 60 ? 'text-red-600 font-bold' : ''}>
                        {student.score}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 font-mono text-neutral-500">{student.revisionCount}</td>
                    <td className="py-3.5 pr-4 text-neutral-600 max-w-[220px] truncate">{student.issue}</td>
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-1">
                        {REVIEW_ACTIONS.map((action) => {
                          const isActive = student.status === action.status;
                          return (
                            <button
                              key={action.status}
                              type="button"
                              onClick={() => handleReviewStatusChange(student.id, action.status)}
                              className={`px-2 py-0.5 text-[11px] font-mono transition-colors ${
                                isActive
                                  ? 'bg-neutral-950 text-white font-bold'
                                  : 'text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100'
                              }`}
                            >
                              {action.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3.5 font-mono text-[11px] text-neutral-400 text-right">{student.lastUpdated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 常见问题与方向分析 ── */}
        <section className="pt-10 grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
          <div>
            <h3 className="mb-6 text-sm font-bold text-neutral-950">
              常见问题 Top 6
            </h3>
            <div className="space-y-4">
              {data.topIssues.map((item) => (
                <div key={item.name}>
                  <div className="flex items-baseline justify-between text-xs mb-1.5">
                    <span className="text-neutral-700">{item.name}</span>
                    <span className="font-mono font-bold text-neutral-950">{item.count}</span>
                  </div>
                  <div className="h-1 w-full bg-neutral-100 overflow-hidden">
                    <div className="h-full bg-neutral-950" style={{ width: `${Math.max((item.count / 80) * 100, 8)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-6 text-sm font-bold text-neutral-950">
              岗位分布
            </h3>
            <div className="space-y-4">
              {data.roleGaps.map((item) => (
                <div key={item.name}>
                  <div className="flex items-baseline justify-between text-xs mb-1.5">
                    <span className="text-neutral-700">{item.name}</span>
                    <span className="font-mono font-bold text-neutral-950">{item.count}</span>
                  </div>
                  <div className="h-1 w-full bg-neutral-100 overflow-hidden">
                    <div className="h-full bg-neutral-950" style={{ width: `${Math.max((item.count / 50) * 100, 8)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
