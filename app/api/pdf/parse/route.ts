import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getOrCreateAnonymousSessionId, checkRateLimit, recordUsage, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { logError, logWarn, Errors, createErrorResponse } from '@/lib/error-handler';
export const runtime = "nodejs";

// 扩展点说明：
// 1. 文件存储：集成云存储服务（如S3、OSS）保存原始PDF文件
// 2. 病毒扫描：上传前进行恶意文件检测
// 3. 内容过滤：检查PDF是否包含不适当内容
// 4. 用户配额：限制用户上传总大小和文件数量

// ─── 错误分类 ────────────────────────────────────────────────
type PdfErrorType =
  | 'no_file'
  | 'invalid_type'
  | 'too_large'
  | 'encrypted'
  | 'no_text'
  | 'corrupt'
  | 'parse_failed';

const PDF_ERRORS: Record<PdfErrorType, { code: string; message: string; status: number }> = {
  no_file:      { code: 'PDF_NO_FILE',       message: '未上传文件',                                                                 status: 400 },
  invalid_type: { code: 'PDF_INVALID_TYPE',  message: '仅支持 PDF 文件，请选择 PDF 或改为手动粘贴文本',                                 status: 400 },
  too_large:    { code: 'PDF_TOO_LARGE',     message: '文件大小不能超过 10MB',                                                      status: 400 },
  encrypted:    { code: 'PDF_ENCRYPTED',     message: 'PDF 文件已加密，请先解除密码保护再上传，或改为手动粘贴文本',                          status: 400 },
  no_text:      { code: 'PDF_NO_TEXT_LAYER', message: 'PDF 未提取到文本，可能是扫描版 / 图片 PDF，请改为手动粘贴',                          status: 400 },
  corrupt:      { code: 'PDF_CORRUPT',       message: 'PDF 文件可能已损坏，请重新导出后上传，或改为手动粘贴文本',                             status: 400 },
  parse_failed: { code: 'PDF_PARSE_FAILED',  message: 'PDF 解析失败，请确保文件为文本型 PDF（非扫描 / 图片版），或改为手动粘贴文本',            status: 500 },
};

function errorResponse(type: PdfErrorType, extra?: Record<string, unknown>, headers?: Record<string, string>) {
  const e = PDF_ERRORS[type];
  const { response, status } = createErrorResponse(e.message, {
    code: 'PDF_PARSE_ERROR',
    status: e.status,
    parseStatus: 'failed',
    pdfErrorCode: e.code,
    ...extra,
  });
  return NextResponse.json(response, { status, headers });
}

// 惰性导入 prisma，避免 build 阶段 eager 加载 pg 驱动
async function getPrisma() {
  const { prisma } = await import('@/lib/prisma');
  return prisma;
}

/**
 * 最小可用落库：保存 uploaded_file + usage_record
 * - user_id 允许为空（匿名访客）
 * - 数据库不可连接时仅打 warning，不阻塞主流程
 * - 返回创建的 uploaded_file.id，用于后续关联
 */
async function persistUploadedFile(
  file: File,
  result: { parseStatus: 'success' | 'no_text' | 'failed'; pageCount?: number; textLength?: number }
): Promise<string | null> {
  try {
    const prisma = await getPrisma();

    const uploadedFile = await prisma.uploadedFile.create({
      data: {
        originalName: file.name,
        mimeType: file.type || 'application/pdf',
        size: file.size,
        pageCount: result.pageCount ?? null,
        extractedTextLength: result.textLength ?? null,
        parseStatus: result.parseStatus,
        // userId 不传 → null（匿名访客）
      },
    });

    return uploadedFile.id;
  } catch (dbError) {
    // 数据库不可用时不阻塞解析主流程
    logWarn('PersistUploadedFile', '上传文件落库失败', {
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    return null;
  }
}

// ─── POST ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // 匿名会话标识（所有响应都需要设置 cookie）
    const sessionId = getOrCreateAnonymousSessionId(request);
    const headers = setAnonymousSessionCookie(sessionId);

    // 1. 取文件
    let formData: FormData;
    try { formData = await request.formData(); } catch { return errorResponse('no_file', undefined, headers); }

    const file = formData.get('file') as File | null;
    if (!file) return errorResponse('no_file', undefined, headers);

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return errorResponse('invalid_type', undefined, headers);
    }
    if (file.size > 10 * 1024 * 1024) return errorResponse('too_large', undefined, headers);

    // 匿名会话标识与限流（使用已生成的 sessionId）
    const rateLimit = await checkRateLimit(sessionId, 'pdf_parse', 'free');
    if (!rateLimit.allowed) {
      const { response, status } = Errors.rateLimitExceeded(rateLimit.retryAfter);
      return NextResponse.json(response, { status, headers });
    }

    // 记录使用量（异步，不阻塞响应）
    recordUsage(sessionId, 'pdf_parse', 'free').catch((err) =>
      logWarn('RateLimitRecord', '记录使用量失败', {
        error: err instanceof Error ? err.message : String(err),
        sessionId,
        actionType: 'pdf_parse',
        tier: 'free',
      })
    );

    // 2. 读 buffer
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch { return errorResponse('corrupt', undefined, headers); }

    // 3. 动态导入 PDF 提取模块（server-only）
    const { extractPdfText } = await import('@/lib/pdf/extract');

    try {
      // 4. 提取 PDF 文本
      const result = await extractPdfText(bytes, file.name);

      if (result.parseStatus === 'no_text') {
        // 落库上传记录（解析无文本）
        const uploadedFileId = await persistUploadedFile(file, {
          parseStatus: 'no_text',
          pageCount: result.pageCount,
          textLength: 0,
        });

        return errorResponse('no_text', {
          text: '',
          paragraphs: [],
          fileName: file.name,
          pageCount: result.pageCount,
          textLength: 0,
          mimeType: file.type || 'application/pdf',
          extraction_quality: result.extraction_quality,
          uploadedFileId,
        }, headers);
      }

      // 落库上传记录
      const uploadedFileId = await persistUploadedFile(file, {
        parseStatus: 'success',
        pageCount: result.pageCount,
        textLength: result.textLength,
      });

      return NextResponse.json({
        text: result.text,
        paragraphs: result.paragraphs,
        fileName: file.name,
        pageCount: result.pageCount,
        textLength: result.textLength,
        mimeType: file.type || 'application/pdf',
        parseStatus: 'success',
        extraction_quality: result.extraction_quality,
        uploadedFileId,
      }, { headers });

    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      logError('PdfExtractAPI', err, { fileName: file.name });

      // 落库上传记录（解析失败）
      const uploadedFileId = await persistUploadedFile(file, {
        parseStatus: 'failed',
        // pageCount 和 textLength 未知
      });

      // 根据错误消息类型返回相应的错误响应
      if (msg === 'encrypted') return errorResponse('encrypted', { uploadedFileId }, headers);
      if (msg === 'corrupt') return errorResponse('corrupt', { uploadedFileId }, headers);
      if (msg === 'parse_failed') return errorResponse('parse_failed', { uploadedFileId }, headers);

      // 如果是其他错误，检查是否包含特定关键词
      if (/password/i.test(msg)) return errorResponse('encrypted', { uploadedFileId }, headers);
      if (/invalid|corrupt|malformed|unexpected/i.test(msg)) return errorResponse('corrupt', { uploadedFileId }, headers);

      return errorResponse('parse_failed', { uploadedFileId }, headers);
    }

  } catch (error) {
    logError('PdfParseAPI', error);
    // 在未预期异常中仍然设置会话 cookie
    const sessionId = getOrCreateAnonymousSessionId(request);
    const headers = setAnonymousSessionCookie(sessionId);
    return errorResponse('parse_failed', undefined, headers);
  }
}

// ─── OPTIONS ─────────────────────────────────────────────────
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
