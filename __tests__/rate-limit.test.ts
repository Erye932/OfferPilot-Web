import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOrCreateAnonymousSessionId, checkRateLimit, recordUsage, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import type { NextRequest } from 'next/server';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    usageRecord: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const mockPrisma = vi.mocked(prisma, true);

describe('rate-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getOrCreateAnonymousSessionId', () => {
    it('should return existing session ID from cookie', () => {
      const request = {
        cookies: {
          get: vi.fn().mockReturnValue({ value: 'existing-session-id' }),
        },
      } as unknown as NextRequest;

      const sessionId = getOrCreateAnonymousSessionId(request);
      expect(sessionId).toBe('existing-session-id');
    });

    it('should generate new session ID when no cookie', () => {
      const request = {
        cookies: {
          get: vi.fn().mockReturnValue(undefined),
        },
      } as unknown as NextRequest;

      const sessionId = getOrCreateAnonymousSessionId(request);
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('setAnonymousSessionCookie', () => {
    it('should return Set-Cookie header with correct attributes', () => {
      const sessionId = 'test-session-id';
      const result = setAnonymousSessionCookie(sessionId);
      expect(result['Set-Cookie']).toContain(`offerpilot_anon_session=${sessionId}`);
      expect(result['Set-Cookie']).toContain('Path=/');
      expect(result['Set-Cookie']).toContain('Max-Age=2592000'); // 30 days
      expect(result['Set-Cookie']).toContain('HttpOnly');
      expect(result['Set-Cookie']).toContain('SameSite=Lax');
    });
  });

  describe('checkRateLimit', () => {
    let originalRateLimitEnabled: string | undefined;

    beforeEach(() => {
      vi.setSystemTime(new Date('2026-03-31T12:00:00Z'));
      // 启用限流进行测试
      originalRateLimitEnabled = process.env.RATE_LIMIT_ENABLED;
      process.env.RATE_LIMIT_ENABLED = 'true';
    });

    afterEach(() => {
      // 恢复环境变量
      if (originalRateLimitEnabled !== undefined) {
        process.env.RATE_LIMIT_ENABLED = originalRateLimitEnabled;
      } else {
        delete process.env.RATE_LIMIT_ENABLED;
      }
    });

    it('should allow request when under limit', async () => {
      mockPrisma.usageRecord.count.mockResolvedValue(5); // under limit of 10 for diagnose
      const result = await checkRateLimit('session-id', 'diagnose', 'free');
      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(5);
      expect(result.limit).toBe(10);
      expect(mockPrisma.usageRecord.count).toHaveBeenCalledWith({
        where: {
          anonymousSessionId: 'session-id',
          actionType: 'diagnose',
          createdAt: { gte: new Date('2026-03-30T12:00:00Z') },
        },
      });
    });

    it('should reject request when over limit', async () => {
      mockPrisma.usageRecord.count.mockResolvedValue(15); // over limit of 10
      const result = await checkRateLimit('session-id', 'diagnose', 'free');
      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(15);
      expect(result.limit).toBe(10);
      expect(result.retryAfter).toBe(0); // windowEnd equals current time in sliding window
    });

    it('should allow unlimited requests for paid tier', async () => {
      const result = await checkRateLimit('session-id', 'diagnose', 'paid');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(Number.MAX_SAFE_INTEGER);
      expect(mockPrisma.usageRecord.count).not.toHaveBeenCalled();
    });

    it('should use correct limits for different action types', async () => {
      mockPrisma.usageRecord.count.mockResolvedValue(0);
      const result1 = await checkRateLimit('session-id', 'diagnose', 'free');
      expect(result1.limit).toBe(10);

      const result2 = await checkRateLimit('session-id', 'explain', 'free');
      expect(result2.limit).toBe(20);

      const result3 = await checkRateLimit('session-id', 'pdf_parse', 'free');
      expect(result3.limit).toBe(5);
    });
  });

  describe('recordUsage', () => {
    it('should create usage record with anonymous session ID', async () => {
      mockPrisma.usageRecord.create.mockResolvedValue({} as never);
      await recordUsage('session-id', 'diagnose', 'free');
      expect(mockPrisma.usageRecord.create).toHaveBeenCalledWith({
        data: {
          anonymousSessionId: 'session-id',
          actionType: 'diagnose',
          quotaType: 'free',
          userId: null,
        },
      });
    });

    it('should handle paid tier', async () => {
      mockPrisma.usageRecord.create.mockResolvedValue({} as never);
      await recordUsage('session-id', 'diagnose', 'paid');
      expect(mockPrisma.usageRecord.create).toHaveBeenCalledWith({
        data: {
          anonymousSessionId: 'session-id',
          actionType: 'diagnose',
          quotaType: 'paid',
          userId: null,
        },
      });
    });
  });
});