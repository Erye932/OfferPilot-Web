import { prisma } from '../prisma';
import type { Lead, LeadSourceChannel, LeadStatus } from '../../generated/prisma/client';

export interface CreateLeadInput {
  sourceChannel: LeadSourceChannel;
  platformHandle?: string;
  nickname?: string;
  contactNote?: string;
  firstContactAt?: Date;
  status?: LeadStatus;
}

export interface UpdateLeadInput {
  sourceChannel?: LeadSourceChannel;
  platformHandle?: string | null;
  nickname?: string | null;
  contactNote?: string | null;
  status?: LeadStatus;
}

/**
 * 创建新线索
 */
export async function createLead(input: CreateLeadInput): Promise<Lead> {
  return prisma.lead.create({
    data: {
      sourceChannel: input.sourceChannel,
      platformHandle: input.platformHandle,
      nickname: input.nickname,
      contactNote: input.contactNote,
      firstContactAt: input.firstContactAt ?? new Date(),
      status: input.status ?? 'new',
    },
  });
}

/**
 * 更新线索
 */
export async function updateLead(id: string, input: UpdateLeadInput): Promise<Lead> {
  return prisma.lead.update({
    where: { id },
    data: {
      ...input,
      // 处理可能的 null 值
      platformHandle: input.platformHandle === undefined ? undefined : input.platformHandle,
      nickname: input.nickname === undefined ? undefined : input.nickname,
      contactNote: input.contactNote === undefined ? undefined : input.contactNote,
    },
  });
}

/**
 * 查找线索 - 根据平台句柄或昵称
 */
export async function findLeadByHandleOrNickname(
  platformHandle?: string,
  nickname?: string
): Promise<Lead | null> {
  if (!platformHandle && !nickname) {
    return null;
  }

  const whereConditions = [];
  if (platformHandle) {
    whereConditions.push({ platformHandle });
  }
  if (nickname) {
    whereConditions.push({ nickname });
  }

  return prisma.lead.findFirst({
    where: {
      OR: whereConditions,
    },
  });
}

/**
 * 获取所有线索
 */
export async function getAllLeads(limit = 100): Promise<Lead[]> {
  return prisma.lead.findMany({
    take: limit,
    orderBy: { firstContactAt: 'desc' },
  });
}