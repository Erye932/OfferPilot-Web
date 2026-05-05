/**
 * 数据合并脚本
 * 把新生成的扩展数据（rule-011开始）与原有基础数据（rule-001到rule-010）合并
 *
 * 原有基础数据来自秘塔AI生成的人工整理数据
 * 扩展数据来自Claude生成的更高质量数据
 */

import fs from 'fs';

// 原有基础数据（rule-001到rule-010）
const originalRules = [
  {
    rule_id: "rule-001",
    issue_type: "lack_of_result_evidence",
    issue_name: "缺少结果证据",
    definition: "经历只写了做过什么，没有体现结果、影响、产出或复盘价值。",
    trigger_signals: ["负责", "参与", "协助", "配合", "执行"],
    typical_bad_patterns: [
      "负责活动策划与执行，配合团队完成相关工作。",
      "参与项目推进与落地，协助完成后续整理。"
    ],
    priority_level: "high",
    applicable_roles: ["内容运营", "用户运营", "活动运营", "产品运营", "市场", "项目运营"],
    source_level: "A",
    notes: "高频、高价值、高可解释性规则。非常适合免费版前3个核心优化项，优先级应长期维持高。"
  },
  {
    rule_id: "rule-002",
    issue_type: "keyword_alignment_weak",
    issue_name: "岗位关键词连接不够直接",
    definition: "简历内容与目标岗位并非无关，但没有显性对齐岗位要求中的核心能力点或关键词。",
    trigger_signals: ["JD关键词命中弱", "简历动作词较多但岗位能力词较少", "岗位相关能力没有被明确表达"],
    typical_bad_patterns: [
      "参与项目推进、负责沟通协调、支持团队完成相关任务。",
      "协助团队完成活动工作，推进日常安排。"
    ],
    priority_level: "high",
    applicable_roles: ["内容运营", "用户运营", "产品助理", "产品运营", "市场", "项目助理"],
    source_level: "A",
    notes: "适合结合JD一起判断。非常符合OfferPilot的核心价值：判断是表达问题、匹配问题还是方向问题。"
  },
  {
    rule_id: "rule-003",
    issue_type: "weak_role_boundary",
    issue_name: "项目角色边界不清",
    definition: "简历没有明确区分自己主导了什么、参与了什么、配合了什么，导致个人贡献感被削弱。",
    trigger_signals: ["推进相关工作", "配合团队完成整体落地", "协助项目推进"],
    typical_bad_patterns: [
      "负责推进项目相关工作，配合团队完成整体落地。",
      "支持团队完成项目安排，跟进执行进度。"
    ],
    priority_level: "high",
    applicable_roles: ["内容运营", "用户运营", "产品助理", "项目运营", "市场"],
    source_level: "A",
    notes: "这条规则对'内行视角'和'面试追问'都特别有帮助，因为一旦角色边界不清，面试官会立刻往下追问。"
  },
  {
    rule_id: "rule-004",
    issue_type: "weak_expression_pattern",
    issue_name: "经历表述偏泛",
    definition: "经历大量使用泛化、弱化的动作表述，无法让筛选者快速判断具体能力与贡献。",
    trigger_signals: ["参与", "协助", "支持", "配合", "跟进"],
    typical_bad_patterns: [
      "参与活动执行，协助完成复盘整理，支持团队推进相关安排。",
      "配合团队完成日常运营工作，跟进项目进展。"
    ],
    priority_level: "high",
    applicable_roles: ["内容运营", "用户运营", "活动运营", "产品运营", "项目运营"],
    source_level: "A",
    notes: "与'缺少结果证据'不同，这条更强调表达方式本身过弱。两者会同时出现，但规则定义要分开。"
  },
  {
    rule_id: "rule-005",
    issue_type: "relevant_experience_not_emphasized",
    issue_name: "最相关经历没有放大",
    definition: "与目标岗位最接近的一段经历没有被前置、展开或突出，导致第一印象阶段就丢失相关性。",
    trigger_signals: ["最相关经历位置靠后", "相关经历描述长度明显不足", "不相关经历比相关经历更长"],
    typical_bad_patterns: [
      "最相关项目只用一句话带过，而无关经历写得很长。",
      "与目标岗位最接近的经历被放在后半部分。"
    ],
    priority_level: "medium",
    applicable_roles: ["内容运营", "用户运营", "产品助理", "项目助理", "市场"],
    source_level: "A",
    notes: "这条规则对结果页很有价值，因为它能引导'先改哪一段'。但它比前四条更依赖简历整体结构判断，所以放medium。"
  },
  {
    rule_id: "rule-006",
    issue_type: "lack_of_quantification",
    issue_name: "数字化表达偏少",
    definition: "简历中缺少人数、规模、次数、提升幅度、结果指标等量化信息，导致成果难以被快速建立可信度。",
    trigger_signals: ["效果良好", "推进顺利", "反响不错", "取得较好效果"],
    typical_bad_patterns: [
      "活动效果良好，用户反馈不错。",
      "推进顺利，取得较好结果。"
    ],
    priority_level: "medium",
    applicable_roles: ["内容运营", "用户运营", "活动运营", "市场", "数据相关初级岗位"],
    source_level: "A",
    notes: "非常常见，也很容易让用户产生顿悟。但它通常是'缺少结果证据'的补充问题，不一定永远排在最前。"
  },
  {
    rule_id: "rule-007",
    issue_type: "advantage_not_front_loaded",
    issue_name: "优势没有前置",
    definition: "简历中最能代表个人价值的能力或经历没有被优先呈现，导致亮点不容易在初筛阶段被看见。",
    trigger_signals: ["亮点信息出现在后半段", "最强经历不在前面", "前面内容平淡、后面才出现重点"],
    typical_bad_patterns: [
      "开头几段都是基础执行内容，真正有价值的项目放在后面。",
      "最能体现能力的经历没有被放在前两段。"
    ],
    priority_level: "medium",
    applicable_roles: ["内容运营", "用户运营", "产品助理", "市场", "项目运营"],
    source_level: "A",
    notes: "这条规则适合强化结果页里的'为什么没反馈'。它和简历结构、阅读顺序强相关。"
  },
  {
    rule_id: "rule-008",
    issue_type: "task_only_no_business_value",
    issue_name: "只写任务，没有业务价值",
    definition: "简历描述停留在任务层，没有体现这项工作对团队、项目、用户或业务带来了什么价值。",
    trigger_signals: ["完成活动相关工作", "负责内容发布", "跟进项目执行", "整理相关资料"],
    typical_bad_patterns: [
      "负责内容发布与日常维护。",
      "整理活动资料并跟进执行。"
    ],
    priority_level: "high",
    applicable_roles: ["内容运营", "用户运营", "活动运营", "产品运营", "市场"],
    source_level: "A",
    notes: "和'缺少结果证据'接近，但这里更强调'价值解释缺失'，适合内行视角里指出'为什么这句看起来像执行支持'。"
  },
  {
    rule_id: "rule-009",
    issue_type: "jd_direction_mismatch",
    issue_name: "目标岗位方向不够聚焦",
    definition: "用户投递的目标岗位方向与简历主轴之间存在明显偏移，导致问题不仅是表达，还可能包含方向选择问题。",
    trigger_signals: ["JD要求与简历主经历领域偏差较大", "核心经历无法支撑目标岗位主能力", "相关性只能通过很弱的迁移解释成立"],
    typical_bad_patterns: [
      "简历主经历集中在执行与校园活动，但目标岗位要求明显偏数据分析或强产品能力。",
      "目标岗位强调策略与分析，简历却几乎没有相关支撑。"
    ],
    priority_level: "high",
    applicable_roles: ["内容运营", "用户运营", "产品助理", "数据分析初级岗", "市场"],
    source_level: "A",
    notes: "这条规则非常符合OfferPilot的差异化价值：帮用户判断问题是表达、匹配还是方向。建议谨慎触发，避免滥用。"
  },
  {
    rule_id: "rule-010",
    issue_type: "overclaim_risk",
    issue_name: "表述容易引发追问风险",
    definition: "简历中出现较强结论或能力表述，但缺少足够支撑，一旦进入面试容易被继续深挖并暴露短板。",
    trigger_signals: ["精通", "独立负责全流程", "主导", "深度参与", "熟练掌握"],
    typical_bad_patterns: [
      "精通高并发架构。",
      "主导项目全流程推进。",
      "独立负责整体策略制定。"
    ],
    priority_level: "medium",
    applicable_roles: ["产品助理", "技术类初级岗", "内容运营", "用户运营", "市场"],
    source_level: "A",
    notes: "这条规则对'面试里可能会被问到'模块特别有用。不是所有简历都会触发，但一旦触发，用户体感会很强。"
  }
];

const originalViews = [
  {
    view_id: "view-001",
    issue_type: "lack_of_result_evidence",
    role_context: "business",
    view_text: "我能看出你参与了执行，但我看不到体量、结果和你的实际贡献。这会让我默认你更偏支持角色，而不是能独立承担结果的人。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "活动运营", "产品运营", "市场"],
    source_level: "A",
    notes: "适合免费版高频使用。是首批最核心的insider view之一。"
  },
  {
    view_id: "view-002",
    issue_type: "keyword_alignment_weak",
    role_context: "business",
    view_text: "这段经历不一定和岗位无关，但它没有把岗位最关心的能力点主动说出来。对我来说，这会增加理解成本，也会降低我第一眼判断你匹配度的速度。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "产品助理", "产品运营", "市场"],
    source_level: "A",
    notes: "很符合OfferPilot的核心价值：判断是表达问题还是匹配问题。"
  },
  {
    view_id: "view-003",
    issue_type: "weak_role_boundary",
    role_context: "business",
    view_text: "如果我看不清你具体主导了什么、参与了什么，我通常会把功劳默认归给团队，而不是归给你本人。这会直接削弱你的个人价值感。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "项目运营", "产品助理", "市场"],
    source_level: "A",
    notes: "这条和面试追问天然联动，适合做强信任点。"
  },
  {
    view_id: "view-004",
    issue_type: "weak_expression_pattern",
    role_context: "hr",
    view_text: "如果我连续看到几段都在写'参与、协助、支持'，我会默认你多数时候处在辅助位置，而不是核心推进位置。这不一定说明你能力不够，但会让我很难快速判断你的独立性。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "活动运营", "项目运营", "市场"],
    source_level: "A",
    notes: "非常适合免费版。用户看完通常能立刻理解。"
  },
  {
    view_id: "view-005",
    issue_type: "relevant_experience_not_emphasized",
    role_context: "hr",
    view_text: "初筛通常不是精读。如果最相关的一段经历没有更早出现，或者没有被展开，我很可能在形成第一印象之前，就已经把你归类成'相关性一般'。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "产品助理", "市场", "项目运营"],
    source_level: "A",
    notes: "非常适合承接'先改哪一段'。"
  },
  {
    view_id: "view-006",
    issue_type: "lack_of_quantification",
    role_context: "business",
    view_text: "看到'效果良好'这类表达，我不会默认它真的很好。我只会觉得这里缺少证据，因为每个人都可以这样写，但不是每个人都能给出结果。",
    tone: "direct",
    applicable_roles: ["内容运营", "用户运营", "活动运营", "市场", "数据相关初级岗位"],
    source_level: "A",
    notes: "这条击中感很强，但语气仍然克制，适合免费版使用。"
  },
  {
    view_id: "view-007",
    issue_type: "advantage_not_front_loaded",
    role_context: "hr",
    view_text: "你可能确实有亮点，但如果亮点没有在前面被看见，对初筛来说它就很像不存在。因为我不会先假设你有优势，再耐心往后找。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "产品助理", "市场", "项目运营"],
    source_level: "A",
    notes: "这条适合结果页中段，不适合过度频繁触发。"
  },
  {
    view_id: "view-008",
    issue_type: "task_only_no_business_value",
    role_context: "business",
    view_text: "如果你只写自己做了哪些任务，但没有告诉我这些动作对团队、项目或结果带来了什么价值，我会更容易把你理解成在完成安排，而不是在创造价值。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "活动运营", "产品运营", "市场"],
    source_level: "A",
    notes: "这条和'缺少结果证据'相邻，但更强调业务价值感。"
  },
  {
    view_id: "view-009",
    issue_type: "jd_direction_mismatch",
    role_context: "hiring_manager",
    view_text: "如果岗位强调的是策略、分析或更强的问题判断，而你的简历主轴长期停留在执行支持层，我不会只觉得你表达得不够好，还会怀疑你当前的岗位方向是不是选得太靠前了。",
    tone: "calm",
    applicable_roles: ["内容运营", "用户运营", "产品助理", "数据分析初级岗", "市场"],
    source_level: "A",
    notes: "这条是OfferPilot差异化价值的关键之一，但必须谨慎触发。"
  },
  {
    view_id: "view-010",
    issue_type: "overclaim_risk",
    role_context: "business",
    view_text: "当我看到'精通''主导''独立负责全流程'这类表述时，我会默认后面能展开讲清楚。如果后续支撑不够，这类词反而会放大追问风险。",
    tone: "direct",
    applicable_roles: ["内容运营", "用户运营", "产品助理", "技术类初级岗", "市场"],
    source_level: "A",
    notes: "非常适合和'面试里可能会被问到'联动，产品体感强。"
  }
];

const originalPatterns = [
  {
    pattern_id: "rewrite-001",
    issue_type: "lack_of_result_evidence",
    role_type: "内容运营",
    before_text: "负责活动策划与执行，跟进现场落地，配合团队完成活动相关工作。",
    after_text: "负责活动策划与落地执行，协同团队推进现场流程，并在活动结束后整理复盘信息，帮助团队定位后续优化方向。",
    rewrite_logic: "把纯动作表述改成'动作+结果/复盘+影响'的结构，让经历不只停留在执行层。",
    key_transformation: ["保留核心动作", "补充结果或复盘动作", "补充对团队或后续工作的价值"],
    source_level: "A",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-002",
    issue_type: "keyword_alignment_weak",
    role_type: "用户运营",
    before_text: "参与项目推进、负责沟通协调、支持团队完成相关任务。",
    after_text: "围绕用户增长项目推进执行节奏，负责跨团队沟通与需求同步，支持活动上线与后续反馈整理。",
    rewrite_logic: "把泛化动作改成更贴岗位语境的表达，优先把JD里的核心能力词显性写出来。",
    key_transformation: ["把泛动作换成岗位语境动作", "补充与目标岗位相关的能力词", "减少'支持相关任务'这类空表述"],
    source_level: "A",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-003",
    issue_type: "weak_role_boundary",
    role_type: "项目运营",
    before_text: "负责推进项目相关工作，配合团队完成整体落地。",
    after_text: "负责项目执行节奏跟进与跨方协调，独立推进阶段节点落地，并配合团队完成整体上线支持。",
    rewrite_logic: "把'团队做了什么'和'你做了什么'拆开写，优先明确个人主导动作，再写配合部分。",
    key_transformation: ["先写个人负责部分", "再写团队协作部分", "减少模糊归因"],
    source_level: "A",
    difficulty_level: "advanced"
  },
  {
    pattern_id: "rewrite-004",
    issue_type: "weak_expression_pattern",
    role_type: "活动运营",
    before_text: "参与活动执行，协助完成复盘整理，支持团队推进相关安排。",
    after_text: "跟进活动执行流程与现场协调，整理活动反馈与复盘信息，并支持后续优化安排推进。",
    rewrite_logic: "减少'参与、协助、支持'的密度，用更明确的动作表达替换弱表述，但不夸大个人角色。",
    key_transformation: ["参与->跟进/推进/负责", "协助->整理/输出/执行", "支持->具体说明支持了什么"],
    source_level: "A",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-005",
    issue_type: "relevant_experience_not_emphasized",
    role_type: "产品助理",
    before_text: "参与某项目需求整理与测试支持。",
    after_text: "参与产品需求整理与测试支持，跟进需求流转和反馈收集，帮助团队推进版本上线前的问题确认。",
    rewrite_logic: "当相关经历本身不够展开时，优先补足最贴近目标岗位的动作细节，让这段经历有被放大的基础。",
    key_transformation: ["扩充最相关经历细节", "补充岗位相关动作", "增强与目标岗位的直接连接"],
    source_level: "A",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-006",
    issue_type: "lack_of_quantification",
    role_type: "市场",
    before_text: "活动效果良好，用户反馈不错。",
    after_text: "活动上线后完成反馈汇总与结果整理，参与复盘分析，并基于活动表现输出后续优化建议。",
    rewrite_logic: "当暂时没有可靠数字可写时，不要硬编数字，先把主观评价改成可验证的动作与结果处理流程。",
    key_transformation: ["删掉空泛结果词", "补充复盘与整理动作", "避免无证据的主观判断"],
    source_level: "A",
    difficulty_level: "advanced"
  },
  {
    pattern_id: "rewrite-007",
    issue_type: "advantage_not_front_loaded",
    role_type: "内容运营",
    before_text: "负责日常内容整理与发布。",
    after_text: "负责内容选题整理与日常发布执行，跟进内容上线后的反馈收集，并支持后续内容优化方向整理。",
    rewrite_logic: "当前这条pattern不是解决排序，而是先把亮点内容写得更像亮点，为后续前置提供素材基础。",
    key_transformation: ["补足完整动作链", "增加反馈与优化动作", "让经历更适合被前置"],
    source_level: "A",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-008",
    issue_type: "task_only_no_business_value",
    role_type: "用户运营",
    before_text: "负责内容发布与日常维护。",
    after_text: "负责内容发布与日常运营维护，跟进用户反馈与基础数据整理，支持后续内容优化与运营节奏调整。",
    rewrite_logic: "把'任务完成'改成'任务+用户/数据/业务连接'，让动作和价值之间形成最基本的桥梁。",
    key_transformation: ["补用户反馈", "补数据整理", "补后续优化价值"],
    source_level: "A",
    difficulty_level: "basic"
  },
  {
    pattern_id: "rewrite-009",
    issue_type: "jd_direction_mismatch",
    role_type: "产品运营",
    before_text: "负责校园活动执行与现场支持。",
    after_text: "负责校园活动执行与现场协调，并在活动结束后整理反馈与流程问题，为后续活动优化提供基础参考。",
    rewrite_logic: "当方向还不够完全匹配时，先把已有经历向目标岗位可迁移的能力上靠拢，但不能硬写成已经具备更高阶能力。",
    key_transformation: ["保留真实经历边界", "补充可迁移能力", "避免虚假拔高"],
    source_level: "A",
    difficulty_level: "advanced"
  },
  {
    pattern_id: "rewrite-010",
    issue_type: "overclaim_risk",
    role_type: "产品助理",
    before_text: "主导项目全流程推进，独立负责整体策略制定。",
    after_text: "参与项目推进与需求协同，负责阶段性问题跟进和信息同步，支持项目按计划完成关键节点推进。",
    rewrite_logic: "当原句存在明显过度拔高风险时，优先把表述收回到真实角色边界，避免制造不必要的面试追问压力。",
    key_transformation: ["去掉过强结论词", "回归真实职责边界", "降低追问风险"],
    source_level: "A",
    difficulty_level: "advanced"
  }
];

// 读取新生成的数据
const basePath = "C:/Users/Administrator/Desktop/offerpilot-web/offerpilot-corpus/distilled";
const newRules = JSON.parse(fs.readFileSync(`${basePath}/diagnosis-rules.json`, 'utf-8')) as typeof originalRules;
const newViews = JSON.parse(fs.readFileSync(`${basePath}/insider-views.json`, 'utf-8')) as typeof originalViews;
const newPatterns = JSON.parse(fs.readFileSync(`${basePath}/rewrite-patterns.json`, 'utf-8')) as typeof originalPatterns;

// 过滤掉rule-011及以后的数据（这些是要合并的扩展数据）
const extendedRules = newRules.filter((r: typeof originalRules[0]) => r.rule_id.startsWith('rule-0') && parseInt(r.rule_id.split('-')[1]) > 10);
const extendedViews = newViews.filter((v: typeof originalViews[0]) => v.view_id.startsWith('view-0') && parseInt(v.view_id.split('-')[1]) > 10);
const extendedPatterns = newPatterns.filter((p: typeof originalPatterns[0]) => p.pattern_id.startsWith('rewrite-0') && parseInt(p.pattern_id.split('-')[1]) > 10);

// 合并数据
const mergedRules = [...originalRules, ...extendedRules];
const mergedViews = [...originalViews, ...extendedViews];
const mergedPatterns = [...originalPatterns, ...extendedPatterns];

// 保存合并后的数据
fs.writeFileSync(`${basePath}/diagnosis-rules.json`, JSON.stringify(mergedRules, null, 2), 'utf-8');
fs.writeFileSync(`${basePath}/insider-views.json`, JSON.stringify(mergedViews, null, 2), 'utf-8');
fs.writeFileSync(`${basePath}/rewrite-patterns.json`, JSON.stringify(mergedPatterns, null, 2), 'utf-8');

console.log('数据合并完成！');
console.log('');
console.log('诊断规则:');
console.log(`  - 原有数据: ${originalRules.length} 条`);
console.log(`  - 新增扩展: ${extendedRules.length} 条`);
console.log(`  - 合并后总计: ${mergedRules.length} 条`);
console.log('');
console.log('内行视角:');
console.log(`  - 原有数据: ${originalViews.length} 条`);
console.log(`  - 新增扩展: ${extendedViews.length} 条`);
console.log(`  - 合并后总计: ${mergedViews.length} 条`);
console.log('');
console.log('改写模式:');
console.log(`  - 原有数据: ${originalPatterns.length} 条`);
console.log(`  - 新增扩展: ${extendedPatterns.length} 条`);
console.log(`  - 合并后总计: ${mergedPatterns.length} 条`);
console.log('');
console.log('岗位覆盖分析:');

// 分析岗位覆盖
const allRoles = new Set<string>();
mergedRules.forEach((r: typeof originalRules[0]) => r.applicable_roles.forEach((role: string) => allRoles.add(role)));

const roleCategory = {
  '运营类': ['内容运营', '用户运营', '活动运营', '产品运营', '新媒体运营', '电商运营', '社群运营', '数据运营', '商家运营', '品类运营', '项目运营'],
  '产品类': ['产品经理', '产品助理', '高级产品经理', 'C端产品经理', 'B端产品经理'],
  '技术类': ['前端开发', '前端工程师', '后端开发', 'Java开发', 'Python开发', 'Go开发', '全栈开发', '测试工程师', '运维工程师', 'Android开发', 'iOS开发'],
  '数据/算法': ['数据分析师', 'BI工程师', '数据运营', '算法工程师'],
  '设计类': ['UI设计师', 'UX设计师', '交互设计师', '视觉设计师', '产品设计师', '文案编辑'],
  '市场/销售': ['市场', '市场推广', '渠道运营', '商务', '商务合作', '销售'],
  '职能类': ['HR', 'HRBP', '招聘专员', '培训专员']
};

for (const [category, roles] of Object.entries(roleCategory)) {
  const covered = roles.filter(r => allRoles.has(r));
  if (covered.length > 0) {
    console.log(`  ${category}: ${covered.join(', ')}`);
  }
}
