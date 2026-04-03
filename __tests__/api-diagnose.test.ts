import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/diagnose/route';
import type { NextRequest } from 'next/server';
import { logError, logWarn } from '@/lib/error-handler';

// Mock external dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    diagnoseSession: {
      create: vi.fn(),
    },
    diagnoseReport: {
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

vi.mock('@/lib/diagnose/workflow', () => ({
  runFreeDiagnoseWorkflow: vi.fn(),
}));

vi.mock('@/lib/error-handler', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
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
import { prisma } from '@/lib/prisma';
import { getOrCreateAnonymousSessionId, checkRateLimit, recordUsage, setAnonymousSessionCookie } from '@/lib/rate-limit';
import { runFreeDiagnoseWorkflow } from '@/lib/diagnose/workflow';

const mockPrisma = vi.mocked(prisma);
const mockGetOrCreateAnonymousSessionId = vi.mocked(getOrCreateAnonymousSessionId);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockRecordUsage = vi.mocked(recordUsage);
const mockSetAnonymousSessionCookie = vi.mocked(setAnonymousSessionCookie);
const mockRunFreeDiagnoseWorkflow = vi.mocked(runFreeDiagnoseWorkflow);
const mockLogError = vi.mocked(logError);
const mockLogWarn = vi.mocked(logWarn);

// Sample payloads
const STRONG_RESUME = `张三，3年互联网运营经验。
毕业于北京大学计算机科学与技术专业。

工作经历：
1. 某互联网公司内容运营（2021-2024）
   - 负责公司公众号运营，月均阅读量从5000提升至50000
   - 策划并执行了10场线上活动，累计覆盖用户20万
   - 搭建了内容分发矩阵，覆盖抖音、小红书、B站三个平台
   - 参与用户增长策略制定，协助团队完成Q3增长目标

2. 某创业公司产品助理（2020-2021）
   - 参与产品需求分析与原型设计
   - 负责竞品分析报告撰写，输出5份深度分析报告
   - 配合开发团队跟进项目进度

技能：熟练使用Figma、Notion、飞书、Google Analytics`;

const STRONG_JD = `岗位：内容运营（高级）
职责：
1. 负责公司核心内容矩阵的运营策略制定与执行
2. 搭建内容分发体系，覆盖公众号、抖音、小红书等主流平台
3. 主导内容数据分析，持续优化内容质量和用户增长
4. 带领2-3人小团队完成内容KPI

要求：
1. 3年以上内容运营经验
2. 有从0到1搭建内容体系的经验
3. 数据驱动，熟悉常见数据分析工具
4. 优秀的文案能力和用户洞察`;

const VALID_BODY = {
  resume_text: STRONG_RESUME,
  target_role: '内容运营',
  jd_text: STRONG_JD,
  tier: 'free' as const,
};

describe('/api/diagnose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks for successful flow
    mockGetOrCreateAnonymousSessionId.mockReturnValue('test-session-id');
    mockCheckRateLimit.mockResolvedValue({ allowed: true, currentCount: 0, limit: 10 });
    mockRecordUsage.mockResolvedValue();
    mockSetAnonymousSessionCookie.mockReturnValue({ 'Set-Cookie': 'test-cookie' });
    mockRunFreeDiagnoseWorkflow.mockResolvedValue({
      scenario: 'normal',
      main_judgment: '主要问题',
      core_issues: [],
      core_issues_summary: { total_count: 0, shown_count: 0 },
      priority_actions: [],
      rewrite_direction: '',
      minor_suggestions: [],
      metadata: {
        target_role: '内容运营',
        has_jd: true,
        generated_at: new Date().toISOString(),
        tier: 'free',
        jd_quality: 'strong',
        schema_version: '5.0',
      },
    });
    mockPrisma.diagnoseSession.create.mockResolvedValue({ id: 'session-id' } as any);
    mockPrisma.diagnoseReport.create.mockResolvedValue({ id: 'report-id' } as any);
    mockPrisma.usageRecord.count.mockResolvedValue(0);
    mockPrisma.usageRecord.create.mockResolvedValue({} as any);
  });

  afterEach(() => {
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

  it('正常请求 - 返回诊断结果并设置cookie', async () => {
    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.scenario).toBe('normal');
    expect(data.report_id).toBe('report-id');
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
    expect(mockRunFreeDiagnoseWorkflow).toHaveBeenCalledWith({
      resume_text: STRONG_RESUME,
      resume_paragraphs: undefined,
      target_role: '内容运营',
      jd_text: STRONG_JD,
      tier: 'free',
    });
    expect(mockPrisma.diagnoseSession.create).toHaveBeenCalled();
    expect(mockPrisma.diagnoseReport.create).toHaveBeenCalled();
    expect(mockRecordUsage).toHaveBeenCalledWith('test-session-id', 'diagnose', 'free');
  });

  it('输入非法 - Zod验证失败返回400', async () => {
    const invalidBody = { ...VALID_BODY, resume_text: undefined };
    const request = createMockRequest(invalidBody);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('请求参数格式错误');
    expect(mockRunFreeDiagnoseWorkflow).not.toHaveBeenCalled();
  });

  it('输入非法 - 缺少必要参数返回400', async () => {
    const invalidBody = { tier: 'free' };
    const request = createMockRequest(invalidBody);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('缺少必要参数');
    expect(mockRunFreeDiagnoseWorkflow).not.toHaveBeenCalled();
  });

  it('限流触发 - 返回429', async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      currentCount: 15,
      limit: 10,
      retryAfter: 86400,
    });
    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain('免费用户每日额度已用完');
    expect(mockRunFreeDiagnoseWorkflow).not.toHaveBeenCalled();
    expect(mockSetAnonymousSessionCookie).toHaveBeenCalledWith('test-session-id');
  });

  it('AI失败 - DeepSeek API错误返回502', async () => {
    mockRunFreeDiagnoseWorkflow.mockRejectedValue(new Error('DeepSeek API 错误: 500'));
    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.error).toContain('AI服务暂时不可用');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('AI失败 - DEEPSEEK_API_KEY未配置返回500', async () => {
    mockRunFreeDiagnoseWorkflow.mockRejectedValue(new Error('DEEPSEEK_API_KEY 未配置'));
    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('服务器配置错误');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('数据库失败不阻塞主流程 - 仍返回诊断结果', async () => {
    mockPrisma.diagnoseSession.create.mockRejectedValue(new Error('数据库连接失败'));
    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    // Should still succeed
    expect(response.status).toBe(200);
    expect(data.scenario).toBe('normal');
    expect(data.report_id).toBeUndefined(); // No report ID due to DB failure
    expect(mockLogWarn).toHaveBeenCalledWith('PersistDiagnoseResult', '数据库落库失败', expect.anything());
    // Workflow should still have been called
    expect(mockRunFreeDiagnoseWorkflow).toHaveBeenCalled();
  });

  it('数据库失败不阻塞主流程 - usage记录失败不影响响应', async () => {
    mockRecordUsage.mockRejectedValue(new Error('数据库错误'));
    const request = createMockRequest(VALID_BODY);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.scenario).toBe('normal');
    expect(mockLogWarn).toHaveBeenCalledWith('RateLimitRecord', '记录使用量失败', expect.anything());
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
  });
});