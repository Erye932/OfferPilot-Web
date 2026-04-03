import { prisma } from './prisma';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';

// 扩展点说明：
// 1. 付费配额：修改 checkRateLimit 中的付费用户逻辑，从用户订阅计划获取实际限制
// 2. 实时监控：在 recordUsage 后发送事件到监控系统（如 Sentry, DataDog）
// 3. 用户身份：当用户登录后，将 anonymousSessionId 关联到 userId，实现匿名到登录的转化
// 4. 突发限制：添加每分钟/每小时限制，防止短时间滥用

const RATE_LIMIT_WINDOW_HOURS = 24; // 24小时窗口
const DEFAULT_LIMITS = {
  diagnose: 10,      // 免费用户每天最多10次诊断
  explain: 20,       // 免费用户每天最多20次解释
  pdf_parse: 5,      // 免费用户每天最多5次PDF解析
} as const;

// 特性开关：是否启用限流（设置为 true 可启用限流，默认禁用）
export function isRateLimitEnabled(): boolean {
  return process.env.RATE_LIMIT_ENABLED === 'true'; // 默认为 false，设置 RATE_LIMIT_ENABLED=true 启用
}

type ActionType = keyof typeof DEFAULT_LIMITS;

/**
 * 获取或创建匿名会话ID
 * 从 cookie 中读取，若无则生成并设置到 cookie
 */
export function getOrCreateAnonymousSessionId(request: NextRequest): string {
  const cookieName = 'offerpilot_anon_session';
  const cookie = request.cookies.get(cookieName);

  if (cookie?.value) {
    return cookie.value;
  }

  // 生成新的会话ID
  const sessionId = randomUUID();

  // 注意：此处不实际设置 cookie，因为 NextResponse 才能设置 cookie
  // 调用者需要在响应中调用 setAnonymousSessionCookie
  return sessionId;
}

/**
 * 设置匿名会话 cookie 到响应
 */
export function setAnonymousSessionCookie(sessionId: string): { 'Set-Cookie': string } {
  const cookieName = 'offerpilot_anon_session';
  const maxAge = 60 * 60 * 24 * 30; // 30天

  return {
    'Set-Cookie': `${cookieName}=${sessionId}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`,
  };
}

/**
 * 检查是否超过限流
 * @param sessionId 匿名会话ID
 * @param actionType 操作类型
 * @param tier 用户层级（free/paid）
 * @returns 是否允许继续执行，以及当前使用量
 */
export async function checkRateLimit(
  sessionId: string,
  actionType: ActionType,
  tier: 'free' | 'paid' = 'free'
): Promise<{ allowed: boolean; currentCount: number; limit: number; retryAfter?: number }> {
  // 如果限流被禁用，直接允许所有请求
  if (!isRateLimitEnabled()) {
    return { allowed: true, currentCount: 0, limit: Number.MAX_SAFE_INTEGER };
  }

  // 付费用户暂时不限流
  if (tier === 'paid') {
    return { allowed: true, currentCount: 0, limit: Number.MAX_SAFE_INTEGER };
  }

  const limit = DEFAULT_LIMITS[actionType];
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);

  const count = await prisma.usageRecord.count({
    where: {
      anonymousSessionId: sessionId,
      actionType,
      createdAt: { gte: windowStart },
    },
  });

  if (count >= limit) {
    // 计算下一次可重试的时间（窗口结束）
    const windowEnd = new Date(windowStart.getTime() + RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000);
    const retryAfter = Math.ceil((windowEnd.getTime() - Date.now()) / 1000);
    return { allowed: false, currentCount: count, limit, retryAfter };
  }

  return { allowed: true, currentCount: count, limit };
}

/**
 * 记录使用量（调用后务必记录）
 */
export async function recordUsage(
  sessionId: string,
  actionType: ActionType,
  tier: 'free' | 'paid' = 'free'
): Promise<void> {
  await prisma.usageRecord.create({
    data: {
      anonymousSessionId: sessionId,
      actionType,
      quotaType: tier,
      userId: null, // 匿名用户
    },
  });
}