import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma 以避免真实数据库调用
vi.mock('@/lib/prisma', () => ({
  prisma: {
    researchCache: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn().mockResolvedValue({}),
    },
  },
}));

import {
  getCachedRoleStudy,
  setCachedRoleStudy,
  getCachedHrInsider,
  setCachedHrInsider,
  invalidateCachedRoleStudy,
  invalidateCachedHrInsider,
  getResearchCacheStats,
  clearResearchCache,
  sweepExpiredResearchCache,
} from '../lib/diagnose/v4/research-cache';
import type { RoleStudyOutput, HrInsiderOutput } from '../lib/diagnose/v4/schemas';

// ─── 测试数据 ─────────────────────────────────────

function makeRoleStudy(overrides?: Partial<RoleStudyOutput>): RoleStudyOutput {
  return {
    core_capabilities: [
      { name: 'React', description: '前端框架', why_it_matters: '主流技术栈' },
    ],
    bonus_capabilities: [],
    top_resume_patterns: [],
    red_flags: [],
    industry_jargon: [],
    meta: { sources_count: 3, data_confidence: 'high', notes: '' },
    ...overrides,
  };
}

function makeHrInsider(overrides?: Partial<HrInsiderOutput>): HrInsiderOutput {
  return {
    six_second_focus: ['项目经验'],
    thirty_second_focus: ['技术深度'],
    preferred_language_patterns: [],
    common_eliminate_reasons: [],
    expectation_baseline: {
      fresh_grad: '有实习',
      junior_1_3y: '独立模块',
      mid_3_5y: '带项目',
    },
    meta: { sources_count: 2, data_confidence: 'medium', notes: '' },
    ...overrides,
  };
}

// ─── 测试用例 ─────────────────────────────────────

describe('ResearchCache', () => {
  beforeEach(async () => {
    await clearResearchCache();
  });

  describe('RoleStudy 缓存', () => {
    it('未命中时返回 null', async () => {
      const result = await getCachedRoleStudy('前端开发');
      expect(result).toBeNull();
    });

    it('写入后能命中', async () => {
      const data = makeRoleStudy();
      await setCachedRoleStudy('前端开发', data);
      const result = await getCachedRoleStudy('前端开发');
      expect(result).toEqual(data);
    });

    it('key 规范化：大小写 + 空格不影响命中', async () => {
      const data = makeRoleStudy();
      await setCachedRoleStudy('  前端  开发  ', data);
      const result = await getCachedRoleStudy('前端 开发');
      expect(result).toEqual(data);
    });

    it('不同岗位互不干扰', async () => {
      const feData = makeRoleStudy({ industry_jargon: ['React'] });
      const beData = makeRoleStudy({ industry_jargon: ['Spring'] });
      await setCachedRoleStudy('前端开发', feData);
      await setCachedRoleStudy('后端开发', beData);
      expect(await getCachedRoleStudy('前端开发')).toEqual(feData);
      expect(await getCachedRoleStudy('后端开发')).toEqual(beData);
    });

    it('失效后返回 null', async () => {
      await setCachedRoleStudy('前端开发', makeRoleStudy());
      await invalidateCachedRoleStudy('前端开发');
      expect(await getCachedRoleStudy('前端开发')).toBeNull();
    });
  });

  describe('HrInsider 缓存', () => {
    it('未命中时返回 null', async () => {
      const result = await getCachedHrInsider('产品经理');
      expect(result).toBeNull();
    });

    it('写入后能命中', async () => {
      const data = makeHrInsider();
      await setCachedHrInsider('产品经理', data);
      const result = await getCachedHrInsider('产品经理');
      expect(result).toEqual(data);
    });

    it('失效后返回 null', async () => {
      await setCachedHrInsider('产品经理', makeHrInsider());
      await invalidateCachedHrInsider('产品经理');
      expect(await getCachedHrInsider('产品经理')).toBeNull();
    });
  });

  describe('stats 统计', () => {
    it('统计命中/未命中次数', async () => {
      await setCachedRoleStudy('前端开发', makeRoleStudy());

      // 1 次命中
      await getCachedRoleStudy('前端开发');
      // 1 次未命中
      await getCachedRoleStudy('不存在的岗位');

      const stats = getResearchCacheStats();
      expect(stats.l1_hits).toBeGreaterThanOrEqual(1);
      expect(stats.l1_misses).toBeGreaterThanOrEqual(1);
      expect(stats.l1_size).toBe(1);
    });
  });

  describe('clearResearchCache', () => {
    it('清空后所有缓存失效', async () => {
      await setCachedRoleStudy('前端开发', makeRoleStudy());
      await setCachedHrInsider('产品经理', makeHrInsider());
      await clearResearchCache();
      expect(await getCachedRoleStudy('前端开发')).toBeNull();
      expect(await getCachedHrInsider('产品经理')).toBeNull();
    });
  });

  describe('sweepExpiredResearchCache', () => {
    it('调用时不抛异常', async () => {
      const count = await sweepExpiredResearchCache();
      expect(count).toBe(0);
    });
  });
});
