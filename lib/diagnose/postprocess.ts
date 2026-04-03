// 后处理模块 V3
// 对 AI 返回结果进行修复、排序、去重、语气修正、改写质量保障

import type { FreeDiagnoseResponse, NormalizedInput } from './types';
import { logError } from '../error-handler';

// ─── 审判式措辞黑名单 ────────────────────────────────────────
const HARSH_PHRASES = [
  '一眼假', '虚假', '致命缺陷', '极其糟糕', '非常差',
  // 保留结果导向表达：'高风险'、'严重不足'、'完全没有'、'毫无'、'令人担忧'、'危险信号'、'红旗'
  // 保留中性表达：'暴露短板'、'容易被盘问'、'夸大'、'过度拔高'、'不可信'
];

const HARSH_REPLACEMENTS: Record<string, string> = {
  '一眼假': '不够自然',
  '虚假': '不够真实',
  '致命缺陷': '需要优先解决的问题',
  '极其糟糕': '需要改进',
  '非常差': '需要优化',
  // 保留结果导向表达的原始措辞，不进行替换
  // '高风险'、'严重不足'、'完全没有'、'毫无'、'令人担忧'、'危险信号'、'红旗' 等保留原样
  // 保留中性表达的原始措辞：'暴露短板'、'容易被盘问'、'夸大'、'过度拔高'、'不可信'
};

/**
 * 柔化文案：将审判式措辞替换为帮助式
 */
function softenText(text: string): string {
  if (!text) return text;
  let result = text;
  for (const [harsh, soft] of Object.entries(HARSH_REPLACEMENTS)) {
    // 使用正则表达式全局替换
    const regex = new RegExp(harsh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    result = result.replace(regex, soft);
  }
  return result;
}

/**
 * 后处理 AI 返回结果
 */
export function postProcessResponse(
  aiResponse: FreeDiagnoseResponse,
  input: NormalizedInput
): FreeDiagnoseResponse {
  const result = { ...aiResponse };

  // 1. 字段兜底修复
  repairMissingFields(result, input);

  // 2. 核心问题处理
  processCoreIssues(result, input.tier);

  // 3. 场景字段调整（包括 main_judgment 修正）
  adjustFieldsByScenario(result, input);

  // 4. 优先动作处理（动态 1~3，不强补）
  processPriorityActions(result);

  // 5. minor_suggestions 处理
  processMinorSuggestions(result);

  // 6. 改写示例处理
  processRewriteExamples(result);

  // 7. 旧版 before/after 兼容
  processLegacyBeforeAfter(result);

  // 8. 追问位处理
  processFollowUpPrompts(result);

  // 9. 全局语气柔化
  softenAllText(result);

  // 10. metadata 修正
  processMetadata(result, input);

  return result;
}

/**
 * 修复缺失字段
 */
function repairMissingFields(result: FreeDiagnoseResponse, input: NormalizedInput): void {
  if (!result.scenario) {
    result.scenario = 'normal';
  }

  if (!result.main_judgment || result.main_judgment.trim().length === 0) {
    result.main_judgment = '';
  }

  if (!Array.isArray(result.core_issues)) {
    result.core_issues = [];
  }

  if (!result.core_issues_summary) {
    result.core_issues_summary = {
      total_count: result.core_issues.length,
      shown_count: result.core_issues.length,
    };
  }

  if (!Array.isArray(result.priority_actions)) {
    result.priority_actions = [];
  }

  if (!result.rewrite_direction) {
    result.rewrite_direction = '';
  }

  if (!Array.isArray(result.minor_suggestions)) {
    result.minor_suggestions = [];
  }

  if (!Array.isArray(result.rewrite_examples)) {
    result.rewrite_examples = [];
  }

  if (!Array.isArray(result.follow_up_prompts)) {
    result.follow_up_prompts = [];
  }

  if (!result.metadata) {
    result.metadata = {
      target_role: input.target_role,
      has_jd: !!input.jd_text?.trim(),
      generated_at: new Date().toISOString(),
      tier: input.tier,
    };
  }
}

/**
 * 处理核心问题 — V5: 动态展示数量根据 quality_tier
 */
function processCoreIssues(result: FreeDiagnoseResponse, tier: 'free' | 'paid'): void {
  const issues = result.core_issues;

  if (issues.length === 0) {
    result.core_issues_summary = { total_count: 0, shown_count: 0 };
    return;
  }

  // 确保每个问题都有必要字段
  issues.forEach((issue, index) => {
    if (!issue.title?.trim()) issue.title = `问题 ${index + 1}`;
    if (!issue.summary?.trim()) issue.summary = '需要进一步分析';
    if (!issue.evidence?.trim()) issue.evidence = '未提供具体证据';
    if (!issue.insider_view?.trim()) issue.insider_view = '这个问题可能会影响招聘方对你的判断。';
    if (!issue.suggestion?.trim()) issue.suggestion = '建议针对这个问题进行调整。';
    if (!issue.follow_up_question?.trim()) issue.follow_up_question = '面试中可能会围绕这个问题展开提问。';
    if (typeof issue.priority !== 'number' || issue.priority < 1) issue.priority = index + 1;
  });

  // 语义去重
  const uniqueIssues = deduplicateIssues(issues);

  // 排序（已经在 workflow 中排过了，这里保持 priority 顺序）
  uniqueIssues.sort((a, b) => a.priority - b.priority);

  // 重新分配 priority
  uniqueIssues.forEach((issue, index) => {
    issue.priority = index + 1;
  });

  // V5: 动态展示数量根据 quality_tier（与 workflow.ts getIssueLimit 保持一致）
  const totalCount = uniqueIssues.length;
  const qualityTier = result.quality_tier || 'medium';
  let maxShown: number;
  switch (qualityTier) {
    case 'excellent': maxShown = 2; break;
    case 'strong': maxShown = 4; break;
    case 'medium': maxShown = 6; break;  // 从 7 收紧到 6，与 getIssueLimit 对齐
    case 'weak': maxShown = 10; break;
    default: maxShown = 6;
  }
  // 免费版额外限制
  if (tier === 'free') maxShown = Math.min(maxShown, 7);
  const shownCount = Math.min(maxShown, totalCount);

  result.core_issues = uniqueIssues.slice(0, shownCount);
  result.core_issues_summary = {
    total_count: totalCount,
    shown_count: shownCount,
  };
}

/**
 * 去重 — V5: 语义去雷同（不仅标题完全相同，还检查同维度内的论点重复）
 */
function deduplicateIssues(issues: FreeDiagnoseResponse['core_issues']): FreeDiagnoseResponse['core_issues'] {
  const seenTitles = new Set<string>();
  const uniqueIssues: FreeDiagnoseResponse['core_issues'] = [];

  // 语义相似度：同维度内检查核心论点是否重复
  const SIMILAR_CONCEPT_GROUPS = [
    ['量化', '数据', '数字', '指标', 'KPI', 'ROI', '结果'],
    ['模糊', '笼统', '泛泛', '空洞', '不具体'],
    ['结构', '排版', '格式', '布局', '层次'],
    ['匹配', '贴合', '方向', '对口', '岗位'],
  ];

  const getConceptGroup = (text: string): number => {
    const lower = text.toLowerCase();
    for (let i = 0; i < SIMILAR_CONCEPT_GROUPS.length; i++) {
      const hits = SIMILAR_CONCEPT_GROUPS[i].filter(k => lower.includes(k)).length;
      if (hits >= 2) return i;
    }
    return -1;
  };

  // 记录每个概念组在同一维度下的出现次数
  const dimConceptCount = new Map<string, number>();

  for (const issue of issues) {
    const titleKey = issue.title.toLowerCase().trim();
    if (seenTitles.has(titleKey)) continue;

    // 语义去雷同：同一维度 + 同一概念组 最多 1 个
    const dim = issue.dimension || 'other';
    const conceptText = `${issue.title} ${issue.summary}`;
    const conceptGroup = getConceptGroup(conceptText);
    if (conceptGroup >= 0) {
      const dimConceptKey = `${dim}:${conceptGroup}`;
      const count = dimConceptCount.get(dimConceptKey) || 0;
      if (count >= 1) continue; // 同维度同概念组已有，跳过
      dimConceptCount.set(dimConceptKey, count + 1);
    }

    seenTitles.add(titleKey);
    uniqueIssues.push(issue);
  }

  return uniqueIssues;
}

/**
 * 根据场景调整字段
 */
function adjustFieldsByScenario(result: FreeDiagnoseResponse, input: NormalizedInput): void {
  const { scenario } = result;

  // main_judgment 修正：不允许中性泛句
  const NEUTRAL_PHRASES = [
    '简历诊断分析',
    '岗位匹配表达不清',
    '简历存在优化空间',
    '简历诊断报告',
    '简历分析',
    '你的简历需要优化',
    '简历需要改进',
  ];

  // G. 模板化开头/句式检测 — 覆盖更多固定模式
  const TEMPLATE_OPENINGS = [
    '这份简历有价值',
    '这份简历的基础不错',
    '简历整体还不错',
    '这份简历有基础',
    '这份简历有一定',
    '简历有一定基础',
    '整体来看',
    '总体来说',
    '总的来说',
  ];

  // G2. 固定句式检测 — 与 workflow.ts isMainJudgmentValid 保持同步
  const TEMPLATE_PATTERNS = [
    /^.*缺少?量化.*$/,
    /^.*缺少?成果.*$/,
    /^.*容易被低估.*$/,
    /^.*竞争力不足.*$/,
    /^.*缺乏差异化.*$/,
    /^.*说服力不够.*$/,
    /^.*没有突出.*$/,
    // 旧模板句式（workflow 旧版 synthesizeMainJudgmentFromTopIssue 的遗留）
    /^工作描述缺乏结果证据.*$/,
    /^关键信息缺失，影响整体判断.*$/,
    /^表述方式可能引发可信度质疑.*$/,
    /^简历结构上的.*会让HR难以快速抓住重点$/,
    /^简历与目标岗位的关键能力连接不够直接.*$/,
    /^表达不够精准，削弱了经历的说服力.*$/,
    /^当前最值得优化的是.*$/,
  ];

  const isNeutral = !result.main_judgment?.trim() ||
    NEUTRAL_PHRASES.some(p => result.main_judgment.includes(p));

  // 检测是否以模板化句式开头 或 匹配固定句式模式
  const isTemplateOpening = TEMPLATE_OPENINGS.some(t =>
    result.main_judgment?.startsWith(t)
  ) || TEMPLATE_PATTERNS.some(p => p.test(result.main_judgment || ''));

  if (scenario === 'insufficient_input') {
    if (isNeutral) {
      result.main_judgment = '输入信息不足，无法形成高可信诊断';
    }
    result.core_issues = [];
    result.core_issues_summary = { total_count: 0, shown_count: 0 };
    result.rewrite_examples = [];
    result.rewrite_direction = '';
    // 保留 follow_up_prompts — insufficient_input 可以告诉用户该补什么
  } else if (scenario === 'excellent') {
    // V5: 优秀简历必须明确告知用户
    const score = result.excellent_score || 0;
    if (isNeutral || score >= 90) {
      result.main_judgment = '这是一份优秀简历，没有明显核心问题';
    }
    // 确保有 minor_suggestions
    if (result.minor_suggestions.length === 0) {
      result.minor_suggestions = [{
        title: '亮点强化建议',
        description: '简历整体已经很出色。后续只建议做亮点强化——在最核心的经历中补充一个自己主动推动的改进或成长收获，让好简历更上一层。',
        category: '强化建议',
        priority: 1,
      }];
    }
    // 确保有 priority_actions
    if (result.priority_actions.length === 0) {
      result.priority_actions = [
        { title: '直接投递目标岗位', description: '你的简历已经足够清晰完整，可以直接开始投递。' },
      ];
    }
  } else if (scenario === 'normal') {
    // normal 场景：main_judgment 必须是综合性的帮助式判断
    if (isNeutral) {
      result.main_judgment = synthesizeMainJudgment(result.core_issues, input);
    } else if (isTemplateOpening) {
      // G. 去模板化：如果 AI 用了固定开头/句式，剥掉前缀保留后半段
      const stripped = stripTemplateOpening(result.main_judgment);
      if (stripped) {
        result.main_judgment = stripped;
      } else {
        // 整句都是模板化的，重新合成
        result.main_judgment = synthesizeMainJudgment(result.core_issues, input);
      }
    }
    // 即使 AI 给了 main_judgment，也检查是否审判式
    if (containsHarshTone(result.main_judgment)) {
      result.main_judgment = softenText(result.main_judgment);
    }
    // 限制 main_judgment 长度（24~36 字目标，最多 50 字）
    if (result.main_judgment.length > 50) {
      result.main_judgment = result.main_judgment.substring(0, 48) + '…';
    }
  }
}

/**
 * G. 剥掉模板化开头，保留有信息量的后半段
 * G2. 如果整句都是模板化的（如"缺少量化数据"），返回 null 触发重新合成
 */
function stripTemplateOpening(text: string): string | null {
  const patterns = [
    /^这份简历有价值[，,]但/,
    /^这份简历的基础不错[，,]/,
    /^简历整体还不错[，,]但/,
    /^这份简历有基础[，,]但/,
    /^这份简历有一定[^，,]*[，,]/,
    /^简历有一定基础[，,]/,
    /^整体来看[，,]/,
    /^总体来说[，,]/,
    /^总的来说[，,]/,
  ];
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      const stripped = text.replace(pattern, '').trim();
      // 如果剥掉后内容太短，返回 null 让 synthesize 重新生成
      if (stripped.length < 6) return null;
      return stripped;
    }
  }
  // G2. 检查整句是否是固定套路（如 "缺少量化" "容易被低估"）
  const FULL_TEMPLATE_PATTERNS = [
    /^.*缺少?量化.*$/,
    /^.*缺少?成果.*$/,
    /^.*容易被低估.*$/,
    /^.*竞争力不足.*$/,
    /^.*缺乏差异化.*$/,
  ];
  for (const p of FULL_TEMPLATE_PATTERNS) {
    if (p.test(text) && text.length < 20) {
      return null; // 太短且是套话，触发重新合成
    }
  }
  return null;
}

/**
 * 检查是否包含审判式语气
 */
function containsHarshTone(text: string): boolean {
  if (!text) return false;
  return HARSH_PHRASES.some(p => text.includes(p));
}

/**
 * 从 core_issues 兜底提炼主结论
 * 直接用 top1 的 screening_impact 或 title，不套固定句式模板
 * （workflow 层已用 AI 原始输出或 fallbackMainJudgment 处理，这里只作最后保险）
 */
function synthesizeMainJudgment(
  coreIssues: FreeDiagnoseResponse['core_issues'],
  _input: NormalizedInput
): string {
  if (coreIssues.length === 0) {
    return '部分经历的描述可以更有说服力';
  }

  const top = coreIssues[0];

  // 优先用 screening_impact（最直接描述初筛影响，AI 按 prompt 要求生成）
  if (top.screening_impact && top.screening_impact.trim().length >= 10) {
    const impact = top.screening_impact.trim();
    return impact.length <= 50 ? impact : impact.substring(0, 48) + '…';
  }

  // 其次用 title（已经是结果导向的标题）
  const title = top.title?.trim() || '';
  return title.length <= 50 ? title : title.substring(0, 48) + '…';
}

/**
 * 处理优先动作 — 从真实问题动态推导，1~3 个，不强补
 */
function processPriorityActions(result: FreeDiagnoseResponse): void {
  // 过滤无效动作
  result.priority_actions = result.priority_actions.filter(action =>
    action.title?.trim() && action.description?.trim()
  );

  // 去重
  const seen = new Set<string>();
  result.priority_actions = result.priority_actions.filter(action => {
    const key = action.title.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 限制最多 3 个
  result.priority_actions = result.priority_actions.slice(0, 3);

  // normal 场景下若 AI 没返回有效 priority_actions，从 core_issues 推导
  // 只推导真正有具体建议的，不凑数
  if (result.scenario === 'normal' && result.priority_actions.length === 0 && result.core_issues.length > 0) {
    const derived = result.core_issues
      .filter(issue => issue.suggestion && issue.suggestion.trim().length > 10)
      .slice(0, Math.min(3, result.core_issues.length))
      .map(issue => ({
        title: `优化：${issue.title}`,
        description: issue.suggestion,
      }));

    if (derived.length > 0) {
      result.priority_actions = derived;
    }
    // 如果连具体建议都没有，就不给 priority_actions，宁缺毋滥
  }
}

/**
 * 处理 minor_suggestions
 */
function processMinorSuggestions(result: FreeDiagnoseResponse): void {
  result.minor_suggestions = result.minor_suggestions.filter(s =>
    s.title?.trim() && s.description?.trim()
  );

  // 去重
  const seen = new Set<string>();
  result.minor_suggestions = result.minor_suggestions.filter(s => {
    const key = s.title.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 限制最多 3 条
  result.minor_suggestions = result.minor_suggestions.slice(0, 3);

  // 确保有 category 和 priority
  result.minor_suggestions.forEach((s, i) => {
    if (!s.category) s.category = '优化建议';
    if (typeof s.priority !== 'number') s.priority = i + 1;
  });
}

/**
 * 处理结构化改写示例
 */
function processRewriteExamples(result: FreeDiagnoseResponse): void {
  if (!result.rewrite_examples) {
    result.rewrite_examples = [];
  }

  // 过滤无效的改写示例
  result.rewrite_examples = result.rewrite_examples.filter(ex =>
    ex.original?.trim() && ex.rewritten?.trim() && ex.change_summary?.trim()
  );

  // 检查改写质量：rewritten 不能和 original 过于相似（只是换了一两个词）
  result.rewrite_examples = result.rewrite_examples.filter(ex => {
    const originalClean = ex.original.replace(/\s+/g, '');
    const rewrittenClean = ex.rewritten.replace(/\s+/g, '');

    // 如果清洗后完全一样，丢弃
    if (originalClean === rewrittenClean) return false;

    // 如果长度差异太小且内容高度相似，丢弃（简单启发式）
    const lenDiff = Math.abs(originalClean.length - rewrittenClean.length);
    if (lenDiff < 5 && originalClean.length > 20) {
      // 比较前20个字符，如果都一样大概率是换词
      if (originalClean.substring(0, 20) === rewrittenClean.substring(0, 20)) {
        return false;
      }
    }

    return true;
  });

  // 最多保留 3 对
  result.rewrite_examples = result.rewrite_examples.slice(0, 3);
}

/**
 * 旧版 before/after 兼容处理
 */
function processLegacyBeforeAfter(result: FreeDiagnoseResponse): void {
  const hasBefore = result.before_text?.trim();
  const hasAfter = result.after_text?.trim();

  if (!hasBefore || !hasAfter) {
    result.before_text = '';
    result.after_text = '';
    return;
  }

  // 如果有旧版 before/after 但没有新版 rewrite_examples，转换过来
  if (result.rewrite_examples && result.rewrite_examples.length === 0 && hasBefore && hasAfter) {
    result.rewrite_examples = [{
      original: result.before_text!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
      rewritten: result.after_text!, // eslint-disable-line @typescript-eslint/no-non-null-assertion
      change_summary: result.rewrite_direction || '根据诊断建议进行的改写',
    }];
  }

  // 长度限制
  if (result.before_text && result.before_text.length > 500) {
    result.before_text = result.before_text.substring(0, 500) + '...';
  }
  if (result.after_text && result.after_text.length > 500) {
    result.after_text = result.after_text.substring(0, 500) + '...';
  }
}

/**
 * 处理追问位
 */
function processFollowUpPrompts(result: FreeDiagnoseResponse): void {
  if (!result.follow_up_prompts) {
    result.follow_up_prompts = [];
  }

  // 过滤无效追问
  result.follow_up_prompts = result.follow_up_prompts.filter(p =>
    p.question?.trim() && p.why?.trim()
  );

  // 最多 3 个
  result.follow_up_prompts = result.follow_up_prompts.slice(0, 3);
}

/**
 * 全局语气柔化
 */
function softenAllText(result: FreeDiagnoseResponse): void {
  // main_judgment
  result.main_judgment = softenText(result.main_judgment);

  // core_issues
  result.core_issues.forEach(issue => {
    issue.title = softenText(issue.title);
    issue.summary = softenText(issue.summary);
    issue.insider_view = softenText(issue.insider_view);
    issue.suggestion = softenText(issue.suggestion);
    if (issue.screening_impact) {
      issue.screening_impact = softenText(issue.screening_impact);
    }
  });

  // rewrite_direction
  result.rewrite_direction = softenText(result.rewrite_direction);

  // priority_actions
  result.priority_actions.forEach(action => {
    action.description = softenText(action.description);
  });

  // minor_suggestions
  result.minor_suggestions.forEach(s => {
    s.description = softenText(s.description);
  });
}

/**
 * 处理 metadata
 */
function processMetadata(result: FreeDiagnoseResponse, input: NormalizedInput): void {
  if (!result.metadata.generated_at?.trim()) {
    result.metadata.generated_at = new Date().toISOString();
  }
  result.metadata.target_role = input.target_role;
  result.metadata.has_jd = !!input.jd_text?.trim();
  result.metadata.tier = input.tier;
  result.metadata.jd_quality = input.jd_quality;
  result.metadata.schema_version = '5.0';

  // 截断 rewrite_direction
  if (result.rewrite_direction && result.rewrite_direction.length > 500) {
    result.rewrite_direction = result.rewrite_direction.substring(0, 500) + '...';
  }
}

/**
 * JSON 解析重试
 */
export async function retryJsonParse<T>(
  fetchFn: () => Promise<string>,
  maxRetries: number = 2
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const content = await fetchFn();
      try {
        return JSON.parse(content) as T;
      } catch (parseError) {
        logError('JsonParseRetry', parseError, { attempt, maxRetries });
        lastError = new Error(`JSON 解析失败: ${parseError instanceof Error ? parseError.message : '未知错误'}`);
        if (attempt < maxRetries) continue;
      }
    } catch (fetchError) {
      lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      if (lastError.message.includes('网络') || lastError.message.includes('fetch')) break;
    }
  }

  throw lastError || new Error('JSON 解析失败，已达最大重试次数');
}
