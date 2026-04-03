import { prisma } from '../prisma';
import type {
  KnowledgePattern,
  PatternEvidence,
  PatternType,
  PatternStatus,
} from '../../generated/prisma/client';

export interface CreateKnowledgePatternInput {
  roleFamily?: string;
  issueType?: string;
  patternType: PatternType;
  title: string;
  patternText: string;
  strengthScore?: number;
  evidenceCount?: number;
  status?: PatternStatus;
}

export interface UpdateKnowledgePatternInput {
  roleFamily?: string | null;
  issueType?: string | null;
  patternType?: PatternType;
  title?: string;
  patternText?: string;
  strengthScore?: number;
  evidenceCount?: number;
  status?: PatternStatus;
  lastValidatedAt?: Date | null;
}

export interface CreatePatternEvidenceInput {
  knowledgePatternId: string;
  serviceCaseId?: string;
  rewritePairId?: string;
  diagnosisLabelId?: string;
  evidenceSnippet: string;
  outcomeTag?: string;
}

/**
 * 创建知识模式
 */
export async function createKnowledgePattern(
  input: CreateKnowledgePatternInput
): Promise<KnowledgePattern> {
  return prisma.knowledgePattern.create({
    data: {
      roleFamily: input.roleFamily,
      issueType: input.issueType,
      patternType: input.patternType,
      title: input.title,
      patternText: input.patternText,
      strengthScore: input.strengthScore ?? 0.0,
      evidenceCount: input.evidenceCount ?? 0,
      status: input.status ?? 'draft',
      lastValidatedAt: input.status === 'validated' ? new Date() : null,
    },
  });
}

/**
 * 更新知识模式
 */
export async function updateKnowledgePattern(
  id: string,
  input: UpdateKnowledgePatternInput
): Promise<KnowledgePattern> {
  return prisma.knowledgePattern.update({
    where: { id },
    data: {
      ...input,
      roleFamily: input.roleFamily === undefined ? undefined : input.roleFamily,
      issueType: input.issueType === undefined ? undefined : input.issueType,
      lastValidatedAt:
        input.status === 'validated'
          ? input.lastValidatedAt ?? new Date()
          : input.lastValidatedAt,
    },
  });
}

/**
 * 创建模式证据
 */
export async function createPatternEvidence(
  input: CreatePatternEvidenceInput
): Promise<PatternEvidence> {
  return prisma.patternEvidence.create({
    data: {
      knowledgePatternId: input.knowledgePatternId,
      serviceCaseId: input.serviceCaseId,
      rewritePairId: input.rewritePairId,
      diagnosisLabelId: input.diagnosisLabelId,
      evidenceSnippet: input.evidenceSnippet,
      outcomeTag: input.outcomeTag,
    },
  });
}

/**
 * 获取所有知识模式
 */
export async function getAllKnowledgePatterns(limit = 100): Promise<KnowledgePattern[]> {
  return prisma.knowledgePattern.findMany({
    take: limit,
    orderBy: { strengthScore: 'desc' },
    include: {
      patternEvidences: {
        take: 3,
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

/**
 * 根据类型获取知识模式
 */
export async function getKnowledgePatternsByType(
  patternType: PatternType,
  limit = 50
): Promise<KnowledgePattern[]> {
  return prisma.knowledgePattern.findMany({
    where: { patternType },
    take: limit,
    orderBy: { strengthScore: 'desc' },
  });
}

/**
 * 根据状态获取知识模式
 */
export async function getKnowledgePatternsByStatus(
  status: PatternStatus,
  limit = 50
): Promise<KnowledgePattern[]> {
  return prisma.knowledgePattern.findMany({
    where: { status },
    take: limit,
    orderBy: { strengthScore: 'desc' },
  });
}

/**
 * 获取模式的证据
 */
export async function getEvidencesForPattern(
  knowledgePatternId: string,
  limit = 20
): Promise<PatternEvidence[]> {
  return prisma.patternEvidence.findMany({
    where: { knowledgePatternId },
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      serviceCase: true,
      rewritePair: true,
      diagnosisLabel: true,
    },
  });
}

/**
 * 增加模式强度分数
 */
export async function incrementPatternStrength(
  knowledgePatternId: string,
  increment: number = 1.0
): Promise<KnowledgePattern> {
  return prisma.knowledgePattern.update({
    where: { id: knowledgePatternId },
    data: {
      strengthScore: { increment },
      evidenceCount: { increment: 1 },
    },
  });
}