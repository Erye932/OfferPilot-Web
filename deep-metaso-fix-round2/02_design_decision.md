# 设计决策说明

## 1. AI Router 返回值扩展设计

### 原有结构
```typescript
interface AIResponse {
  content: string;
  provider: string;      // 实际使用的 provider
  model: string;
  tokensUsed?: number;
}
```

### 扩展后结构
```typescript
interface AIResponse {
  content: string;
  provider: string;      // 实际使用的 provider (保持兼容)
  model: string;
  tokensUsed?: number;
  // 新增元数据字段（全部可选，保持向后兼容）
  providerRequested?: string;  // 请求的 provider
  providerActual?: string;     // 实际使用的 provider (与 provider 字段重复，用于明确性)
  fallbackUsed?: boolean;      // 是否发生了 fallback
  fallbackFrom?: string;       // fallback 来源 provider
  fallbackTo?: string;         // fallback 目标 provider
  fallbackReason?: string;     // fallback 原因
  taskType?: string;           // 任务类型
}
```

### 设计理由
1. **向后兼容**：所有新字段均为可选，现有代码无需修改
2. **明确语义**：`providerRequested` 和 `providerActual` 分开，避免混淆
3. **完整追溯**：包含完整的 fallback 路径和原因，便于调试
4. **任务上下文**：`taskType` 帮助理解调用场景

### Router 实现逻辑
- Primary provider 成功：设置 `providerRequested = primaryProvider.name`, `providerActual = response.provider`, `fallbackUsed = false`
- Fallback 发生：设置 `fallbackUsed = true`, `fallbackFrom = primaryProvider.name`, `fallbackTo = fallbackProvider.name`, `fallbackReason = error.message`

## 2. Workflow 层 fallback 识别设计

### 关键改进点
1. **`runDeepResearchMemo` 返回完整 AIResponse**
   - 之前：返回 `string` (仅 content)
   - 现在：返回 `AIResponse` (含元数据)
   - 原因：需要获取 provider 和 fallback 信息

2. **双重 fallback 检测**
   ```typescript
   // 场景1: research 抛错 (原有逻辑)
   if (researchMemoFailed) {
     deepResult.metadata.deep_fallback_reason = 'research_memo_failed';
   }
   
   // 场景2: research 成功但 fallback 发生 (新增逻辑)
   else if (researchFallbackUsed) {
     deepResult.metadata.deep_fallback_reason = 'research_provider_fallback';
   }
   ```

3. **完整 metadata 传递**
   - 新增 `research_provider_requested`, `research_provider_actual`
   - 新增 `research_fallback_used`, `research_fallback_reason`
   - 新增 `research_fallback_from`, `research_fallback_to`
   - 新增 `research_memo_available` (memo 是否有效)
   - 新增 `deep_diagnosis_executed` (深度诊断是否执行)

### 数据流向
```
AI Router → AIResponse (含元数据) → runDeepResearchMemo → workflow 变量 → deepResult.metadata
```

## 3. 严格模式 `DEEP_RESEARCH_STRICT_METASO` 设计

### 行为定义
| 模式 | fallback 发生时的行为 |
|------|-------------------|
| **严格模式关闭** (默认) | 允许 fallback，在 metadata 中标记 `research_fallback_used = true` |
| **严格模式开启** | 禁止 fallback，抛出错误，触发 `researchMemoFailed` 路径 |

### 实现位置
```typescript
// 在 runDeepResearchMemo 中检查
const strictMode = process.env.DEEP_RESEARCH_STRICT_METASO === 'true';
if (strictMode && response.fallbackUsed) {
  throw new Error(`Deep research strict mode enabled: fallback from ${response.fallbackFrom} to ${response.fallbackTo} not allowed. Reason: ${response.fallbackReason}`);
}
```

### 设计理由
1. **默认宽松**：保持现有生产流量不受影响，仅增加可观测性
2. **逐步收紧**：可通过环境变量开启严格模式，验证业务影响
3. **明确失败**：严格模式下 fallback 即失败，避免语义混淆
4. **错误信息友好**：包含 fallback 路径和原因，便于排查

## 4. 向后兼容性设计

### 不破坏的现有行为
1. **API 响应格式**：所有新字段均在 `metadata` 内，顶层结构不变
2. **基础诊断**：非 deep 模式完全不受影响
3. **错误处理**：原有 `deep_fallback_reason` 和 `deep_fallback_message` 仍有效
4. **日志格式**：结构化日志新增字段，不影响现有日志解析

### 渐进式升级路径
1. **阶段1**：部署代码，新字段默认不显示（依赖环境变量）
2. **阶段2**：前端更新，消费新 metadata 字段显示 provider 信息
3. **阶段3**：根据业务需要，选择性开启严格模式

## 5. 为什么这样设计能兼容当前业务

### 对用户透明
- 非 deep 模式：无任何变化
- deep 模式（宽松）：行为不变，仅 metadata 增加信息
- deep 模式（严格）：仅当明确配置时才改变行为

### 对运维友好
- 所有 fallback 都有明确日志记录
- metadata 字段可被监控系统采集
- 无需代码变更即可通过环境变量调整策略

### 对前端可选
- 前端可逐步适配新 metadata 字段
- 未适配时，fallback 仍可通过原有 `deep_fallback_reason` 检测
- 提供完整的 provider 信息供 UI 展示

## 6. 关键决策点

### 决策1：扩展 AIResponse 而非新建类型
- **选择**：扩展现有接口
- **理由**：最小化改动，所有现有调用自动获得新字段（可选）

### 决策2：在 router 层而非 provider 层添加元数据
- **选择**：router 层添加
- **理由**：只有 router 知道 fallback 决策，provider 只关心自身调用

### 决策3：严格模式抛出错误而非返回特殊状态
- **选择**：抛出错误
- **理由**：与现有错误处理流程一致，触发 `researchMemoFailed` 路径

### 决策4：新增 metadata 字段而非复用现有
- **选择**：新增专用字段
- **理由**：语义清晰，避免字段重载混淆，便于文档和类型检查