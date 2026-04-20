import { prisma } from '../prisma';
import type {
  ServiceCase,
  ServiceType,
  CaseStatus,
  CandidateStage,
} from '@prisma/client';

export interface CreateServiceCaseInput {
  leadId?: string;
  diagnoseSessionId?: string;
  diagnoseReportId?: string;
  serviceType: ServiceType;
  caseStatus?: CaseStatus;
  targetRole?: string;
  roleFamily?: string;
  candidateStage?: CandidateStage;
  jdProvided?: boolean;
  consentSaveRaw?: boolean;
  consentUseAnonymized?: boolean;
}

export interface UpdateServiceCaseInput {
  leadId?: string | null;
  diagnoseSessionId?: string | null;
  diagnoseReportId?: string | null;
  serviceType?: ServiceType;
  caseStatus?: CaseStatus;
  targetRole?: string | null;
  roleFamily?: string | null;
  candidateStage?: CandidateStage;
  jdProvided?: boolean;
  consentSaveRaw?: boolean;
  consentUseAnonymized?: boolean;
}

/**
 * 创建服务案例
 */
export async function createServiceCase(input: CreateServiceCaseInput): Promise<ServiceCase> {
  return prisma.serviceCase.create({
    data: {
      leadId: input.leadId,
      diagnoseSessionId: input.diagnoseSessionId,
      diagnoseReportId: input.diagnoseReportId,
      serviceType: input.serviceType,
      caseStatus: input.caseStatus ?? 'intake',
      targetRole: input.targetRole,
      roleFamily: input.roleFamily,
      candidateStage: input.candidateStage ?? 'unknown',
      jdProvided: input.jdProvided ?? false,
      consentSaveRaw: input.consentSaveRaw ?? false,
      consentUseAnonymized: input.consentUseAnonymized ?? false,
    },
  });
}

/**
 * 更新服务案例
 */
export async function updateServiceCase(
  id: string,
  input: UpdateServiceCaseInput
): Promise<ServiceCase> {
  return prisma.serviceCase.update({
    where: { id },
    data: {
      ...input,
      // 处理可能的 null 值
      leadId: input.leadId === undefined ? undefined : input.leadId,
      diagnoseSessionId: input.diagnoseSessionId === undefined ? undefined : input.diagnoseSessionId,
      diagnoseReportId: input.diagnoseReportId === undefined ? undefined : input.diagnoseReportId,
      targetRole: input.targetRole === undefined ? undefined : input.targetRole,
      roleFamily: input.roleFamily === undefined ? undefined : input.roleFamily,
    },
  });
}

/**
 * 根据案例标识查找案例
 */
export async function findServiceCaseById(id: string): Promise<ServiceCase | null> {
  return prisma.serviceCase.findUnique({
    where: { id },
    include: {
      lead: true,
      diagnoseSession: true,
      diagnoseReport: true,
    },
  });
}

/**
 * 查找与诊断会话关联的案例
 */
export async function findServiceCaseByDiagnoseSessionId(
  diagnoseSessionId: string
): Promise<ServiceCase | null> {
  return prisma.serviceCase.findFirst({
    where: { diagnoseSessionId },
  });
}

/**
 * 查找与诊断报告关联的案例
 */
export async function findServiceCaseByDiagnoseReportId(
  diagnoseReportId: string
): Promise<ServiceCase | null> {
  return prisma.serviceCase.findFirst({
    where: { diagnoseReportId },
  });
}

/**
 * 获取所有服务案例
 */
export async function getAllServiceCases(limit = 100): Promise<ServiceCase[]> {
  return prisma.serviceCase.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      lead: true,
      diagnoseSession: true,
      diagnoseReport: true,
    },
  });
}

/**
 * 根据状态筛选案例
 */
export async function getServiceCasesByStatus(
  status: CaseStatus,
  limit = 100
): Promise<ServiceCase[]> {
  return prisma.serviceCase.findMany({
    where: { caseStatus: status },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
}