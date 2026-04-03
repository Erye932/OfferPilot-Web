import { prisma } from '../prisma';
import type { CaseSnapshot, SnapshotType } from '../../generated/prisma/client';

export interface CreateSnapshotInput {
  serviceCaseId: string;
  snapshotType: SnapshotType;
  content: string;
  isAnonymized?: boolean;
}

/**
 * 创建案例快照
 */
export async function createSnapshot(input: CreateSnapshotInput): Promise<CaseSnapshot> {
  return prisma.caseSnapshot.create({
    data: {
      serviceCaseId: input.serviceCaseId,
      snapshotType: input.snapshotType,
      content: input.content,
      isAnonymized: input.isAnonymized ?? false,
    },
  });
}

/**
 * 获取案例的所有快照
 */
export async function getSnapshotsByCaseId(
  serviceCaseId: string,
  limit = 20
): Promise<CaseSnapshot[]> {
  return prisma.caseSnapshot.findMany({
    where: { serviceCaseId },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * 根据类型获取案例快照
 */
export async function getSnapshotByCaseIdAndType(
  serviceCaseId: string,
  snapshotType: SnapshotType
): Promise<CaseSnapshot | null> {
  return prisma.caseSnapshot.findFirst({
    where: {
      serviceCaseId,
      snapshotType,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * 删除快照
 */
export async function deleteSnapshot(id: string): Promise<void> {
  await prisma.caseSnapshot.delete({
    where: { id },
  });
}