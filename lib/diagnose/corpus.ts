// Three-library loader.
// Loads the diagnosis-rules, insider-views, and rewrite-patterns corpora.

import type { DiagnosisRule, InsiderView, RewritePattern, Persona } from './types';

// Static JSON imports — sidesteps TypeScript module-resolution edge cases.
import diagnosisRulesData from '../../offerpilot-corpus/distilled/diagnosis-rules.json';
import insiderViewsData from '../../offerpilot-corpus/distilled/insider-views.json';
import rewritePatternsData from '../../offerpilot-corpus/distilled/rewrite-patterns.json';

// Typed views over the raw JSON.
const diagnosisRules = diagnosisRulesData as DiagnosisRule[];
const insiderViews = insiderViewsData as InsiderView[];
const rewritePatterns = rewritePatternsData as RewritePattern[];

// Lookup tables indexed by issue_type.
const rulesByIssueType: Record<string, DiagnosisRule> = {};
const viewsByIssueType: Record<string, InsiderView> = {};
const patternsByIssueType: Record<string, RewritePattern> = {};

// Build indices.
diagnosisRules.forEach(rule => {
  rulesByIssueType[rule.issue_type] = rule;
});

insiderViews.forEach(view => {
  viewsByIssueType[view.issue_type] = view;
});

rewritePatterns.forEach(pattern => {
  patternsByIssueType[pattern.issue_type] = pattern;
});

// Public API.

/**
 * Return all diagnosis rules.
 */
export function getDiagnosisRules(): DiagnosisRule[] {
  return diagnosisRules;
}

/**
 * Get a diagnosis rule by issue_type.
 */
export function getRuleByIssueType(issueType: string): DiagnosisRule | undefined {
  return rulesByIssueType[issueType];
}

/**
 * Get an insider view by issue_type.
 */
export function getViewByIssueType(issueType: string): InsiderView | undefined {
  return viewsByIssueType[issueType];
}

/**
 * Get a rewrite pattern by issue_type.
 */
export function getPatternByIssueType(issueType: string): RewritePattern | undefined {
  return patternsByIssueType[issueType];
}

/**
 * Core issue types covered by the free V1 tier (5 issues).
 */
export function getCoreIssueTypes(): string[] {
  return [
    'lack_of_result_evidence',
    'keyword_alignment_weak',
    'weak_role_boundary',
    'jd_direction_mismatch',
    'overclaim_risk'
  ];
}

/**
 * Whether the given issue_type is a core (free-tier) issue.
 */
export function isCoreIssueType(issueType: string): boolean {
  return getCoreIssueTypes().includes(issueType);
}

/**
 * Return all insider views.
 */
export function getAllInsiderViews(): InsiderView[] {
  return insiderViews;
}

/**
 * Return all rewrite patterns.
 */
export function getAllRewritePatterns(): RewritePattern[] {
  return rewritePatterns;
}

// ─── Persona Filter ──────────────────────────────────────────
// Semantics (matches `applicable_personas` in types.ts):
//   - field absent / undefined / empty array  →  universal pool: included for any persona
//   - field present and non-empty              →  specialized pool: included only when the target persona is listed
// This lets the universal pool and persona-specialized pool coexist without
// dropping entries that simply forgot to set the field.

interface WithApplicablePersonas {
  applicable_personas?: Persona[];
}

/**
 * Generic persona filter — single implementation reused across all three corpora.
 *
 * @param items   Any entries carrying an optional applicable_personas[] field.
 * @param persona The persona to filter for.
 * @returns       Entries that hit either the universal pool or the persona-specialized pool.
 */
export function filterByPersona<T extends WithApplicablePersonas>(
  items: readonly T[],
  persona: Persona
): T[] {
  return items.filter((item) => {
    // absent / undefined / empty array → universal pool
    if (!item.applicable_personas || item.applicable_personas.length === 0) {
      return true;
    }
    // non-empty → specialized pool: must include the target persona
    return item.applicable_personas.includes(persona);
  });
}

/** Filter diagnosis rules by persona. */
export function filterRulesByPersona(persona: Persona): DiagnosisRule[] {
  return filterByPersona(diagnosisRules, persona);
}

/** Filter insider views by persona. */
export function filterViewsByPersona(persona: Persona): InsiderView[] {
  return filterByPersona(insiderViews, persona);
}

/** Filter rewrite patterns by persona. */
export function filterPatternsByPersona(persona: Persona): RewritePattern[] {
  return filterByPersona(rewritePatterns, persona);
}

/**
 * Return only **specialized** entries — those whose applicable_personas
 * explicitly include the target persona.
 *
 * Use case: when injecting into prompts, we only want persona-specific extras,
 * not the universal entries (those would just duplicate context for the LLM).
 */
export function filterSpecializedByPersona<T extends WithApplicablePersonas>(
  items: readonly T[],
  persona: Persona
): T[] {
  return items.filter(
    (item) =>
      item.applicable_personas !== undefined &&
      item.applicable_personas.length > 0 &&
      item.applicable_personas.includes(persona)
  );
}

/** Get persona-specialized insider views (excludes the universal pool). */
export function getSpecializedViewsForPersona(persona: Persona): InsiderView[] {
  return filterSpecializedByPersona(insiderViews, persona);
}

/** Get persona-specialized rewrite patterns (excludes the universal pool). */
export function getSpecializedPatternsForPersona(persona: Persona): RewritePattern[] {
  return filterSpecializedByPersona(rewritePatterns, persona);
}

/**
 * Get a single diagnosis rule by (persona, issue_type).
 * Returns the persona-matched version if available; otherwise falls back to the universal entry.
 */
export function getRuleByPersonaAndIssue(
  persona: Persona,
  issueType: string
): DiagnosisRule | undefined {
  const filtered = filterRulesByPersona(persona);
  return filtered.find((r) => r.issue_type === issueType);
}

// Re-export raw data for downstream modules.
export {
  diagnosisRules,
  insiderViews,
  rewritePatterns
};