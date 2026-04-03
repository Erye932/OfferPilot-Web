# OfferPilot-Web MEMORY.md（自动记忆持久化）
# Claude Code 会自动读取和追加内容

## 项目关键决策（最后更新：2026-04-02）
- 诊断报告模块采用流式 PDF 生成 + 缓存策略，避免重复解析
- 所有 API 路由统一使用 App Router server actions
- TypeScript 严格模式 + zod 校验

## 架构偏好
- 优先 Server Components + React Server Components
- 性能敏感部分使用 WebAssembly 或 Rust 绑定（未来可扩展）
- 错误处理统一使用 try-catch + structured logging

## 已完成重要任务
- [2026-04-01] 完成 report 模块 PDF 解析优化
- [2026-04-02] 项目架构探索：了解核心诊断、PDF解析、报告生成模块
- [2026-04-02] 修复深度诊断组件空值访问错误，增强组件健壮性
- [2026-04-02] 禁用诊断限流功能：添加 RATE_LIMIT_ENABLED 环境变量开关（默认 false），等登录功能完成后再启用账号限额
- [2026-04-03] 新增学习型数据库：设计三层架构（原始生产数据层、服务沉淀层、知识学习层），新增8个Prisma模型，创建repository层，设计数据入库时机，建立产品质量飞轮闭环
- [2026-04-03] 增强诊断输入体验：添加PDF解析质量预览面板（原始提取文本vs处理后文本对比）和Demo交互式示例（示例简历实时修改体验）

## 项目架构总结（2026-04-03）
- **核心模块**：diagnose（简历诊断）、pdf/parse（PDF解析）、report（报告获取）、explain（AI解释）
- **学习型数据库**：三层架构（原始生产数据层、服务沉淀层、知识学习层），8个新模型支撑产品质量飞轮
- **技术栈**：Next.js App Router + TypeScript + Tailwind CSS + Prisma + PostgreSQL
- **API设计**：RESTful API 路由，统一错误处理，匿名会话限流，最小可用落库
- **诊断流程**：支持基础诊断和深度诊断（双AI工作流），返回结构化诊断报告
- **前端组件**：DiagnoseInput（输入）、DiagnoseResult（结果展示）、DeepDiagnoseResult（深度诊断）
- **数据流**：客户端 → API → 诊断工作流 → 数据库存储 → 结果返回 → 前端展示
- **学习飞轮**：服务数据 → 人工标注 → 模式沉淀 → 产品智能增强

Claude Code 请在每次重大变更后自动追加总结。