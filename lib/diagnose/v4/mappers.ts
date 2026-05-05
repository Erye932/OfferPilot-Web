/**
 * V4 工作流 — 输出映射器
 *
 * 职责：把 6 个 step 的输出 + MissingInfoProbe 结果，合成统一的 DiagnoseReport
 *
 * 数据流向：
 *   SynthesizedComment[] (来自 final_synthesis) ─┐
 *   V4Comment[] (来自 missing-info-probe)        ┴─→ V4Comment[] all
 *   ↓
 *   - generateMatrix → MatrixCell[] + SectionGrade[]
 *   - groupByDimension → Record<dim, V4Comment[]>
 *   - buildCrossSectionSummary → must_fix_top, rewrite_examples, jd_matrix, risks, flags
 *   - computeScoreBreakdown → 6 维度加权 + 总分
 *   - buildBeforeAfter → 改前改后
 *   ↓
 *   DiagnoseReport
 */

import type {
  NormalizedInput,
  V4Comment,
  V4MatrixCell,
  V4SectionGrade,
  V4Dimension,
  V4ScoreBreakdown,
  V4BeforeAfterMetrics,
  V4CredibilityFlag,
  V4JdKeywordCoverage,
  V4CrossSectionSummary,
  CellStatus,
  Severity,
  ResumeSectionType,
  DiagnoseReport,
  DiagnoseScenario,
} from '../types';
import {
  V4_DIMENSIONS,
  V4_DEFAULT_WEIGHTS,
  SECTION_LABELS,
} from '../types';
import type {
  BaseAnalyzerOutput,
  FinalSynthesisOutput,
  SynthesizedComment,
  CredibilityCheckOutput,
  JdKeywordCoverageOutput,
  SelfCritiqueOutput,
  HrSimulatorOutput,
  ResearchContext,
} from './schemas';

// ════════════════════════════════════════════════════════════════
// 严重度 / 状态比较器
// ════════════════════════════════════════════════════════════════

const SEVERITY_RANK: Record<Severity, number> = {
  must_fix: 4,
  should_fix: 3,
  optional: 2,
  nitpicky: 1,
};

const STATUS_RANK: Record<CellStatus, number> = {
  missing: 4,
  problem: 3,
  warn: 2,
  ok: 1,
};

function worseSeverity(a: Severity | null, b: Severity | null): Severity | null {
  if (!a) return b;
  if (!b) return a;
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function worseStatus(a: CellStatus, b: CellStatus): CellStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

// ════════════════════════════════════════════════════════════════
// 1. AI 合成 comment → V4Comment（加 ID）
// ════════════════════════════════════════════════════════════════

export function aiCommentsToV4(
  synthesized: SynthesizedComment[]
): V4Comment[] {
  return synthesized.map((c, idx) => {
    // 内部 null → undefined
    const loc = c.evidence_location
      ? {
          paragraph_index: c.evidence_location.paragraph_index ?? undefined,
          sentence_index: c.evidence_location.sentence_index ?? undefined,
          text_snippet: c.evidence_location.text_snippet ?? undefined,
        }
      : undefined;

    return {
      id: `ai_${(c.source ?? 'syn')}_${idx.toString().padStart(3, '0')}`,
      section: c.section,
      section_label: c.section_label,
      dimension: c.dimension,
      status: c.status,
      severity: c.severity,
      title: c.title,
      one_liner: c.one_liner,
      why_it_hurts: c.why_it_hurts,
      impact_on: c.impact_on,
      fix_type: c.fix_type,
      evidence_quote: c.evidence_quote,
      evidence_location: loc,
      rewrite: c.rewrite ?? null,
      insider_view: c.insider_view,
      source: c.source,
      credibility_concern: c.credibility_concern,
    };
  });
}

// ════════════════════════════════════════════════════════════════
// 2. 矩阵生成（段落 × 维度）
// ════════════════════════════════════════════════════════════════

/**
 * 收集报告中实际出现的段落
 * 优先使用 normalized.resume_sections 顺序
 */
function collectActiveSections(
  input: NormalizedInput,
  comments: V4Comment[]
): Array<{ section: ResumeSectionType; section_label: string }> {
  // 用 Map 保持插入顺序
  const map = new Map<string, { section: ResumeSectionType; section_label: string }>();

  // 先按 normalize 识别的段落顺序
  for (const s of input.resume_sections) {
    const baseLabel = SECTION_LABELS[s.type] ?? s.type;
    const label = s.title && s.title.length < 40 && s.title !== baseLabel ? `${baseLabel} · ${s.title}` : baseLabel;
    const key = `${s.type}|${label}`;
    if (!map.has(key)) map.set(key, { section: s.type, section_label: label });
  }

  // 再补 comments 中出现但 normalize 没识别的段落
  for (const c of comments) {
    const key = `${c.section}|${c.section_label}`;
    if (!map.has(key)) map.set(key, { section: c.section, section_label: c.section_label });
  }

  return Array.from(map.values());
}

/**
 * 生成 matrix.cells + sections
 */
export function generateMatrix(
  input: NormalizedInput,
  comments: V4Comment[]
): { cells: V4MatrixCell[]; sections: V4SectionGrade[] } {
  const activeSections = collectActiveSections(input, comments);
  const cells: V4MatrixCell[] = [];
  const sectionGrades: V4SectionGrade[] = [];

  for (const { section, section_label } of activeSections) {
    let sectionWorstStatus: CellStatus = 'ok';
    let sectionWorstSeverity: Severity | null = null;
    let sectionTotalCount = 0;

    for (const dim of V4_DIMENSIONS) {
      // 找出 (section, dim) 的所有 comments
      const cellComments = comments.filter(
        (c) => c.section === section && c.section_label === section_label && c.dimension === dim
      );

      let cellStatus: CellStatus = 'ok';
      let cellWorstSev: Severity | null = null;
      let summary = '';

      if (cellComments.length > 0) {
        for (const c of cellComments) {
          cellStatus = worseStatus(cellStatus, c.status);
          cellWorstSev = worseSeverity(cellWorstSev, c.severity);
        }
        // 取最严重的一条作为 summary
        const top = cellComments.reduce((acc, cur) =>
          (acc && SEVERITY_RANK[acc.severity] >= SEVERITY_RANK[cur.severity]) ? acc : cur
        );
        summary = top.one_liner || top.title;
      } else {
        summary = '未发现明显问题';
      }

      cells.push({
        section,
        section_label,
        dimension: dim,
        status: cellStatus,
        comment_count: cellComments.length,
        worst_severity: cellWorstSev,
        summary,
      });

      sectionWorstStatus = worseStatus(sectionWorstStatus, cellStatus);
      sectionWorstSeverity = worseSeverity(sectionWorstSeverity, cellWorstSev);
      sectionTotalCount += cellComments.length;
    }

    sectionGrades.push({
      section,
      section_label,
      status: sectionWorstStatus,
      comment_count: sectionTotalCount,
      worst_severity: sectionWorstSeverity,
    });
  }

  return { cells, sections: sectionGrades };
}

// ════════════════════════════════════════════════════════════════
// 3. 按维度分组 comments
// ════════════════════════════════════════════════════════════════

export function groupByDimension(comments: V4Comment[]): Record<V4Dimension, V4Comment[]> {
  const out: Record<V4Dimension, V4Comment[]> = {
    structure: [],
    expression: [],
    evidence: [],
    role_fit: [],
    credibility: [],
    missing_info: [],
  };
  for (const c of comments) {
    out[c.dimension].push(c);
  }
  // 每个维度内按严重度降序
  for (const dim of V4_DIMENSIONS) {
    out[dim].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  }
  return out;
}

// ════════════════════════════════════════════════════════════════
// 4. 跨段汇总
// ════════════════════════════════════════════════════════════════

export function pickMustFixTop(comments: V4Comment[], topN = 10): V4Comment[] {
  const mustFix = comments.filter((c) => c.severity === 'must_fix');
  // 优先 dimension=evidence/role_fit，其次按 missing/problem
  return mustFix
    .sort((a, b) => {
      // 按 status 优先级（missing > problem > warn）
      const sa = STATUS_RANK[a.status];
      const sb = STATUS_RANK[b.status];
      if (sa !== sb) return sb - sa;
      // 按 dimension 优先级（evidence/role_fit 更紧迫）
      const dimWeight = (d: V4Dimension) =>
        d === 'evidence' || d === 'role_fit' ? 1 : 0;
      return dimWeight(b.dimension) - dimWeight(a.dimension);
    })
    .slice(0, topN);
}

export function pickRewriteExamples(comments: V4Comment[]): V4Comment[] {
  return comments.filter((c) => c.rewrite !== null && c.rewrite !== undefined);
}

export function buildCredibilityFlags(
  cred: CredibilityCheckOutput
): V4CredibilityFlag[] {
  return cred.flags.map((f) => ({
    type: f.type,
    description: f.description,
    evidence: f.evidence_quote,
    severity: f.severity,
    source_location: undefined,
    question_for_candidate: f.question_for_candidate,
  }));
}

export function buildJdMatrix(
  cov: JdKeywordCoverageOutput | null
): V4JdKeywordCoverage | undefined {
  if (!cov) return undefined;
  return {
    must_have: cov.must_have,
    nice_to_have: cov.nice_to_have,
    missing_critical: cov.missing_critical,
    coverage_rate: cov.coverage_rate,
  };
}

export function buildCrossSectionSummary(
  comments: V4Comment[],
  cred: CredibilityCheckOutput,
  jdCov: JdKeywordCoverageOutput | null,
  finalRisks: FinalSynthesisOutput['risks']
): V4CrossSectionSummary {
  return {
    must_fix_top: pickMustFixTop(comments, 10),
    rewrite_examples: pickRewriteExamples(comments).slice(0, 12),
    jd_keyword_matrix: buildJdMatrix(jdCov),
    credibility_flags: buildCredibilityFlags(cred),
    risks: finalRisks,
  };
}

// ════════════════════════════════════════════════════════════════
// 5. ScoreBreakdown — 6 维度加权
// ════════════════════════════════════════════════════════════════

export function computeScoreBreakdown(
  base: BaseAnalyzerOutput
): V4ScoreBreakdown {
  const w = V4_DEFAULT_WEIGHTS;
  const s = base.dimension_scores;

  const overall = Math.round(
    s.structure * w.structure +
    s.expression * w.expression +
    s.evidence * w.evidence +
    s.role_fit * w.role_fit +
    s.credibility * w.credibility +
    s.missing_info * w.missing_info
  );

  return {
    structure:    { score: s.structure,    weight: w.structure },
    expression:   { score: s.expression,   weight: w.expression },
    evidence:     { score: s.evidence,     weight: w.evidence },
    role_fit:     { score: s.role_fit,     weight: w.role_fit },
    credibility:  { score: s.credibility,  weight: w.credibility },
    missing_info: { score: s.missing_info, weight: w.missing_info },
    overall,
  };
}

// ════════════════════════════════════════════════════════════════
// 6. BeforeAfter
// ════════════════════════════════════════════════════════════════

export function buildBeforeAfter(
  base: BaseAnalyzerOutput,
  hr: HrSimulatorOutput,
  selfCritique: SelfCritiqueOutput,
  scoreBreakdown: V4ScoreBreakdown
): V4BeforeAfterMetrics {
  return {
    overall_score: {
      before: scoreBreakdown.overall,
      after: selfCritique.after_metrics.overall_score,
    },
    hr_6s_pass: {
      before: hr.six_second.decision === 'continue_reading'
        ? '可能停留'
        : hr.six_second.decision === 'skip_likely' ? '可能跳过' : '会跳过',
      after: selfCritique.after_metrics.hr_6s_pass,
    },
    ats_match: {
      before: '原版未单独估算',
      after: selfCritique.after_metrics.ats_match,
    },
    interview_risk: {
      before: hr.overall_hr_risk,
      after: selfCritique.after_metrics.interview_risk,
    },
    improvement_summary: selfCritique.improvement_summary,
  };
}

// ════════════════════════════════════════════════════════════════
// 7. 总装：合成 DiagnoseReport
// ════════════════════════════════════════════════════════════════

export interface AssembleArgs {
  input: NormalizedInput;
  base: BaseAnalyzerOutput;
  hr: HrSimulatorOutput;
  credibility: CredibilityCheckOutput;
  jdCoverage: JdKeywordCoverageOutput | null;
  selfCritique: SelfCritiqueOutput;
  finalSynthesis: FinalSynthesisOutput;
  ruleBasedComments: V4Comment[];
  workflowSteps: string[];
  workflowDurationMs: number;
  /** 研究阶段产出（R2 + R3 + R5），可选 */
  research?: ResearchContext;
}

export function assembleDiagnoseReport(args: AssembleArgs): DiagnoseReport {
  const {
    input,
    base,
    hr,
    credibility,
    jdCoverage,
    selfCritique,
    finalSynthesis,
    ruleBasedComments,
    workflowSteps,
    workflowDurationMs,
    research,
  } = args;

  // 1. 合并 AI 合成的 comments + 规则探针的 missing_info comments
  const aiComments = aiCommentsToV4(finalSynthesis.comments);
  const allComments = [...ruleBasedComments, ...aiComments];

  // 2. 矩阵
  const { cells, sections } = generateMatrix(input, allComments);

  // 3. 按维度分组
  const commentsByDim = groupByDimension(allComments);

  // 4. score breakdown
  const scoreBreakdown = computeScoreBreakdown(base);

  // 5. cross section summary
  const crossSummary = buildCrossSectionSummary(
    allComments,
    credibility,
    jdCoverage,
    finalSynthesis.risks
  );

  // 6. before/after
  const beforeAfter = buildBeforeAfter(base, hr, selfCritique, scoreBreakdown);

  // 7. scenario - 优先使用 final_synthesis 给的，否则规则推断
  const scenario: DiagnoseScenario =
    finalSynthesis.scenario ??
    (input.text_quality === 'insufficient' ? 'insufficient_input' : 'normal');

  return {
    scenario,
    overall_score: scoreBreakdown.overall,
    overall_grade: base.overall_grade,
    total_assessment: finalSynthesis.total_assessment,
    score_breakdown: scoreBreakdown,
    matrix: {
      sections,
      dimensions: V4_DIMENSIONS,
      cells,
    },
    comments_by_dimension: commentsByDim,
    cross_section_summary: crossSummary,
    before_after: beforeAfter,
    metadata: {
      target_role: input.target_role,
      has_jd: input.jd_text.length > 0,
      generated_at: new Date().toISOString(),
      schema_version: '4.0',
      workflow_steps: workflowSteps,
      workflow_duration_ms: workflowDurationMs,
      cache_hit: false,
      role_resolution: input.role_resolution,
      research_providers: research ? {
        role_study: research.role_study.meta.research_provider || 'unknown',
        hr_insider: research.hr_insider.meta.research_provider || 'unknown',
        fallback_used: !!(research.role_study.meta.fallback_used || research.hr_insider.meta.fallback_used),
      } : undefined,
    },
    research_context: research,
  };
}
