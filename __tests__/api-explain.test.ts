import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/explain/route';
import type { NextRequest } from 'next/server';

// Mock external dependencies
vi.mock('@/lib/rate-limit', () => ({
  getOrCreateAnonymousSessionId: vi.fn(),
  checkRateLimit: vi.fn(),
  recordUsage: vi.fn(),
  setAnonymousSessionCookie: vi.fn(),
}));

vi.mock('@/lib/error-handler', () => ({
  logError: vi.fn(),
  createErrorResponse: vi.fn(),
  Errors: {
    validationError: vi.fn((message) => ({
      response: { error: message, code: 'VALIDATION_ERROR' },
      status: 400,
    })),
    rateLimitExceeded: vi.fn((retryAfter) => ({
      response: { error: '免费用户每日额度已用完，请明天再试', code: 'RATE_LIMIT_EXCEEDED', retryAfter },
      status: 429,
    })),
    serverConfigError: vi.fn(() => ({
      response: { error: '服务器配置错误', code: 'SERVER_CONFIG_ERROR' },
      status: 500,
    })),
    aiServiceUnavailable: vi.fn((details) => ({
      response: { error: 'AI服务暂时不可用，请稍后重试', code: 'AI_SERVICE_UNAVAILABLE', details },
      status: 502,
    })),
    internalError: vi.fn(() => ({
      response: { error: '服务器内部错误', code: 'INTERNAL_ERROR' },
      status: 500,
    })),
  },
}));

// Import mocked modules
import { getOrCreateAnonymousSessionId, checkRateLimit, recordUsage, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { logError } from '@/lib/error-handler';

const mockGetOrCreateAnonymousSessionId = vi.mocked(getOrCreateAnonymousSessionId);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockRecordUsage = vi.mocked(recordUsage);
const mockSetAnonymousSessionCookie = vi.mocked(setAnonymousSessionCookie);
const mockLogError = vi.mocked(logError);

// Sample request body
const VALID_BODY = {
  issue_title: '缺少结果证据',
  issue_summary: '经历描述缺少量化结果',
  resume_excerpt: '参与用户增长策略制定',
  issue_suggestion: '补充具体数据',
  screening_impact: 'HR可能会认为你没有独立负责过项目',
  dimension: 'evidence',
  jd_relevance: 'high',
  is_structural: false,
  user_question: '具体提升了多少？',
};

describe('/api/explain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks for successful flow
    mockGetOrCreateAnonymousSessionId.mockReturnValue('test-session-id');
    mockCheckRateLimit.mockResolvedValue({ allowed: true, currentCount: 0, limit: 20 });
    mockRecordUsage.mockResolvedValue();
    mockSetAnonymousSessionCookie.mockReturnValue({ 'Set-Cookie': 'test-cookie' });
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function createMockRequest(body: unknown): NextRequest {
    return {
      json: async () => body,
      cookies: {
        get: vi.fn().mockReturnValue(undefined),
      },
    } as unknown as NextRequest;
  }

  it('正常请求 - 返回解释结果', async () => {
    // Mock successful fetch response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              explanation: '证据链解释...',
              confidence: 'high',
              evidence_strength: 'strong',
            }),
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.explanation).toBe('证据链解释...');
    expect(data.confidence).toBe('high');
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
    expect(mockFetch).toHaveBeenCalledWith('https://api.deepseek.com/v1/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key',
      },
      body: expect.stringContaining('缺少结果证据'),
    }));
    expect(mockRecordUsage).toHaveBeenCalledWith('test-session-id', 'explain', 'free');
  });

  it('参数缺失 - 返回400', async () => {
    const invalidBody = { issue_title: '标题' }; // missing issue_summary
    const request = createMockRequest(invalidBody);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('缺少必要的问题信息');
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it('限流触发 - 返回429', async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      currentCount: 25,
      limit: 20,
      retryAfter: 86400,
    });
    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain('免费用户每日额度已用完');
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
  });

  it('DEEPSEEK_API_KEY未配置 - 返回500', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('服务器配置错误');
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
  });

  it('AI返回非 JSON - 使用原始文本作为解释', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '非JSON格式的纯文本解释',
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.explanation).toBe('非JSON格式的纯文本解释');
    expect(data.confidence).toBe('medium'); // default
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('AI返回空内容 - 返回502', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: '',
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toContain('AI服务暂时不可用');
    expect(mockLogError).toHaveBeenCalled();
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
  });

  it('AI返回JSON但缺少explanation字段 - 使用默认文本', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ confidence: 'high' }), // missing explanation
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.explanation).toBe('暂时无法生成解释，请稍后重试。');
    expect(data.confidence).toBe('high');
  });

  it('AI返回JSON但缺少confidence字段 - 使用默认medium', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ explanation: '解释内容' }), // missing confidence
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.explanation).toBe('解释内容');
    expect(data.confidence).toBe('medium');
  });

  it('DeepSeek API错误 (非200) - 返回502', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    vi.stubGlobal('fetch', mockFetch);

    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toContain('AI服务暂时不可用');
    expect(mockLogError).toHaveBeenCalled();
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
  });

  it('usage记录失败不影响响应', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              explanation: '解释',
              confidence: 'high',
            }),
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);
    mockRecordUsage.mockRejectedValue(new Error('数据库错误'));

    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.explanation).toBe('解释');
    // Should have logged warning (but mock not set up for console.warn)
  });

  it('处理未知异常 - 返回500', async () => {
    mockGetOrCreateAnonymousSessionId.mockImplementation(() => {
      throw new Error('Unexpected error');
    });
    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('服务器内部错误');
    expect(mockLogError).toHaveBeenCalled();
    // Should still attempt to set cookie
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
  });
});