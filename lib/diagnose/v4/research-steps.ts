/**
 * V4 Research Phase — R2/R3/R5 step runners
 *
 * R2 RoleStudy / R3 HrInsider:
 *   - 缓存查询（按 target_role）
 *   - 未命中 → Metaso 调研（自由文本，返回网页 snippet 拼接）
 *   - DeepSeek 蒸馏成结构化备忘
 *   - 写缓存
 *   - 返回结构化输出
 *
 * R5 ResumeStudy:
 *   - 不缓存（依赖具体简历）
 *   - 吃 R2/R3 当参考系
 *   - DeepSeek 一次研究员通读
 */

import type { NormalizedInput } from '../types';
import { aiRouter } from '../../ai/router';
import { logInfo, logError, logWarn } from '../../error-handler';
import { safeParseJson } from './utils';
import {
  roleStudyOutputSchema,
  hrInsiderOutputSchema,
  resumeStudyOutputSchema,
  type RoleStudyOutput,
  type HrInsiderOutput,
  type ResumeStudyOutput,
} from './schemas';
import {
  buildRoleStudyQueryPrompt,
  buildRoleStudyDistillPrompt,
  buildHrInsiderQueryPrompt,
  buildHrInsiderDistillPrompt,
  buildResumeStudyPrompt,
} from './prompts';
import {
  getCachedRoleStudy,
  setCachedRoleStudy,
  getCachedHrInsider,
  setCachedHrInsider,
} from './research-cache';

// ════════════════════════════════════════════════════════════════
// R2: RoleStudy（岗位深度研究）
// ════════════════════════════════════════════════════════════════

/**
 * 跑 R2 RoleStudy：缓存优先 → Metaso 调研 → DeepSeek 蒸馏
 *
 * 失败时返回兜底产物（不让整个工作流挂掉），但缓存策略：
 * - 兜底产物**不写缓存**（让下次重试有机会拿到真研究）
 */
export async function runRoleStudy(input: NormalizedInput): Promise<RoleStudyOutput> {
  const role = input.target_role;
  if (!role || role.trim().length === 0) {
    logWarn('V4.RoleStudy', 'target_role 为空，返回空研究');
    return buildEmptyRoleStudy('target_role 为空');
  }

  // 1. 缓存查询
  const cached = await getCachedRoleStudy(role);
  if (cached) {
    logInfo('V4.RoleStudy', '缓存命中，直接返回', { target_role: role });
    return cached;
  }

  logInfo('V4.RoleStudy', 'start', { target_role: role });

  try {
    // 2. Metaso 调研
    const metasoQueryPrompt = buildRoleStudyQueryPrompt(input);
    const rawResearch = await aiRouter.route({
      type: 'research',
      prompt: metasoQueryPrompt,
      requireJson: false,
    });

    const rawMaterial = rawResearch.content || '';
    if (!rawMaterial || rawMaterial.trim().length < 100) {
      logWarn('V4.RoleStudy', 'Metaso 返回内容过少，跳过蒸馏', {
        content_length: rawMaterial.length,
      });
      return buildEmptyRoleStudy('Metaso 返回内容过少');
    }

    logInfo('V4.RoleStudy', 'Metaso 调研完成', {
      raw_length: rawMaterial.length,
      provider: rawResearch.providerActual,
    });

    // 3. DeepSeek 蒸馏
    const distillPrompt = buildRoleStudyDistillPrompt(input, rawMaterial);
    const distilled = await aiRouter.route({
      type: 'baseline',
      prompt: distillPrompt,
      systemPrompt: '你是行业研究员。严格输出 JSON。',
      temperature: 0.3,
      maxTokens: 2500,
      requireJson: true,
    });

    const result = safeParseJson(distilled.content, roleStudyOutputSchema);

    // 3.5 注入实际调研 provider 信息
    result.meta.research_provider = rawResearch.providerActual || rawResearch.provider;
    result.meta.fallback_used = rawResearch.fallbackUsed || false;

    // 4. 写缓存
    await setCachedRoleStudy(role, result);

    logInfo('V4.RoleStudy', '完成', {
      target_role: role,
      core_caps: result.core_capabilities.length,
      red_flags: result.red_flags.length,
      data_confidence: result.meta.data_confidence,
    });

    return result;
  } catch (e) {
    logError('V4.RoleStudy', e);
    return buildEmptyRoleStudy(e instanceof Error ? e.message : String(e));
  }
}

/**
 * 兜底 RoleStudy：让上层有最小可用结构
 */
function buildEmptyRoleStudy(reason: string): RoleStudyOutput {
  return {
    core_capabilities: [
      {
        name: '岗位核心能力（研究失败）',
        description: '行业研究 step 未能产出，AI 将基于内部知识判断',
        why_it_matters: '研究阶段失败，本字段为兜底',
      },
    ],
    bonus_capabilities: [],
    top_resume_patterns: [],
    red_flags: [],
    industry_jargon: [],
    meta: {
      sources_count: 0,
      data_confidence: 'low' as const,
      notes: `（研究失败：${reason}，AI 将仅依赖自身知识）`,
    },
  };
}

// ════════════════════════════════════════════════════════════════
// R3: HrInsider（HR 视角深度研究）
// ════════════════════════════════════════════════════════════════

export async function runHrInsider(input: NormalizedInput): Promise<HrInsiderOutput> {
  const role = input.target_role;
  if (!role || role.trim().length === 0) {
    return buildEmptyHrInsider('target_role 为空');
  }

  const cached = await getCachedHrInsider(role);
  if (cached) {
    logInfo('V4.HrInsider', '缓存命中，直接返回', { target_role: role });
    return cached;
  }

  logInfo('V4.HrInsider', 'start', { target_role: role });

  try {
    const metasoQueryPrompt = buildHrInsiderQueryPrompt(input);
    const rawResearch = await aiRouter.route({
      type: 'research',
      prompt: metasoQueryPrompt,
      requireJson: false,
    });

    const rawMaterial = rawResearch.content || '';
    if (!rawMaterial || rawMaterial.trim().length < 100) {
      logWarn('V4.HrInsider', 'Metaso 返回内容过少，跳过蒸馏', {
        content_length: rawMaterial.length,
      });
      return buildEmptyHrInsider('Metaso 返回内容过少');
    }

    logInfo('V4.HrInsider', 'Metaso 调研完成', {
      raw_length: rawMaterial.length,
      provider: rawResearch.providerActual,
    });

    const distillPrompt = buildHrInsiderDistillPrompt(input, rawMaterial);
    const distilled = await aiRouter.route({
      type: 'baseline',
      prompt: distillPrompt,
      systemPrompt: '你是招聘行业研究员。严格输出 JSON。',
      temperature: 0.3,
      maxTokens: 2200,
      requireJson: true,
    });

    const result = safeParseJson(distilled.content, hrInsiderOutputSchema);

    // 注入实际调研 provider 信息
    result.meta.research_provider = rawResearch.providerActual || rawResearch.provider;
    result.meta.fallback_used = rawResearch.fallbackUsed || false;

    await setCachedHrInsider(role, result);

    logInfo('V4.HrInsider', '完成', {
      target_role: role,
      six_second_focus: result.six_second_focus.length,
      common_eliminate: result.common_eliminate_reasons.length,
      data_confidence: result.meta.data_confidence,
    });

    return result;
  } catch (e) {
    logError('V4.HrInsider', e);
    return buildEmptyHrInsider(e instanceof Error ? e.message : String(e));
  }
}

function buildEmptyHrInsider(reason: string): HrInsiderOutput {
  return {
    six_second_focus: ['HR 研究失败，AI 将基于内部知识判断'],
    thirty_second_focus: ['HR 研究失败，AI 将基于内部知识判断'],
    preferred_language_patterns: [],
    common_eliminate_reasons: [],
    expectation_baseline: {
      fresh_grad: '（研究失败，使用通用基线：有相关实习 / 项目，能讲清贡献）',
      junior_1_3y: '（研究失败，使用通用基线：能独立完成模块，有量化产出）',
      mid_3_5y: '（研究失败，使用通用基线：能带项目，有完整闭环）',
    },
    meta: {
      sources_count: 0,
      data_confidence: 'low' as const,
      notes: `（研究失败：${reason}）`,
    },
  };
}

// ════════════════════════════════════════════════════════════════
// R5: ResumeStudy（简历深度研究，吃 R2/R3 当参考系）
// ════════════════════════════════════════════════════════════════

export async function runResumeStudy(
  input: NormalizedInput,
  roleStudy: RoleStudyOutput,
  hrInsider: HrInsiderOutput
): Promise<ResumeStudyOutput> {
  logInfo('V4.ResumeStudy', 'start');

  try {
    const prompt = buildResumeStudyPrompt(input, roleStudy, hrInsider);
    const response = await aiRouter.route({
      type: 'baseline',
      prompt,
      systemPrompt: '你是简历研究员（不是诊断者）。严格输出 JSON。',
      temperature: 0.4,
      maxTokens: 2200,
      requireJson: true,
    });

    const result = safeParseJson(response.content, resumeStudyOutputSchema);

    logInfo('V4.ResumeStudy', '完成', {
      seniority_tier: result.candidate_profile.seniority_tier,
      internal_signals: result.internal_signals.length,
      obvious_gaps: result.role_match_initial.obvious_gaps.length,
    });

    return result;
  } catch (e) {
    logError('V4.ResumeStudy', e);
    return buildEmptyResumeStudy(e instanceof Error ? e.message : String(e));
  }
}

function buildEmptyResumeStudy(reason: string): ResumeStudyOutput {
  return {
    candidate_profile: {
      seniority_tier: 'fresh_grad',
      real_skill_estimate: `（简历研究失败：${reason}）`,
      packaging_intent: '（无法判断）',
    },
    internal_signals: [],
    narrative: {
      main_thread: '（研究失败）',
      weakest_link: '（研究失败）',
      strongest_link: '（研究失败）',
    },
    role_match_initial: {
      fit_summary: `（研究失败：${reason}）`,
      obvious_gaps: [],
      surprising_strengths: [],
    },
  };
}
