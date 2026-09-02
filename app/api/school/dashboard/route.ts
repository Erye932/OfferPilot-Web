import { NextResponse } from 'next/server';
import {
  APPLICATION_OUTCOME_STAGE_LABELS,
  APPLICATION_OUTCOME_STAGE_ORDER,
  POSITIVE_APPLICATION_OUTCOME_STAGES,
  type ApplicationOutcomeStageValue,
} from '@/lib/application-outcomes';
import { logWarn } from '@/lib/error-handler';
import { isDemoSafeModeEnabled } from '@/lib/demo-safe-mode';

async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

type AnyRecord = Record<string, unknown>;

const DASHBOARD_DB_TIMEOUT_MS = Number.parseInt(process.env.SCHOOL_DASHBOARD_DB_TIMEOUT_MS || '1500', 10);
const DASHBOARD_DEMO_CIRCUIT_MS = Number.parseInt(process.env.SCHOOL_DASHBOARD_DEMO_CIRCUIT_MS || '30000', 10);
let demoCircuitUntil = 0;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getScore(reportJson: unknown): number | null {
  if (!isRecord(reportJson)) return null;
  return getNumber(reportJson.overall_score) ?? getNumber(reportJson.excellent_score);
}

function getBeforeAfterScore(reportJson: unknown): { before: number | null; after: number | null } {
  if (!isRecord(reportJson)) return { before: null, after: null };
  const beforeAfter = reportJson.before_after;
  if (!isRecord(beforeAfter)) return { before: getScore(reportJson), after: null };
  const overall = beforeAfter.overall_score;
  if (!isRecord(overall)) return { before: getScore(reportJson), after: null };
  return {
    before: getNumber(overall.before),
    after: getNumber(overall.after),
  };
}

function getIssueTitles(reportJson: unknown): string[] {
  if (!isRecord(reportJson)) return [];
  const titles: string[] = [];

  const coreIssues = reportJson.core_issues;
  if (Array.isArray(coreIssues)) {
    for (const issue of coreIssues) {
      if (isRecord(issue) && typeof issue.title === 'string') titles.push(issue.title);
    }
  }

  const crossSectionSummary = reportJson.cross_section_summary;
  if (isRecord(crossSectionSummary) && Array.isArray(crossSectionSummary.must_fix_top)) {
    for (const issue of crossSectionSummary.must_fix_top) {
      if (isRecord(issue) && typeof issue.title === 'string') titles.push(issue.title);
    }
  }

  const commentsByDimension = reportJson.comments_by_dimension;
  if (isRecord(commentsByDimension)) {
    for (const comments of Object.values(commentsByDimension)) {
      if (!Array.isArray(comments)) continue;
      for (const comment of comments) {
        if (isRecord(comment) && typeof comment.title === 'string') titles.push(comment.title);
      }
    }
  }

  return titles;
}

function getTopItems(items: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function average(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (filtered.length === 0) return null;
  return Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length);
}

function getDemoDashboard() {
  return {
    dataMode: 'demo',
    generatedAt: new Date().toISOString(),
    metrics: {
      studentCount: 126,
      reportCount: 168,
      outcomeCount: 312,
      highRiskCount: 29,
      averageScoreBefore: 62,
      averageScoreAfter: 78,
      positiveOutcomeRate: 27,
    },
    taskMetrics: {
      submissionRate: 86,
      revisionRate: 64,
      passRate: 58,
      pendingReviewCount: 18,
      needsRevisionCount: 31,
    },
    activeTask: {
      id: 'TASK-2026-SPRING-01',
      title: '2026 届春招就业材料诊断任务',
      owner: '就业指导中心 · 张老师',
      cohort: '计算机学院 / 2026 届 / 4 个班',
      deadline: '2026-05-30',
      status: '进行中',
      studentTotal: 146,
      submittedCount: 126,
      revisedCount: 81,
      passedCount: 73,
      needsRevisionCount: 31,
    },
    workflow: [
      { label: '创建任务', status: 'done', description: '老师创建班级诊断任务' },
      { label: '导入名单', status: 'done', description: '按班级 / 专业分组' },
      { label: '学生提交', status: 'done', description: '简历、岗位方向、可选 JD' },
      { label: 'AI 诊断', status: 'done', description: '生成个人报告与改写建议' },
      { label: '学生修改', status: 'active', description: '追踪改前 / 改后质量变化' },
      { label: '老师审核', status: 'active', description: '通过 / 需修改 / 重点辅导' },
      { label: '导出报告', status: 'pending', description: '形成就业材料质量报告' },
    ],
    readinessDistribution: [
      { label: '80 分以上', count: 31 },
      { label: '60-79 分', count: 66 },
      { label: '60 分以下', count: 29 },
    ],
    topIssues: [
      { name: '项目经历缺少个人贡献', count: 74 },
      { name: '缺少量化结果', count: 69 },
      { name: 'JD 关键词没有进入项目经历', count: 58 },
      { name: '岗位方向不聚焦', count: 43 },
      { name: '可信度风险表达过满', count: 31 },
    ],
    roleGaps: [
      { name: '后端开发', count: 47 },
      { name: '数据分析', count: 32 },
      { name: '产品经理', count: 25 },
      { name: '运营', count: 22 },
    ],
    funnel: [
      { stage: 'applied', label: '已投递', count: 312 },
      { stage: 'written_test', label: '笔试', count: 84 },
      { stage: 'first_interview', label: '一面', count: 43 },
      { stage: 'second_interview', label: '二面', count: 19 },
      { stage: 'offer', label: 'Offer', count: 7 },
    ],
    highRiskSamples: [
      { id: 'S-021', targetRole: 'Java 后端实习', score: 48, issue: '项目证据不足' },
      { id: 'S-057', targetRole: '数据分析实习', score: 52, issue: '岗位关键词缺失' },
      { id: 'S-088', targetRole: '产品经理实习', score: 55, issue: '经历与目标岗位脱节' },
    ],
    reviewQueue: [
      { id: 'S-021', name: '陈同学', className: '软工 2201', targetRole: 'Java 后端实习', status: 'key_guidance', score: 48, revisionCount: 1, issue: '项目证据不足', lastUpdated: '2 小时前' },
      { id: 'S-057', name: '林同学', className: '计科 2203', targetRole: '数据分析实习', status: 'needs_revision', score: 52, revisionCount: 2, issue: '岗位关键词缺失', lastUpdated: '今天 09:30' },
      { id: 'S-088', name: '周同学', className: '软工 2202', targetRole: '产品经理实习', status: 'needs_revision', score: 55, revisionCount: 0, issue: '经历与目标岗位脱节', lastUpdated: '昨天 18:12' },
      { id: 'S-103', name: '王同学', className: '计科 2201', targetRole: '前端开发实习', status: 'submitted', score: 73, revisionCount: 1, issue: '表达结构可继续压缩', lastUpdated: '昨天 15:40' },
      { id: 'S-116', name: '赵同学', className: '软工 2204', targetRole: '测试开发实习', status: 'passed', score: 84, revisionCount: 2, issue: '已达到投递标准', lastUpdated: '昨天 11:05' },
    ],
  };
}

async function getLiveDashboard() {
  const prisma = await getPrisma();
  const reports = await prisma.diagnoseReport.findMany({
    take: 500,
    orderBy: { createdAt: 'desc' },
    include: { session: true },
  });

  const outcomes = await prisma.applicationOutcome.findMany({
    take: 1000,
    orderBy: { createdAt: 'desc' },
  });

  if (reports.length === 0 && outcomes.length === 0) {
    return getDemoDashboard();
  }

  const scores = reports.map((report) => getScore(report.reportJson));
  const beforeAfterScores = reports.map((report) => getBeforeAfterScore(report.reportJson));
  const beforeScores = beforeAfterScores.map((item) => item.before);
  const afterScores = beforeAfterScores.map((item) => item.after).filter((score) => score !== null);
  const issueTitles = reports.flatMap((report) => getIssueTitles(report.reportJson));
  const roleTargets = reports.map((report) => report.session?.targetRole).filter((role): role is string => Boolean(role));
  const highRiskReports = reports
    .map((report, index) => {
      const score = getScore(report.reportJson);
      const issues = getIssueTitles(report.reportJson);
      return {
        id: `R-${String(index + 1).padStart(3, '0')}`,
        targetRole: report.session?.targetRole || '未填写目标岗位',
        score: score ?? 0,
        issue: issues[0] || report.mainJudgment,
      };
    })
    .filter((report) => report.score > 0 && report.score < 60)
    .slice(0, 5);

  const readinessDistribution = [
    { label: '80 分以上', count: scores.filter((score) => score !== null && score >= 80).length },
    { label: '60-79 分', count: scores.filter((score) => score !== null && score >= 60 && score < 80).length },
    { label: '60 分以下', count: scores.filter((score) => score !== null && score < 60).length },
  ];

  const stageCountMap = new Map<ApplicationOutcomeStageValue, number>();
  for (const outcome of outcomes) {
    const stage = outcome.outcomeStage as ApplicationOutcomeStageValue;
    stageCountMap.set(stage, (stageCountMap.get(stage) ?? 0) + 1);
  }

  const funnel = APPLICATION_OUTCOME_STAGE_ORDER
    .map((stage) => ({
      stage,
      label: APPLICATION_OUTCOME_STAGE_LABELS[stage],
      count: stageCountMap.get(stage) ?? 0,
    }))
    .filter((item) => item.count > 0 || item.stage === 'applied');

  const positiveOutcomes = outcomes.filter((outcome) =>
    POSITIVE_APPLICATION_OUTCOME_STAGES.includes(outcome.outcomeStage as ApplicationOutcomeStageValue)
  ).length;
  const studentCount = Math.max(new Set(reports.map((report) => report.sessionId)).size, reports.length, outcomes.length, 1);
  const submittedCount = reports.length;
  const revisedCount = beforeAfterScores.filter((item) => item.after !== null).length;
  const passedCount = scores.filter((score) => score !== null && score >= 80).length;
  const needsRevisionCount = scores.filter((score) => score !== null && score < 70).length;
  const pendingReviewCount = Math.max(submittedCount - passedCount - needsRevisionCount, 0);
  const reviewQueue = reports.slice(0, 8).map((report, index) => {
    const score = getScore(report.reportJson) ?? 0;
    const issues = getIssueTitles(report.reportJson);
    const status = score >= 80
      ? 'passed'
      : score < 60
        ? 'key_guidance'
        : score < 70
          ? 'needs_revision'
          : 'submitted';

    return {
      id: `R-${String(index + 1).padStart(3, '0')}`,
      name: `学生 ${String(index + 1).padStart(2, '0')}`,
      className: '默认班级',
      targetRole: report.session?.targetRole || '未填写目标岗位',
      status,
      score,
      revisionCount: getBeforeAfterScore(report.reportJson).after !== null ? 1 : 0,
      issue: issues[0] || report.mainJudgment,
      lastUpdated: report.createdAt.toISOString().slice(0, 10),
    };
  });

  return {
    dataMode: 'live',
    generatedAt: new Date().toISOString(),
    metrics: {
      studentCount,
      reportCount: reports.length,
      outcomeCount: outcomes.length,
      highRiskCount: readinessDistribution[2].count,
      averageScoreBefore: average(beforeScores),
      averageScoreAfter: average(afterScores.length > 0 ? afterScores : scores),
      positiveOutcomeRate: outcomes.length > 0 ? Math.round((positiveOutcomes / outcomes.length) * 100) : 0,
    },
    taskMetrics: {
      submissionRate: Math.round((submittedCount / studentCount) * 100),
      revisionRate: submittedCount > 0 ? Math.round((revisedCount / submittedCount) * 100) : 0,
      passRate: submittedCount > 0 ? Math.round((passedCount / submittedCount) * 100) : 0,
      pendingReviewCount,
      needsRevisionCount,
    },
    activeTask: {
      id: 'TASK-LIVE-001',
      title: '就业材料诊断任务',
      owner: '就业指导老师',
      cohort: '当前数据集',
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: '进行中',
      studentTotal: studentCount,
      submittedCount,
      revisedCount,
      passedCount,
      needsRevisionCount,
    },
    workflow: [
      { label: '创建任务', status: 'done', description: '老师创建班级诊断任务' },
      { label: '导入名单', status: 'done', description: '按班级 / 专业分组' },
      { label: '学生提交', status: submittedCount > 0 ? 'done' : 'active', description: '简历、岗位方向、可选 JD' },
      { label: 'AI 诊断', status: reports.length > 0 ? 'done' : 'pending', description: '生成个人报告与改写建议' },
      { label: '学生修改', status: revisedCount > 0 ? 'active' : 'pending', description: '追踪改前 / 改后质量变化' },
      { label: '老师审核', status: reviewQueue.length > 0 ? 'active' : 'pending', description: '通过 / 需修改 / 重点辅导' },
      { label: '导出报告', status: 'pending', description: '形成就业材料质量报告' },
    ],
    readinessDistribution,
    topIssues: getTopItems(issueTitles, 6),
    roleGaps: getTopItems(roleTargets, 5),
    funnel,
    highRiskSamples: highRiskReports,
    reviewQueue,
  };
}

function getTimeoutPromise() {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`school_dashboard_db_timeout_${DASHBOARD_DB_TIMEOUT_MS}ms`)), DASHBOARD_DB_TIMEOUT_MS);
  });
}

export async function GET() {
  if (isDemoSafeModeEnabled()) {
    return NextResponse.json(getDemoDashboard());
  }

  if (Date.now() < demoCircuitUntil) {
    return NextResponse.json(getDemoDashboard());
  }

  try {
    const dashboard = await Promise.race([getLiveDashboard(), getTimeoutPromise()]);
    return NextResponse.json(dashboard);
  } catch (error) {
    demoCircuitUntil = Date.now() + DASHBOARD_DEMO_CIRCUIT_MS;
    logWarn('SchoolDashboardAPI', '读取学校看板失败，返回演示数据', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(getDemoDashboard());
  }
}
