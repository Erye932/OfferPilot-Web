// 免费版诊断工作流 V3 - 主协调模块
// 协调：标准化输入 -> 规则预分析 -> 三库映射 -> AI 候选展开 -> 后端排序收口 -> 后处理

import type {
  DiagnoseRequest,
  FreeDiagnoseResponse,
  NormalizedInput,
  RuleMatchResult,
  IssueEnrichmentResult,
  DiagnoseScenario,
  CoreIssue,
  RewriteExample,
  FollowUpPrompt,
  IssueDimension,
  SourceLocation,
  AuditRow,
  AuditBundle,
} from './types';
import { normalizeInput, InputQualityError } from './normalize';
import { rulePreAnalysis } from './rules';
import { enrichIssues, getEnrichmentStructuredData } from './enrichment';
import { postProcessResponse, retryJsonParse } from './postprocess';
import { logError, logInfo } from '../error-handler';


/**
 * 安全摘要日志 - 避免泄露敏感信息
 */
function logDiagnoseSummary(label: string, data: unknown): void {
  logInfo('DiagnoseSummary', `${label}:`, { summary: summarizeSensitiveData(label, data) });
}

/**
 * 根据标签生成数据摘要，避免泄露敏感信息
 */
function summarizeSensitiveData(label: string, data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') {
    return { _type: typeof data };
  }

  const obj = data as Record<string, unknown>;

  switch (label) {
    case 'normalized_input':
      return {
        resume_sentences_count: Array.isArray(obj.resume_sentences) ? obj.resume_sentences.length : 0,
        resume_paragraphs_count: Array.isArray(obj.resume_paragraphs) ? obj.resume_paragraphs.length : 0,
        jd_quality: obj.jd_quality,
        has_jd: obj.jd_quality !== 'none',
        target_role: obj.target_role,
        tier: obj.tier,
        text_quality: obj.text_quality,
      };

    case 'rule_match_result':
      return {
        total_matched: obj.total_matched || 0,
        matches_count: Array.isArray(obj.matches) ? obj.matches.length : 0,
        matched_issue_types: Array.isArray(obj.matches)
          ? [...new Set(obj.matches.map((m: any) => m.issue_type))].slice(0, 5)
          : [],
      };

    case 'issue_enrichment_result':
      return {
        enrichments_count: Array.isArray(obj.enrichments) ? obj.enrichments.length : 0,
        enriched_issue_types: Array.isArray(obj.enrichments)
          ? [...new Set(obj.enrichments.map((e: any) => e.issue_type))].slice(0, 5)
          : [],
      };

    case 'ai_response_raw':
      return {
        scenario: obj.scenario,
        candidate_issues_count: Array.isArray(obj.candidate_issues) ? obj.candidate_issues.length : 0,
        excellent_score: obj.excellent_score,
        has_rewrite_examples: Array.isArray(obj.rewrite_examples) && obj.rewrite_examples.length > 0,
        minor_suggestions_count: Array.isArray(obj.minor_suggestions) ? obj.minor_suggestions.length : 0,
      };

    case 'final_response':
      return {
        scenario: obj.scenario,
        core_issues_count: Array.isArray(obj.core_issues) ? obj.core_issues.length : 0,
        main_judgment_length: typeof obj.main_judgment === 'string' ? obj.main_judgment.length : 0,
        priority_actions_count: Array.isArray(obj.priority_actions) ? obj.priority_actions.length : 0,
        minor_suggestions_count: Array.isArray(obj.minor_suggestions) ? obj.minor_suggestions.length : 0,
        metadata: obj.metadata ? {
          target_role: (obj.metadata as any).target_role,
          has_jd: (obj.metadata as any).has_jd,
          jd_quality: (obj.metadata as any).jd_quality,
          tier: (obj.metadata as any).tier,
        } : undefined,
      };

    default:
      return {
        _label: label,
        _keys: Object.keys(obj),
        _type: 'object',
      };
  }
}

// ─── AI 原始响应类型（候选宽输出） ────────────────────────────
interface AICandidateIssue {
  title: string;
  summary: string;
  evidence: string;
  insider_view: string;
  suggestion: string;
  follow_up_question: string;
  screening_impact: string;
  is_structural: boolean;
  jd_relevance: 'high' | 'medium' | 'low' | 'none';
  dimension?: IssueDimension;
  rewrite_examples?: RewriteExample[];
}

interface AIRawResponse {
  scenario: DiagnoseScenario;
  main_judgment: string;
  candidate_issues: AICandidateIssue[];
  rewrite_examples?: RewriteExample[];
  minor_suggestions: { title: string; description: string; category?: string }[];
  follow_up_prompts?: FollowUpPrompt[];
  excellence_insight?: string;
  rewrite_direction?: string;
  // V5: AI 自评的简历质量分 (0~100)
  excellent_score?: number;
}

/**
 * 从问题内容推断维度（fallback，当 AI 未返回 dimension 时使用）
 */
function inferDimension(issue: AICandidateIssue): IssueDimension {
  const text = `${issue.title} ${issue.summary} ${issue.suggestion}`.toLowerCase();

  if (/结构|排版|格式|布局|顺序|层次|分段|模块/.test(text)) return 'structure';
  if (/匹配|岗位|jd|职位|贴合|方向|对口/.test(text)) return 'role_fit';
  if (/数据|结果|成果|量化|指标|业绩|kpi|roi/.test(text)) return 'evidence';
  if (/可信|夸大|模糊|泛泛|笼统|ai味|模板|套话/.test(text)) return 'credibility';
  if (/表达|措辞|语言|用词|描述|写法/.test(text)) return 'expression';
  if (/缺少|缺失|没有提|未提及|遗漏/.test(text)) return 'missing_info';

  return 'other';
}

/**
 * 根据简历质量确定问题数量上限
 * - weak: 6~10 个
 * - medium: 4~6 个（收紧，原为 4~7，避免中等简历被过度轰炸）
 * - strong: 2~4 个
 * - excellent: 0~2 个强化建议
 */
function getIssueLimit(qualityTier: 'excellent' | 'strong' | 'medium' | 'weak'): { min: number; max: number } {
  switch (qualityTier) {
    case 'excellent': return { min: 0, max: 2 };
    case 'strong': return { min: 2, max: 4 };
    case 'medium': return { min: 4, max: 6 };
    case 'weak': return { min: 6, max: 10 };
  }
}

/**
 * 从 excellent_score 推断质量等级
 * 阈值设计：
 * - 90+: excellent（0~2 个建议）
 * - 72+: strong（2~4 个问题）
 * - 50+: medium（4~6 个问题，不再是 4~7，收紧上限）
 * - <50: weak（6~10 个问题）
 * 原 45 阈值过低，AI 给 50 分（"感觉还行"）会被判定 medium 输出最多 7 个问题
 * 调整到 50 后，只有 AI 认为真正中等偏差的简历才进 medium
 */
function scoreToQualityTier(score: number): 'excellent' | 'strong' | 'medium' | 'weak' {
  if (score >= 90) return 'excellent';
  if (score >= 72) return 'strong';
  if (score >= 50) return 'medium';
  return 'weak';
}

/**
 * 为 issue 匹配 source_location（在简历段落中定位证据）
 * V5.1: 优先使用 resume_sections 进行类型感知匹配
 */
function matchSourceLocation(evidence: string, input: NormalizedInput): SourceLocation | undefined {
  if (!evidence || evidence === '未提供具体证据') return undefined;
  const snippet = evidence.substring(0, 80);

  // 多级匹配：长片段 → 短片段 → 极短片段
  const matchLengths = [40, 25, 15];

  for (const len of matchLengths) {
    const probe = snippet.substring(0, Math.min(len, snippet.length));
    if (probe.length < 5) continue;

    for (let pi = 0; pi < input.resume_paragraphs.length; pi++) {
      if (input.resume_paragraphs[pi].includes(probe)) {
        // 进一步定位句子索引
        const para = input.resume_paragraphs[pi];
        const sentences = para.split(/[。；\.\n]/).filter(s => s.trim().length > 0);
        let sentenceIndex: number | undefined;
        for (let si = 0; si < sentences.length; si++) {
          if (sentences[si].includes(probe.substring(0, Math.min(10, probe.length)))) {
            sentenceIndex = si;
            break;
          }
        }
        return { paragraph_index: pi, sentence_index: sentenceIndex, text_snippet: snippet };
      }
    }
  }

  return { text_snippet: snippet };
}

// ─── FMEA 风险评分 ────────────────────────────────────────────────
// Phase 3: 基于 severity × probability × impact_surface 的统一风险分数
// 用于：core_issues 排序可解释化，problem_pool 统一排序

type SeverityLevel = 'must_fix' | 'should_fix' | 'optional' | 'nitpicky';
type ProbabilityLevel = 'high' | 'medium' | 'low' | 'very_low';
type ImpactLevel = 'ats' | 'hr_6s' | 'hr_30s' | 'interview' | 'combined';

/** 从淘汰风险分推断严重程度 */
function eliminationRiskToSeverity(eliminationRisk: number): SeverityLevel {
  if (eliminationRisk >= 70) return 'must_fix';
  if (eliminationRisk >= 50) return 'should_fix';
  if (eliminationRisk >= 30) return 'optional';
  return 'nitpicky';
}

/** 从证据强度推断发生概率 */
function evidenceStrengthToProbability(strength: 'strong' | 'medium' | 'weak'): ProbabilityLevel {
  if (strength === 'strong') return 'high';
  if (strength === 'medium') return 'medium';
  return 'low';
}

/** 从 dimension 推断影响面 */
function dimensionToImpactSurface(dimension: IssueDimension): ImpactLevel {
  switch (dimension) {
    case 'role_fit': return 'hr_30s';
    case 'evidence': return 'hr_30s';
    case 'credibility': return 'ats';
    case 'structure': return 'ats';
    case 'missing_info': return 'hr_6s';
    case 'expression': return 'interview';
    default: return 'combined';
  }
}

// FMEA 各因子分值表
const SEVERITY_SCORES: Record<SeverityLevel, number> = {
  must_fix: 4,
  should_fix: 3,
  optional: 2,
  nitpicky: 1,
};

const PROBABILITY_SCORES: Record<ProbabilityLevel, number> = {
  high: 4,
  medium: 3,
  low: 2,
  very_low: 1,
};

const IMPACT_SCORES: Record<ImpactLevel, number> = {
  combined: 4,
  interview: 3,
  hr_30s: 3,
  hr_6s: 2,
  ats: 2,
};

/**
 * 计算 FMEA 风险优先级分数（RPN = Severity × Probability × Impact）
 * 分数范围 1~64，用于问题排序的可解释参考
 */
function computeFmeaScore(
  eliminationRisk: number,
  dimension: IssueDimension,
  evidenceStrength: 'strong' | 'medium' | 'weak'
): number {
  const severity = eliminationRiskToSeverity(eliminationRisk);
  const probability = evidenceStrengthToProbability(evidenceStrength);
  const impact = dimensionToImpactSurface(dimension);

  return (
    SEVERITY_SCORES[severity] *
    PROBABILITY_SCORES[probability] *
    IMPACT_SCORES[impact]
  );
}

/**
 * 后端排序：从候选问题中选出最终核心问题并排序
 * V5: 动态问题数量 + 语义去雷同 + source_location
 * V6 (Phase 3): FMEA 风险分数参与排序决策
 */
function rankAndSelectIssues(
  candidates: AICandidateIssue[],
  normalizedInput: NormalizedInput,
  ruleMatchResult: RuleMatchResult,
  qualityTier: 'excellent' | 'strong' | 'medium' | 'weak'
): CoreIssue[] {
  // 过滤掉标记为优化类的问题（标题以"[优化] "开头）
  const filteredCandidates = candidates.filter(c => !c.title.startsWith('[优化] '));
  if (filteredCandidates.length === 0) return [];

  // 检查简历是否包含模拟/沙盘语境
  const simKeywords = ['模拟', '沙盘', '企业模拟', '课程项目', '竞赛', '实训', 'ERP'];
  const hasSimulationContext = simKeywords.some(k => normalizedInput.resume_text.includes(k));

  // 判断问题是否属于"角色头衔可能被误读为真实工作经历"类型
  const isRoleTitleMisinterpretationIssue = (issue: AICandidateIssue): boolean => {
    const text = `${issue.title} ${issue.summary} ${issue.suggestion}`.toLowerCase();
    // 关键词匹配：头衔、角色、职位、误读、误解、真实工作、工作经历
    const roleTitleKeywords = ['头衔', '角色', '职位', '职务', 'title', 'role'];
    const misinterpretationKeywords = ['误读', '误解', '误会', '混淆', '当作', '当成', '真实工作', '工作经历', '实际工作'];
    const hasRoleTitle = roleTitleKeywords.some(k => text.includes(k));
    const hasMisinterpretation = misinterpretationKeywords.some(k => text.includes(k));
    return hasRoleTitle && hasMisinterpretation;
  };

  const hasJd = normalizedInput.jd_quality !== 'none';
  const issueLimit = getIssueLimit(qualityTier);

  // 三层裁决计算：淘汰风险 > 显眼度 > 一眼可见度
  const evaluated = filteredCandidates.map((c) => {
    const dimension = c.dimension || inferDimension(c);

    // 1. 淘汰风险 (elimination risk) - 主要排序指标
    // 采用加法基础分 + 乘法加成结构，避免任一因子为0时整体归零

    // 1.1 维度基础分（每个问题都有非零起点）
    const dimensionBaseScores: Record<IssueDimension, number> = {
      role_fit: 45,      // 岗位匹配问题最可能被淘汰
      credibility: 40,   // 可信度问题直接影响筛选
      evidence: 35,      // 证据缺失影响可信度
      structure: 30,     // 结构问题影响可读性
      missing_info: 25,
      expression: 15,    // 表达问题相对较轻
      other: 20,
    };
    const baseScore = dimensionBaseScores[dimension] ?? 20;

    // 1.2 结构性问题加成
    const structuralBonus = c.is_structural ? 15 : 0;

    // 1.3 岗位级别匹配度加成
    let levelBonus = 0;
    if (hasJd && normalizedInput.experience_level !== 'neutral') {
      const jdText = normalizedInput.jd_text.toLowerCase();
      const requiresSenior = /高级|资深|senior|lead|主管|经理|总监|专家|3年以上|5年以上/.test(jdText);
      const requiresJunior = /初级|助理|实习生|junior|entry|应届|毕业生|1年以下/.test(jdText);

      if (requiresSenior && normalizedInput.experience_level === 'junior') {
        levelBonus = 10; // 资历不足，淘汰风险增加
      } else if (requiresJunior && normalizedInput.experience_level === 'senior') {
        levelBonus = -5; // 资历过高，风险稍低
      }
    }

    // 1.4 证据缺失加成
    const evidenceMissingBonus = (c.evidence && (c.evidence.includes('未提供') || c.evidence.length < 10)) ? 8 : 0;

    // 1.5 淘汰关键词命中加成（不再是唯一决定因子）
    // 扩大关键词范围，覆盖 AI 更自然的表达方式
    const impactKeywords = [
      '淘汰', '直接筛掉', '不会往下看', '第一轮', '初筛', '一眼', '秒拒',
      '跳过', '放弃', '筛掉', '被拒', '不通过', '不合格', '不匹配',
      '看不出', '无法判断', '难以评估', '缺乏说服力', '不够清晰',
    ];
    const impactText = (c.screening_impact || '') + (c.insider_view || '');
    const impactHits = impactKeywords.filter(k => impactText.includes(k)).length;
    const impactBonus = Math.min(impactHits * 8, 20); // 上限20分，不再是决定性因子

    // 1.6 JD相关度加成
    let jdRelevanceBonus = 0;
    if (hasJd) {
      if (c.jd_relevance === 'high') jdRelevanceBonus = 12;
      else if (c.jd_relevance === 'medium') jdRelevanceBonus = 6;
      else if (c.jd_relevance === 'low') jdRelevanceBonus = 2;
    }

    // 计算淘汰风险分数（加法模型，0-100范围）
    const eliminationRisk = Math.min(
      100,
      baseScore + structuralBonus + levelBonus + evidenceMissingBonus + impactBonus + jdRelevanceBonus
    );

    // 2. 显眼度 (salience) - 次要排序指标
    // 2.1 标题长度（短标题更显眼）
    const titleLength = c.title.length;
    const titleSalience = Math.max(0, 50 - titleLength) / 50 * 30; // 0-30分

    // 2.2 是否结构性问题
    const structuralSalience = c.is_structural ? 30 : 0;

    // 2.3 证据质量（有具体证据更显眼）
    let evidenceSalience = 0;
    if (c.evidence && c.evidence.length > 10 && !c.evidence.includes('未提供')) {
      evidenceSalience = 20;
    } else if (c.evidence && c.evidence.length > 0) {
      evidenceSalience = 5;
    }

    // 2.4 规则预分析交叉验证
    // 用 issue_type 做语义映射匹配，而非字符串包含（issue_name 是动态生成的结果导向标题，不适合直接比对）
    const ruleIssueTypeToKeywords: Record<string, string[]> = {
      'lack_of_result_evidence': ['结果', '成果', '证据', '贡献', '产出', '量化'],
      'keyword_alignment_weak': ['关键词', '匹配', '岗位', '连接', '对齐'],
      'weak_role_boundary': ['角色', '边界', '主导', '参与', '贡献', '配合'],
      'jd_direction_mismatch': ['方向', '偏差', '匹配', '聚焦', '岗位'],
      'overclaim_risk': ['追问', '风险', '可信', '支撑', '夸大'],
    };
    const issueText = `${c.title} ${c.summary}`.toLowerCase();
    const ruleBoost = ruleMatchResult.matches.some(m => {
      const keywords = ruleIssueTypeToKeywords[m.issue_type] || [];
      return keywords.some(kw => issueText.includes(kw));
    });
    const ruleSalience = ruleBoost ? 20 : 0;

    const salience = Math.min(100, titleSalience + structuralSalience + evidenceSalience + ruleSalience);

    // 3. 一眼可见度 (glance visibility) - 第三排序指标
    // 3.1 证据位置（如果有具体段落索引）
    const sourceLocation = matchSourceLocation(c.evidence, normalizedInput);
    const locationVisibility = sourceLocation?.paragraph_index !== undefined ? 40 : 0;

    // 3.2 问题描述长度（短描述更易读）
    const summaryLength = c.summary.length;
    const summaryVisibility = Math.max(0, 100 - summaryLength) / 100 * 30;

    // 3.3 是否有改写示例
    const rewriteVisibility = c.rewrite_examples && c.rewrite_examples.length > 0 ? 30 : 0;

    const glanceVisibility = Math.min(100, locationVisibility + summaryVisibility + rewriteVisibility);

    // 4. FMEA 风险分数（Phase 3 新增）
    // 证据强度由 evidence.length 推断
    let evidenceStrength: 'strong' | 'medium' | 'weak' = 'medium';
    if (c.evidence && c.evidence.length > 10 && !c.evidence.includes('未提供')) {
      evidenceStrength = 'strong';
    } else if (!c.evidence || c.evidence.includes('未提供') || c.evidence.length < 5) {
      evidenceStrength = 'weak';
    }
    const fmeaScore = computeFmeaScore(eliminationRisk, dimension, evidenceStrength);
    const severity = eliminationRiskToSeverity(eliminationRisk);
    const probability = evidenceStrengthToProbability(evidenceStrength);
    const impactSurface = dimensionToImpactSurface(dimension);

    return {
      issue: c,
      eliminationRisk,
      salience,
      glanceVisibility,
      dimension,
      fmeaScore,
      severity,
      probability,
      impactSurface,
    };
  });

  // 四层裁决排序（Phase 3：FMEA 分数作为第一排序键）
  evaluated.sort((a, b) => {
    // 第一级：FMEA 风险分数（降序）— Phase 3 优先
    if (Math.abs(a.fmeaScore - b.fmeaScore) >= 2) {
      return b.fmeaScore - a.fmeaScore;
    }
    // 第二级：淘汰风险（降序）
    if (Math.abs(a.eliminationRisk - b.eliminationRisk) > 5) {
      return b.eliminationRisk - a.eliminationRisk;
    }
    // 淘汰风险接近（差距≤5分），第三级：显眼度（降序）
    if (Math.abs(a.salience - b.salience) > 5) {
      return b.salience - a.salience;
    }
    // 显眼度也接近，第四级：一眼可见度（降序）
    return b.glanceVisibility - a.glanceVisibility;
  });

  // 语义去雷同 — 同一维度内检查 title+summary 语义相似度
  const isSemanticallyDuplicate = (a: AICandidateIssue, b: AICandidateIssue): boolean => {
    const aText = `${a.title} ${a.summary}`.toLowerCase();
    const bText = `${b.title} ${b.summary}`.toLowerCase();
    // 关键词重叠检测
    const stopWords = new Set(['的', '了', '和', '与', '及', '或', '在', '是', '有', '对', '为', '从', '而', '但', '且', '也', '就', '又', '还', '再', '更', '很', '最', '太', '非常', '十分', '一些', '一点', '一个', '一种']);

    const extractKeywords = (text: string): Set<string> => {
      const words = text
        .replace(/[，。、；：！？]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2 && !stopWords.has(w));
      return new Set(words);
    };

    const aWords = extractKeywords(aText);
    const bWords = extractKeywords(bText);

    if (aWords.size === 0 || bWords.size === 0) return false;

    let overlap = 0;
    aWords.forEach(w => { if (bWords.has(w)) overlap++; });
    const overlapRate = overlap / Math.min(aWords.size, bWords.size);

    // 如果重叠率超过50%，或者标题完全相同（去除停用词后）
    if (overlapRate > 0.5) return true;

    // 额外检查：如果标题核心部分相似（去除常见前缀/后缀）
    const normalizeTitle = (title: string): string => {
      return title
        .toLowerCase()
        .replace(/[，。、；：！？]/g, '')
        .replace(/问题|建议|不足|缺失|缺乏|不够|缺少/g, '')
        .trim();
    };

    const aTitleNorm = normalizeTitle(a.title);
    const bTitleNorm = normalizeTitle(b.title);

    // 如果归一化后的标题相似度很高
    if (aTitleNorm === bTitleNorm && aTitleNorm.length >= 4) return true;

    // 检查归一化后的标题是否有包含关系
    if (aTitleNorm.includes(bTitleNorm) && bTitleNorm.length >= 4) return true;
    if (bTitleNorm.includes(aTitleNorm) && aTitleNorm.length >= 4) return true;

    return false;
  };

  // 放松维度多样性约束：不再强制覆盖多个维度
  const selected: typeof evaluated = [];
  for (const evalItem of evaluated) {
    // 语义去雷同检查
    const isDuplicate = selected.some(existing =>
      isSemanticallyDuplicate(evalItem.issue, existing.issue)
    );
    if (isDuplicate) continue;

    // 格式类问题（expression维度）默认不进核心问题栏，除非严重影响可读性
    if (evalItem.dimension === 'expression' && !evalItem.issue.is_structural && evalItem.eliminationRisk < 30) {
      continue; // 跳过低淘汰风险的表达问题
    }

    // 模拟语境已明确时，跳过"角色头衔可能被误读为真实工作经历"类问题
    if (hasSimulationContext && isRoleTitleMisinterpretationIssue(evalItem.issue)) {
      continue; // 该类问题降级到minor_suggestions
    }

    selected.push(evalItem);
    if (selected.length >= issueLimit.max) break;
  }

  // 如果数量不足 min，从剩余补充（跳过语义重复）
  if (selected.length < issueLimit.min) {
    for (const evalItem of evaluated) {
      if (selected.includes(evalItem)) continue;
      const isDuplicate = selected.some(existing =>
        isSemanticallyDuplicate(evalItem.issue, existing.issue)
      );
      if (isDuplicate) continue;

      // 模拟语境已明确时，跳过"角色头衔可能被误读为真实工作经历"类问题
      if (hasSimulationContext && isRoleTitleMisinterpretationIssue(evalItem.issue)) {
        continue; // 该类问题降级到minor_suggestions
      }

      selected.push(evalItem);
      if (selected.length >= issueLimit.max) break;
    }
  }

  return selected.map((item, idx) => ({
    title: item.issue.title,
    summary: item.issue.summary,
    evidence: item.issue.evidence,
    insider_view: item.issue.insider_view,
    suggestion: item.issue.suggestion,
    follow_up_question: item.issue.follow_up_question,
    priority: idx + 1,
    screening_impact: item.issue.screening_impact,
    is_structural: item.issue.is_structural,
    jd_relevance: item.issue.jd_relevance,
    dimension: item.issue.dimension || inferDimension(item.issue),
    rewrite_examples: item.issue.rewrite_examples,
    source_location: matchSourceLocation(item.issue.evidence, normalizedInput),
  }));
}

/**
 * 校验 AI 输出的 main_judgment 是否合规
 * 返回 true 表示 AI 输出可以直接使用
 */
function isMainJudgmentValid(judgment: string): boolean {
  if (!judgment || judgment.trim().length < 10) return false;

  // 禁止词：prompt 里明确列出的模板化开头/句式
  const bannedPhrases = [
    '这份简历有价值', '基础不错', '整体还不错', '有一定基础',
    '缺量化', '缺成果', '容易被低估', '竞争力不足',
    '这是一份', // 过于泛化的开头
    '工作描述缺乏结果证据，看不出实际价值', // 旧模板残留
    '关键信息缺失，影响整体判断',             // 旧模板残留
    '表述方式可能引发可信度质疑',             // 旧模板残留
  ];

  return !bannedPhrases.some(phrase => judgment.includes(phrase));
}

/**
 * 从 top1 issue 合成兜底主结论（仅在 AI 输出不合规时使用）
 * 直接使用 top1 的 screening_impact 或 title，不套固定句式模板
 */
function fallbackMainJudgment(topIssue: CoreIssue): string {
  // 优先用 screening_impact（更直接描述初筛影响）
  if (topIssue.screening_impact && topIssue.screening_impact.trim().length >= 10) {
    const impact = topIssue.screening_impact.trim();
    // 长度控制到 50 字以内（与后处理统一）
    return impact.length <= 50 ? impact : impact.substring(0, 48) + '…';
  }

  // 其次用 title（已经是结果导向的）
  const title = topIssue.title.trim();
  return title.length <= 50 ? title : title.substring(0, 48) + '…';
}

/**
 * 识别优化类问题，分流到 minor_suggestions
 */
function identifyMinorIssues(
  candidates: AICandidateIssue[]
): { title: string; description: string; category?: string }[] {
  if (candidates.length === 0) return [];

  const minorIssues: { title: string; description: string; category?: string }[] = [];

  // 优化类问题特征
  const optimizationPatterns = [
    /格式|排版|字体|间距|对齐|缩进|空行/i,
    /标点|符号|错别字|错字|别字/i,
    /大小写|全角|半角|中英文混合/i,
    /重复|冗余|啰嗦|冗长|重复表达/i,
    /建议|可以|考虑|推荐|试试/i,
  ];

  // 语气特征：鼓励性而非指出问题
  const encouragementPatterns = [
    /如果.*更|可以.*更|建议.*更|不妨.*更/i,
    /已经.*不错|已经.*很好|已经.*清晰/i,
    /可以尝试|可以探索|可以试试/i,
  ];

  for (const candidate of candidates) {
    const text = `${candidate.title} ${candidate.summary} ${candidate.suggestion}`.toLowerCase();
    const dim = candidate.dimension || inferDimension(candidate);

    // 判断是否为优化类问题
    let isMinor = false;

    // 0. 标题标记为优化类（如"[优化] "开头）
    if (candidate.title.startsWith('[优化] ')) {
      isMinor = true;
    }

    // 1. 表达类维度且非结构性
    if (dim === 'expression' && !candidate.is_structural) {
      isMinor = true;
    }

    // 2. 匹配优化模式
    if (optimizationPatterns.some(p => p.test(text))) {
      isMinor = true;
    }

    // 3. 鼓励性语气
    if (encouragementPatterns.some(p => p.test(text))) {
      isMinor = true;
    }

    // 4. 证据质量低且非核心问题
    const evidenceWeak = !candidate.evidence || candidate.evidence.includes('未提供') || candidate.evidence.length < 10;
    if (evidenceWeak && dim !== 'role_fit' && !candidate.is_structural) {
      isMinor = true;
    }

    if (isMinor) {
      // 转换为鼓励性描述
      let description = candidate.suggestion;
      if (description.includes('应该') || description.includes('必须') || description.includes('需要')) {
        // 软化语气
        description = description.replace(/应该/g, '可以尝试');
        description = description.replace(/必须/g, '建议');
        description = description.replace(/需要/g, '可以考虑');
      }

      // 避免重复添加前缀：如果标题已以优化相关前缀开头，直接使用
      let finalTitle = candidate.title;
      if (!finalTitle.startsWith('优化：') && !finalTitle.startsWith('[优化] ')) {
        finalTitle = `优化：${finalTitle}`;
      }

      minorIssues.push({
        title: finalTitle,
        description,
        category: '优化建议',
      });
    }

    if (minorIssues.length >= 3) break;
  }

  return minorIssues;
}

/**
 * 工作流正式裁决场景（scenario）
 * V5: excellent_score >= 90 强制进入优秀分支
 */
function determineWorkflowScenario(
  normalizedInput: NormalizedInput,
  ruleMatchResult: RuleMatchResult,
  aiResponse?: AIRawResponse
): { scenario: DiagnoseScenario; qualityTier: 'excellent' | 'strong' | 'medium' | 'weak'; excellentScore: number } {
  const resumeSentenceCount = normalizedInput.resume_sentences.length;
  const resumeTextLength = normalizedInput.resume_text.length;

  if (resumeSentenceCount < 3 || resumeTextLength < 100) {
    return { scenario: 'insufficient_input', qualityTier: 'weak', excellentScore: 0 };
  }

  if (aiResponse) {
    const aiScenario = aiResponse.scenario;
    const candidates = aiResponse.candidate_issues || [];
    const totalMatched = ruleMatchResult.total_matched;
    const excellentScore = aiResponse.excellent_score ?? 0;
    const qualityTier = scoreToQualityTier(excellentScore);

    if (aiScenario === 'insufficient_input') {
      return { scenario: 'insufficient_input', qualityTier: 'weak', excellentScore: 0 };
    }

    // V5: excellent_score >= 90 强制进入优秀简历分支
    if (excellentScore >= 90) {
      return { scenario: 'excellent', qualityTier: 'excellent', excellentScore };
    }

    // excellent: AI 认为优秀 + 候选问题为空或极少 + 规则匹配也很少
    if (aiScenario === 'excellent' && candidates.length <= 1 && totalMatched <= 1) {
      return { scenario: 'excellent', qualityTier, excellentScore };
    }

    // 即使 AI 没说 excellent，如果真没问题也是 excellent
    if (candidates.length === 0 && totalMatched === 0) {
      return { scenario: 'excellent', qualityTier, excellentScore: Math.max(excellentScore, 85) };
    }

    return { scenario: 'normal', qualityTier, excellentScore };
  }

  return { scenario: 'normal', qualityTier: 'medium', excellentScore: 50 };
}

/**
 * 从证据字符串中定位句子索引
 */
function findSentenceIndex(content: string, probe: string): number | undefined {
  const sentences = content.split(/[。；\.\n]/).filter(s => s.trim().length > 0);
  const shortProbe = probe.substring(0, Math.min(10, probe.length));
  for (let si = 0; si < sentences.length; si++) {
    if (sentences[si].includes(shortProbe)) return si;
  }
  return undefined;
}

/**
 * 构建 AuditRow 的 source_location
 */
function buildSourceLocation(
  section: { type: string; content: string; paragraph_index: number },
  evidence: string[]
): AuditRow['source_location'] {
  const base: SourceLocation = { paragraph_index: section.paragraph_index };
  if (evidence.length > 0) {
    const si = findSentenceIndex(section.content, evidence[0]);
    if (si !== undefined) base.sentence_index = si;
    base.text_snippet = evidence[0].substring(0, 80);
  }
  return base;
}

// ─── Coverage Matrix（最小覆盖矩阵） ──────────────────────────────────────
// 最小 Coverage Matrix：
//   experience × result_evidence
//   experience × role_boundary
//   project × result_evidence
//   skills × evidence
//   self_summary × credibility
//   education × keyword_match

interface CoverageCell {
  section: string;
  dimension: string;
}

/** 最小覆盖矩阵的定义 */
const COVERAGE_MATRIX: CoverageCell[] = [
  { section: 'work_experience', dimension: 'evidence' },
  { section: 'work_experience', dimension: 'role_fit' },
  { section: 'project', dimension: 'evidence' },
  { section: 'skill', dimension: 'evidence' },
  { section: 'self_evaluation', dimension: 'credibility' },
  { section: 'education', dimension: 'role_fit' },
];

/**
 * 判断证据强度（基于文本特征）
 */
function assessEvidenceStrength(text: string): 'strong' | 'medium' | 'weak' {
  if (!text || text.trim().length < 10) return 'weak';
  // 强证据：包含量化数据
  if (/[\d]+%|[一二三123]+[万千万百亿]|[0-9]+[年月日]/.test(text)) return 'strong';
  // 中等证据：有具体描述但无数据
  if (text.trim().length > 30) return 'medium';
  return 'weak';
}

/**
 * 判断是否有角色边界问题（强词 + 缺少具体支撑）
 */
function hasRoleBoundaryIssue(section: { type: string; content: string }): boolean {
  const strongWords = ['主导', '负责', '带领', '管理', '创建', '发起', '独立完成'];
  const hasStrongWord = strongWords.some(w => section.content.includes(w));
  if (!hasStrongWord) return false;
  // 检查是否有具体数据/结果支撑
  const hasData = /[\d]+|完成了|实现了|获得了|提升了/.test(section.content);
  return !hasData;
}

/**
 * 判断是否有可信度问题（AI味/模板/夸大）
 */
function hasCredibilityIssue(text: string): boolean {
  const aiPatterns = [
    '具有较强的', '良好的', '优秀的', '出色的', '扎实的',
    '能够独立', '熟练掌握', '深入了解', '良好的沟通',
    '团队合作', '学习能力', '积极主动',
  ];
  const vaguePatterns = ['等等', '相关', '若干', '一定程度'];
  const aiHit = aiPatterns.filter(p => text.includes(p)).length;
  const vagueHit = vaguePatterns.filter(p => text.includes(p)).length;
  return aiHit >= 2 || vagueHit >= 2;
}

/**
 * 检查 section 内容是否"空洞"（缺少具体信息）
 */
function isSectionEmpty(section: { type: string; content: string }): boolean {
  if (section.type === 'education') {
    // 教育经历：学校+专业+时间 基本及格
    const hasSchool = /大学|学院|学校|研究生|本科|硕士|博士/.test(section.content);
    return !hasSchool;
  }
  if (section.type === 'skill') {
    // 技能：列表形式，基本及格
    return section.content.trim().length < 5;
  }
  return section.content.trim().length < 15;
}

/**
 * 从段落中提取证据片段
 */
function extractEvidenceSnippets(content: string, dimension: string): string[] {
  const snippets: string[] = [];

  if (dimension === 'evidence') {
    // 提取有量化数据的句子
    const sentences = content.split(/[。；\n]/);
    for (const s of sentences) {
      if (/[\d]+%|[0-9]+[万千万百亿]/.test(s) && s.trim().length > 5) {
        snippets.push(s.trim());
      }
    }
    // 如果没有量化句子，取最短的非空白句子
    if (snippets.length === 0) {
      const nonEmpty = sentences.filter(s => s.trim().length > 5);
      if (nonEmpty.length > 0) {
        snippets.push(nonEmpty[0].trim());
      }
    }
  }

  if (dimension === 'credibility') {
    // 提取可能的AI味句子
    const aiPatterns = [
      '具有较强的', '良好的', '优秀的', '出色的', '扎实的',
      '能够独立', '熟练掌握', '深入了解',
    ];
    const sentences = content.split(/[。；\n]/);
    for (const s of sentences) {
      if (aiPatterns.some(p => s.includes(p))) {
        snippets.push(s.trim());
      }
    }
  }

  return snippets.slice(0, 3);
}

/**
 * 运行覆盖矩阵扫描，生成 AuditRow[]
 * 这是在 AI 调用前对简历进行结构化"体检"
 */
function runCoverageScan(input: NormalizedInput): AuditBundle {
  const rows: AuditRow[] = [];

  for (const cell of COVERAGE_MATRIX) {
    // 找到对应的简历段落
    const sections = input.resume_sections.filter(s => s.type === cell.section);

    if (sections.length === 0) {
      // 该 section 不存在 → missing_info
      const titleMap: Record<string, string> = {
        'work_experience|evidence': '工作经历缺少结果证据',
        'work_experience|role_fit': '工作经历缺少岗位方向说明',
        'project|evidence': '项目经历缺少量化成果',
        'skill|evidence': '技能描述缺少具体应用证据',
        'self_evaluation|credibility': '自我评价缺少可信证据',
        'education|role_fit': '教育背景缺少与目标岗位的关联说明',
      };
      const key = `${cell.section}|${cell.dimension}`;
      rows.push({
        section: cell.section,
        dimension: cell.dimension,
        status: 'missing_info',
        title: titleMap[key] || `${cell.section} 的 ${cell.dimension} 问题`,
        evidence: [],
        evidence_strength: 'weak',
        why_it_hurts: '该 section 不存在，无法评估',
      });
      continue;
    }

    // 对每个匹配到的 section 进行检查
    for (const section of sections) {
      if (isSectionEmpty(section)) {
        rows.push({
          section: section.type,
          dimension: cell.dimension,
          status: 'missing_info',
          title: `${section.type} 内容过少，无法评估 ${cell.dimension}`,
          evidence: [],
          evidence_strength: 'weak',
          source_location: { paragraph_index: section.paragraph_index },
        });
        continue;
      }

      let status: AuditRow['status'] = 'ok';
      const evidences: string[] = [];

      if (cell.dimension === 'evidence') {
        const snippets = extractEvidenceSnippets(section.content, 'evidence');
        const strength = assessEvidenceStrength(section.content);
        if (strength === 'weak') {
          status = 'issue';
          evidences.push(...snippets);
        } else {
          evidences.push(...snippets);
        }
        rows.push({
          section: section.type,
          dimension: cell.dimension,
          status,
          title: status === 'ok'
            ? `${section.type} 的 ${cell.dimension} 达标`
            : `${section.type} 的 ${cell.dimension} 缺乏量化证据`,
          evidence: evidences,
          source_location: buildSourceLocation(section, evidences),
          evidence_strength: strength,
          why_it_hurts: status === 'issue' ? '缺少量化数据，HR 无法判断实际贡献' : undefined,
        });
      }

      if (cell.dimension === 'role_fit') {
        const hasBoundaryIssue = hasRoleBoundaryIssue(section);
        if (hasBoundaryIssue) {
          status = 'issue';
        }
        rows.push({
          section: section.type,
          dimension: cell.dimension,
          status,
          title: status === 'ok'
            ? `${section.type} 的角色边界清晰`
            : `${section.type} 存在角色边界模糊问题（强词+缺支撑）`,
          evidence: [],
          source_location: { paragraph_index: section.paragraph_index },
          evidence_strength: 'medium',
          why_it_hurts: status === 'issue' ? '使用强词但缺少具体支撑，可能引发可信度质疑' : undefined,
        });
      }

      if (cell.dimension === 'credibility') {
        const hasCredIssue = hasCredibilityIssue(section.content);
        if (hasCredIssue) {
          status = 'issue';
          const snippets = extractEvidenceSnippets(section.content, 'credibility');
          evidences.push(...snippets);
        }
        rows.push({
          section: section.type,
          dimension: cell.dimension,
          status,
          title: status === 'ok'
            ? `${section.type} 语言可信度高`
            : `${section.type} 存在模板化/AI味语言`,
          evidence: evidences,
          source_location: buildSourceLocation(section, evidences),
          evidence_strength: status === 'ok' ? 'strong' : 'weak',
          why_it_hurts: status === 'issue' ? '模板化语言降低可信度，AI味明显' : undefined,
        });
      }
    }
  }

  // 按 section 分组
  const grouped_by_section: Record<string, AuditRow[]> = {};
  for (const row of rows) {
    if (!grouped_by_section[row.section]) grouped_by_section[row.section] = [];
    grouped_by_section[row.section].push(row);
  }

  // 按 dimension 分组
  const grouped_by_dimension: Record<string, AuditRow[]> = {};
  for (const row of rows) {
    if (!grouped_by_dimension[row.dimension]) grouped_by_dimension[row.dimension] = [];
    grouped_by_dimension[row.dimension].push(row);
  }

  // 缺失信息摘要
  const missing_info_summary = rows
    .filter(r => r.status === 'missing_info')
    .map(r => r.title);

  return { rows, grouped_by_section, grouped_by_dimension, missing_info_summary };
}

/**
 * 格式化 AuditBundle 用于 AI prompt
 */
function formatAuditBundle(bundle: AuditBundle): string {
  if (!bundle.rows || bundle.rows.length === 0) {
    return '（覆盖矩阵扫描：无结果）';
  }

  const lines: string[] = ['## 覆盖矩阵扫描结果（体检底稿）'];

  for (const [section, sectionRows] of Object.entries(bundle.grouped_by_section)) {
    lines.push(`\n### ${section}（${sectionRows.length} 项检查）`);
    for (const row of sectionRows) {
      const statusIcon = row.status === 'ok' ? '✅' : row.status === 'issue' ? '❌' : '⚠️';
      lines.push(`  ${statusIcon} [${row.dimension}] ${row.title}`);
      if (row.evidence.length > 0) {
        for (const ev of row.evidence.slice(0, 2)) {
          lines.push(`     证据: "${ev.substring(0, 60)}${ev.length > 60 ? '…' : ''}"`);
        }
      }
    }
  }

  if (bundle.missing_info_summary.length > 0) {
    lines.push('\n### 缺失信息摘要');
    for (const m of bundle.missing_info_summary) {
      lines.push(`  - ${m}`);
    }
  }

  return lines.join('\n');
}

/**
 * 将 core_issues 按 section 分组
 * section 由 source_location.paragraph_index 对应的段落类型决定
 */
function groupIssuesBySection(
  issues: CoreIssue[],
  input: NormalizedInput
): Record<string, CoreIssue[]> {
  const result: Record<string, CoreIssue[]> = {};
  for (const issue of issues) {
    const sectionIndex = issue.source_location?.paragraph_index ?? 0;
    // 尝试从 resume_sections 获取段落类型
    const section = input.resume_sections.find(s => s.paragraph_index === sectionIndex);
    const sectionKey = section?.type || `段落${sectionIndex}`;
    if (!result[sectionKey]) result[sectionKey] = [];
    result[sectionKey].push(issue);
  }
  return result;
}

/**
 * 将 core_issues 按 dimension 分组
 */
function groupIssuesByDimension(issues: CoreIssue[]): Record<string, CoreIssue[]> {
  const result: Record<string, CoreIssue[]> = {};
  for (const issue of issues) {
    const dim = issue.dimension || 'other';
    if (!result[dim]) result[dim] = [];
    result[dim].push(issue);
  }
  return result;
}

/**
 * 运行免费版诊断工作流 V3
 */
export async function runFreeDiagnoseWorkflow(
  request: DiagnoseRequest
): Promise<FreeDiagnoseResponse> {
  try {
    logInfo('DiagnoseWorkflow', '开始免费版诊断工作流 V3');

    // 1. 标准化输入
    const normalizedInput = await normalizeInput(request);
    logDiagnoseSummary('normalized_input', normalizedInput);

    // 2. 轻量规则预分析
    const ruleMatchResult = rulePreAnalysis(normalizedInput);
    logDiagnoseSummary('rule_match_result', ruleMatchResult);

    // 3. 三库映射增强
    const enrichmentResult = enrichIssues(ruleMatchResult.matches);
    logDiagnoseSummary('issue_enrichment_result', enrichmentResult);

    // 3.5. 覆盖矩阵扫描（生成 audit_rows 底稿）
    const auditBundle = runCoverageScan(normalizedInput);

    // 4. 调用 DeepSeek API — 要求 AI 宽输出候选问题
    const aiRaw = await callDeepSeekWithRetry(normalizedInput, ruleMatchResult, enrichmentResult, auditBundle);
    logDiagnoseSummary('ai_response_raw', aiRaw);

    // 5. 工作流正式裁决场景
    const { scenario: workflowScenario, qualityTier, excellentScore } = determineWorkflowScenario(normalizedInput, ruleMatchResult, aiRaw);
    logInfo('DiagnoseWorkflow', `工作流场景裁决: ${workflowScenario}`, { qualityTier, excellentScore });

    // 6. 后端排序收口：从候选问题中选出最终核心问题（动态数量）
    const rankedIssues = workflowScenario === 'normal'
      ? rankAndSelectIssues(aiRaw.candidate_issues || [], normalizedInput, ruleMatchResult, qualityTier)
      : [];

    // 7.1 主结论：优先信任 AI 输出，不合规时才用 top1 兜底
    let mainJudgment = aiRaw.main_judgment || '';
    if (workflowScenario === 'normal') {
      if (!isMainJudgmentValid(mainJudgment)) {
        // AI 输出命中禁止词或为空，尝试用 top1 的 screening_impact/title 兜底
        if (rankedIssues.length > 0) {
          mainJudgment = fallbackMainJudgment(rankedIssues[0]);
        } else {
          // 没有核心问题时，使用中性兜底结论（后处理会进一步优化）
          mainJudgment = '部分经历的描述可以更有说服力';
        }
      }
      // AI 输出合规则直接保留，不再套模板覆盖
    } else if (workflowScenario === 'excellent') {
      mainJudgment = '这是一份优秀简历，没有明显核心问题';
    } else if (workflowScenario === 'insufficient_input') {
      mainJudgment = '输入信息不足，无法形成高可信诊断';
    }

    // 7.2 分流优化问题到 minor_suggestions，并去除与 core_issues 语义重复的条目
    const minorCandidates = identifyMinorIssues(aiRaw.candidate_issues || []);

    // 提取 core_issues 的关键词集合，用于去重检测
    const coreIssueKeywords = new Set<string>(
      rankedIssues.flatMap(issue =>
        `${issue.title} ${issue.summary}`
          .toLowerCase()
          .replace(/[，。、；：！？]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length >= 2)
      )
    );

    const isSemanticallyOverlappingWithCore = (title: string, description: string): boolean => {
      const text = `${title} ${description}`.toLowerCase().replace(/[，。、；：！？优化：]/g, ' ');
      const words = text.split(/\s+/).filter(w => w.length >= 2);
      const overlapCount = words.filter(w => coreIssueKeywords.has(w)).length;
      return words.length > 0 && overlapCount / words.length > 0.5;
    };

    // 检查两个 minor suggestion 是否语义重复（基于标题关键词重叠）
    const areMinorSuggestionsDuplicate = (a: { title: string; description: string }, b: { title: string; description: string }): boolean => {
      // 如果标题完全相同，则视为重复
      if (a.title === b.title) return true;

      // 停用词过滤（与核心问题去重保持一致）
      const stopWords = new Set(['的', '了', '和', '与', '及', '或', '在', '是', '有', '对', '为', '从', '而', '但', '且', '也', '就', '又', '还', '再', '更', '很', '最', '太', '非常', '十分', '一些', '一点', '一个', '一种']);

      // 提取关键词进行比较（移除常见前缀和停用词）
      const normalizeText = (text: string): string => {
        return text
          .replace(/^优化：/, '')
          .replace(/^\[优化\]\s*/, '')
          .toLowerCase()
          .replace(/[，。、；：！？]/g, ' ')
          .trim();
      };

      const aText = normalizeText(a.title);
      const bText = normalizeText(b.title);

      // 如果归一化后的标题相同，视为重复
      if (aText === bText) return true;

      // 提取关键词，过滤停用词和短词
      const extractKeywords = (text: string): Set<string> => {
        const words = text
          .split(/\s+/)
          .filter(w => w.length >= 2 && !stopWords.has(w));
        return new Set(words);
      };

      const aWords = extractKeywords(aText);
      const bWords = extractKeywords(bText);

      if (aWords.size === 0 || bWords.size === 0) return false;

      let overlap = 0;
      aWords.forEach(w => { if (bWords.has(w)) overlap++; });
      const overlapRate = overlap / Math.min(aWords.size, bWords.size);

      // 与核心问题去重保持一致（50%重叠率）
      if (overlapRate > 0.5) return true;

      // 额外检查标题相似度（移除常见后缀）
      const normalizeTitleContent = (title: string): string => {
        return title
          .toLowerCase()
          .replace(/[，。、；：！？]/g, '')
          .replace(/问题|建议|不足|缺失|缺乏|不够|缺少|优化|改进|调整|提升/g, '')
          .trim();
      };

      const aTitleCore = normalizeTitleContent(a.title);
      const bTitleCore = normalizeTitleContent(b.title);

      // 如果核心标题相同且有一定长度
      if (aTitleCore === bTitleCore && aTitleCore.length >= 4) return true;

      // 检查包含关系
      if (aTitleCore.includes(bTitleCore) && bTitleCore.length >= 4) return true;
      if (bTitleCore.includes(aTitleCore) && aTitleCore.length >= 4) return true;

      return false;
    };

    // 合并：AI 独立输出的 minor_suggestions 优先，identifyMinorIssues 降级补充
    // 过滤掉与 core_issues 语义重复的条目，并去除 aiRaw.minor_suggestions 与 minorCandidates 之间的重复
    const allMinorCandidates = [...(aiRaw.minor_suggestions || []), ...minorCandidates];

    // 去重：保留第一个出现的，跳过后续重复的
    const deduplicatedMinorCandidates: typeof allMinorCandidates = [];

    for (const candidate of allMinorCandidates) {
      // 检查是否与已添加的条目重复
      const isDuplicate = deduplicatedMinorCandidates.some(existing =>
        areMinorSuggestionsDuplicate(candidate, existing)
      );

      if (!isDuplicate) {
        deduplicatedMinorCandidates.push(candidate);
      }

      // 限制最多处理前10个，避免性能问题
      if (deduplicatedMinorCandidates.length >= 10) break;
    }

    const combinedMinorSuggestions = deduplicatedMinorCandidates
      .filter(s => !isSemanticallyOverlappingWithCore(s.title, s.description))
      .slice(0, 3);

    // 7.3 组装为 FreeDiagnoseResponse
    const assembled: FreeDiagnoseResponse = {
      scenario: workflowScenario,
      main_judgment: mainJudgment,
      core_issues: rankedIssues,
      core_issues_summary: {
        total_count: (aiRaw.candidate_issues || []).length,
        shown_count: rankedIssues.length,
      },
      priority_actions: [],
      rewrite_direction: aiRaw.rewrite_direction || '',
      minor_suggestions: combinedMinorSuggestions,
      rewrite_examples: aiRaw.rewrite_examples || [],
      follow_up_prompts: aiRaw.follow_up_prompts || [],
      excellent_score: excellentScore,
      quality_tier: qualityTier,
      audit_rows: auditBundle.rows,
      grouped_issues_by_section: groupIssuesBySection(rankedIssues, normalizedInput),
      grouped_issues_by_dimension: groupIssuesByDimension(rankedIssues),
      missing_info_summary: auditBundle.missing_info_summary,
      metadata: {
        target_role: normalizedInput.target_role,
        has_jd: normalizedInput.jd_quality !== 'none',
        generated_at: new Date().toISOString(),
        tier: normalizedInput.tier,
        jd_quality: normalizedInput.jd_quality,
        schema_version: '5.0',
      },
    };

    // 合并 issue 级 rewrite_examples 到顶级
    if ((!assembled.rewrite_examples || assembled.rewrite_examples.length === 0) && rankedIssues.length > 0) {
      const fromIssues: RewriteExample[] = [];
      for (const issue of rankedIssues) {
        if (issue.rewrite_examples) {
          fromIssues.push(...issue.rewrite_examples);
        }
      }
      if (fromIssues.length > 0) {
        assembled.rewrite_examples = fromIssues;
      }
    }

    // excellent 场景保留 AI 的亮点洞察
    if (workflowScenario === 'excellent' && aiRaw.excellence_insight) {
      assembled.rewrite_direction = aiRaw.excellence_insight;
    }

    // 8. 后处理
    const finalResponse = postProcessResponse(assembled, normalizedInput);
    logInfo('DiagnoseWorkflow', `后处理完成，最终问题数: ${finalResponse.core_issues.length}`);

    return finalResponse;
  } catch (error) {
    logError('DiagnoseWorkflow', error, {
      target_role: request.target_role,
      has_jd: !!request.jd_text?.trim(),
      tier: request.tier,
    });

    if (error instanceof InputQualityError) {
      return createInputQualityInsufficientResponse(request);
    }

    throw error;
  }
}

/**
 * 创建输入质量不足的响应
 */
function createInputQualityInsufficientResponse(request: DiagnoseRequest): FreeDiagnoseResponse {
  return {
    scenario: 'insufficient_input',
    main_judgment: '输入信息不足，无法形成高可信诊断',
    core_issues: [],
    core_issues_summary: {
      total_count: 0,
      shown_count: 0,
    },
    priority_actions: [
      {
        title: '补充完整简历内容',
        description: '请粘贴完整的简历文本，确保长度足够（至少100字）且内容清晰。',
      },
      {
        title: '检查粘贴格式',
        description: '确认粘贴内容不包含乱码或大量重复字符。',
      },
    ],
    rewrite_direction: '',
    minor_suggestions: [],
    metadata: {
      target_role: request.target_role,
      has_jd: !!request.jd_text?.trim(),
      generated_at: new Date().toISOString(),
      tier: request.tier,
      schema_version: '3.0',
    },
  };
}

/**
 * 调用 DeepSeek API（带重试）
 */
async function callDeepSeekWithRetry(
  input: NormalizedInput,
  ruleMatch: RuleMatchResult,
  enrichment: IssueEnrichmentResult,
  auditBundle: AuditBundle
): Promise<AIRawResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY 未配置');
  }

  // 对简历文本进行 token 估算并截断，防止超限（按4字符≈1 token估算，上限8000 token）
  const MAX_RESUME_TOKENS = 8000;
  const MAX_RESUME_CHARS = MAX_RESUME_TOKENS * 4;
  const truncatedInput: NormalizedInput = input.resume_text.length > MAX_RESUME_CHARS
    ? { ...input, resume_text: input.resume_text.slice(0, MAX_RESUME_CHARS) + '\n[简历内容已截断]' }
    : input;

  const prompt = buildPrompt(truncatedInput, ruleMatch, enrichment, auditBundle);

  return retryJsonParse<AIRawResponse>(
    async () => {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `你是一位有10年以上经验的资深招聘顾问。你的沟通风格是专业、温和但直接——像一个真正帮人的职业教练，不是刻薄的HR，也不是冷冰冰的AI报告生成器。

你的任务是帮助求职者理解简历中最影响初筛通过率的问题，并给出可以直接拿去改简历的具体建议。

语气规范：
- 不用"暴露短板""高风险""一眼假""容易被盘问"这类攻击性措辞
- 用"这部分还没把你的真实贡献讲清楚""换一种写法会更稳""这里的问题不是你没做，而是你没写出结果"这类帮助式表达
- 简短、克制、直指要害。不要写AI报告式长文。`
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4,
          max_tokens: 6000,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // 截断错误文本，避免泄露敏感信息（最大200字符）
        const truncatedErrorText = errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText;
        throw new Error(`DeepSeek API 错误: ${response.status} ${truncatedErrorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('DeepSeek 返回内容为空');
      }

      return content;
    },
    2
  );
}

/**
 * 构建提示词 V3 — 要求 AI 宽输出候选问题
 */
function buildPrompt(
  input: NormalizedInput,
  ruleMatch: RuleMatchResult,
  enrichment: IssueEnrichmentResult,
  auditBundle: AuditBundle
): string {
  const { target_role, jd_quality } = input;

  const normalizedInputBlock = formatNormalizedInput(input);
  const ruleMatchBlock = formatRuleMatchResult(ruleMatch);
  const enrichmentBlock = formatEnrichmentResult(enrichment);
  const auditBlock = formatAuditBundle(auditBundle);

  // H. 语境提示：处理“模拟/沙盘/课程项目”中的角色头衔（如“模拟财务总监”）
  // 这类头衔通常属于课程/竞赛的分工，不应被当成“造假/不真实头衔”。
  const simKeywords = ['模拟', '沙盘', '企业模拟', '课程项目', '竞赛', '实训', 'ERP'];
  const hasSimulationRoleContext = simKeywords.some(k => input.resume_text.includes(k));
  const simulationExampleLine = hasSimulationRoleContext
    ? input.resume_text
        .split('\n')
        .map(l => l.trim())
        .find(l => simKeywords.some(k => l.includes(k))) || ''
    : '';

  let jdQualityGuidance = '';
  if (jd_quality === 'none') {
    jdQualityGuidance = `无具体岗位描述（JD）。
- 不要下"方向偏移""匹配度极低"这类强判断
- 可以把 target_role（${target_role}）作为弱语境参考
- 重点分析简历本身的严重问题：结构、证据、表达`;
  } else if (jd_quality === 'weak') {
    jdQualityGuidance = `岗位描述（JD）较泛或内容不足。
- 基于JD的匹配判断需谨慎，不要过度依赖泛泛的JD做强判断
- 可以给出简历本身的质量问题和轻度匹配分析`;
  } else {
    jdQualityGuidance = `有具体岗位描述（JD），请进行全面的简历-岗位匹配分析。
- JD中明确要求但简历完全缺失的能力/经验，应作为高优先候选问题
- JD关键词与简历用词的差异要指出`;
  }

  return `你是一位资深招聘顾问，你的任务是做**初筛裁决**，找出最可能导致简历被淘汰的问题。

## 1. 标准化输入
${normalizedInputBlock}

## 1.1 额外语境（很重要）
- 可能包含”模拟/沙盘/课程项目/实训/竞赛”等语境下的角色头衔：${hasSimulationRoleContext ? '是' : '否'}${simulationExampleLine ? `（例如：${simulationExampleLine}）` : ''}
- JD质量：${jdQualityGuidance}

## 2. 规则预分析结果
${ruleMatchBlock}

## 3. 三库映射增强信息
${enrichmentBlock}

## 3.5. 覆盖矩阵扫描结果（审计底稿）
${auditBlock}

## 4. 诊断思维顺序（必须严格执行）

### 第一步：初筛裁决（淘汰风险评估）
先找出最可能在初筛阶段导致淘汰的问题，再找显眼问题，最后才是细节优化：

1. **最影响淘汰率的问题**（HR在10秒内就会判断）：
   - 结构混乱导致无法阅读
   - 明显与岗位不匹配（社招看经验方向，校招看基础能力）
   - 关键信息缺失（工作时间、职位、公司）
   - 表达严重不专业

2. **显眼问题**（HR继续阅读时会注意到）：
   - 量化结果缺失
   - 表达模糊、模板化
   - 逻辑跳跃、因果关系不清

3. **一眼可见问题**（细读时发现的可优化点）：
   - 格式细节、用词精准度

### 第二步：问题归类与证据收集
每个问题必须有：
- **结果导向标题**：说明后果，如”结构混乱导致HR可能直接放弃阅读”，而不是”结构问题”
- **证据**：从简历原文引用具体片段
- **淘汰影响**：在初筛哪个环节、如何影响决策（直接说”HR在10秒浏览阶段可能直接跳过”这类具体判断）
- **岗位相关性**：high/medium/low/none
- **结构性**：是否影响整份简历的可读性

### 第三步：结构化改写
对最重要的 1~3 个问题，直接给出 before/after 改写：
- original: 简历原文
- rewritten: 改写后版本（如建议分点就真的分点写，如建议加数据就用 [需要你补充具体数字] 占位）
- change_summary: 一句话说清楚改了什么、为什么

## 5. 具体规则

### 5.1 岗位匹配分析
- **看语义，不看关键词**：判断经验方向、能力结构是否匹配，而不是关键词是否逐字出现
- **社招重点**：工作经验的连续性、项目复杂度、职责范围
- **校招重点**：基础技能、学习能力、项目深度
- **有JD时**：role_fit 维度问题最多 2 个，不要把所有问题都归结为”与岗位不匹配”

### 5.2 强词处理
- **强词（”主导””负责””带领”）不是天然风险**
- **只有”强词 + 缺少支撑”才算风险**（如”负责项目”但没说具体职责）
- 默认进入 minor_suggestions，不进 core_issues，除非严重影响可信度

### 5.3 模拟/校园项目权重
- **如果简历明显有真实工作经验（社招）**：模拟/校园项目自动降权
- **校招**：项目深度和质量更重要
- 发现”ERP/沙盘/企业模拟/课程项目/竞赛/实训”等语境下的头衔（例如”模拟财务总监”），**不要**按”造假/不真实头衔”处理；正确建议是：把”模拟/课程/竞赛”语境写清楚，避免被误读

### 5.4 问题数量
- 差简历（结构混乱、缺乏量化）：6~10 个候选问题
- 中等简历：4~7 个
- 较强简历：2~4 个
- 优秀简历：0~2 个强化建议

### 5.5 维度覆盖
每个 candidate_issue 必须标注 dimension（从以下 6 个中选一个）：
- structure: 结构/排版/层次问题
- role_fit: 岗位贴合/方向匹配
- evidence: 结果/数据/成果缺失
- credibility: 语言可信度/AI味/模板感/夸大
- expression: 表达方式/措辞/描述问题
- missing_info: 关键信息缺失

同一维度的问题不能只是同一论点的不同说法（如”缺量化”和”数据不足”算同一论点）。

## 6. 语气要求
- **判断直接**：明确指出问题，不绕弯
- **后果清晰**：说明这个问题在初筛中的具体影响
- **不攻击用户**：用帮助式语气，如”这部分还没把你的真实贡献讲清楚”
- **好要敢夸**：优秀的地方明确肯定
- **差要敢说**：严重问题直接指出
- 禁止使用：”暴露短板””高风险””一眼假””容易被盘问”这类攻击性措辞

## 7. 输出 JSON 格式

{
  “scenario”: “normal | excellent | insufficient_input”,
  “main_judgment”: “从 top1 issue 直接推出的一句话总结（24-36字）。如果top1是结构问题→'结构上的[具体问题]最影响初筛'；是匹配问题→'与目标岗位的[具体差距]可能导致初筛被筛'；是证据问题→'[具体缺失]让HR难以评估你的实际贡献'。禁止：'这份简历有价值''基础不错''整体还不错''缺量化''缺成果''容易被低估''竞争力不足'”,
  “candidate_issues”: [
    {
      “title”: “结果导向的问题标题（如'量化数据缺失让HR无法判断你的实际贡献'）”,
      “summary”: “为什么这是问题（2~3句）”,
      “evidence”: “从简历中提取的原句（必须是简历原文，不是系统解释）”,
      “insider_view”: “招聘方视角：看到这段会怎么想（帮助式语气）”,
      “suggestion”: “具体怎么改（可操作建议）”,
      “follow_up_question”: “面试可能追问的问题”,
      “screening_impact”: “对初筛的具体影响（如：HR在10秒浏览阶段可能直接跳过这份简历）”,
      “is_structural”: true,
      “jd_relevance”: “high | medium | low | none”,
      “dimension”: “structure | role_fit | evidence | credibility | expression | missing_info”,
      “rewrite_examples”: [
        {
          “original”: “简历原文”,
          “rewritten”: “改写后版本（必须体现建议，建议分点就真的分点写）”,
          “change_summary”: “改了什么、为什么”
        }
      ]
    }
  ],
  “rewrite_examples”: [],
  “minor_suggestions”: [
    { “title”: “标题”, “description”: “鼓励性描述”, “category”: “优化建议” }
  ],
  “follow_up_prompts”: [
    {
      “question”: “最值得追问的一个信息点”,
      “why”: “为什么补充这个信息很重要”
    }
  ],
  “rewrite_direction”: “整体改写方向（如果有多个改写示例可以留空）”,
  “excellence_insight”: “仅 excellent 场景：用户可能没意识到的亮点强化建议”,
  “excellent_score”: 0
}

## 8. 特殊场景处理
- **excellent_score ≥ 90**：scenario=”excellent”，candidate_issues 为空或只有 1~2 个强化建议，main_judgment=”这是一份优秀简历，没有明显核心问题”
- **输入不足**：scenario=”insufficient_input”，candidate_issues=[]
- **无JD**：不要下”方向偏移””匹配度极低”这类强判断，把 target_role 作为弱语境参考

## 9. 质量保证
- excellent_score 必须认真评估，不要默认给 50~70 的安全分，结构清晰+量化充分+匹配度高就给 90+
- evidence 必须来自简历原文，不要把系统解释写进 evidence
- rewrite_examples 的 rewritten 必须真正体现建议，不要编造数据（用 [需要你补充] 占位）
- minor_suggestions 独立产出 1~3 条，语气鼓励，不从 candidate_issues 拆分
- insufficient_input 场景不输出 candidate_issues，不伪造 rewrite_examples

请确保输出是纯 JSON 格式。`;
}

function formatNormalizedInput(input: NormalizedInput): string {
  const { target_role, jd_text, tier, resume_sentences, jd_keywords, jd_quality, resume_text, resume_paragraphs, resume_sections } = input;
  const hasJd = !!jd_text?.trim();
  const jdTextForDisplay = jd_text || '（未提供具体岗位描述）';
  const jdKeywordsExample = jd_keywords.slice(0, 5).join('、') + (jd_keywords.length > 5 ? '...' : '');

  // 给 AI 分段后的简历文本，带段落类型标签以便 AI 理解结构
  const SECTION_TYPE_LABELS: Record<string, string> = {
    personal_info: '个人信息',
    education: '教育经历',
    work_experience: '工作经历',
    project: '项目经历',
    internship: '实习经历',
    skill: '技能',
    self_evaluation: '自我评价',
    certificate: '证书/荣誉',
    other: '其他',
  };

  let formattedResume: string;
  if (resume_sections && resume_sections.length > 1) {
    formattedResume = resume_sections.map((s, i) => {
      const typeLabel = SECTION_TYPE_LABELS[s.type] || '其他';
      return `[段落${i + 1} | ${typeLabel}]\n${s.content}`;
    }).join('\n\n');
  } else if (resume_paragraphs.length > 1) {
    formattedResume = resume_paragraphs.map((p, i) => `[段落${i + 1}]\n${p}`).join('\n\n');
  } else {
    formattedResume = resume_text;
  }

  return `目标岗位: ${target_role}
岗位要求: ${jdTextForDisplay}
JD质量: ${jd_quality}
诊断版本: ${tier}版
简历段落数: ${resume_paragraphs.length}
简历句子数: ${resume_sentences.length}
已识别段落类型: ${resume_sections ? resume_sections.filter(s => s.type !== 'other').map(s => SECTION_TYPE_LABELS[s.type]).join('、') || '未识别' : '未识别'}
JD关键词数: ${jd_keywords.length}${hasJd ? ` (示例: ${jdKeywordsExample})` : ''}

## 完整简历文本
${formattedResume}`;
}

function formatRuleMatchResult(ruleMatch: RuleMatchResult): string {
  if (ruleMatch.matches.length === 0) {
    return '未匹配到具体问题。';
  }

  return ruleMatch.matches.map(match => {
    const confidencePercent = (match.confidence * 100).toFixed(0);
    const signals = match.matched_signals.length > 0 ? match.matched_signals.join('、') : '无特定信号';
    const evidenceDisplay = match.evidence_snippets.map(snippet => `  - "${snippet}"`).join('\n');

    return `问题类型: ${match.issue_name} (${match.issue_type})
置信度: ${confidencePercent}%
匹配信号: ${signals}
证据片段 (${match.evidence_snippets.length}条):
${evidenceDisplay}`;
  }).join('\n\n');
}

function formatEnrichmentResult(enrichment: IssueEnrichmentResult): string {
  const structuredData = getEnrichmentStructuredData(enrichment.enrichments);

  if (!structuredData || !Array.isArray(structuredData) || structuredData.length === 0) {
    return '无增强信息。';
  }

  return structuredData.map(item => {
    return `问题类型: ${item.issue_name} (${item.issue_type})
定义: ${item.definition || '无定义'}
内行视角: ${item.insider_view || '无内行视角'}
改写逻辑: ${item.rewrite_logic || '无改写逻辑'}`;
  }).join('\n\n');
}

export type { DiagnoseRequest, FreeDiagnoseResponse, NormalizedInput };
