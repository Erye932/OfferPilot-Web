/**
 * 测试自定义API并生成知识库数据
 * 用户提供的API: https://rsxermu666.cn
 */

import fs from 'fs';

const API_URL = "https://rsxermu666.cn/v1/messages";
const API_KEY = "sk-xh0IhqEsXlegV5I3CA9doHEORTDYMdZWWvXXN17e85TiPRQL";
const MODEL = "claude-sonnet-4-20250514"; // 或根据API实际情况调整

async function callAPI(prompt: string, maxTokens = 4096): Promise<string> {
  console.log(`  📡 调用API...`);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API错误: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`  ✅ API调用成功`);
    return data.content?.[0]?.text || data.choices?.[0]?.message?.content || '';
  } catch (err) {
    console.error(`  ❌ API调用失败: ${err}`);
    throw err;
  }
}

// 岗位类型
const ROLES = [
  // 运营类
  '内容运营', '用户运营', '活动运营', '产品运营', '新媒体运营',
  '电商运营', '社群运营', '数据运营', '商家运营', '品类运营',
  // 产品类
  '产品经理', '产品助理', '高级产品经理', 'C端产品经理', 'B端产品经理',
  // 技术类
  '前端开发', '后端开发', '全栈开发', '测试工程师', '运维工程师',
  'Android开发', 'iOS开发', 'Java开发', 'Python开发', 'Go开发',
  // 数据/算法
  '数据分析师', '算法工程师', '数据工程师', 'BI工程师', '策略产品经理',
  // 设计类
  'UI设计师', 'UX设计师', '交互设计师', '视觉设计师', '产品设计师',
  // 市场/销售
  '市场推广', '渠道运营', '商务合作', '销售代表', '大客户销售',
  // 职能类
  'HR', 'HRBP', '行政', '财务', '法务', '采购',
];

// 问题类型
const ISSUE_TYPES = [
  { type: 'lack_of_result_evidence', name: '缺少结果证据', definition: '经历只写了做过什么，没有体现结果、影响、产出或复盘价值。' },
  { type: 'keyword_alignment_weak', name: '岗位关键词连接不够直接', definition: '简历内容与目标岗位并非无关，但没有显性对齐岗位要求中的核心能力点或关键词。' },
  { type: 'weak_role_boundary', name: '项目角色边界不清', definition: '简历没有明确区分自己主导了什么、参与了什么、配合了什么，导致个人贡献感被削弱。' },
  { type: 'weak_expression_pattern', name: '经历表述偏泛', definition: '经历大量使用泛化、弱化的动作表述，无法让筛选者快速判断具体能力与贡献。' },
  { type: 'lack_of_quantification', name: '数字化表达偏少', definition: '简历中缺少人数、规模、次数、提升幅度、结果指标等量化信息，导致成果难以被快速建立可信度。' },
  { type: 'relevant_experience_not_emphasized', name: '最相关经历没有放大', definition: '与目标岗位最接近的一段经历没有被前置、展开或突出，导致第一印象阶段就丢失相关性。' },
  { type: 'task_only_no_business_value', name: '只写任务，没有业务价值', definition: '简历描述停留在任务层，没有体现这项工作对团队、项目、用户或业务带来了什么价值。' },
  { type: 'jd_direction_mismatch', name: '目标岗位方向不够聚焦', definition: '用户投递的目标岗位方向与简历主轴之间存在明显偏移，问题不仅是表达，还可能是方向选择问题。' },
  { type: 'overclaim_risk', name: '表述容易引发追问风险', definition: '简历中出现较强结论或能力表述，但缺少足够支撑，一旦进入面试容易被继续深挖并暴露短板。' },
  { type: 'ats_format_issue', name: 'ATS格式兼容性问题', definition: '简历格式导致ATS系统无法正确解析关键信息，如表格、图片、特殊字符等。' },
];

// 新数据存储
const newRules: Record<string, unknown>[] = [];
const newViews: Record<string, unknown>[] = [];
const newPatterns: Record<string, unknown>[] = [];

let ruleCounter = 36;
let viewCounter = 21;
let patternCounter = 21;

async function generateForRole(role: string, issue: typeof ISSUE_TYPES[0]): Promise<void> {
  console.log(`\n📝 生成: ${role} - ${issue.name}`);

  try {
    // 生成诊断规则
    const rulePrompt = `你是一个简历诊断专家，专注于帮助用户提升简历质量。

请为"${role}"岗位生成一条"${issue.name}"的诊断规则。

问题定义：${issue.definition}

要求：
1. 生成3-5个中文触发信号词（能触发这条规则的简历关键词）
2. 生成2-3个典型的坏例句子（真实简历中的常见错误表达，每个50-150字）
3. 指定优先级（high/medium/low）
4. 写清楚哪些岗位适用这条规则

请用JSON格式输出（不要有markdown代码块）：
{
  "rule_id": "rule-${String(ruleCounter++).padStart(3, '0')}",
  "issue_type": "${issue.type}",
  "issue_name": "${issue.name}",
  "definition": "${issue.definition}",
  "trigger_signals": ["信号词1", "信号词2", "信号词3"],
  "typical_bad_patterns": ["坏例1", "坏例2"],
  "priority_level": "high/medium/low",
  "applicable_roles": ["${role}", "相关岗位"],
  "source_level": "API",
  "notes": "简短说明这条规则的价值"
}`;

    const ruleText = await callAPI(rulePrompt);
    const ruleData = JSON.parse(ruleText.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim());
    newRules.push(ruleData);
    console.log(`  ✅ 规则生成成功: ${ruleData.rule_id}`);

    // 生成内行视角
    const viewPrompt = `你是一个有10年经验的HR总监，见过数万份简历。

请为"${role}"岗位的"${issue.name}"问题，站在HR/面试官的角度，生成一条"内行视角"。

问题定义：${issue.definition}

要求：
1. 用第一人称，从招聘方视角说话
2. 语气要克制但直接，不拐弯抹角
3. 50-100字，说清楚"为什么这个问题会影响筛选"
4. 要有代入感，让候选人看完能立刻理解问题所在

请用JSON格式输出（不要有markdown代码块）：
{
  "view_id": "view-${String(viewCounter++).padStart(3, '0')}",
  "issue_type": "${issue.type}",
  "role_context": "hr/business/hiring_manager",
  "view_text": "你的内行视角内容（50-100字）",
  "tone": "calm/direct",
  "applicable_roles": ["${role}", "相关岗位"],
  "source_level": "API",
  "notes": "简短说明这条视角的价值"
}`;

    const viewText = await callAPI(viewPrompt);
    const viewData = JSON.parse(viewText.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim());
    newViews.push(viewData);
    console.log(`  ✅ 视角生成成功: ${viewData.view_id}`);

    // 生成改写模式
    const patternPrompt = `你是一个简历改写专家，擅长把普通简历改写成高质量简历。

请为"${role}"岗位的"${issue.name}"问题，生成一条改写模式。

要求：
1. before_text: 一个典型的坏例句子（50-150字，基于真实简历风格）
2. after_text: 改写后的好例句子（保持同等长度，但要体现改写技巧）
3. rewrite_logic: 50字左右的改写逻辑说明
4. key_transformation: 2-4个关键转变点

请用JSON格式输出（不要有markdown代码块）：
{
  "pattern_id": "rewrite-${String(patternCounter++).padStart(3, '0')}",
  "issue_type": "${issue.type}",
  "role_type": "${role}",
  "before_text": "改写前的坏例...",
  "after_text": "改写后的好例...",
  "rewrite_logic": "改写逻辑说明...",
  "key_transformation": ["转变1", "转变2", "转变3"],
  "source_level": "API",
  "difficulty_level": "basic/advanced"
}`;

    const patternText = await callAPI(patternPrompt);
    const patternData = JSON.parse(patternText.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim());
    newPatterns.push(patternData);
    console.log(`  ✅ 改写模式生成成功: ${patternData.pattern_id}`);

    // 保存中间结果
    saveIntermediateResults();

    // 延迟避免限流
    await new Promise(r => setTimeout(r, 1000));

  } catch (err) {
    console.error(`  ❌ 生成失败: ${err}`);
  }
}

function saveIntermediateResults() {
  const basePath = "C:/Users/Administrator/Desktop/offerpilot-web/offerpilot-corpus/distilled";

  fs.writeFileSync(`${basePath}/diagnosis-rules.new.json`, JSON.stringify(newRules, null, 2), 'utf-8');
  fs.writeFileSync(`${basePath}/insider-views.new.json`, JSON.stringify(newViews, null, 2), 'utf-8');
  fs.writeFileSync(`${basePath}/rewrite-patterns.new.json`, JSON.stringify(newPatterns, null, 2), 'utf-8');
}

async function main() {
  const args = process.argv.slice(2);
  const countArg = args.find(arg => arg.startsWith('--count='));
  const targetCount = countArg ? parseInt(countArg.split('=')[1]) : 200;

  console.log(`\n🚀 开始批量生成知识库数据`);
  console.log(`   目标数量: ${targetCount} 条规则`);
  console.log(`   API地址: ${API_URL}`);
  console.log(`\n====================================\n`);

  // 计算需要覆盖的岗位-问题组合数
  const totalCombinations = ROLES.length * ISSUE_TYPES.length;
  console.log(`总岗位数: ${ROLES.length}`);
  console.log(`问题类型数: ${ISSUE_TYPES.length}`);
  console.log(`理论组合数: ${totalCombinations}`);
  console.log(`\n====================================\n`);

  // 循环生成数据直到达到目标
  for (let roleIndex = 0; roleIndex < ROLES.length && newRules.length < targetCount; roleIndex++) {
    for (let issueIndex = 0; issueIndex < ISSUE_TYPES.length && newRules.length < targetCount; issueIndex++) {
      await generateForRole(ROLES[roleIndex], ISSUE_TYPES[issueIndex]);
    }
  }

  console.log(`\n====================================`);
  console.log(`✅ 生成完成！`);
  console.log(`   诊断规则: ${newRules.length} 条`);
  console.log(`   内行视角: ${newViews.length} 条`);
  console.log(`   改写模式: ${newPatterns.length} 条`);
  console.log(`====================================\n`);

  // 合并到主知识库
  const basePath = "C:/Users/Administrator/Desktop/offerpilot-web/offerpilot-corpus/distilled";

  const existingRules = JSON.parse(fs.readFileSync(`${basePath}/diagnosis-rules.json`, 'utf-8'));
  const existingViews = JSON.parse(fs.readFileSync(`${basePath}/insider-views.json`, 'utf-8'));
  const existingPatterns = JSON.parse(fs.readFileSync(`${basePath}/rewrite-patterns.json`, 'utf-8'));

  const mergedRules = [...existingRules, ...newRules];
  const mergedViews = [...existingViews, ...newViews];
  const mergedPatterns = [...existingPatterns, ...newPatterns];

  fs.writeFileSync(`${basePath}/diagnosis-rules.json`, JSON.stringify(mergedRules, null, 2), 'utf-8');
  fs.writeFileSync(`${basePath}/insider-views.json`, JSON.stringify(mergedViews, null, 2), 'utf-8');
  fs.writeFileSync(`${basePath}/rewrite-patterns.json`, JSON.stringify(mergedPatterns, null, 2), 'utf-8');

  console.log(`💾 已合并到主知识库`);
  console.log(`   诊断规则: ${existingRules.length} + ${newRules.length} = ${mergedRules.length} 条`);
  console.log(`   内行视角: ${existingViews.length} + ${newViews.length} = ${mergedViews.length} 条`);
  console.log(`   改写模式: ${existingPatterns.length} + ${newPatterns.length} = ${mergedPatterns.length} 条`);

  // 统计岗位覆盖
  const allRoles = new Set<string>();
  mergedRules.forEach(r => r.applicable_roles.forEach((role: string) => allRoles.add(role)));
  console.log(`\n📊 岗位覆盖: ${allRoles.size} 个`);
  console.log(`   ${[...allRoles].join(', ')}`);
}

main().catch(console.error);