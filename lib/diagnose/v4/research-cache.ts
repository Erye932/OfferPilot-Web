/**
 * V4 研究阶段缓存（按 target_role）— 双层架构
 *
 * 与 lib/diagnose/cache.ts 区分：
 * - 那个缓存整份 DiagnoseReport（key=resume+role+jd，TTL 24h）
 * - 这个缓存研究产物 R2/R3（key=role-study:{role} 或 hr-insider:{role}，TTL 7d）
 *
 * 设计意图：
 * - 100 个用户都申请"会计师"，应该共享同一份 RoleStudy / HrInsider
 * - 把"昂贵的 Metaso+蒸馏调用"摊到所有同岗位用户头上
 * - resume_study (R5) 不缓存，每次重跑（依赖具体简历）
 *
 * 双层架构：
 * - L1 内存（Map，快但冷启动丢失）
 * - L2 数据库（Prisma → PostgreSQL，跨冷启动持久化）
 * - get: L1 → L2（命中则回填 L1）
 * - set: 同时写 L1 + L2
 * - DB 操作失败时静默降级为纯内存模式，不阻塞主流程
 */

import type { RoleStudyOutput, HrInsiderOutput } from './schemas';
import { logInfo, logWarn } from '../../error-handler';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;            // 7 天
const MAX_ENTRIES = 500;

type CacheType = 'role_study' | 'hr_insider';
type CacheValue = RoleStudyOutput | HrInsiderOutput;

interface CacheEntry<T extends CacheValue> {
  value: T;
  createdAt: number;
}

// ─── 惰性 Prisma 导入 ────────────────────────────
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

// ─── L1: 内存 LRU ────────────────────────────────
class MemoryLruCache {
  private store = new Map<string, CacheEntry<CacheValue>>();
  private _hits = 0;
  private _misses = 0;

  get<T extends CacheValue>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this._misses += 1;
      return null;
    }
    if (Date.now() - entry.createdAt > TTL_MS) {
      this.store.delete(key);
      this._misses += 1;
      return null;
    }
    this._hits += 1;
    // LRU 刷新
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  set<T extends CacheValue>(key: string, value: T, createdAt?: number): void {
    if (this.store.size >= MAX_ENTRIES) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, { value, createdAt: createdAt ?? Date.now() });
  }

  invalidate(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
    this._hits = 0;
    this._misses = 0;
  }

  get hits() { return this._hits; }
  get misses() { return this._misses; }
  get size() { return this.store.size; }
}

// ─── L2: 数据库持久层 ────────────────────────────
async function dbGet<T extends CacheValue>(key: string): Promise<T | null> {
  try {
    const prisma = await getPrisma();
    const row = await prisma.researchCache.findUnique({ where: { cacheKey: key } });
    if (!row) return null;
    if (new Date() > row.expiresAt) {
      // 过期 → 异步删除，不阻塞
      prisma.researchCache.delete({ where: { cacheKey: key } }).catch(() => {});
      return null;
    }
    return row.valueJson as T;
  } catch (e) {
    logWarn('ResearchCache.L2', 'DB 读取失败，降级为纯内存', {
      key,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function dbSet(key: string, cacheType: CacheType, targetRole: string, value: CacheValue): Promise<void> {
  try {
    const prisma = await getPrisma();
    const expiresAt = new Date(Date.now() + TTL_MS);
    await prisma.researchCache.upsert({
      where: { cacheKey: key },
      create: {
        cacheKey: key,
        cacheType,
        targetRole,
        valueJson: JSON.parse(JSON.stringify(value)),
        expiresAt,
      },
      update: {
        valueJson: JSON.parse(JSON.stringify(value)),
        expiresAt,
        createdAt: new Date(),
      },
    });
  } catch (e) {
    logWarn('ResearchCache.L2', 'DB 写入失败，仅保留内存缓存', {
      key,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function dbInvalidate(key: string): Promise<void> {
  try {
    const prisma = await getPrisma();
    await prisma.researchCache.deleteMany({ where: { cacheKey: key } });
  } catch (e) {
    logWarn('ResearchCache.L2', 'DB 删除失败', {
      key,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function dbClear(): Promise<void> {
  try {
    const prisma = await getPrisma();
    await prisma.researchCache.deleteMany({});
  } catch (e) {
    logWarn('ResearchCache.L2', 'DB 清空失败', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * 清理数据库中所有过期条目（可由 Cron 定期调用）
 */
export async function sweepExpiredResearchCache(): Promise<number> {
  try {
    const prisma = await getPrisma();
    const result = await prisma.researchCache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      logInfo('ResearchCache.L2', '过期条目清理完成', { deleted: result.count });
    }
    return result.count;
  } catch (e) {
    logWarn('ResearchCache.L2', '过期清理失败', {
      error: e instanceof Error ? e.message : String(e),
    });
    return 0;
  }
}

// ─── 统一缓存实例 ────────────────────────────────
const l1 = new MemoryLruCache();

/** 规范化 key：lowercase + trim + 移除多余空格 */
function normalizeRole(role: string): string {
  return role.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildRoleStudyKey(target_role: string): string {
  return `role-study:${normalizeRole(target_role)}`;
}

function buildHrInsiderKey(target_role: string): string {
  return `hr-insider:${normalizeRole(target_role)}`;
}

// ─── 公开 API ────────────────────────────────────

export async function getCachedRoleStudy(target_role: string): Promise<RoleStudyOutput | null> {
  const key = buildRoleStudyKey(target_role);

  // L1
  const l1Hit = l1.get<RoleStudyOutput>(key);
  if (l1Hit) {
    logInfo('ResearchCache', 'role_study L1 命中', { key, ...cacheStats() });
    return l1Hit;
  }

  // L2
  const l2Hit = await dbGet<RoleStudyOutput>(key);
  if (l2Hit) {
    l1.set(key, l2Hit); // 回填 L1
    logInfo('ResearchCache', 'role_study L2 命中（回填 L1）', { key, ...cacheStats() });
    return l2Hit;
  }

  logInfo('ResearchCache', 'role_study 未命中', { key, ...cacheStats() });
  return null;
}

export async function setCachedRoleStudy(target_role: string, value: RoleStudyOutput): Promise<void> {
  const key = buildRoleStudyKey(target_role);
  l1.set(key, value);
  await dbSet(key, 'role_study', normalizeRole(target_role), value);
  logInfo('ResearchCache', 'role_study 写入 L1+L2', { key, l1_size: l1.size });
}

export async function getCachedHrInsider(target_role: string): Promise<HrInsiderOutput | null> {
  const key = buildHrInsiderKey(target_role);

  // L1
  const l1Hit = l1.get<HrInsiderOutput>(key);
  if (l1Hit) {
    logInfo('ResearchCache', 'hr_insider L1 命中', { key, ...cacheStats() });
    return l1Hit;
  }

  // L2
  const l2Hit = await dbGet<HrInsiderOutput>(key);
  if (l2Hit) {
    l1.set(key, l2Hit);
    logInfo('ResearchCache', 'hr_insider L2 命中（回填 L1）', { key, ...cacheStats() });
    return l2Hit;
  }

  logInfo('ResearchCache', 'hr_insider 未命中', { key, ...cacheStats() });
  return null;
}

export async function setCachedHrInsider(target_role: string, value: HrInsiderOutput): Promise<void> {
  const key = buildHrInsiderKey(target_role);
  l1.set(key, value);
  await dbSet(key, 'hr_insider', normalizeRole(target_role), value);
  logInfo('ResearchCache', 'hr_insider 写入 L1+L2', { key, l1_size: l1.size });
}

/**
 * 按岗位失效某类缓存
 */
export async function invalidateCachedRoleStudy(target_role: string): Promise<void> {
  const key = buildRoleStudyKey(target_role);
  l1.invalidate(key);
  await dbInvalidate(key);
  logInfo('ResearchCache', 'role_study 已失效', { key });
}

export async function invalidateCachedHrInsider(target_role: string): Promise<void> {
  const key = buildHrInsiderKey(target_role);
  l1.invalidate(key);
  await dbInvalidate(key);
  logInfo('ResearchCache', 'hr_insider 已失效', { key });
}

function cacheStats() {
  return {
    l1_size: l1.size,
    l1_hits: l1.hits,
    l1_misses: l1.misses,
  };
}

export function getResearchCacheStats() {
  return {
    l1_size: l1.size,
    l1_hits: l1.hits,
    l1_misses: l1.misses,
    l1_hitRate: (l1.hits + l1.misses) > 0 ? l1.hits / (l1.hits + l1.misses) : 0,
  };
}

export async function clearResearchCache(): Promise<void> {
  l1.clear();
  await dbClear();
  logInfo('ResearchCache', '全部缓存已清空');
}
