// 双 AI 工作流 Prompts
import type { NormalizedInput, FreeDiagnoseResponse, BasicSummary } from '../types';
import type { BaseAnalyzerResult, HrSimulatorResult, ResumeMasterResult, CrossCritiqueResult } from './schemas';

export function buildBaseAnalyzerPrompt(input: NormalizedInput): string {
  const truncatedResume = input.resume_text.length > 1200 ? input.resume_text.substring(0, 1200) + '...' : input.resume_text;
  const truncatedJd = input.jd_text && input.jd_text.length > 600 ? input.jd_text.substring(0, 600) + '...' : input.jd_text || '无';

  return `你是简历快速分析器。任务：快速评估简历质量，为后续深度分析提供基线。

## 输入
目标岗位: ${input.target_role}
JD: ${truncatedJd}
简历文本:
${truncatedResume}

## 输出 JSON
{
  "overall_score": 0-100,
  "dimension_scores": {
    "structure": 0-100,
    "role_fit": 0-100,
    "evidence": 0-100,
    "credibility": 0-100,
    "expression": 0-100,
    "completeness": 0-100
  },
  "red_flags": ["最严重的3个问题"],
  "base_summary": "一句话总结（25字内）",
  "quick_rewrite_hints": ["快速改进建议3条"]
}`;
}

export function buildHrSimulatorPrompt(
  input: NormalizedInput,
  baseResult: BaseAnalyzerResult
): string {
  const truncatedResume = input.resume_text.length > 800 ? input.resume_text.substring(0, 800) + '...' : input.resume_text;
  const truncatedJd = input.jd_text && input.jd_text.length > 500 ? input.jd_text.substring(0, 500) + '...' : input.jd_text || '无具体JD';

  return `你是资深HR，模拟真实初筛流程（6秒扫描 + 30秒深度审阅）。

## 基线分析
总分: ${baseResult.overall_score}
红旗: ${baseResult.red_flags.join('、')}
摘要: ${baseResult.base_summary}

## 简历
${truncatedResume}

## JD
${truncatedJd}

## 输出 JSON
{
  "hr_decision": "pass | interview | hold",
  "hr_reasoning": "为什么做这个决定（80字内）",
  "jd_match_risks": ["与JD不匹配的3点"],
  "screening_red_flags": ["初筛阶段最致命的3个问题"],
  "likely_interview_questions": ["如果面试会追问的3个问题"]
}`;
}

export function buildResumeMasterPrompt(
  input: NormalizedInput,
  baseResult: BaseAnalyzerResult
): string {
  const truncatedResume = input.resume_text.length > 1000 ? input.resume_text.substring(0, 1000) + '...' : input.resume_text;

  return `你是简历优化专家，从ATS和写作角度提供重写级分析。

## 基线分析
总分: ${baseResult.overall_score}
红旗: ${baseResult.red_flags.join('、')}

## 简历
${truncatedResume}

## 输出 JSON
{
  "rewrite_strategy": "整体改写策略（40字内）",
  "experience_rewrites": [
    {
      "original": "原文",
      "rewritten": "改写后",
      "change_summary": "改了什么"
    }
  ],
  "ats_keywords": ["应补充的关键词"],
  "content_to_remove": ["建议删除的内容"],
  "content_to_add": ["建议新增的内容"],
  "content_to_frontload": ["应前置的亮点"]
}`;
}

export function buildCrossCritiquePrompt(
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult
): string {
  return `交叉验证两个AI的分析结果。

## HR视角
决定: ${hrResult.hr_decision}
理由: ${hrResult.hr_reasoning}
红旗: ${hrResult.screening_red_flags.join('、')}

## 重写专家视角
策略: ${masterResult.rewrite_strategy}
关键改写: ${masterResult.experience_rewrites.slice(0, 2).map(r => r.change_summary).join('、')}

## 输出 JSON
{
  "ai1_on_ai2": "HR视角：这些改动能否提高通过率？有何风险？（80字内）",
  "ai2_on_ai1": "重写专家：如何通过改写解决HR提到的红旗？（80字内）",
  "conflicts": ["两个AI的分歧点"],
  "consensus_points": ["两个AI的共识点"]
}`;
}

export function buildFinalSynthesisPrompt(
  input: NormalizedInput,
  baseResult: BaseAnalyzerResult,
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult,
  crossResult: { ai1_on_ai2: string; ai2_on_ai1: string }
): string {
  return `合成最终诊断报告。

## 目标岗位
${input.target_role}

## 基线
总分: ${baseResult.overall_score}
摘要: ${baseResult.base_summary}

## HR视角
决定: ${hrResult.hr_decision}
红旗: ${hrResult.screening_red_flags.slice(0, 3).join('、')}

## 重写视角
策略: ${masterResult.rewrite_strategy}
改写数: ${masterResult.experience_rewrites.length}

## 交叉验证
${crossResult.ai1_on_ai2}
${crossResult.ai2_on_ai1}

## 输出 JSON
{
  "executive_summary": "执行摘要（50字内）",
  "key_conclusions": ["3-5个关键结论"],
  "core_issues": [
    {
      "title": "问题标题",
      "summary": "问题说明",
      "evidence": "证据",
      "suggestion": "建议",
      "source": "hr | master | both"
    }
  ],
  "next_actions": ["下一步行动建议3条"]
}`;
}

// ==================== 深度诊断专用 Prompts ====================

// 深度HR Simulator Prompt (精简版)
export function buildDeepHrSimulatorPrompt(
  input: NormalizedInput,
  basicSummary: { main_judgment: string; core_issues_titles: string[]; excellent_score?: number }
): string {
  const jdText = input.jd_text || '无';
  const truncatedJd = jdText.length > 800 ? jdText.substring(0, 800) + '...' : jdText;
  const truncatedResume = input.resume_text.length > 1200 ? input.resume_text.substring(0, 1200) + '...' : input.resume_text;

  return `你是资深HR，进行深度初筛分析。已有基础诊断指出：${basicSummary.core_issues_titles.slice(0, 3).join('、')}

## 深度约束
1. 不重复基础诊断已指出的问题
2. 提供更深原因链或具体改写动作
3. 可改到简历里（示例/模板/补充清单）
4. 不编造数据，事实边界内丰富化
5. 分析ATS+HR双视角风险

## 多维度深度分析
- 职业成长路径匹配度
- 行业经验转移性
- 技能缺口与学习曲线
- 长期发展潜力
- 团队文化契合度

## 输入
目标岗位: ${input.target_role}
JD: ${truncatedJd}
基础诊断评分: ${basicSummary.excellent_score || 'N/A'}
基础诊断主结论: ${basicSummary.main_judgment}

## 简历关键事实
${truncatedResume}

## 输出 JSON
{
  "hr_decision": "pass|interview|hold",
  "hr_reasoning": "决定理由（80字内），基础诊断未覆盖的视角",
  "jd_match_risks": ["与JD不匹配的3点"],
  "screening_red_flags": ["初筛致命问题3个"],
  "likely_interview_questions": ["可能追问3个"],
  "ats_keyword_gaps": ["ATS关键词缺口"],
  "hr_6s_risk": "HR 6秒风险",
  "hr_30s_risk": "HR 30秒风险",
  "career_growth_match": "职业成长匹配分析",
  "industry_transferability": "行业经验转移性",
  "skill_gap_analysis": "技能缺口分析",
  "long_term_potential": "长期潜力",
  "team_culture_fit": "团队文化契合"
}`;
}

// 深度Resume Master Prompt (精简版)
export function buildDeepResumeMasterPrompt(
  input: NormalizedInput,
  basicSummary: { main_judgment: string; core_issues_titles: string[]; excellent_score?: number }
): string {
  const jdText = input.jd_text || '无';
  const truncatedJd = jdText.length > 800 ? jdText.substring(0, 800) + '...' : jdText;
  const truncatedResume = input.resume_text.length > 1500 ? input.resume_text.substring(0, 1500) + '...' : input.resume_text;

  return `你是简历优化专家，进行深度重写分析。已有基础诊断指出：${basicSummary.core_issues_titles.slice(0, 3).join('、')}

## 深度约束
1. 不重复基础诊断已指出的问题
2. 提供可直接改写示例或模板
3. 标注丰富化类型：safe_expand/needs_user_input/forbidden_to_invent
4. ATS/HR双视角分析
5. 不编造数据

## 改写策略维度
- 职业阶梯对齐
- 行业术语适配
- 技能层次展示
- 成果影响力放大
- 成长轨迹塑造

## 输入
目标岗位: ${input.target_role}
JD: ${truncatedJd}
基础诊断主结论: ${basicSummary.main_judgment}

## 简历关键段落
${truncatedResume}

## 输出 JSON
{
  "rewrite_strategy": "整体改写策略（40字内）",
  "experience_rewrites": [
    {
      "original": "原文",
      "rewritten": "改写后",
      "change_summary": "改了什么",
      "enrichment_safety": "safe_expand|needs_user_input|forbidden_to_invent",
      "ats_impact": "ATS影响",
      "hr_impact": "HR影响"
    }
  ],
  "ats_keywords": ["应补充的关键词"],
  "content_to_remove": ["建议删除的内容"],
  "content_to_add": ["建议新增的内容"],
  "content_to_frontload": ["应前置的亮点"],
  "enrichment_safety_flags": ["安全标识"]
}`;
}

// 深度Cross Critique Prompt (精简版)
export function buildDeepCrossCritiquePrompt(
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult,
  basicSummary: { core_issues_titles: string[] }
): string {
  return `交叉验证两个AI的深度分析结果。基础诊断已指出：${basicSummary.core_issues_titles.slice(0, 3).join('、')}

## 验证重点
1. 增量价值检查
2. 可落地性检查
3. 安全丰富化检查
4. ATS/HR风险覆盖

## HR视角
决定: ${hrResult.hr_decision}
理由: ${hrResult.hr_reasoning.substring(0, 80)}
ATS关键词缺口: ${(hrResult as any).ats_keyword_gaps?.slice(0, 3).join('、') || '未提供'}

## 重写专家视角
策略: ${masterResult.rewrite_strategy.substring(0, 80)}
关键改写: ${masterResult.experience_rewrites.slice(0, 2).map(r => r.change_summary).join('、')}

## 输出 JSON
{
  "ai1_on_ai2": "HR视角：深度改写解决基础诊断未覆盖的风险？（80字内）",
  "ai2_on_ai1": "重写专家：通过改写解决HR深层风险？（80字内）",
  "conflicts": ["分歧点"],
  "consensus_points": ["共识点"],
  "incremental_value_summary": "新增价值（40字内）",
  "safety_check_passed": true
}`;
}

// 深度Final Synthesis Prompt (精简版)
export function buildDeepFinalSynthesisPrompt(
  input: NormalizedInput,
  basicResult: FreeDiagnoseResponse,
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult,
  crossResult: CrossCritiqueResult
): string {
  return `合成深度诊断最终报告。付费深度诊断，必须体现超越基础诊断的价值。

## 目标岗位
${input.target_role}

## 基础诊断摘要
主结论: ${basicResult.main_judgment}
核心问题: ${basicResult.core_issues.map(issue => issue.title).slice(0, 3).join('、')}
评分: ${basicResult.excellent_score || 'N/A'}

## 深度分析结果
HR决策: ${hrResult.hr_decision}
重写策略: ${masterResult.rewrite_strategy.substring(0, 80)}

## 交叉验证
HR: ${crossResult.ai1_on_ai2.substring(0, 100)}
改写专家: ${crossResult.ai2_on_ai1.substring(0, 100)}

## 输出 JSON
{
  "executive_summary": "深度诊断执行摘要（30字内）",
  "key_conclusions": ["3个关键深度结论"],
  "core_issues": [
    {
      "title": "深度问题标题",
      "summary": "问题说明",
      "suggestion": "具体改写建议",
      "source": "hr|master|both",
      "incremental_value": "新增价值"
    }
  ],
  "next_actions": ["行动建议3条"],
  "deep_value_summary": "价值总结（50字内）",
  "ats_risk_level": "low|medium|high",
  "hr_risk_level": "low|medium|high"
}`;
}

// 深度报告合成 Prompt (精简版)
export function buildDeepReportSynthesisPrompt(
  basicResult: FreeDiagnoseResponse,
  hrResult: HrSimulatorResult,
  masterResult: ResumeMasterResult,
  crossResult: CrossCritiqueResult
): string {
  return `合成深度诊断报告（deep_report）。付费用户专享，必须体现超越基础诊断的价值。

## 基础诊断摘要
主结论: ${basicResult.main_judgment}
核心问题: ${basicResult.core_issues.map(i => i.title).slice(0, 5).join('、')}
评分: ${basicResult.excellent_score || 'N/A'}

## 深度分析结果
HR决策: ${hrResult.hr_decision}
重写策略: ${masterResult.rewrite_strategy.substring(0, 100)}

## 交叉验证
HR视角: ${crossResult.ai1_on_ai2.substring(0, 150)}
重写专家视角: ${crossResult.ai2_on_ai1.substring(0, 150)}

## 输出 JSON（简化结构）
{
  "deep_value_summary": "深度诊断新增价值（50字内）",
  "metrics": {
    "ats_match": {"before": "当前", "after": "改后"},
    "hr_pass": {"before": "当前", "after": "改后"},
    "interview_risk": {"before": "当前", "after": "改后"}
  },
  "problems": {
    "must_fix": [{"title": "问题标题", "rewrite": "改写建议"}],
    "should_fix": [{"title": "问题标题", "rewrite": "改写建议"}],
    "optional": [{"title": "问题标题", "rewrite": "改写建议"}]
  },
  "ats_analysis": {
    "risk": "low|medium|high",
    "keyword_gaps": ["关键词"]
  },
  "hr_analysis": {
    "risk": "low|medium|high",
    "risks": ["风险点"]
  },
  "interview_risks": ["可能追问"],
  "content_expansion": {
    "safe": [{"location": "位置", "suggestion": "建议"}],
    "needs_input": [{"location": "位置", "question": "需补充"}]
  },
  "rewrites": [{"original": "原文摘要", "rewritten": "改写摘要", "change": "改了什么"}],
  "impact": {
    "score_improvement": "分数提升",
    "ats_pass": "ATS通过率",
    "hr_pass": "HR通过率"
  },
  "actions": ["立即行动"]
}

## 约束
- 问题池至少5个
- 每个问题必须有改写方案
- 不编造数据`;
}

// ==================== 新深度诊断 Prompts（Phase 3 完整实现）====================

/**
 * buildDeepResearchMemoPrompt — Metaso 专用研究 memo
 * 输出为纯文本（非 JSON），供后续 DeepSeek synthesis 消费。
 * 聚焦：市场趋势、岗位真实门槛、ATS 关键词缺口、常见淘汰模式。
 */
export function buildDeepResearchMemoPrompt(
  input: NormalizedInput,
  basicSummary: BasicSummary
): string {
  const truncatedJd = input.jd_text && input.jd_text.length > 600 ? input.jd_text.substring(0, 600) + '...' : input.jd_text || '无具体JD';
  const truncatedResume = input.resume_text.length > 1000 ? input.resume_text.substring(0, 1000) + '...' : input.resume_text;

  return `你是岗位市场研究专家。针对以下候选人简历和目标岗位，提供市场洞察研究。

## 输入
目标岗位: ${input.target_role}
${input.role_resolution ? `标准化岗位: ${input.role_resolution.canonical_role}
岗位族: ${input.role_resolution.role_family}
相关岗位: ${input.role_resolution.alt_roles.join('、') || '无'}
推断技能: ${input.role_resolution.skills_inferred.join('、') || '无'}` : ''}
JD: ${truncatedJd}

## 简历关键事实
- 工作经验: ${basicSummary.resume_facts.work_experience_count} 段
- 项目经验: ${basicSummary.resume_facts.project_count} 个
- 简历总长度: ${basicSummary.resume_facts.total_length} 字符
- 基础诊断已发现问题: ${basicSummary.core_issues_titles.length > 0 ? basicSummary.core_issues_titles.slice(0, 5).join('、') : '未发现明显问题'}
- 基础诊断评分: ${basicSummary.excellent_score ?? 'N/A'}

## 简历文本
${truncatedResume}

## 任务（输出纯文本，不要 JSON）
请按以下结构返回研究结果：

### 1. 岗位市场画像
- "${input.target_role}" 岗位当前市场竞争度
- 该岗位筛选中最被看重的 3-5 个硬技能
- 该岗位最常见的淘汰原因

### 2. ATS 关键词分析
- JD 中的关键术语和同义词（如果提供了 JD）
- 该岗位简历中 ATS 扫描高频词
- 候选人简历中可能缺失的关键词

### 3. 简历风险识别
- 基于此候选人背景，在真实筛选中最可能被淘汰的环节
- 与同岗位获面简历的典型差距

### 4. 增量建议
- 基础诊断未覆盖的具体改进方向
- 需要候选人补充的关键信息清单

## 约束
- 基于真实行业经验，不要泛泛而谈
- 不要编造此候选人不存在的项目或数据
- 聚焦"${input.target_role}"岗位的真实筛选标准`;
}

/**
 * buildDeepSynthesisPrompt — DeepSeek 专用最终 synthesis
 * 直接输出 FreeDiagnoseResponse 格式 JSON。
 *
 * 设计要求：
 * - 不重复基础诊断
 * - 明确增量价值
 * - 严格禁止编造数据
 * - 允许提出"需要用户补充"的字段
 */
export function buildDeepSynthesisPrompt(
  input: NormalizedInput,
  basicResult: FreeDiagnoseResponse,
  basicSummary: BasicSummary,
  researchMemo: string
): string {
  const truncatedJd = input.jd_text && input.jd_text.length > 600 ? input.jd_text.substring(0, 600) + '...' : input.jd_text || '无具体JD';
  const truncatedResume = input.resume_text.length > 1500 ? input.resume_text.substring(0, 1500) + '...' : input.resume_text;

  const basicIssuesList = basicResult.core_issues.length > 0
    ? basicResult.core_issues.map((issue, i) =>
        `${i + 1}. [${issue.title}] ${issue.summary}`
      ).join('\n')
    : '基础诊断未发现明显问题';

  return `你是深度简历诊断专家。请基于基础诊断结果和研究 memo，输出完整的深度诊断报告。

## 最高约束（违反任何一条将导致输出无效）
1. 【不重复基础诊断】基础诊断已经指出的问题，不要再原样复述。你要回答"除此之外还有什么"。
2. 【明确增量价值】每个核心问题必须说明"为什么基础诊断没说到这个"以及"为什么这很重要"。
3. 【严禁编造数据】只能基于简历中已有的信息做推断。不得编造项目、数据、公司。如需假设，标注"[需要你补充]"。
4. 【允许提问】如发现关键信息缺失，在 follow_up_question 中明确提出需要用户补充什么。
5. 【输出纯 JSON】必须返回合法的 FreeDiagnoseResponse 格式 JSON，且只输出 JSON，不要有任何额外的 markdown 代码块、解释文字或前缀后缀。
6. 【红队视角-证据绑定】（Phase 4 核心）ats_analysis / hr_analysis / interview_risk_analysis 中的每个高风险项必须附上 evidence_binding：
   - 必须从简历原文中引用具体片段作为 evidence
   - 必须指明 who_rejects（谁会因此拒绝：ats / hr_6s / hr_30s / interviewer）
   - 必须说明 why_rejects（拒绝的具体原因）
   - 不允许只输出文案式描述而没有证据绑定

## 枚举字段允许值（必须严格使用这些值）
- scenario: "normal", "excellent", "insufficient_input"
- quality_tier: "excellent", "strong", "medium", "weak"
- jd_relevance: "high", "medium", "low", "none"
- dimension: "structure", "role_fit", "evidence", "credibility", "expression", "missing_info", "other"
- severity: "must_fix", "should_fix", "optional", "nitpicky"
- probability: "high", "medium", "low", "very_low"
- impact_surface: "ats", "hr_6s", "hr_30s", "interview", "combined"
- enrichment_safety: "safe_expand", "needs_user_input", "forbidden_to_invent"
- source: "hr", "master", "both"
- risk_level: "low", "medium", "high"
- decision_estimate: "pass", "interview", "hold"

## 基础诊断结果（已知的，不要重复）
场景: ${basicResult.scenario}
主结论: ${basicResult.main_judgment}
核心问题列表:
${basicIssuesList}
质量等级: ${basicResult.quality_tier ?? 'N/A'}
评分: ${basicResult.excellent_score ?? 'N/A'}

## 研究 Memo（市场洞察参考）
${researchMemo || '研究服务未返回内容，请基于你的训练知识进行分析。'}

## 当前输入
目标岗位: ${input.target_role}
JD: ${truncatedJd}
简历全文:
${truncatedResume}

## 输出格式 — 必须返回以下 JSON 结构
\`\`\`json
{
  "scenario": "${basicResult.scenario}",
  "main_judgment": "深度诊断的核心发现（1句话，比基础诊断更具体、更深层）",
  "core_issues": [
    {
      "title": "问题标题（具体到可定位）",
      "summary": "问题说明：发生了什么、为什么严重",
      "evidence": "来自简历原文的证据（引用原文片段）",
      "insider_view": "HR/面试官视角：为什么这会导致淘汰",
      "suggestion": "具体改写建议或解决方案",
      "follow_up_question": "需要用户补充的信息（如无则留空）",
      "priority": 1,
      "jd_relevance": "high",
      "is_structural": false,
      "dimension": "structure",
      "screening_impact": "对简历筛选的具体影响"
    }
  ],
  "core_issues_summary": {
    "total_count": 1,
    "shown_count": 1
  },
  "priority_actions": [
    { "title": "立即行动项", "description": "具体怎么做" }
  ],
  "rewrite_direction": "整体改写的核心方向（一句话）",
  "minor_suggestions": [
    { "title": "小建议", "description": "具体描述" }
  ],
  "excellent_score": ${basicResult.excellent_score ?? 'null'},
  "deep_value_summary": "一句话总结本次深度诊断比基础诊断多了什么价值",
  "deep_report": {
    "deep_value_summary": "深度价值（50字内）",
    "current_vs_after_metrics": {
      "ats_match_rate": { "before": "当前估计", "after": "改进后估计" },
      "hr_6s_pass_rate": { "before": "当前估计", "after": "改进后估计" },
      "interview_risk": { "before": "当前风险", "after": "改进后风险" }
    },
    "problem_pool": {
      "must_fix": [ { "id": "p1", "title": "...", "severity": "must_fix", "probability": "high", "impact_surface": "ats", "evidence": "...", "why_it_hurts": "...", "basic_already_mentioned": false, "incremental_value": "...", "enrichment_safety": "safe_expand", "source": "hr", "dimension": "structure", "jd_relevance": "high", "is_structural": false } ],
      "should_fix": [],
      "optional_optimize": [],
      "nitpicky": []
    },
    "ats_analysis": {
      "risk_level": "medium",
      "keyword_gaps": ["缺失关键词"],
      "format_risks": ["格式风险"],
      "match_rate_estimate": "ATS匹配率估计",
      "keyword_gap_evidence": [{ "risk": "缺失'Spring'关键词", "evidence": "原文片段：'熟悉Java生态'", "who_rejects": "ats", "why_rejects": "ATS系统因缺少关键技能词直接过滤" }],
      "format_risk_evidence": [{ "risk": "联系方式格式不规范", "evidence": "原文片段：'邮箱：admin@', "who_rejects": "ats", "why_rejects": "ATS无法正确解析非标准邮箱格式" }]
    },
    "hr_analysis": {
      "risk_level": "medium",
      "six_second_risks": ["6秒扫描风险"],
      "thirty_second_risks": ["30秒审阅风险"],
      "decision_estimate": "pass",
      "six_second_risk_evidence": [{ "risk": "工作经历顺序混乱", "evidence": "原文片段：'2019年-2021年：销售助理；2021年-2023年：产品运营'", "who_rejects": "hr_6s", "why_rejects": "HR在6秒扫描时无法快速定位最近的工作经历" }],
      "thirty_second_risk_evidence": [{ "risk": "量化数据缺失", "evidence": "原文片段：'负责用户增长工作'", "who_rejects": "hr_30s", "why_rejects": "没有量化数据支撑，HR无法判断实际贡献大小" }]
    },
    "interview_risk_analysis": {
      "likely_questions": ["可能被追问的问题"],
      "weak_points": ["面试暴露的弱点"],
      "preparation_suggestions": ["准备建议"],
      "weak_point_evidence": [{ "risk": "项目复杂度不足", "evidence": "原文片段：'主导了用户增长模块开发'", "who_rejects": "interviewer", "why_rejects": "面试官追问项目细节时，无法说清技术难点和解决方案" }]
    },
    "content_expansion_plan": {
      "safe_expand": [{ "location": "可安全展开的段落", "suggestion": "怎么展开" }],
      "needs_user_input": [{ "location": "需补充的段落", "question": "需要用户提供什么" }],
      "forbidden_to_invent": ["严禁编造的内容"]
    },
    "rewrite_pack": [
      { "original": "原文", "rewritten": "改写后（用[需要你补充]标注需用户填充处）", "change_summary": "改了什么" }
    ],
    "impact_projection": {
      "score_improvement_estimate": "分数提升估计",
      "ats_pass_probability": "ATS通过率",
      "hr_pass_probability": "HR通过率",
      "interview_probability": "面试邀请率"
    },
    "action_plan": {
      "immediate_actions": ["立即行动"],
      "requires_user_input": ["需要用户补充"],
      "optional_improvements": ["可选优化"]
    }
  }
}
\`\`\`

## 回答的核心问题
深度诊断必须回答：
1. 为什么当前简历拿不到面试？（比基础诊断更深的原因链）
2. 如何改才能明显提高拿面试的概率？（具体的、可落地的改写方案）
3. 改了之后预期效果如何？（量化的改进预估）`;
}
