# 代码改动清单

## 修改文件总览

| 文件路径 | 修改类型 | 影响范围 |
|----------|----------|----------|
| `lib/ai/types.ts` | 类型定义扩展 | AI 层所有调用 |
| `lib/ai/router.ts` | 逻辑增强 | AI 路由决策 |
| `lib/diagnose/types.ts` | 类型定义扩展 | 诊断响应 metadata |
| `lib/diagnose/v2/workflow.ts` | 逻辑重构 | 深度诊断工作流 |

## 详细改动说明

### 1. `lib/ai/types.ts` - AI 响应类型扩展

**改动性质**：正式修复（核心）

**改动内容**：
- 扩展 `AIResponse` 接口，新增可选元数据字段：
  ```typescript
  providerRequested?: string;
  providerActual?: string;
  fallbackUsed?: boolean;
  fallbackFrom?: string;
  fallbackTo?: string;
  fallbackReason?: string;
  taskType?: string;
  ```

**兼容性影响**：
- 所有字段均为可选，完全向后兼容
- 现有代码无需修改

### 2. `lib/ai/router.ts` - AI 路由器增强

**改动性质**：正式修复（核心）

**改动内容**：
- **Primary provider 成功路径**：增强返回的 `AIResponse`，添加元数据：
  ```typescript
  const enhancedResponse = {
    ...response,
    providerRequested: primaryProvider.name,
    providerActual: response.provider,
    fallbackUsed: false,
    taskType: task.type,
  };
  ```
- **Fallback 路径**：增强 fallback 响应的元数据：
  ```typescript
  const enhancedFallbackResponse = {
    ...fallbackResponse,
    providerRequested: primaryProvider.name,
    providerActual: fallbackResponse.provider,
    fallbackUsed: true,
    fallbackFrom: primaryProvider.name,
    fallbackTo: fallbackProvider.name,
    fallbackReason: error.message,
    taskType: task.type,
  };
  ```

**兼容性影响**：
- 返回类型不变，仅添加额外字段
- 不影响现有调用方

### 3. `lib/diagnose/types.ts` - 诊断元数据扩展

**改动性质**：正式修复（核心）

**改动内容**：
- 扩展 `ReportMetadata` 接口，新增深度研究追踪字段：
  ```typescript
  // 深度研究阶段 provider 追踪（Phase 5 使用）
  research_provider_requested?: string;
  research_provider_actual?: string;
  research_fallback_used?: boolean;
  research_fallback_reason?: string;
  research_fallback_from?: string;
  research_fallback_to?: string;
  research_memo_available?: boolean;
  deep_diagnosis_executed?: boolean;
  ```

**兼容性影响**：
- 所有字段均为可选，不影响现有响应结构
- 前端可逐步适配

### 4. `lib/diagnose/v2/workflow.ts` - 工作流逻辑重构

**改动性质**：正式修复（核心）

**改动内容**：

#### 4.1 `runDeepResearchMemo` 函数重构
- **返回类型变更**：从 `Promise<string>` 改为 `Promise<AIResponse>`
- **严格模式实现**：新增环境变量 `DEEP_RESEARCH_STRICT_METASO` 检查
- **Fallback 验证**：严格模式下如果发生 fallback 则抛出错误
- **代码位置**：第292-332行

#### 4.2 `runDeepDiagnoseWorkflow` 变量扩展
- **新增变量**：添加 research 阶段元数据变量：
  ```typescript
  let researchProviderRequested: string | undefined;
  let researchProviderActual: string | undefined;
  let researchFallbackUsed: boolean | undefined;
  let researchFallbackReason: string | undefined;
  ```
- **响应解析**：从 `AIResponse` 提取 content 和元数据
- **代码位置**：第514-552行

#### 4.3 元数据注入逻辑
- **新增逻辑**：无论 research 成功与否，都设置 research 阶段元数据
- **双重 fallback 检测**：
  ```typescript
  if (researchMemoFailed) {
    // 原有逻辑：research 抛错
  } else if (researchFallbackUsed) {
    // 新增逻辑：research 成功但 fallback 发生
    deepResult.metadata.deep_fallback_reason = 'research_provider_fallback';
    deepResult.metadata.deep_fallback_message = `研究阶段从 ${researchProviderRequested} 回退到 ${researchProviderActual}: ${researchFallbackReason}`;
  }
  ```
- **完整元数据设置**：设置所有新增的 `research_*` 字段
- **代码位置**：第554-600行

#### 4.4 日志增强
- **新增日志字段**：在关键日志点添加 provider 和 fallback 信息
- **结构化日志**：保持现有日志格式，增加新字段

**兼容性影响**：
- 函数签名变更：`runDeepResearchMemo` 返回 `AIResponse` 而非 `string`
- 影响范围：仅 `runDeepDiagnoseWorkflow` 调用此函数，已同步更新
- 行为变化：无破坏性变化，仅增加元数据收集

## 辅助改动

### 环境变量配置
**新增环境变量**：
```
DEEP_RESEARCH_STRICT_METASO=false  # 默认关闭，开启时禁止 research 阶段 fallback
```

**配置位置**：
- `.env.local` (开发环境)
- 部署环境变量配置

### 类型导入更新
- `workflow.ts` 新增导入：`import type { AIResponse } from '../../ai/types';`

## 非功能性改动

### 保留的第一轮修复价值
1. **结构化日志**：保留所有第一轮新增的日志点
2. **错误处理**：保留 `researchMemoFailed` 错误处理路径
3. **断路器状态**：保留 Metaso provider 的断路器逻辑

### 避免的冗余
1. **不重复添加日志**：仅在关键决策点增加必要日志
2. **不暴露敏感信息**：API key 等敏感信息仍被脱敏
3. **不修改非相关代码**：基础诊断、非 deep 模式完全不受影响