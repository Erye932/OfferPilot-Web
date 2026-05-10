import { describe, it, expect } from 'vitest';
import { detectPersona } from '../lib/diagnose/persona';
import type { NormalizedInput, ResumeSection } from '../lib/diagnose/types';

// ─── 测试夹具 ──────────────────────────────────────────────

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

// ─── 单元测试 ──────────────────────────────────────────────

describe('detectPersona', () => {
  describe('user_override 优先级最高', () => {
    it('override = fresh_grad 应覆盖所有自动判定', () => {
      const input = createInput({
        resume_text: '资深架构师，10 年工作经验',
        experience_level: 'senior',
      });
      const result = detectPersona(input, 'fresh_grad');

      expect(result.persona).toBe('fresh_grad');
      expect(result.confidence).toBe(1.0);
      expect(result.user_override).toBe('fresh_grad');
      expect(result.signals).toContain('user_override');
    });

    it('override = other 应覆盖应届关键词', () => {
      const input = createInput({
        resume_text: '应届毕业生，在读计算机本科',
      });
      const result = detectPersona(input, 'other');

      expect(result.persona).toBe('other');
      expect(result.user_override).toBe('other');
    });
  });

  describe('硬 "other" 信号（立即判定）', () => {
    it('experience_level = senior 应判为 other 高置信度', () => {
      const input = createInput({
        resume_text: '前端开发',
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.signals).toContain('senior_experience_level');
    });

    it('用户自称 "应届" 应优先于 experience_level = senior 的启发式误判', () => {
      // 模拟 detectExperienceLevel 把 "工商管理" 的 "管理" 误判为 leadership
      // 而导致 experience_level 错标成 senior 的场景
      const input = createInput({
        resume_text: '我是一名应届毕业生，在校期间主修工商管理专业',
        experience_level: 'senior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.signals).toContain('explicit_fresh_grad_keyword');
    });

    it('简历含 "3 年工作经验" 应判为 other', () => {
      const input = createInput({
        resume_text: '前端工程师，3 年工作经验，精通 React',
        experience_level: 'neutral',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    });

    it('简历含 "5 年从业" 应判为 other', () => {
      const input = createInput({
        resume_text: '5 年从业经验，曾就职于多家互联网公司',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });

    it('"1 年工作经验" 不触发硬 other（< 3 年）', () => {
      const input = createInput({
        resume_text: '1 年工作经验',
      });
      const result = detectPersona(input);

      // 不会直接命中 multi-year 硬规则，但没有强 fresh_grad 信号
      expect(result.signals).not.toContain('work_years_1');
      // 默认走 other 兜底
      expect(result.persona).toBe('other');
    });
  });

  describe('硬 "fresh_grad" 信号（立即判定）', () => {
    it('显式 "应届生" 关键词', () => {
      const input = createInput({
        resume_text: '我是一名应届生，求职前端岗位',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
      expect(result.signals).toContain('explicit_fresh_grad_keyword');
    });

    it('"应届毕业生" 关键词', () => {
      const input = createInput({
        resume_text: '2026 届应届毕业生',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
    });

    it('"在读" 关键词', () => {
      const input = createInput({
        resume_text: '清华大学计算机本科在读',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
    });

    it('"预计 2026 年 6 月毕业" 关键词', () => {
      const input = createInput({
        resume_text: '复旦大学经济学硕士，预计 2026 年 6 月毕业',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
    });

    it('"即将毕业" 关键词', () => {
      const input = createInput({
        resume_text: '即将毕业于北京大学软件工程专业',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
    });
  });

  describe('毕业年份推断', () => {
    it('当前年份且含教育词 应判为 fresh_grad', () => {
      const currentYear = new Date().getFullYear();
      const input = createInput({
        resume_text: `2022-${currentYear} 浙江大学 本科 计算机科学`,
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.signals.some((s) => s.startsWith('education_year_'))).toBe(true);
    });

    it('最近年份距今 4 年以上 应判为 other', () => {
      const currentYear = new Date().getFullYear();
      const oldYear = currentYear - 5;
      const input = createInput({
        resume_text: `${oldYear - 3}-${oldYear} 某大学 本科`,
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.signals.some((s) => s.includes('too_old'))).toBe(true);
    });
  });

  describe('软信号加权（需综合打分）', () => {
    it('只有实习段 + junior + 学生活动 应判为 fresh_grad', () => {
      const input = createInput({
        resume_text: '腾讯实习，参与社团活动，校园志愿者',
        resume_sections: [
          section('education', '某大学本科'),
          section('internship', '腾讯产品实习'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('fresh_grad');
      expect(result.signals).toContain('no_work_only_intern_or_project');
      expect(result.signals).toContain('junior_level');
      expect(result.signals).toContain('student_activities');
    });

    it('有 work_experience 段落 应判为 other', () => {
      const input = createInput({
        resume_text: '字节跳动 前端工程师',
        resume_sections: [section('work_experience', '字节跳动 前端工程师')],
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.signals).toContain('has_work_experience');
    });

    it('非学生场景下的 "高级" 职位 应推向 other', () => {
      const input = createInput({
        resume_text: '高级前端架构师，某公司技术负责人',
        resume_sections: [section('work_experience', '高级前端')],
      });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.signals).toContain('senior_title_non_student_context');
    });

    it('学生场景下的 "部长" 不应被当作资深职位惩罚', () => {
      const input = createInput({
        resume_text: '清华大学学生会社团部部长，校园迎新志愿者',
        resume_sections: [
          section('education', '清华大学计算机本科'),
          section('project', '课程项目'),
        ],
        experience_level: 'junior',
      });
      const result = detectPersona(input);

      // 部长 不在 SENIOR_TITLE 正则中，所以不会被惩罚
      expect(result.signals).not.toContain('senior_title_non_student_context');
      expect(result.persona).toBe('fresh_grad');
    });
  });

  describe('默认兜底', () => {
    it('完全空简历 应返回 other 低置信度', () => {
      const input = createInput({ resume_text: '' });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
      expect(result.confidence).toBeLessThanOrEqual(0.5);
      expect(result.signals).toContain('no_signal');
    });

    it('极短无信号简历 应返回 other', () => {
      const input = createInput({ resume_text: '求职意向：前端' });
      const result = detectPersona(input);

      expect(result.persona).toBe('other');
    });
  });

  describe('返回值结构完整性', () => {
    it('返回对象应包含 persona / confidence / signals 三个必填字段', () => {
      const input = createInput({ resume_text: '应届生' });
      const result = detectPersona(input);

      expect(result).toHaveProperty('persona');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('signals');
      expect(Array.isArray(result.signals)).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
