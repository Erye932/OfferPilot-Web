# 代码改动记录

## 概述
本次修复主要围绕「增加可观测性」和「减少静默失败」两个目标，对 Deep 模式调用 Metaso 的链路进行了增强。所有改动均为增量式、可回滚的日志与错误处理优化，未改变核心业务逻辑。

## 改动文件清单

### 1. `app/api/diagnose/route.ts`
**目的**：在诊断入口增加结构化日志，确保深度模式进入条件透明。

**改动内容**：
- 导入 `logInfo` 函数
- 在环境变量检查后添加 `DiagnoseAPI` 日志，记录：
  - `diagnose_mode`
  - `DUAL_AI_ENABLED` 布尔值
  - `METASO_API_KEY` 存在性及长度（不泄露完整 key）
  - `METASO_API_BASE_URL` 存在性
- 在模式决策前添加 `DiagnoseAPI` 日志，记录：
  - `mode`
  - `dualAiEnabled`
  - `enteringDeepMode`（是否实际进入深度路径）
- 进入深度工作流前添加日志，记录基础诊断结果摘要

**影响**：
- 运维人员可通过日志直接判断请求是否进入深度路径
- 环境变量配置问题可快速定位

### 2. `lib/ai/router.ts`
**目的**：增强 AI 路由器的可观测性，明确记录 fallback 行为。

**改动内容**：
- 任务开始时记录结构化日志，包括：
  - `taskType`
  - `primaryProvider`
  - `fallbackProvider`
  - `fallbackAllowed`
- primary provider 调用成功后记录响应摘要（provider、model、contentLength）
- primary provider 失败时记录详细错误信息，包括：
  - `isAIProviderError`
  - `isRetryable`
  - `fallbackAvailable`
- fallback 触发时记录：
  - `primaryProvider`
  - `fallbackProvider`
  - `taskType`
  - `errorReason`
- fallback 成功时记录最终使用的 provider
- fallback 失败时记录错误上下文

**影响**：
- 可清晰追踪 research 任务是否从 Metaso fallback 到 DeepSeek
- 错误分类更精细，便于区分可重试与不可重试错误

### 3. `lib/ai/providers/metaso.ts`
**目的**：提供完整的 Metaso provider 内部状态可见性。

**改动内容**：
- 导入 `logInfo`、`logWarn`、`logError`
- 调用开始时记录断路器状态：
  - `isOpen`
  - `failures`
  - `threshold`
  - `lastFailTime`
  - `timeSinceLastFail`
  - `circuitResetMs`
- 断路器自动关闭时记录状态变更
- 断路器打开拒绝请求时记录剩余时间
- API key 检查时记录存在性、长度、前缀（安全）
- API key 格式错误时记录具体问题
- API base URL 检查时记录原始值、有效性
- 请求尝试开始前记录 `baseUrls`、`maxRetries`、`timeout`
- 每个 API 基地址尝试时记录索引和 URL
- 每个请求尝试时记录 attempt 计数
- API 响应接收时记录状态码和状态文本
- API 响应错误时记录状态码、错误预览
- 响应解析成功时记录内容长度和预览
- 成功时记录断路器重置（失败计数清零）
- 最终失败时记录断路器状态更新和可能的打开操作
- 所有尝试均失败时记录汇总信息

**影响**：
- 运维人员可实时查看断路器状态、失败计数、阈值
- API 调用链的每一步都有日志，便于故障定位
- 环境变量问题、网络问题、API 响应问题均可区分

### 4. `lib/diagnose/v2/workflow.ts`
**目的**：减少 research memo 失败的静默性，在 metadata 中标记 fallback。

**改动内容**：
- `runDeepResearchMemo` 错误处理增强：
  - 新增 `researchMemoFailed` 和 `researchMemoError` 变量
  - 记录更丰富的错误上下文，包括 `normalizedInput` 和 `basicSummary` 摘要
  - 保留 `researchMemo = ''` 的 fallback 行为
- 深度合成完成后，检查 `researchMemoFailed` 标志：
  - 若失败，在 `deepResult.metadata` 中设置：
    - `deep_fallback_reason: 'research_memo_failed'`
    - `deep_fallback_message`: 包含错误摘要
  - 记录警告日志，说明已标记 fallback
- 工作流完成时记录汇总信息：
  - `researchMemoFailed`
  - `researchMemoLength`
  - `deepDiagnosis`
  - `deep_fallback_reason`

**影响**：
- research memo 失败不再完全静默，前端可通过 metadata 感知
- 错误信息保留在日志中，便于后续分析
- 不破坏现有流程，保持生产可用性

## 改动分类

### 调试性改动（可随时移除）
1. 所有新增的 `logInfo` 调用（不影响业务逻辑）
2. 错误上下文增强（仅增加日志字段）
3. 状态监控日志（断路器、环境变量）

### 正式修复（建议保留）
1. `runDeepResearchMemo` 错误处理改进（减少静默失败）
2. `deep_fallback_reason` 标记（提供用户可见的 fallback 状态）
3. fallback 成功日志（明确记录最终使用的 provider）

### 风险说明
- **无破坏性变更**：所有改动均为日志添加或错误信息增强，不影响正常业务逻辑
- **无性能影响**：日志调用在错误路径或调试路径，成功路径仅增加少量 metadata 操作
- **无数据泄露**：API key 日志仅记录长度和前缀，不记录完整值
- **向后兼容**：metadata 字段使用现有 `deep_fallback_reason`，不引入新字段

## 回滚指南
如需回滚，可按以下步骤：
1. 还原上述四个文件的修改
2. 或使用 `git checkout -- <file>` 恢复原始版本
3. 无需数据库变更或配置更新

## 验证建议
1. 查看 `next.log` 中是否有新增的日志标签
2. 发送 deep 模式请求，检查响应中 `metadata.deep_fallback_reason`
3. 模拟 Metaso 故障（如错误 API key），观察 fallback 日志是否完整
4. 检查断路器状态日志是否正常输出