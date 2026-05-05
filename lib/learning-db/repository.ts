// 学习型数据库 Repository
// 提供最小可用方法，用于服务沉淀层与知识学习层的数据写入

import { prisma } from '@/lib/prisma';
import type { Prisma, PatternType } from '@prisma/client';

// ─── Lead（线索） ────────────────────────────────────────────────

export interface CreateLeadInput {
  sourceChannel: 'xiaohongshu' | 'xianyu' | 'referral' | 'direct' | 'wechat' | 'douyin' | 'bilibili' | 'zhihu' | 'other';
  platformHandle?: string;
  nickname?: string;
  contactNote?: string;
  status?: 'new' | 'contacted' | 'paid' | 'delivered' | 'closed' | 'lost';
}

export async function createLead(input: CreateLeadInput) {
  return await prisma.lead.create({
    data: {
      sourceChannel: input.sourceChannel,
      platformHandle: input.platformHandle,
      nickname: input.nickname,
      contactNote: input.contactNote,
      status: input.status || 'new',
    },
  });
}

// ─── ServiceCase（服务案例） ──────────────────────────────────────

export interface CreateServiceCaseInput {
  leadId?: string;
  diagnoseSessionId?: string;
  diagnoseReportId?: string;
  serviceType: 'free_check' | 'basic_fix' | 'deep_fix' | 'custom' | 'consultation';
  targetRole?: string;
  roleFamily?: string;
  candidateStage?: 'fresh_grad' | 'internship_poor' | 'early_career' | 'mid_career' | 'senior' | 'unknown';
  jdProvided?: boolean;
  consentSaveRaw?: boolean;
  consentUseAnonymized?: boolean;
}

export async function createServiceCase(input: CreateServiceCaseInput) {
  return await prisma.serviceCase.create({
    data: {
      leadId: input.leadId,
      diagnoseSessionId: input.diagnoseSessionId,
      diagnoseReportId: input.diagnoseReportId,
      serviceType: input.serviceType,
      targetRole: input.targetRole,
      roleFamily: input.roleFamily,
      candidateStage: input.candidateStage || 'unknown',
      jdProvided: input.jdProvided || false,
      consentSaveRaw: input.consentSaveRaw || false,
      consentUseAnonymized: input.consentUseAnonymized || false,
      caseStatus: 'intake',
    },
  });
}

export async function attachSessionToCase(serviceCaseId: string, diagnoseSessionId: string, diagnoseReportId?: string) {
  return await prisma.serviceCase.update({
    where: { id: serviceCaseId },
    data: {
      diagnoseSessionId,
      diagnoseReportId,
      caseStatus: 'diagnosing',
    },
  });
}

// ─── CaseSnapshot（案例快照） ─────────────────────────────────────

export interface CreateSnapshotInput {
  serviceCaseId: string;
  snapshotType: 'raw_resume' | 'cleaned_resume' | 'final_resume' | 'jd' | 'final_delivery' | 'other';
  content: string;
  isAnonymized?: boolean;
}

export async function saveCaseSnapshot(input: CreateSnapshotInput) {
  return await prisma.caseSnapshot.create({
    data: {
      serviceCaseId: input.serviceCaseId,
      snapshotType: input.snapshotType,
      content: input.content,
      isAnonymized: input.isAnonymized || false,
    },
  });
}

// ─── DiagnosisLabel（诊断标签） ──────────────────────────────────

export interface CreateDiagnosisLabelInput {
  serviceCaseId: string;
  mainJudgment: string;
  secondaryIssues?: Prisma.InputJsonValue;
  issueDimensions?: Prisma.InputJsonValue;
  atsRiskLevel?: 'low' | 'medium' | 'high' | 'unknown';
  hrRiskLevel?: 'low' | 'medium' | 'high' | 'unknown';
  directionMismatchLevel?: 'none' | 'weak' | 'medium' | 'strong' | 'unknown';
  confidence?: 'low' | 'medium' | 'high';
  requiresUserInput?: boolean;
  humanReviewed?: boolean;
  reviewNote?: string;
}

export async function saveDiagnosisLabel(input: CreateDiagnosisLabelInput) {
  return await prisma.diagnosisLabel.create({
    data: {
      serviceCaseId: input.serviceCaseId,
      mainJudgment: input.mainJudgment,
      secondaryIssues: input.secondaryIssues,
      issueDimensions: input.issueDimensions,
      atsRiskLevel: input.atsRiskLevel || 'unknown',
      hrRiskLevel: input.hrRiskLevel || 'unknown',
      directionMismatchLevel: input.directionMismatchLevel || 'unknown',
      confidence: input.confidence || 'medium',
      requiresUserInput: input.requiresUserInput || false,
      humanReviewed: input.humanReviewed !== false, // 默认 true
      reviewNote: input.reviewNote,
    },
  });
}

// ─── RewritePair（改写对） ───────────────────────────────────────

export interface CreateRewritePairInput {
  serviceCaseId: string;
  issueType?: string;
  rewriteType?: string;
  sourceLocation?: Prisma.InputJsonValue;
  originalText: string;
  rewrittenText: string;
  changeSummary?: string;
  needsUserInput?: boolean;
  adoptedByUser?: boolean;
}

export async function saveRewritePair(input: CreateRewritePairInput) {
  return await prisma.rewritePair.create({
    data: {
      serviceCaseId: input.serviceCaseId,
      issueType: input.issueType,
      rewriteType: input.rewriteType,
      sourceLocation: input.sourceLocation,
      originalText: input.originalText,
      rewrittenText: input.rewrittenText,
      changeSummary: input.changeSummary,
      needsUserInput: input.needsUserInput || false,
      adoptedByUser: input.adoptedByUser,
    },
  });
}

export async function saveRewritePairs(pairs: CreateRewritePairInput[]) {
  return await prisma.rewritePair.createMany({
    data: pairs.map(pair => ({
      serviceCaseId: pair.serviceCaseId,
      issueType: pair.issueType,
      rewriteType: pair.rewriteType,
      sourceLocation: pair.sourceLocation,
      originalText: pair.originalText,
      rewrittenText: pair.rewrittenText,
      changeSummary: pair.changeSummary,
      needsUserInput: pair.needsUserInput || false,
      adoptedByUser: pair.adoptedByUser,
    })),
  });
}

// ─── FeedbackEvent（反馈事件） ───────────────────────────────────

export interface CreateFeedbackEventInput {
  serviceCaseId: string;
  stage: 'after_delivery' | 'day7' | 'day30';
  adoptedActions?: Prisma.InputJsonValue;
  rejectedActions?: Prisma.InputJsonValue;
  appliedAfterRevision?: boolean;
  interviewCount?: number;
  offerCount?: number;
  satisfactionScore?: number;
  feedbackNote?: string;
}

export async function saveFeedbackEvent(input: CreateFeedbackEventInput) {
  return await prisma.feedbackEvent.create({
    data: {
      serviceCaseId: input.serviceCaseId,
      stage: input.stage,
      adoptedActions: input.adoptedActions,
      rejectedActions: input.rejectedActions,
      appliedAfterRevision: input.appliedAfterRevision,
      interviewCount: input.interviewCount,
      offerCount: input.offerCount,
      satisfactionScore: input.satisfactionScore,
      feedbackNote: input.feedbackNote,
    },
  });
}

// ─── KnowledgePattern（知识模式） ────────────────────────────────

export interface CreateKnowledgePatternInput {
  roleFamily?: string;
  issueType?: string;
  patternType: 'diagnosis' | 'rewrite' | 'interview_risk' | 'jd_match' | 'career_path' | 'skill_gap';
  title: string;
  patternText: string;
  strengthScore?: number;
  status?: 'draft' | 'validated' | 'deprecated';
}

export async function createKnowledgePattern(input: CreateKnowledgePatternInput) {
  return await prisma.knowledgePattern.create({
    data: {
      roleFamily: input.roleFamily,
      issueType: input.issueType,
      patternType: input.patternType,
      title: input.title,
      patternText: input.patternText,
      strengthScore: input.strengthScore || 0.0,
      evidenceCount: 0,
      status: input.status || 'draft',
      lastValidatedAt: input.status === 'validated' ? new Date() : null,
    },
  });
}

// ─── PatternEvidence（模式证据） ──────────────────────────────────

export interface CreatePatternEvidenceInput {
  knowledgePatternId: string;
  serviceCaseId?: string;
  rewritePairId?: string;
  diagnosisLabelId?: string;
  evidenceSnippet: string;
  outcomeTag?: string;
}

export async function attachPatternEvidence(input: CreatePatternEvidenceInput) {
  const evidence = await prisma.patternEvidence.create({
    data: {
      knowledgePatternId: input.knowledgePatternId,
      serviceCaseId: input.serviceCaseId,
      rewritePairId: input.rewritePairId,
      diagnosisLabelId: input.diagnosisLabelId,
      evidenceSnippet: input.evidenceSnippet,
      outcomeTag: input.outcomeTag,
    },
  });

  // 更新知识模式的证据计数
  await prisma.knowledgePattern.update({
    where: { id: input.knowledgePatternId },
    data: {
      evidenceCount: { increment: 1 },
      // 如果有积极结果，适当增加强度分数
      strengthScore: { increment: input.outcomeTag?.includes('positive') ? 0.1 : 0.01 },
    },
  });

  return evidence;
}

// ─── 辅助查询方法 ────────────────────────────────────────────────

export async function findServiceCaseBySessionId(diagnoseSessionId: string) {
  return await prisma.serviceCase.findFirst({
    where: { diagnoseSessionId },
    include: {
      lead: true,
      snapshots: true,
      diagnosisLabels: true,
      rewritePairs: true,
    },
  });
}

export async function findPatternsByRoleFamily(roleFamily: string, patternType?: string) {
  return await prisma.knowledgePattern.findMany({
    where: {
      roleFamily,
      patternType: patternType as PatternType,
      status: 'validated',
    },
    orderBy: { strengthScore: 'desc' },
    take: 20,
  });
}