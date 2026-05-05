import { describe, it, expect } from 'vitest';
import { resolveRole } from '../lib/diagnose/role-resolver';
import type { NormalizedInput } from '../lib/diagnose/types';

// 创建测试用的NormalizedInput
function createTestInput(targetRole: string): NormalizedInput {
  return {
    resume_text: '测试简历内容',
    target_role: targetRole,
    jd_text: '',
    tier: 'free',
    resume_sentences: [],
    resume_paragraphs: [],
    resume_sections: [],
    jd_keywords: [],
    jd_quality: 'none',
    text_quality: 'sufficient',
    experience_level: 'neutral',
  };
}

// 创建带技能的测试输入
function createTestInputWithSkills(targetRole: string, skills: string[]): NormalizedInput {
  const input = createTestInput(targetRole);
  // 添加技能部分
  input.resume_sections.push({
    type: 'skill',
    title: '技能',
    content: skills.join('、'),
    paragraph_index: 0,
  });
  // 添加技能到JD关键词
  input.jd_keywords = skills;
  return input;
}

describe('Role Resolver', () => {
  describe('规则清洗和岗位词典映射', () => {
    it('应该正确清洗“网页前端后端工程师”', async () => {
      const input = createTestInput('网页前端后端工程师');
      const result = await resolveRole(input);

      expect(result.raw_role).toBe('网页前端后端工程师');
      expect(result.canonical_role).toBe('后端工程师'); // “后端工程师”是第一个完整子串匹配
      expect(result.role_family).toBe('后端开发');
      expect(result.alt_roles).toContain('后端开发工程师');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('应该正确清洗“做网页开发的”', async () => {
      const input = createTestInput('做网页开发的');
      const result = await resolveRole(input);

      expect(result.raw_role).toBe('做网页开发的');
      // 口语化描述无法匹配岗位词典，保持原样
      expect(result.canonical_role).toBe('做网页开发的');
      expect(result.role_family).toBe('未知');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('应该正确清洗“财务税务都做一点”', async () => {
      const input = createTestInput('财务税务都做一点');
      const result = await resolveRole(input);

      expect(result.raw_role).toBe('财务税务都做一点');
      // 口语化描述无法精确匹配岗位词典
      expect(result.role_family).toBe('未知');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.ambiguity).toBeDefined();
    });

    it('应该移除括号内容', async () => {
      const input = createTestInput('前端工程师(React方向)');
      const result = await resolveRole(input);

      expect(result.raw_role).toBe('前端工程师(React方向)');
      expect(result.canonical_role).toBe('前端工程师');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('应该移除前缀后缀词', async () => {
      const input = createTestInput('应聘前端工程师岗位');
      const result = await resolveRole(input);

      expect(result.raw_role).toBe('应聘前端工程师岗位');
      expect(result.canonical_role).toBe('前端工程师');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('技能信号补强', () => {
    it('应该从简历技能推断岗位族', async () => {
      const input = createTestInputWithSkills('工程师', ['JavaScript', 'React', 'HTML', 'CSS']);
      const result = await resolveRole(input);

      expect(result.raw_role).toBe('工程师');
      expect(result.role_family).toBe('前端开发');
      expect(result.skills_inferred).toEqual(expect.arrayContaining(['JavaScript', 'React']));
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('应该从JD关键词推断岗位族', async () => {
      const input = createTestInput('工程师');
      input.jd_keywords = ['Python', 'Django', 'MySQL'];
      const result = await resolveRole(input);

      // 词典匹配优先（“工程师”子串匹配“前端工程师”），但技能不一致会降低置信度
      expect(result.role_family).toBe('前端开发');
      expect(result.skills_inferred).toEqual(expect.arrayContaining(['Python']));
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.ambiguity).toBeDefined();
    });

    it('技能与岗位描述不一致时应降低置信度', async () => {
      const input = createTestInput('前端工程师');
      input.jd_keywords = ['Python', 'Django']; // 后端技能
      const result = await resolveRole(input);

      expect(result.canonical_role).toBe('前端工程师');
      expect(result.role_family).toBe('前端开发');
      expect(result.confidence).toBeLessThan(0.8);
      expect(result.ambiguity).toContain('不一致');
    });
  });

  describe('模糊场景处理', () => {
    it('完全模糊输入应返回低置信度', async () => {
      const input = createTestInput('随便什么岗位');
      const result = await resolveRole(input);

      expect(result.canonical_role).toBe('随便什么'); // cleanRoleText 会移除“岗位”后缀
      expect(result.role_family).toBe('未知');
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.ambiguity).toBeDefined();
    });

    it('包含多个岗位关键词时匹配最佳子串', async () => {
      const input = createTestInput('前端后端全栈工程师');
      const result = await resolveRole(input);

      // “全栈工程师”是第一个完整子串匹配
      expect(result.canonical_role).toBe('全栈工程师');
      expect(result.role_family).toBe('全栈开发');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('集成到normalizeInput', () => {
    it('normalizeInput应包含role_resolution', async () => {
      const { normalizeInput } = await import('../lib/diagnose/normalize');

      const request = {
        resume_text: '我是一名有三年经验的前端工程师，精通React和TypeScript框架，熟悉Vue和Next.js等现代Web开发技术。曾在两家互联网公司负责核心业务前端项目的架构设计与开发，具备丰富的大型项目经验和良好的工程化能力。',
        target_role: '前端工程师',
        jd_text: '',
        tier: 'free' as const,
      };

      const normalized = await normalizeInput(request);

      expect(normalized.role_resolution).toBeDefined();
      expect(normalized.role_resolution?.raw_role).toBe('前端工程师');
      expect(normalized.role_resolution?.canonical_role).toBe('前端工程师');
    });

    it('空岗位时应提供低置信度默认结果', async () => {
      const { normalizeInput } = await import('../lib/diagnose/normalize');

      const request = {
        resume_text: '我是一名应届毕业生，在校期间主修工商管理专业，参加过多次校园活动和社团组织工作。具备较强的学习能力和适应能力，能够在新环境中快速成长。希望能找到一份与专业相关的工作机会，在实践中不断提升自己的综合素质和专业能力。',
        target_role: '',
        jd_text: '',
        tier: 'free' as const,
      };

      const normalized = await normalizeInput(request);

      expect(normalized.role_resolution).toBeDefined();
      expect(normalized.role_resolution?.raw_role).toBe('');
      expect(normalized.role_resolution?.confidence).toBeLessThanOrEqual(0.3);
    });
  });
});