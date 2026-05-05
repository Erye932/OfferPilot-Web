/**
 * MissingInfoProbe — 段落级"应说未说"规则探针（零 AI 调用）
 *
 * 设计目的：
 * 1. 简历最大问题是"应说未说"——光评论"已写内容"不够，必须有规则
 *    去检查"段落里应该有什么但没有的信息"。
 * 2. 此探针在 V4 工作流的 Step 2 运行，输入 normalized.resume_sections，
 *    输出一组 V4Comment（dimension='missing_info', source='rule'）。
 * 3. 纯规则、零成本、最准。AI 步骤只需要 enrich/ rephrase 这些结论，
 *    不需要"发现"它们。
 *
 * 配置维护：
 * - SECTION_CHECKLIST 是每类段落的必备信息清单
 * - 每项有自己的 detector（正则/字符串），缺则生成 missing comment
 *
 * 使用：
 *   const comments = runMissingInfoProbe(normalized);
 */

import type {
  NormalizedInput,
  ResumeSection,
  ResumeSectionType,
  V4Comment,
  Severity,
  FixType,
  ImpactSurface,
  SourceLocation,
} from './types';
import { SECTION_LABELS } from './types';

// ════════════════════════════════════════════════════════════════
// 通用检测器（可被 checklist 项复用）
// ════════════════════════════════════════════════════════════════

/** 是否包含日期/时间段（YYYY、YYYY-MM、YYYY.MM、年/月、至今、present） */
function hasDateRange(content: string): boolean {
  const patterns = [
    /\b(19|20)\d{2}[-./年]\s*\d{1,2}/,           // 2023-09 / 2023.09 / 2023年9月
    /\b(19|20)\d{2}\s*[—–至到~\-]\s*((19|20)\d{2}|今|present|now)/i,
    /\d{1,2}\s*[/.\-月]\s*\d{4}/,                // 9/2023
    /(present|now|至今|今)/i,
  ];
  return patterns.some((p) => p.test(content));
}

/** 是否包含量化结果（数字 + 百分号/单位/对比） */
function hasQuantifiedResult(content: string): boolean {
  const patterns = [
    /\d+\s*%/,                                    // 15%
    /\d+(\.\d+)?\s*(倍|x|X)/,                    // 3 倍 / 2x
    /(提升|提高|增长|增加|减少|降低|下降|缩短|节省|优化|改善)\s*\d/,
    /\d+\s*(万|千|百|亿|m|k|mn|w)/i,             // 100w / 5k
    /\d+(\.\d+)?\s*(qps|tps|rps|dau|mau|pv|uv|gmv)/i,
    /(top|前)\s*\d+/i,                            // top 5
    /\d+\s*(人|名|个项目|个用户|个客户)/,
  ];
  return patterns.some((p) => p.test(content));
}

/** 是否包含技术栈关键词 */
function hasTechStack(content: string): boolean {
  const techKeywords = [
    'python', 'java', 'javascript', 'typescript', 'go', 'rust', 'c++', 'c#',
    'react', 'vue', 'angular', 'next', 'nuxt', 'svelte',
    'node', 'spring', 'django', 'flask', 'rails',
    'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch',
    'docker', 'kubernetes', 'aws', 'gcp', 'azure',
    'sql', 'pandas', 'numpy', 'tensorflow', 'pytorch',
    'tableau', 'power bi', 'powerbi', 'looker', 'metabase',
    'git', 'jenkins', 'gitlab', 'github actions',
  ];
  const lower = content.toLowerCase();
  return techKeywords.some((kw) => lower.includes(kw));
}

/** 是否包含团队规模信息 */
function hasTeamSize(content: string): boolean {
  return /(团队|小组|组|team)\s*\d+\s*(人|名|members|个)|(\d+)\s*人\s*(团队|小组)/i.test(content);
}

/** 是否包含个人角色/岗位 */
function hasRole(content: string): boolean {
  const rolePatterns = [
    /(担任|作为|岗位|职位|职责|角色|身份|role)/,
    /(实习生|工程师|开发者|分析师|经理|主管|leader|owner|developer|engineer|analyst)/i,
    /(负责|主导|参与|协助|完成|实施|落地)/,
  ];
  return rolePatterns.some((p) => p.test(content));
}

/** 是否包含公司/项目名（启发式：有专有名词或被引号包围） */
function hasCompanyOrProjectName(content: string): boolean {
  const patterns = [
    /[《「『][^》」』]{1,30}[》」』]/,           // 中文引号
    /["'][A-Za-z0-9 ]{2,30}["']/,                 // 英文引号
    /(公司|company|corp|ltd|inc|有限|集团|项目)/i,
    /([A-Z][a-z]+\s*){1,3}/,                      // 连续 1-3 个英文专有名词
  ];
  return patterns.some((p) => p.test(content));
}

/** 是否包含学校 */
function hasSchool(content: string): boolean {
  return /(大学|学院|university|college|institute|school)/i.test(content);
}

/** 是否包含专业 */
function hasMajor(content: string): boolean {
  return /(专业|major|科学|工程|技术|管理|经济|金融|文学|教育|学院.*?系)/i.test(content);
}

/** 是否包含 GPA / 排名 / 荣誉 */
function hasGpaOrRanking(content: string): boolean {
  const patterns = [
    /gpa\s*[:：]?\s*\d/i,
    /平均\s*绩点/,
    /(排名|前)\s*\d+\s*[%名]/,
    /(top|前)\s*\d+/i,
    /(国家奖学金|一等奖学金|二等奖学金|优秀|excellent|honor|dean's list)/i,
  ];
  return patterns.some((p) => p.test(content));
}

/** 是否包含相关课程 */
function hasCourses(content: string): boolean {
  return /(课程|course|主修|相关课程|核心课程)/.test(content);
}

/** 是否包含业务/产品上下文（"什么业务"、"什么产品"） */
function hasBusinessContext(content: string): boolean {
  const patterns = [
    // 业务/产品名词显式定义（如"业务是 ..."、"产品为 ..."）
    /(业务|产品|平台|系统|功能|场景|用户|客户)\s*[是为：:]/,
    // 行业领域关键词（注意：避免使用 "内容" 这类太泛的词，会被"主要内容"误命中）
    /(电商|金融|教育|医疗|游戏|社交|短视频|图文|信息流|内容创业|内容平台|出行|物流|saas|to\s*b|to\s*c)/i,
    // "面向 XXX 的"句式
    /面向\s*[\u4e00-\u9fa5]{2,}/,
    // 业务规模描述
    /(日活|月活|dau|mau|用户量|注册用户|gmv)\s*\d/i,
  ];
  return patterns.some((p) => p.test(content));
}

// ════════════════════════════════════════════════════════════════
// Checklist 配置
// ════════════════════════════════════════════════════════════════

/**
 * Checklist 单项
 * 每段落需要包含的信息字段；缺则生成 missing comment
 */
interface ChecklistItem {
  /** 字段标识（snake_case） */
  field: string;
  /** 用户友好名 */
  label: string;
  /** 检测段落是否包含此字段 */
  detector: (content: string) => boolean;
  /** 缺失时的诊断标题 */
  title: string;
  /** 一句话定性 */
  one_liner: string;
  /** 为什么缺失这个有问题 */
  why_it_hurts: string;
  /** 严重度 */
  severity: Severity;
  /** 修复类型（探针默认认为缺失需要补料） */
  fix_type: FixType;
  /** 影响哪些环节 */
  impact_on: ImpactSurface[];
  /** 行业人视角（可选） */
  insider_view?: string;
}

/** 段落 checklist 配置 */
const SECTION_CHECKLIST: Partial<Record<ResumeSectionType, ChecklistItem[]>> = {
  // ─── 实习 ────────────────────────────────────────────────
  internship: [
    {
      field: 'company',
      label: '公司名',
      detector: hasCompanyOrProjectName,
      title: '缺少明确的公司或机构名',
      one_liner: '看不出在哪家公司实习。',
      why_it_hurts: 'HR 6 秒扫描时第一眼找的就是公司名（背景信号），缺失会被直接跳过。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_6s', 'ats'],
      insider_view: 'HR 6 秒筛简历，第一眼看的就是公司名 — 没有它整段经历都"虚"。',
    },
    {
      field: 'date_range',
      label: '实习时间段',
      detector: hasDateRange,
      title: '缺少实习起止时间',
      one_liner: '没写实习多久。',
      why_it_hurts: 'HR 极度关注实习时长（< 3 个月会被认为打杂、> 6 个月才算"参与产出"）。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_6s', 'hr_30s'],
      insider_view: '应届简历的实习时长就是含金量本身，没有时间段 = 让 HR 自己猜。',
    },
    {
      field: 'role',
      label: '岗位 / 个人角色',
      detector: hasRole,
      title: '缺少明确的实习岗位',
      one_liner: '看不出担任什么角色。',
      why_it_hurts: '不写岗位 HR 无法判断你是不是在做目标方向的工作。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_30s', 'ats'],
    },
    {
      field: 'business_context',
      label: '业务/产品背景',
      detector: hasBusinessContext,
      title: '缺少业务背景说明',
      one_liner: '不知道在什么业务/产品上工作。',
      why_it_hurts: '没有业务背景，面试官无法判断经验的可迁移性，也无法问深入问题。',
      severity: 'should_fix',
      fix_type: 'safe_expand',
      impact_on: ['hr_30s', 'interview'],
      insider_view: '业务背景给所有量化数字"赋意义"——同样 15% 提升，电商 vs 教育含金量差好几倍。',
    },
    {
      field: 'quantified_result',
      label: '量化产出',
      detector: hasQuantifiedResult,
      title: '缺少量化结果',
      one_liner: '只描述工作内容，没数字成果。',
      why_it_hurts: '量化是简历最硬的证据。没有数字 = HR 30 秒环节会被认为"打杂"。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_30s', 'interview'],
      insider_view: '互联网/数据/产品岗，量化产出是简历的命门。没数字的实习经历约等于零分。',
    },
    {
      field: 'tech_stack',
      label: '技术栈',
      detector: hasTechStack,
      title: '缺少使用的技术/工具',
      one_liner: '没说用了什么技术或工具完成工作。',
      why_it_hurts: 'ATS 关键词匹配 + 面试官评估技术深度都依赖这一项。',
      severity: 'should_fix',
      fix_type: 'safe_expand',
      impact_on: ['ats', 'interview'],
    },
  ],

  // ─── 工作经历 ────────────────────────────────────────────
  work_experience: [
    {
      field: 'company',
      label: '公司名',
      detector: hasCompanyOrProjectName,
      title: '缺少公司名',
      one_liner: '看不出在哪家公司工作。',
      why_it_hurts: '公司背景是 HR 6 秒扫描的核心信号。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_6s', 'ats'],
    },
    {
      field: 'date_range',
      label: '在职时间段',
      detector: hasDateRange,
      title: '缺少在职时间段',
      one_liner: '没写工作起止时间。',
      why_it_hurts: '工作时长决定经验深度评估，也是稳定性参考。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_6s', 'hr_30s'],
    },
    {
      field: 'role',
      label: '岗位 / 职责定位',
      detector: hasRole,
      title: '缺少明确的岗位职责',
      one_liner: '看不出具体负责什么。',
      why_it_hurts: '岗位定义匹配度，模糊的"参与各项工作"等于没写。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_30s', 'ats'],
    },
    {
      field: 'business_context',
      label: '业务背景',
      detector: hasBusinessContext,
      title: '缺少业务/团队背景',
      one_liner: '没说所在团队/业务的规模和性质。',
      why_it_hurts: '没有业务背景，所有产出数字都没有"分母"。',
      severity: 'should_fix',
      fix_type: 'safe_expand',
      impact_on: ['hr_30s', 'interview'],
    },
    {
      field: 'team_size',
      label: '团队规模',
      detector: hasTeamSize,
      title: '缺少团队规模',
      one_liner: '没说团队多少人。',
      why_it_hurts: '团队规模影响"主导/独立"等表述的可信度，也帮 HR 评估责任范围。',
      severity: 'optional',
      fix_type: 'safe_expand',
      impact_on: ['hr_30s', 'interview'],
    },
    {
      field: 'quantified_result',
      label: '量化业务影响',
      detector: hasQuantifiedResult,
      title: '缺少量化的业务影响',
      one_liner: '没有具体数字证明工作产出。',
      why_it_hurts: '量化结果是工作经历最硬的部分，缺失 = HR 认为"在打杂"。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_30s', 'interview'],
    },
    {
      field: 'tech_stack',
      label: '技术栈',
      detector: hasTechStack,
      title: '缺少使用的技术栈',
      one_liner: '没说用了哪些技术/工具。',
      why_it_hurts: 'ATS 关键词匹配 + 面试技术深度评估都依赖这一项。',
      severity: 'should_fix',
      fix_type: 'safe_expand',
      impact_on: ['ats', 'interview'],
    },
  ],

  // ─── 项目经验 ────────────────────────────────────────────
  project: [
    {
      field: 'project_name',
      label: '项目名称',
      detector: hasCompanyOrProjectName,
      title: '缺少明确的项目名称',
      one_liner: '看不出项目叫什么。',
      why_it_hurts: '项目名是面试官追问的入口，也是查重/真伪验证的锚点。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_30s', 'interview'],
    },
    {
      field: 'role',
      label: '个人角色',
      detector: hasRole,
      title: '缺少个人在项目中的角色',
      one_liner: '不知道是主导、参与还是仅听课。',
      why_it_hurts: '项目无个人角色 = HR 无法评估你的实际贡献。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_30s', 'interview'],
      insider_view: '应届学生的"项目"如果没角色定位，会被直接当作课程作业。',
    },
    {
      field: 'business_context',
      label: '项目背景',
      detector: hasBusinessContext,
      title: '缺少项目背景介绍',
      one_liner: '没说项目要解决什么问题/给谁用。',
      why_it_hurts: '没有背景，所有技术细节都失去意义；面试官无法评估业务理解。',
      severity: 'should_fix',
      fix_type: 'safe_expand',
      impact_on: ['hr_30s', 'interview'],
    },
    {
      field: 'tech_stack',
      label: '技术选型',
      detector: hasTechStack,
      title: '缺少技术选型说明',
      one_liner: '没说用了什么技术/框架/工具。',
      why_it_hurts: 'ATS 关键词命中 + 面试官评估技术能力的核心依据。',
      severity: 'must_fix',
      fix_type: 'safe_expand',
      impact_on: ['ats', 'interview'],
    },
    {
      field: 'quantified_result',
      label: '量化成果',
      detector: hasQuantifiedResult,
      title: '缺少量化成果',
      one_liner: '没说项目产生了什么可衡量的结果。',
      why_it_hurts: '项目有数字 vs 没数字，HR 印象差距是质的差别。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_30s', 'interview'],
    },
    {
      field: 'date_range',
      label: '项目时间段',
      detector: hasDateRange,
      title: '缺少项目时间段',
      one_liner: '没写项目什么时候做的。',
      why_it_hurts: '影响时间线一致性判断，且面试官会问"那时候用什么版本"。',
      severity: 'optional',
      fix_type: 'safe_expand',
      impact_on: ['interview'],
    },
  ],

  // ─── 教育 ────────────────────────────────────────────────
  education: [
    {
      field: 'school',
      label: '学校名',
      detector: hasSchool,
      title: '缺少学校名',
      one_liner: '看不出毕业于哪所学校。',
      why_it_hurts: 'HR 6 秒扫的核心信号之一，缺失等于没写教育背景。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_6s', 'ats'],
    },
    {
      field: 'major',
      label: '专业',
      detector: hasMajor,
      title: '缺少专业信息',
      one_liner: '没写所学专业。',
      why_it_hurts: '专业是 ATS 过滤的常见维度，且影响岗位匹配判断。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_6s', 'ats'],
    },
    {
      field: 'date_range',
      label: '在校时间',
      detector: hasDateRange,
      title: '缺少在校时间',
      one_liner: '没写入学/毕业年份。',
      why_it_hurts: 'HR 需要时间线判断应届/社招身份。',
      severity: 'must_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_6s'],
    },
    {
      field: 'gpa_or_ranking',
      label: 'GPA / 排名 / 荣誉',
      detector: hasGpaOrRanking,
      title: '缺少 GPA、排名或荣誉',
      one_liner: '没有学业表现量化指标。',
      why_it_hurts: '应届简历的 GPA / 排名是少数客观加分项，缺失=失去差异化机会。',
      severity: 'should_fix',
      fix_type: 'needs_user_input',
      impact_on: ['hr_30s'],
      insider_view: 'GPA 高（前 30%）就一定要写——不写 HR 默认你"不咋地"。',
    },
    {
      field: 'courses',
      label: '相关课程',
      detector: hasCourses,
      title: '缺少相关课程列表',
      one_liner: '没列出与目标岗位相关的课程。',
      why_it_hurts: '应届无业务经验时，相关课程是说明专业匹配度的关键。',
      severity: 'optional',
      fix_type: 'safe_expand',
      impact_on: ['ats', 'hr_30s'],
    },
  ],

  // ─── 技能 ────────────────────────────────────────────────
  skill: [
    {
      field: 'tech_stack',
      label: '具体技能项',
      detector: (content) => hasTechStack(content) || /[a-zA-Z]{3,}/.test(content),
      title: '技能段过空或过泛',
      one_liner: '没有具体的技术/工具名。',
      why_it_hurts: 'ATS 严重依赖技能关键词匹配，模糊的"熟悉互联网产品"零命中。',
      severity: 'must_fix',
      fix_type: 'safe_expand',
      impact_on: ['ats'],
    },
  ],
};

// ════════════════════════════════════════════════════════════════
// 探针主函数
// ════════════════════════════════════════════════════════════════

/**
 * 检查段落 label —"实习经历 - 字节跳动" 这种带具体名的
 */
function buildSectionLabel(section: ResumeSection): string {
  const baseLabel = SECTION_LABELS[section.type] ?? section.type;
  if (section.title && section.title !== baseLabel && section.title.length < 40) {
    return `${baseLabel} · ${section.title}`;
  }
  return baseLabel;
}

/**
 * 生成 missing-info comment 的稳定 ID
 */
function buildCommentId(section: ResumeSection, field: string): string {
  return `missing_${section.type}_${section.paragraph_index}_${field}`;
}

/**
 * 主入口：扫描所有段落，输出缺失信息 comments
 */
export function runMissingInfoProbe(input: NormalizedInput): V4Comment[] {
  const comments: V4Comment[] = [];

  for (const section of input.resume_sections) {
    const checklist = SECTION_CHECKLIST[section.type];
    if (!checklist || checklist.length === 0) continue;

    const sectionLabel = buildSectionLabel(section);
    const evidenceLocation: SourceLocation = {
      paragraph_index: section.paragraph_index,
      text_snippet: section.content.slice(0, 80),
    };

    for (const item of checklist) {
      // 跳过：段落里已经包含此信息
      if (item.detector(section.content)) continue;

      comments.push({
        id: buildCommentId(section, item.field),
        section: section.type,
        section_label: sectionLabel,
        dimension: 'missing_info',
        status: 'missing',
        severity: item.severity,
        title: item.title,
        one_liner: item.one_liner,
        why_it_hurts: item.why_it_hurts,
        impact_on: item.impact_on,
        fix_type: item.fix_type,
        evidence_quote: section.content.slice(0, 200),
        evidence_location: evidenceLocation,
        rewrite: null,
        insider_view: item.insider_view,
        source: 'rule',
      });
    }
  }

  return comments;
}

/**
 * 调试辅助：返回探针的统计概览
 */
export function summarizeMissingInfoProbe(comments: V4Comment[]): {
  total: number;
  by_section: Record<string, number>;
  by_severity: Record<Severity, number>;
} {
  const summary = {
    total: comments.length,
    by_section: {} as Record<string, number>,
    by_severity: { must_fix: 0, should_fix: 0, optional: 0, nitpicky: 0 } as Record<Severity, number>,
  };
  for (const c of comments) {
    summary.by_section[c.section] = (summary.by_section[c.section] ?? 0) + 1;
    summary.by_severity[c.severity] += 1;
  }
  return summary;
}
