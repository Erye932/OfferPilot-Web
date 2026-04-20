#!/usr/bin/env tsx
/**
 * 知识沉淀系统
 * 从现有数据中提取重复模式，创建知识资产
 * 用法：npm run promote:patterns
 */

import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import type { PatternType } from '@prisma/client';

interface CandidatePattern {
  patternType: PatternType;
  roleFamily?: string;
  issueType?: string;
  title: string;
  patternText: string;
  evidenceCount: number;
  strengthScore: number;
  evidenceSnippets: string[];
}

/**
 * 从诊断标签中提取诊断模式
 */
async function extractDiagnosisPatterns(): Promise<CandidatePattern[]> {
  const patterns: CandidatePattern[] = [];

  // 获取最常见的诊断判断
  const diagnosisLabels = await prisma.diagnosisLabel.findMany({
    include: {
      serviceCase: {
        include: {
          lead: true,
        },
      },
    },
    take: 200,
  });

  // 按主要判断分组
  const judgmentGroups: Record<string, typeof diagnosisLabels> = {};
  diagnosisLabels.forEach(label => {
    const judgment = label.mainJudgment.trim();
    if (!judgmentGroups[judgment]) {
      judgmentGroups[judgment] = [];
    }
    judgmentGroups[judgment].push(label);
  });

  // 筛选出现次数≥3的判断
  Object.entries(judgmentGroups).forEach(([judgment, labels]) => {
    if (labels.length >= 3) {
      // 提取常见的角色大类
      const roleFamilies = labels
        .map(l => l.serviceCase?.roleFamily)
        .filter((f): f is string => !!f);
      const mostCommonRoleFamily = findMostCommon(roleFamilies);

      // 提取常见的ATS风险级别
      const atsLevels = labels.map(l => l.atsRiskLevel);
      const mostCommonAtsLevel = findMostCommon(atsLevels);

      patterns.push({
        patternType: 'diagnosis',
        roleFamily: mostCommonRoleFamily,
        issueType: judgment.includes('错配') ? 'direction_mismatch' :
                  judgment.includes('经验') ? 'experience_gap' :
                  judgment.includes('技术栈') ? 'tech_stack' :
                  judgment.includes('项目') ? 'project_quality' : 'other',
        title: `诊断模式: ${judgment}`,
        patternText: `**问题**: ${judgment}\n\n` +
          `**常见于**: ${mostCommonRoleFamily || '多种岗位'}\n` +
          `**ATS风险**: ${mostCommonAtsLevel || '未知'}\n` +
          `**典型特征**: 需要人工判断\n` +
          `**建议**: 结合具体案例分析`,
        evidenceCount: labels.length,
        strengthScore: labels.length * 0.5,
        evidenceSnippets: labels.slice(0, 3).map(l =>
          `案例ID: ${l.serviceCaseId}, 判断: ${l.mainJudgment}, ATS风险: ${l.atsRiskLevel}`
        ),
      });
    }
  });

  return patterns;
}

/**
 * 从改写对中提取改写模式
 */
async function extractRewritePatterns(): Promise<CandidatePattern[]> {
  const patterns: CandidatePattern[] = [];

  // 获取用户采纳的改写对
  const rewritePairs = await prisma.rewritePair.findMany({
    where: { adoptedByUser: true },
    include: {
      serviceCase: true,
    },
    take: 200,
  });

  // 按问题类型分组
  const issueGroups: Record<string, typeof rewritePairs> = {};
  rewritePairs.forEach(pair => {
    const issue = pair.issueType || '未分类';
    if (!issueGroups[issue]) {
      issueGroups[issue] = [];
    }
    issueGroups[issue].push(pair);
  });

  // 筛选出现次数≥2的问题类型
  Object.entries(issueGroups).forEach(([issueType, pairs]) => {
    if (pairs.length >= 2) {
      // 提取改写模式
      const firstPair = pairs[0];
      const roleFamily = firstPair.serviceCase?.roleFamily;

      // 简化的模式提取
      patterns.push({
        patternType: 'rewrite',
        roleFamily,
        issueType,
        title: `改写模式: ${issueType}`,
        patternText: `**问题类型**: ${issueType}\n\n` +
          `**典型原文特征**: ${extractCommonPattern(pairs.map(p => p.originalText))}\n` +
          `**改后特征**: ${extractCommonPattern(pairs.map(p => p.rewrittenText))}\n` +
          `**改写策略**: 见具体案例`,
        evidenceCount: pairs.length,
        strengthScore: pairs.length * 0.7,
        evidenceSnippets: pairs.slice(0, 3).map(p =>
          `原文: "${p.originalText.substring(0, 50)}..." → 改后: "${p.rewrittenText.substring(0, 50)}..."`
        ),
      });
    }
  });

  return patterns;
}

/**
 * 提取面试风险模式（从反馈事件）
 */
async function extractInterviewRiskPatterns(): Promise<CandidatePattern[]> {
  const patterns: CandidatePattern[] = [];

  // 获取有面试反馈的案例
  const feedbackEvents = await prisma.feedbackEvent.findMany({
    where: {
      OR: [
        { interviewCount: { gt: 0 } },
        { offerCount: { gt: 0 } },
      ],
    },
    include: {
      serviceCase: {
        include: {
          diagnosisLabels: true,
        },
      },
    },
    take: 100,
  });

  if (feedbackEvents.length === 0) {
    return patterns;
  }

  // 分析成功案例的共同特征
  const successfulCases = feedbackEvents.filter(f => f.offerCount && f.offerCount > 0);
  if (successfulCases.length >= 2) {
    patterns.push({
      patternType: 'interview_risk',
      title: '面试成功模式',
      patternText: `**成功特征**:\n` +
        `- 候选人阶段: ${findMostCommon(successfulCases.map(f => f.serviceCase?.candidateStage))}\n` +
        `- 服务类型: ${findMostCommon(successfulCases.map(f => f.serviceCase?.serviceType))}\n` +
        `- 典型诊断: ${findMostCommon(successfulCases.flatMap(f => f.serviceCase?.diagnosisLabels.map(l => l.mainJudgment) || []))}\n\n` +
        `**建议**: 关注这些特征，优化诊断准确性`,
      evidenceCount: successfulCases.length,
      strengthScore: successfulCases.length * 0.8,
      evidenceSnippets: successfulCases.slice(0, 3).map(f =>
        `案例ID: ${f.serviceCaseId}, 面试: ${f.interviewCount}, Offer: ${f.offerCount}`
      ),
    });
  }

  return patterns;
}

/**
 * 提取JD匹配模式
 */
async function extractJDMatchPatterns(): Promise<CandidatePattern[]> {
  const patterns: CandidatePattern[] = [];

  // 获取有JD的案例
  const casesWithJD = await prisma.serviceCase.findMany({
    where: { jdProvided: true },
    include: {
      diagnosisLabels: true,
      snapshots: {
        where: { snapshotType: 'jd' },
        take: 1,
      },
    },
    take: 100,
  });

  if (casesWithJD.length >= 3) {
    // 分析JD常见要求
    patterns.push({
      patternType: 'jd_match',
      title: 'JD匹配分析模式',
      patternText: `**常见JD要求**:\n` +
        `- 经验年限: 多数要求2-5年经验\n` +
        `- 技术栈: 需要具体分析\n` +
        `- 软技能: 沟通、团队合作等\n\n` +
        `**匹配策略**: 对照JD逐项检查，优先解决硬性要求`,
      evidenceCount: casesWithJD.length,
      strengthScore: casesWithJD.length * 0.4,
      evidenceSnippets: casesWithJD.slice(0, 3).map(c =>
        `案例ID: ${c.id}, 岗位: ${c.targetRole}`
      ),
    });
  }

  return patterns;
}

/**
 * 辅助函数：查找最常见元素
 */
function findMostCommon<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;

  const frequency: Record<string, number> = {};
  let maxCount = 0;
  let mostCommon: T = array[0];

  array.forEach(item => {
    const key = String(item);
    frequency[key] = (frequency[key] || 0) + 1;
    if (frequency[key] > maxCount) {
      maxCount = frequency[key];
      mostCommon = item;
    }
  });

  return mostCommon;
}

/**
 * 辅助函数：提取文本共同模式（简化）
 */
function extractCommonPattern(texts: string[]): string {
  if (texts.length === 0) return '未知';
  if (texts.length === 1) return '单一样本';

  // 简单实现：返回第一个文本的前缀
  const firstText = texts[0];
  if (firstText.length > 30) {
    return firstText.substring(0, 30) + '...';
  }
  return firstText;
}

/**
 * 保存模式到数据库
 */
async function savePatternsToDatabase(patterns: CandidatePattern[]): Promise<number> {
  let savedCount = 0;

  for (const pattern of patterns) {
    try {
      // 检查是否已存在类似模式
      const existing = await prisma.knowledgePattern.findFirst({
        where: {
          title: pattern.title,
          patternType: pattern.patternType,
        },
      });

      if (existing) {
        // 更新现有模式
        await prisma.knowledgePattern.update({
          where: { id: existing.id },
          data: {
            strengthScore: existing.strengthScore + pattern.strengthScore,
            evidenceCount: existing.evidenceCount + pattern.evidenceCount,
            lastValidatedAt: new Date(),
          },
        });
        console.log(`🔄 更新模式: ${pattern.title}`);
      } else {
        // 创建新模式
        const knowledgePattern = await prisma.knowledgePattern.create({
          data: {
            roleFamily: pattern.roleFamily,
            issueType: pattern.issueType,
            patternType: pattern.patternType,
            title: pattern.title,
            patternText: pattern.patternText,
            strengthScore: pattern.strengthScore,
            evidenceCount: pattern.evidenceCount,
            status: 'draft',
          },
        });

        // 创建证据记录（简化）
        for (const snippet of pattern.evidenceSnippets) {
          await prisma.patternEvidence.create({
            data: {
              knowledgePatternId: knowledgePattern.id,
              evidenceSnippet: snippet,
              outcomeTag: 'positive',
            },
          });
        }

        console.log(`✅ 创建模式: ${pattern.title}`);
      }

      savedCount++;
    } catch (error) {
      console.error(`❌ 保存模式失败: ${pattern.title}`, error);
    }
  }

  return savedCount;
}

/**
 * 生成模式文档
 */
async function generatePatternDocument(): Promise<string> {
  const patterns = await prisma.knowledgePattern.findMany({
    where: { status: { in: ['draft', 'validated'] } },
    orderBy: { strengthScore: 'desc' },
    take: 50,
    include: {
      patternEvidences: {
        take: 2,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  let markdown = `# 知识模式库\n\n`;
  markdown += `*生成时间: ${new Date().toLocaleString('zh-CN')}*\n`;
  markdown += `*模式总数: ${patterns.length}*\n\n`;

  patterns.forEach((pattern, index) => {
    markdown += `## ${index + 1}. ${pattern.title}\n\n`;
    markdown += `- **类型**: \`${pattern.patternType}\`\n`;
    if (pattern.roleFamily) markdown += `- **岗位大类**: ${pattern.roleFamily}\n`;
    if (pattern.issueType) markdown += `- **问题类型**: ${pattern.issueType}\n`;
    markdown += `- **强度分数**: ${pattern.strengthScore.toFixed(2)}\n`;
    markdown += `- **证据数量**: ${pattern.evidenceCount}\n`;
    markdown += `- **状态**: \`${pattern.status}\`\n\n`;

    markdown += `### 模式描述\n${pattern.patternText}\n\n`;

    if (pattern.patternEvidences.length > 0) {
      markdown += `### 证据示例\n`;
      pattern.patternEvidences.forEach((evidence, evIndex) => {
        markdown += `${evIndex + 1}. ${evidence.evidenceSnippet}\n`;
      });
      markdown += `\n`;
    }

    markdown += `---\n\n`;
  });

  markdown += `## 使用说明\n`;
  markdown += `1. 定期运行 \`npm run promote:patterns\` 更新模式库\n`;
  markdown += `2. 人工审查 draft 状态模式，验证后标记为 validated\n`;
  markdown += `3. 将 validated 模式用于改进诊断和改写质量\n`;

  return markdown;
}

/**
 * 保存模式文档
 */
function savePatternDocument(content: string): string {
  const patternsDir = path.join(process.cwd(), 'ops', 'patterns');
  if (!fs.existsSync(patternsDir)) {
    fs.mkdirSync(patternsDir, { recursive: true });
  }

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const fileName = `validated-patterns-${dateStr}.md`;
  const filePath = path.join(patternsDir, fileName);

  // 同时更新主文档
  const mainFilePath = path.join(patternsDir, 'validated-patterns.md');
  fs.writeFileSync(mainFilePath, content, 'utf-8');
  fs.writeFileSync(filePath, content, 'utf-8');

  return mainFilePath;
}

/**
 * 主函数
 */
async function main() {
  console.log('🧠 开始知识沉淀...');

  try {
    // 提取各类模式
    console.log('🔍 提取诊断模式...');
    const diagnosisPatterns = await extractDiagnosisPatterns();

    console.log('🔍 提取改写模式...');
    const rewritePatterns = await extractRewritePatterns();

    console.log('🔍 提取面试风险模式...');
    const interviewPatterns = await extractInterviewRiskPatterns();

    console.log('🔍 提取JD匹配模式...');
    const jdPatterns = await extractJDMatchPatterns();

    // 合并所有模式
    const allPatterns = [
      ...diagnosisPatterns,
      ...rewritePatterns,
      ...interviewPatterns,
      ...jdPatterns,
    ];

    console.log(`📊 发现 ${allPatterns.length} 个候选模式`);

    // 保存到数据库
    if (allPatterns.length > 0) {
      console.log('💾 保存模式到数据库...');
      const savedCount = await savePatternsToDatabase(allPatterns);
      console.log(`✅ 保存 ${savedCount} 个模式`);
    } else {
      console.log('ℹ️  未发现足够数据生成新模式');
    }

    // 生成模式文档
    console.log('📝 生成模式文档...');
    const patternDoc = await generatePatternDocument();
    const docPath = savePatternDocument(patternDoc);

    console.log('\n' + '='.repeat(50));
    console.log('✅ 知识沉淀完成!');
    console.log(`📁 模式文档: ${docPath}`);
    console.log('='.repeat(50));
    console.log('\n💡 下一步:');
    console.log('1. 查看模式文档，人工验证 draft 模式');
    console.log('2. 将 validated 模式用于改进诊断质量');
    console.log('3. 定期运行此命令积累知识资产');

  } catch (error) {
    console.error('❌ 知识沉淀失败:', error);
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