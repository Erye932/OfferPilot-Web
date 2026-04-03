// 规则预分析模块
// 轻量规则预分析，支持5种核心 issue_type

import type { NormalizedInput, RuleMatch, RuleMatchResult } from './types';

/**
 * 判断JD质量是否足够用于依赖JD的判断
 */
function isJdSufficient(input: NormalizedInput): boolean {
  return input.jd_quality === 'strong';
}

/**
 * 判断是否为模拟/校园项目上下文（课程项目、竞赛、实训、沙盘、模拟经营等）
 */
function isSimulationContext(sentence: string): boolean {
  const simulationKeywords = ['模拟', '沙盘', '课程项目', '竞赛', '实训', 'ERP', '企业模拟', '模拟经营', '商业模拟', '校园项目', '课程设计', '课程实验', '课程作业', '毕业设计', '毕业论文', '学术项目', '实验室项目'];
  return simulationKeywords.some(k => sentence.includes(k));
}

/**
 * 社招简历中模拟项目的权重调整因子：社招简历中的模拟项目应下调权重
 */
function getSimulationWeightFactor(input: NormalizedInput, sentence: string): number {
  if (input.experience_level === 'senior' && isSimulationContext(sentence)) {
    return 0.3; // 社招中的模拟项目权重降至30%
  }
  return 1.0; // 其他情况权重不变
}

/**
 * 执行规则预分析
 */
export function rulePreAnalysis(input: NormalizedInput): RuleMatchResult {
  const matches: RuleMatch[] = [];

  // 只处理核心问题类型（免费版V1支持5种）

  // 1. lack_of_result_evidence - 缺少结果证据
  const lackOfResultMatch = checkLackOfResultEvidence(input);
  if (lackOfResultMatch) {
    matches.push(lackOfResultMatch);
  }

  // 2. keyword_alignment_weak - 岗位关键词连接不够直接
  const keywordAlignmentMatch = checkKeywordAlignmentWeak(input);
  if (keywordAlignmentMatch) {
    matches.push(keywordAlignmentMatch);
  }

  // 3. weak_role_boundary - 项目角色边界不清
  const weakRoleBoundaryMatch = checkWeakRoleBoundary(input);
  if (weakRoleBoundaryMatch) {
    matches.push(weakRoleBoundaryMatch);
  }

  // 4. jd_direction_mismatch - 目标岗位方向不够聚焦
  const jdDirectionMatch = checkJdDirectionMismatch(input);
  if (jdDirectionMatch) {
    matches.push(jdDirectionMatch);
  }

  // 5. overclaim_risk - 表述容易引发追问风险
  const overclaimRiskMatch = checkOverclaimRisk(input);
  if (overclaimRiskMatch) {
    matches.push(overclaimRiskMatch);
  }

  // 按置信度降序排序
  matches.sort((a, b) => b.confidence - a.confidence);

  return {
    matches,
    total_matched: matches.length,
  };
}

/**
 * 检查：缺少结果证据
 * 触发信号：负责、参与、协助、配合、执行
 */
function checkLackOfResultEvidence(input: NormalizedInput): RuleMatch | null {
  const weakActionWords = ['负责', '参与', '协助', '配合', '执行', '跟进', '支持'];
  const resultIndicators = ['提升', '增长', '降低', '优化', '完成', '实现', '达到', '改善'];

  const matchedSentences: string[] = [];
  let signalCount = 0;

  for (const sentence of input.resume_sentences) {
    // 社招简历中的模拟/校园项目下调权重：跳过这些句子
    if (input.experience_level === 'senior' && isSimulationContext(sentence)) {
      continue;
    }

    // 检查是否包含弱动作词
    const hasWeakAction = weakActionWords.some(word => sentence.includes(word));

    // 检查是否缺少结果指示词
    const hasResultIndicator = resultIndicators.some(word => sentence.includes(word));

    if (hasWeakAction && !hasResultIndicator) {
      matchedSentences.push(sentence);
      signalCount++;
    }
  }

  if (signalCount === 0) {
    return null;
  }

  // 置信度计算：匹配句子越多，置信度越高
  const confidence = Math.min(0.3 + (signalCount * 0.1), 0.8);

  // 结果导向标题
  let issueName = '缺少结果证据';
  if (matchedSentences.some(s => s.includes('负责'))) {
    issueName = '经历写得像执行清单，看不到你的实际贡献';
  } else if (matchedSentences.some(s => s.includes('参与'))) {
    issueName = '只写了"参与"项目，没写具体产出和成果';
  } else {
    issueName = '工作描述缺乏结果导向，看不出实际价值';
  }

  return {
    issue_type: 'lack_of_result_evidence',
    issue_name: issueName,
    confidence,
    matched_signals: weakActionWords.filter(word =>
      matchedSentences.some(s => s.includes(word))
    ).slice(0, 3),
    evidence_snippets: matchedSentences.slice(0, 3),
  };
}

/**
 * 简单语义扩展：关键词的同义词/近义词映射
 */
function expandKeywordSemantically(keyword: string): string[] {
  // 语义扩展同义词映射表 - 强调能力等价而非字面相同
  const synonymMap: Record<string, string[]> = {
    // 数据分析类
    '数据分析': ['数据挖掘', '统计分析', '数据洞察', '数据研究', '数据建模', '数据可视化', '数据探索'],
    '数据挖掘': ['数据分析', '机器学习', '数据发现', '数据统计', '数据建模'],
    '统计': ['数据分析', '数据统计', '统计分析', '计量分析'],
    '洞察': ['分析', '见解', '发现', '观察', '结论'],
    '可视化': ['图表', '报表', '数据展示', '图形'],
    '建模': ['模型构建', '算法开发', '预测模型', '统计模型'],

    // 开发类
    '开发': ['实现', '构建', '编写', '编程', '编码', '研发', '开发工作'],
    '实现': ['开发', '完成', '构建', '实施', '落地'],
    '编程': ['开发', '编码', '编写', '程序设计', '软件编写'],
    '编码': ['编程', '开发', '编写'],
    '构建': ['开发', '搭建', '创建', '建立'],
    '部署': ['上线', '发布', '配置', '安装'],
    '测试': ['验证', '检查', '调试', '质量保障'],
    '调试': ['排查', '修复', '解决', '问题定位'],

    // 管理类
    '管理': ['负责', '领导', '带领', '统筹', '组织', '协调', '监督', '管控'],
    '负责': ['管理', '领导', '主导', '牵头', '主责'],
    '领导': ['管理', '负责', '带领', '指导', '率领'],
    '带领': ['领导', '指导', '管理', '率领'],
    '统筹': ['组织', '协调', '安排', '规划'],
    '协调': ['沟通', '协作', '配合', '对接'],
    '组织': ['策划', '安排', '筹备', '发起'],

    // 优化类
    '优化': ['改进', '提升', '改善', '增强', '完善', '升级'],
    '改进': ['优化', '提升', '改善', '改良', '革新'],
    '提升': ['优化', '改进', '提高', '增加', '增强'],
    '改善': ['优化', '改进', '提升', '改良'],
    '提高': ['提升', '增加', '增强', '加大'],
    '增加': ['提升', '提高', '扩大', '增长'],
    '减少': ['降低', '缩小', '削减', '节约'],

    // 设计类
    '设计': ['规划', '架构', '构思', '策划', '方案设计', '蓝图'],
    '规划': ['设计', '计划', '布局', '安排', '筹划'],
    '架构': ['设计', '结构', '框架', '体系'],
    '构思': ['设计', '设想', '创意', '方案'],

    // 产品类
    '产品': ['商品', '服务', '解决方案', '产品线'],
    '需求': ['要求', '需要', '诉求', '用户故事'],
    '用户': ['客户', '消费者', '使用者', '终端用户'],
    '市场': ['行业', '领域', '赛道', '商业'],

    // 运营类
    '运营': ['运作', '经营', '管理', '运维'],
    '增长': ['提升', '增加', '扩大', '发展'],
    '转化': ['转变', '改变', '升级', '变现'],
    '留存': ['保持', '维持', '粘性', '忠诚度'],

    // 技术栈关键词
    'Java': ['Java开发', 'Java编程', 'Java语言'],
    'Python': ['Python开发', 'Python编程', 'Python语言'],
    'JavaScript': ['JS', '前端开发', 'Web开发'],
    'React': ['React.js', '前端框架', 'React开发'],
    'Vue': ['Vue.js', '前端框架', 'Vue开发'],
    'Node.js': ['Node', '后端开发', '服务端'],
    '数据库': ['数据存储', 'DB', 'SQL', 'NoSQL'],
    'SQL': ['数据库查询', '结构化查询', '数据操作'],
    'Linux': ['Unix', '操作系统', '服务器'],
    'Docker': ['容器', '虚拟化', '容器化'],
    'Kubernetes': ['K8s', '容器编排', '集群管理'],
  };

  const expanded = new Set<string>([keyword]);
  const lowerKeyword = keyword.toLowerCase();

  // 直接匹配映射
  if (synonymMap[keyword]) {
    synonymMap[keyword].forEach(syn => expanded.add(syn));
  }

  // 模糊匹配：包含关系
  for (const [key, syns] of Object.entries(synonymMap)) {
    if (lowerKeyword.includes(key) || key.includes(lowerKeyword)) {
      syns.forEach(syn => expanded.add(syn));
    }
  }

  return Array.from(expanded);
}

/**
 * 检查：岗位关键词连接不够直接 - 语义匹配版本
 * 触发信号：JD关键词在简历中语义匹配度低
 */
function checkKeywordAlignmentWeak(input: NormalizedInput): RuleMatch | null {
  const { jd_keywords, resume_sentences } = input;

  // JD质量不足时，跳过此检查
  if (!isJdSufficient(input)) {
    return null;
  }

  if (jd_keywords.length === 0) {
    return null; // 没有JD关键词，无法判断
  }

  // 语义扩展后的匹配结果
  const matchedKeywords: string[] = [];
  const semanticMatches: Map<string, string[]> = new Map(); // 关键词 -> 匹配到的同义词

  for (const keyword of jd_keywords) {
    const expanded = expandKeywordSemantically(keyword);
    let matched = false;
    const matchedSynonyms: string[] = [];

    for (const sentence of resume_sentences) {
      // 检查原关键词
      if (sentence.includes(keyword)) {
        matched = true;
        matchedSynonyms.push(keyword);
        break;
      }
      // 检查同义词
      for (const syn of expanded) {
        if (syn !== keyword && sentence.includes(syn)) {
          matched = true;
          matchedSynonyms.push(syn);
          break;
        }
      }
      if (matched) break;
    }

    if (matched) {
      matchedKeywords.push(keyword);
      if (matchedSynonyms.length > 0) {
        semanticMatches.set(keyword, matchedSynonyms);
      }
    }
  }

  const matchRatio = matchedKeywords.length / jd_keywords.length;

  // 如果语义匹配比例低于40%，认为关键词连接弱
  if (matchRatio >= 0.4) {
    return null;
  }

  const confidence = Math.max(0.5, 1 - matchRatio);

  // 收集证据片段：包含原关键词或同义词的句子
  let evidenceSnippets: string[] = [];
  for (const keyword of matchedKeywords) {
    const synonyms = semanticMatches.get(keyword) || [keyword];
    for (const syn of synonyms) {
      const matchingSentences = resume_sentences.filter(s => s.includes(syn));
      if (matchingSentences.length > 0) {
        evidenceSnippets.push(...matchingSentences.slice(0, 2));
        break;
      }
    }
  }

  if (evidenceSnippets.length === 0 && resume_sentences.length > 0) {
    evidenceSnippets = resume_sentences.slice(0, 3);
  }

  evidenceSnippets = Array.from(new Set(evidenceSnippets)).slice(0, 3);

  // 生成结果导向的标题和信号
  const unmatchedKeywords = jd_keywords.filter(k => !matchedKeywords.includes(k));
  const matchedSignals: string[] = [];

  if (matchedKeywords.length === 0) {
    matchedSignals.push('简历用词和岗位要求的关键能力对不上');
  } else {
    const semanticDesc = matchedKeywords.map(k => {
      const syns = semanticMatches.get(k);
      return syns && syns[0] !== k ? `${k}（通过"${syns[0]}"体现）` : k;
    });
    matchedSignals.push(`简历仅部分匹配岗位要求：${semanticDesc.slice(0, 3).join('、')}`);
  }

  if (unmatchedKeywords.length > 0) {
    const examples = unmatchedKeywords.slice(0, 3).join('、');
    matchedSignals.push(`岗位要求的${examples}等核心能力未在简历中体现`);
  }

  // 结果导向标题
  let issueName = '岗位关键词连接不够直接';
  if (matchedKeywords.length === 0 && jd_keywords.length >= 3) {
    issueName = '简历用词和岗位要求的关键能力对不上，容易被筛掉';
  } else if (matchRatio < 0.2) {
    issueName = '简历与岗位要求的核心能力匹配度太低';
  } else if (matchRatio < 0.4) {
    issueName = '岗位关键词匹配不足，可能被误判为能力不符';
  }

  return {
    issue_type: 'keyword_alignment_weak',
    issue_name: issueName,
    confidence,
    matched_signals: matchedSignals,
    evidence_snippets: evidenceSnippets,
  };
}

/**
 * 检查：项目角色边界不清
 * 触发信号：模糊的团队描述词
 */
function checkWeakRoleBoundary(input: NormalizedInput): RuleMatch | null {
  const boundaryWeakWords = [
    '推进相关工作',
    '配合团队完成',
    '协助项目推进',
    '支持团队完成',
    '协同团队',
    '与团队一起'
  ];

  const matchedSentences: string[] = [];
  let signalCount = 0;

  for (const sentence of input.resume_sentences) {
    // 社招简历中的模拟/校园项目下调权重：跳过这些句子
    if (input.experience_level === 'senior' && isSimulationContext(sentence)) {
      continue;
    }

    const hasWeakBoundary = boundaryWeakWords.some(word =>
      sentence.includes(word)
    );

    if (hasWeakBoundary) {
      matchedSentences.push(sentence);
      signalCount++;
    }
  }

  if (signalCount === 0) {
    return null;
  }

  const confidence = Math.min(0.4 + (signalCount * 0.15), 0.85);

  // 结果导向标题
  let issueName = '项目角色边界不清';
  if (matchedSentences.some(s => s.includes('协同团队'))) {
    issueName = '用了"协同团队"等模糊描述，看不出你的具体角色';
  } else if (matchedSentences.some(s => s.includes('配合团队'))) {
    issueName = '"配合团队完成"这类描述让招聘方不清楚你的实际贡献';
  } else {
    issueName = '角色描述模糊，HR无法判断你是主导者还是辅助者';
  }

  return {
    issue_type: 'weak_role_boundary',
    issue_name: issueName,
    confidence,
    matched_signals: boundaryWeakWords.filter(word =>
      matchedSentences.some(s => s.includes(word))
    ).slice(0, 3),
    evidence_snippets: matchedSentences.slice(0, 3),
  };
}

/**
 * 检查：目标岗位方向不够聚焦
 * 触发信号：简历核心经历与目标岗位偏差大
 */
function checkJdDirectionMismatch(input: NormalizedInput): RuleMatch | null {
  const { target_role, resume_sentences } = input;

  // JD质量不足时，跳过此检查
  if (!isJdSufficient(input)) {
    return null;
  }

  // 简单判断：检查岗位名称中的关键词是否出现在简历中
  const roleKeywords = extractKeywordsFromRole(target_role);

  // 计算岗位关键词在简历句子中的匹配度
  const matchedSentences: string[] = [];
  const matchedRoleKeywords: string[] = [];

  for (const keyword of roleKeywords) {
    const matchingSentences = resume_sentences.filter(sentence => sentence.includes(keyword));
    if (matchingSentences.length > 0) {
      matchedRoleKeywords.push(keyword);
      matchedSentences.push(...matchingSentences.slice(0, 2)); // 每个关键词最多取两句
    }
  }

  const matchRatio = matchedRoleKeywords.length / Math.max(1, roleKeywords.length);

  // 如果匹配比例低于30%，认为方向不聚焦
  if (matchRatio >= 0.3) {
    return null;
  }

  let confidence = Math.max(0.6, 1 - matchRatio);

  // 检测岗位级别/资历要求不匹配信号
  const levelMismatch = detectLevelMismatchSignals(target_role, input.jd_text, resume_sentences);
  if (levelMismatch.signals.length > 0) {
    // 增加置信度，但不超过1.0
    confidence = Math.min(1.0, confidence + levelMismatch.confidenceBoost);
  }

  // 证据片段：优先使用包含匹配关键词的句子，如果没有则使用简历前几个句子
  let evidenceSnippets: string[] = [];
  if (matchedSentences.length > 0) {
    evidenceSnippets = Array.from(new Set(matchedSentences)).slice(0, 3);
  } else if (resume_sentences.length > 0) {
    evidenceSnippets = resume_sentences.slice(0, 3);
  }

  // 生成匹配信号描述
  const unmatchedKeywords = roleKeywords.filter(k => !matchedRoleKeywords.includes(k));
  const matchedSignals: string[] = [];

  if (roleKeywords.length > 0) {
    matchedSignals.push(`目标岗位"${target_role}"强调的能力方向：${roleKeywords.join('、')}`);
  }

  if (matchedRoleKeywords.length === 0) {
    matchedSignals.push('简历经历未直接体现这些能力方向');
  } else {
    matchedSignals.push(`简历中仅体现了部分能力：${matchedRoleKeywords.join('、')}`);
  }

  if (unmatchedKeywords.length > 0) {
    matchedSignals.push(`岗位关注的${unmatchedKeywords.slice(0, 3).join('、')}等能力未在简历中直接体现`);
  }

  // 添加级别不匹配信号
  if (levelMismatch.signals.length > 0) {
    matchedSignals.push(...levelMismatch.signals);
  }

  // 结果导向标题
  let issueName = '目标岗位方向不够聚焦';
  if (levelMismatch.signals.length > 0) {
    if (levelMismatch.signals.some(s => s.includes('高级/资深'))) {
      issueName = '简历体现的资历与岗位要求的高级级别不匹配';
    } else if (levelMismatch.signals.some(s => s.includes('初级/助理'))) {
      issueName = '简历资历超过岗位要求的初级级别，可能被误判为overqualified';
    }
  } else if (matchRatio < 0.2) {
    issueName = '简历经历与目标岗位的核心方向偏差较大';
  } else if (matchRatio < 0.3) {
    issueName = '简历方向与岗位要求不够聚焦，可能被筛掉';
  }

  return {
    issue_type: 'jd_direction_mismatch',
    issue_name: issueName,
    confidence,
    matched_signals: matchedSignals,
    evidence_snippets: evidenceSnippets,
  };
}

/**
 * 检查：强词+缺少支撑风险
 * 触发信号：强词 + 缺少结果词/量化数据支撑
 */
function checkOverclaimRisk(input: NormalizedInput): RuleMatch | null {
  const strongWords = ['精通', '独立负责全流程', '主导', '深度参与', '熟练掌握', '全面负责', '完全掌握', '资深', '专家', '顶级'];
  const supportIndicators = ['提升', '增长', '降低', '优化', '完成', '实现', '达到', '改善', '增加', '减少', '节省', '提高'];
  const quantPattern = /\d+%|\d+\.?\d*%|\d+万|\d+千|\d+元|\d+美元|\d+次|\d+倍|\d+小时|\d+天|\d+周|\d+月|\d+年/;

  const matchedSentences: string[] = [];
  const matchedSignals: string[] = [];
  let signalCount = 0;

  const sentences = input.resume_sentences;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const hasStrongWord = strongWords.some(word => sentence.includes(word));

    if (!hasStrongWord) continue;

    // 豁免模拟/校园项目上下文（课程项目、竞赛、实训、沙盘等）中的角色头衔
    if (isSimulationContext(sentence)) {
      // 社招简历中的模拟项目权重下调
      if (input.experience_level === 'senior') {
        continue; // 社招中的模拟项目，强词不算风险
      }
      // 校招/中性简历，模拟项目中的强词仍检查支撑
    }

    // 检查支撑证据：同一句子或下一句是否有结果词或量化数据
    let hasSupport = false;

    // 检查当前句子
    if (supportIndicators.some(ind => sentence.includes(ind)) || quantPattern.test(sentence)) {
      hasSupport = true;
    }

    // 检查下一句（如果存在）
    if (!hasSupport && i + 1 < sentences.length) {
      const nextSentence = sentences[i + 1];
      if (supportIndicators.some(ind => nextSentence.includes(ind)) || quantPattern.test(nextSentence)) {
        hasSupport = true;
      }
    }

    // 只有强词且缺少支撑才标记风险
    if (!hasSupport) {
      matchedSentences.push(sentence);
      signalCount++;

      // 记录具体是哪个强词
      const matchedWord = strongWords.find(word => sentence.includes(word));
      if (matchedWord && !matchedSignals.includes(matchedWord)) {
        matchedSignals.push(matchedWord);
      }
    }
  }

  if (signalCount === 0) {
    return null;
  }

  const confidence = Math.min(0.5 + (signalCount * 0.15), 0.85);

  // 结果导向标题 - 标记为优化类问题
  let issueName = '表述容易引发追问风险';
  if (matchedSignals.includes('精通')) {
    issueName = '写了"精通"但没写实际成果，容易被面试官追问细节';
  } else if (matchedSignals.includes('主导')) {
    issueName = '用了"主导"等强词但缺少结果支撑，可信度不足';
  } else if (matchedSignals.length > 0) {
    issueName = `${matchedSignals[0]}等强词缺少结果证据，可能引发质疑`;
  }

  // 标记为优化类问题（默认进优化栏）
  issueName = `[优化] ${issueName}`;

  return {
    issue_type: 'overclaim_risk',
    issue_name: issueName,
    confidence,
    matched_signals: matchedSignals.slice(0, 3),
    evidence_snippets: matchedSentences.slice(0, 3),
  };
}

/**
 * 从岗位名称提取关键词
 */
function extractKeywordsFromRole(role: string): string[] {
  const stopWords = ['助理', '专员', '工程师', '经理', '总监', '实习生', '初级', '高级', '资深'];
  return role
    .split(/[、,，\s]/)
    .map(word => word.trim())
    .filter(word => word.length > 1 && !stopWords.includes(word));
}


/**
 * 检测岗位级别/资历要求不匹配信号
 */
function detectLevelMismatchSignals(target_role: string, jd_text: string, resume_sentences: string[]): { signals: string[], confidenceBoost: number } {
  const signals: string[] = [];
  let confidenceBoost = 0;

  // 岗位级别信号词
  const senioritySignals = ['高级', '资深', 'senior', 'lead', '主管', '经理', '总监', '专家', '3年以上', '5年以上', '3年经验', '5年经验', '3-5年', '5-8年'];
  const juniorSignals = ['初级', '助理', '实习生', 'junior', 'entry', '应届', '毕业生', '1年以下', '1-3年'];

  // 检查岗位名称和JD中的级别信号
  const combinedText = target_role + ' ' + jd_text;
  let requiredSeniority: 'senior' | 'junior' | 'neutral' = 'neutral';

  for (const signal of senioritySignals) {
    if (combinedText.includes(signal)) {
      requiredSeniority = 'senior';
      break;
    }
  }
  if (requiredSeniority === 'neutral') {
    for (const signal of juniorSignals) {
      if (combinedText.includes(signal)) {
        requiredSeniority = 'junior';
        break;
      }
    }
  }

  // 如果未检测到明确级别信号，则返回
  if (requiredSeniority === 'neutral') {
    return { signals, confidenceBoost };
  }

  // 分析简历资历信号
  const resumeText = resume_sentences.join(' ');

  // 1. 年限提取：查找数字+年模式
  const yearPattern = /(\d+)\s*年/g;
  let maxYears = 0;
  let match;
  while ((match = yearPattern.exec(resumeText)) !== null) {
    const years = parseInt(match[1], 10);
    if (years > maxYears) maxYears = years;
  }

  // 2. 主导性词语
  const leadershipWords = ['负责', '主导', '独立负责', '带领', '管理', '统筹', '牵头'];
  const supportWords = ['协助', '配合', '参与', '支持', '协同'];
  let leadershipCount = 0;
  let supportCount = 0;

  for (const sentence of resume_sentences) {
    if (leadershipWords.some(word => sentence.includes(word))) leadershipCount++;
    if (supportWords.some(word => sentence.includes(word))) supportCount++;
  }

  // 3. 判断资历级别
  let resumeSeniority: 'senior' | 'junior' | 'neutral' = 'neutral';
  if (maxYears >= 5 || leadershipCount > supportCount) {
    resumeSeniority = 'senior';
  } else if (maxYears <= 2 && supportCount > leadershipCount) {
    resumeSeniority = 'junior';
  }

  // 4. 检测不匹配
  if (requiredSeniority === 'senior' && resumeSeniority === 'junior') {
    signals.push('岗位要求高级/资深资历，但简历体现的年限或主导性偏向初级');
    confidenceBoost += 0.2;
  } else if (requiredSeniority === 'junior' && resumeSeniority === 'senior') {
    signals.push('岗位要求初级/助理资历，但简历体现的年限或主导性偏向资深');
    confidenceBoost += 0.1;
  } else if (requiredSeniority === 'senior' && resumeSeniority === 'neutral') {
    signals.push('岗位要求高级/资深资历，但简历未明确体现足够年限或主导性');
    confidenceBoost += 0.1;
  } else if (requiredSeniority === 'junior' && resumeSeniority === 'neutral') {
    // 初级要求与中性简历无明显冲突，不加信号
  }

  return { signals, confidenceBoost };
}