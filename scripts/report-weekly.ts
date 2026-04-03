#!/usr/bin/env tsx
/**
 * 周报导出系统
 * 聚合最近7天数据，生成markdown周报
 * 用法：npm run report:weekly
 */

import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

interface WeeklyStats {
  // 基础统计
  totalCases: number;
  newCases: number;
  closedCases: number;

  // 分布
  sourceChannelDistribution: Record<string, number>;
  serviceTypeDistribution: Record<string, number>;
  roleFamilyDistribution: Record<string, number>;

  // 问题分析
  mainJudgments: Array<{ judgment: string; count: number }>;
  secondaryIssues: Array<{ issue: string; count: number }>;

  // 用户反馈
  adoptedActions: Array<{ action: string; count: number }>;
  rejectedActions: Array<{ action: string; count: number }>;

  // 改写效果
  rewriteExamples: Array<{
    original: string;
    rewritten: string;
    adopted: boolean;
    changeSummary?: string;
  }>;

  // deep vs basic 增量案例
  deepCaseSummaries: Array<{
    caseId: string;
    targetRole: string;
    mainJudgment: string;
    deepValue: string;
  }>;

  // 误判案例
  misjudgmentCases: Array<{
    caseId: string;
    targetRole: string;
    expected: string;
    actual: string;
    lesson: string;
  }>;

  // 候选模式
  candidatePatterns: Array<{
    patternType: string;
    title: string;
    evidenceCount: number;
    strength: number;
  }>;
}

/**
 * 获取最近7天的统计数据
 */
async function getWeeklyStats(): Promise<WeeklyStats> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // 1. 基础统计
  const totalCases = await prisma.serviceCase.count();
  const newCases = await prisma.serviceCase.count({
    where: {
      createdAt: { gte: sevenDaysAgo },
    },
  });
  const closedCases = await prisma.serviceCase.count({
    where: {
      caseStatus: 'closed',
      updatedAt: { gte: sevenDaysAgo },
    },
  });

  // 2. 来源渠道分布
  const leads = await prisma.lead.findMany({
    where: {
      createdAt: { gte: sevenDaysAgo },
    },
    select: { sourceChannel: true },
  });
  const sourceChannelDistribution: Record<string, number> = {};
  leads.forEach(lead => {
    const channel = lead.sourceChannel;
    sourceChannelDistribution[channel] = (sourceChannelDistribution[channel] || 0) + 1;
  });

  // 3. 服务类型分布
  const serviceCases = await prisma.serviceCase.findMany({
    where: {
      createdAt: { gte: sevenDaysAgo },
    },
    select: { serviceType: true },
  });
  const serviceTypeDistribution: Record<string, number> = {};
  serviceCases.forEach(caseItem => {
    const type = caseItem.serviceType;
    serviceTypeDistribution[type] = (serviceTypeDistribution[type] || 0) + 1;
  });

  // 4. 岗位大类分布
  const roleFamilyCases = await prisma.serviceCase.findMany({
    where: {
      createdAt: { gte: sevenDaysAgo },
      roleFamily: { not: null },
    },
    select: { roleFamily: true },
  });
  const roleFamilyDistribution: Record<string, number> = {};
  roleFamilyCases.forEach(caseItem => {
    const family = caseItem.roleFamily;
    if (family) {
      roleFamilyDistribution[family] = (roleFamilyDistribution[family] || 0) + 1;
    }
  });

  // 5. 主要判断 Top 10
  const diagnosisLabels = await prisma.diagnosisLabel.findMany({
    where: {
      createdAt: { gte: sevenDaysAgo },
    },
    select: { mainJudgment: true },
    take: 100,
  });
  const judgmentCounts: Record<string, number> = {};
  diagnosisLabels.forEach(label => {
    judgmentCounts[label.mainJudgment] = (judgmentCounts[label.mainJudgment] || 0) + 1;
  });
  const mainJudgments = Object.entries(judgmentCounts)
    .map(([judgment, count]) => ({ judgment, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 6. 次级问题（简化处理）
  const secondaryIssues: Array<{ issue: string; count: number }> = [];
  // 实际实现需要解析JSON字段，这里简化

  // 7. 用户采纳的建议
  const feedbackEvents = await prisma.feedbackEvent.findMany({
    where: {
      stage: 'after_delivery',
      createdAt: { gte: sevenDaysAgo },
      adoptedActions: { not: null },
    },
    select: { adoptedActions: true },
    take: 50,
  });
  const actionCounts: Record<string, number> = {};
  feedbackEvents.forEach(event => {
    if (event.adoptedActions && Array.isArray(event.adoptedActions)) {
      event.adoptedActions.forEach((action: string) => {
        actionCounts[action] = (actionCounts[action] || 0) + 1;
      });
    }
  });
  const adoptedActions = Object.entries(actionCounts)
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 8. 用户拒绝的建议
  const rejectedFeedback = await prisma.feedbackEvent.findMany({
    where: {
      stage: 'after_delivery',
      createdAt: { gte: sevenDaysAgo },
      rejectedActions: { not: null },
    },
    select: { rejectedActions: true },
    take: 50,
  });
  const rejectedCounts: Record<string, number> = {};
  rejectedFeedback.forEach(event => {
    if (event.rejectedActions && Array.isArray(event.rejectedActions)) {
      event.rejectedActions.forEach((action: string) => {
        rejectedCounts[action] = (rejectedCounts[action] || 0) + 1;
      });
    }
  });
  const rejectedActions = Object.entries(rejectedCounts)
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 9. 改写示例（采纳的）
  const rewritePairs = await prisma.rewritePair.findMany({
    where: {
      createdAt: { gte: sevenDaysAgo },
      adoptedByUser: true,
    },
    select: {
      originalText: true,
      rewrittenText: true,
      changeSummary: true,
      adoptedByUser: true,
    },
    take: 5,
  });
  const rewriteExamples = rewritePairs.map(pair => ({
    original: pair.originalText.length > 100
      ? pair.originalText.substring(0, 100) + '...'
      : pair.originalText,
    rewritten: pair.rewrittenText.length > 100
      ? pair.rewrittenText.substring(0, 100) + '...'
      : pair.rewrittenText,
    adopted: pair.adoptedByUser === true,
    changeSummary: pair.changeSummary,
  }));

  // 10. deep vs basic 增量案例（简化）
  const deepCaseSummaries: Array<{
    caseId: string;
    targetRole: string;
    mainJudgment: string;
    deepValue: string;
  }> = [];

  // 11. 误判案例（简化）
  const misjudgmentCases: Array<{
    caseId: string;
    targetRole: string;
    expected: string;
    actual: string;
    lesson: string;
  }> = [];

  // 12. 候选模式
  const candidatePatterns = await prisma.knowledgePattern.findMany({
    where: {
      status: 'draft',
      evidenceCount: { gt: 0 },
    },
    select: {
      patternType: true,
      title: true,
      evidenceCount: true,
      strengthScore: true,
    },
    take: 10,
    orderBy: { strengthScore: 'desc' },
  });

  return {
    totalCases,
    newCases,
    closedCases,
    sourceChannelDistribution,
    serviceTypeDistribution,
    roleFamilyDistribution,
    mainJudgments,
    secondaryIssues,
    adoptedActions,
    rejectedActions,
    rewriteExamples,
    deepCaseSummaries,
    misjudgmentCases,
    candidatePatterns: candidatePatterns.map(p => ({
      patternType: p.patternType,
      title: p.title,
      evidenceCount: p.evidenceCount,
      strength: p.strengthScore,
    })),
  };
}

/**
 * 生成markdown报告
 */
function generateMarkdownReport(stats: WeeklyStats): string {
  const now = new Date();
  const reportDate = now.toISOString().split('T')[0];

  let markdown = `# 服务运营周报 ${reportDate}\n\n`;
  markdown += `*生成时间: ${now.toLocaleString('zh-CN')}*\n`;
  markdown += `*数据范围: 最近7天*\n\n`;

  // 1. 核心指标
  markdown += `## 📊 核心指标\n\n`;
  markdown += `- **累计案例总数**: ${stats.totalCases}\n`;
  markdown += `- **本周新增案例**: ${stats.newCases}\n`;
  markdown += `- **本周完成案例**: ${stats.closedCases}\n\n`;

  // 2. 分布情况
  markdown += `## 📈 分布情况\n\n`;

  markdown += `### 来源渠道分布\n`;
  if (Object.keys(stats.sourceChannelDistribution).length > 0) {
    Object.entries(stats.sourceChannelDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([channel, count]) => {
        markdown += `- \`${channel}\`: ${count} 例\n`;
      });
  } else {
    markdown += `*暂无数据*\n`;
  }
  markdown += `\n`;

  markdown += `### 服务类型分布\n`;
  if (Object.keys(stats.serviceTypeDistribution).length > 0) {
    Object.entries(stats.serviceTypeDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        markdown += `- \`${type}\`: ${count} 例\n`;
      });
  } else {
    markdown += `*暂无数据*\n`;
  }
  markdown += `\n`;

  markdown += `### 岗位大类分布\n`;
  if (Object.keys(stats.roleFamilyDistribution).length > 0) {
    Object.entries(stats.roleFamilyDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([family, count]) => {
        markdown += `- \`${family}\`: ${count} 例\n`;
      });
  } else {
    markdown += `*暂无数据*\n`;
  }
  markdown += `\n`;

  // 3. 诊断分析
  markdown += `## 🔍 诊断分析\n\n`;

  markdown += `### 最常见问题 Top 10\n`;
  if (stats.mainJudgments.length > 0) {
    stats.mainJudgments.forEach((item, index) => {
      markdown += `${index + 1}. **${item.judgment}** (${item.count} 次)\n`;
    });
  } else {
    markdown += `*暂无数据*\n`;
  }
  markdown += `\n`;

  // 4. 用户反馈
  markdown += `## 💬 用户反馈\n\n`;

  markdown += `### 最常采纳的建议\n`;
  if (stats.adoptedActions.length > 0) {
    stats.adoptedActions.forEach((item, index) => {
      markdown += `${index + 1}. **${item.action}** (${item.count} 次)\n`;
    });
  } else {
    markdown += `*暂无数据*\n`;
  }
  markdown += `\n`;

  markdown += `### 最常拒绝的建议\n`;
  if (stats.rejectedActions.length > 0) {
    stats.rejectedActions.forEach((item, index) => {
      markdown += `${index + 1}. **${item.action}** (${item.count} 次)\n`;
    });
  } else {
    markdown += `*暂无数据*\n`;
  }
  markdown += `\n`;

  // 5. 改写示例
  markdown += `## ✍️ 改写示例\n\n`;
  if (stats.rewriteExamples.length > 0) {
    stats.rewriteExamples.forEach((example, index) => {
      markdown += `### 示例 ${index + 1}\n`;
      markdown += `**原文**: ${example.original}\n\n`;
      markdown += `**改后**: ${example.rewritten}\n\n`;
      if (example.changeSummary) {
        markdown += `**改写思路**: ${example.changeSummary}\n`;
      }
      markdown += `**用户采纳**: ${example.adopted ? '✅ 是' : '❌ 否'}\n\n`;
    });
  } else {
    markdown += `*暂无数据*\n`;
  }
  markdown += `\n`;

  // 6. 候选模式
  markdown += `## 🧠 候选知识模式\n\n`;
  if (stats.candidatePatterns.length > 0) {
    stats.candidatePatterns.forEach((pattern, index) => {
      markdown += `### ${index + 1}. ${pattern.title}\n`;
      markdown += `- **类型**: \`${pattern.patternType}\`\n`;
      markdown += `- **证据数量**: ${pattern.evidenceCount}\n`;
      markdown += `- **强度分数**: ${pattern.strength.toFixed(2)}\n\n`;
    });
  } else {
    markdown += `*暂无候选模式*\n`;
  }
  markdown += `\n`;

  // 7. 建议与后续
  markdown += `## 🚀 建议与后续\n\n`;
  markdown += `1. **重点关注**: ${stats.mainJudgments[0]?.judgment || '无数据'} 问题出现频率最高\n`;
  markdown += `2. **优化方向**: 用户最常拒绝的建议是 "${stats.rejectedActions[0]?.action || '无数据'}"，考虑调整策略\n`;
  markdown += `3. **模式沉淀**: ${stats.candidatePatterns.length} 个候选模式等待验证\n`;
  markdown += `4. **下周目标**: 新增 ${Math.max(5, stats.newCases + 2)} 个案例，重点关注 ${Object.keys(stats.sourceChannelDistribution)[0] || '主要'} 渠道\n`;

  markdown += `\n---\n`;
  markdown += `*报告结束*\n`;
  markdown += `*将此报告发送给 AI 进行产品复盘，或用于团队讨论*\n`;

  return markdown;
}

/**
 * 保存报告文件
 */
function saveReportFile(reportContent: string): string {
  const reportsDir = path.join(process.cwd(), 'ops', 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const fileName = `weekly-${dateStr}.md`;
  const filePath = path.join(reportsDir, fileName);

  fs.writeFileSync(filePath, reportContent, 'utf-8');
  return filePath;
}

/**
 * 主函数
 */
async function main() {
  console.log('📊 开始生成周报...');

  try {
    // 获取统计数据
    console.log('🔄 收集统计数据...');
    const stats = await getWeeklyStats();

    // 生成markdown
    console.log('📝 生成报告内容...');
    const reportContent = generateMarkdownReport(stats);

    // 保存文件
    console.log('💾 保存报告文件...');
    const filePath = saveReportFile(reportContent);

    console.log('\n' + '='.repeat(50));
    console.log('✅ 周报生成完成!');
    console.log(`📁 文件位置: ${filePath}`);
    console.log('='.repeat(50));
    console.log('\n💡 下一步:');
    console.log(`1. 查看报告: cat ${filePath}`);
    console.log('2. 将报告发送给 AI 进行产品复盘');
    console.log('3. 基于报告调整下周工作重点');

  } catch (error) {
    console.error('❌ 生成周报失败:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行主函数
main().catch(error => {
  console.error('脚本执行出错:', error);
  process.exit(1);
});