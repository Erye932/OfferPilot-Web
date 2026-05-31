import { describe, it, expect } from 'vitest';
import { detectPersona } from '../lib/diagnose/persona';
import type { NormalizedInput, ResumeSection } from '../lib/diagnose/types';

// ─── helpers (same factory as persona.test.ts) ──────────────

function createInput(overrides: Partial<NormalizedInput> = {}): NormalizedInput {
  return {
    resume_text: '',
    target_role: '前端工程师',
    jd_text: '',
    tier: 'free',
    resume_sentences: [],
    resume_paragraphs: [],
    resume_sections: [],
    jd_keywords: [],
    jd_quality: 'none',
    text_quality: 'sufficient',
    experience_level: 'neutral',
    ...overrides,
  };
}

function section(type: ResumeSection['type'], content = '', title = ''): ResumeSection {
  return {
    type,
    title: title || type,
    content,
    paragraph_index: 0,
  };
}

// ─── Diverse resume texts ───────────────────────────────────

describe('detectPersona — diverse resume texts', () => {
  // ──────────────────────────────────────────────────────────
  // A. Resumes that should be classified as fresh_grad
  // ──────────────────────────────────────────────────────────

  describe('fresh_grad — 典型应届 / 在校场景', () => {
    it('CS 本科应届生 — 校园项目 + 实习 + 学生活动', () => {
      const input = createInput({
        resume_text:
          '应届毕业生，就读于北京邮电大学计算机科学与技术专业。' +
          '在校期间参加了ACM算法竞赛并获得省级二等奖，' +
          '曾在字节跳动完成为期三个月的暑期实习。' +
          '担任校学生会技术部副部长，组织了多次校园编程马拉松活动。',
        resume_sections: [
          section('education', '北京邮电大学 计算机科学与技术'),
          section('internship', '字节跳动 暑期实习'),
          section('project', 'ACM 竞赛项目'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.signals).toContain('explicit_fresh_grad_keyword');
    });

    it('硕士在读 — 研究方向 + 助教 + 课程项目', () => {
      const input = createInput({
        resume_text:
          '清华大学软件工程硕士在读，研究方向为分布式系统。' +
          '担任本科操作系统课程助教两学期，独立完成基于 Raft 的分布式 KV 存储课程项目。' +
          '本科就读于华中科技大学计算机学院。',
        resume_sections: [
          section('education', '清华大学 软件工程硕士'),
          section('project', 'Raft KV 存储'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.signals).toContain('explicit_fresh_grad_keyword');
    });

    it('预计毕业 — 电子信息专业 + 竞赛（教育年份推断）', () => {
      const currentYear = new Date().getFullYear();
      const input = createInput({
        resume_text:
          `东南大学电子信息工程专业本科，预计${currentYear + 1}年6月毕业。` +
          '在校期间获得全国电子设计竞赛一等奖，具备较强的嵌入式开发能力。' +
          '参加了学校创新创业项目，负责硬件驱动层开发。',
        resume_sections: [
          section('education', '东南大学 电子信息工程'),
          section('project', '电子设计竞赛'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.signals).toContain('explicit_fresh_grad_keyword');
    });

    it('准毕业生关键词', () => {
      const input = createInput({
        resume_text:
          '我是一名准毕业生，来自上海交通大学电气工程专业。' +
          '在校期间完成了多个课程设计项目和一段短期实习经历。',
        resume_sections: [
          section('education', '上海交通大学 电气工程'),
          section('internship', '某公司实习'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.signals).toContain('explicit_fresh_grad_keyword');
    });

    it('纯学生活动 + 项目 + junior — 无显式应届关键词（走软信号加权）', () => {
      const input = createInput({
        resume_text:
          '大学期间参加学生会组织工作和社团活动，' +
          '完成多个课程实习项目，熟悉 Python 和 Java 编程语言。' +
          '参加志愿者活动累计服务时长超过100小时。',
        resume_sections: [
          section('education', '某大学本科'),
          section('internship', '某公司实习'),
          section('project', '课程项目'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.signals).toContain('student_activities');
      expect(result.signals).toContain('no_work_only_intern_or_project');
      expect(result.signals).toContain('only_internship_mentioned');
    });

    it('教育年份等于当前年份 + 教育词 — 毕业年份推断', () => {
      const currentYear = new Date().getFullYear();
      const input = createInput({
        resume_text:
          `${currentYear - 4}-${currentYear} 武汉大学 计算机科学与技术 本科` +
          '在校成绩排名前 10%，获国家奖学金。',
        resume_sections: [
          section('education', '武汉大学'),
          section('project', '毕业设计'),
        ],
        experience_level: 'neutral',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.signals.some((s) => s.startsWith('education_year_'))).toBe(true);
    });

    it('即将毕业 — 商科背景求职产品经理', () => {
      const input = createInput({
        resume_text:
          '即将毕业于中山大学管理学院工商管理专业。' +
          '在校期间多次参加商业案例分析大赛，' +
          '曾在腾讯产品策划岗位完成暑期实习。',
        target_role: '产品经理',
        resume_sections: [
          section('education', '中山大学 工商管理'),
          section('internship', '腾讯 产品策划实习'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.signals).toContain('explicit_fresh_grad_keyword');
    });
  });

  // ──────────────────────────────────────────────────────────
  // B. Resumes that should be classified as other
  // ──────────────────────────────────────────────────────────

  describe('other — 职场经验丰富 / 海外 / 转行', () => {
    it('10 年资深后端工程师', () => {
      const input = createInput({
        resume_text:
          '资深后端工程师，10 年工作经验。' +
          '先后就职于百度、阿里巴巴，负责大规模分布式系统架构设计。' +
          '精通 Java、Go 语言，熟悉 Kubernetes 和微服务架构。' +
          '管理过 20 人的技术团队，推动了多个核心业务的技术升级。',
        resume_sections: [
          section('work_experience', '百度 高级工程师'),
          section('work_experience', '阿里巴巴 技术专家'),
        ],
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('5 年从业经验 — 产品经理', () => {
      const input = createInput({
        resume_text:
          '5 年从业经验的产品经理，曾负责用户增长和商业化方向。' +
          '在美团工作期间主导了外卖频道的改版，DAU 提升 15%。' +
          '具备数据驱动的产品思维和跨部门协作能力。',
        target_role: '高级产品经理',
        resume_sections: [
          section('work_experience', '美团 产品经理'),
        ],
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });

    it('CTO — 创业公司技术负责人', () => {
      const input = createInput({
        resume_text:
          '某创业公司 CTO，负责技术团队搭建和产品架构设计。' +
          '此前在微软亚洲研究院担任研究员，发表 SCI 论文 10 余篇。' +
          '在人工智能和计算机视觉领域有深入研究。',
        resume_sections: [
          section('work_experience', '某创业公司 CTO'),
          section('work_experience', '微软亚洲研究院 研究员'),
        ],
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('架构师 — 非学生场景', () => {
      const input = createInput({
        resume_text:
          '高级架构师，专注于金融领域的分布式系统建设。' +
          '曾在招商银行信息技术部任职 8 年以上工作经验，' +
          '主导了核心交易系统的微服务化改造。',
        resume_sections: [
          section('work_experience', '招商银行 高级架构师'),
        ],
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });

    it('3 年经验的数据分析师', () => {
      const input = createInput({
        resume_text:
          '数据分析师，3 年工作经验，精通 SQL 和 Python 数据处理。' +
          '在京东数据中台部门负责用户行为分析和报表开发。' +
          '熟练使用 Tableau、Power BI 等可视化工具。',
        resume_sections: [
          section('work_experience', '京东 数据分析师'),
        ],
        experience_level: 'neutral',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.signals.some((s) => s.startsWith('work_years_'))).toBe(true);
    });

    it('海外留学归来 — 有全职工作段', () => {
      const input = createInput({
        resume_text:
          'Carnegie Mellon University, Master of Science in Computer Science. ' +
          '曾在 Google 担任 Software Engineer 两年，参与了 Chrome 浏览器性能优化项目。' +
          '回国后加入字节跳动基础架构团队。',
        resume_sections: [
          section('education', 'CMU CS Master'),
          section('work_experience', 'Google Software Engineer'),
          section('work_experience', '字节跳动 基础架构'),
        ],
        experience_level: 'neutral',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.signals).toContain('has_work_experience');
    });

    it('转行者 — 从教师转互联网运营', () => {
      const input = createInput({
        resume_text:
          '前中学数学教师，4 年工作经验。' +
          '自学互联网运营知识，完成了多个自媒体账号的从零到一搭建。' +
          '希望转型进入互联网行业从事用户运营岗位。',
        target_role: '用户运营',
        resume_sections: [
          section('work_experience', '某中学 数学教师'),
        ],
        experience_level: 'neutral',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });

    it('总监级别 — 管理岗', () => {
      const input = createInput({
        resume_text:
          '市场营销总监，负责公司品牌战略和市场推广工作。' +
          '带领 50 人团队完成年度营收目标，同比增长 30%。' +
          '在快消品行业有超过 7 年工作经验。',
        resume_sections: [
          section('work_experience', '某公司 市场营销总监'),
        ],
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });

    it('简历最近年份超过 4 年前 — 判为 other', () => {
      const currentYear = new Date().getFullYear();
      const oldYear = currentYear - 6;
      const input = createInput({
        resume_text:
          `${oldYear - 4}-${oldYear} 南京大学 信息管理 本科`,
        resume_sections: [
          section('education', '南京大学 信息管理'),
        ],
        experience_level: 'neutral',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.signals.some((s) => s.includes('too_old'))).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────
  // C. Edge / ambiguous cases
  // ──────────────────────────────────────────────────────────

  describe('边界与歧义场景', () => {
    it('应届关键词 + 多年工作经验 — 多年工作经验优先（Tier 1a > Tier 1b）', () => {
      const input = createInput({
        resume_text:
          '我是一名应届MBA毕业生，此前有5 年工作经验，在制造业从事供应链管理工作。',
        resume_sections: [
          section('education', 'MBA'),
          section('work_experience', '供应链管理'),
        ],
        experience_level: 'neutral',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.signals.some((s) => s.startsWith('work_years_'))).toBe(true);
    });

    it('学生组织里的"负责人"不应触发 senior_title 惩罚', () => {
      const input = createInput({
        resume_text:
          '校园志愿者组织负责人，组织了多次支教活动和迎新活动。' +
          '参加学生会和社团管理工作，担任班长一职。',
        resume_sections: [
          section('education', '某大学本科'),
          section('project', '志愿者项目'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      expect(result.signals).not.toContain('senior_title_non_student_context');
    });

    it('英文简历 — 无中文信号 — 保守判为 other', () => {
      const input = createInput({
        resume_text:
          'John Smith. Software Engineer with 2 years of experience at Acme Corp. ' +
          'Proficient in Python, JavaScript, and AWS. Led a team of 3 to build a real-time data pipeline. ' +
          'B.S. in Computer Science from MIT, 2022.',
        resume_sections: [
          section('work_experience', 'Acme Corp Software Engineer'),
          section('education', 'MIT CS'),
        ],
        experience_level: 'neutral',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });

    it('实习经历丰富但无全职 — 无显式应届关键词 — 软信号不够', () => {
      const input = createInput({
        resume_text:
          '曾在阿里巴巴、美团、滴滴完成三段产品实习，' +
          '熟悉 B 端和 C 端产品设计流程。',
        resume_sections: [
          section('internship', '阿里巴巴 产品实习'),
          section('internship', '美团 产品实习'),
          section('internship', '滴滴 产品实习'),
        ],
        experience_level: 'neutral',
      });
      const result = detectPersona(input);

      // no_work_only_intern_or_project (+2) + only_internship_mentioned (+1) = 3 → fresh_grad
      expect(result.persona).toBe('fresh_grad');
      expect(result.signals).toContain('no_work_only_intern_or_project');
      expect(result.signals).toContain('only_internship_mentioned');
    });

    it('混合中英文简历 — 有全职经历', () => {
      const input = createInput({
        resume_text:
          'Senior Frontend Engineer at Shopee, responsible for merchant dashboard. ' +
          '之前在腾讯负责微信小程序框架开发，有 4 年经验。',
        resume_sections: [
          section('work_experience', 'Shopee Senior Frontend'),
          section('work_experience', '腾讯 微信小程序'),
        ],
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });

    it('"2 年工作经验" — 不触发硬 other（< 3 年），但有 work_experience 段', () => {
      const input = createInput({
        resume_text: '2 年工作经验，前端开发工程师',
        resume_sections: [
          section('work_experience', '某公司 前端'),
        ],
        experience_level: 'neutral',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.signals).toContain('has_work_experience');
    });

    it('只有项目段 + junior — 无其他信号 — score=3 → fresh_grad', () => {
      const input = createInput({
        resume_text: '实习期间完成了多个课程项目，校园活动积极参与志愿者服务',
        resume_sections: [
          section('education', '某大学'),
          section('project', '课程项目'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      // no_work_only_intern_or_project (+2) + junior (+1) + student_activities (+1) + only_internship (+1) = 5
      expect(result.persona).toBe('fresh_grad');
    });

    it('VP 头衔 — 非学生场景 → other', () => {
      const input = createInput({
        resume_text:
          'VP of Engineering at a Series B startup. ' +
          'Built the engineering team from 5 to 30 people over 3 years.',
        resume_sections: [
          section('work_experience', 'VP of Engineering'),
        ],
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });

    it('博士在读 — 有教育词 + 当前年份', () => {
      const currentYear = new Date().getFullYear();
      const input = createInput({
        resume_text:
          `${currentYear - 2}-${currentYear + 1} 中国科学技术大学 计算机科学 博士` +
          '研究方向为自然语言处理，发表会议论文 3 篇。' +
          '参加了多次学术研讨会和学生组织活动。',
        resume_sections: [
          section('education', '中国科学技术大学 博士'),
          section('project', '学术研究'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
    });

    it('Staff 头衔 — 非学生场景 → other', () => {
      const input = createInput({
        resume_text:
          'Staff Engineer at Meta, working on React Native performance. ' +
          '8 年以上经验 in mobile development.',
        resume_sections: [
          section('work_experience', 'Meta Staff Engineer'),
        ],
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });

    it('Principal 头衔 — 非学生场景 → other', () => {
      const input = createInput({
        resume_text:
          'Principal Engineer, 负责公司核心搜索引擎架构。',
        resume_sections: [
          section('work_experience', 'Principal Engineer'),
        ],
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });
  });

  // ──────────────────────────────────────────────────────────
  // D. Confidence & signal sanity checks
  // ──────────────────────────────────────────────────────────

  describe('confidence 范围与 signals 完整性', () => {
    it('所有判定的 confidence 均在 [0, 1] 之间', () => {
      const cases: NormalizedInput[] = [
        createInput({ resume_text: '' }),
        createInput({ resume_text: '应届生' }),
        createInput({ resume_text: '10 年工作经验', experience_level: 'senior' }),
        createInput({
          resume_text: '社团活动 志愿者 实习',
          resume_sections: [section('internship', '实习')],
          experience_level: 'junior',
        }),
      ];

      for (const c of cases) {
        const r = detectPersona(c);
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
        expect(Array.isArray(r.signals)).toBe(true);
        expect(r.signals.length).toBeGreaterThan(0);
      }
    });

    it('无任何信号时 signals 包含 "no_signal"', () => {
      const input = createInput({ resume_text: 'Hello world' });
      const result = detectPersona(input);

      expect(result.signals).toContain('no_signal');
    });

    it('override 结果的 signals 只包含 "user_override"', () => {
      const input = createInput({ resume_text: '10 年工作经验' });
      const result = detectPersona(input, 'fresh_grad');

      expect(result.signals).toEqual(['user_override']);
    });
  });
});
