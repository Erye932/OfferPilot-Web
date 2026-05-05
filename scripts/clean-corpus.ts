/**
 * 简历语料清洗器
 * 把公开数据集的原始简历转成知识库需要的格式
 *
 * 使用方式:
 * npx ts-node scripts/clean-corpus.ts --input ./data/raw_resumes.json --output ./data/cleaned_resumes.json
 */

import fs from 'fs';

// 简历问题类型定义
const ISSUE_TYPES = {
  lack_of_result_evidence: '缺少结果证据',
  keyword_alignment_weak: '岗位关键词连接不够直接',
  weak_role_boundary: '项目角色边界不清',
  weak_expression_pattern: '经历表述偏泛',
  relevant_experience_not_emphasized: '最相关经历没有放大',
  lack_of_quantification: '数字化表达偏少',
  advantage_not_front_loaded: '优势没有前置',
  task_only_no_business_value: '只写任务，没有业务价值',
  jd_direction_mismatch: '目标岗位方向不够聚焦',
  overclaim_risk: '表述容易引发追问风险',
};

// 输入数据格式（根据公开数据集调整）
interface RawResume {
  resume_text?: string;
  text?: string;
  resume?: string;
  content?: string;
  category?: string;
  category_label?: string;
  role?: string;
  job_title?: string;
  [key: string]: unknown;
}

// 清洗后的简历结构
interface CleanedResume {
  id: string;
  raw_text: string;
  cleaned_text: string;
  target_role: string;
  experience_level: string;
  detected_issues: string[];
  quality_score: number; // 0-100，用于过滤低质量数据
  source: string;
  created_at: string;
}

// 问题检测规则
function detectIssues(text: string): string[] {
  const issues: string[] = [];

  // 缺少结果证据的信号
  const weakVerbs = ['负责', '参与', '协助', '配合', '执行', '跟进', '支持', '完成'];
  const strongVerbs = ['提升', '增长', '优化', '达成', '实现', '突破'];

  const hasWeakVerbs = weakVerbs.some(v => text.includes(v));
  const hasStrongVerbs = strongVerbs.some(v => text.includes(v));

  // 如果有弱动词但没有结果动词，可能是缺少结果证据
  if (hasWeakVerbs && !hasStrongVerbs) {
    issues.push('lack_of_result_evidence');
  }

  // 缺少数字化表达的信号
  const quantifiers = ['%', '人', '次', '万', '千', '增长', '提升', '下降', '达到'];
  const hasQuantifiers = quantifiers.some(q => text.includes(q));
  if (!hasQuantifiers && text.length > 200) {
    issues.push('lack_of_quantification');
  }

  // 表述偏泛的信号
  const genericPhrases = ['良好', '不错', '顺利', '相关', '完成工作', '日常'];
  const hasGenericPhrases = genericPhrases.some(p => text.includes(p));
  if (hasGenericPhrases) {
    issues.push('weak_expression_pattern');
  }

  // 角色边界不清的信号
  const boundaryPhrases = ['配合团队', '协助完成', '参与项目', '整体落地'];
  const hasBoundaryPhrases = boundaryPhrases.some(p => text.includes(p));
  if (hasBoundaryPhrases) {
    issues.push('weak_role_boundary');
  }

  // 只写任务没有价值的信号
  const taskOnlyPhrases = ['整理资料', '发布内容', '日常维护', '执行工作'];
  const hasTaskOnlyPhrases = taskOnlyPhrases.some(p => text.includes(p));
  if (hasTaskOnlyPhrases && !hasStrongVerbs) {
    issues.push('task_only_no_business_value');
  }

  return issues;
}

// 从文本推断目标岗位
function inferRole(text: string): string {
  const roleSignals: Record<string, string[]> = {
    '内容运营': ['内容运营', '新媒体', '内容创作', '文案', '选题'],
    '用户运营': ['用户运营', '用户增长', '社群运营', '私域', '会员'],
    '活动运营': ['活动运营', '活动策划', '活动执行', '线下活动'],
    '产品运营': ['产品运营', '产品经理', '需求', '迭代', '版本'],
    '数据分析师': ['数据分析', '数据挖掘', 'BI', '报表', '指标'],
    '前端开发': ['前端', 'Vue', 'React', 'HTML', 'CSS', 'JavaScript'],
    '后端开发': ['后端', 'Java', 'Python', 'Go', '数据库', 'API'],
    '测试工程师': ['测试', 'QA', '用例', '自动化', '回归测试'],
    '市场': ['市场', '营销', '推广', '渠道', '品牌'],
    '销售': ['销售', '客户', '业绩', '签约', '商务'],
  };

  for (const [role, signals] of Object.entries(roleSignals)) {
    if (signals.some(s => text.includes(s))) {
      return role;
    }
  }

  return '其他';
}

// 推断经验级别
function inferExperienceLevel(text: string): string {
  if (text.includes('应届') || text.includes('实习') || text.includes('毕业')) {
    return '应届生';
  }
  if (text.includes('1年') || text.includes('2年') || text.includes('3年')) {
    return '1-3年';
  }
  if (text.includes('4年') || text.includes('5年') || text.includes('6年')) {
    return '3-5年';
  }
  return '1-3年'; // 默认
}

// 计算质量分数
function calculateQualityScore(text: string, issues: string[]): number {
  let score = 100;

  // 长度太短扣分
  if (text.length < 200) score -= 30;
  else if (text.length < 500) score -= 15;

  // 每发现一个问题扣分
  score -= issues.length * 10;

  // 数字化表达加分
  const quantifiers = ['%', '人', '次', '万', '千', '增长', '提升', '达到'];
  const hasQuantifiers = quantifiers.some(q => text.includes(q));
  if (hasQuantifiers) score += 10;

  // 有STAR结构的加分（situation, task, action, result）
  const starSignals = ['为了', '为了解决', '通过', '最终', '结果'];
  const hasStarSignals = starSignals.some(s => text.includes(s));
  if (hasStarSignals) score += 5;

  return Math.max(0, Math.min(100, score));
}

// 主清洗函数
function cleanResume(raw: RawResume, source: string): CleanedResume | null {
  // 提取文本
  const rawText = raw.resume_text || raw.text || raw.resume || raw.content || '';

  if (rawText.length < 50) return null; // 太短的跳过

  // 基本清洗
  const cleanedText = rawText
    .replace(/\s+/g, ' ')
    .replace(/[\n\r]+/g, '\n')
    .trim();

  const targetRole = inferRole(cleanedText);
  const experienceLevel = inferExperienceLevel(cleanedText);
  const detectedIssues = detectIssues(cleanedText);
  const qualityScore = calculateQualityScore(cleanedText, detectedIssues);

  return {
    id: `cleaned_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    raw_text: rawText,
    cleaned_text: cleanedText,
    target_role: targetRole,
    experience_level: experienceLevel,
    detected_issues: detectedIssues,
    quality_score: qualityScore,
    source: source,
    created_at: new Date().toISOString(),
  };
}

// 批量处理
async function processFile(inputPath: string, outputPath: string, source: string) {
  console.log(`📂 读取文件: ${inputPath}`);

  const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const rawArray = Array.isArray(rawData) ? rawData : [rawData];

  console.log(`📊 原始数据: ${rawArray.length} 条`);

  const cleaned: CleanedResume[] = [];
  let skipped = 0;

  for (const item of rawArray) {
    const result = cleanResume(item, source);
    if (result) {
      cleaned.push(result);
    } else {
      skipped++;
    }
  }

  console.log(`✅ 清洗完成: ${cleaned.length} 条 (跳过 ${skipped} 条)`);

  // 按质量分数排序，过滤低质量数据
  const filtered = cleaned
    .filter(r => r.quality_score >= 40) // 只保留质量分数>=40的
    .sort((a, b) => b.quality_score - a.quality_score);

  console.log(`🎯 质量过滤后: ${filtered.length} 条 (保留分数>=40的)`);

  // 保存
  fs.writeFileSync(outputPath, JSON.stringify(filtered, null, 2), 'utf-8');
  console.log(`💾 已保存到: ${outputPath}`);

  // 统计报告
  const issueStats: Record<string, number> = {};
  filtered.forEach(r => {
    r.detected_issues.forEach(issue => {
      issueStats[issue] = (issueStats[issue] || 0) + 1;
    });
  });

  console.log('\n📈 问题分布统计:');
  Object.entries(issueStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([issue, count]) => {
      console.log(`  ${ISSUE_TYPES[issue as keyof typeof ISSUE_TYPES] || issue}: ${count}条`);
    });
}

// CLI入口
const args = process.argv.slice(2);
const inputIndex = args.indexOf('--input');
const outputIndex = args.indexOf('--output');
const sourceIndex = args.indexOf('--source');

if (inputIndex === -1 || outputIndex === -1) {
  console.log(`
用法: npx ts-node scripts/clean-corpus.ts --input <输入文件> --output <输出文件> --source <来源>

示例:
  npx ts-node scripts/clean-corpus.ts --input ./data/raw.json --output ./data/cleaned.json --source kaggle
  `);
  process.exit(1);
}

const inputFile = args[inputIndex + 1];
const outputFile = args[outputIndex + 1];
const source = sourceIndex !== -1 ? args[sourceIndex + 1] : 'unknown';

processFile(inputFile, outputFile, source)
  .then(() => console.log('\n✨ 完成!'))
  .catch(err => console.error('❌ 错误:', err));
