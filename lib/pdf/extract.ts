// PDF 提取工具 - Server Only
// 使用 pdfjs-dist 逐页提取文本

import { logError } from '../error-handler';

// 资源保护配置
const MAX_PDF_PAGES = 50; // 最多处理50页
const EXTRACT_TIMEOUT_MS = 30000; // 30秒超时

// pdfjs TextItem 的最小接口
export interface TextItem {
  str: string;
  transform: number[]; // [scaleX, skewX, skewY, scaleY, x, y]
  hasEOL?: boolean;
}

export type PdfErrorType =
  | 'no_file'
  | 'invalid_type'
  | 'too_large'
  | 'encrypted'
  | 'no_text'
  | 'corrupt'
  | 'parse_failed';

export type ExtractionQuality = 'high' | 'medium' | 'low';

/**
 * 评估 PDF 提取文本的质量。
 * 启发式规则：
 * - 文本总量与页数的关系（每页字符数过少 → 可能是扫描版）
 * - 空行/短行比例（过多 → 提取质量差）
 * - 是否包含大量无意义单字符
 */
export function assessExtractionQuality(
  text: string,
  pageCount: number
): ExtractionQuality {
  if (pageCount === 0 || !text.trim()) return 'low';

  const textLength = text.trim().length;
  const charsPerPage = textLength / pageCount;

  // 规则 1：每页平均字符过少 → 可能是扫描版或图片 PDF
  if (charsPerPage < 50) return 'low';

  // 规则 2：统计短行比例
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return 'low';

  const shortLineRatio = lines.filter(l => l.trim().length < 5).length / lines.length;

  // 短行超过 60% → 提取质量可疑
  if (shortLineRatio > 0.6) return 'low';

  // 规则 3：每页字符适中，短行比例可接受 → medium
  if (charsPerPage < 200 || shortLineRatio > 0.3) return 'medium';

  return 'high';
}

/**
 * 前置检查 PDF 文件头
 */
export function validateHeader(buf: Uint8Array): PdfErrorType | null {
  if (buf.length < 5) return 'corrupt';
  const hdr = String.fromCharCode(...buf.slice(0, 5));
  if (hdr !== '%PDF-') return 'corrupt';

  // 快速检测 /Encrypt（前 4KB）
  const head = String.fromCharCode(...buf.slice(0, Math.min(buf.length, 4096)));
  if (/\/Encrypt\b/.test(head)) return 'encrypted';
  return null;
}

// 静态导入 pdfjs legacy 构建（仅限 Node.js 环境）
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// PDF.js 类型定义
interface PDFDocumentLoadingTask {
  promise: Promise<PDFDocumentProxy>;
}

interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getTextContent(): Promise<{ items: TextItem[] }>;
}

interface PDFJSGetDocument {
  getDocument(src: {
    data: Uint8Array;
    useSystemFonts: boolean;
    isEvalSupported: boolean;
    disableWorker: boolean;
    verbosity: number;
  }): PDFDocumentLoadingTask;
}

/**
 * 创建 PDF 文档适配器，封装 pdfjs.getDocument 的兼容性
 * 统一处理类型差异和配置，减少 any 的影响范围
 */
async function createPdfDocument(data: Uint8Array): Promise<{
  numPages: number;
  getPage: (pageNumber: number) => Promise<{
    getTextContent: () => Promise<{ items: TextItem[] }>;
  }>;
}> {
  // pdfjs-dist 的 TS 类型在不同构建下不完全一致
  // 将类型断言和 any 使用收口到此函数内
  const pdfjsTyped = pdfjs as unknown as PDFJSGetDocument;
  const loadingTask = pdfjsTyped.getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
    disableWorker: true, // 在 Node.js 中禁用 worker
    verbosity: 0,
  });

  const doc = await loadingTask.promise;

  // 返回标准化的文档接口
  return {
    numPages: doc.numPages,
    getPage: async (pageNumber: number) => {
      const page = await doc.getPage(pageNumber);
      return {
        getTextContent: async () => {
          const content = await page.getTextContent();
          return { items: content.items };
        }
      };
    }
  };
}

/**
 * pdfjs-dist 逐页提取
 */
export async function extractWithPdfjs(data: Uint8Array): Promise<{ pageTexts: string[]; numPages: number }> {
  // 使用适配器创建 PDF 文档
  const doc = await createPdfDocument(data);

  // 页面数量限制
  if (doc.numPages > MAX_PDF_PAGES) {
    throw new Error(`PDF页数过多（${doc.numPages}页），请控制在${MAX_PDF_PAGES}页以内。`);
  }

  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    // 按 Y 坐标分行：Y 坐标相同（±2px）的 item 属于同一行
    const lines = groupItemsIntoLines(content.items);
    pageTexts.push(lines.join('\n'));
  }

  return { pageTexts, numPages: doc.numPages };
}

/**
 * 将 pdfjs TextContent.items 按 Y 坐标聚合成行
 * Y 坐标差 ≤ 3px 视为同行
 */
export function groupItemsIntoLines(items: TextItem[]): string[] {
  if (items.length === 0) return [];

  // 按 Y 降序（PDF 坐标系 Y 从下往上）、X 升序
  const safeItems = items
    .filter((it) => it && typeof it.str === 'string' && Array.isArray(it.transform) && it.transform.length >= 6);

  if (safeItems.length === 0) return [];

  const sorted = [...safeItems].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    if (Math.abs(dy) > 2) return dy;
    return a.transform[4] - b.transform[4];
  });

  const lines: string[] = [];
  let currentY = sorted[0].transform[5];
  let currentLine = '';
  let lastX = sorted[0].transform[4];

  for (const item of sorted) {
    const y = item.transform[5];
    if (Math.abs(y - currentY) > 3) {
      // 新行
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = item.str;
      currentY = y;
      lastX = item.transform[4];
    } else {
      // 同行：如果有间隔，加空格
      const x = item.transform[4];
      const gap = x - lastX;
      const needSpace = gap > 8; // 经验阈值：大间距更可能是词间空格
      if (currentLine && needSpace && !currentLine.endsWith(' ') && item.str && !item.str.startsWith(' ')) {
        currentLine += ' ';
      }
      currentLine += item.str;
      lastX = x;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  return lines;
}

/**
 * 判断是否新段落
 */
export function isNewParagraph(prev: string, curr: string): boolean {
  if (/[。；：！？.;:!?]$/.test(prev)) return true;
  if (prev.length < 25) return true;
  if (/^[·•●■◆▪►\-–—]/.test(curr)) return true;
  if (/^\d+[.、)）]/.test(curr)) return true;
  if (/^[一二三四五六七八九十]+[、.]/.test(curr)) return true;
  if (/^\d{4}\s*[-–—~年]/.test(curr)) return true;
  if (/^[A-Z]/.test(curr) && !/[a-zA-Z]$/.test(prev)) return true;
  if (/^(?:教育|工作|项目|实习|技能|专业|自我|个人|获奖|证书|荣誉|社会|校园|志愿)/.test(curr) && curr.length < 20) return true;
  if (/^[（【《([]/.test(curr)) return true;
  return false;
}

/**
 * 清洗 + 段落构建
 */
export function buildStructuredResult(pageTexts: string[]): { text: string; paragraphs: string[] } {
  const allLines: string[] = [];

  for (const pageText of pageTexts) {
    const lines = pageText.split('\n');
    for (const raw of lines) {
      let line = raw;
      // 去不可见字符（保留 \t）
      line = line.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      // 行内连续空白 → 单空格
      line = line.replace(/[ \t]+/g, ' ').trim();

      // 跳过页码行
      if (/^\s*(?:Page\s+)?\d+\s*(?:\/\s*\d+)?\s*$/.test(line)) continue;
      // 跳过 "-- 1 of 3 --" 类分隔符
      if (/^--\s*\d+\s+of\s+\d+\s*--$/.test(line)) continue;
      // 跳过常见页眉
      if (/^(?:简\s*历|resume|curriculum\s*vitae|cv)$/i.test(line)) continue;

      allLines.push(line);
    }
    // 页间加空行作为段落分隔
    allLines.push('');
  }

  // 智能合并 PDF 断行 → 段落
  const merged: string[] = [];
  let buf = '';

  for (const line of allLines) {
    if (line === '') {
      if (buf) { merged.push(buf); buf = ''; }
      merged.push('');
      continue;
    }
    if (!buf) { buf = line; continue; }

    if (isNewParagraph(buf, line)) {
      merged.push(buf);
      buf = line;
    } else {
      buf = buf + ' ' + line;
    }
  }
  if (buf) merged.push(buf);

  // 收集段落 + 限制连续空行
  const paragraphs: string[] = [];
  const output: string[] = [];
  let emptyCount = 0;

  for (const line of merged) {
    if (line === '') {
      emptyCount++;
      if (emptyCount <= 1) output.push('');
    } else {
      emptyCount = 0;
      output.push(line);
      paragraphs.push(line);
    }
  }

  return { text: output.join('\n').trim(), paragraphs };
}

/**
 * 主提取函数
 */
export async function extractPdfText(data: Uint8Array, fileName: string): Promise<{
  text: string;
  paragraphs: string[];
  fileName: string;
  pageCount: number;
  textLength: number;
  mimeType: string;
  parseStatus: 'success' | 'no_text' | 'failed';
  extraction_quality: ExtractionQuality;
}> {
  // 前置检查
  const headerError = validateHeader(data);
  if (headerError) {
    throw new Error(headerError);
  }

  try {
    // 添加超时保护
    const extractPromise = extractWithPdfjs(data);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('PDF解析超时，请尝试减小文件大小或页数。')), EXTRACT_TIMEOUT_MS);
    });

    const { pageTexts, numPages } = await Promise.race([extractPromise, timeoutPromise]);
    const { text, paragraphs } = buildStructuredResult(pageTexts);

    if (!text.trim()) {
      return {
        text: '',
        paragraphs: [],
        fileName,
        pageCount: numPages,
        textLength: 0,
        mimeType: 'application/pdf',
        parseStatus: 'no_text',
        extraction_quality: 'low',
      };
    }

    const extraction_quality = assessExtractionQuality(text, numPages);

    return {
      text,
      paragraphs,
      fileName,
      pageCount: numPages,
      textLength: text.length,
      mimeType: 'application/pdf',
      parseStatus: 'success',
      extraction_quality,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    logError('PdfExtract', err, { fileName });

    // 重新抛出带类型的错误
    if (/password/i.test(msg)) {
      throw new Error('encrypted');
    }
    if (/invalid|corrupt|malformed|unexpected/i.test(msg)) {
      throw new Error('corrupt');
    }
    throw new Error('parse_failed');
  }
}