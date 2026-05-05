import { prisma } from '../prisma';
import type { Prisma, RewritePair } from '@prisma/client';

export interface CreateRewritePairInput {
  serviceCaseId: string;
  issueType?: string;
  rewriteType?: string;
  sourceLocation?: Prisma.InputJsonValue; // JSON
  originalText: string;
  rewrittenText: string;
  changeSummary?: string;
  needsUserInput?: boolean;
  adoptedByUser?: boolean | null;
}

export interface UpdateRewritePairInput {
  issueType?: string | null;
  rewriteType?: string | null;
  sourceLocation?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  originalText?: string;
  rewrittenText?: string;
  changeSummary?: string | null;
  needsUserInput?: boolean;
  adoptedByUser?: boolean | null;
}

/**
 * 创建改写对
 */
export async function createRewritePair(input: CreateRewritePairInput): Promise<RewritePair> {
  return prisma.rewritePair.create({
    data: {
      serviceCaseId: input.serviceCaseId,
      issueType: input.issueType,
      rewriteType: input.rewriteType,
      sourceLocation: input.sourceLocation,
      originalText: input.originalText,
      rewrittenText: input.rewrittenText,
      changeSummary: input.changeSummary,
      needsUserInput: input.needsUserInput ?? false,
      adoptedByUser: input.adoptedByUser,
    },
  });
}

/**
 * 更新改写对
 */
export async function updateRewritePair(
  id: string,
  input: UpdateRewritePairInput
): Promise<RewritePair> {
  return prisma.rewritePair.update({
    where: { id },
    data: {
      ...input,
      issueType: input.issueType === undefined ? undefined : input.issueType,
      rewriteType: input.rewriteType === undefined ? undefined : input.rewriteType,
      changeSummary: input.changeSummary === undefined ? undefined : input.changeSummary,
    },
  });
}

/**
 * 获取案例的所有改写对
 */
export async function getRewritePairsByCaseId(
  serviceCaseId: string,
  limit = 50
): Promise<RewritePair[]> {
  return prisma.rewritePair.findMany({
    where: { serviceCaseId },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * 获取用户采纳的改写对
 */
export async function getAdoptedRewritePairs(limit = 100): Promise<RewritePair[]> {
  return prisma.rewritePair.findMany({
    where: { adoptedByUser: true },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * 获取用户拒绝的改写对
 */
export async function getRejectedRewritePairs(limit = 100): Promise<RewritePair[]> {
  return prisma.rewritePair.findMany({
    where: { adoptedByUser: false },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * 根据问题类型获取改写对
 */
export async function getRewritePairsByIssueType(
  issueType: string,
  limit = 50
): Promise<RewritePair[]> {
  return prisma.rewritePair.findMany({
    where: { issueType },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
}