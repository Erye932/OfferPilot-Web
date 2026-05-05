/**
 * V4 工作流通用工具：JSON 健壮解析、错误降级
 */
import type { z } from 'zod';
import { logError, logWarn } from '../../error-handler';

/** 移除非法控制字符（保留 \t \n \r） */
export function cleanControlCharacters(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u0080-\u009F]/g, ' ');
}

/** 尝试修复常见的 JSON 格式问题（AI 输出常见瑕疵） */
export function attemptJsonRepair(text: string): string {
  let s = text.trim();

  // 1. 把 JS 字面量 undefined / NaN 替换为 null（最常见的 AI 错误）
  s = s.replace(/:\s*undefined\b/g, ': null');
  s = s.replace(/:\s*NaN\b/g, ': null');
  s = s.replace(/:\s*Infinity\b/g, ': null');

  // 2. 中文全角引号 → ASCII 双引号（AI 偶尔会把字符串内引号也转成全角）
  s = s.replace(/[\u201c\u201d]/g, '"');     // " "
  s = s.replace(/[\u2018\u2019]/g, "'");     // ' '

  // 3. 单引号字符串改双引号（保留转义）
  s = s.replace(/:\s*'([^'\\]*(\\.[^'\\]*)*)'/g, (_match, group) => `: "${group.replace(/"/g, '\\"')}"`);

  // 4. 移除尾部多余逗号（对象/数组末尾）
  s = s.replace(/,\s*([}\]])/g, '$1');

  // 5. 补全未闭合的数组和对象
  const opens = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
  const arrOpens = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
  for (let i = 0; i < arrOpens; i++) s += ']';
  for (let i = 0; i < opens; i++) s += '}';

  // 6. 修复未闭合字符串（奇数个未转义引号）
  const quoteCount = (s.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) s += '"';

  return s;
}

/**
 * 激进修复：在普通 attemptJsonRepair 不能解决时尝试的更猛烈的清理
 *
 * 仅用于"已知格式有问题但内容可救"的情况。可能误伤正常 JSON。
 */
export function aggressiveJsonRepair(text: string): string {
  const s = text;

  // 把字符串内的真换行替换为 \n（避免 JSON.parse 崩）
  // 思路：找到 "..." 字符串内部的换行
  let inString = false;
  let escape = false;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      out += ch;
      escape = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString && (ch === '\n' || ch === '\r')) {
      out += '\\n';
      continue;
    }
    if (inString && ch === '\t') {
      out += '\\t';
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * 安全解析 AI 输出 JSON（多 fallback 候选）
 * 1. 提取 ```json``` 代码块
 * 2. 提取最外层对象/数组
 * 3. 直接尝试 + 修复后尝试
 */
export function safeParseJson<T>(content: string, schema?: z.ZodSchema<T>): T {
  content = cleanControlCharacters(content);

  const codeBlockMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
  const objectMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);

  const candidates: string[] = [];
  if (codeBlockMatch?.[1]) candidates.push(cleanControlCharacters(codeBlockMatch[1]));
  if (objectMatch?.[1]) candidates.push(cleanControlCharacters(objectMatch[1]));
  candidates.push(content);

  let parsed: unknown;
  let lastError: unknown;

  for (const candidate of candidates) {
    // 三档修复：原始 → 普通修复 → 激进修复
    for (const text of [candidate, attemptJsonRepair(candidate), aggressiveJsonRepair(attemptJsonRepair(candidate))]) {
      try {
        parsed = JSON.parse(text);
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (parsed !== undefined) break;
  }

  if (parsed === undefined) {
    logError('V4Utils', `JSON 解析失败: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    throw new Error(`JSON 解析失败: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  }

  if (schema) {
    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    // Schema 校验失败：抛错让上层 try-catch 走 fallback 路径，
    // 不再绕过 schema 返回原始数据（会导致下游字段缺失而崩）
    const issuesPreview = JSON.stringify(result.error.issues).slice(0, 500);
    logWarn('V4Utils', `Schema 校验失败: ${issuesPreview}`);
    throw new Error(`Schema 校验失败: ${issuesPreview}`);
  }

  return parsed as T;
}

/**
 * 给 string 数组中每条加索引前缀（生成 ID 用）
 */
export function makeIdPrefix(source: string, index: number): string {
  return `${source}_${index.toString().padStart(3, '0')}`;
}
