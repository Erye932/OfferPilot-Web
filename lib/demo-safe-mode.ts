import type {
  DiagnoseReport,
  V4Comment,
  V4Dimension,
  V4MatrixCell,
  V4SectionGrade,
  V4ScoreBreakdown,
} from '@/lib/diagnose/types';

interface DemoSafeInput {
  resume_text: string;
  resume_paragraphs?: string[];
  target_role: string;
  jd_text?: string;
}

const DEMO_REPORT_PREFIX = 'demo-safe-report';
const DEMO_TASK_PREFIX = 'demo-safe-task';
const DIMENSIONS: V4Dimension[] = ['structure', 'expression', 'evidence', 'role_fit', 'credibility', 'missing_info'];

const scoreBreakdown: V4ScoreBreakdown = {
  structure: { score: 74, weight: 0.15 },
  expression: { score: 70, weight: 0.15 },
  evidence: { score: 58, weight: 0.3 },
  role_fit: { score: 63, weight: 0.2 },
  credibility: { score: 76, weight: 0.1 },
  missing_info: { score: 60, weight: 0.1 },
  overall: 66,
};

export function isDemoSafeModeEnabled() {
  return process.env.DEMO_SAFE_MODE === 'true';
}

export function createDemoSafeTaskId() {
  return `${DEMO_TASK_PREFIX}-${Date.now()}`;
}

export function createDemoSafeReportId(taskId?: string) {
  const suffix = taskId?.replace(`${DEMO_TASK_PREFIX}-`, '') || String(Date.now());
  return `${DEMO_REPORT_PREFIX}-${suffix}`;
}

export function isDemoSafeTaskId(id: string) {
  return id.startsWith(`${DEMO_TASK_PREFIX}-`);
}

export function isDemoSafeReportId(id: string) {
  return id.startsWith(`${DEMO_REPORT_PREFIX}-`);
}

function firstMeaningfulLine(input: DemoSafeInput) {
  const paragraphs = input.resume_paragraphs?.filter((item) => item.trim()) ?? [];
  const source = paragraphs[0] || input.resume_text;
  return source.split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 80) || '简历核心经历描述';
}

function makeComment(input: DemoSafeInput, override: Partial<V4Comment> & Pick<V4Comment, 'id' | 'dimension' | 'title'>): V4Comment {
  const evidence = firstMeaningfulLine(input);
  return {
    id: override.id,
    section: override.section ?? 'project',
    section_label: override.section_label ?? '核心项目 / 实习经历',
    dimension: override.dimension,
    status: override.status ?? 'problem',
    severity: override.severity ?? 'must_fix',
    title: override.title,
    one_liner: override.one_liner ?? '当前表达还停留在职责描述，缺少能支撑筛选通过的证据。',
    why_it_hurts: override.why_it_hurts ?? 'HR 和企业导师会优先寻找岗位相关能力、任务难度和结果证据。如果只写做过什么，很难判断你是否能胜任目标岗位。',
    impact_on: override.impact_on ?? ['hr_6s', 'hr_30s', 'interview'],
    fix_type: override.fix_type ?? 'safe_expand',
    evidence_quote: override.evidence_quote ?? evidence,
    evidence_location: override.evidence_location ?? { paragraph_index: 0, text_snippet: evidence },
    rewrite: override.rewrite ?? {
      before: evidence,
      after: `围绕${input.target_role}补充任务背景、个人动作、技术/方法和量化结果，例如“负责核心模块，使用 X 方法将 Y 指标提升 Z%”。`,
      what_changed: '补齐岗位能力、个人贡献和结果证据',
    },
    insider_view: override.insider_view ?? '面试官不是只看关键词，而是看关键词背后有没有真实项目证据。',
    source: override.source ?? 'cross',
    credibility_concern: override.credibility_concern,
  };
}

function makeComments(input: DemoSafeInput) {
  const comments = [
    makeComment(input, {
      id: 'demo-safe-evidence-1',
      dimension: 'evidence',
      title: '项目经历缺少量化结果',
    }),
    makeComment(input, {
      id: 'demo-safe-role-fit-1',
      dimension: 'role_fit',
      title: `与${input.target_role}的能力映射不够直接`,
      severity: 'should_fix',
      status: 'warn',
      one_liner: '目标岗位关键词有出现空间，但还没有形成“岗位要求 → 经历证据”的闭环。',
      impact_on: ['ats', 'hr_30s'],
      fix_type: 'needs_user_input',
    }),
    makeComment(input, {
      id: 'demo-safe-expression-1',
      dimension: 'expression',
      title: '表达偏泛，动作动词不够具体',
      severity: 'should_fix',
      status: 'warn',
      one_liner: '建议减少“参与、负责、协助”等弱动作，改成更可验证的执行动作。',
      impact_on: ['hr_6s', 'interview'],
    }),
    makeComment(input, {
      id: 'demo-safe-missing-1',
      dimension: 'missing_info',
      title: '缺少项目规模、数据口径或协作边界',
      severity: 'optional',
      status: 'missing',
      one_liner: '如果能补充团队规模、用户量、数据量、上线结果，会显著提升可信度。',
      fix_type: 'needs_user_input',
      impact_on: ['interview'],
    }),
  ];

  return comments;
}

function groupByDimension(comments: V4Comment[]) {
  return DIMENSIONS.reduce<Record<V4Dimension, V4Comment[]>>((acc, dimension) => {
    acc[dimension] = comments.filter((comment) => comment.dimension === dimension);
    return acc;
  }, {
    structure: [],
    expression: [],
    evidence: [],
    role_fit: [],
    credibility: [],
    missing_info: [],
  });
}

function makeMatrix(comments: V4Comment[]) {
  const sections: V4SectionGrade[] = [
    {
      section: 'project',
      section_label: '核心项目 / 实习经历',
      status: 'problem',
      comment_count: comments.length,
      worst_severity: 'must_fix',
    },
    {
      section: 'skill',
      section_label: '技能与岗位关键词',
      status: 'warn',
      comment_count: 1,
      worst_severity: 'should_fix',
    },
  ];

  const cells: V4MatrixCell[] = sections.flatMap((section) => DIMENSIONS.map((dimension) => {
    const count = comments.filter((comment) => comment.section === section.section && comment.dimension === dimension).length;
    const isEvidence = dimension === 'evidence' && section.section === 'project';
    const isRoleFit = dimension === 'role_fit';
    const isMissing = dimension === 'missing_info' && section.section === 'project';

    return {
      section: section.section,
      section_label: section.section_label,
      dimension,
      status: isEvidence ? 'problem' : isRoleFit || isMissing ? 'warn' : 'ok',
      comment_count: count,
      worst_severity: isEvidence ? 'must_fix' : count > 0 ? 'should_fix' : null,
      summary: isEvidence
        ? '需要补充量化结果和个人贡献，形成可验证证据链。'
        : isRoleFit
          ? '建议把经历中的技术、业务和协作证据对齐目标岗位。'
          : isMissing
            ? '建议补充项目规模、数据口径和协作边界。'
            : '该维度暂未发现明显阻塞项。',
    };
  }));

  return { sections, dimensions: DIMENSIONS, cells };
}

export function createDemoSafeDiagnoseReport(input: DemoSafeInput): DiagnoseReport {
  const comments = makeComments(input);
  const commentsByDimension = groupByDimension(comments);
  const hasJd = Boolean(input.jd_text?.trim());

  return {
    scenario: 'normal',
    overall_score: 66,
    overall_grade: 'medium',
    total_assessment: `这是一份比赛安全模式下生成的稳定诊断报告。针对${input.target_role}，当前简历具备基础经历，但证据颗粒度、岗位映射和结果表达仍需要加强。建议优先补齐量化结果、个人贡献和 JD 关键词映射。`,
    score_breakdown: scoreBreakdown,
    matrix: makeMatrix(comments),
    comments_by_dimension: commentsByDimension,
    cross_section_summary: {
      must_fix_top: comments.filter((comment) => comment.severity === 'must_fix'),
      rewrite_examples: comments.filter((comment) => Boolean(comment.rewrite)).slice(0, 3),
      jd_keyword_matrix: hasJd ? {
        must_have: [
          { keyword: input.target_role, covered: true, section_hits: ['project'] },
          { keyword: '量化结果', covered: false, section_hits: [] },
        ],
        nice_to_have: [
          { keyword: '团队协作', covered: true, section_hits: ['project'] },
        ],
        missing_critical: ['量化结果'],
        coverage_rate: 0.5,
      } : undefined,
      credibility_flags: [
        {
          type: 'vague_role',
          description: '部分经历中的个人职责边界不够清晰，建议说明自己具体负责的模块或动作。',
          evidence: firstMeaningfulLine(input),
          severity: 'medium',
          source_location: { paragraph_index: 0, text_snippet: firstMeaningfulLine(input) },
          question_for_candidate: '这段经历中你本人独立负责了哪些部分？有没有可验证的数据结果？',
        },
      ],
      risks: {
        ats_risk: { level: 'medium', reasons: ['岗位关键词覆盖不完整', '核心能力与目标岗位的映射需要更直接'] },
        hr_risk: { level: 'medium', reasons: ['前 6 秒能看到经历，但结果证据不足'] },
        interview_risk: { level: 'medium', reasons: ['项目细节和个人贡献边界需要准备追问答案'] },
      },
    },
    before_after: {
      overall_score: { before: 66, after: 78 },
      hr_6s_pass: { before: '可能进入待定', after: '更容易进入初筛' },
      ats_match: { before: '58%', after: '76%' },
      interview_risk: { before: 'medium', after: 'low' },
      improvement_summary: '补齐量化结果、岗位关键词和个人贡献后，简历会从“有经历”提升为“能证明胜任”。',
    },
    metadata: {
      target_role: input.target_role,
      has_jd: hasJd,
      generated_at: new Date().toISOString(),
      schema_version: '4.0',
      workflow_steps: ['demo_safe_mode', 'local_rule_report'],
      workflow_duration_ms: 50,
      cache_hit: false,
      research_providers: {
        role_study: 'demo-safe-local',
        hr_insider: 'demo-safe-local',
        fallback_used: true,
      },
    },
    research_context: {
      mode: 'demo_safe',
      reason: 'DEMO_SAFE_MODE=true',
    },
  };
}
