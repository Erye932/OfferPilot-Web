// 三库映射增强模块
// 根据 issue_type 从 diagnosis-rules / insider-views / rewrite-patterns 三库映射增强信息

import type { RuleMatch, IssueEnrichment, IssueEnrichmentResult } from './types';
import {
  getRuleByIssueType,
  getViewByIssueType,
  getPatternByIssueType
} from './corpus';

/**
 * 为规则匹配结果添加三库增强信息
 */
export function enrichIssues(matches: RuleMatch[]): IssueEnrichmentResult {
  const enrichments: IssueEnrichment[] = [];

  for (const match of matches) {
    const { issue_type, issue_name } = match;

    // 1. 从诊断规则库获取信息
    const rule = getRuleByIssueType(issue_type);

    // 2. 从内行视角库获取信息
    const view = getViewByIssueType(issue_type);

    // 3. 从改写模式库获取信息
    const pattern = getPatternByIssueType(issue_type);

    // 构建增强信息
    const enrichment: IssueEnrichment = {
      issue_type,
      issue_name,
    };

    // 添加诊断规则信息
    if (rule) {
      enrichment.definition = rule.definition;
      // 可以添加更多规则字段
    }

    // 添加内行视角
    if (view) {
      enrichment.insider_view = view.view_text;
      // 可以根据 tone 调整语气
    }

    // 添加改写模式
    if (pattern) {
      enrichment.rewrite_logic = pattern.rewrite_logic;
      enrichment.before_text = pattern.before_text;
      enrichment.after_text = pattern.after_text;
    }

    // 如果某个库没有对应信息，使用通用默认值
    if (!enrichment.definition) {
      enrichment.definition = `问题类型: ${issue_name}`;
    }

    if (!enrichment.insider_view) {
      enrichment.insider_view = generateDefaultInsiderView(issue_type, issue_name);
    }

    if (!enrichment.rewrite_logic) {
      enrichment.rewrite_logic = generateDefaultRewriteLogic(issue_type, issue_name);
    }

    enrichments.push(enrichment);
  }

  return { enrichments };
}

/**
 * 生成默认内行视角 - 约束模板：只解释证据与逻辑，禁止新判断
 */
function generateDefaultInsiderView(issueType: string, issueName: string): string {
  // 约束模板：只解释证据与逻辑，禁止添加新判断
  const templateViews: Record<string, string> = {
    lack_of_result_evidence: '招聘方看到"负责/参与"这类动作词但没有结果数据时，可能会认为工作停留在执行层面，因为缺少量化结果难以评估实际贡献。',
    keyword_alignment_weak: '招聘方扫描简历时，如果岗位要求的关键能力词没有显性出现，可能会认为简历与岗位不够匹配，因为需要通过关键词快速筛选候选人。',
    weak_role_boundary: '招聘方看到"协同团队""配合完成"等模糊描述时，可能会认为你的具体角色不清晰，因为团队贡献和个人贡献没有明确区分。',
    jd_direction_mismatch: '招聘方对比简历经历和岗位要求时，如果核心能力方向差异明显，可能会认为你的职业方向与岗位不够契合，因为简历没有体现岗位关注的核心能力。',
    overclaim_risk: '招聘方看到"精通""主导"等强词但没有后续支撑时，可能会认为表述存在夸大风险，因为强词需要具体成果或数据来佐证可信度。',
  };

  // 统一模板格式：招聘方看到[证据]可能会认为[影响]，因为[逻辑]
  const template = templateViews[issueType];
  if (template) {
    return template;
  }

  // 通用模板
  return `招聘方看到相关表述时，可能会认为${issueName}，因为这会影响对工作能力和贡献的判断。`;
}

/**
 * 生成默认改写逻辑
 */
function generateDefaultRewriteLogic(issueType: string, issueName: string): string {
  const defaultLogics: Record<string, string> = {
    lack_of_result_evidence: '把纯动作表述改成"动作 + 结果/复盘 + 影响"的结构，让经历不只停留在执行层。',
    keyword_alignment_weak: '把泛化动作改成更贴岗位语境的表达，优先把 JD 里的核心能力词显性写出来。',
    weak_role_boundary: '把"团队做了什么"和"你做了什么"拆开写，优先明确个人主导动作，再写配合部分。',
    jd_direction_mismatch: '当方向还不够完全匹配时，先把已有经历向目标岗位可迁移的能力上靠拢，但不能硬写成已经具备更高阶能力。',
    overclaim_risk: '当原句存在明显过度拔高风险时，优先把表述收回到真实角色边界，避免制造不必要的面试追问压力。',
  };

  return defaultLogics[issueType] || `针对${issueName}，建议调整表达方式以提升匹配度。`;
}

/**
 * 获取增强信息的文本摘要，用于构建 AI 提示词
 */
export function getEnrichmentSummary(enrichments: IssueEnrichment[]): string {
  if (enrichments.length === 0) {
    return '未匹配到具体问题类型。';
  }

  return enrichments.map(env => {
    const parts: string[] = [];
    parts.push(`- ${env.issue_name}`);
    if (env.definition) {
      parts.push(`  定义: ${env.definition}`);
    }
    if (env.insider_view) {
      parts.push(`  内行视角: ${env.insider_view}`);
    }
    if (env.rewrite_logic) {
      parts.push(`  改写逻辑: ${env.rewrite_logic}`);
    }
    return parts.join('\n');
  }).join('\n\n');
}

/**
 * 获取增强信息的结构化数据，用于 AI 生成
 */
export function getEnrichmentStructuredData(enrichments: IssueEnrichment[]): Array<{
  issue_type: string;
  issue_name: string;
  definition?: string;
  insider_view?: string;
  rewrite_logic?: string;
}> {
  return enrichments.map(env => ({
    issue_type: env.issue_type,
    issue_name: env.issue_name,
    definition: env.definition,
    insider_view: env.insider_view,
    rewrite_logic: env.rewrite_logic,
  }));
}