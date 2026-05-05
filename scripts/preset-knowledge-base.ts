/**
 * 预设高质量知识库数据
 * 不依赖API，直接可用的数据
 *
 * 覆盖多个岗位类型和问题类型
 */

import fs from 'fs';

// 诊断规则
const diagnosisRules = [
  // ============ 运营类岗位规则 ============
  // 内容运营 - 缺少结果证据
  {
    rule_id: "rule-011",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "经历只写了做过什么，没有体现结果、影响、产出或复盘价值。",
    trigger_signals: ["负责内容策划", "负责内容发布", "负责选题", "撰写文案", "内容更新", "日常维护", "内容产出"],
    typical_bad_patterns: [
      "负责微信公众号内容策划与发布，根据热点撰写推文，跟进粉丝互动反馈。",
      "负责小红书内容更新，制定内容发布计划，跟进日常运营工作。"
    ],
    priority_level: "high",
    applicable_roles: ["内容运营", "新媒体运营", "文案编辑"],
    source_level: "AI",
    notes: "这是运营类简历最高频的问题，需要重点关注。"
  },
  // 内容运营 - 关键词连接不够直接
  {
    rule_id: "rule-012",
    issue_type: "keyword_alignment_weak",
    issue_name: "岗位关键词连接不够直接",
    definition: "简历内容与目标岗位并非无关，但没有显性对齐岗位要求中的核心能力点或关键词。",
    trigger_signals: ["内容运营", "用户增长", "数据分析", "选题策划", "内容矩阵", "拉新促活"],
    typical_bad_patterns: [
      "负责内容产出，配合团队完成日常运营工作。",
      "参与选题策划，协助完成内容发布计划跟进。"
    ],
    priority_level: "high",
    applicable_roles: ["内容运营", "新媒体运营"],
    source_level: "AI",
    notes: "运营岗需要把JD关键词显性化表达。"
  },
  // 内容运营 - 表述偏泛
  {
    rule_id: "rule-013",
    issue_type: "weak_expression_pattern",
    issue_name: "经历表述偏泛",
    definition: "经历大量使用泛化、弱化的动作表述，无法让筛选者快速判断具体能力与贡献。",
    trigger_signals: ["协助完成", "配合团队", "跟进执行", "日常支持", "相关工作"],
    typical_bad_patterns: [
      "协助完成内容策划相关工作，配合团队进行内容产出。",
      "跟进日常运营工作，支持团队完成内容发布计划。"
    ],
    priority_level: "high",
    applicable_roles: ["内容运营", "新媒体运营"],
    source_level: "AI",
    notes: "弱动词密度过高会降低专业感。"
  },

  // 用户运营 - 缺少结果证据
  {
    rule_id: "rule-014",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "经历只写了做过什么，没有体现结果、影响、产出或复盘价值。",
    trigger_signals: ["用户运营", "社群运营", "私域运营", "用户维护", "活动策划", "拉新促活"],
    typical_bad_patterns: [
      "负责社群用户运营，维护社群活跃度，策划社群活动，提升用户体验。",
      "负责用户维护工作，跟进用户反馈，提升用户满意度。"
    ],
    priority_level: "high",
    applicable_roles: ["用户运营", "社群运营", "私域运营"],
    source_level: "AI",
    notes: "用户运营的结果要量化：拉新多少、留存多少、转化多少。"
  },
  // 用户运营 - 角色边界不清
  {
    rule_id: "rule-015",
    issue_type: "weak_role_boundary",
    issue_name: "项目角色边界不清",
    definition: "简历没有明确区分自己主导了什么、参与了什么、配合了什么，导致个人贡献感被削弱。",
    trigger_signals: ["配合团队", "协助完成", "协助策划", "共同完成", "团队协作"],
    typical_bad_patterns: [
      "配合团队完成用户增长项目，协助策划活动方案。",
      "协助完成社群运营工作，配合团队进行用户维护。"
    ],
    priority_level: "high",
    applicable_roles: ["用户运营", "社群运营"],
    source_level: "AI",
    notes: "用户运营要区分自己是运营负责人还是执行支持。"
  },
  // 用户运营 - 数字化表达偏少
  {
    rule_id: "rule-016",
    issue_type: "lack_of_quantification",
    issue_name: "数字化表达偏少",
    definition: "简历中缺少人数、规模、次数、提升幅度、结果指标等量化信息，导致成果难以被快速建立可信度。",
    trigger_signals: ["用户增长", "社群活跃", "转化提升", "留存提高"],
    typical_bad_patterns: [
      "通过活动策划，有效提升社群活跃度，用户参与度有明显提高。",
      "负责用户增长工作，通过精细化运营，用户留存率显著提升。"
    ],
    priority_level: "medium",
    applicable_roles: ["用户运营", "社群运营", "私域运营"],
    source_level: "AI",
    notes: "没有具体数字的成果等于没有成果。"
  },

  // 活动运营 - 缺少结果证据
  {
    rule_id: "rule-017",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "经历只写了做过什么，没有体现结果、影响、产出或复盘价值。",
    trigger_signals: ["活动策划", "活动执行", "活动运营", "线下活动", "展会", "路演"],
    typical_bad_patterns: [
      "负责活动策划与执行，跟进活动全流程，确保活动顺利完成。",
      "负责线下活动运营，协助完成活动策划与执行工作。"
    ],
    priority_level: "high",
    applicable_roles: ["活动运营", "项目运营"],
    source_level: "AI",
    notes: "活动运营的结果要回答：活动规模多大、效果如何、数据怎样。"
  },
  // 活动运营 - 只写任务没有业务价值
  {
    rule_id: "rule-018",
    issue_type: "task_only_no_business_value",
    issue_name: "只写任务，没有业务价值",
    definition: "简历描述停留在任务层，没有体现这项工作对团队、项目、用户或业务带来了什么价值。",
    trigger_signals: ["活动执行", "活动跟进", "现场协调", "物料准备", "流程推进"],
    typical_bad_patterns: [
      "负责活动现场执行，跟进活动流程，协助完成现场协调工作。",
      "负责活动物料准备与现场布置，跟进活动执行进度。"
    ],
    priority_level: "high",
    applicable_roles: ["活动运营", "项目运营"],
    source_level: "AI",
    notes: "活动运营要说明活动对业务目标的价值。"
  },

  // 产品运营 - JD方向不匹配
  {
    rule_id: "rule-019",
    issue_type: "jd_direction_mismatch",
    issue_name: "目标岗位方向不够聚焦",
    definition: "用户投递的目标岗位方向与简历主轴之间存在明显偏移，问题不仅是表达，还可能是方向选择问题。",
    trigger_signals: ["产品运营", "策略运营", "数据驱动", "需求分析", "版本迭代"],
    typical_bad_patterns: [
      "简历主要写内容运营经验，但目标是产品运营。",
      "主要经历是活动执行，目标岗位要求数据分析能力。"
    ],
    priority_level: "high",
    applicable_roles: ["产品运营", "策略运营"],
    source_level: "AI",
    notes: "产品运营需要策略思维和数据能力，不是执行导向。"
  },
  // 产品运营 - 优势没有前置
  {
    rule_id: "rule-020",
    issue_type: "advantage_not_front_loaded",
    issue_name: "优势没有前置",
    definition: "简历中最能代表个人价值的能力或经历没有被优先呈现，导致亮点不容易在初筛阶段被看见。",
    trigger_signals: ["需求分析", "版本迭代", "数据监控", "产品规划"],
    typical_bad_patterns: [
      "前面几段都是执行类工作，有亮点的产品项目放在后面。",
      "最有价值的项目经历只有一句话带过。"
    ],
    priority_level: "medium",
    applicable_roles: ["产品运营", "产品经理"],
    source_level: "AI",
    notes: "产品经理要把最有价值的项目前置，因为这是展现判断力的机会。"
  },

  // ============ 技术类岗位规则 ============
  // 前端开发 - 缺少结果证据
  {
    rule_id: "rule-021",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "项目只写了做过什么功能，没有说明性能提升、用户体验改善、业务价值等结果。",
    trigger_signals: ["负责前端开发", "负责页面开发", "参与项目开发", "前端架构设计", "组件开发"],
    typical_bad_patterns: [
      "负责公司官网前端开发，使用Vue框架完成页面搭建与交互实现。",
      "参与后台管理系统前端开发，完成数据展示页面与交互功能。"
    ],
    priority_level: "high",
    applicable_roles: ["前端开发", "前端工程师", "React开发", "Vue开发"],
    source_level: "AI",
    notes: "技术简历也要写结果：性能优化了多少、用户体验提升了什么。"
  },
  // 前端开发 - 表述偏泛
  {
    rule_id: "rule-022",
    issue_type: "weak_expression_pattern",
    issue_name: "经历表述偏泛",
    definition: "技术描述过于笼统，没有具体说明技术栈、复杂度、规模等关键信息。",
    trigger_signals: ["前端开发", "页面开发", "组件开发", "功能实现"],
    typical_bad_patterns: [
      "负责前端页面开发，完成页面交互功能实现。",
      "参与项目开发，负责前端模块功能开发。"
    ],
    priority_level: "high",
    applicable_roles: ["前端开发", "前端工程师"],
    source_level: "AI",
    notes: "前端要写清楚技术栈、框架、解决的问题。"
  },
  // 前端开发 - 追问风险
  {
    rule_id: "rule-023",
    issue_type: "overclaim_risk",
    issue_name: "表述容易引发追问风险",
    definition: '使用了"精通、熟练掌握、主导"等强词，但实际经历不足以支撑，容易在面试中被追问露馅。',
    trigger_signals: ["精通Vue", "精通React", "精通前端", "熟练掌握", "深度参与", "独立完成"],
    typical_bad_patterns: [
      "精通Vue和React，能独立完成前端项目开发。",
      "熟练掌握前端工程化，负责前端架构设计与优化。"
    ],
    priority_level: "medium",
    applicable_roles: ["前端开发", "前端工程师"],
    source_level: "AI",
    notes: "技术词汇要谨慎，除非真的有把握。"
  },

  // 后端开发 - 缺少结果证据
  {
    rule_id: "rule-024",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "项目描述只说了做了什么功能，没有说明系统性能、稳定性、扩展性等技术价值。",
    trigger_signals: ["负责后端开发", "负责接口开发", "数据库设计", "服务部署", "API开发"],
    typical_bad_patterns: [
      "负责用户模块后端开发，完成用户注册、登录、权限验证等功能。",
      "负责数据库设计与开发，完成业务数据表结构设计。"
    ],
    priority_level: "high",
    applicable_roles: ["后端开发", "Java开发", "Python开发", "Go开发"],
    source_level: "AI",
    notes: "后端要写系统规模、QPS、可用性等技术指标。"
  },
  // 后端开发 - 角色边界不清
  {
    rule_id: "rule-025",
    issue_type: "weak_role_boundary",
    issue_name: "项目角色边界不清",
    definition: "在团队项目中没有明确个人贡献，难以判断是负责人还是普通参与者。",
    trigger_signals: ["参与项目开发", "配合团队", "协助完成", "团队协作"],
    typical_bad_patterns: [
      "参与用户系统开发，配合团队完成接口开发与调试。",
      "协助完成后端模块开发，配合团队进行测试与部署。"
    ],
    priority_level: "high",
    applicable_roles: ["后端开发", "Java开发", "Python开发"],
    source_level: "AI",
    notes: "后端要明确自己是核心开发还是辅助参与。"
  },

  // 测试工程师 - 缺少结果证据
  {
    rule_id: "rule-026",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "测试经历只说了执行了什么操作，没有说明测试覆盖率、缺陷发现率、质量保障价值。",
    trigger_signals: ["测试用例", "功能测试", "回归测试", "Bug提交", "测试报告"],
    typical_bad_patterns: [
      "负责功能测试，编写测试用例，执行测试并提交Bug。",
      "负责项目测试工作，跟进Bug修复，完成测试报告。"
    ],
    priority_level: "high",
    applicable_roles: ["测试工程师", "QA", "功能测试"],
    source_level: "AI",
    notes: "测试要量化：覆盖率多少、发现多少Bug、上线后问题率多少。"
  },

  // ============ 数据类岗位规则 ============
  // 数据分析师 - 缺少结果证据
  {
    rule_id: "rule-027",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "分析经历只说了做过什么分析，没有说明分析结论、带来的业务价值、决策影响。",
    trigger_signals: ["数据分析", "数据可视化", "报表开发", "指标体系", "AB测试"],
    typical_bad_patterns: [
      "负责业务数据分析，制作数据报表，支持业务决策。",
      "负责数据可视化开发，制作数据看板，展示业务数据。"
    ],
    priority_level: "high",
    applicable_roles: ["数据分析师", "BI工程师", "数据运营"],
    source_level: "AI",
    notes: "数据分析要说明：分析了什么问题、结论是什么、带来了什么业务价值。"
  },
  // 数据分析师 - 关键词连接不够直接
  {
    rule_id: "rule-028",
    issue_type: "keyword_alignment_weak",
    issue_name: "岗位关键词连接不够直接",
    definition: "简历中的分析技能和工具没有显性对齐目标岗位的核心要求。",
    trigger_signals: ["SQL", "Python", "Tableau", "PowerBI", "Excel", "Spark", "机器学习"],
    typical_bad_patterns: [
      "会使用SQL进行数据查询，了解Python数据分析。",
      "熟悉Excel和PPT制作，负责数据整理与报告输出。"
    ],
    priority_level: "high",
    applicable_roles: ["数据分析师", "BI工程师"],
    source_level: "AI",
    notes: "数据分析师要把工具技能和业务场景结合表达。"
  },

  // ============ 设计类岗位规则 ============
  // UI设计 - 缺少结果证据
  {
    rule_id: "rule-029",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "设计作品只说了做了什么界面，没有说明设计目标、用户问题解决、效果数据。",
    trigger_signals: ["UI设计", "界面设计", "视觉设计", "图标设计", "切图标注"],
    typical_bad_patterns: [
      "负责APP界面设计，完成高保真原型与视觉稿。",
      "负责产品UI设计，配合开发完成切图标注工作。"
    ],
    priority_level: "high",
    applicable_roles: ["UI设计师", "视觉设计师"],
    source_level: "AI",
    notes: "设计要说明设计解决的问题和带来的价值。"
  },
  // UX设计 - 优势没有前置
  {
    rule_id: "rule-030",
    issue_type: "advantage_not_front_loaded",
    issue_name: "优势没有前置",
    definition: "最有价值的项目（如主导的重大改版、研究驱动的决策）没有前置展示。",
    trigger_signals: ["用户研究", "交互设计", "体验优化", "可用性测试", "竞品分析"],
    typical_bad_patterns: [
      "前面是执行层面的设计输出，真正有价值的UX研究项目放在后面。",
      "主导的改版项目只有一句话，但日常运营图做了很多。"
    ],
    priority_level: "medium",
    applicable_roles: ["UX设计师", "交互设计师"],
    source_level: "AI",
    notes: "UX设计师要把研究驱动设计的案例前置。"
  },

  // ============ 市场/销售类岗位规则 ============
  // 市场推广 - 缺少结果证据
  {
    rule_id: "rule-031",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "推广经历只说了做过什么渠道、内容、活动，没有说明获客成本、转化率、ROI等核心指标。",
    trigger_signals: ["市场推广", "渠道推广", "内容营销", "SEM", "信息流投放"],
    typical_bad_patterns: [
      "负责渠道推广工作，拓展线上推广渠道，提升品牌曝光。",
      "负责内容营销推广，策划营销内容，提升品牌知名度。"
    ],
    priority_level: "high",
    applicable_roles: ["市场推广", "渠道运营", "营销"],
    source_level: "AI",
    notes: "市场推广要写：花了多少钱、带来多少流量/转化、成本多少。"
  },
  // 销售 - JD方向不匹配
  {
    rule_id: "rule-032",
    issue_type: "jd_direction_mismatch",
    issue_name: "目标岗位方向不够聚焦",
    definition: "销售简历中大量写执行支持类经历，没有体现销售核心能力（客户开拓、业绩达成）。",
    trigger_signals: ["客户开发", "客户维护", "业绩", "销售额", "签约"],
    typical_bad_patterns: [
      "主要写的是运营支持工作，但目标是销售岗位。",
      "没有写过任何和销售业绩相关的内容。"
    ],
    priority_level: "high",
    applicable_roles: ["销售", "大客户销售", "商务"],
    source_level: "AI",
    notes: "销售简历核心是：开拓了多少客户、带来了多少业绩。"
  },

  // ============ 职能类岗位规则 ============
  // HR - 缺少结果证据
  {
    rule_id: "rule-033",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "HR经历只说了做过什么模块，没有说明招聘效率提升、留存率改善、体系搭建等价值。",
    trigger_signals: ["招聘", "培训", "绩效", "员工关系", "人力资源"],
    typical_bad_patterns: [
      "负责招聘工作，筛选简历，邀约面试，办理入职。",
      "负责培训工作，组织培训课程，跟进培训效果。"
    ],
    priority_level: "high",
    applicable_roles: ["HR", "HRBP", "招聘专员", "培训专员"],
    source_level: "AI",
    notes: "HR要写：招聘周期缩短了多少、留存率提升了多少、搭建了什么体系。"
  },

  // ============ 通用的结构性问题 ============
  // ATS格式问题
  {
    rule_id: "rule-034",
    issue_type: "ats_format_issue",
    issue_name: "ATS格式兼容性问题",
    definition: "简历格式导致ATS系统无法正确解析，如使用了表格、双栏布局、图片、特殊字符等。",
    trigger_signals: ["表格", "多栏布局", "图片", "特殊符号", "合并单元格"],
    typical_bad_patterns: [
      "简历使用双栏布局，左侧是个人信息，右侧是经历描述。",
      "简历包含技能图标、教育背景小图标等信息图元素。"
    ],
    priority_level: "high",
    applicable_roles: ["所有岗位"],
    source_level: "AI",
    notes: "ATS系统无法解析复杂格式，会导致关键信息丢失。"
  },
  // 简历结构问题
  {
    rule_id: "rule-035",
    issue_type: "structure_issue",
    issue_name: "简历结构不合理",
    definition: "各部分比例失调，如自我评价过长、项目经历过短，或信息主次不分。",
    trigger_signals: ["自我评价", "个人优势", "专业技能", "项目经验"],
    typical_bad_patterns: [
      "自我评价写了800字，但工作经历只有几百字。",
      "专业技能占了半页，但最有价值的项目只有两行。"
    ],
    priority_level: "medium",
    applicable_roles: ["所有岗位"],
    source_level: "AI",
    notes: "简历结构要保证：核心信息占70%以上篇幅。"
  },
];

// 内行视角
const insiderViews = [
  {
    view_id: "view-011",
    issue_type: "lack_of_result_evidence",
    role_context: "hr",
    view_text: "我看到你写了负责某项工作，但我不知道这件事做完后带来了什么改变。如果连你都不知道或者没有记录，那我会默认这件事没什么价值。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "活动运营", "产品运营", "数据分析师"],
    source_level: "AI",
    notes: "结果导向是运营岗的核心。"
  },
  {
    view_id: "view-012",
    issue_type: "keyword_alignment_weak",
    role_context: "hr",
    view_text: "你写的内容和我招聘的岗位要求在同一个领域，但你没有把关键能力词显性说出来。我得自己去猜、去对应，这增加了我的认知成本，也增加了你被误判的风险。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "产品运营", "数据分析师"],
    source_level: "AI",
    notes: "JD关键词显性化很重要。"
  },
  {
    view_id: "view-013",
    issue_type: "weak_expression_pattern",
    role_context: "business",
    view_text: "连续几段都是'协助、配合、跟进、支持'，我会默认你多数时候在执行别人安排的任务，而不是主动承担并交付结果。",
    tone: "direct",
    applicable_roles: ["内容运营", "用户运营", "活动运营", "产品运营"],
    source_level: "AI",
    notes: "弱动词会降低专业形象。"
  },
  {
    view_id: "view-014",
    issue_type: "weak_role_boundary",
    role_context: "hiring_manager",
    view_text: "你说'配合团队完成项目'，但我不知道你在里面具体做了什么、是负责人还是执行者。我通常会把功劳归给团队，而不是归给你。",
    tone: "calm",
    applicable_roles: ["前端开发", "后端开发", "产品运营", "项目经理"],
    source_level: "AI",
    notes: "技术岗更要明确个人贡献。"
  },
  {
    view_id: "view-015",
    issue_type: "lack_of_quantification",
    role_context: "hr",
    view_text: "你说活动效果'良好'、用户反馈'不错'，这不是证据。任何人都可以这样写，但不是每个人都能给出具体的数字。",
    tone: "direct",
    applicable_roles: ["活动运营", "用户运营", "市场推广", "数据分析师"],
    source_level: "AI",
    notes: "数字比形容词更可信。"
  },
  {
    view_id: "view-016",
    issue_type: "task_only_no_business_value",
    role_context: "business",
    view_text: "你写了'发布内容、维护社群、整理资料'，但这些都是任务描述，不是价值描述。我看不到这些动作对业务目标有什么贡献。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "活动运营"],
    source_level: "AI",
    notes: "任务要连接到业务价值。"
  },
  {
    view_id: "view-017",
    issue_type: "jd_direction_mismatch",
    role_context: "hiring_manager",
    view_text: "你投递的是产品运营，但我看到的经历主要是执行支持层的工作。产品运营需要的是策略思维、数据驱动、跨部门协调能力，你的经历里没有体现这些。",
    tone: "calm",
    applicable_roles: ["产品运营", "策略运营"],
    source_level: "AI",
    notes: "方向问题比表达问题更严重。"
  },
  {
    view_id: "view-018",
    issue_type: "overclaim_risk",
    role_context: "technical_interviewer",
    view_text: "你写了'精通Vue、React，能独立完成前端项目'，如果面试时我深入问一个知识点你答不上来，这个强词反而会成为你的减分项。",
    tone: "direct",
    applicable_roles: ["前端开发", "后端开发", "全栈开发"],
    source_level: "AI",
    notes: "技术强词要谨慎使用。"
  },
  {
    view_id: "view-019",
    issue_type: "advantage_not_front_loaded",
    role_context: "hr",
    view_text: "初筛不是精读。如果你的亮点在第三段之后，我可能已经在形成第一印象时把你归类为'相关性一般'了。亮点要让我在第一时间就看见。",
    tone: "calm",
    applicable_roles: ["产品经理", "UX设计师", "数据分析师"],
    source_level: "AI",
    notes: "亮点前置是基本原则。"
  },
  {
    view_id: "view-020",
    issue_type: "ats_format_issue",
    role_context: "ats",
    view_text: "这份简历使用了表格和复杂的排版格式，我的解析系统无法正确提取其中的文字信息。这意味着关键内容可能会被遗漏，即使你很优秀，也可能无法进入下一轮。",
    tone: "calm",
    applicable_roles: ["所有岗位"],
    source_level: "AI",
    notes: "ATS兼容性是技术问题但影响严重。"
  },
];

// 改写模式
const rewritePatterns = [
  {
    pattern_id: "rewrite-011",
    issue_type: "lack_of_result_evidence",
    role_type: "内容运营",
    before_text: "负责微信公众号内容策划与发布，根据热点撰写推文，跟进粉丝互动反馈。",
    after_text: "负责公众号内容策划与发布，制定月度选题计划，结合热点策划爆款内容，单篇平均阅读量从3000提升至1.2万，粉丝增长200%。",
    rewrite_logic: "把动作改成动作+数据结果的形式，让每一项工作都有可量化的价值支撑。",
    key_transformation: ["补充具体成果数据", "量化阅读量和粉丝增长", "体现内容策划能力"],
    source_level: "AI",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-012",
    issue_type: "lack_of_result_evidence",
    role_type: "用户运营",
    before_text: "负责社群用户运营，维护社群活跃度，策划社群活动，提升用户体验。",
    after_text: "负责500人用户社群运营，通过每日话题策划和每周活动运营，社群活跃度从15%提升至45%，月度留存率从60%提升至82%。",
    rewrite_logic: "把泛化的运营动作改成具体数据：规模、活跃度、留存率，全部量化。",
    key_transformation: ["量化社群规模", "量化活跃度提升", "量化留存率提升"],
    source_level: "AI",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-013",
    issue_type: "keyword_alignment_weak",
    role_type: "数据分析师",
    before_text: "负责业务数据分析，制作数据报表，支持业务决策。",
    after_text: "负责核心业务数据分析，建立用户路径漏斗分析模型，通过SQL+Python输出日/周/月数据看板，支撑运营策略决策，用户转化率提升分析准确率达95%。",
    rewrite_logic: "显性化JD关键词：SQL、Python、数据建模、决策支撑，全部对齐目标岗位要求。",
    key_transformation: ["补充工具关键词", "补充分析模型", "量化决策支撑效果"],
    source_level: "AI",
    difficulty_level: "advanced"
  },
  {
    pattern_id: "rewrite-014",
    issue_type: "weak_expression_pattern",
    role_type: "活动运营",
    before_text: "协助完成活动策划工作，配合团队进行活动执行跟进。",
    after_text: "独立策划并执行23场用户活动，包括线上直播、线下沙龙、节日营销活动，累计参与用户超5000人，活动满意度评分达4.7分（满分5分）。",
    rewrite_logic: "把'协助'改成'独立'，把'配合'改成'主导'，并补充具体规模数据。",
    key_transformation: ["弱动词升级为强动词", "补充具体活动数量", "补充参与规模和满意度"],
    source_level: "AI",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-015",
    issue_type: "weak_role_boundary",
    role_type: "前端开发",
    before_text: "参与电商项目前端开发，配合团队完成页面实现。",
    after_text: "作为前端核心开发，独立负责电商项目商品详情页、购物车、订单结算三个核心模块，使用Vue+Vuex实现，月均处理订单10万+，，首屏加载优化至1.5秒。",
    rewrite_logic: "明确个人角色（核心开发而非辅助），明确负责的具体模块，补充技术指标。",
    key_transformation: ["明确个人角色", "列出具体负责模块", "补充技术性能指标"],
    source_level: "AI",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-016",
    issue_type: "lack_of_quantification",
    role_type: "市场推广",
    before_text: "负责渠道推广工作，效果良好。",
    after_text: "负责SEM和信息流渠道推广，管理月度预算15万，通过关键词优化和落地页A/B测试，ROI从1.5提升至2.8，获客成本从120元降至68元。",
    rewrite_logic: "把'效果良好'改成具体指标：ROI、获客成本，全部数字化。",
    key_transformation: ["补充预算规模", "量化ROI提升", "量化获客成本下降"],
    source_level: "AI",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-017",
    issue_type: "task_only_no_business_value",
    role_type: "产品运营",
    before_text: "负责产品需求整理，跟进开发进度，整理项目文档。",
    after_text: "负责产品需求管理，通过用户反馈和数据分析提炼需求优先级，推动5次版本迭代，功能完成率达92%，上线后用户满意度提升15%。",
    rewrite_logic: "把任务描述改成价值描述：需求管理带来了版本迭代，用户满意度带来了业务价值。",
    key_transformation: ["任务连接版本迭代", "量化功能完成率", "量化用户满意度提升"],
    source_level: "AI",
    difficulty_level: "advanced"
  },
  {
    pattern_id: "rewrite-018",
    issue_type: "overclaim_risk",
    role_type: "后端开发",
    before_text: "精通Java后端开发，独立负责系统架构设计与优化。",
    after_text: "熟练使用Spring Boot进行业务系统开发，作为核心开发参与用户系统设计，承担数据层接口开发与性能优化工作，单接口响应时间降低40%。",
    rewrite_logic: "把'精通'改成'熟练'，把'独立负责架构设计'改成'参与架构设计'，回归真实边界。",
    key_transformation: ["弱化能力定语", "缩小职责范围", "补充技术细节"],
    source_level: "AI",
    difficulty_level: "advanced"
  },
  {
    pattern_id: "rewrite-019",
    issue_type: "advantage_not_front_loaded",
    role_type: "UX设计师",
    before_text: "负责界面设计，配合产品完成交互方案。项目一：企业官网设计。项目二：APP图标设计。最重要的项目：主导APP体验优化。",
    after_text: "主导APP体验优化项目：通过用户研究访谈和可用性测试，发现登录流程痛点，优化后转化率提升35%。负责企业官网和APP图标设计。",
    rewrite_logic: "把最有价值的项目前置，详细展开；把次要项目简化。调整前后顺序。",
    key_transformation: ["最有价值项目前置", "补充研究方法论", "量化改版效果"],
    source_level: "AI",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-020",
    issue_type: "ats_format_issue",
    role_type: "所有岗位",
    before_text: "【技能】PS★★★★　　Excel★★★★　　PPT★★★\n【教育】北京大学　　　MBA　　　2018-2020",
    after_text: "技能：Photoshop（精通）、Excel（熟练）、PowerPoint（熟练）\n教育：北京大学　MBA　2018.09-2020.06",
    rewrite_logic: "把图标和特殊符号改成文字描述，把表格改成段落格式，确保ATS能正确解析。",
    key_transformation: ["去掉图标和特殊字符", "表格转段落", "时间格式标准化"],
    source_level: "AI",
    difficulty_level: "basic"
  },
];

// ─── 导出 ────────────────────────────────────────────────────

export function getPresetDiagnosisRules(): typeof diagnosisRules {
  return diagnosisRules;
}

export function getPresetInsiderViews(): typeof insiderViews {
  return insiderViews;
}

export function getPresetRewritePatterns(): typeof rewritePatterns {
  return rewritePatterns;
}

// 直接保存到文件
export function saveToDistilled(basePath: string) {
  fs.writeFileSync(`${basePath}/diagnosis-rules.json`, JSON.stringify(diagnosisRules, null, 2), 'utf-8');
  fs.writeFileSync(`${basePath}/insider-views.json`, JSON.stringify(insiderViews, null, 2), 'utf-8');
  fs.writeFileSync(`${basePath}/rewrite-patterns.json`, JSON.stringify(rewritePatterns, null, 2), 'utf-8');

  console.log('预设数据已保存到distilled目录');
  console.log(`   - 诊断规则: ${diagnosisRules.length} 条`);
  console.log(`   - 内行视角: ${insiderViews.length} 条`);
  console.log(`   - 改写模式: ${rewritePatterns.length} 条`);
}

// 主入口
const basePath = process.argv[2] || '../offerpilot-corpus/distilled';
saveToDistilled(basePath);