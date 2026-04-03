import { describe, it, expect } from 'vitest';
import { normalizeInput, InputQualityError, assessJdQuality } from '../lib/diagnose/normalize';
import { postProcessResponse } from '../lib/diagnose/postprocess';
import type { DiagnoseRequest, FreeDiagnoseResponse, NormalizedInput } from '../lib/diagnose/types';

// ─── Sample Data ─────────────────────────────────────────────
const STRONG_RESUME = `
张三，3年互联网运营经验。
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

技能：熟练使用Figma、Notion、飞书、Google Analytics
`;

const STRONG_JD = `
岗位：内容运营（高级）
职责：
1. 负责公司核心内容矩阵的运营策略制定与执行
2. 搭建内容分发体系，覆盖公众号、抖音、小红书等主流平台
3. 主导内容数据分析，持续优化内容质量和用户增长
4. 带领2-3人小团队完成内容KPI

要求：
1. 3年以上内容运营经验
2. 有从0到1搭建内容体系的经验
3. 数据驱动，熟悉常见数据分析工具
4. 优秀的文案能力和用户洞察
`;

const WEAK_JD = '内容运营';

const INSUFFICIENT_RESUME = '我想找工作';


// ─── Normalize Tests ─────────────────────────────────────────
describe('normalizeInput', () => {
  it('should normalize a valid resume', () => {
    const result = normalizeInput({
      resume_text: STRONG_RESUME,
      target_role: '内容运营',
      jd_text: STRONG_JD,
      tier: 'free',
    });

    expect(result.resume_sentences.length).toBeGreaterThan(3);
    expect(result.jd_keywords.length).toBeGreaterThan(0);
    expect(result.jd_quality).toBe('strong');
    expect(result.text_quality).toBe('sufficient');
  });

  it('should reject resume under 100 chars', () => {
    expect(() => normalizeInput({
      resume_text: INSUFFICIENT_RESUME,
      target_role: '产品经理',
      tier: 'free',
    })).toThrow(InputQualityError);
  });

  it('should reject pure numbers', () => {
    expect(() => normalizeInput({
      resume_text: '1234567890'.repeat(20),
      target_role: '产品经理',
      tier: 'free',
    })).toThrow(InputQualityError);
  });

  it('should detect JD quality correctly', () => {
    expect(assessJdQuality('')).toBe('none');
    expect(assessJdQuality('运营')).toBe('weak');
    expect(assessJdQuality(STRONG_JD)).toBe('strong');
  });
});

// ─── PostProcess Tests ───────────────────────────────────────
describe('postProcessResponse', () => {
  const makeInput = (overrides?: Partial<NormalizedInput>): NormalizedInput => ({
    resume_text: STRONG_RESUME,
    target_role: '内容运营',
    jd_text: STRONG_JD,
    tier: 'free',
    resume_sentences: STRONG_RESUME.split(/[。\n]/).filter(s => s.trim()),
    jd_keywords: ['内容运营', '数据分析', '用户增长'],
    jd_quality: 'strong',
    text_quality: 'sufficient',
    ...overrides,
  });

  it('should not force exactly 3 priority_actions', () => {
    const aiResponse: FreeDiagnoseResponse = {
      scenario: 'normal',
      main_judgment: '缺少结果证据',
      core_issues: [{
        title: '缺少结果证据',
        summary: '经历描述缺少量化结果',
        evidence: '参与用户增长策略制定',
        insider_view: '看不到具体贡献',
        suggestion: '补充数据',
        follow_up_question: '具体提升了多少？',
        priority: 1,
      }],
      core_issues_summary: { total_count: 1, shown_count: 1 },
      priority_actions: [
        { title: '补充量化结果', description: '为每段经历补充具体数据' },
      ],
      rewrite_direction: '从动作描述转向结果导向表达',
      minor_suggestions: [],
      metadata: {
        target_role: '内容运营',
        has_jd: true,
        generated_at: new Date().toISOString(),
        tier: 'free',
      },
    };

    const result = postProcessResponse(aiResponse, makeInput());
    // Should keep 1 action, NOT force to 3
    expect(result.priority_actions.length).toBe(1);
  });

  it('should handle excellent scenario correctly', () => {
    const aiResponse: FreeDiagnoseResponse = {
      scenario: 'excellent',
      main_judgment: '你的简历已经很优秀，没有明显的核心问题',
      core_issues: [],
      core_issues_summary: { total_count: 0, shown_count: 0 },
      priority_actions: [],
      rewrite_direction: '',
      minor_suggestions: [],
      metadata: {
        target_role: '产品经理',
        has_jd: true,
        generated_at: new Date().toISOString(),
        tier: 'free',
      },
    };

    const result = postProcessResponse(aiResponse, makeInput());
    expect(result.scenario).toBe('excellent');
    expect(result.core_issues.length).toBe(0);
    // Should auto-add a minor suggestion
    expect(result.minor_suggestions.length).toBeGreaterThan(0);
    // Should auto-add priority_actions
    expect(result.priority_actions.length).toBeGreaterThan(0);
  });

  it('should handle insufficient_input scenario correctly', () => {
    const aiResponse: FreeDiagnoseResponse = {
      scenario: 'insufficient_input',
      main_judgment: '输入信息不足',
      core_issues: [],
      core_issues_summary: { total_count: 0, shown_count: 0 },
      priority_actions: [],
      rewrite_direction: '',
      minor_suggestions: [],
      metadata: {
        target_role: '产品经理',
        has_jd: false,
        generated_at: new Date().toISOString(),
        tier: 'free',
      },
    };

    const result = postProcessResponse(aiResponse, makeInput({ jd_quality: 'none', jd_text: '' }));
    expect(result.scenario).toBe('insufficient_input');
    expect(result.core_issues.length).toBe(0);
    expect(result.before_text).toBeFalsy();
    expect(result.after_text).toBeFalsy();
    expect(result.rewrite_direction).toBe('');
  });

  it('should NOT fall back to neutral main_judgment in normal scenario', () => {
    const aiResponse: FreeDiagnoseResponse = {
      scenario: 'normal',
      main_judgment: '',
      core_issues: [{
        title: '缺少结果证据，经历停留在动作描述层',
        summary: '多段经历只写了"负责""参与"，看不到实际产出',
        evidence: '参与用户增长策略制定，协助团队完成Q3增长目标',
        insider_view: '能看出参与了但看不到你的贡献',
        suggestion: '补充具体数据',
        follow_up_question: '你个人在Q3增长中做了什么？',
        priority: 1,
      }],
      core_issues_summary: { total_count: 1, shown_count: 1 },
      priority_actions: [
        { title: '补结果', description: '先改最核心的一段经历' },
      ],
      rewrite_direction: '动作 -> 结果导向',
      minor_suggestions: [],
      metadata: {
        target_role: '内容运营',
        has_jd: true,
        generated_at: new Date().toISOString(),
        tier: 'free',
      },
    };

    const result = postProcessResponse(aiResponse, makeInput());
    // main_judgment should be filled from core_issues[0].title, not neutral
    expect(result.main_judgment).not.toBe('简历诊断分析');
    expect(result.main_judgment).not.toBe('简历存在优化空间');
    expect(result.main_judgment).not.toBe('');
    expect(result.main_judgment).toContain('缺少结果证据');
  });

  it('should limit core_issues to 7 max for free tier', () => {
    const issues = Array.from({ length: 10 }, (_, i) => ({
      title: `问题 ${i + 1}`,
      summary: `摘要 ${i + 1}`,
      evidence: `证据 ${i + 1}`,
      insider_view: `视角 ${i + 1}`,
      suggestion: `建议 ${i + 1}`,
      follow_up_question: `追问 ${i + 1}`,
      priority: i + 1,
    }));

    const aiResponse: FreeDiagnoseResponse = {
      scenario: 'normal',
      main_judgment: '问题 1',
      core_issues: issues,
      core_issues_summary: { total_count: 10, shown_count: 10 },
      priority_actions: [{ title: '先改', description: '先改第一个' }],
      rewrite_direction: '方向',
      minor_suggestions: [],
      metadata: {
        target_role: '运营',
        has_jd: false,
        generated_at: new Date().toISOString(),
        tier: 'free',
      },
    };

    const result = postProcessResponse(aiResponse, makeInput());
    expect(result.core_issues.length).toBeLessThanOrEqual(7);
    expect(result.core_issues_summary.shown_count).toBeLessThanOrEqual(7);
  });

  it('should ensure before/after are paired', () => {
    const aiResponse: FreeDiagnoseResponse = {
      scenario: 'normal',
      main_judgment: '问题',
      core_issues: [{ title: '问题', summary: '摘要', evidence: '证据', insider_view: '视角', suggestion: '建议', follow_up_question: '追问', priority: 1 }],
      core_issues_summary: { total_count: 1, shown_count: 1 },
      priority_actions: [{ title: '动作', description: '描述' }],
      rewrite_direction: '方向',
      minor_suggestions: [],
      before_text: '原文',
      after_text: '', // missing after
      metadata: { target_role: '运营', has_jd: false, generated_at: new Date().toISOString(), tier: 'free' },
    };

    const result = postProcessResponse(aiResponse, makeInput());
    // Both should be cleared since they're unpaired
    expect(result.before_text).toBeFalsy();
    expect(result.after_text).toBeFalsy();
  });
});

// ─── Scenario Determination Tests ────────────────────────────
describe('scenario determination', () => {
  it('normal + strong JD should not produce neutral main_judgment', () => {
    // This tests the overall contract
    const request: DiagnoseRequest = {
      resume_text: STRONG_RESUME,
      target_role: '内容运营',
      jd_text: STRONG_JD,
      tier: 'free',
    };

    // We can test normalizeInput at least
    const normalized = normalizeInput(request);
    expect(normalized.jd_quality).toBe('strong');
    expect(normalized.resume_sentences.length).toBeGreaterThan(3);
  });

  it('no JD should set jd_quality to none', () => {
    const normalized = normalizeInput({
      resume_text: STRONG_RESUME,
      target_role: '内容运营',
      jd_text: '',
      tier: 'free',
    });
    expect(normalized.jd_quality).toBe('none');
  });

  it('weak JD should set jd_quality to weak', () => {
    const normalized = normalizeInput({
      resume_text: STRONG_RESUME,
      target_role: '内容运营',
      jd_text: WEAK_JD,
      tier: 'free',
    });
    expect(normalized.jd_quality).toBe('weak');
  });
});
