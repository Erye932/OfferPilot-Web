/**
 * V4 诊断报告缓存 — 内存 LRU 实现
 *
 * 策略：
 * - Key: sha256(resume_text + target_role + jd_text + schema_version) 取前 32 字节
 * - TTL: 24 小时
 * - 容量: 200 条 (LRU 淘汰)
 * - 命中时返回 report 副本 + metadata.cache_hit = true
 * - force_refresh 时绕过查询，但仍写入新结果
 *
 * 注意：仅对单实例 Node.js 进程有效。多实例部署后建议加 Redis / DB 层。
 * 数据库历史报告查询是另一个层（saveDiagnosisResult 已落 DiagnoseReport 表）。
 */

import { createHash } from 'crypto';
import type { DiagnoseReport } from './types';
import { logInfo } from '../error-handler';

// ════════════════════════════════════════════════════════════════
// 配置
// ════════════════════════════════════════════════════════════════

const TTL_MS = 24 * 60 * 60 * 1000;        // 24 小时
const MAX_ENTRIES = 200;                    // LRU 上限
const SCHEMA_VERSION = '4.0';

// ════════════════════════════════════════════════════════════════
// 缓存项
// ════════════════════════════════════════════════════════════════

interface CacheEntry {
  report: DiagnoseReport;
  createdAt: number;
}

// ════════════════════════════════════════════════════════════════
// LRU 实现（用 Map 顺序）
// ════════════════════════════════════════════════════════════════

class DiagnoseLruCache {
  private store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  /**
   * 计算缓存 Key
   */
  buildKey(resume_text: string, target_role: string, jd_text: string): string {
    const raw = [
      resume_text.trim(),
      target_role.trim(),
      (jd_text || '').trim(),
      SCHEMA_VERSION,
    ].join('\n---\n');
    return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 32);
  }

  /**
   * 查询缓存
   */
  get(key: string): DiagnoseReport | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }

    // TTL 过期
    if (Date.now() - entry.createdAt > TTL_MS) {
      this.store.delete(key);
      this.misses += 1;
      return null;
    }

    this.hits += 1;

    // LRU 刷新（删后再加，放到末尾）
    this.store.delete(key);
    this.store.set(key, entry);

    // 返回带 cache_hit 标记的副本
    const report: DiagnoseReport = {
      ...entry.report,
      metadata: {
        ...entry.report.metadata,
        cache_hit: true,
      },
    };
    return report;
  }

  /**
   * 写入缓存
   */
  set(key: string, report: DiagnoseReport): void {
    // 容量满，淘汰最早访问的（Map 第一个 key）
    if (this.store.size >= MAX_ENTRIES) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    this.store.set(key, {
      report,
      createdAt: Date.now(),
    });
  }

  /**
   * 删除某 key（force_refresh 时主动失效）
   */
  invalidate(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * 清空全部
   */
  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 调试用：返回当前状态
   */
  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// 全局单例（Node.js 进程内共享）
const diagnoseCache = new DiagnoseLruCache();

// ════════════════════════════════════════════════════════════════
// 对外 API
// ════════════════════════════════════════════════════════════════

/**
 * 查询缓存（已计算 hash）
 *
 * @param input 原始输入
 * @returns 命中的 report，或 null
 */
export function getCachedReport(input: {
  resume_text: string;
  target_role: string;
  jd_text?: string;
}): DiagnoseReport | null {
  const key = diagnoseCache.buildKey(input.resume_text, input.target_role, input.jd_text ?? '');
  const hit = diagnoseCache.get(key);
  if (hit) {
    logInfo('DiagnoseCache', '命中缓存', { key: key.slice(0, 12), stats: diagnoseCache.stats() });
  }
  return hit;
}

/**
 * 写入缓存
 */
export function setCachedReport(
  input: { resume_text: string; target_role: string; jd_text?: string },
  report: DiagnoseReport
): void {
  const key = diagnoseCache.buildKey(input.resume_text, input.target_role, input.jd_text ?? '');
  diagnoseCache.set(key, report);
  logInfo('DiagnoseCache', '写入缓存', { key: key.slice(0, 12), size: diagnoseCache.stats().size });
}

/**
 * 主动失效（force_refresh 用）
 */
export function invalidateCachedReport(input: {
  resume_text: string;
  target_role: string;
  jd_text?: string;
}): boolean {
  const key = diagnoseCache.buildKey(input.resume_text, input.target_role, input.jd_text ?? '');
  const ok = diagnoseCache.invalidate(key);
  if (ok) logInfo('DiagnoseCache', '失效缓存', { key: key.slice(0, 12) });
  return ok;
}

/**
 * 调试用：返回缓存状态
 */
export function getCacheStats() {
  return diagnoseCache.stats();
}

/**
 * 调试用：清空缓存
 */
export function clearCache() {
  diagnoseCache.clear();
}
