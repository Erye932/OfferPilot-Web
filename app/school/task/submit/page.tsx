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
  if (resumeText.trim().length < 300) return '简历偏短，建议补充量化成果';
  if (!jobDescription.trim()) return '未提供岗位 JD';
  if (!/\d+|%|提升|降低|增长|优化/.test(resumeText)) return '经历缺少量化证据';
  return '已提交，等待审核';
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
      setError('请填写必填项并粘贴至少 100 字简历内容。');
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
    <div className="min-h-screen bg-white text-neutral-900 font-sans pb-32">
      <AppTopNav current="diagnose" />
      <main className="mx-auto max-w-4xl px-6 pt-10 sm:pt-14">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between pb-8 border-b border-neutral-200">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-neutral-950">
              提交就业材料
            </h1>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <button
              type="button"
              onClick={fillDemo}
              className="text-neutral-500 hover:text-neutral-950 transition-colors"
            >
              填入样例数据
            </button>
            <Link
              href="/school/dashboard"
              className="text-neutral-600 hover:text-neutral-950 transition-colors"
            >
              返回看板 ↗
            </Link>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-mono text-neutral-500">任务编号</span>
              <input
                value={form.taskId}
                onChange={(event) => updateField('taskId', event.target.value)}
                className="mt-1.5 w-full rounded-none border border-neutral-200 bg-white px-3.5 py-2.5 text-xs text-neutral-900 outline-none transition focus:border-neutral-950"
              />
            </label>
            <label className="block">
              <span className="text-xs font-mono text-neutral-500">班级</span>
              <input
                value={form.className}
                onChange={(event) => updateField('className', event.target.value)}
                className="mt-1.5 w-full rounded-none border border-neutral-200 bg-white px-3.5 py-2.5 text-xs text-neutral-900 outline-none transition focus:border-neutral-950"
              />
            </label>
            <label className="block">
              <span className="text-xs font-mono text-neutral-500">姓名</span>
              <input
                value={form.studentName}
                onChange={(event) => updateField('studentName', event.target.value)}
                placeholder="李同学"
                className="mt-1.5 w-full rounded-none border border-neutral-200 bg-white px-3.5 py-2.5 text-xs text-neutral-900 outline-none transition focus:border-neutral-950"
              />
            </label>
            <label className="block">
              <span className="text-xs font-mono text-neutral-500">学号</span>
              <input
                value={form.studentCode}
                onChange={(event) => updateField('studentCode', event.target.value)}
                placeholder="S-2026-128"
                className="mt-1.5 w-full rounded-none border border-neutral-200 bg-white px-3.5 py-2.5 text-xs text-neutral-900 outline-none transition focus:border-neutral-950"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-mono text-neutral-500">目标岗位</span>
            <input
              value={form.targetRole}
              onChange={(event) => updateField('targetRole', event.target.value)}
              placeholder="例如：前端开发实习生"
              className="mt-1.5 w-full rounded-none border border-neutral-200 bg-white px-3.5 py-2.5 text-xs text-neutral-900 outline-none transition focus:border-neutral-950"
            />
          </label>

          <label className="block">
            <span className="text-xs font-mono text-neutral-500">岗位 JD（可选）</span>
            <textarea
              value={form.jobDescription}
              onChange={(event) => updateField('jobDescription', event.target.value)}
              rows={4}
              placeholder="岗位职责与要求"
              className="mt-1.5 w-full resize-y rounded-none border border-neutral-200 bg-white px-3.5 py-2.5 text-xs leading-5 outline-none transition focus:border-neutral-950"
            />
          </label>

          <label className="block">
            <span className="text-xs font-mono text-neutral-500">简历内容</span>
            <textarea
              value={form.resumeText}
              onChange={(event) => updateField('resumeText', event.target.value)}
              rows={12}
              placeholder="粘贴简历文本（至少 100 字）"
              className="mt-1.5 w-full resize-y rounded-none border border-neutral-200 bg-white px-3.5 py-2.5 text-xs leading-5 font-mono outline-none transition focus:border-neutral-950"
            />
          </label>

          {error && (
            <div className="rounded-none border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {savedSubmission && (
            <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200">
              {savedSubmission.studentName} 已提交成功。
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row pt-4">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-10 flex-1 items-center justify-center bg-neutral-950 px-5 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              提交材料
            </button>
            <button
              type="button"
              onClick={() => saveSubmission(true)}
              disabled={!canSubmit}
              className="inline-flex h-10 flex-1 items-center justify-center border border-neutral-300 bg-white px-5 text-xs font-medium text-neutral-800 transition hover:border-neutral-900 hover:text-neutral-950 disabled:cursor-not-allowed disabled:text-neutral-300"
            >
              提交并直接诊断 ➔
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
