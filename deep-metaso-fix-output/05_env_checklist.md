# 环境变量检查清单

## 核心变量（深度诊断必需）

### 1. `DUAL_AI_ENABLED`
**用途**：启用双 AI 工作流，控制是否允许 deep 模式
**类型**：布尔值（字符串）
**有效值**：`"true"` | 其他任何值视为 false
**默认值**：无（必须显式设置）

**正确示例**：
```bash
DUAL_AI_ENABLED=true
```

**错误示例**：
```bash
DUAL_AI_ENABLED=false  # deep 模式将 fallback 到 basic
DUAL_AI_ENABLED=1      # 字符串 "1" 不等于 "true"，视为 false
```

**验证方法**：
```javascript
process.env.DUAL_AI_ENABLED === 'true'  // 必须严格等于字符串 "true"
```

**部署影响**：更改后需要重启服务

### 2. `METASO_API_KEY`
**用途**：秘塔搜索推理 API 的认证密钥
**类型**：字符串
**格式**：`mk-` 开头，32+ 字符，无空格

**正确示例**：
```bash
METASO_API_KEY=mk-2916966690C98B2D804AA980AD493978
```

**错误示例**：
```bash
METASO_API_KEY=                    # 空值
METASO_API_KEY=mk-xxx              # 过短
METASO_API_KEY="mk-xxx with spaces" # 含空格
METASO_API_KEY=sk-xxx              # 错误前缀（DeepSeek key）
```

**验证方法**：
- 长度检查：`key.length >= 30`
- 前缀检查：`key.startsWith('mk-')`
- 空格检查：`!/\s/.test(key)`

**安全注意**：
- 日志中仅记录前4字符和长度，不记录完整 key
- 在 CI/CD 中使用加密存储
- 定期轮换（如每90天）

### 3. `METASO_API_BASE_URL`
**用途**：秘塔 API 端点地址
**类型**：URL 字符串
**默认值**：如未设置，使用 `['https://api.metaso.cn', 'https://open.metaso.cn']`

**正确示例**：
```bash
METASO_API_BASE_URL=https://api.metaso.cn
```

**错误示例**：
```bash
METASO_API_BASE_URL=api.metaso.cn          # 缺少协议
METASO_API_BASE_URL=https://api.metaso.cn/ # 尾部斜杠（允许但可能影响）
METASO_API_BASE_URL=http://api.metaso.cn   # HTTP（应使用 HTTPS）
```

**验证方法**：
```javascript
new URL(process.env.METASO_API_BASE_URL)  // 不抛出异常
```

**网络要求**：
- 必须能从部署环境访问
- 建议测试连接性：`curl -I https://api.metaso.cn`

## AI Provider 配置变量

### 4. `AI_TIMEOUT_MS`
**用途**：单个 AI 请求超时时间（毫秒）
**类型**：整数
**默认值**：`120000`（2分钟）

**建议值**：
- 开发环境：`30000`（30秒）
- 生产环境：`120000`（2分钟）
- 高延迟网络：`180000`（3分钟）

**注意事项**：
- 超时后触发断路器计数
- 影响用户体验，不宜过短

### 5. `AI_RETRY_MAX`
**用途**：每个 API 基地址的最大重试次数
**类型**：整数
**默认值**：`2`

**建议值**：
- 生产环境：`2`（共3次尝试）
- 不稳定网络：`3`

**计算公式**：
总尝试次数 = `(maxRetries + 1) * baseUrls数量`

### 6. `AI_CIRCUIT_FAIL_THRESHOLD`
**用途**：断路器打开的失败阈值
**类型**：整数
**默认值**：`5`

**建议值**：
- 宽松策略：`10`
- 严格策略：`3`
- 生产默认：`5`

**效果**：
连续失败次数 ≥ 阈值时，断路器打开，后续请求直接拒绝

### 7. `AI_CIRCUIT_OPEN_MS`
**用途**：断路器保持打开的时间（毫秒）
**类型**：整数
**默认值**：`60000`（1分钟）

**建议值**：
- 快速恢复：`30000`（30秒）
- 保守恢复：`120000`（2分钟）

**恢复逻辑**：
打开后经过 `AI_CIRCUIT_OPEN_MS` 毫秒，断路器自动关闭

## 相关变量（非必需但影响体验）

### 8. `DEEPSEEK_API_KEY`
**用途**：DeepSeek API 密钥（用于基础诊断和 fallback）
**类型**：字符串
**格式**：`sk-` 开头

**注意**：
- 即使 Metaso 正常，deep 模式仍会调用 DeepSeek 进行 synthesis
- 必须配置，否则整个诊断服务不可用

### 9. `RATE_LIMIT_ENABLED`
**用途**：启用速率限制
**类型**：布尔值（字符串）
**默认**：`false`（开发环境）

**生产建议**：
```bash
RATE_LIMIT_ENABLED=true
```

### 10. `DATABASE_URL`
**用途**：PostgreSQL 连接字符串
**注意**：深度诊断结果会落库，但数据库故障不会阻塞诊断

## 环境分组配置

### 开发环境（.env.local）
```bash
DUAL_AI_ENABLED=true
METASO_API_KEY=mk-test_key_here
METASO_API_BASE_URL=https://api.metaso.cn
AI_TIMEOUT_MS=30000
AI_RETRY_MAX=1
AI_CIRCUIT_FAIL_THRESHOLD=3
AI_CIRCUIT_OPEN_MS=30000
RATE_LIMIT_ENABLED=false
```

### 生产环境
```bash
DUAL_AI_ENABLED=true
METASO_API_KEY=mk-production_key_here
METASO_API_BASE_URL=https://api.metaso.cn
AI_TIMEOUT_MS=120000
AI_RETRY_MAX=2
AI_CIRCUIT_FAIL_THRESHOLD=5
AI_CIRCUIT_OPEN_MS=60000
RATE_LIMIT_ENABLED=true
```

### 测试环境（集成测试）
```bash
DUAL_AI_ENABLED=false  # 禁用深度，避免外部依赖
METASO_API_KEY=mk-dummy  # 虚拟 key，期望失败
```

## 验证脚本

创建 `check_env.sh`：
```bash
#!/bin/bash
echo "检查环境变量..."
echo "DUAL_AI_ENABLED=${DUAL_AI_ENABLED:-未设置}"
echo "METASO_API_KEY=${METASO_API_KEY:+(已设置，长度 ${#METASO_API_KEY})}"
echo "METASO_API_BASE_URL=${METASO_API_BASE_URL:-未设置}"

if [[ "$DUAL_AI_ENABLED" == "true" ]]; then
  if [[ -z "$METASO_API_KEY" ]]; then
    echo "❌ 错误: DUAL_AI_ENABLED=true 但 METASO_API_KEY 未设置"
    exit 1
  fi
  echo "✅ 深度诊断配置完整"
else
  echo "⚠️  深度诊断未启用 (DUAL_AI_ENABLED!=true)"
fi
```

## 部署检查清单

### 首次部署
- [ ] 设置所有必需变量
- [ ] 验证变量格式（使用验证脚本）
- [ ] 测试 API key 有效性（可选）
- [ ] 配置日志系统接收结构化日志

### 变量变更后
- [ ] 重启服务进程
- [ ] 发送测试请求验证功能
- [ ] 检查错误日志
- [ ] 更新文档（如变更默认值）

### 定期维护
- [ ] 检查 API key 过期时间
- [ ] 轮换密钥（如有必要）
- [ ] 评估超时和重试配置
- [ ] 监控断路器状态

## 故障排查

### 症状：深度诊断返回 basic 结果
1. 检查 `DUAL_AI_ENABLED` 是否为 `"true"`
2. 检查 `METASO_API_KEY` 是否存在且有效
3. 查看日志中 `DiagnoseAPI` 的入口检查

### 症状：Metaso 调用失败但无 fallback
1. 检查 `AIProviderError.isRetryable` 逻辑
2. 查看 `AIRouter` 日志中的 `fallbackAvailable`
3. 确认错误是否为不可重试类型（如密钥格式错误）

### 症状：断路器一直打开
1. 检查 `AI_CIRCUIT_OPEN_MS` 值
2. 查看系统时间是否同步
3. 确认 `circuitState.lastFailTime` 是否更新

### 症状：响应时间过长
1. 调整 `AI_TIMEOUT_MS` 为更低值
2. 减少 `AI_RETRY_MAX`
3. 考虑网络延迟优化