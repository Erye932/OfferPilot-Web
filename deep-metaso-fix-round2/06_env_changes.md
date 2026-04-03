# 环境变量变更说明

## 新增环境变量

### `DEEP_RESEARCH_STRICT_METASO`
**用途**：控制深度诊断 research 阶段是否允许 fallback

**类型**：布尔值（字符串 "true"/"false"）

**默认值**：`false`（宽松模式）

**有效值**：
- `"true"`：严格模式，禁止 research 阶段 fallback
- `"false"` 或未设置：宽松模式，允许 research 阶段 fallback

**行为影响**：

| 模式 | research 阶段 fallback 发生时 | 最终响应 | metadata 标记 |
|------|-----------------------------|----------|--------------|
| **宽松模式** (默认) | 允许，继续执行 synthesis | 深度诊断结果（来自 DeepSeek） | `research_fallback_used: true`<br>`deep_fallback_reason: "research_provider_fallback"` |
| **严格模式** | 禁止，抛出错误 | 基础诊断结果 + fallback 标记 | `deep_diagnosis: false`<br>`deep_fallback_reason: "research_memo_failed"` |

**配置位置**：
```bash
# .env.local（开发环境）
DEEP_RESEARCH_STRICT_METASO=false

# 生产环境（如 Vercel、Docker）
DEEP_RESEARCH_STRICT_METASO=false
```

## 现有环境变量影响

本次修改**不新增**对以下环境变量的依赖，但增强其可观测性：

### `METASO_API_KEY`
- **原有用途**：Metaso API 认证
- **增强效果**：当此 key 无效时，fallback 会被明确记录在 metadata 中

### `METASO_API_BASE_URL`
- **原有用途**：Metaso API 端点
- **增强效果**：当 URL 不可达时，fallback 会被明确记录

### `DUAL_AI_ENABLED`
- **原有用途**：控制是否启用双 AI 工作流
- **不变**：必须为 `true` 才能进入深度诊断工作流

## 各环境配置建议

### 开发环境
```bash
# .env.local
DEEP_RESEARCH_STRICT_METASO=false  # 开发时允许 fallback，便于测试
METASO_API_KEY=your_dev_key        # 可配置无效 key 测试 fallback 路径
DUAL_AI_ENABLED=true
```

### 测试环境
```bash
# 测试 fallback 功能
DEEP_RESEARCH_STRICT_METASO=false
METASO_API_KEY=invalid_key_to_trigger_fallback

# 测试严格模式
DEEP_RESEARCH_STRICT_METASO=true
METASO_API_KEY=invalid_key_to_trigger_failure
```

### 生产环境（默认）
```bash
# 初始部署 - 宽松模式，仅增强可观测性
DEEP_RESEARCH_STRICT_METASO=false

# 后续可根据业务需要调整为严格模式
# DEEP_RESEARCH_STRICT_METASO=true
```

### 灰度发布策略
```bash
# 环境A：10% 流量，严格模式
DEEP_RESEARCH_STRICT_METASO=true

# 环境B：90% 流量，宽松模式  
DEEP_RESEARCH_STRICT_METASO=false
```

## 环境变量优先级

### 读取顺序
1. `process.env.DEEP_RESEARCH_STRICT_METASO`（直接值）
2. 未设置 → 默认 `false`

### 类型转换逻辑
```typescript
const strictMode = process.env.DEEP_RESEARCH_STRICT_METASO === 'true';
// 只有明确设置为 "true" 字符串时才为严格模式
// "TRUE"、"True"、1、true 等均视为 false
```

## 向后兼容性

### 未设置时的行为
- 环境变量完全可选
- 未设置时：`strictMode = false`（宽松模式）
- 与代码修改前的行为一致（允许 fallback）

### 升级步骤
1. **阶段1（仅代码部署）**：不设置新变量，行为不变，仅增加 metadata 字段
2. **阶段2（前端适配）**：前端开始消费新增 metadata 字段
3. **阶段3（严格模式试点）**：对部分流量开启严格模式
4. **阶段4（全面严格）**：根据业务决定是否全面开启严格模式

## 监控与告警

### 建议监控的指标
1. **Fallback 率**：
   ```promql
   sum(rate(research_fallback_used_total[5m])) / sum(rate(research_requests_total[5m]))
   ```
2. **严格模式拒绝率**：
   ```promql
   sum(rate(strict_mode_rejections_total[5m])) / sum(rate(research_requests_total[5m]))
   ```

### 日志字段示例
```json
{
  "level": "INFO",
  "message": "Research memo 成功",
  "providerRequested": "metaso",
  "providerActual": "deepseek",
  "fallbackUsed": true,
  "fallbackReason": "Metaso API error (401)",
  "strictMode": false
}
```

## 故障排查

### 常见配置问题
1. **变量名拼写错误**：`DEEP_RESEARCH_STRICT_METASO`（注意下划线和大小写）
2. **值格式错误**：必须为字符串 `"true"` 或 `"false"`，布尔值 `true`/`false` 无效
3. **环境未重启**：修改后需要重启服务

### 验证命令
```bash
# 检查环境变量是否生效
curl -s http://localhost:3000/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"resume_text":"test","target_role":"test","diagnose_mode":"deep"}' \
  | jq '.metadata | {research_fallback_used, deep_fallback_reason}'
```

## 安全考虑
- 环境变量不包含敏感信息
- 严格模式仅影响业务逻辑，不影响安全
- 默认宽松模式确保不破坏现有生产流量