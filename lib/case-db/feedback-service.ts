import { prisma } from '../prisma';
import type { FeedbackEvent, FeedbackStage } from '@prisma/client';

export interface CreateFeedbackEventInput {
  serviceCaseId: string;
  stage: FeedbackStage;
  adoptedActions?: any; // JSON
  rejectedActions?: any; // JSON
  appliedAfterRevision?: boolean | null;
  interviewCount?: number | null;
  offerCount?: number | null;
  satisfactionScore?: number | null;
  feedbackNote?: string;
}

export interface UpdateFeedbackEventInput {
  adoptedActions?: any | null;
  rejectedActions?: any | null;
  appliedAfterRevision?: boolean | null;
  interviewCount?: number | null;
  offerCount?: number | null;
  satisfactionScore?: number | null;
  feedbackNote?: string | null;
}

/**
 * 创建反馈事件
 */
export async function createFeedbackEvent(input: CreateFeedbackEventInput): Promise<FeedbackEvent> {
  return prisma.feedbackEvent.create({
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

/**
 * 更新反馈事件
 */
export async function updateFeedbackEvent(
  id: string,
  input: UpdateFeedbackEventInput
): Promise<FeedbackEvent> {
  return prisma.feedbackEvent.update({
    where: { id },
    data: {
      ...input,
      feedbackNote: input.feedbackNote === undefined ? undefined : input.feedbackNote,
    },
  });
}

/**
 * 获取案例的所有反馈事件
 */
export async function getFeedbackEventsByCaseId(
  serviceCaseId: string,
  limit = 10
): Promise<FeedbackEvent[]> {
  return prisma.feedbackEvent.findMany({
    where: { serviceCaseId },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * 根据阶段获取反馈事件
 */
export async function getFeedbackEventsByStage(
  stage: FeedbackStage,
  limit = 100
): Promise<FeedbackEvent[]> {
  return prisma.feedbackEvent.findMany({
    where: { stage },
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
 * 获取有面试或offer的案例反馈
 */
export async function getPositiveOutcomeFeedback(limit = 50): Promise<FeedbackEvent[]> {
  return prisma.feedbackEvent.findMany({
    where: {
      OR: [
        { interviewCount: { gt: 0 } },
        { offerCount: { gt: 0 } },
        { satisfactionScore: { gte: 8 } },
      ],
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
}