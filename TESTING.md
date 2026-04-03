# 测试体系

本项目使用 [Vitest](https://vitest.dev/) 作为测试框架。

## 快速开始

```bash
# 安装依赖（已包含 vitest）
npm install

# 运行所有测试
npm test

# 监听模式（开发时推荐）
npm run test:watch

# UI 模式（浏览器界面）
npm run test:ui
```

## 测试目录结构

```
__tests__/
├── diagnose.test.ts      # 诊断核心逻辑测试
├── rate-limit.test.ts    # 限流逻辑测试
└── ...（未来添加的测试文件）
```

所有测试文件必须以 `.test.ts` 或 `.spec.ts` 结尾，并放在 `__tests__/` 目录下。

## 编写新测试

1. 在 `__tests__/` 下创建 `*.test.ts` 文件。
2. 导入 `vitest` 和待测试模块。
3. 使用 `describe` / `it` 组织测试用例。
4. 利用 `vi.mock()` 对外部依赖进行 mock。

示例：

```ts
import { describe, it, expect, vi } from 'vitest';
import { someFunction } from '@/some/module';

describe('someFunction', () => {
  it('should work', () => {
    expect(someFunction()).toBe(true);
  });
});
```

## 配置

主配置文件：`vitest.config.ts`

- `globals: true`：全局注入 `describe`、`it`、`expect` 等（无需显式导入）。
- `environment: 'node'`：Node.js 环境（无浏览器 API）。
- `include: ['__tests__/**/*.test.ts']`：自动发现 `__tests__` 下的测试文件。
- `alias: { '@': '.' }`：支持 `@/` 开头的绝对路径导入。

## 注意事项

- 测试中如需使用 Prisma Client，请通过 `vi.mock('@/lib/prisma')` 进行 mock。
- 时间相关测试可使用 `vi.useFakeTimers()`。
- 测试文件应避免副作用，每个测试用例独立运行。

## 常见问题

**Q：测试找不到模块？**
A：检查 `tsconfig.json` 中的路径映射是否与 `vitest.config.ts` 中的 `alias` 一致。

**Q：如何测试 Next.js API 路由？**
A：目前测试集中在业务逻辑层，API 路由可通过集成测试（如 `supertest`）覆盖，暂未纳入当前配置。