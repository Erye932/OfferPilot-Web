// 三库加载器
// 负责加载 diagnosis-rules, insider-views, rewrite-patterns 三个知识库

import type { DiagnosisRule, InsiderView, RewritePattern } from './types';

// 使用 require 导入 JSON 文件，避免 TypeScript 模块解析问题
import diagnosisRulesData from '../../offerpilot-corpus/distilled/diagnosis-rules.json';
import insiderViewsData from '../../offerpilot-corpus/distilled/insider-views.json';
import rewritePatternsData from '../../offerpilot-corpus/distilled/rewrite-patterns.json';

// 类型断言
const diagnosisRules = diagnosisRulesData as DiagnosisRule[];
const insiderViews = insiderViewsData as InsiderView[];
const rewritePatterns = rewritePatternsData as RewritePattern[];

// 按 issue_type 索引的查找表
const rulesByIssueType: Record<string, DiagnosisRule> = {};
const viewsByIssueType: Record<string, InsiderView> = {};
const patternsByIssueType: Record<string, RewritePattern> = {};

// 构建索引
diagnosisRules.forEach(rule => {
  rulesByIssueType[rule.issue_type] = rule;
});

insiderViews.forEach(view => {
  viewsByIssueType[view.issue_type] = view;
});

rewritePatterns.forEach(pattern => {
  patternsByIssueType[pattern.issue_type] = pattern;
});

// 导出函数

/**
 * 获取所有诊断规则
 */
export function getDiagnosisRules(): DiagnosisRule[] {
  return diagnosisRules;
}

/**
 * 按 issue_type 获取诊断规则
 */
export function getRuleByIssueType(issueType: string): DiagnosisRule | undefined {
  return rulesByIssueType[issueType];
}

/**
 * 按 issue_type 获取内行视角
 */
export function getViewByIssueType(issueType: string): InsiderView | undefined {
  return viewsByIssueType[issueType];
}

/**
 * 按 issue_type 获取改写模式
 */
export function getPatternByIssueType(issueType: string): RewritePattern | undefined {
  return patternsByIssueType[issueType];
}

/**
 * 获取核心问题类型（免费版 V1 支持的5种）
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
 * 检查是否为核心问题类型
 */
export function isCoreIssueType(issueType: string): boolean {
  return getCoreIssueTypes().includes(issueType);
}

/**
 * 获取所有内行视角
 */
export function getAllInsiderViews(): InsiderView[] {
  return insiderViews;
}

/**
 * 获取所有改写模式
 */
export function getAllRewritePatterns(): RewritePattern[] {
  return rewritePatterns;
}

// 导出原始数据（供其他模块使用）
export {
  diagnosisRules,
  insiderViews,
  rewritePatterns
};