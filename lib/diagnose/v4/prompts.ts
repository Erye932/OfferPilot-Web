/**
 * V4 工作流 — 所有 Prompt 构造函数
 *
 * 风格基调（"操盘手风格"）：
 * - 报告读者：你（操盘手），不是求职者
 * - 不要鼓励、不要兜底、不要客套
 * - 直接出问题、给证据、指出风险
 * - 信息密度高，可复制，能溯源
 * - 严格 JSON 输出，禁止 markdown / 解释性话术
 */

import type { NormalizedInput, V4Dimension } from '../types';
import { SECTION_LABELS, V4_DIMENSION_LABELS } from '../types';
import type {
  BaseAnalyzerOutput,
  HrSimulatorOutput,
  ResumeMasterOutput,
  CredibilityCheckOutput,
  JdKeywordCoverageOutput,
  SelfCritiqueOutput,
  RoleStudyOutput,
  HrInsiderOutput,
  ResearchContext,
} from './schemas';

// ════════════════════════════════════════════════════════════════
// 工具函数：打包简历段落上下文（统一格式）
// ════════════════════════════════════════════════════════════════

function buildSectionsContext(input: NormalizedInput): string {
  return input.resume_sections
    .map((s, idx) => {
      const label = SECTION_LABELS[s.type] ?? s.type;
      return `[段落 ${idx} | type=${s.type} | label=${label}]\n${s.content}`;
    })
    .join('\n\n');
}

function buildJdContext(input: NormalizedInput): string {
  if (!input.jd_text || input.jd_text.trim().length === 0) {
    return '（无 JD 提供，请基于目标岗位通用要求评估）';
  }
  const kw = input.jd_keywords.length > 0 ? `\n提取关键词: ${input.jd_keywords.join(', ')}` : '';
  return `JD 文本:\n${input.jd_text}${kw}`;
}

function buildRoleContext(input: NormalizedInput): string {
  const r = input.role_resolution;
  if (!r) return `目标岗位: ${input.target_role}`;
  return `目标岗位: ${input.target_role}
  规范名称: ${r.canonical_role}
  族系: ${r.role_family}
  推断技能: ${r.skills_inferred.slice(0, 8).join(', ')}`;
}

const COMMON_JSON_RULES = `
【输出严格要求】
1. 只输出一个 JSON 对象，不要任何解释、前言、markdown 包裹、代码块标记
2. 所有字符串必须用双引号
3. 中文使用 UTF-8，不要转义
4. 不要在最终 JSON 外添加任何文字
5. 严格按照下方 schema 输出，多余字段会被忽略，缺失必填字段会失败
6. 可选字段不需要时用 null（不要写 undefined）
7. 枚举字段必须使用规定的英文标识符（如段落类型必须用 "education"、"internship" 等英文，不能用"教育"、"实习"等中文）`;

// ─── 共用 enum 字符串（直接拼到 prompt 中告诉 AI 合法值）────
const SECTION_ENUM = '"personal_info" | "education" | "work_experience" | "internship" | "project" | "skill" | "self_evaluation" | "certificate" | "other"';
const DIMENSION_ENUM = '"structure" | "expression" | "evidence" | "role_fit" | "credibility"';
const STATUS_ENUM = '"ok" | "warn" | "problem" | "missing"';
const SEVERITY_ENUM = '"must_fix" | "should_fix" | "optional" | "nitpicky"';
const FIX_TYPE_ENUM = '"safe_expand" | "needs_user_input" | "forbidden_to_invent"';
const IMPACT_ENUM = '"ats" | "hr_6s" | "hr_30s" | "interview" | "combined"';
const CRED_CONCERN_ENUM = '"numeric_doubt" | "overclaim" | "skill_stuffing" | "timeline_conflict" | "vague_role"';

const STYLE_RULES = `
【风格要求】
- 报告给"猎头/操盘手"看，不是求职者本人
- 不要鼓励、不要安慰、不要客套话
- 直接定问题，给证据原句，量化影响
- 信息密度高于温度
- 引用简历原句时一字不改`;

// ════════════════════════════════════════════════════════════════
// Step 1: BaseAnalyzer
// ════════════════════════════════════════════════════════════════

export function buildBaseAnalyzerPrompt(input: NormalizedInput, research?: ResearchContext): string {
  const researchSnippet = buildResearchContextSnippet(research, {
    includeRoleCore: true,
    includeRoleRedFlags: true,
  });

  return `你是简历质量快速分析师。任务：用最快速度对简历做 6 维度初评，不深入挖掘细节。
${STYLE_RULES}
${researchSnippet}
【目标岗位】
${buildRoleContext(input)}

【简历段落（已结构化）】
${buildSectionsContext(input)}

${input.jd_text ? `【JD】\n${buildJdContext(input)}\n` : ''}

【6 个维度的评分定义】
- structure (结构): 段落清晰度、信息层级、排版友好度
- expression (表达): 动词使用、句式紧凑度、专业术语
- evidence (证据): 量化数字、具体性、可验证程度
- role_fit (岗位贴合): 经历与目标岗位的匹配深度
- credibility (可信度): 表述是否客观、数字是否可信、表达是否克制
- missing_info (信息缺失): 应说而未说的关键字段（公司名/时长/量化/技术栈）

每维度打 0-100 分。85+ 是 excellent，70-84 strong，55-69 medium，<55 weak。

【输出 JSON schema】
{
  "dimension_scores": {
    "structure": <number 0-100>,
    "expression": <number 0-100>,
    "evidence": <number 0-100>,
    "role_fit": <number 0-100>,
    "credibility": <number 0-100>,
    "missing_info": <number 0-100>
  },
  "overall_grade": "excellent" | "strong" | "medium" | "weak",
  "one_line_verdict": "<不超过 30 字的一句话定性，专业尖锐>",
  "key_facts": {
    "experience_level": "senior" | "junior" | "neutral",
    "has_internship": <boolean>,
    "has_full_time": <boolean>,
    "project_count": <number>,
    "quantified_achievements_count": <number 简历里能数出多少条带数字的成就>,
    "estimated_total_months_of_experience": <number 总实习/工作月数估值>
  },
  "red_flags": [<最关键的 1-3 条全局红旗，简短>]
}
${COMMON_JSON_RULES}`;
}

// ════════════════════════════════════════════════════════════════
// Step 3a: HrSimulator
// ════════════════════════════════════════════════════════════════

export function buildHrSimulatorPrompt(
  input: NormalizedInput,
  base: BaseAnalyzerOutput,
  research?: ResearchContext
): string {
  const researchSnippet = buildResearchContextSnippet(research, {
    includeHrFocus: true,
    includeHrEliminate: true,
    includeCandidateProfile: true,
  });

  return `你是资深 HR 招聘经理（${input.target_role}方向）。任务：模拟你拿到这份简历后的两个真实环节：
1. **6 秒扫描**：眼睛只扫标题/公司名/学历/排版，决定要不要继续看
2. **30 秒细看**：开始读量化数字、JD 匹配、可信度，决定要不要约面试

${STYLE_RULES}
${researchSnippet}
【目标岗位】
${input.target_role}

【简历段落】
${buildSectionsContext(input)}

${input.jd_text ? `【JD】\n${buildJdContext(input)}\n` : ''}

【BaseAnalyzer 初评结论（参考）】
- one_line_verdict: ${base.one_line_verdict}
- overall_grade: ${base.overall_grade}
- red_flags: ${base.red_flags.join('; ')}

【你的任务】
- 6 秒环节：只输出 6 秒能看到的问题（公司名缺失/学校档次/格式混乱/不知道想申什么岗位）
- 30 秒环节：开始挖量化、JD 匹配、表述可信度、是否会进面
- 每条 finding 必须配一句简历原文 evidence_quote（精确摘录）
- finding 要尖锐具体，避免"建议优化结构"这种空话
- evidence_quote 必须是简历**原文**中出现过的字句，严禁填入你自己的评论、总结或判断；如果某条 finding 是「某东西未出现」，则填上下文里最接近该问题的原句

【输出 JSON schema】
{
  "six_second": {
    "decision": "continue_reading" | "skip_likely" | "skip",
    "impression": "<6 秒后第一印象，不超过 40 字>",
    "findings": [
      {
        "finding": "<一句话问题>",
        "evidence_quote": "<简历原句精确摘录>",
        "section": ${SECTION_ENUM},
        "severity": ${SEVERITY_ENUM},
        "why_rejects": "<为什么这条让我想跳过>"
      }
    ]
  },
  "thirty_second": {
    "decision": "interview" | "hold" | "reject",
    "impression": "<30 秒判断，不超过 50 字>",
    "findings": [<同上结构，但聚焦量化/JD/可信度>]
  },
  "overall_hr_risk": "low" | "medium" | "high"
}

每个环节给 3-8 条 findings。
${COMMON_JSON_RULES}`;
}

// ════════════════════════════════════════════════════════════════
// Step 3b: ResumeMaster
// ════════════════════════════════════════════════════════════════

export function buildResumeMasterPrompt(
  input: NormalizedInput,
  base: BaseAnalyzerOutput,
  research?: ResearchContext
): string {
  const researchSnippet = buildResearchContextSnippet(research, {
    includeRolePatterns: true,
    includeRoleJargon: true,
    includeCandidateProfile: true,
    includeRoleMatch: true,
  });

  return `你是顶级简历改写专家（${input.target_role}方向）。任务：对每个段落给出最关键的改写示范 + 表达层提醒。
${STYLE_RULES}
${researchSnippet}

【目标岗位】
${buildRoleContext(input)}

【简历段落】
${buildSectionsContext(input)}

${input.jd_text ? `【JD】\n${buildJdContext(input)}\n` : ''}

【BaseAnalyzer 初评（参考）】
${base.one_line_verdict}

【你的任务】
对**每个有内容的段落**，输出 1-3 条最关键的改写示范：
- original: 简历原句
- rewritten: 改写后的句子
- what_changed: 简短说明改了什么（如"加入量化数字"、"动词换成主动式"）
- enrichment_safety:
  - safe_expand: 基于已有信息扩充语言/动词，不编造
  - needs_user_input: 需要用户提供数字/技术栈才能完整改写
  - forbidden_to_invent: 禁止编造（如经历/职位/学历）

同时输出该段落的 expression_notes（表达提醒，无 rewrite）。

最后给全局 structure 问题（影响多个段落的）。

【输出 JSON schema】
{
  "rewrite_strategy": "<一段话，整体改写思路，不超过 100 字>",
  "section_advice": [
    {
      "section": ${SECTION_ENUM},
      "rewrite_examples": [
        {
          "original": "<原句>",
          "rewritten": "<改后>",
          "what_changed": "<改了什么>",
          "enrichment_safety": ${FIX_TYPE_ENUM}
        }
      ],
      "expression_notes": [
        {
          "title": "<提醒标题>",
          "one_liner": "<一句话>",
          "severity": ${SEVERITY_ENUM},
          "evidence_quote": "<可选：原句>"
        }
      ]
    }
  ],
  "global_structure_issues": [
    {
      "title": "<标题>",
      "one_liner": "<一句话>",
      "severity": ${SEVERITY_ENUM},
      "affected_sections": [<段落类型，每项必须是 ${SECTION_ENUM}>]
    }
  ]
}

【注意】rewritten 必须有具体改进可量化，避免"加强了表达"这种空话。
${COMMON_JSON_RULES}`;
}

// ════════════════════════════════════════════════════════════════
// Step 3c: JdKeywordCoverage
// ════════════════════════════════════════════════════════════════

export function buildJdKeywordCoveragePrompt(
  input: NormalizedInput,
  research?: ResearchContext
): string {
  const researchSnippet = buildResearchContextSnippet(research, {
    includeRoleCore: true,
  });

  return `你是 ATS 关键词匹配引擎。任务：从 JD 提取必备/加分关键词，反向扫描简历命中情况。如果提供了「行业研究 · 该岗位核心能力清单」，可参考作为 must_have / nice_to_have 候选补充。
${STYLE_RULES}
${researchSnippet}

【目标岗位】
${input.target_role}

【JD】
${buildJdContext(input)}

【简历段落】
${buildSectionsContext(input)}

【你的任务】
1. 从 JD 中提取 must_have 关键词（核心技能/必备技术/工作年限/学历要求等）— 5-10 个
2. 提取 nice_to_have 关键词（加分项）— 3-8 个
3. 对每个关键词，扫描简历是否命中，命中在哪些段落
4. 输出 missing_critical（必备但未覆盖）
5. 估算 must_have 覆盖率 0-1
6. 估算 ATS 通过预期（如 "70-85%" / "卡 must_have 4 项缺 2"）

【匹配规则】
- 关键词命中需要严格语义匹配（"SQL" 命中 "SQL"，但 "数据" 不命中 "Python"）
- 同义词允许命中（"机器学习" / "ML" / "machine learning"）
- 工作年限要求和经验匹配也要列入

【输出 JSON schema】
{
  "must_have": [
    {
      "keyword": "<关键词>",
      "covered": <boolean>,
      "section_hits": [<每项必须是 ${SECTION_ENUM}>]
    }
  ],
  "nice_to_have": [<同上>],
  "missing_critical": [<缺失的 must_have 关键词>],
  "coverage_rate": <0-1 数字>,
  "ats_pass_estimate": "<预期通过率描述>"
}
${COMMON_JSON_RULES}`;
}

// ════════════════════════════════════════════════════════════════
// Step 3d: CredibilityCheck
// ════════════════════════════════════════════════════════════════

export function buildCredibilityCheckPrompt(
  input: NormalizedInput,
  base: BaseAnalyzerOutput,
  research?: ResearchContext
): string {
  const researchSnippet = buildResearchContextSnippet(research, {
    includeHrEliminate: true,
    includeInternalSignals: true,
  });

  return `你是简历可信度审查官（红队视角）。任务：找出**不可信、过度声称、技能堆砌、时间冲突、角色模糊**的问题。
${STYLE_RULES}
${researchSnippet}

【目标岗位】
${input.target_role}

【关键事实参考（来自 BaseAnalyzer）】
- 经验级别: ${base.key_facts.experience_level}
- 是否有实习: ${base.key_facts.has_internship}
- 是否有全职: ${base.key_facts.has_full_time}
- 项目数: ${base.key_facts.project_count}
- 量化产出条数: ${base.key_facts.quantified_achievements_count}
- 总经验月数估算: ${base.key_facts.estimated_total_months_of_experience}

【简历段落】
${buildSectionsContext(input)}

【五种可信度问题分类（必须用这 5 类之一）】
1. numeric_doubt: 数字主张不可信
   - 例：应届生宣称"提升 GMV 50%"、"DAU 提升 200%"等过分指标
2. overclaim: 过度声称
   - 例："主导/独立完成/担任 Owner" + 资历明显不符
3. skill_stuffing: 技能堆砌
   - 例：列出 8+ 编程语言但项目只用了 1 种；技能与项目无对应证据
4. timeline_conflict: 时间线冲突
   - 例：同时段两段全职、与在校时间冲突、跨度太短不合理
5. vague_role: 角色模糊
   - 例：通篇"参与"、"协助"、"配合"，无可证伪的具体贡献

【你的任务】
- 仔细对照简历内容，找出可信度问题（如有）
- 每条 flag 给出 evidence_quote、section、severity
- 给操盘手 question_for_candidate（操盘手该如何向客户问清楚）
- 整体可信度评级：trustworthy / mostly_credible / suspicious / high_risk

【输出 JSON schema】
{
  "flags": [
    {
      "type": ${CRED_CONCERN_ENUM},
      "description": "<具体描述>",
      "evidence_quote": "<简历原句>",
      "section": ${SECTION_ENUM},
      "severity": "high" | "medium" | "low",
      "question_for_candidate": "<可选：建议操盘手问候选人什么；不需要时填 null>"
    }
  ],
  "overall_credibility": "trustworthy" | "mostly_credible" | "suspicious" | "high_risk",
  "summary_for_operator": "<给操盘手的一句话总结>"
}

【重要】
- 如果简历可信，flags 可以为空数组 []，但仍要给 summary_for_operator
- 不要因为简历短就强行找问题，但也不要漏掉真正可疑的地方
- evidence_quote 必须是简历**原文**中的字句，严禁填入你的判断话
${COMMON_JSON_RULES}`;
}

// ════════════════════════════════════════════════════════════════
// Step 4: SelfCritiqueLoop — 改完再审
// ════════════════════════════════════════════════════════════════

export function buildSelfCritiquePrompt(
  input: NormalizedInput,
  base: BaseAnalyzerOutput,
  master: ResumeMasterOutput,
  hrBefore: HrSimulatorOutput,
  research?: ResearchContext
): string {
  const researchSnippet = buildResearchContextSnippet(research, {
    includeRoleCore: true,
    includeHrBaseline: true,
    includeCandidateProfile: true,
    includeRoleMatch: true,
    includeInternalSignals: true,
  });
  // 提取关键 rewrite_examples（仅 must_fix / should_fix 的改写）
  const keyRewrites = master.section_advice.flatMap((s) =>
    s.rewrite_examples
      .filter((r) => r.enrichment_safety !== 'forbidden_to_invent')
      .slice(0, 2)
      .map((r) => `[${SECTION_LABELS[s.section] ?? s.section}] ${r.original} → ${r.rewritten}`)
  );

  return `你是改前/改后效果模拟器。任务：假设候选人**严格按照 ResumeMaster 的所有 must_fix 改写**完成简历，重新用 HR 视角审一遍。
${STYLE_RULES}
${researchSnippet}

【原版简历段落】
${buildSectionsContext(input)}

${input.jd_text ? `【JD】\n${buildJdContext(input)}\n` : ''}

【ResumeMaster 提供的关键改写】
${keyRewrites.slice(0, 12).join('\n')}

【改前 HR 视角结论】
- 6 秒决策: ${hrBefore.six_second.decision}
- 30 秒决策: ${hrBefore.thirty_second.decision}
- 整体 HR 风险: ${hrBefore.overall_hr_risk}

【改前各维度分】
- structure: ${base.dimension_scores.structure}
- expression: ${base.dimension_scores.expression}
- evidence: ${base.dimension_scores.evidence}
- role_fit: ${base.dimension_scores.role_fit}
- credibility: ${base.dimension_scores.credibility}
- missing_info: ${base.dimension_scores.missing_info}

【你的任务】
1. 想象改写后的简历会是什么样子（不需要写完整简历，描述关键变化）
2. 用 HR 视角重新审改写后的版本
3. 给出 after_metrics（改后预估指标）
4. 总结主要改进
5. 列出改写后**仍然存在**的问题（残留问题）

【关键】
- after_metrics 必须比 before 真实改善，但**不能虚高**
- **hr_6s_pass 的 before 与 after 必须拉开明显差距**，不要出现「可能停留」→「可能停留细看」这种几乎同义的表述；如果改后效果提升有限，宁可说「仍会被跳过」
- 必须说出 remaining_issues（即使是吹毛求疵的小问题）
- 如果某些 must_fix 是 needs_user_input 类的，模拟时假设"用户给了合理输入"

【输出 JSON schema】
{
  "imagined_after_resume_summary": "<不超过 200 字，描述改写后简历整体面貌>",
  "after_metrics": {
    "overall_score": <number 0-100>,
    "hr_6s_pass": "<改后 6 秒判断，如 '可能停留细看'>",
    "ats_match": "<改后 ATS 匹配率，如 '78%'>",
    "interview_risk": "low" | "medium" | "high",
    "decision_estimate": "interview" | "hold" | "reject"
  },
  "improvement_summary": "<一句话总结：改前 vs 改后的关键变化>",
  "remaining_issues": [<改写后仍然存在的问题，如 '学校层次不足' / '行业切换风险'>]
}
${COMMON_JSON_RULES}`;
}

// ════════════════════════════════════════════════════════════════
// Step 5: FinalSynthesis — 合成 V4Comment 列表
// ════════════════════════════════════════════════════════════════

export function buildFinalSynthesisPrompt(
  input: NormalizedInput,
  base: BaseAnalyzerOutput,
  hr: HrSimulatorOutput,
  master: ResumeMasterOutput,
  credibility: CredibilityCheckOutput,
  jdCoverage: JdKeywordCoverageOutput | null,
  selfCritique: SelfCritiqueOutput,
  ruleBasedMissingTitles: string[],
  research?: ResearchContext
): string {
  // FinalSynthesis 是 prompt 最长 + 输出最复杂的 step
  // 仅注入最必要的研究子集，避免 prompt 超长导致 AI 输出 JSON 错乱
  // InternalSignals / RoleMatch 已在 SelfCritique 阶段被消化过，这里不再重复
  const researchSnippet = buildResearchContextSnippet(research, {
    includeRoleCore: true,
    includeRoleRedFlags: true,
    includeHrEliminate: true,
    includeCandidateProfile: true,
  });
  const dimensionList = (Object.entries(V4_DIMENSION_LABELS) as [V4Dimension, string][])
    .map(([k, v]) => `- ${k} (${v})`)
    .join('\n');

  return `你是诊断报告合成器。任务：把上游所有分析结果 + 研究产物整合成统一的 V4Comment 列表 + 总评 + 风险结论。
${STYLE_RULES}
${researchSnippet}

【目标岗位】${input.target_role}
【6 个维度】
${dimensionList}

【上游分析摘要】

▼ BaseAnalyzer
  one_line_verdict: ${base.one_line_verdict}
  overall_grade: ${base.overall_grade}
  red_flags: ${base.red_flags.join('; ')}

▼ HrSimulator
  6 秒 decision: ${hr.six_second.decision}, impression: ${hr.six_second.impression}
  6 秒 findings: ${hr.six_second.findings.length} 条
  30 秒 decision: ${hr.thirty_second.decision}, impression: ${hr.thirty_second.impression}
  30 秒 findings: ${hr.thirty_second.findings.length} 条
  HR 风险: ${hr.overall_hr_risk}

▼ ResumeMaster
  策略: ${master.rewrite_strategy}
  section_advice: ${master.section_advice.length} 段
  global_structure_issues: ${master.global_structure_issues.length} 条

▼ CredibilityCheck
  flags: ${credibility.flags.length} 条
  overall_credibility: ${credibility.overall_credibility}
  summary: ${credibility.summary_for_operator}

▼ ${jdCoverage ? `JdCoverage:
  must_have: ${jdCoverage.must_have.length}, missing_critical: ${jdCoverage.missing_critical.join(', ') || '无'}
  coverage_rate: ${jdCoverage.coverage_rate}` : '（无 JD 提供）'}

▼ SelfCritique
  改后: ${selfCritique.improvement_summary}
  remaining_issues: ${selfCritique.remaining_issues.join('; ')}

【已由规则探针生成的 missing_info 评论（不要重复）】
${ruleBasedMissingTitles.length > 0 ? ruleBasedMissingTitles.map((t) => `- ${t}`).join('\n') : '（无）'}

【你的任务】
1. 把所有上游 findings/notes/flags 整合成统一的 V4Comment 列表（**不要包含 missing_info 维度** — 那个由规则探针出）
2. 每条 comment 必须包含全部字段（按 schema）
3. impact_on 是 ['ats' | 'hr_6s' | 'hr_30s' | 'interview' | 'combined'] 数组
4. status 决定颜色：ok=良好 / warn=提醒 / problem=问题 / missing=信息缺失
5. dimension 选 5 个之一: structure / expression / evidence / role_fit / credibility（不要 missing_info）
6. 输出 total_assessment（操盘手风格的总评，3-6 句）
7. 输出 risks 三档（ats_risk / hr_risk / interview_risk）

【数量要求】
- comments: 至少 12 条，最多 30 条（不含规则探针的 missing_info）
- 同一段落同一维度可以有多条
- 必须有 rewrite 字段的 comment（来自 master.rewrite_examples）至少 3 条

【质量要求（重要）】
- evidence_quote 必须是简历**原文中出现过的字句原文摄取**，严禁填入你自己的评论、总结、「未如何何」这种描述性话术。如果某条 comment 是「某东西未出现」，则填上下文里最接近该问题的句子
- 三档 risks (ats / hr / interview) **不要都填 high**，需要根据上下文分档；仅当某个维度确实重度危险时才 high；默认中等面试者应该是 medium
- 如果提供了「研究阶段输出」，你必须在 total_assessment / why_it_hurts 中体现出「对照行业研究看」的思路，不要只说「你的简历怎么怎么」，要说「对比该岗位标师，你缺 / 你多出」

【输出 JSON schema】
{
  "comments": [
    {
      "section": ${SECTION_ENUM},
      "section_label": "<段落显示名，如 '实习经历 · 字节跳动'>",
      "dimension": ${DIMENSION_ENUM},
      "status": ${STATUS_ENUM},
      "severity": ${SEVERITY_ENUM},
      "title": "<简短标题>",
      "one_liner": "<一句话定性>",
      "why_it_hurts": "<1-3 句讲清问题机制>",
      "impact_on": [<每项必须是 ${IMPACT_ENUM}>],
      "fix_type": ${FIX_TYPE_ENUM},
      "evidence_quote": "<简历原句精确摘录>",
      "evidence_location": { "paragraph_index": <number 可选>, "text_snippet": "<可选>" },
      "rewrite": null | { "before": "...", "after": "...", "what_changed": "..." },
      "insider_view": "<可选：行业人视角；不需要时填 null>",
      "source": "hr" | "master" | "credibility" | "jd_coverage" | "self_critique" | "cross",
      "credibility_concern": <可选：${CRED_CONCERN_ENUM}；不适用时填 null>
    }
  ],
  "total_assessment": "<总评，3-6 句，操盘手风格>",
  "scenario": "normal" | "excellent" | "insufficient_input",
  "risks": {
    "ats_risk": { "level": "low" | "medium" | "high", "reasons": [<原因数组>] },
    "hr_risk": { "level": "low" | "medium" | "high", "reasons": [<原因数组>] },
    "interview_risk": { "level": "low" | "medium" | "high", "reasons": [<原因数组>] }
  }
}
${COMMON_JSON_RULES}`;
}

// ════════════════════════════════════════════════════════════════
// Research Phase: R2 RoleStudy
// ════════════════════════════════════════════════════════════════

/**
 * R2-A: Metaso 查询（自由文本，让秘塔搜索引擎做深度调研）
 * 注意：返回的是网页 snippet 集合，不是结构化结果，需要 R2-B 蒸馏
 */
export function buildRoleStudyQueryPrompt(input: NormalizedInput): string {
  const role = input.target_role;
  const r = input.role_resolution;
  const canonical = r?.canonical_role || role;
  const family = r?.role_family || '';
  const skills = r?.skills_inferred?.slice(0, 5).join('、') || '';

  // 给 metaso provider 用的 prompt 格式（它会从中提取关键词）
  return `目标岗位: ${role}
标准化岗位: ${canonical}
岗位族: ${family}
推断技能: ${skills || '无'}
JD: ${input.jd_text ? input.jd_text.slice(0, 200) : '无'}

任务：研究该岗位的核心能力要求、招聘市场标准、top 简历常见结构、行业 jargon、red flags`;
}

/**
 * R2-B: DeepSeek 蒸馏（把 Metaso 返回的网页 snippet 归纳成结构化研究备忘）
 */
export function buildRoleStudyDistillPrompt(
  input: NormalizedInput,
  rawMaterial: string
): string {
  return `你是行业研究员。任务：把下面的网页材料**归纳**成关于"${input.target_role}"岗位的结构化研究备忘。
${STYLE_RULES}

【目标岗位】
${buildRoleContext(input)}

【原始网页材料（来自 Metaso 搜索）】
${rawMaterial.slice(0, 8000)}

【你的任务】
不是简单复述材料，而是**抽取并归纳**：
1. core_capabilities (4-6 条)：该岗位 must-have 能力
   - name: 能力名（具体可证伪，如"财务三大表分析"而不是"财务知识"）
   - description: 一句话讲清这能力是什么
   - why_it_matters: 为什么这岗位非要不可（不能含糊）
2. bonus_capabilities (2-4 条)：加分能力
3. top_resume_patterns (3-5 条)：top 简历常见结构 / 表达模式（如"用动词开头量化"、"实习按 STAR 法则展开"）
4. red_flags (2-4 条)：该岗位简历常见红旗（如"自我评价过长"、"技能堆砌"）
5. industry_jargon (5-10 个)：行业 jargon（用来检测候选人是否真的圈内人）

【关键】
- 如果材料质量低（重复 / 偏题 / 内容农场），只抽你能确定的部分，meta.data_confidence 标 'low'
- 如果材料丰富、专业，meta.data_confidence 标 'high'
- 不要编造材料里没有的内容，但允许基于材料合理推理
- 引用材料时不需要写来源，专心写洞察

【输出 JSON schema】
{
  "core_capabilities": [
    { "name": "<能力名>", "description": "<是什么>", "why_it_matters": "<为什么必备>" }
  ],
  "bonus_capabilities": [
    { "name": "<能力名>", "description": "<是什么>" }
  ],
  "top_resume_patterns": ["<模式1>", "<模式2>", ...],
  "red_flags": [
    { "flag": "<红旗描述>", "why_critical": "<为什么严重>" }
  ],
  "industry_jargon": ["<jargon1>", "<jargon2>", ...],
  "meta": {
    "sources_count": <number 网页数>,
    "data_confidence": "high" | "medium" | "low",
    "notes": "<可选：研究员备注，材料质量 / 局限>"
  }
}
${COMMON_JSON_RULES}`;
}

// ════════════════════════════════════════════════════════════════
// Research Phase: R3 HrInsider
// ════════════════════════════════════════════════════════════════

/**
 * R3-A: Metaso 查询
 */
export function buildHrInsiderQueryPrompt(input: NormalizedInput): string {
  const role = input.target_role;
  const r = input.role_resolution;
  const canonical = r?.canonical_role || role;
  const family = r?.role_family || '';

  return `目标岗位: ${role}
标准化岗位: ${canonical}
岗位族: ${family}
JD: ${input.jd_text ? input.jd_text.slice(0, 200) : '无'}

任务：研究招聘 ${role} 岗位的 HR 视角 — 6 秒筛选逻辑、30 秒细看关注点、常见淘汰理由、不同梯队期待基线、HR 喜欢的简历表达风格`;
}

/**
 * R3-B: DeepSeek 蒸馏
 */
export function buildHrInsiderDistillPrompt(
  input: NormalizedInput,
  rawMaterial: string
): string {
  return `你是招聘行业研究员。任务：把下面的网页材料**归纳**成"${input.target_role}岗位的 HR 视角研究备忘"。
${STYLE_RULES}

【目标岗位】
${buildRoleContext(input)}

【原始网页材料（来自 Metaso 搜索）】
${rawMaterial.slice(0, 8000)}

【你的任务】
归纳出该岗位真实的 HR 视角（不是通用 HR 套路）：

1. six_second_focus (3-5 条)：HR 6 秒主要看什么（岗位特化）
   - 例（数据分析师）：先看是否有 SQL/Python 关键词、看公司名档次、看学校
   - 例（会计师）：先看资格证（CPA/初级会计证）、看实习单位是否四大或事务所
2. thirty_second_focus (3-5 条)：30 秒细看什么
3. preferred_language_patterns (3-5 条)：HR 喜欢的简历语言风格
   - 例：用动词开头、用数字量化、用行业 jargon 自然融入
4. common_eliminate_reasons (4-7 条)：该岗位 HR 常见淘汰理由（按频率）
5. expectation_baseline：不同梯队期待基线
   - fresh_grad: 应届的最低期待是什么
   - junior_1_3y: 1-3 年的期待
   - mid_3_5y: 3-5 年的期待

【关键】
- 不要写"通用 HR 套路"，必须是该岗位特化的
- 材料不足时 meta.data_confidence 标 'low'，但仍尽力归纳
- 必须有 expectation_baseline 三档，每档至少 1 句具体描述

【输出 JSON schema】
{
  "six_second_focus": ["<重点1>", "<重点2>", ...],
  "thirty_second_focus": ["<重点1>", "<重点2>", ...],
  "preferred_language_patterns": ["<风格1>", "<风格2>", ...],
  "common_eliminate_reasons": [
    { "reason": "<淘汰理由>", "frequency": "very_common" | "common" | "occasional" }
  ],
  "expectation_baseline": {
    "fresh_grad": "<应届基线>",
    "junior_1_3y": "<1-3年基线>",
    "mid_3_5y": "<3-5年基线>"
  },
  "meta": {
    "sources_count": <number>,
    "data_confidence": "high" | "medium" | "low",
    "notes": "<可选>"
  }
}
${COMMON_JSON_RULES}`;
}

// ════════════════════════════════════════════════════════════════
// Research Phase: R5 ResumeStudy（吃 R2/R3 当参考系，纯 DeepSeek）
// ════════════════════════════════════════════════════════════════

export function buildResumeStudyPrompt(
  input: NormalizedInput,
  roleStudy: RoleStudyOutput,
  hrInsider: HrInsiderOutput
): string {
  const coreCapsList = roleStudy.core_capabilities
    .map((c, i) => `  ${i + 1}. ${c.name} — ${c.description}`)
    .join('\n');
  const redFlagsList = roleStudy.red_flags
    .map((f, i) => `  ${i + 1}. ${f.flag}`)
    .join('\n');
  const eliminateReasonsList = hrInsider.common_eliminate_reasons
    .map((r, i) => `  ${i + 1}. ${r.reason} (${r.frequency})`)
    .join('\n');

  return `你是简历研究员（不是诊断者）。任务：以"研究员视角"通读简历，**先研究透**这份简历是什么、候选人画像如何，**再交给后续诊断步骤使用**。

注意：你**不是在打分、不是在评诊断**，你只是在做研究。研究产物会喂给后续的 BaseAnalyzer / HrSimulator / ResumeMaster / Credibility / SelfCritique / FinalSynthesis 作为参考系。

${STYLE_RULES}

【目标岗位】
${buildRoleContext(input)}

【RoleStudy 提供的岗位核心能力】
${coreCapsList || '  （无）'}

【RoleStudy 提供的该岗位常见 red flags】
${redFlagsList || '  （无）'}

【HrInsider 提供的 HR 常见淘汰理由】
${eliminateReasonsList || '  （无）'}

【HrInsider 提供的期待基线】
- fresh_grad: ${hrInsider.expectation_baseline.fresh_grad}
- junior_1_3y: ${hrInsider.expectation_baseline.junior_1_3y}
- mid_3_5y: ${hrInsider.expectation_baseline.mid_3_5y}

${input.jd_text ? `【JD】\n${buildJdContext(input)}\n` : ''}

【简历段落（已结构化）】
${buildSectionsContext(input)}

【你的研究任务】
1. **候选人画像**（candidate_profile）
   - seniority_tier: 客观判断梯队（fresh_grad / junior_1_3y / mid_3_5y / senior_5y_plus）
   - real_skill_estimate: 候选人**真实**的能力水平估计（与 seniority 可能不一致，如"应届但有 1-2 年从业者水平"）
   - packaging_intent: 候选人想包装的**形象**（如"明显在包装为 xxx 方向"、"试图避开 xxx 短板"）

2. **简历内部信号**（internal_signals）— 至少 4 条
   - type: contradiction（矛盾） / red_flag（红旗） / overclaim（过度声称） / gap（缺口） / strength（亮点）
   - description: 是什么信号
   - evidence: 简历原句

3. **简历主线**（narrative）
   - main_thread: 简历的主线叙事（如"应届生 + 数学竞赛 + 量化项目"）
   - weakest_link: 最弱链
   - strongest_link: 最强链

4. **岗位匹配初步判断**（role_match_initial）— 对照 RoleStudy 的 core_capabilities
   - fit_summary: 整体匹配判断（一句话）
   - obvious_gaps: 明显缺失的核心能力（对照 core_capabilities 找）
   - surprising_strengths: 意外的强项

【关键】
- 不是诊断、不是打分、不是改写建议 — 那是后续 step 的事
- 你只产出"研究观察"，**像在写一份给操盘手看的候选人备忘**
- evidence 字段必须是简历原句精确摘录
- 如果某些字段确实没有内容，可以填空数组 / 简短解释
- internal_signals 至少 4 条，不要为了凑数编造，宁可写"strength"

【输出 JSON schema】
{
  "candidate_profile": {
    "seniority_tier": "fresh_grad" | "junior_1_3y" | "mid_3_5y" | "senior_5y_plus",
    "real_skill_estimate": "<候选人真实水平估计>",
    "packaging_intent": "<候选人想包装的形象>"
  },
  "internal_signals": [
    {
      "type": "contradiction" | "red_flag" | "overclaim" | "gap" | "strength",
      "description": "<信号描述>",
      "evidence": "<简历原句>"
    }
  ],
  "narrative": {
    "main_thread": "<主线叙事>",
    "weakest_link": "<最弱链>",
    "strongest_link": "<最强链>"
  },
  "role_match_initial": {
    "fit_summary": "<整体匹配判断>",
    "obvious_gaps": ["<明显缺失1>", "<明显缺失2>", ...],
    "surprising_strengths": ["<意外强项1>", ...]
  }
}
${COMMON_JSON_RULES}`;
}

// ════════════════════════════════════════════════════════════════
// 工具：把 ResearchContext 子集拼成可注入的 prompt 片段
// ════════════════════════════════════════════════════════════════

/**
 * 给 BaseAnalyzer / HrSimulator 等用的精简研究上下文
 * 控制长度，避免淹没主任务 prompt
 */
export function buildResearchContextSnippet(
  research: ResearchContext | undefined,
  options: {
    includeRoleCore?: boolean;       // 注入 R2 core_capabilities
    includeRolePatterns?: boolean;   // 注入 R2 top_resume_patterns
    includeRoleRedFlags?: boolean;   // 注入 R2 red_flags
    includeRoleJargon?: boolean;     // 注入 R2 industry_jargon
    includeHrFocus?: boolean;        // 注入 R3 six_second_focus / thirty_second_focus
    includeHrEliminate?: boolean;    // 注入 R3 common_eliminate_reasons
    includeHrBaseline?: boolean;     // 注入 R3 expectation_baseline
    includeCandidateProfile?: boolean; // 注入 R5 candidate_profile
    includeRoleMatch?: boolean;      // 注入 R5 role_match_initial
    includeInternalSignals?: boolean; // 注入 R5 internal_signals
  } = {}
): string {
  if (!research) return '';

  const parts: string[] = [];

  if (options.includeRoleCore && research.role_study?.core_capabilities?.length) {
    const list = research.role_study.core_capabilities
      .map((c, i) => `  ${i + 1}. ${c.name}: ${c.description}（${c.why_it_matters}）`)
      .join('\n');
    parts.push(`【行业研究 · 该岗位核心能力清单】\n${list}`);
  }

  if (options.includeRolePatterns && research.role_study?.top_resume_patterns?.length) {
    const list = research.role_study.top_resume_patterns.map((p) => `  - ${p}`).join('\n');
    parts.push(`【行业研究 · top 简历常见模式】\n${list}`);
  }

  if (options.includeRoleRedFlags && research.role_study?.red_flags?.length) {
    const list = research.role_study.red_flags
      .map((f) => `  - ${f.flag}（${f.why_critical}）`)
      .join('\n');
    parts.push(`【行业研究 · 常见 red flags】\n${list}`);
  }

  if (options.includeRoleJargon && research.role_study?.industry_jargon?.length) {
    parts.push(
      `【行业研究 · 行业 jargon】${research.role_study.industry_jargon.slice(0, 12).join('、')}`
    );
  }

  if (options.includeHrFocus && research.hr_insider) {
    const six = research.hr_insider.six_second_focus.map((f) => `  - ${f}`).join('\n');
    const thirty = research.hr_insider.thirty_second_focus.map((f) => `  - ${f}`).join('\n');
    parts.push(`【HR 视角 · 6 秒重点】\n${six}\n【HR 视角 · 30 秒重点】\n${thirty}`);
  }

  if (options.includeHrEliminate && research.hr_insider?.common_eliminate_reasons?.length) {
    const list = research.hr_insider.common_eliminate_reasons
      .map((r) => `  - ${r.reason}（${r.frequency}）`)
      .join('\n');
    parts.push(`【HR 视角 · 常见淘汰理由】\n${list}`);
  }

  if (options.includeHrBaseline && research.hr_insider?.expectation_baseline) {
    const b = research.hr_insider.expectation_baseline;
    parts.push(
      `【HR 视角 · 期待基线】\n  - fresh_grad: ${b.fresh_grad}\n  - junior_1_3y: ${b.junior_1_3y}\n  - mid_3_5y: ${b.mid_3_5y}`
    );
  }

  if (options.includeCandidateProfile && research.resume_study?.candidate_profile) {
    const p = research.resume_study.candidate_profile;
    parts.push(
      `【简历研究 · 候选人画像】\n  - 梯队: ${p.seniority_tier}\n  - 真实水平: ${p.real_skill_estimate}\n  - 包装意图: ${p.packaging_intent}`
    );
  }

  if (options.includeRoleMatch && research.resume_study?.role_match_initial) {
    const m = research.resume_study.role_match_initial;
    const gaps = m.obvious_gaps.length > 0 ? m.obvious_gaps.map((g) => `    - ${g}`).join('\n') : '    （无）';
    const strengths = m.surprising_strengths.length > 0
      ? m.surprising_strengths.map((s) => `    - ${s}`).join('\n')
      : '    （无）';
    parts.push(
      `【简历研究 · 岗位匹配初步判断】\n  fit: ${m.fit_summary}\n  明显缺失:\n${gaps}\n  意外强项:\n${strengths}`
    );
  }

  if (options.includeInternalSignals && research.resume_study?.internal_signals?.length) {
    const list = research.resume_study.internal_signals
      .slice(0, 8)
      .map((s) => `  - [${s.type}] ${s.description}（原句: "${s.evidence.slice(0, 60)}"）`)
      .join('\n');
    parts.push(`【简历研究 · 内部信号】\n${list}`);
  }

  if (parts.length === 0) return '';

  return `\n────── 研究阶段输出（参考系，仅供你判断时对照）──────\n${parts.join('\n\n')}\n────── （研究上下文结束）──────\n`;
}
