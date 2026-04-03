import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/pdf/parse/route';
import type { NextRequest } from 'next/server';

// Mock external dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    uploadedFile: {
      create: vi.fn(),
    },
    usageRecord: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  getOrCreateAnonymousSessionId: vi.fn(),
  checkRateLimit: vi.fn(),
  recordUsage: vi.fn(),
  setAnonymousSessionCookie: vi.fn(),
}));

vi.mock('@/lib/pdf/extract', () => ({
  extractPdfText: vi.fn(),
}));

vi.mock('@/lib/error-handler', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  createErrorResponse: vi.fn((message, options = {}) => ({
    response: {
      error: message,
      code: options.code || 'PDF_PARSE_ERROR',
      parseStatus: options.parseStatus,
      ...options,
    },
    status: options.status || 500,
  })),
  Errors: {
    rateLimitExceeded: vi.fn((retryAfter) => ({
      response: { error: '免费用户每日额度已用完，请明天再试', code: 'RATE_LIMIT_EXCEEDED', retryAfter },
      status: 429,
    })),
  },
}));

// Import mocked modules
import { prisma } from '@/lib/prisma';
import { getOrCreateAnonymousSessionId, checkRateLimit, recordUsage, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { extractPdfText } from '@/lib/pdf/extract';
import { logError, logWarn } from '@/lib/error-handler';

const mockPrisma = vi.mocked(prisma);
const mockGetOrCreateAnonymousSessionId = vi.mocked(getOrCreateAnonymousSessionId);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockRecordUsage = vi.mocked(recordUsage);
const mockSetAnonymousSessionCookie = vi.mocked(setAnonymousSessionCookie);
const mockExtractPdfText = vi.mocked(extractPdfText);
const mockLogError = vi.mocked(logError);
const mockLogWarn = vi.mocked(logWarn);

describe('/api/pdf/parse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks for successful flow
    mockGetOrCreateAnonymousSessionId.mockReturnValue('test-session-id');
    mockCheckRateLimit.mockResolvedValue({ allowed: true, currentCount: 0, limit: 5 });
    mockRecordUsage.mockResolvedValue();
    mockSetAnonymousSessionCookie.mockReturnValue({ 'Set-Cookie': 'test-cookie' });
    mockPrisma.uploadedFile.create.mockResolvedValue({ id: 'upload-id' } as any);
  });

  function createMockRequest(file: File, fileName?: string): NextRequest {
    const formData = new FormData();
    formData.append('file', file, fileName);
    return {
      formData: async () => formData,
      cookies: {
        get: vi.fn().mockReturnValue(undefined),
      },
    } as unknown as NextRequest;
  }

  function createMockFile(content: Uint8Array, name = 'test.pdf', type = 'application/pdf'): File {
    return new File([content], name, { type });
  }

  it('正常 PDF - 解析成功返回文本', async () => {
    const pdfContent = new Uint8Array([37, 80, 68, 70, 45]); // %PDF-
    const file = createMockFile(pdfContent);
    mockExtractPdfText.mockResolvedValue({
      text: '提取的文本内容',
      paragraphs: ['段落1', '段落2'],
      fileName: 'test.pdf',
      pageCount: 2,
      textLength: 100,
      mimeType: 'application/pdf',
      parseStatus: 'success',
    });

    const request = createMockRequest(file);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('提取的文本内容');
    expect(data.paragraphs).toEqual(['段落1', '段落2']);
    expect(data.pageCount).toBe(2);
    expect(data.textLength).toBe(100);
    expect(data.parseStatus).toBe('success');
    expect(data.uploadedFileId).toBe('upload-id');
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
    expect(mockExtractPdfText).toHaveBeenCalledWith(pdfContent, 'test.pdf');
    expect(mockPrisma.uploadedFile.create).toHaveBeenCalledWith({
      data: {
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        size: pdfContent.length,
        pageCount: 2,
        extractedTextLength: 100,
        parseStatus: 'success',
      },
    });
    expect(mockRecordUsage).toHaveBeenCalledWith('test-session-id', 'pdf_parse', 'free');
  });

  it('非 PDF 文件 - 返回400', async () => {
    const file = createMockFile(new Uint8Array([1, 2, 3]), 'test.txt', 'text/plain');
    const request = createMockRequest(file);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('仅支持 PDF 文件');
    expect(mockExtractPdfText).not.toHaveBeenCalled();
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
  });

  it('超大文件 (>10MB) - 返回400', async () => {
    // Create a large file mock (10MB + 1)
    const largeBuffer = new Uint8Array(10 * 1024 * 1024 + 1);
    const file = createMockFile(largeBuffer, 'large.pdf');
    const request = createMockRequest(file);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('文件大小不能超过 10MB');
    expect(mockExtractPdfText).not.toHaveBeenCalled();
  });

  it('加密 PDF - 返回400', async () => {
    const pdfContent = new Uint8Array([37, 80, 68, 70, 45]);
    const file = createMockFile(pdfContent);
    mockExtractPdfText.mockRejectedValue(new Error('encrypted'));

    const request = createMockRequest(file);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('PDF 文件已加密');
    expect(mockLogError).toHaveBeenCalled();
    // Should still attempt to persist uploaded file record
    expect(mockPrisma.uploadedFile.create).toHaveBeenCalledWith({
      data: {
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        size: pdfContent.length,
        pageCount: null,
        extractedTextLength: null,
        parseStatus: 'failed',
      },
    });
  });

  it('无文本 PDF (扫描版) - 返回400并记录上传', async () => {
    const pdfContent = new Uint8Array([37, 80, 68, 70, 45]);
    const file = createMockFile(pdfContent);
    mockExtractPdfText.mockResolvedValue({
      text: '',
      paragraphs: [],
      fileName: 'test.pdf',
      pageCount: 3,
      textLength: 0,
      mimeType: 'application/pdf',
      parseStatus: 'no_text',
    });

    const request = createMockRequest(file);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('PDF 未提取到文本');
    expect(data.pageCount).toBe(3);
    expect(data.textLength).toBe(0);
    expect(data.uploadedFileId).toBe('upload-id');
    expect(mockPrisma.uploadedFile.create).toHaveBeenCalledWith({
      data: {
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        size: pdfContent.length,
        pageCount: 3,
        extractedTextLength: 0,
        parseStatus: 'no_text',
      },
    });
  });

  it('损坏的 PDF - 返回400', async () => {
    const pdfContent = new Uint8Array([1, 2, 3]); // Not a valid PDF header
    const file = createMockFile(pdfContent);
    const request = createMockRequest(file);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('PDF 文件可能已损坏');
    expect(mockExtractPdfText).not.toHaveBeenCalled();
  });

  it('解析失败 (未知错误) - 返回500', async () => {
    const pdfContent = new Uint8Array([37, 80, 68, 70, 45]);
    const file = createMockFile(pdfContent);
    mockExtractPdfText.mockRejectedValue(new Error('parse_failed'));

    const request = createMockRequest(file);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('PDF 解析失败');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('限流触发 - 返回429', async () => {
    const pdfContent = new Uint8Array([37, 80, 68, 70, 45]);
    const file = createMockFile(pdfContent);
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      currentCount: 10,
      limit: 5,
      retryAfter: 86400,
    });

    const request = createMockRequest(file);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain('免费用户每日额度已用完');
    expect(mockExtractPdfText).not.toHaveBeenCalled();
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
  });

  it('未上传文件 - 返回400', async () => {
    const request = {
      formData: async () => new FormData(), // No file
      cookies: {
        get: vi.fn().mockReturnValue(undefined),
      },
    } as unknown as NextRequest;

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('未上传文件');
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
  });

  it('数据库失败不阻塞主流程 - 仍返回解析结果', async () => {
    const pdfContent = new Uint8Array([37, 80, 68, 70, 45]);
    const file = createMockFile(pdfContent);
    mockExtractPdfText.mockResolvedValue({
      text: '提取的文本内容',
      paragraphs: ['段落1'],
      fileName: 'test.pdf',
      pageCount: 1,
      textLength: 50,
      mimeType: 'application/pdf',
      parseStatus: 'success',
    });
    mockPrisma.uploadedFile.create.mockRejectedValue(new Error('数据库连接失败'));

    const request = createMockRequest(file);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.text).toBe('提取的文本内容');
    expect(data.uploadedFileId).toBeUndefined(); // No upload ID due to DB failure
    expect(mockLogWarn).toHaveBeenCalledWith('PersistUploadedFile', '上传文件落库失败', expect.anything());
  });

  it('数据库失败不阻塞主流程 - usage记录失败不影响响应', async () => {
    const pdfContent = new Uint8Array([37, 80, 68, 70, 45]);
    const file = createMockFile(pdfContent);
    mockExtractPdfText.mockResolvedValue({
      text: '文本',
      paragraphs: [],
      fileName: 'test.pdf',
      pageCount: 1,
      textLength: 10,
      mimeType: 'application/pdf',
      parseStatus: 'success',
    });
    mockRecordUsage.mockRejectedValue(new Error('数据库错误'));

    const request = createMockRequest(file);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockLogWarn).toHaveBeenCalledWith('RateLimitRecord', '记录使用量失败', expect.anything());
  });

  it('处理未知异常 - 返回500并设置cookie', async () => {
    const request = {
      formData: async () => { throw new Error('Unexpected error'); },
      cookies: {
        get: vi.fn().mockReturnValue(undefined),
      },
    } as unknown as NextRequest;

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('PDF 解析失败');
    expect(mockLogError).toHaveBeenCalled();
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
  });
});