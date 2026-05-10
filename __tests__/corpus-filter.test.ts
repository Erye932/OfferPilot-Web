import { describe, it, expect } from 'vitest';
import {
  filterByPersona,
  filterSpecializedByPersona,
  filterRulesByPersona,
  filterViewsByPersona,
  filterPatternsByPersona,
  getRuleByPersonaAndIssue,
  getSpecializedViewsForPersona,
  diagnosisRules,
  insiderViews,
  rewritePatterns,
} from '../lib/diagnose/corpus';
import type { Persona } from '../lib/diagnose/persona';

describe('corpus persona filter', () => {
  describe('filterByPersona 泛型语义', () => {
    interface Sample {
      id: string;
      applicable_personas?: Persona[];
    }

    const mixed: Sample[] = [
      { id: 'universal-undef' }, // 通用池（字段缺省）
      { id: 'universal-empty', applicable_personas: [] }, // 通用池（空数组）
      { id: 'fresh-only', applicable_personas: ['fresh_grad'] },
      { id: 'other-only', applicable_personas: ['other'] },
      { id: 'fresh-and-other', applicable_personas: ['fresh_grad', 'other'] },
    ];

    it('对任何 persona，通用池条目都入选', () => {
      for (const p of ['fresh_grad', 'other'] as Persona[]) {
        const result = filterByPersona(mixed, p);
        expect(result.map((x) => x.id)).toContain('universal-undef');
        expect(result.map((x) => x.id)).toContain('universal-empty');
      }
    });

    it('fresh_grad persona 命中 fresh-only / fresh-and-other，不命中 other-only', () => {
      const ids = filterByPersona(mixed, 'fresh_grad').map((x) => x.id);
      expect(ids).toContain('fresh-only');
      expect(ids).toContain('fresh-and-other');
      expect(ids).not.toContain('other-only');
    });

    it('other persona 命中 other-only / fresh-and-other，不命中 fresh-only', () => {
      const ids = filterByPersona(mixed, 'other').map((x) => x.id);
      expect(ids).toContain('other-only');
      expect(ids).toContain('fresh-and-other');
      expect(ids).not.toContain('fresh-only');
    });

    it('空输入返回空', () => {
      expect(filterByPersona([] as Sample[], 'fresh_grad')).toEqual([]);
    });
  });

  describe('filter 应用到实际知识库（目前 JSON 均未打 tag，视作通用池）', () => {
    it('filterRulesByPersona 当前应返回全部诊断规则', () => {
      expect(filterRulesByPersona('fresh_grad')).toHaveLength(diagnosisRules.length);
      expect(filterRulesByPersona('other')).toHaveLength(diagnosisRules.length);
    });

    it('filterViewsByPersona 当前应返回全部内行视角', () => {
      expect(filterViewsByPersona('fresh_grad')).toHaveLength(insiderViews.length);
      expect(filterViewsByPersona('other')).toHaveLength(insiderViews.length);
    });

    it('filterPatternsByPersona 当前应返回全部改写模式', () => {
      expect(filterPatternsByPersona('fresh_grad')).toHaveLength(rewritePatterns.length);
      expect(filterPatternsByPersona('other')).toHaveLength(rewritePatterns.length);
    });
  });

  describe('filterSpecializedByPersona 只返回显式标记的条目', () => {
    interface Sample {
      id: string;
      applicable_personas?: Persona[];
    }

    const mixed: Sample[] = [
      { id: 'universal-undef' },
      { id: 'universal-empty', applicable_personas: [] },
      { id: 'fresh-only', applicable_personas: ['fresh_grad'] },
      { id: 'fresh-and-other', applicable_personas: ['fresh_grad', 'other'] },
    ];

    it('剔除通用池（缺省 / 空数组）', () => {
      const ids = filterSpecializedByPersona(mixed, 'fresh_grad').map((x) => x.id);
      expect(ids).not.toContain('universal-undef');
      expect(ids).not.toContain('universal-empty');
      expect(ids).toContain('fresh-only');
      expect(ids).toContain('fresh-and-other');
    });

    it('其他 persona 不会误拉 fresh-only', () => {
      const ids = filterSpecializedByPersona(mixed, 'other').map((x) => x.id);
      expect(ids).not.toContain('fresh-only');
      expect(ids).toContain('fresh-and-other');
    });
  });

  describe('getSpecializedViewsForPersona 应用到实际知识库', () => {
    it('当前 JSON 均未打 persona tag，对任何 persona 都应返回空', () => {
      expect(getSpecializedViewsForPersona('fresh_grad')).toEqual([]);
      expect(getSpecializedViewsForPersona('other')).toEqual([]);
    });
  });

  describe('getRuleByPersonaAndIssue', () => {
    it('应能按 issue_type 找到对应规则（使用已知的 lack_of_result_evidence）', () => {
      const rule = getRuleByPersonaAndIssue('fresh_grad', 'lack_of_result_evidence');
      expect(rule).toBeDefined();
      expect(rule?.issue_type).toBe('lack_of_result_evidence');
    });

    it('不存在的 issue_type 应返回 undefined', () => {
      const rule = getRuleByPersonaAndIssue('fresh_grad', '__nonexistent__');
      expect(rule).toBeUndefined();
    });
  });
});
