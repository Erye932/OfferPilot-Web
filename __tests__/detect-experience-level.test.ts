import { describe, it, expect } from 'vitest';
import { detectExperienceLevel } from '../lib/diagnose/normalize';

// 简单的句子分割（与 normalize.ts 内部 splitSentences 行为对齐的最小子集，
// 测试场景里手写句子即可，避免引入完整 splitSentences 依赖）
function toSentences(text: string): string[] {
  return text.split(/[。\n]/).map((s) => s.trim()).filter((s) => s.length > 0);
}

describe('detectExperienceLevel', () => {
  describe('回归 bug：4 位年份不应被当成工作年限', () => {
    it('"2025 年毕业" 不应被解释为 2025 年工作经验', () => {
      const text = '清华大学计算机本科，2025 年毕业，参加过若干校园活动';
      expect(detectExperienceLevel(text, toSentences(text))).not.toBe('senior');
    });

    it('"求职意向：2026 年入职互联网公司" 不应触发 senior', () => {
      const text = '求职意向：2026 年入职互联网公司';
      expect(detectExperienceLevel(text, toSentences(text))).not.toBe('senior');
    });
  });

  describe('回归 bug：教育语境的"管理"不应被当成 leadership', () => {
    it('"主修工商管理专业" 不应被计为 leadership', () => {
      const text = '我是一名应届毕业生，在校期间主修工商管理专业，参加过校园活动';
      expect(detectExperienceLevel(text, toSentences(text))).not.toBe('senior');
    });

    it('"项目管理课程" 不应被计为 leadership', () => {
      const text = '修读项目管理课程，参与小组作业';
      expect(detectExperienceLevel(text, toSentences(text))).not.toBe('senior');
    });

    it('"主修管理学" 不应被计为 leadership', () => {
      const text = '本科主修管理学';
      expect(detectExperienceLevel(text, toSentences(text))).not.toBe('senior');
    });
  });

  describe('真 senior 场景', () => {
    it('"5 年工作经验" 应判为 senior', () => {
      const text = '资深前端工程师，5 年工作经验';
      expect(detectExperienceLevel(text, toSentences(text))).toBe('senior');
    });

    it('"3 年从业经验" 应判为 senior（≥5 限定不必，靠 leadership 兜也行）', () => {
      const text = '前端工程师，3 年从业经验，负责核心业务架构设计';
      // 5 年的硬下限不达，但 leadership > support → senior
      expect(detectExperienceLevel(text, toSentences(text))).toBe('senior');
    });

    it('"管理 10 人团队" 应被计为 leadership', () => {
      const text = '负责前端团队，管理 10 人团队完成核心系统重构';
      expect(detectExperienceLevel(text, toSentences(text))).toBe('senior');
    });

    it('"项目管理 / 团队管理" 等具体搭配应被计为 leadership', () => {
      const text = '担任技术负责人，承担项目管理与团队管理职责';
      expect(detectExperienceLevel(text, toSentences(text))).toBe('senior');
    });
  });

  describe('真 junior 场景', () => {
    it('简历主体是 "参与/协助" 应判为 junior', () => {
      const text = '在腾讯实习期间，协助团队完成数据整理，参与产品迭代会议';
      expect(detectExperienceLevel(text, toSentences(text))).toBe('junior');
    });
  });

  describe('neutral 场景', () => {
    it('应届简历无强信号 应判为 neutral 或 junior，不能 senior', () => {
      const text = '清华大学计算机本科在读，主修工商管理专业，预计 2026 年毕业';
      const result = detectExperienceLevel(text, toSentences(text));
      expect(result).not.toBe('senior');
    });

    it('空文本 应判为 neutral', () => {
      expect(detectExperienceLevel('', [])).toBe('neutral');
    });
  });
});
