/**
 * 知识库三库生成器
 * 用Claude API批量生成高质量的诊断规则、内行视角、改写模式
 *
 * 使用方式:
 * 1. 设置环境变量 ANTHROPIC_API_KEY=sk-xxx
 * 2. npx ts-node scripts/generate-knowledge-base.ts --count 50 --role "内容运营"
 */

import fs from 'fs';

// ─── 配置 ────────────────────────────────────────────────────

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-sonnet-4-20250514'; // 或者用 opus
const MAX_TOKENS = 4096;

// ─── 类型定义 ────────────────────────────────────────────────

interface DiagnosisRule {
  rule_id: string;
  issue_type: string;
  issue_name: string;
  definition: string;
  trigger_signals: string[];
  typical_bad_patterns: string[];
  priority_level: 'high' | 'medium' | 'low';
  applicable_roles: string[];
  source_level: string;
  notes: string;
}

interface InsiderView {
  view_id: string;
  issue_type: string;
  role_context: string;
  view_text: string;
  tone: string;
  applicable_roles: string[];
  source_level: string;
  notes: string;
}

interface RewritePattern {
  pattern_id: string;
  issue_type: string;
  role_type: string;
  before_text: string;
  after_text: string;
  rewrite_logic: string;
  key_transformation: string[];
  source_level: string;
  difficulty_level: string;
}

// ─── 岗位定义 ────────────────────────────────────────────────

const ROLE_CATEGORIES = {
  '运营类': [
    '内容运营', '用户运营', '活动运营', '产品运营', '新媒体运营',
    '电商运营', '社群运营', '数据运营', '商家运营', '品类运营',
  ],
  '产品类': [
    '产品经理', '产品助理', '高级产品经理', 'C端产品经理', 'B端产品经理',
  ],
  '技术类': [
    '前端开发', '后端开发', '全栈开发', '测试工程师', '运维工程师',
    'Android开发', 'iOS开发', 'Java开发', 'Python开发', 'Go开发',
  ],
  '数据/算法': [
    '数据分析师', '算法工程师', '数据工程师', 'BI工程师', '策略产品经理',
  ],
  '设计类': [
    'UI设计师', 'UX设计师', '交互设计师', '视觉设计师', '产品设计师',
  ],
  '市场/销售': [
    '市场推广', '渠道运营', '商务合作', '销售代表', '大客户销售',
  ],
  '职能类': [
    'HR', '行政', '财务', '法务', '采购',
  ],
};

// 核心问题类型（每种类型需要生成多条）
const CORE_ISSUE_TYPES = [
  {
    type: 'lack_of_result_evidence',
    name: '缺少结果证据',
    definition: '经历只写了做过什么，没有体现结果、影响、产出或复盘价值。',
    description: '这是简历诊断中最常见的问题。用户描述工作内容时只说"做了什么"，没有说明"带来了什么改变"或"产生了什么结果"。',
  },
  {
    type: 'keyword_alignment_weak',
    name: '岗位关键词连接不够直接',
    definition: '简历内容与目标岗位并非无关，但没有显性对齐岗位要求中的核心能力点或关键词。',
    description: '用户的工作经验和技能与目标岗位相关，但没有用招聘方熟悉的语言表达，导致匹配度被低估。',
  },
  {
    type: 'weak_role_boundary',
    name: '项目角色边界不清',
    definition: '简历没有明确区分自己主导了什么、参与了什么、配合了什么，导致个人贡献感被削弱。',
    description: '团队项目中，用户用"我们"或模糊表述掩盖了个人角色，让筛选者无法判断其独立能力。',
  },
  {
    type: 'weak_expression_pattern',
    name: '经历表述偏泛',
    definition: '经历大量使用泛化、弱化的动作表述，无法让筛选者快速判断具体能力与贡献。',
    description: '反复使用"参与、协助、支持、配合"等弱动词，削弱了经历的专业感和可信度。',
  },
  {
    type: 'lack_of_quantification',
    name: '数字化表达偏少',
    definition: '简历中缺少人数、规模、次数、提升幅度、结果指标等量化信息，导致成果难以被快速建立可信度。',
    description: '只有定性描述没有定量数据，让成果看起来像套话而不是可验证的事实。',
  },
  {
    type: 'relevant_experience_not_emphasized',
    name: '最相关经历没有放大',
    definition: '与目标岗位最接近的一段经历没有被前置、展开或突出，导致第一印象阶段就丢失相关性。',
    description: '用户有相关经验但没有被放在显眼位置，让筛选者错过了最佳匹配信号。',
  },
  {
    type: 'task_only_no_business_value',
    name: '只写任务，没有业务价值',
    definition: '简历描述停留在任务层，没有体现这项工作对团队、项目、用户或业务带来了什么价值。',
    description: '用户描述的是"完成了动作"而不是"创造了价值"，让筛选者觉得是执行机器而非价值创造者。',
  },
  {
    type: 'jd_direction_mismatch',
    name: '目标岗位方向不够聚焦',
    definition: '用户投递的目标岗位方向与简历主轴之间存在明显偏移，问题不仅是表达，还可能是方向选择问题。',
    description: '用户经历集中在某个领域，但投递了方向差异较大的岗位，需要帮助用户认清这个问题。',
  },
  {
    type: 'overclaim_risk',
    name: '表述容易引发追问风险',
    definition: '简历中出现较强结论或能力表述，但缺少足够支撑，一旦进入面试容易被继续深挖并暴露短板。',
    description: '用户用了"精通、主导、独立负责"等强词，但没有提供足够证据，容易被追问并露馅。',
  },
  {
    type: 'ats_format_issue',
    name: 'ATS格式兼容性问题',
    definition: '简历格式导致ATS系统无法正确解析关键信息，如表格、图片、特殊字符等。',
    description: '简历视觉效果不错，但机器无法识别，导致在初筛阶段就被过滤。',
  },
  {
    type: 'structure_issue',
    name: '简历结构不合理',
    definition: '简历各部分比例失调，如自我评价过长、工作经历过短，或信息主次不分。',
    description: '用户在非关键信息上花了太多篇幅，关键信息反而被压缩，浪费了宝贵的初筛时间。',
  },
  {
    type: 'redundancy_issue',
    name: '信息重复冗余',
    definition: '简历中存在大量重复信息，同一个能力或经历被换了说法多次出现。',
    description: '用户试图强调某个能力，但反复用不同说法表达同一件事，让筛选者觉得内容贫乏。',
  },
];

// ─── Claude API调用 ─────────────────────────────────────────

async function callClaude(prompt: string): Promise<string> {
  if (!API_KEY) {
    throw new Error('请设置环境变量 ANTHROPIC_API_KEY');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API调用失败: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// ─── 生成Prompt模板 ─────────────────────────────────────────

function buildDiagnosisRulePrompt(role: string, issueType: string, issueName: string, definition: string, description: string): string {
  return `你是一个简历诊断专家，专注于帮助用户提升简历质量。

请为"${role}"岗位生成一条"${issueName}"（${issueType}）的诊断规则。

问题说明：${description}
问题定义：${definition}

要求：
1. 生成3-5个中文触发信号词（能触发这条规则的简历关键词）
2. 生成2-3个典型的坏例句子（真实简历中的常见错误表达，每个50-150字）
3. 指定优先级（high/medium/low）
4. 写清楚哪些岗位适用这条规则

请用JSON格式输出：
{
  "rule_id": "rule-XXX（数字递增）",
  "issue_type": "${issueType}",
  "issue_name": "${issueName}",
  "definition": "${definition}",
  "trigger_signals": ["信号词1", "信号词2", "信号词3"],
  "typical_bad_patterns": ["坏例1", "坏例2"],
  "priority_level": "high/medium/low",
  "applicable_roles": ["${role}", "相关岗位"],
  "source_level": "AI",
  "notes": "简短说明这条规则的价值"
}`;
}

function buildInsiderViewPrompt(role: string, issueType: string, issueName: string, definition: string): string {
  return `你是一个有10年经验的HR总监，见过数万份简历。

请为"${role}"岗位的"${issueName}"问题，站在HR/面试官的角度，生成一条"内行视角"。

问题定义：${definition}

要求：
1. 用第一人称，从招聘方视角说话
2. 语气要克制但直接，不拐弯抹角
3. 50-100字，说清楚"为什么这个问题会影响筛选"
4. 要有代入感，让候选人看完能立刻理解问题所在

请用JSON格式输出：
{
  "view_id": "view-XXX",
  "issue_type": "${issueType}",
  "role_context": "hr/business/hiring_manager",
  "view_text": "你的内行视角内容（50-100字）",
  "tone": "calm/direct",
  "applicable_roles": ["${role}", "相关岗位"],
  "source_level": "AI",
  "notes": "简短说明这条视角的价值"
}`;
}

function buildRewritePatternPrompt(role: string, issueType: string, issueName: string): string {
  return `你是一个简历改写专家，擅长把普通简历改写成高质量简历。

请为"${role}"岗位的"${issueName}"问题，生成一条改写模式。

要求：
1. before_text: 一个典型的坏例句子（50-150字，基于真实简历风格）
2. after_text: 改写后的好例句子（保持同等长度，但要体现改写技巧）
3. rewrite_logic: 50字左右的改写逻辑说明
4. key_transformation: 2-4个关键转变点

请用JSON格式输出：
{
  "pattern_id": "rewrite-XXX",
  "issue_type": "${issueType}",
  "role_type": "${role}",
  "before_text": "改写前的坏例...",
  "after_text": "改写后的好例...",
  "rewrite_logic": "改写逻辑说明...",
  "key_transformation": ["转变1", "转变2", "转变3"],
  "source_level": "AI",
  "difficulty_level": "basic/advanced"
}`;
}

// ─── 数据生成 ───────────────────────────────────────────────

let ruleCounter = 11; // 从11开始，因为已有10条
let viewCounter = 11;
let patternCounter = 11;

const rules: DiagnosisRule[] = [];
const views: InsiderView[] = [];
const patterns: RewritePattern[] = [];

async function generateSingleSet(role: string, issueType: string, issueName: string, definition: string, description: string): Promise<void> {
  console.log(`  📝 生成 ${role} - ${issueName}...`);

  try {
    // 生成诊断规则
    const rulePrompt = buildDiagnosisRulePrompt(role, issueType, issueName, definition, description);
    const ruleText = await callClaude(rulePrompt);
    const ruleData = JSON.parse(ruleText.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim());
    ruleData.rule_id = `rule-${String(ruleCounter++).padStart(3, '0')}`;
    rules.push(ruleData);

    // 生成内行视角
    const viewPrompt = buildInsiderViewPrompt(role, issueType, issueName, definition);
    const viewText = await callClaude(viewPrompt);
    const viewData = JSON.parse(viewText.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim());
    viewData.view_id = `view-${String(viewCounter++).padStart(3, '0')}`;
    views.push(viewData);

    // 生成改写模式
    const patternPrompt = buildRewritePatternPrompt(role, issueType, issueName);
    const patternText = await callClaude(patternPrompt);
    const patternData = JSON.parse(patternText.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim());
    patternData.pattern_id = `rewrite-${String(patternCounter++).padStart(3, '0')}`;
    patterns.push(patternData);

    console.log(`    ✅ 完成`);
  } catch (err) {
    console.error(`    ❌ 失败: ${err}`);
  }
}

async function generateBatch(targetCount: number, specificRoles?: string[]): Promise<void> {
  console.log(`\n🎯 开始生成 ${targetCount} 条数据...\n`);

  // 确定要生成的岗位列表
  const rolesToGenerate = specificRoles || Object.values(ROLE_CATEGORIES).flat();
  const uniqueRoles = [...new Set(rolesToGenerate)];

  // 每个岗位-问题组合生成一条
  for (const role of uniqueRoles) {
    if (rules.length >= targetCount) break;

    for (const issue of CORE_ISSUE_TYPES) {
      if (rules.length >= targetCount) break;
      await generateSingleSet(role, issue.type, issue.name, issue.definition, issue.description);

      // 添加延迟避免API限流
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ 生成完成!`);
  console.log(`   - 诊断规则: ${rules.length} 条`);
  console.log(`   - 内行视角: ${views.length} 条`);
  console.log(`   - 改写模式: ${patterns.length} 条`);
}

// ─── 合并现有数据 ────────────────────────────────────────────

function mergeWithExisting(dataDir: string): void {
  const existingRules = JSON.parse(fs.readFileSync(`${dataDir}/diagnosis-rules.json`, 'utf-8'));
  const existingViews = JSON.parse(fs.readFileSync(`${dataDir}/insider-views.json`, 'utf-8'));
  const existingPatterns = JSON.parse(fs.readFileSync(`${dataDir}/rewrite-patterns.json`, 'utf-8'));

  // 合并并去重（按ID）
  const allRules = [...existingRules, ...rules];
  const allViews = [...existingViews, ...views];
  const allPatterns = [...existingPatterns, ...patterns];

  const uniqueRules = allRules.filter((r, i, arr) => arr.findIndex(x => x.rule_id === r.rule_id) === i);
  const uniqueViews = allViews.filter((v, i, arr) => arr.findIndex(x => x.view_id === v.view_id) === i);
  const uniquePatterns = allPatterns.filter((p, i, arr) => arr.findIndex(x => x.pattern_id === p.pattern_id) === i);

  // 保存
  fs.writeFileSync(`${dataDir}/diagnosis-rules.json`, JSON.stringify(uniqueRules, null, 2));
  fs.writeFileSync(`${dataDir}/insider-views.json`, JSON.stringify(uniqueViews, null, 2));
  fs.writeFileSync(`${dataDir}/rewrite-patterns.json`, JSON.stringify(uniquePatterns, null, 2));

  console.log(`\n💾 合并完成!`);
  console.log(`   - 诊断规则: ${existingRules.length} → ${uniqueRules.length}`);
  console.log(`   - 内行视角: ${existingViews.length} → ${uniqueViews.length}`);
  console.log(`   - 改写模式: ${existingPatterns.length} → ${uniquePatterns.length}`);
}

// ─── CLI入口 ────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const countIndex = args.indexOf('--count');
  const roleIndex = args.indexOf('--role');
  const dataDirIndex = args.indexOf('--data-dir');
  const noMergeIndex = args.indexOf('--no-merge');

  const targetCount = countIndex !== -1 ? parseInt(args[countIndex + 1]) : 100;
  const specificRoles = roleIndex !== -1 ? args[roleIndex + 1].split(',') : undefined;
  const dataDir = dataDirIndex !== -1 ? args[dataDirIndex + 1] : '../offerpilot-corpus/distilled';

  if (!API_KEY) {
    console.log(`
❌ 错误: 请设置环境变量 ANTHROPIC_API_KEY

方式1: 直接设置
  Windows: set ANTHROPIC_API_KEY=sk-xxx
  Linux/Mac: export ANTHROPIC_API_KEY=sk-xxx

方式2: 在命令中指定
  ANTHROPIC_API_KEY=sk-xxx npx ts-node scripts/generate-knowledge-base.ts --count 50
    `);
    process.exit(1);
  }

  console.log(`🤖 知识库生成器`);
  console.log(`   目标数量: ${targetCount}`);
  if (specificRoles) console.log(`   指定岗位: ${specificRoles.join(', ')}`);
  console.log(`   数据目录: ${dataDir}`);
  console.log(`   合并模式: ${noMergeIndex === -1 ? '开启' : '关闭'}`);

  await generateBatch(targetCount, specificRoles);

  if (noMergeIndex === -1) {
    mergeWithExisting(dataDir);
  } else {
    // 只保存新生成的
    fs.writeFileSync(`${dataDir}/diagnosis-rules.new.json`, JSON.stringify(rules, null, 2));
    fs.writeFileSync(`${dataDir}/insider-views.new.json`, JSON.stringify(views, null, 2));
    fs.writeFileSync(`${dataDir}/rewrite-patterns.new.json`, JSON.stringify(patterns, null, 2));
    console.log(`\n💾 新数据已保存到 *.new.json 文件`);
  }

  console.log(`\n✨ 完成!`);
}

main().catch(console.error);
