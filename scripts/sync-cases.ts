#!/usr/bin/env tsx
/**
 * 案例文档同步脚本
 * 扫描 ops/cases/*.md，解析并存入数据库
 * 用法：npm run sync:cases
 */

import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import type {
  LeadSourceChannel,
  ServiceType,
  CandidateStage,
  AtsRiskLevel,
  HrRiskLevel,
  DirectionMismatchLevel,
  ConfidenceLevel,
  SnapshotType,
  FeedbackStage,
} from '@prisma/client';

// 解析结果接口
interface ParsedCase {
  // 基本信息
  sourceChannel?: LeadSourceChannel;
  nickname?: string;
  serviceType?: ServiceType;
  candidateStage?: CandidateStage;
  targetRole?: string;
  roleFamily?: string;
  jdProvided?: boolean;
  consentSaveRaw?: boolean;
  consentUseAnonymized?: boolean;

  // 原始输入摘要
  resumeSummary?: string;
  jdSummary?: string;
  parseQuality?: string;

  // 最终判断
  mainJudgment?: string;
  secondaryIssue1?: string;
  secondaryIssue2?: string;
  atsRiskLevel?: AtsRiskLevel;
  hrRiskLevel?: HrRiskLevel;
  directionMismatchLevel?: DirectionMismatchLevel;
  requiresUserInput?: boolean;
  reviewNote?: string;

  // 改写记录
  rewrites: {
    originalText: string;
    rewrittenText: string;
    changeSummary?: string;
    adoptedByUser?: boolean | null;
  }[];

  // 交付后反馈
  adoptedActions?: string[];
  rejectedActions?: string[];
  appliedAfterRevision?: boolean | null;
  satisfactionScore?: number | null;
  feedbackNote?: string;

  // 7天回访
  day7Applied?: boolean | null;
  day7Interview?: boolean | null;
  day7Note?: string;

  // 30天回访
  day30Interview?: boolean | null;
  day30Offer?: boolean | null;
  day30Note?: string;

  // 沉淀模式
  typicalProblem?: string;
  effectiveRewrite?: string;
  easyMisjudgment?: string;
}

/**
 * 解析markdown文件
 */
function parseMarkdownFile(filePath: string): ParsedCase | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const result: ParsedCase = {
      rewrites: [],
    };

    let currentSection = '';
    let currentRewriteIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 检测章节标题
      if (line.startsWith('## ')) {
        currentSection = line.substring(3).trim();
        continue;
      }

      // 检测改写区块
      if (line.startsWith('### 改写 ')) {
        currentRewriteIndex++;
        result.rewrites[currentRewriteIndex] = {
          originalText: '',
          rewrittenText: '',
        };
        continue;
      }

      // 解析键值对（以 "- " 开头）
      if (line.startsWith('- ')) {
        const keyValue = line.substring(2).trim();
        const colonIndex = keyValue.indexOf('：');
        if (colonIndex === -1) continue;

        const key = keyValue.substring(0, colonIndex).trim();
        const value = keyValue.substring(colonIndex + 1).trim();

        parseKeyValue(currentSection, key, value, result, currentRewriteIndex);
      }

      // 解析改写区块内的内容（可能有多行）
      if (currentRewriteIndex >= 0 && line.startsWith('- ')) {
        // 已经在上面处理了
      }
    }

    return result;
  } catch (error) {
    console.error(`解析文件失败: ${filePath}`, error);
    return null;
  }
}

/**
 * 解析键值对
 */
function parseKeyValue(
  section: string,
  key: string,
  value: string,
  result: ParsedCase,
  rewriteIndex: number
) {
  // 基本信息
  if (section === '1. 基本信息') {
    switch (key) {
      case '来源渠道':
        if (value.startsWith('`') && value.endsWith('`')) {
          const channel = value.substring(1, value.length - 1) as LeadSourceChannel;
          result.sourceChannel = channel;
        }
        break;
      case '用户昵称':
        result.nickname = value;
        break;
      case '服务类型':
        if (value.startsWith('`') && value.endsWith('`')) {
          const serviceType = value.substring(1, value.length - 1) as ServiceType;
          result.serviceType = serviceType;
        }
        break;
      case '候选人阶段':
        if (value.startsWith('`') && value.endsWith('`')) {
          const stage = value.substring(1, value.length - 1) as CandidateStage;
          result.candidateStage = stage;
        }
        break;
      case '目标岗位':
        result.targetRole = value;
        break;
      case '岗位大类':
        result.roleFamily = value;
        break;
      case '是否提供 JD':
        result.jdProvided = value === '`是`';
        break;
      case '是否允许匿名化沉淀':
        result.consentUseAnonymized = value === '`是`';
        break;
    }
  }

  // 原始输入摘要
  else if (section === '2. 原始输入摘要') {
    switch (key) {
      case '简历关键信息':
        result.resumeSummary = value;
        break;
      case 'JD 关键信息':
        result.jdSummary = value;
        break;
      case '解析质量':
        result.parseQuality = value;
        break;
    }
  }

  // 最终判断
  else if (section === '3. 我的最终判断') {
    switch (key) {
      case '最致命问题':
        result.mainJudgment = value;
        break;
      case '次级问题 1':
        result.secondaryIssue1 = value;
        break;
      case '次级问题 2':
        result.secondaryIssue2 = value;
        break;
      case 'ATS 风险':
        if (value.startsWith('`') && value.endsWith('`')) {
          const risk = value.substring(1, value.length - 1) as AtsRiskLevel;
          result.atsRiskLevel = risk;
        }
        break;
      case 'HR 风险':
        if (value.startsWith('`') && value.endsWith('`')) {
          const risk = value.substring(1, value.length - 1) as HrRiskLevel;
          result.hrRiskLevel = risk;
        }
        break;
      case '是否方向错配':
        if (value.startsWith('`') && value.endsWith('`')) {
          const mismatch = value.substring(1, value.length - 1) as DirectionMismatchLevel;
          result.directionMismatchLevel = mismatch;
        }
        break;
      case '哪些地方必须用户补充':
        result.requiresUserInput = value.length > 0;
        break;
      case '备注':
        result.reviewNote = value;
        break;
    }
  }

  // 改写记录（在改写区块内）
  else if (section.startsWith('4. 改写记录')) {
    if (rewriteIndex >= 0) {
      const rewrite = result.rewrites[rewriteIndex];
      switch (key) {
        case '原文':
          rewrite.originalText = value;
          break;
        case '改后':
          rewrite.rewrittenText = value;
          break;
        case '为什么这样改':
          rewrite.changeSummary = value;
          break;
        case '用户是否采纳':
          if (value === '`是`') rewrite.adoptedByUser = true;
          else if (value === '`否`') rewrite.adoptedByUser = false;
          else rewrite.adoptedByUser = null;
          break;
      }
    }
  }

  // 交付后反馈
  else if (section === '5. 交付后反馈') {
    switch (key) {
      case '用户采纳了哪些建议':
        result.adoptedActions = value.split(/[，、;；]/).map(s => s.trim()).filter(s => s);
        break;
      case '用户拒绝了哪些建议':
        result.rejectedActions = value.split(/[，、;；]/).map(s => s.trim()).filter(s => s);
        break;
      case '是否准备投递':
        result.appliedAfterRevision = value === '`是`' ? true : value === '`否`' ? false : null;
        break;
      case '满意度':
        const match = value.match(/\d+/);
        if (match) result.satisfactionScore = parseInt(match[0], 10);
        break;
      case '备注':
        result.feedbackNote = value;
        break;
    }
  }

  // 7天回访
  else if (section === '7 天') {
    switch (key) {
      case '是否投递':
        result.day7Applied = value === '`是`' ? true : value === '`否`' ? false : null;
        break;
      case '是否有面试':
        result.day7Interview = value === '`是`' ? true : value === '`否`' ? false : null;
        break;
      case '备注':
        result.day7Note = value;
        break;
    }
  }

  // 30天回访
  else if (section === '30 天') {
    switch (key) {
      case '是否有面试':
        result.day30Interview = value === '`是`' ? true : value === '`否`' ? false : null;
        break;
      case '是否有 offer':
        result.day30Offer = value === '`是`' ? true : value === '`否`' ? false : null;
        break;
      case '备注':
        result.day30Note = value;
        break;
    }
  }

  // 沉淀模式
  else if (section === '7. 这单最值得沉淀的模式') {
    switch (key) {
      case '哪种问题最典型':
        result.typicalProblem = value;
        break;
      case '哪种改写最有效':
        result.effectiveRewrite = value;
        break;
      case '哪个判断最容易误判':
        result.easyMisjudgment = value;
        break;
    }
  }
}

/**
 * 将解析结果保存到数据库
 */
async function saveToDatabase(parsedCase: ParsedCase, fileName: string): Promise<boolean> {
  try {
    // 1. 查找或创建Lead
    let lead = null;
    if (parsedCase.nickname) {
      lead = await prisma.lead.findFirst({
        where: {
          OR: [
            { nickname: parsedCase.nickname },
            { platformHandle: parsedCase.nickname },
          ],
        },
      });
    }

    if (!lead && parsedCase.sourceChannel) {
      lead = await prisma.lead.create({
        data: {
          sourceChannel: parsedCase.sourceChannel,
          nickname: parsedCase.nickname,
          status: 'closed', // 假设已关闭
          firstContactAt: new Date(),
        },
      });
    }

    // 2. 创建ServiceCase
    const serviceCase = await prisma.serviceCase.create({
      data: {
        leadId: lead?.id,
        serviceType: parsedCase.serviceType || 'deep_fix',
        caseStatus: 'closed',
        targetRole: parsedCase.targetRole,
        roleFamily: parsedCase.roleFamily,
        candidateStage: parsedCase.candidateStage || 'unknown',
        jdProvided: parsedCase.jdProvided || false,
        consentUseAnonymized: parsedCase.consentUseAnonymized || false,
      },
    });

    // 3. 创建快照
    if (parsedCase.resumeSummary) {
      await prisma.caseSnapshot.create({
        data: {
          serviceCaseId: serviceCase.id,
          snapshotType: 'cleaned_resume',
          content: parsedCase.resumeSummary,
          isAnonymized: parsedCase.consentUseAnonymized || false,
        },
      });
    }

    if (parsedCase.jdSummary) {
      await prisma.caseSnapshot.create({
        data: {
          serviceCaseId: serviceCase.id,
          snapshotType: 'jd',
          content: parsedCase.jdSummary,
          isAnonymized: parsedCase.consentUseAnonymized || false,
        },
      });
    }

    // 4. 创建诊断标签
    if (parsedCase.mainJudgment) {
      const secondaryIssues = [];
      if (parsedCase.secondaryIssue1) secondaryIssues.push(parsedCase.secondaryIssue1);
      if (parsedCase.secondaryIssue2) secondaryIssues.push(parsedCase.secondaryIssue2);

      await prisma.diagnosisLabel.create({
        data: {
          serviceCaseId: serviceCase.id,
          mainJudgment: parsedCase.mainJudgment,
          secondaryIssues: secondaryIssues.length > 0 ? secondaryIssues : undefined,
          atsRiskLevel: parsedCase.atsRiskLevel || 'unknown',
          hrRiskLevel: parsedCase.hrRiskLevel || 'unknown',
          directionMismatchLevel: parsedCase.directionMismatchLevel || 'unknown',
          confidence: 'high',
          requiresUserInput: parsedCase.requiresUserInput || false,
          humanReviewed: true,
          reviewNote: parsedCase.reviewNote,
        },
      });
    }

    // 5. 创建改写对
    for (const rewrite of parsedCase.rewrites) {
      if (rewrite.originalText && rewrite.rewrittenText) {
        await prisma.rewritePair.create({
          data: {
            serviceCaseId: serviceCase.id,
            originalText: rewrite.originalText,
            rewrittenText: rewrite.rewrittenText,
            changeSummary: rewrite.changeSummary,
            adoptedByUser: rewrite.adoptedByUser,
          },
        });
      }
    }

    // 6. 创建交付后反馈
    if (parsedCase.adoptedActions || parsedCase.rejectedActions || parsedCase.satisfactionScore) {
      await prisma.feedbackEvent.create({
        data: {
          serviceCaseId: serviceCase.id,
          stage: 'after_delivery',
          adoptedActions: parsedCase.adoptedActions,
          rejectedActions: parsedCase.rejectedActions,
          appliedAfterRevision: parsedCase.appliedAfterRevision,
          satisfactionScore: parsedCase.satisfactionScore,
          feedbackNote: parsedCase.feedbackNote,
        },
      });
    }

    // 7. 创建7天回访
    if (parsedCase.day7Applied !== undefined || parsedCase.day7Interview !== undefined) {
      await prisma.feedbackEvent.create({
        data: {
          serviceCaseId: serviceCase.id,
          stage: 'day7',
          interviewCount: parsedCase.day7Interview ? 1 : parsedCase.day7Interview === false ? 0 : undefined,
          feedbackNote: parsedCase.day7Note,
        },
      });
    }

    // 8. 创建30天回访
    if (parsedCase.day30Interview !== undefined || parsedCase.day30Offer !== undefined) {
      await prisma.feedbackEvent.create({
        data: {
          serviceCaseId: serviceCase.id,
          stage: 'day30',
          interviewCount: parsedCase.day30Interview ? 1 : parsedCase.day30Interview === false ? 0 : undefined,
          offerCount: parsedCase.day30Offer ? 1 : parsedCase.day30Offer === false ? 0 : undefined,
          feedbackNote: parsedCase.day30Note,
        },
      });
    }

    console.log(`✅ 案例已保存: ${fileName} (ID: ${serviceCase.id})`);
    return true;
  } catch (error) {
    console.error(`❌ 保存案例失败: ${fileName}`, error);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔄 开始扫描案例文档...');

  const casesDir = path.join(process.cwd(), 'ops', 'cases');

  // 确保目录存在
  if (!fs.existsSync(casesDir)) {
    console.log(`📁 创建目录: ${casesDir}`);
    fs.mkdirSync(casesDir, { recursive: true });
  }

  // 查找所有markdown文件
  const files = fs.readdirSync(casesDir)
    .filter(file => file.endsWith('.md'))
    .map(file => path.join(casesDir, file));

  console.log(`📄 找到 ${files.length} 个案例文件`);

  if (files.length === 0) {
    console.log('ℹ️  没有找到案例文件。请将案例markdown文件放入 ops/cases/ 目录');
    console.log('ℹ️  可以使用模板: ops/templates/case-template.md');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  // 处理每个文件
  for (const filePath of files) {
    const fileName = path.basename(filePath);
    console.log(`\n--- 处理: ${fileName} ---`);

    const parsedCase = parseMarkdownFile(filePath);
    if (!parsedCase) {
      console.log(`❌ 解析失败: ${fileName}`);
      failCount++;
      continue;
    }

    // 检查必需字段
    if (!parsedCase.sourceChannel || !parsedCase.serviceType) {
      console.log(`⚠️  缺少必需字段，跳过: ${fileName}`);
      console.log(`   需要: 来源渠道, 服务类型`);
      failCount++;
      continue;
    }

    const success = await saveToDatabase(parsedCase, fileName);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 同步完成');
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${failCount}`);
  console.log('='.repeat(50));

  if (failCount > 0) {
    console.log('\n💡 提示:');
    console.log('1. 检查案例文件格式是否符合模板');
    console.log('2. 枚举值必须使用反引号，如 `xiaohongshu`');
    console.log('3. 必需字段: 来源渠道, 服务类型');
    console.log('4. 查看上方错误信息修复问题');
  }
}

// 运行主函数
main()
  .catch(error => {
    console.error('同步脚本出错:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });