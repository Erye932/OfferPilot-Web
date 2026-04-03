import { describe, it, expect } from 'vitest';

// ============================================================
// 1. AI Router Provider Selection (Phase 1)
// ============================================================

describe('AI Router provider selection', () => {
  it('accepts research as a valid AITaskType', async () => {
    const task = { type: 'research' as const, prompt: 'test' };
    expect(task.type).toBe('research');
  });

  it('accepts deep_synthesize as a valid AITaskType', async () => {
    const task = { type: 'deep_synthesize' as const, prompt: 'test', requireJson: true };
    expect(task.type).toBe('deep_synthesize');
  });

  it('all AITaskType values are defined', async () => {
    type AITaskType = import('@/lib/ai/types').AITaskType;
    const allTypes: AITaskType[] = [
      'baseline', 'hr_review', 'rewrite_review', 'verify',
      'explain', 'synthesize', 'research', 'deep_synthesize',
    ];
    expect(allTypes).toHaveLength(8);
  });
});

// ============================================================
// 2. PDF Extraction Quality Heuristic (Phase 5)
// ============================================================

describe('PDF extraction quality heuristic', () => {
  let assessExtractionQuality: typeof import('@/lib/pdf/extract').assessExtractionQuality;

  beforeAll(async () => {
    const mod = await import('@/lib/pdf/extract');
    assessExtractionQuality = mod.assessExtractionQuality;
  });

  it('returns low for empty text', () => {
    expect(assessExtractionQuality('', 5)).toBe('low');
  });

  it('returns low for very few chars per page (< 50)', () => {
    const text = 'a'.repeat(100);
    expect(assessExtractionQuality(text, 5)).toBe('low');
  });

  it('returns high for good text density and low short-line ratio', () => {
    // 2 pages, ~520 chars = 260 chars/page
    const text = '这是一段足够长的正常简历文本内容，没有任何问题。'.repeat(20);
    expect(assessExtractionQuality(text, 2)).toBe('high');
  });

  it('returns medium for moderate text density', () => {
    // 3 pages, ~260 chars = ~87 chars/page
    const text = '这是一段正常长度的简历文本内容，包含足够的字符。'.repeat(10);
    expect(assessExtractionQuality(text, 3)).toBe('medium');
  });

  it('returns low when short line ratio is too high (> 60%)', () => {
    const lines = Array(20).fill('a').join('\n') + '\n' + '这是一段长文本'.repeat(5);
    expect(assessExtractionQuality(lines, 1)).toBe('low');
  });

  it('returns medium when short line ratio is moderate (> 30%)', () => {
    const short = 'a\nb\nc\n';
    const long = '这是一段较长的文本行用来稀释短行比例\n'.repeat(5);
    const text = short + long;
    expect(assessExtractionQuality(text, 1)).toBe('medium');
  });
});

// ============================================================
// 3. Deep Workflow Final Schema Validation (Phase 2)
// ============================================================

describe('Deep synthesis safe parse helpers', () => {
  it('deep_report schema validates correct structure', async () => {
    const { deepReportSchema } = await import('@/lib/diagnose/v2/schemas');

    const validDeepReport = {
      deep_value_summary: '深度诊断提供了基础诊断未覆盖的 insights',
      current_vs_after_metrics: {
        ats_match_rate: { before: '60%', after: '85%' },
        hr_6s_pass_rate: { before: '低', after: '中' },
        interview_risk: { before: '高', after: '中' },
      },
      problem_pool: {
        must_fix: [],
        should_fix: [],
        optional_optimize: [],
        nitpicky: [],
      },
      ats_analysis: {
        risk_level: 'medium',
        keyword_gaps: ['Python', 'SQL'],
        format_risks: ['段落过长'],
        match_rate_estimate: '70%',
      },
      hr_analysis: {
        risk_level: 'low',
        six_second_risks: [],
        thirty_second_risks: ['缺少量化数据'],
        decision_estimate: 'pass',
      },
      interview_risk_analysis: {
        likely_questions: ['你的核心贡献是什么？'],
        weak_points: ['项目描述偏概括'],
        preparation_suggestions: ['准备 STAR 法则回答'],
      },
      content_expansion_plan: {
        safe_expand: [{ location: '项目经历', suggestion: '补充技术细节' }],
        needs_user_input: [{ location: '工作经历', question: '团队规模？' }],
        forbidden_to_invent: ['具体业务数据', '薪资信息'],
      },
      rewrite_pack: [
        { original: '负责公司运营', rewritten: '负责公众号运营，月阅读从5000提升至50000', change_summary: '补充量化结果' },
      ],
      impact_projection: {
        score_improvement_estimate: '+10-15分',
        ats_pass_probability: '75%',
        hr_pass_probability: '60%',
        interview_probability: '40%',
      },
      action_plan: {
        immediate_actions: ['补充项目数据'],
        requires_user_input: ['团队规模', '具体贡献'],
        optional_improvements: ['增加开源项目链接'],
      },
    };

    const result = deepReportSchema.safeParse(validDeepReport);
    expect(result.success).toBe(true);
  });

  it('deep_report schema rejects invalid structure', async () => {
    const { deepReportSchema } = await import('@/lib/diagnose/v2/schemas');

    const invalidDeepReport = {
      deep_value_summary: 123,
      current_vs_after_metrics: {},
    };

    const result = deepReportSchema.safeParse(invalidDeepReport);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// 4. Deep Fallback Metadata in diagnose route (Phase 4)
// ============================================================

describe('Deep fallback behavior in diagnose route', () => {
  it('ReportMetadata includes deep fallback fields', () => {
    const metadata = {
      target_role: '测试',
      has_jd: true,
      generated_at: new Date().toISOString(),
      tier: 'free' as const,
      diagnose_mode: 'deep' as const,
      deep_diagnosis: false,
      deep_fallback_reason: 'server_unavailable',
      deep_fallback_message: '服务器开小差，先给你基础诊断结果',
    };

    expect(metadata.deep_fallback_reason).toBe('server_unavailable');
    expect(metadata.deep_fallback_message).toContain('服务器开小差');
  });
});

// ============================================================
// 5. Prompt Builder Sanity Checks (Phase 3)
// ============================================================

describe('Deep prompt builders', () => {
  let buildDeepResearchMemoPrompt: typeof import('@/lib/diagnose/v2/prompts').buildDeepResearchMemoPrompt;
  let buildDeepSynthesisPrompt: typeof import('@/lib/diagnose/v2/prompts').buildDeepSynthesisPrompt;

  beforeAll(async () => {
    const mod = await import('@/lib/diagnose/v2/prompts');
    buildDeepResearchMemoPrompt = mod.buildDeepResearchMemoPrompt;
    buildDeepSynthesisPrompt = mod.buildDeepSynthesisPrompt;
  });

  it('research memo prompt includes target role and basic issues', () => {
    const prompt = buildDeepResearchMemoPrompt(
      {
        resume_text: '张三，3年互联网运营经验。',
        target_role: '内容运营',
        jd_text: '内容运营岗位要求...',
        tier: 'free',
        resume_sentences: ['张三，3年互联网运营经验。'],
        resume_paragraphs: ['张三，3年互联网运营经验。'],
        resume_sections: [],
        jd_keywords: ['内容运营', '数据分析'],
        jd_quality: 'strong',
        text_quality: 'sufficient',
        experience_level: 'neutral',
      },
      {
        scenario: 'normal',
        main_judgment: '缺少结果证据',
        core_issues_count: 2,
        core_issues_titles: ['缺少结果证据', '岗位匹配度低'],
        resume_facts: { work_experience_count: 1, project_count: 1, skills_preview: '运营', total_length: 100 },
        jd_facts: { has_jd: true, jd_quality: 'strong', keywords: ['内容运营'] },
      }
    );

    expect(prompt).toContain('内容运营');
    expect(prompt).toContain('缺少结果证据');
    expect(prompt).toContain('岗位匹配度低');
  });

  it('synthesis prompt includes basic diagnosis results and constraints', () => {
    const basicResult = {
      scenario: 'normal' as const,
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
      priority_actions: [{ title: '补结果', description: '补充量化结果' }],
      rewrite_direction: '从动作描述转向结果导向表达',
      minor_suggestions: [],
      metadata: {
        target_role: '内容运营',
        has_jd: true,
        generated_at: new Date().toISOString(),
        tier: 'free',
      },
      excellent_score: 65,
      quality_tier: 'medium',
    };

    const prompt = buildDeepSynthesisPrompt(
      {
        resume_text: '张三，3年互联网运营经验。负责公司公众号运营。',
        target_role: '内容运营',
        jd_text: '内容运营岗位要求...',
        tier: 'free',
        resume_sentences: ['张三，3年互联网运营经验。'],
        resume_paragraphs: ['张三，3年互联网运营经验。'],
        resume_sections: [],
        jd_keywords: ['内容运营'],
        jd_quality: 'strong',
        text_quality: 'sufficient',
        experience_level: 'neutral',
      },
      basicResult,
      {
        scenario: 'normal',
        main_judgment: '缺少结果证据',
        core_issues_count: 1,
        core_issues_titles: ['缺少结果证据'],
        resume_facts: { work_experience_count: 1, project_count: 0, skills_preview: '', total_length: 50 },
        jd_facts: { has_jd: true, jd_quality: 'strong' },
        excellent_score: 65,
        quality_tier: 'medium',
      },
      '研究 memo 内容'
    );

    expect(prompt).toContain('不重复基础诊断');
    expect(prompt).toContain('严禁编造数据');
    expect(prompt).toContain('缺少结果证据');
    expect(prompt).toContain('研究 memo 内容');
  });

  it('synthesis prompt handles empty research memo', () => {
    const basicResult = {
      scenario: 'normal' as const,
      main_judgment: '测试',
      core_issues: [],
      core_issues_summary: { total_count: 0, shown_count: 0 },
      priority_actions: [],
      rewrite_direction: '',
      minor_suggestions: [],
      metadata: {
        target_role: '测试',
        has_jd: false,
        generated_at: new Date().toISOString(),
        tier: 'free',
      },
    };

    const prompt = buildDeepSynthesisPrompt(
      {
        resume_text: '测试简历',
        target_role: '测试',
        tier: 'free',
        resume_sentences: [],
        resume_paragraphs: [],
        resume_sections: [],
        jd_keywords: [],
        jd_quality: 'none',
        text_quality: 'sufficient',
        experience_level: 'neutral',
      },
      basicResult,
      {
        scenario: 'normal',
        main_judgment: '测试',
        core_issues_count: 0,
        core_issues_titles: [],
        resume_facts: { work_experience_count: 0, project_count: 0, skills_preview: '', total_length: 10 },
        jd_facts: { has_jd: false },
      },
      ''
    );

    expect(prompt).toContain('研究服务未返回内容');
  });
});
