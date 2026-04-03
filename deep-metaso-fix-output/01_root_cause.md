# Deep 模式 Metaso 调用失败根因分析

## 问题摘要
Deep 诊断模式（`diagnose_mode: "deep"`）在环境变量 `DUAL_AI_ENABLED=true` 时，应调用 Metaso 进行深度研究（`research` 任务），但实际可能静默失败并 fallback 到 DeepSeek，导致用户看到“深度诊断成功”的假象。

## 真实调用链

### 入口点：`app/api/diagnose/route.ts`
1. 请求进入 `POST` 函数，解析 `diagnose_mode` 参数
2. 检查 `process.env.DUAL_AI_ENABLED === 'true'`
3. 若 `diagnose_mode === 'deep'` 且 `DUAL_AI_ENABLED=true`，进入深度路径
4. 先运行基础诊断 `runFreeDiagnoseWorkflow`，再运行 `runDeepDiagnoseWorkflow`

### 深度工作流：`lib/diagnose/v2/workflow.ts`
5. `runDeepDiagnoseWorkflow` 调用 `runDeepResearchMemo`（Step 1）和 `runDeepSynthesis`（Step 2）
6. `runDeepResearchMemo` 构建 prompt 并调用 `aiRouter.route({ type: 'research' })`

### AI 路由：`lib/ai/router.ts`
7. `PROVIDER_MAP['research'] = metasoProvider`（默认 Metaso）
8. `FALLBACK_TASKS = ['research']`（仅 research 任务允许 fallback）
9. 路由逻辑：先尝试 primary provider（Metaso），失败且错误可重试时 fallback 到 DeepSeek

### Metaso Provider：`lib/ai/providers/metaso.ts`
10. 检查断路器状态（`circuitState.isOpen`）
11. 验证环境变量：`METASO_API_KEY`、`METASO_API_BASE_URL`
12. 发送请求到 Metaso API（`/v1/search`）
13. 解析响应，提取 content 字段

### 错误处理与 fallback
14. 若 Metaso provider 抛出 `AIProviderError` 且 `isRetryable=true`，router 尝试 fallback 到 DeepSeek
15. 若 fallback 成功，返回 DeepSeek 的响应，但 provider 标记为 'deepseek'
16. 若 `runDeepResearchMemo` 抛出任何错误，被 try-catch 捕获，`researchMemo = ''`，流程继续

## 主因：静默失败与误导性 fallback

**根本原因**：`runDeepResearchMemo` 的错误处理（workflow.ts 第 509-516 行）将 Metaso 调用失败静默转化为空字符串，同时 AI router 的 fallback 机制使请求最终由 DeepSeek 处理，但日志和响应中未明确标记这一 fallback 行为。

**具体表现**：
- Metaso 可能因断路器打开、API key 无效、网络超时等原因失败
- 错误被 `AIProviderError` 包装，`isRetryable=true`，触发 router fallback
- fallback 到 DeepSeek 成功，用户收到看似正常的深度诊断结果
- `researchMemo` 为空但 `runDeepSynthesis` 仍执行，输出缺少深度研究内容
- 日志仅记录 primary provider 失败，未明确标记最终使用了哪个 provider

## 次因：可观测性不足

1. **入口条件检查不透明**：`app/api/diagnose/route.ts` 中 `DUAL_AI_ENABLED` 和 `diagnose_mode` 的检查结果未结构化日志输出，难以确认是否进入深度路径。

2. **断路器状态不可见**：Metaso provider 的断路器状态（open/closed）、失败计数、阈值等仅在失败时记录错误，缺乏主动状态检查。

3. **环境变量校验不充分**：虽然验证了 `METASO_API_KEY` 存在性，但未检查其有效性（如格式、长度），`METASO_API_BASE_URL` 仅校验 URL 格式，未测试可达性。

4. **fallback 缺乏显式标记**：AI router 在 fallback 成功后，响应中的 `provider` 字段会显示实际使用的 provider（'deepseek'），但这一信息未传递到最终诊断响应的 metadata 中。

## 误导性现象

1. **“深度诊断成功”假象**：用户看到 `diagnose_mode: 'deep'` 且 `deep_diagnosis: true` 的响应，误以为 Metaso 深度研究已执行。

2. **日志误导**：
   - `AIRouter` 记录 "Primary provider metaso failed" 但未记录 "Fallback to deepseek succeeded"
   - `DeepWorkflow` 记录 "Research memo 失败，继续执行 synthesis" 但未说明失败原因和是否 fallback

3. **断路器静默恢复**：断路器打开后，在 reset 时间过后自动关闭，但无日志记录状态变化，运维人员无法感知历史故障。

4. **环境变量配置正确但 API 无效**：`METASO_API_KEY` 和 `METASO_API_BASE_URL` 格式正确，但可能因权限、配额、网络策略等原因 API 调用失败，错误原因未清晰记录。

## 风险点

1. **生产可用性风险**：静默 fallback 掩盖了 Metaso 服务不可用的问题，可能导致：
   - 深度诊断质量下降（缺乏行业研究 memo）
   - 用户期望落空（支付了深度诊断但得到近似基础诊断的结果）
   - 运维监控盲区（服务降级未告警）

2. **调试困难**：当用户报告“深度诊断没效果”时，需要查看多级日志才能确定是否调用了 Metaso，增加了排查成本。

3. **断路器误触发**：短时网络抖动可能导致断路器打开，后续请求被拒绝，即使 Metaso 服务已恢复。

4. **配置漂移风险**：环境变量可能在部署后意外更改（如 API key 过期、URL 变更），当前校验仅检查存在性，未验证有效性。

## 证据

### 代码证据
- `lib/diagnose/v2/workflow.ts:509-516`：`runDeepResearchMemo` 的 try-catch 静默处理错误，`researchMemo = ''`
- `lib/ai/router.ts:40-53`：primary provider 失败后，仅当 `error instanceof AIProviderError && error.isRetryable` 时才 fallback
- `lib/ai/providers/metaso.ts:176-180`：所有最终错误都包装为 `AIProviderError` 且 `isRetryable=true`
- `app/api/diagnose/route.ts:101-106`：深度路径入口条件检查缺乏结构化日志

### 环境证据
- `.env.local` 已配置 `DUAL_AI_ENABLED=true`、`METASO_API_KEY`、`METASO_API_BASE_URL`
- 默认断路器阈值 `AI_CIRCUIT_FAIL_THRESHOLD=5`，重置时间 `AI_CIRCUIT_OPEN_MS=60000`

### 日志证据（推断）
- 若 Metaso 调用失败，日志中将出现 "Primary provider metaso failed"
- 若 fallback 成功，将出现 "Falling back to deepseek" 但无最终确认日志
- 最终响应中 `metadata.provider_used` 未记录，无法追踪实际使用的 AI provider