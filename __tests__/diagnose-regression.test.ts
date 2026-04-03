import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runFreeDiagnoseWorkflow } from '@/lib/diagnose/workflow';
import { logError, logInfo } from '@/lib/error-handler';

// Mock external dependencies
vi.mock('@/lib/diagnose/normalize', () => ({
  normalizeInput: vi.fn(),
  InputQualityError: class InputQualityError extends Error {},
}));

vi.mock('@/lib/diagnose/rules', () => ({
  rulePreAnalysis: vi.fn(),
}));

vi.mock('@/lib/diagnose/enrichment', () => ({
  enrichIssues: vi.fn(),
  getEnrichmentStructuredData: vi.fn(),
}));

vi.mock('@/lib/diagnose/postprocess', () => ({
  postProcessResponse: vi.fn((response) => response),
  retryJsonParse: vi.fn((fn) => fn()),
}));

vi.mock('@/lib/error-handler', () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
}));

// Import mocked modules
import { normalizeInput } from '@/lib/diagnose/normalize';
import { rulePreAnalysis } from '@/lib/diagnose/rules';
import { enrichIssues } from '@/lib/diagnose/enrichment';
import { postProcessResponse } from '@/lib/diagnose/postprocess';

const mockNormalizeInput = vi.mocked(normalizeInput);
const mockRulePreAnalysis = vi.mocked(rulePreAnalysis);
const mockEnrichIssues = vi.mocked(enrichIssues);
const mockPostProcessResponse = vi.mocked(postProcessResponse);
const mockLogError = vi.mocked(logError);
const mockLogInfo = vi.mocked(logInfo);

// Sample payloads (simplified versions)
const STRONG_CASE_PAYLOAD = {
  resume_text: `负责公司核心产品的后端开发，使用Java和Spring Boot框架。参与了多个微服务的设计与实现，负责数据库优化和性能调优。与前端团队协作，确保接口符合规范，完成项目交付。编写技术文档，指导新人快速上手项目。此外，我还负责代码审查和团队培训，提升整体代码质量。在项目中引入持续集成和持续部署流程，自动化测试覆盖率达到80%以上。优化了系统架构，将响应时间降低30%。同时，协助产品经理进行需求分析，确保技术方案符合业务目标。积累了丰富的分布式系统经验，熟悉Redis、Kafka等中间件。`,
  target_role: '高级后端开发工程师',
  jd_text: `岗位：高级后端开发工程师
职责：
1. 负责分布式系统架构设计与开发，确保高并发、高可用性；
2. 使用Java/Spring Cloud技术栈，深入理解微服务架构；
3. 参与核心模块的设计与实现，包括订单、支付、风控等业务；
4. 优化系统性能，解决线上疑难问题，保障系统稳定运行；
5. 带领初级工程师，进行代码评审和技术分享。

要求：
1. 5年以上Java开发经验，精通Spring Boot、Spring Cloud；
2. 熟悉分布式缓存、消息队列、数据库分库分表；
3. 有高并发系统设计经验，对性能调优有深入理解；
4. 具备良好的沟通能力和团队协作精神。`,
  tier: 'free' as const,
};

const EXCELLENT_CASE_PAYLOAD = {
  resume_text: `作为后端技术负责人，主导了订单系统的重构，引入事件驱动架构，将系统吞吐量从每秒100单提升到500单，降低延迟40%。设计并实现了实时风控模块，通过规则引擎和机器学习模型，将欺诈识别准确率提升至95%，每月减少损失约200万元。推动团队代码规范落地，引入自动化测试和CI/CD流水线，将部署时间从2小时缩短到15分钟。主导技术选型，引入Kafka和Redis，解决数据一致性和缓存热点问题，系统可用性达到99.99%。`,
  target_role: '技术负责人',
  jd_text: `岗位：高级后端开发工程师
职责：
1. 负责分布式系统架构设计与开发，确保高并发、高可用性；
2. 使用Java/Spring Cloud技术栈，深入理解微服务架构；
3. 参与核心模块的设计与实现，包括订单、支付、风控等业务；
4. 优化系统性能，解决线上疑难问题，保障系统稳定运行；
5. 带领初级工程师，进行代码评审和技术分享。

要求：
1. 5年以上Java开发经验，精通Spring Boot、Spring Cloud；
2. 熟悉分布式缓存、消息队列、数据库分库分表；
3. 有高并发系统设计经验，对性能调优有深入理解；
4. 具备良好的沟通能力和团队协作精神。`,
  tier: 'free' as const,
};

const INSUFFICIENT_CASE_PAYLOAD = {
  resume_text: '我是程序员，会写代码。',
  target_role: '程序员',
  jd_text: '',
  tier: 'free' as const,
};

describe('诊断引擎回归测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');

    // Default mock implementations
    mockNormalizeInput.mockImplementation((req) => ({
      resume_text: req.resume_text,
      target_role: req.target_role,
      jd_text: req.jd_text || '',
      tier: req.tier,
      resume_sentences: req.resume_text.split(/[。\n]/).filter(s => s.trim()),
      resume_paragraphs: req.resume_text.split(/\n\s*\n/).filter(p => p.trim()),
      resume_sections: [],
      jd_keywords: req.jd_text ? req.jd_text.split(/[\s，。；]/).filter(w => w.length > 1) : [],
      jd_quality: req.jd_text?.length > 50 ? 'strong' : req.jd_text?.length > 0 ? 'weak' : 'none',
      text_quality: req.resume_text.length > 100 ? 'sufficient' : 'insufficient',
      experience_level: 'neutral',
    }));

    mockRulePreAnalysis.mockReturnValue({
      total_matched: 0,
      matches: [],
    });

    mockEnrichIssues.mockReturnValue({
      enrichments: [],
    });

    mockPostProcessResponse.mockImplementation((response) => response);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('strong case - 正常场景，应返回core_issues', async () => {
    // Mock AI response for strong case (normal scenario with issues)
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              scenario: 'normal',
              main_judgment: '工作描述缺乏结果证据，看不出实际价值',
              candidate_issues: [
                {
                  title: '缺少量化结果',
                  summary: '多段经历只写了"负责""参与"，看不到实际产出',
                  evidence: '参与用户增长策略制定，协助团队完成Q3增长目标',
                  insider_view: '能看出参与了但看不到你的贡献',
                  suggestion: '补充具体数据',
                  follow_up_question: '你个人在Q3增长中做了什么？',
                  screening_impact: 'HR可能会认为你没有独立负责过项目',
                  is_structural: false,
                  jd_relevance: 'high',
                  dimension: 'evidence',
                  rewrite_examples: [
                    {
                      original: '参与用户增长策略制定',
                      rewritten: '通过分析用户行为数据，提出并实施3项增长策略，使Q3新用户增长30%',
                      change_summary: '从动作描述转为结果导向，补充具体数据和贡献',
                    },
                  ],
                },
              ],
              rewrite_examples: [],
              minor_suggestions: [],
              follow_up_prompts: [],
              rewrite_direction: '动作 -> 结果导向',
              excellent_score: 65,
            }),
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await runFreeDiagnoseWorkflow(STRONG_CASE_PAYLOAD);

    expect(result.scenario).toBe('normal');
    expect(result.core_issues.length).toBeGreaterThan(0);
    expect(result.main_judgment).not.toBe('');
    expect(result.metadata.jd_quality).toBe('strong');
    expect(mockLogInfo).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
  });

  it('excellent case - 优秀场景，应返回excellent scenario', async () => {
    // Mock AI response for excellent case
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              scenario: 'excellent',
              main_judgment: '这是一份优秀简历，没有明显的核心问题',
              candidate_issues: [],
              rewrite_examples: [],
              minor_suggestions: [
                { title: '格式优化', description: '可以考虑统一日期格式', category: '优化' },
              ],
              follow_up_prompts: [],
              rewrite_direction: '',
              excellence_insight: '亮点是量化充分，结果导向明确',
              excellent_score: 95,
            }),
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await runFreeDiagnoseWorkflow(EXCELLENT_CASE_PAYLOAD);

    expect(result.scenario).toBe('excellent');
    expect(result.core_issues.length).toBe(0);
    expect(result.main_judgment).toContain('优秀简历');
    expect(result.excellent_score).toBeGreaterThanOrEqual(90);
    expect(result.metadata.jd_quality).toBe('strong');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('insufficient case - 输入不足场景，应返回insufficient_input', async () => {
    // Mock normalizeInput to throw InputQualityError for insufficient input
    const { InputQualityError } = await import('@/lib/diagnose/normalize');
    mockNormalizeInput.mockImplementation(() => {
      throw new InputQualityError('输入不足');
    });

    const result = await runFreeDiagnoseWorkflow(INSUFFICIENT_CASE_PAYLOAD);

    expect(result.scenario).toBe('insufficient_input');
    expect(result.main_judgment).toContain('输入信息不足');
    expect(result.core_issues.length).toBe(0);
    expect(result.priority_actions.length).toBeGreaterThan(0);
    expect(mockFetch).not.toHaveBeenCalled(); // AI should not be called
  });

  it('AI失败 - 应抛出错误', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(runFreeDiagnoseWorkflow(STRONG_CASE_PAYLOAD)).rejects.toThrow();
    expect(mockLogError).toHaveBeenCalled();
  });

  it('DEEPSEEK_API_KEY未配置 - 应抛出错误', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    await expect(runFreeDiagnoseWorkflow(STRONG_CASE_PAYLOAD)).rejects.toThrow('DEEPSEEK_API_KEY');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('AI返回JSON解析失败 - 应重试并最终抛出错误', async () => {
    // Mock retryJsonParse to fail
    const { retryJsonParse } = await import('@/lib/diagnose/postprocess');
    vi.mocked(retryJsonParse).mockRejectedValue(new Error('JSON解析失败'));

    await expect(runFreeDiagnoseWorkflow(STRONG_CASE_PAYLOAD)).rejects.toThrow();
    expect(mockLogError).toHaveBeenCalled();
  });
});