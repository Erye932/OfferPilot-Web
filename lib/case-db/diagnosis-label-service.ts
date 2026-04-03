import { prisma } from '../prisma';
import type {
  DiagnosisLabel,
  AtsRiskLevel,
  HrRiskLevel,
  DirectionMismatchLevel,
  ConfidenceLevel,
} from '../../generated/prisma/client';

export interface CreateDiagnosisLabelInput {
  serviceCaseId: string;
  mainJudgment: string;
  secondaryIssues?: any; // JSON
  issueDimensions?: any; // JSON
  atsRiskLevel?: AtsRiskLevel;
  hrRiskLevel?: HrRiskLevel;
  directionMismatchLevel?: DirectionMismatchLevel;
  confidence?: ConfidenceLevel;
  requiresUserInput?: boolean;
  humanReviewed?: boolean;
  reviewNote?: string;
}

export interface UpdateDiagnosisLabelInput {
  mainJudgment?: string;
  secondaryIssues?: any | null;
  issueDimensions?: any | null;
  atsRiskLevel?: AtsRiskLevel;
  hrRiskLevel?: HrRiskLevel;
  directionMismatchLevel?: DirectionMismatchLevel;
  confidence?: ConfidenceLevel;
  requiresUserInput?: boolean;
  humanReviewed?: boolean;
  reviewNote?: string | null;
}

/**
 * 创建诊断标签
 */
export async function createDiagnosisLabel(
  input: CreateDiagnosisLabelInput
): Promise<DiagnosisLabel> {
  return prisma.diagnosisLabel.create({
    data: {
      serviceCaseId: input.serviceCaseId,
      mainJudgment: input.mainJudgment,
      secondaryIssues: input.secondaryIssues,
      issueDimensions: input.issueDimensions,
      atsRiskLevel: input.atsRiskLevel ?? 'unknown',
      hrRiskLevel: input.hrRiskLevel ?? 'unknown',
      directionMismatchLevel: input.directionMismatchLevel ?? 'unknown',
      confidence: input.confidence ?? 'medium',
      requiresUserInput: input.requiresUserInput ?? false,
      humanReviewed: input.humanReviewed ?? true,
      reviewNote: input.reviewNote,
    },
  });
}

/**
 * 更新诊断标签
 */
export async function updateDiagnosisLabel(
  id: string,
  input: UpdateDiagnosisLabelInput
): Promise<DiagnosisLabel> {
  return prisma.diagnosisLabel.update({
    where: { id },
    data: {
      ...input,
      reviewNote: input.reviewNote === undefined ? undefined : input.reviewNote,
    },
  });
}

/**
 * 获取案例的诊断标签
 */
export async function getDiagnosisLabelByCaseId(
  serviceCaseId: string
): Promise<DiagnosisLabel | null> {
  return prisma.diagnosisLabel.findFirst({
    where: { serviceCaseId },
  });
}

/**
 * 获取所有诊断标签（用于分析）
 */
export async function getAllDiagnosisLabels(limit = 200): Promise<DiagnosisLabel[]> {
  return prisma.diagnosisLabel.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      serviceCase: {
        include: {
          lead: true,
        },
      },
    },
  });
}

/**
 * 根据主要判断筛选诊断标签
 */
export async function getDiagnosisLabelsByMainJudgment(
  mainJudgment: string,
  limit = 50
): Promise<DiagnosisLabel[]> {
  return prisma.diagnosisLabel.findMany({
    where: {
      mainJudgment: {
        contains: mainJudgment,
        mode: 'insensitive',
      },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
}