// Prisma client singleton for Next.js
// Prevents multiple instances in development due to hot-reloading

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[Prisma] DATABASE_URL not set — DB operations will fail gracefully');
  }
  const adapter = new PrismaPg({ connectionString: url ?? '' });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// 数据保留策略清理函数（未来实现）
export async function pruneOldData() {
  // 实现逻辑：
  // 1. 删除超过30天的匿名 DiagnoseSession 和关联的 DiagnoseReport
  // 2. 删除超过6个月的用户 DiagnoseSession（当用户删除账户时）
  // 3. 删除超过7天的 UploadedFile 原始文件（需配合存储服务）
  // 4. 删除超过30天的 UploadedFile 元数据
  // 5. 删除超过90天的 UsageRecord
  // 注意：实际生产环境应考虑分批处理、错误重试和监控告警
  console.warn('[Prisma] 数据保留策略清理函数未实现，请根据业务需求补充');
}
