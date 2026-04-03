# 第一轮修复遗留的 Gap 分析

## 核心问题
第一轮修复仅解决了“research 阶段抛错”场景下的 fallback 标记问题，但未覆盖“router 内部静默 fallback 成功”场景。

## 具体 Gap

### 1. `researchMemoFailed` 触发条件不足
- 第一轮：仅当 `runDeepResearchMemo` 抛出错误时才设置 `deep_fallback_reason = 'research_memo_failed'`
- 实际场景：AI router 在 Metaso 失败时自动 fallback 到 DeepSeek，并成功返回内容，此时 `runDeepResearchMemo` 不抛错
- 结果：research 阶段实际用了 DeepSeek，但 metadata 无任何 fallback 标记

### 2. AI router 返回值信息不完整
- 原有 `AIResponse` 只包含最终使用的 `provider`，缺少：
  - 请求的 provider (`providerRequested`)
  - 是否发生了 fallback (`fallbackUsed`)
  - fallback 路径 (`fallbackFrom`, `fallbackTo`)
  - fallback 原因 (`fallbackReason`)
- 导致 workflow 无法判断“成功但 fallback”的情况

### 3. 缺乏严格模式控制
- 无环境变量控制是否允许 research 阶段 fallback
- 产品语义上，用户选择“深度诊断”时，可能期望必须使用 Metaso 进行研究
- 缺少 `DEEP_RESEARCH_STRICT_METASO` 开关

### 4. 最终响应 metadata 字段不完整
- 已有 `deep_fallback_reason` 和 `deep_fallback_message` 仅覆盖错误场景
- 缺少 research 阶段 provider 追踪字段
- 前端无法区分“正常 Metaso 成功” vs “DeepSeek fallback 成功”

## 为什么仅靠 `researchMemoFailed` 不足以标记 fallback

```typescript
// 第一轮逻辑
if (researchMemoFailed) {
  deepResult.metadata.deep_fallback_reason = 'research_memo_failed';
}
```

- `researchMemoFailed` 为 true 仅当 `runDeepResearchMemo` 抛出异常
- 但 AI router 的设计是：当 primary provider (Metaso) 失败但可重试时，自动 fallback 到 secondary provider (DeepSeek)
- 此时 router 返回成功的 `AIResponse`（来自 DeepSeek），不抛异常
- 因此 `researchMemoFailed` 为 false，fallback 被完全隐藏

## 影响
1. **产品语义错误**：用户看到“深度诊断”结果，误以为 Metaso 参与了研究
2. **可观测性缺失**：运维无法从监控区分正常流量和 fallback 流量
3. **质量评估偏差**：产品团队无法准确评估 Metaso 服务的真实可用性
4. **故障排查困难**：当 DeepSeek 的 research 质量不如 Metaso 时，无法追溯根因

## 本轮修复目标
1. 在 AI router 返回值中增加 fallback 元数据
2. 在 workflow 中检测并传递“成功但 fallback”场景
3. 新增严格模式开关
4. 在最终响应 metadata 中完整暴露 research 阶段 provider 信息