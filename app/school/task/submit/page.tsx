'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppTopNav from '@/components/offerpilot/AppTopNav';
import {
  DEFAULT_SCHOOL_TASK_ID,
  upsertSchoolTaskSubmission,
  type SchoolTaskSubmission,
} from '@/lib/school-demo-storage';

interface FormState {
  taskId: string;
  studentName: string;
  studentCode: string;
  className: string;
  targetRole: string;
  jobDescription: string;
  resumeText: string;
}

const INITIAL_FORM: FormState = {
  taskId: DEFAULT_SCHOOL_TASK_ID,
  studentName: '',
  studentCode: '',
  className: '计算机 2601 班',
  targetRole: '',
  jobDescription: '',
  resumeText: '',
};

const DEMO_RESUME = `李同学
联系电话：138-0000-0000 | 邮箱：student@example.com
求职意向：前端开发实习生

教育背景
- 某某大学，软件工程，本科，2022-2026
- 主修课程：数据结构、计算机网络、数据库系统、Web 前端开发

项目经历
- 校园二手交易平台：负责商品发布、搜索筛选和用户中心页面开发
- 使用 React、TypeScript、Tailwind CSS 完成核心页面，实现响应式适配
- 将首屏加载时间从 2.8s 优化到 1.6s，提升用户访问体验

实习经历
- 某科技公司前端实习生：参与运营后台页面重构
- 配合产品经理梳理表单流程，减少重复录入字段

技能
- 熟悉 HTML、CSS、JavaScript、TypeScript、React
- 了解 Node.js、RESTful API、Git 协作流程`;

function estimateInitialScore(resumeText: string, jobDescription: string) {
  const lengthScore = Math.min(Math.floor(resumeText.trim().length / 20), 22);
  const jdScore = jobDescription.trim() ? 8 : 0;
  const evidenceScore = /\d+|%|提升|降低|增长|优化/.test(resumeText) ? 10 : 0;
  return Math.min(58 + lengthScore + jdScore + evidenceScore, 86);
}

function getInitialIssue(resumeText: string, jobDescription: string) {
  if (resumeText.trim().length < 300) return '简历内容偏短，建议补充项目背景、个人职责和量化结果';
  if (!jobDescription.trim()) return '未提供岗位 JD，岗位匹配度需要老师后续补充判断';
  if (!/\d+|%|提升|降低|增长|优化/.test(resumeText)) return '经历描述缺少量化证据，建议补充结果指标';
  return '学生已提交，等待 AI 诊断报告与老师审核';
}

function buildSubmissionId(taskId: string, studentCode: string) {
  const safeTaskId = taskId.trim().replace(/[^a-zA-Z0-9-]/g, '-');
  const safeStudentCode = studentCode.trim().replace(/[^a-zA-Z0-9-]/g, '-');
  return `LOCAL-${safeTaskId}-${safeStudentCode}`;
}

export default function SchoolTaskSubmitPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [savedSubmission, setSavedSubmission] = useState<SchoolTaskSubmission | null>(null);

  const canSubmit = useMemo(() => {
    return Boolean(
      form.taskId.trim() &&
      form.studentName.trim() &&
      form.studentCode.trim() &&
      form.className.trim() &&
      form.targetRole.trim() &&
      form.resumeText.trim().length >= 100
    );
  }, [form]);

  const updateField = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const fillDemo = () => {
    setForm({
      taskId: DEFAULT_SCHOOL_TASK_ID,
      studentName: '李同学',
      studentCode: 'S-2026-128',
      className: '计算机 2601 班',
      targetRole: '前端开发实习生',
      jobDescription: '岗位职责：参与 Web 前端页面开发，配合产品和后端完成业务需求落地；要求熟悉 React、TypeScript，有项目优化经验优先。',
      resumeText: DEMO_RESUME,
    });
    setError(null);
  };

  const saveSubmission = (startDiagnose: boolean) => {
    if (!canSubmit) {
      setError('请填写任务编号、学生信息、目标岗位，并粘贴不少于 100 字的简历内容。');
      return;
    }

    const now = new Date().toISOString();
    const submission: SchoolTaskSubmission = {
      id: buildSubmissionId(form.taskId, form.studentCode),
      taskId: form.taskId.trim(),
      studentName: form.studentName.trim(),
      studentCode: form.studentCode.trim(),
      className: form.className.trim(),
      targetRole: form.targetRole.trim(),
      resumeText: form.resumeText.trim(),
      jobDescription: form.jobDescription.trim(),
      status: 'submitted',
      score: estimateInitialScore(form.resumeText, form.jobDescription),
      issue: getInitialIssue(form.resumeText, form.jobDescription),
      revisionCount: 0,
      submittedAt: now,
    };

    upsertSchoolTaskSubmission(submission);
    setSavedSubmission(submission);

    if (startDiagnose) {
      sessionStorage.setItem('diagnoseData', JSON.stringify({
        resumeText: submission.resumeText,
        resumeParagraphs: submission.resumeText.split(/\n\s*\n/).filter(Boolean),
        targetRole: submission.targetRole,
        jobDescription: submission.jobDescription,
        tier: 'free',
        diagnoseMode: 'basic',
        sourceType: 'paste',
        schoolTask: {
          taskId: submission.taskId,
          studentName: submission.studentName,
          studentCode: submission.studentCode,
          className: submission.className,
        },
      }));
      router.push('/diagnose/loading');
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveSubmission(false);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <AppTopNav current="diagnose" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex flex-col gap-6 border-b border-neutral-200 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500">
              学生端任务入口 · {DEFAULT_SCHOOL_TASK_ID}
            </div>
            <h1 className="text-4xl font-semibold tracking-tight text-neutral-950 sm:text-5xl">提交就业材料诊断任务</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-500">
              学生填写班级、姓名、岗位方向并提交简历。老师端看板会即时看到该学生进入待审核队列。
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={fillDemo}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:border-neutral-500"
            >
              填入演示学生
            </button>
            <Link
              href="/school/dashboard"
              className="inline-flex items-center justify-center rounded-xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-700"
            >
              查看老师看板
            </Link>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form onSubmit={handleSubmit} className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">任务编号</span>
                <input
                  value={form.taskId}
                  onChange={(event) => updateField('taskId', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">班级</span>
                <input
                  value={form.className}
                  onChange={(event) => updateField('className', event.target.value)}
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">姓名</span>
                <input
                  value={form.studentName}
                  onChange={(event) => updateField('studentName', event.target.value)}
                  placeholder="例如：李同学"
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">学号</span>
                <input
                  value={form.studentCode}
                  onChange={(event) => updateField('studentCode', event.target.value)}
                  placeholder="例如：S-2026-128"
                  className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
                />
              </label>
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-neutral-700">目标岗位</span>
              <input
                value={form.targetRole}
                onChange={(event) => updateField('targetRole', event.target.value)}
                placeholder="例如：前端开发实习生 / 产品助理 / 数据分析实习生"
                className="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none transition focus:border-neutral-900"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-neutral-700">岗位 JD（可选）</span>
              <textarea
                value={form.jobDescription}
                onChange={(event) => updateField('jobDescription', event.target.value)}
                rows={4}
                placeholder="粘贴岗位职责和任职要求，系统会结合岗位匹配度分析。"
                className="mt-2 w-full resize-y rounded-xl border border-neutral-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-neutral-900"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-neutral-700">简历文本</span>
              <textarea
                value={form.resumeText}
                onChange={(event) => updateField('resumeText', event.target.value)}
                rows={12}
                placeholder="请粘贴简历文本，至少 100 字。"
                className="mt-2 w-full resize-y rounded-xl border border-neutral-200 px-4 py-3 text-sm leading-6 outline-none transition focus:border-neutral-900"
              />
            </label>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex flex-1 items-center justify-center rounded-xl bg-neutral-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
              >
                提交给老师
              </button>
              <button
                type="button"
                onClick={() => saveSubmission(true)}
                disabled={!canSubmit}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-800 transition hover:border-neutral-500 disabled:cursor-not-allowed disabled:text-neutral-300"
              >
                提交并开始 AI 诊断
              </button>
            </div>
          </form>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold tracking-tight text-neutral-950">提交后老师看到什么？</h2>
              <div className="mt-5 space-y-3 text-sm text-neutral-600">
                <div className="rounded-2xl bg-neutral-50 p-4">学生进入老师审核队列，状态为待审核。</div>
                <div className="rounded-2xl bg-neutral-50 p-4">提交率、待审核人数会实时更新。</div>
                <div className="rounded-2xl bg-neutral-50 p-4">老师可标记通过、需修改或重点辅导。</div>
                <div className="rounded-2xl bg-neutral-50 p-4">质量报告导出会包含最新审核状态。</div>
              </div>
            </section>

            {savedSubmission && (
              <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                <h2 className="text-lg font-semibold tracking-tight text-emerald-950">提交成功</h2>
                <p className="mt-3 text-sm leading-6 text-emerald-800">
                  {savedSubmission.studentName} 已进入 {savedSubmission.taskId} 的待审核队列。
                </p>
                <Link
                  href="/school/dashboard"
                  className="mt-5 inline-flex rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
                >
                  去老师看板查看
                </Link>
              </section>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
