#!/usr/bin/env tsx
// 演示脚本：展示一条完整服务案例如何写入学习型数据库
// 运行：npx tsx scripts/demo-case-ingest.ts

import {
  createLead,
  createServiceCase,
  saveCaseSnapshot,
  saveDiagnosisLabel,
  saveRewritePairs,
  saveFeedbackEvent,
  createKnowledgePattern,
  attachPatternEvidence
} from '../lib/learning-db/repository';

async function runDemo() {
  console.log('🎯 开始演示学习型数据库数据写入流程...\n');

  // 1. 创建线索（Lead）
  console.log('1. 创建线索（Lead）...');
  const lead = await createLead({
    sourceChannel: 'xiaohongshu',
    platformHandle: '@求职小助手',
    nickname: '小明',
    contactNote: '通过小红书广告联系，求职意向明确',
    status: 'contacted',
  });
  console.log(`   创建成功: ID=${lead.id}, 渠道=${lead.sourceChannel}\n`);

  // 2. 创建服务案例（ServiceCase）
  console.log('2. 创建服务案例（ServiceCase）...');
  const serviceCase = await createServiceCase({
    leadId: lead.id,
    serviceType: 'deep_fix',
    targetRole: '前端开发工程师',
    roleFamily: 'engineering',
    candidateStage: 'early_career',
    jdProvided: true,
    consentSaveRaw: true,
    consentUseAnonymized: true,
  });
  console.log(`   创建成功: ID=${serviceCase.id}, 服务类型=${serviceCase.serviceType}\n`);

  // 3. 保存案例快照（CaseSnapshot） - 原始简历
  console.log('3. 保存案例快照 - 原始简历...');
  const rawResume = `
张三
前端开发工程师 | 3年经验
技能：HTML, CSS, JavaScript, React
项目：电商后台管理系统（技术栈：Vue2 + Element UI）
自我评价：热爱学习，积极向上
`;
  await saveCaseSnapshot({
    serviceCaseId: serviceCase.id,
    snapshotType: 'raw_resume',
    content: rawResume,
    isAnonymized: false,
  });
  console.log('   原始简历快照保存成功\n');

  // 4. 保存诊断标签（DiagnosisLabel） - 人工判断结果
  console.log('4. 保存诊断标签（人工判断）...');
  await saveDiagnosisLabel({
    serviceCaseId: serviceCase.id,
    mainJudgment: '技术栈与目标岗位不匹配，项目描述过于笼统',
    secondaryIssues: ['技术栈老旧（Vue2）', '缺乏量化成果', '关键词缺失'],
    issueDimensions: {
      technical: 8,
      communication: 6,
      achievement: 4,
    },
    atsRiskLevel: 'high',
    hrRiskLevel: 'medium',
    directionMismatchLevel: 'medium',
    confidence: 'high',
    requiresUserInput: true,
    humanReviewed: true,
    reviewNote: '建议升级技术栈为React，补充量化指标',
  });
  console.log('   诊断标签保存成功\n');

  // 5. 保存改写对（RewritePair） - 人工改写结果
  console.log('5. 保存改写对（人工改写）...');
  await saveRewritePairs([
    {
      serviceCaseId: serviceCase.id,
      issueType: 'technology_stack',
      rewriteType: 'upgrade_and_quantify',
      sourceLocation: { section: 'skills', line: 2 },
      originalText: '技能：HTML, CSS, JavaScript, React',
      rewrittenText: '技术栈：HTML5, CSS3, ES6+, React 18, TypeScript, Next.js',
      changeSummary: '升级技术栈，增加现代框架和类型安全',
      needsUserInput: false,
      adoptedByUser: true,
    },
    {
      serviceCaseId: serviceCase.id,
      issueType: 'achievement_quantification',
      rewriteType: 'add_metrics',
      sourceLocation: { section: 'projects', line: 3 },
      originalText: '项目：电商后台管理系统（技术栈：Vue2 + Element UI）',
      rewrittenText: '电商后台管理系统：采用 Vue2 + Element UI，开发商品管理、订单处理等6个模块，系统上线后运营效率提升30%',
      changeSummary: '补充项目规模与业务价值',
      needsUserInput: false,
      adoptedByUser: true,
    },
  ]);
  console.log('   改写对保存成功\n');

  // 6. 保存反馈事件（FeedbackEvent） - 交付后反馈
  console.log('6. 保存反馈事件（交付后）...');
  await saveFeedbackEvent({
    serviceCaseId: serviceCase.id,
    stage: 'after_delivery',
    adoptedActions: ['技术栈升级', '项目量化'],
    rejectedActions: ['职业目标调整'],
    appliedAfterRevision: true,
    satisfactionScore: 9,
    feedbackNote: '改写建议非常专业，已按建议更新简历',
  });
  console.log('   交付后反馈保存成功\n');

  // 7. 创建知识模式（KnowledgePattern） - 从多个案例中沉淀
  console.log('7. 创建知识模式（从案例沉淀）...');
  const pattern = await createKnowledgePattern({
    roleFamily: 'engineering',
    issueType: 'technology_stack',
    patternType: 'rewrite',
    title: '前端技术栈升级模式',
    patternText: '将老旧技术栈（Vue2/jQuery）升级为现代技术栈（React 18+/TypeScript/Next.js），并补充相关生态工具',
    strengthScore: 8.5,
    status: 'validated',
  });
  console.log(`   知识模式创建成功: ID=${pattern.id}, 标题="${pattern.title}"\n`);

  // 8. 关联模式证据（PatternEvidence） - 将当前案例作为证据
  console.log('8. 关联模式证据...');
  await attachPatternEvidence({
    knowledgePatternId: pattern.id,
    serviceCaseId: serviceCase.id,
    evidenceSnippet: '技能：HTML, CSS, JavaScript, React → 技术栈：HTML5, CSS3, ES6+, React 18, TypeScript, Next.js',
    outcomeTag: 'positive_adoption',
  });
  console.log('   模式证据关联成功\n');

  // 9. 模拟7天回访反馈
  console.log('9. 模拟7天回访反馈...');
  await saveFeedbackEvent({
    serviceCaseId: serviceCase.id,
    stage: 'day7',
    interviewCount: 3,
    offerCount: 1,
    satisfactionScore: 10,
    feedbackNote: '简历更新后收到3个面试邀请，已拿到1个Offer',
  });
  console.log('   7天回访反馈保存成功\n');

  console.log('✅ 演示完成！一条完整的服务案例已写入学习型数据库。');
  console.log('\n📊 写入的数据包括：');
  console.log('   - 1 条线索（Lead）');
  console.log('   - 1 个服务案例（ServiceCase）');
  console.log('   - 1 个案例快照（CaseSnapshot）');
  console.log('   - 1 个诊断标签（DiagnosisLabel）');
  console.log('   - 2 个改写对（RewritePair）');
  console.log('   - 2 个反馈事件（FeedbackEvent）');
  console.log('   - 1 个知识模式（KnowledgePattern）');
  console.log('   - 1 个模式证据（PatternEvidence）');
  console.log('\n🔗 这些数据形成了完整的产品质量飞轮：');
  console.log('   原始服务 → 人工标注 → 模式沉淀 → 反哺产品智能');
}

// 执行演示
runDemo().catch(error => {
  console.error('❌ 演示失败:', error);
  process.exit(1);
});