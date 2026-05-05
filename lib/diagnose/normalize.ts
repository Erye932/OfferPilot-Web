// 标准化输入模块

import type { DiagnoseRequest, NormalizedInput, JdQuality, ResumeSection, ResumeSectionType } from './types';
import { resolveRole } from './role-resolver';
import { logInfo } from '../error-handler';

// ─── 段落类型识别策略 ────────────────────────────────────────
interface ParagraphContext {
  /** 教育继承剩余预算（0 = 无继承） */
  educationInheritRemaining: number;
  /** 工作经历继承剩余预算 */
  workInheritRemaining: number;
  /** 项目继承剩余预算 */
  projectInheritRemaining: number;
}

interface ParagraphDetection {
  type: ResumeSectionType;
  title: string;
}

interface StrategyResult {
  type: ResumeSectionType;
  title: string;
  contextUpdates: Partial<ParagraphContext>;
}

/**
 * 教育继承策略：
 * 1. 如果当前段落是“教育经历”标题，给后续段落 2 段继承预算
 * 2. 如果当前是 other 但有教育内容特征且还有预算，标记为 education
 * 3. 遇到非教育段落时，教育继承预算清零
 */
function educationInheritStrategy(
  paragraph: string,
  detected: ParagraphDetection,
  context: ParagraphContext
): StrategyResult {
  const looksLikeEducationContent = (p: string): boolean => {
    const text = p.replace(/\s+/g, '');
    return /大学|学院|university|college|学校|学历|学位|专业|主修|GPA|绩点|毕业|入学|在读|核心课程|奖学金|排名|学号|本科|硕士|博士|学士|研究生|研究生院|双学位|辅修|学分|成绩|平均分|绩点|年级|班级|导师|毕业论文|毕业设计|学术|学习经历|学习背景/i.test(text);
  };

  const looksLikeEducationHeaderOnly = (p: string): boolean => {
    const oneLine = p.trim().replace(/\s+/g, '');
    return /^(教育|学历|学业|教育背景|教育经历|学校经历|学业经历|education)$/i.test(oneLine);
  };

  let type = detected.type;
  const updates: Partial<ParagraphContext> = {};

  // 如果这一段只是“教育经历”标题，不要让它成为教育内容的唯一载体
  if (type === 'education' && looksLikeEducationHeaderOnly(paragraph)) {
    updates.educationInheritRemaining = 2; // 给紧邻段落一个短窗口
  }

  // 当“教育经历”作为单独标题段落出现时，后续紧邻段落往往是教育内容
  if (type === 'other' && context.educationInheritRemaining > 0 && looksLikeEducationContent(paragraph)) {
    type = 'education';
    updates.educationInheritRemaining = context.educationInheritRemaining - 1;
  }

  // 一旦命中非教育段落，教育继承窗口应立即失效
  if (type !== 'other' && type !== 'education') {
    updates.educationInheritRemaining = 0;
  }

  return { type, title: detected.title, contextUpdates: updates };
}

/**
 * 工作经历继承策略：
 * 工作经历标题后 1~2 段可能是工作内容描述
 */
function workInheritStrategy(
  paragraph: string,
  detected: ParagraphDetection,
  context: ParagraphContext
): StrategyResult {
  const looksLikeWorkContent = (p: string): boolean => {
    const text = p.replace(/\s+/g, '');
    return /公司|有限|集团|科技|inc|ltd|corp|职责|负责|参与|项目|团队|部门|业绩|成果|贡献|提升|优化|改进|实施|开发|设计/i.test(text);
  };

  const looksLikeWorkHeaderOnly = (p: string): boolean => {
    const oneLine = p.trim().replace(/\s+/g, '');
    return /^(工作经历|工作经验|职业经历|从业经历|work\s*experience|employment)$/i.test(oneLine);
  };

  let type = detected.type;
  const updates: Partial<ParagraphContext> = {};

  if (type === 'work_experience' && looksLikeWorkHeaderOnly(paragraph)) {
    updates.workInheritRemaining = 2;
  }

  if (type === 'other' && context.workInheritRemaining > 0 && looksLikeWorkContent(paragraph)) {
    type = 'work_experience';
    updates.workInheritRemaining = context.workInheritRemaining - 1;
  }

  // 遇到其他明确类型时，工作继承窗口失效
  if (type !== 'other' && type !== 'work_experience') {
    updates.workInheritRemaining = 0;
  }

  return { type, title: detected.title, contextUpdates: updates };
}

/**
 * 项目继承策略：
 * 项目标题后 1~2 段可能是项目描述
 */
function projectInheritStrategy(
  paragraph: string,
  detected: ParagraphDetection,
  context: ParagraphContext
): StrategyResult {
  const looksLikeProjectContent = (p: string): boolean => {
    const text = p.replace(/\s+/g, '');
    return /项目|project|需求|设计|实现|测试|上线|部署|技术栈|架构|模块|功能|用户|客户|交付|成果|效果|价值/i.test(text);
  };

  const looksLikeProjectHeaderOnly = (p: string): boolean => {
    const oneLine = p.trim().replace(/\s+/g, '');
    return /^(项目经历|项目经验|项目描述|主要项目|project)$/i.test(oneLine);
  };

  let type = detected.type;
  const updates: Partial<ParagraphContext> = {};

  if (type === 'project' && looksLikeProjectHeaderOnly(paragraph)) {
    updates.projectInheritRemaining = 2;
  }

  if (type === 'other' && context.projectInheritRemaining > 0 && looksLikeProjectContent(paragraph)) {
    type = 'project';
    updates.projectInheritRemaining = context.projectInheritRemaining - 1;
  }

  // 遇到其他明确类型时，项目继承窗口失效
  if (type !== 'other' && type !== 'project') {
    updates.projectInheritRemaining = 0;
  }

  return { type, title: detected.title, contextUpdates: updates };
}

/**
 * 模拟角色上下文继承策略：
 * 检测“模拟财务总监”等头衔，将后续段落标记为 work_experience 并继承
 */
function mockRoleInheritStrategy(
  paragraph: string,
  detected: ParagraphDetection,
  _context: ParagraphContext
): StrategyResult {
  const hasMockRoleTitle = (p: string): boolean => {
    return /模拟[^，。、；：！？]*总监|模拟[^，。、；：！？]*经理|模拟[^，。、；：！？]*负责人|模拟[^，。、；：！？]*主管|模拟[^，。、；：！？]*CEO|模拟[^，。、；：！？]*CTO|模拟[^，。、；：！？]*COO|沙盘[^，。、；：！？]*角色|ERP[^，。、；：！？]*模拟|企业模拟[^，。、；：！？]*担任|课程项目[^，。、；：！？]*担任|竞赛[^，。、；：！？]*担任|实训[^，。、；：！？]*担任/i.test(p);
  };

  // 如果段落包含模拟头衔，则标记为 work_experience 并给后续段落继承预算
  if (hasMockRoleTitle(paragraph) && detected.type === 'other') {
    return {
      type: 'work_experience',
      title: detected.title,
      contextUpdates: { workInheritRemaining: 2 }
    };
  }

  return { type: detected.type, title: detected.title, contextUpdates: {} };
}

// 策略执行顺序
const STRATEGIES = [
  educationInheritStrategy,
  workInheritStrategy,
  projectInheritStrategy,
  mockRoleInheritStrategy,
];

// 输入质量错误
export class InputQualityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputQualityError';
  }
}

/**
 * 文本清洗 — 保留段落结构（空行 / 换行）
 * 只压缩同一行内的连续空格，不压缩换行符
 */
function cleanText(text: string): string {
  // 统一换行符
  let cleaned = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // 去除不可见控制字符（保留 \n \t）
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // 每行内部：连续空格/制表符 -> 单空格（不吃换行）
  cleaned = cleaned.replace(/[^\S\n]+/g, ' ');
  // 连续 3 个以上空行 -> 2 个空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  // 中文标点周围多余空格
  cleaned = cleaned.replace(/ *([，。；：！？、（）《》【】]) */g, '$1');
  cleaned = cleaned.trim();
  return cleaned;
}

/**
 * 输入质量检测 - 避免机械误杀正常简历
 */
function validateInputQuality(text: string): void {
  const trimmed = text.trim();

  if (trimmed.length < 100) {
    throw new InputQualityError('简历文本长度不足100字，请补充更多内容。');
  }

  // 最大长度限制：防止过大的输入导致性能问题或攻击
  if (trimmed.length > 100000) {
    throw new InputQualityError('简历文本过长，请控制在10万字以内。');
  }

  if (/^\d+$/.test(trimmed)) {
    throw new InputQualityError('简历文本不能仅为数字，请粘贴有效的简历内容。');
  }

  // 改进字符检测：允许更多合法字符（包括小数点、百分比、括号、货币符号等）
  const normalCharRegex = /[\u4e00-\u9fa5a-zA-Z0-9\s，。；：！？、（）《》【】""''…—\-\.\,\;\!\?\(\)\[\]\{\}\<\>\:\"\'`\~\@\#\$\%\^\&\*\_\+\=\/\|\\\/\·\～\|\℃\°\™\®\©\√\≈\≠\≤\≥\±\×\÷\←\→\↑\↓\↔\↕\↖\↗\↘\↙\▲\▼\◆\●\★\☆\■\□\▲\▼\◇\○\◎\※\〓\＠\＃\＄\％\＾\＆\＊\（\）\—\＋\＝\｛\｝\｜\｀\～\＼\、\￥\￡\￠\♂\♀\〡\〢\〣\〤\〥\〦\〧\〨\〩\㊀\㊁\㊂\㊃\㊄\㊅\㊆\㊇\㊈\㊉\Ⅰ\Ⅱ\Ⅲ\Ⅳ\Ⅴ\Ⅵ\Ⅶ\Ⅷ\Ⅸ\Ⅹ\Ⅺ\Ⅻ\ⅰ\ⅱ\ⅲ\ⅳ\ⅴ\ⅵ\ⅶ\ⅷ\ⅸ\ⅹ\ⅺ\ⅻ\①\②\③\④\⑤\⑥\⑦\⑧\⑨\⑩\⑪\⑫\⑬\⑭\⑮\⑯\⑰\⑱\⑲\⑳]/g;
  const normalMatches = trimmed.match(normalCharRegex);
  const normalCount = normalMatches ? normalMatches.length : 0;
  const totalCount = trimmed.length;

  // 放宽异常字符比例阈值：从0.7降到0.6，避免误杀含特殊符号的正常简历
  if (totalCount > 0 && normalCount / totalCount < 0.6) {
    throw new InputQualityError('检测到较多异常字符，可能是乱码或格式错误，请检查粘贴内容。');
  }

  // 改进重复字符检测：只检查连续重复超过20次的同一字符，避免误伤正常内容（如多个分隔符）
  if (/(.)\1{20,}/.test(trimmed)) {
    throw new InputQualityError('检测到大量重复字符，请输入有效的简历内容。');
  }

  // 新增检测：检查是否包含可读的中文或英文内容
  const hasChinese = /[\u4e00-\u9fa5]/.test(trimmed);
  const hasEnglish = /[a-zA-Z]{3,}/.test(trimmed);
  if (!hasChinese && !hasEnglish) {
    throw new InputQualityError('简历文本缺乏可读的中文或英文内容，请检查粘贴内容。');
  }
}

/**
 * 评估JD质量等级
 */
export function assessJdQuality(jdText: string): JdQuality {
  if (!jdText || jdText.trim().length === 0) {
    return 'none';
  }
  const trimmed = jdText.trim();
  if (trimmed.length < 30) {
    return 'weak';
  }
  const stopWords = ['的', '了', '在', '和', '与', '及', '等', '对', '为', '并', '或', '且', '但', '而'];
  const words = trimmed.split(/[，,。；\.\s]/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !stopWords.includes(w));
  if (words.length < 5) {
    return 'weak';
  }
  const sentences = trimmed.split(/[。；\.\n：:]/).filter(s => s.trim().length > 0);
  const hasDetailedSentences = sentences.some(sentence => {
    const sentenceWords = sentence.split(/[\s,，、]/).filter(w => w.length > 0);
    return sentenceWords.length >= 3;
  });
  if (!hasDetailedSentences) {
    return 'weak';
  }
  return 'strong';
}

/**
 * 识别段落类型 — 通过标题行关键词匹配
 */
function detectSectionType(paragraph: string): { type: ResumeSectionType; title: string } {
  // 取第一行作为可能的标题
  const firstLine = paragraph.split('\n')[0].trim();
  const lower = firstLine.toLowerCase();

  const patterns: { type: ResumeSectionType; keywords: RegExp }[] = [
    { type: 'personal_info', keywords: /^(个人信息|基本信息|联系方式|个人简介|personal\s*info)/i },
    { type: 'education', keywords: /^(教育|学历|学业|教育背景|教育经历|学校经历|学业经历|education)/i },
    { type: 'work_experience', keywords: /^(工作经历|工作经验|职业经历|从业经历|work\s*experience|employment)/i },
    { type: 'project', keywords: /^(项目经历|项目经验|项目描述|主要项目|project)/i },
    { type: 'internship', keywords: /^(实习经历|实习经验|实习|internship)/i },
    { type: 'skill', keywords: /^(专业技能|技能|技术栈|掌握技能|skill|技术能力|核心能力)/i },
    { type: 'self_evaluation', keywords: /^(自我评价|个人总结|自我介绍|个人评价|自述|self\s*evaluation|summary|objective)/i },
    { type: 'certificate', keywords: /^(证书|资格|获奖|荣誉|奖项|certification|award)/i },
  ];

  for (const { type, keywords } of patterns) {
    if (keywords.test(lower)) {
      return { type, title: firstLine };
    }
  }

  // 启发式：内容特征判断
  const content = paragraph;
  if (/\d{4}\s*[-–—~]\s*(至今|present|\d{4})/.test(content) && /(公司|有限|集团|科技|inc|ltd|corp)/i.test(content)) {
    return { type: 'work_experience', title: '' };
  }
  if (/\d{4}\s*[-–—~]\s*(至今|present|\d{4})/.test(content) && /(大学|学院|university|college|学校)/i.test(content)) {
    return { type: 'education', title: '' };
  }
  if (/\d{4}\s*[-–—~]\s*(至今|present|\d{4})/.test(content) && /实习/.test(content)) {
    return { type: 'internship', title: '' };
  }

  return { type: 'other', title: '' };
}

/**
 * 将段落列表转换为结构化段落（带类型标签）
 * 使用策略集合进行段落类型识别和继承处理
 */
function buildResumeSections(paragraphs: string[]): ResumeSection[] {
  const sections: ResumeSection[] = [];
  // 上下文状态，在各策略间共享
  let context: ParagraphContext = {
    educationInheritRemaining: 0,
    workInheritRemaining: 0,
    projectInheritRemaining: 0,
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const detected = detectSectionType(p);

    let currentType = detected.type;
    let currentTitle = detected.title;

    // 依次应用策略
    for (const strategy of STRATEGIES) {
      const result = strategy(p, { type: currentType, title: currentTitle }, context);
      currentType = result.type;
      currentTitle = result.title;
      // 合并上下文更新
      context = { ...context, ...result.contextUpdates };
    }

    sections.push({ type: currentType, title: currentTitle, content: p, paragraph_index: i });
  }

  return sections;
}

/**
 * 智能分句：避免切分小数、百分比、邮箱、URL
 */
function splitSentences(text: string): string[] {
  // 保护邮箱和URL：用占位符替换
  const emailRegex = /[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}/g;
  const urlRegex = /https?:\/\/[^\s]+/g;
  const placeholders: string[] = [];

  let protectedText = text.replace(emailRegex, (match) => {
    placeholders.push(match);
    return `__EMAIL_${placeholders.length - 1}__`;
  });
  protectedText = protectedText.replace(urlRegex, (match) => {
    placeholders.push(match);
    return `__URL_${placeholders.length - 1}__`;
  });

  // 分句正则：匹配中文句号、分号、感叹号、问号，但排除数字中间的点
  // 使用正向后行断言(?<=...)和正向前瞻断言(?=...)需要ES2018
  // 简化：先按换行分割，再按句末标点分割
  const lines = protectedText.split('\n');
  const sentences: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // 按句末标点分割，但排除小数点
    const parts = line.split(/(?<=[。；！？])\s*/);
    for (const part of parts) {
      if (part.trim()) sentences.push(part.trim());
    }
  }

  // 恢复占位符
  const restored = sentences.map(s => {
    let restored = s;
    placeholders.forEach((ph, idx) => {
      restored = restored.replace(`__EMAIL_${idx}__`, ph);
      restored = restored.replace(`__URL_${idx}__`, ph);
    });
    return restored;
  });

  return restored.filter(s => s.length > 0);
}

/**
 * 检测经验级别：社招/校招
 */
function detectExperienceLevel(resumeText: string, sentences: string[]): 'senior' | 'junior' | 'neutral' {
  // 1. 年限提取
  const yearPattern = /(\d+)\s*年/g;
  let maxYears = 0;
  let match;
  while ((match = yearPattern.exec(resumeText)) !== null) {
    const years = parseInt(match[1], 10);
    if (years > maxYears) maxYears = years;
  }

  // 2. 主导性词语 vs 支持性词语
  const leadershipWords = ['负责', '主导', '独立负责', '带领', '管理', '统筹', '牵头'];
  const supportWords = ['协助', '配合', '参与', '支持', '协同'];
  let leadershipCount = 0;
  let supportCount = 0;

  for (const sentence of sentences) {
    if (leadershipWords.some(word => sentence.includes(word))) leadershipCount++;
    if (supportWords.some(word => sentence.includes(word))) supportCount++;
  }

  // 3. 判断
  if (maxYears >= 5 || leadershipCount > supportCount) {
    return 'senior';
  } else if (maxYears <= 2 && supportCount > leadershipCount) {
    return 'junior';
  }
  return 'neutral';
}

/**
 * 标准化输入
 */
export async function normalizeInput(request: DiagnoseRequest): Promise<NormalizedInput> {
  const { target_role, tier } = request;
  let { resume_text, jd_text = '' } = request;

  resume_text = cleanText(resume_text);
  jd_text = cleanText(jd_text);

  // 输入长度限制（安全与性能）
  if (target_role.length > 200) {
    throw new InputQualityError('目标岗位描述过长，请控制在200字符以内。');
  }
  if (jd_text.length > 10000) {
    throw new InputQualityError('岗位描述过长，请控制在1万字以内。');
  }

  validateInputQuality(resume_text);

  // 按句子分割（智能分句）
  const sentences = splitSentences(resume_text);

  // 段落：优先使用前端 PDF 解析已经切好的 paragraphs
  let resume_paragraphs: string[];

  if (request.resume_paragraphs && request.resume_paragraphs.length > 1) {
    // 前端（PDF 或粘贴）已经提供了结构化段落
    resume_paragraphs = request.resume_paragraphs
      .map(p => cleanText(p))
      .filter(p => p.length > 0);
  } else {
    // 降级：自行分段
    resume_paragraphs = resume_text
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    // 如果双换行只分出 1~2 段但文本较长，尝试用单换行重分
    if (resume_paragraphs.length <= 2 && resume_text.length > 300) {
      const singleLineSplit = resume_text
        .split(/\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

      if (singleLineSplit.length >= 4) {
        const merged: string[] = [];
        let buf = '';
        for (const line of singleLineSplit) {
          const isSectionHeader = detectSectionType(line).type !== 'other' && line.length < 20;
          if (isSectionHeader && buf) {
            merged.push(buf);
            buf = line;
          } else if (buf && line.length < 15 && buf.length > 50) {
            merged.push(buf);
            buf = line;
          } else {
            buf = buf ? buf + '\n' + line : line;
          }
        }
        if (buf) merged.push(buf);

        if (merged.length > resume_paragraphs.length) {
          resume_paragraphs = merged;
        }
      }
    }
  }

  // 构建结构化段落
  const resume_sections = buildResumeSections(resume_paragraphs);

  // 语义提取：从JD中提取有意义的短语和关键词，强调语义而非字面匹配
  const stopWords = ['的', '了', '在', '和', '与', '及', '等', '对', '为', '并', '或', '且', '但', '而', '如果', '因为', '所以', '因此', '可以', '能够', '需要', '要求', '具备', '具有', '拥有', '负责', '参与', '协助', '进行', '完成', '实现', '提升', '优化', '改善', '提高', '增加', '减少', '节省', '达到', '具备', '具有', '拥有', '掌握', '熟悉', '了解', '精通', '熟练', '擅长', '能够', '可以', '需要', '要求', '必要', '优先', '至少', '以上', '以下', '之内', '之间'];

  // 优先提取名词性短语和动宾结构（2-4个词）
  const jdPhrases: string[] = [];
  const jdSentences = jd_text.split(/[。；\.\n]/).filter(s => s.trim().length > 0);

  // 扩展停用词：包含常见动词、形容词、副词（这些词单独出现时不是核心能力）
  const extendedStopWords = new Set([...stopWords, ...'一二三四五六七八九十百千万亿年月日时分秒'.split('')]);

  for (const sentence of jdSentences) {
    // 按标点、空格、逗号分割，保留原始词序
    const words = sentence.split(/[\s,，、]/).filter(w => w.trim().length > 0);

    // 滑动窗口提取短语（2-4个词）
    for (let i = 0; i < words.length - 1; i++) {
      for (let length = 2; length <= Math.min(4, words.length - i); length++) {
        const phraseWords = words.slice(i, i + length);
        const phrase = phraseWords.join('');

        // 检查短语质量：不能全是停用词，且不能是纯数字
        const hasMeaningfulChar = /[\u4e00-\u9fa5a-zA-Z]/.test(phrase);
        const isAllStopWords = phraseWords.every(w => extendedStopWords.has(w) || w.length === 1);
        const isPureNumber = /^\d+$/.test(phrase);

        // 长度限制：2-12字符（避免过长）
        if (hasMeaningfulChar && !isAllStopWords && !isPureNumber && phrase.length >= 2 && phrase.length <= 12) {
          jdPhrases.push(phrase);
        }
      }
    }

    // 提取重要的单个词（非停用词，且不是纯功能词）
    words.forEach(word => {
      const cleanWord = word.trim();
      if (cleanWord.length > 1 &&
          !extendedStopWords.has(cleanWord) &&
          /[\u4e00-\u9fa5a-zA-Z]/.test(cleanWord) &&
          !/^\d+$/.test(cleanWord)) {
        jdPhrases.push(cleanWord);
      }
    });
  }

  // 去重并限制数量（优先保留较长的短语，因为它们包含更多语义）
  const uniquePhrases = Array.from(new Set(jdPhrases));
  // 按长度降序排序，保留前30个
  uniquePhrases.sort((a, b) => b.length - a.length);
  const jdKeywords = uniquePhrases.slice(0, 30);

  const jd_quality = assessJdQuality(jd_text);

  // 检测经验级别
  const experience_level = detectExperienceLevel(resume_text, sentences);

  // 构建基础NormalizedInput
  const baseInput: NormalizedInput = {
    resume_text,
    target_role,
    jd_text,
    tier,
    resume_sentences: sentences,
    resume_paragraphs,
    resume_sections,
    jd_keywords: jdKeywords,
    jd_quality,
    text_quality: 'sufficient',
    experience_level,
  };

  // 岗位语义解析
  let role_resolution;
  try {
    role_resolution = await resolveRole(baseInput);
    logInfo('Normalize', '岗位解析成功', {
      raw_role: role_resolution.raw_role,
      canonical_role: role_resolution.canonical_role,
      role_family: role_resolution.role_family,
      confidence: role_resolution.confidence,
    });
  } catch (error) {
    logInfo('Normalize', '岗位解析失败，使用默认', {
      error: error instanceof Error ? error.message : String(error),
    });
    // 提供默认解析结果
    role_resolution = {
      raw_role: target_role,
      canonical_role: target_role,
      role_family: '未知',
      alt_roles: [],
      skills_inferred: [],
      confidence: 0.1,
      ambiguity: '解析失败，使用原始输入',
    };
  }

  return {
    ...baseInput,
    role_resolution,
  };
}

/**
 * 提取文本中的关键词
 */
export function extractKeywords(text: string, maxKeywords: number = 50): string[] {
  const stopWords = ['的', '了', '在', '和', '与', '及', '等', '对', '为', '并', '或', '且', '但', '而'];
  return text
    .split(/[，,。；\.\s]/)
    .map(word => word.trim())
    .filter(word => word.length > 1 && !stopWords.includes(word))
    .slice(0, maxKeywords);
}

/**
 * 计算文本相似度（简单实现）
 */
export function simpleTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  const words1 = text1.split(/[\s,，。；\.]/).filter(w => w.length > 0);
  const words2 = text2.split(/[\s,，。；\.]/).filter(w => w.length > 0);
  if (words1.length === 0 || words2.length === 0) return 0;
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let common = 0;
  set1.forEach(word => {
    if (set2.has(word)) common++;
  });
  return common / Math.max(words1.length, words2.length);
}
