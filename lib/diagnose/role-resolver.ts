// 岗位语义解析器
// 混合方案：规则清洗 + 岗位词典映射 + 技能信号补强 + LLM意图判定（模糊时）

import type { NormalizedInput, RoleResolution } from './types';
import { aiRouter } from '../ai/router';
import { logInfo, logWarn } from '../error-handler';

// 岗位词典：标准岗位名称到岗位族系的映射
const ROLE_DICTIONARY: Record<string, { canonical: string; family: string; alt: string[] }> = {
  // 前端开发族
  '前端工程师': { canonical: '前端工程师', family: '前端开发', alt: ['前端开发工程师', 'Web前端工程师', '前端开发'] },
  '前端开发工程师': { canonical: '前端工程师', family: '前端开发', alt: ['前端工程师', 'Web前端工程师', '前端开发'] },
  'Web前端工程师': { canonical: '前端工程师', family: '前端开发', alt: ['前端工程师', '前端开发工程师', '前端开发'] },
  '前端开发': { canonical: '前端工程师', family: '前端开发', alt: ['前端工程师', '前端开发工程师', 'Web前端工程师'] },
  'JavaScript工程师': { canonical: '前端工程师', family: '前端开发', alt: ['前端工程师', 'JS工程师', 'Web前端工程师'] },
  'React工程师': { canonical: '前端工程师', family: '前端开发', alt: ['前端工程师', 'React开发工程师', '前端开发工程师'] },
  'Vue工程师': { canonical: '前端工程师', family: '前端开发', alt: ['前端工程师', 'Vue开发工程师', '前端开发工程师'] },

  // 后端开发族
  '后端工程师': { canonical: '后端工程师', family: '后端开发', alt: ['后端开发工程师', '服务器端工程师', '后端开发'] },
  '后端开发工程师': { canonical: '后端工程师', family: '后端开发', alt: ['后端工程师', '服务器端工程师', '后端开发'] },
  'Java工程师': { canonical: '后端工程师', family: '后端开发', alt: ['Java开发工程师', '后端工程师', 'Java后端工程师'] },
  'Python工程师': { canonical: '后端工程师', family: '后端开发', alt: ['Python开发工程师', '后端工程师', 'Python后端工程师'] },
  'Go工程师': { canonical: '后端工程师', family: '后端开发', alt: ['Go开发工程师', '后端工程师', 'Go后端工程师'] },
  'Node.js工程师': { canonical: '后端工程师', family: '后端开发', alt: ['Node.js开发工程师', '后端工程师', 'Node.js后端工程师'] },
  'PHP工程师': { canonical: '后端工程师', family: '后端开发', alt: ['PHP开发工程师', '后端工程师', 'PHP后端工程师'] },

  // 全栈开发族
  '全栈工程师': { canonical: '全栈工程师', family: '全栈开发', alt: ['全栈开发工程师', 'Web全栈工程师', '全栈开发'] },
  '全栈开发工程师': { canonical: '全栈工程师', family: '全栈开发', alt: ['全栈工程师', 'Web全栈工程师', '全栈开发'] },
  'Web全栈工程师': { canonical: '全栈工程师', family: '全栈开发', alt: ['全栈工程师', '全栈开发工程师', '全栈开发'] },

  // 移动开发族
  'Android工程师': { canonical: 'Android工程师', family: '移动开发', alt: ['Android开发工程师', '移动开发工程师', 'Android开发'] },
  'iOS工程师': { canonical: 'iOS工程师', family: '移动开发', alt: ['iOS开发工程师', '移动开发工程师', 'iOS开发'] },
  '移动开发工程师': { canonical: '移动开发工程师', family: '移动开发', alt: ['Android工程师', 'iOS工程师', '移动开发'] },
  'Flutter工程师': { canonical: '移动开发工程师', family: '移动开发', alt: ['Flutter开发工程师', '移动开发工程师', '跨平台开发工程师'] },
  'React Native工程师': { canonical: '移动开发工程师', family: '移动开发', alt: ['React Native开发工程师', '移动开发工程师', '跨平台开发工程师'] },

  // 数据科学与分析族
  '数据分析师': { canonical: '数据分析师', family: '数据分析', alt: ['数据分析师', '业务分析师', '数据运营'] },
  '数据科学家': { canonical: '数据科学家', family: '数据科学', alt: ['数据科学家', '机器学习工程师', 'AI工程师'] },
  '数据工程师': { canonical: '数据工程师', family: '数据工程', alt: ['数据开发工程师', '大数据工程师', 'ETL工程师'] },
  '机器学习工程师': { canonical: '机器学习工程师', family: '数据科学', alt: ['机器学习工程师', 'AI工程师', '算法工程师'] },
  '算法工程师': { canonical: '算法工程师', family: '数据科学', alt: ['算法工程师', '机器学习工程师', 'AI工程师'] },

  // 运维与DevOps族
  '运维工程师': { canonical: '运维工程师', family: '运维', alt: ['系统运维工程师', 'IT运维工程师', '运维开发工程师'] },
  'DevOps工程师': { canonical: 'DevOps工程师', family: 'DevOps', alt: ['运维开发工程师', '平台工程师', 'SRE工程师'] },
  'SRE工程师': { canonical: 'SRE工程师', family: 'DevOps', alt: ['站点可靠性工程师', 'DevOps工程师', '运维工程师'] },
  '系统工程师': { canonical: '系统工程师', family: '运维', alt: ['系统架构师', '系统运维工程师', '网络工程师'] },

  // 测试与质量保证族
  '测试工程师': { canonical: '测试工程师', family: '测试', alt: ['QA工程师', '软件测试工程师', '质量保证工程师'] },
  'QA工程师': { canonical: '测试工程师', family: '测试', alt: ['测试工程师', '软件测试工程师', '质量保证工程师'] },
  '自动化测试工程师': { canonical: '测试工程师', family: '测试', alt: ['测试工程师', '自动化测试', '测试开发工程师'] },

  // 产品与设计族
  '产品经理': { canonical: '产品经理', family: '产品', alt: ['产品负责人', '产品设计师', '产品策划'] },
  'UI设计师': { canonical: 'UI设计师', family: '设计', alt: ['用户界面设计师', '视觉设计师', 'UI/UX设计师'] },
  'UX设计师': { canonical: 'UX设计师', family: '设计', alt: ['用户体验设计师', '交互设计师', 'UI/UX设计师'] },
  '交互设计师': { canonical: '交互设计师', family: '设计', alt: ['用户体验设计师', 'UX设计师', 'UI/UX设计师'] },

  // 财务与会计族
  '财务分析师': { canonical: '财务分析师', family: '财务', alt: ['财务分析', '财务专员', '财务'] },
  '会计': { canonical: '会计', family: '财务', alt: ['会计师', '财务会计', '会计专员'] },
  '税务专员': { canonical: '税务专员', family: '财务', alt: ['税务', '税务会计', '税务筹划'] },
  '审计': { canonical: '审计', family: '财务', alt: ['审计员', '审计师', '内部审计'] },

  // 人力资源族
  'HR': { canonical: 'HR', family: '人力资源', alt: ['人力资源专员', '人事', '招聘专员'] },
  '招聘专员': { canonical: '招聘专员', family: '人力资源', alt: ['招聘', '人才招聘', 'HR招聘'] },
  '人力资源专员': { canonical: 'HR', family: '人力资源', alt: ['HR', '人事专员', '人力资源'] },

  // 运营与市场族
  '运营专员': { canonical: '运营专员', family: '运营', alt: ['运营', '产品运营', '用户运营'] },
  '市场专员': { canonical: '市场专员', family: '市场', alt: ['市场营销', '市场推广', '品牌推广'] },
  '新媒体运营': { canonical: '运营专员', family: '运营', alt: ['新媒体', '社交媒体运营', '内容运营'] },
};

// 技能关键词到岗位族的映射（用于从简历/JD推断）
const SKILL_TO_FAMILY: Record<string, string[]> = {
  // 前端技能
  'JavaScript': ['前端开发', '全栈开发'],
  'TypeScript': ['前端开发', '全栈开发'],
  'React': ['前端开发', '全栈开发'],
  'Vue': ['前端开发', '全栈开发'],
  'Angular': ['前端开发', '全栈开发'],
  'HTML': ['前端开发', '全栈开发'],
  'CSS': ['前端开发', '全栈开发'],
  'Webpack': ['前端开发', '全栈开发'],
  'Vite': ['前端开发', '全栈开发'],

  // 后端技能
  'Java': ['后端开发', '全栈开发'],
  'Python': ['后端开发', '全栈开发', '数据科学'],
  'Go': ['后端开发', '全栈开发'],
  'Node.js': ['后端开发', '全栈开发'],
  'PHP': ['后端开发', '全栈开发'],
  'C++': ['后端开发', '系统开发'],
  'C#': ['后端开发', '全栈开发'],
  'Spring': ['后端开发'],
  'Django': ['后端开发'],
  'Flask': ['后端开发'],
  'MySQL': ['后端开发', '数据工程'],
  'PostgreSQL': ['后端开发', '数据工程'],
  'MongoDB': ['后端开发', '数据工程'],
  'Redis': ['后端开发', '数据工程'],

  // 移动开发技能
  'Android': ['移动开发'],
  'iOS': ['移动开发'],
  'Flutter': ['移动开发'],
  'React Native': ['移动开发'],
  'Swift': ['移动开发'],
  'Kotlin': ['移动开发'],

  // 数据技能
  'SQL': ['数据工程', '数据分析', '后端开发'],
  'Hadoop': ['数据工程'],
  'Spark': ['数据工程'],
  'Hive': ['数据工程'],
  'TensorFlow': ['数据科学'],
  'PyTorch': ['数据科学'],
  '机器学习': ['数据科学'],
  '深度学习': ['数据科学'],
  '数据挖掘': ['数据科学', '数据分析'],
  '统计分析': ['数据分析'],
  'Tableau': ['数据分析'],
  'Power BI': ['数据分析'],

  // 运维技能
  'Linux': ['运维', 'DevOps'],
  'Docker': ['DevOps', '运维'],
  'Kubernetes': ['DevOps', '运维'],
  'AWS': ['DevOps', '运维', '后端开发'],
  'Azure': ['DevOps', '运维', '后端开发'],
  'GCP': ['DevOps', '运维', '后端开发'],
  'CI/CD': ['DevOps'],
  '监控': ['运维', 'DevOps'],
  '自动化': ['DevOps', '运维'],

  // 测试技能
  '自动化测试': ['测试'],
  'Selenium': ['测试'],
  'JUnit': ['测试'],
  '测试框架': ['测试'],

  // 财务技能
  '财务分析': ['财务'],
  '会计': ['财务'],
  '税务': ['财务'],
  '审计': ['财务'],
  '财务报表': ['财务'],
  '成本控制': ['财务'],

  // 软技能（通用）
  '沟通能力': [], // 忽略，不用于岗位推断
  '团队合作': [],
  '项目管理': ['产品', '运营'],
  '领导力': [],
};

/**
 * 规则清洗：移除无关字符，提取核心岗位描述
 */
function cleanRoleText(rawRole: string): string {
  // 移除括号及其内容
  let cleaned = rawRole.replace(/[\[\(].*?[\]\)]/g, '');
  // 移除特殊字符，保留中文、英文、数字、空格
  cleaned = cleaned.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ');
  // 合并连续空格
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // 移除常见前缀/后缀词
  const stopPrefixes = ['应聘', '求职', '意向', '目标', '岗位', '职位', '申请', '应聘岗位'];
  for (const prefix of stopPrefixes) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.substring(prefix.length).trim();
    }
  }
  const stopSuffixes = ['岗位', '职位', '工作', '方向', '领域'];
  for (const suffix of stopSuffixes) {
    if (cleaned.endsWith(suffix)) {
      cleaned = cleaned.substring(0, cleaned.length - suffix.length).trim();
    }
  }
  return cleaned;
}

/**
 * 岗位词典映射：尝试匹配标准化岗位名称
 */
function dictionaryLookup(cleanedRole: string): {
  matched: boolean;
  canonical?: string;
  family?: string;
  alt?: string[];
  confidence: number;
} {
  if (!cleanedRole) return { matched: false, confidence: 0 };

  // 精确匹配
  if (ROLE_DICTIONARY[cleanedRole]) {
    const entry = ROLE_DICTIONARY[cleanedRole];
    return {
      matched: true,
      canonical: entry.canonical,
      family: entry.family,
      alt: entry.alt,
      confidence: 1.0,
    };
  }

  // 包含匹配（如"高级前端工程师"包含"前端工程师"）
  for (const [key, entry] of Object.entries(ROLE_DICTIONARY)) {
    if (cleanedRole.includes(key) || key.includes(cleanedRole)) {
      return {
        matched: true,
        canonical: entry.canonical,
        family: entry.family,
        alt: entry.alt,
        confidence: 0.8, // 包含匹配置信度较低
      };
    }
  }

  // 分词匹配：将输入按空格分割，检查每个词
  const words = cleanedRole.split(/\s+/);
  for (const word of words) {
    if (ROLE_DICTIONARY[word]) {
      const entry = ROLE_DICTIONARY[word];
      return {
        matched: true,
        canonical: entry.canonical,
        family: entry.family,
        alt: entry.alt,
        confidence: 0.7,
      };
    }
  }

  return { matched: false, confidence: 0 };
}

/**
 * 从简历和JD中提取技能信号
 */
function extractSkillsFromInput(input: NormalizedInput): string[] {
  const skills = new Set<string>();

  // 从简历技能部分提取
  const skillSections = input.resume_sections.filter(s => s.type === 'skill');
  for (const section of skillSections) {
    // 简单分词提取技能关键词
    const words = section.content.split(/[，,。；、\s]/).map(w => w.trim()).filter(w => w.length > 1);
    for (const word of words) {
      if (SKILL_TO_FAMILY[word]) {
        skills.add(word);
      }
    }
  }

  // 从JD关键词提取
  for (const keyword of input.jd_keywords) {
    if (SKILL_TO_FAMILY[keyword]) {
      skills.add(keyword);
    }
  }

  // 从简历全文提取（简单匹配）
  const allText = input.resume_text + ' ' + input.jd_text;
  for (const [skill] of Object.entries(SKILL_TO_FAMILY)) {
    if (allText.includes(skill)) {
      skills.add(skill);
    }
  }

  return Array.from(skills);
}

/**
 * 基于技能信号推断岗位族
 */
function inferRoleFamilyFromSkills(skills: string[]): { families: string[]; confidence: number } {
  const familyCounts: Record<string, number> = {};

  for (const skill of skills) {
    const families = SKILL_TO_FAMILY[skill] || [];
    for (const family of families) {
      familyCounts[family] = (familyCounts[family] || 0) + 1;
    }
  }

  const sorted = Object.entries(familyCounts).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    return { families: [], confidence: 0 };
  }

  const topFamilies = sorted.slice(0, 2).map(([family]) => family);
  const totalSkills = skills.length;
  const confidence = Math.min(0.9, sorted[0][1] / Math.max(1, totalSkills));

  return { families: topFamilies, confidence };
}

/**
 * 使用LLM进行岗位意图判定（当模糊时调用）
 */
async function llmRoleDisambiguation(
  rawRole: string,
  candidates: Array<{ canonical: string; family: string; alt: string[] }>,
  skills: string[]
): Promise<{ canonical: string; family: string; alt: string[]; reasoning: string }> {
  const prompt = `你是一个岗位语义解析专家。用户输入了一个模糊的岗位描述："${rawRole}"。

候选岗位：
${candidates.map((c, i) => `${i + 1}. ${c.canonical} (${c.family})`).join('\n')}

从简历和JD中提取的技能信号：${skills.length > 0 ? skills.join('、') : '无'}

请选择最匹配的标准化岗位，并简要说明理由。输出格式为JSON：
{
  "selected_index": 0,
  "canonical": "标准化岗位名称",
  "family": "岗位族",
  "alt": ["别名1", "别名2"],
  "reasoning": "选择理由"
}`;

  try {
    const response = await aiRouter.route({
      type: 'explain',
      prompt,
      systemPrompt: '你是一个岗位解析助手，输出JSON格式结果。',
      temperature: 0.3,
      maxTokens: 500,
      requireJson: true,
    });

    const result = JSON.parse(response.content);
    const selected = candidates[result.selected_index] || candidates[0];
    return {
      canonical: result.canonical || selected.canonical,
      family: result.family || selected.family,
      alt: result.alt || selected.alt,
      reasoning: result.reasoning || 'LLM解析',
    };
  } catch (error) {
    logWarn('RoleResolver', 'LLM岗位解析失败，使用第一个候选', { error: error instanceof Error ? error.message : String(error) });
    return {
      canonical: candidates[0].canonical,
      family: candidates[0].family,
      alt: candidates[0].alt,
      reasoning: 'LLM解析失败，使用默认候选',
    };
  }
}

/**
 * 主解析函数
 */
export async function resolveRole(input: NormalizedInput): Promise<RoleResolution> {
  const rawRole = input.target_role;
  logInfo('RoleResolver', '开始岗位语义解析', { rawRole });

  // 1. 规则清洗
  const cleaned = cleanRoleText(rawRole);
  logInfo('RoleResolver', '清洗后岗位文本', { cleaned });

  // 2. 岗位词典映射
  const dictResult = dictionaryLookup(cleaned);

  // 3. 提取技能信号
  const skills = extractSkillsFromInput(input);
  logInfo('RoleResolver', '提取的技能信号', { skills });

  // 4. 基于技能推断岗位族
  const skillInference = inferRoleFamilyFromSkills(skills);

  let canonical = '';
  let family = '';
  let alt: string[] = [];
  let confidence = 0;
  let ambiguity: string | undefined;

  if (dictResult.matched) {
    // 词典匹配成功
    canonical = dictResult.canonical ?? rawRole;
    family = dictResult.family ?? '未知';
    alt = dictResult.alt ?? [];
    confidence = dictResult.confidence;

    // 检查技能推断与词典匹配是否一致
    if (skillInference.families.length > 0 && !skillInference.families.includes(family)) {
      // 不一致，降低置信度
      confidence *= 0.7;
      ambiguity = `岗位描述"${cleaned}"与技能信号不一致，技能偏向${skillInference.families.join('、')}`;
    }

    // 如果置信度较低，标记模糊
    if (confidence < 0.6) {
      ambiguity = `岗位描述"${cleaned}"可能不准确`;
    }
  } else {
    // 词典未匹配，基于技能推断
    if (skillInference.families.length > 0) {
      family = skillInference.families[0];
      canonical = `${family}相关岗位`;
      alt = [];
      confidence = skillInference.confidence * 0.8; // 技能推断置信度较低
      ambiguity = `无法精确匹配岗位词典，基于技能信号推断为${family}`;
    } else {
      // 无任何信号，返回原始输入
      canonical = cleaned || rawRole;
      family = '未知';
      alt = [];
      confidence = 0.3;
      ambiguity = '无法识别岗位类型，请提供更明确的岗位描述';
    }
  }

  // 5. 如果模糊且置信度低，使用LLM进一步判定
  if (confidence < 0.5 && dictResult.matched) {
    // 构建候选列表：词典匹配结果 + 技能推断结果
    const candidates = [];
    if (dictResult.matched && dictResult.canonical) {
      candidates.push({
        canonical: dictResult.canonical,
        family: dictResult.family ?? '未知',
        alt: dictResult.alt ?? [],
      });
    }

    // 添加技能推断的岗位族候选
    for (const fam of skillInference.families) {
      // 从词典中找到该族的一个代表岗位
      const familyRole = Object.entries(ROLE_DICTIONARY).find(([, entry]) => entry.family === fam);
      if (familyRole) {
        candidates.push({
          canonical: familyRole[1].canonical,
          family: familyRole[1].family,
          alt: familyRole[1].alt,
        });
      }
    }

    // 去重
    const uniqueCandidates = Array.from(new Map(candidates.map(c => [c.canonical, c])).values());

    if (uniqueCandidates.length > 1) {
      logInfo('RoleResolver', '岗位模糊，调用LLM进行判定', { candidates: uniqueCandidates.length });
      try {
        const llmResult = await llmRoleDisambiguation(rawRole, uniqueCandidates, skills);
        canonical = llmResult.canonical;
        family = llmResult.family;
        alt = llmResult.alt;
        confidence = 0.7; // LLM解析后置信度提高
        ambiguity = `LLM解析: ${llmResult.reasoning}`;
      } catch (error) {
        logWarn('RoleResolver', 'LLM解析失败，保持原结果', { error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const resolution: RoleResolution = {
    raw_role: rawRole,
    canonical_role: canonical,
    role_family: family,
    alt_roles: alt,
    skills_inferred: skills,
    confidence,
    ambiguity,
  };

  logInfo('RoleResolver', '岗位解析完成', { roleResolution: resolution });
  return resolution;
}

/**
 * 集成到NormalizedInput的快捷函数
 */
export async function normalizeInputWithRoleResolution(input: NormalizedInput): Promise<NormalizedInput> {
  const roleResolution = await resolveRole(input);
  return {
    ...input,
    role_resolution: roleResolution,
  };
}