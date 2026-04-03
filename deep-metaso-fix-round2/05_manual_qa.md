# 人工验收步骤

## 验收目标
验证深度诊断的 provider 追踪和 fallback 标记功能是否按预期工作。

## 环境准备

### 1. 环境变量配置
```bash
# .env.local 或部署环境
METASO_API_KEY=有效的_Metaso_API_Key  # 或故意配置无效值以触发 fallback
DEEPSEEK_API_KEY=有效的_DeepSeek_API_Key
DUAL_AI_ENABLED=true  # 必须开启
DEEP_RESEARCH_STRICT_METASO=false  # 默认值，测试时可根据需要调整
```

### 2. 启动服务
```bash
npm run build
npm start
# 或开发模式
npm run dev
```

## 测试场景

### 场景1：Normal Metaso Success（正常 Metaso 成功）

#### 测试目的
验证当 Metaso 服务正常时，research 阶段使用 Metaso，且 metadata 正确记录。

#### 步骤
1. 确保 `METASO_API_KEY` 有效，Metaso 服务可达
2. 发送深度诊断请求：
   ```bash
   curl -X POST http://localhost:3000/api/diagnose \
     -H "Content-Type: application/json" \
     -d '{
       "resume_text": "软件工程师，5年经验...",
       "target_role": "高级后端开发",
       "jd_text": "需要熟悉 Node.js, TypeScript...",
       "tier": "free",
       "diagnose_mode": "deep"
     }'
   ```
3. 检查响应中的 metadata 字段：
   ```json
   "metadata": {
     "diagnose_mode": "deep",
     "deep_diagnosis": true,
     "research_provider_requested": "metaso",
     "research_provider_actual": "metaso",
     "research_fallback_used": false,
     "research_memo_available": true,
     "deep_diagnosis_executed": true,
     "deep_fallback_reason": null,  // 应为 undefined 或不存在
     "deep_fallback_message": null  // 应为 undefined 或不存在
   }
   ```
4. 检查日志中应有：
   ```
   [DeepWorkflow] Research memo 成功
   providerRequested: metaso, providerActual: metaso, fallbackUsed: false
   ```

#### 预期结果
- ✅ `research_provider_requested` = "metaso"
- ✅ `research_provider_actual` = "metaso"  
- ✅ `research_fallback_used` = false
- ✅ 无 `deep_fallback_reason` 或 `deep_fallback_message`

### 场景2：Metaso Fallback to DeepSeek（Metaso 回退到 DeepSeek）

#### 测试目的
验证当 Metaso 失败但可重试时，router 自动 fallback 到 DeepSeek，且 metadata 正确标记 fallback。

#### 步骤
1. 配置无效的 `METASO_API_KEY` 或不可达的 `METASO_API_BASE_URL`：
   ```bash
   METASO_API_KEY=invalid_key_that_causes_401
   # 或
   METASO_API_BASE_URL=http://unreachable.metaso.cn
   ```
2. 发送相同的深度诊断请求
3. 检查响应 metadata：
   ```json
   "metadata": {
     "diagnose_mode": "deep",
     "deep_diagnosis": true,
     "research_provider_requested": "metaso",
     "research_provider_actual": "deepseek",  // 关键变化
     "research_fallback_used": true,          // 关键变化
     "research_fallback_reason": "包含错误信息",
     "research_fallback_from": "metaso",
     "research_fallback_to": "deepseek",
     "research_memo_available": true,
     "deep_diagnosis_executed": true,
     "deep_fallback_reason": "research_provider_fallback",  // 新增
     "deep_fallback_message": "研究阶段从 metaso 回退到 deepseek: ..."
   }
   ```
4. 检查日志中应有：
   ```
   [AIRouter] Falling back to deepseek
   [DeepWorkflow] 深度诊断 research provider fallback，已标记 fallback
   ```

#### 预期结果
- ✅ `research_provider_requested` = "metaso"
- ✅ `research_provider_actual` = "deepseek"
- ✅ `research_fallback_used` = true
- ✅ `research_fallback_from` = "metaso", `research_fallback_to` = "deepseek"
- ✅ `deep_fallback_reason` = "research_provider_fallback"
- ✅ 响应仍为成功的深度诊断结果（内容来自 DeepSeek）

### 场景3：Strict Mode Enabled（严格模式开启）

#### 测试目的
验证当严格模式开启时，Metaso fallback 不被允许，请求失败并返回明确的 fallback 标记。

#### 步骤
1. 设置环境变量：
   ```bash
   DEEP_RESEARCH_STRICT_METASO=true
   METASO_API_KEY=invalid_key  # 确保 Metaso 失败
   ```
2. 发送深度诊断请求
3. 检查响应：
   - **应返回基础诊断结果**（因深度诊断失败）
   - metadata 中应有：
     ```json
     "metadata": {
       "diagnose_mode": "deep",
       "deep_diagnosis": false,  // 关键变化
       "deep_fallback_reason": "research_memo_failed",
       "deep_fallback_message": "深度研究阶段失败: Deep research strict mode enabled: fallback from metaso to deepseek not allowed..."
     }
     ```
   - 新增的 research 字段可能为 `undefined`（因 research 失败）
4. 检查日志中应有：
   ```
   [DeepWorkflow] Research memo 失败，继续执行 synthesis
   [DeepWorkflow] 深度诊断 research memo 失败，已标记 fallback
   ```

#### 预期结果
- ✅ 返回基础诊断结果（非深度诊断）
- ✅ `deep_diagnosis` = false
- ✅ `deep_fallback_reason` = "research_memo_failed"
- ✅ 错误信息明确提及 "strict mode"

### 场景4：Strict Mode Disabled（严格模式关闭）

#### 测试目的
验证默认行为（严格模式关闭）下，fallback 被允许且标记正确。

#### 步骤
1. 设置环境变量：
   ```bash
   DEEP_RESEARCH_STRICT_METASO=false  # 或完全不设置
   METASO_API_KEY=invalid_key
   ```
2. 发送深度诊断请求
3. 检查响应应与**场景2**相同

#### 预期结果
- ✅ 返回深度诊断结果（内容来自 DeepSeek）
- ✅ `research_fallback_used` = true
- ✅ `deep_fallback_reason` = "research_provider_fallback"

### 场景5：Non-deep Mode（非深度模式）

#### 测试目的
验证基础诊断不受任何影响。

#### 步骤
1. 发送基础诊断请求：
   ```bash
   curl -X POST http://localhost:3000/api/diagnose \
     -H "Content-Type: application/json" \
     -d '{
       "resume_text": "软件工程师，5年经验...",
       "target_role": "高级后端开发",
       "jd_text": "需要熟悉 Node.js, TypeScript...",
       "tier": "free",
       "diagnose_mode": "basic"  # 或省略
     }'
   ```
2. 检查响应 metadata 中**不应有**新增的 research 字段

#### 预期结果
- ✅ 响应格式与之前完全相同
- ✅ 无 `research_*` 字段
- ✅ 无 `deep_diagnosis_executed` 字段

## 日志监控要点

### 关键日志标记
```
[AIRouter] Falling back to deepseek                    # fallback 发生
[DeepWorkflow] Research memo 成功                      # research 成功
[DeepWorkflow] 深度诊断 research provider fallback     # fallback 标记
[DeepWorkflow] Research memo 失败                      # research 失败
```

### 结构化日志字段检查
- `providerRequested`, `providerActual`
- `fallbackUsed`, `fallbackFrom`, `fallbackTo`
- `researchFallbackUsed`, `researchProviderActual`

## 前端集成检查（可选）

如果前端已更新以显示 provider 信息：

1. 在深度诊断结果页面，检查是否显示：
   - "研究阶段：使用 Metaso"（正常情况）
   - "研究阶段：使用 DeepSeek（回退自 Metaso）"（fallback 情况）
   - "深度诊断未执行：研究阶段失败"（严格模式失败）

2. 检查回退原因是否在适当位置展示（如工具提示或详情面板）

## 故障排查

### 常见问题
1. **无 research 字段**：检查 `DUAL_AI_ENABLED` 是否为 true
2. **字段值为 undefined**：检查日志确认 research 阶段是否执行
3. **严格模式无效**：检查环境变量名拼写和重启服务

### 调试建议
```bash
# 查看服务启动日志
npm run dev 2>&1 | grep -i "strict\|fallback\|provider"

# 临时修改环境变量
export DEEP_RESEARCH_STRICT_METASO=true
```

## 验收标准
- [ ] 场景1：正常 Metaso 成功，metadata 正确
- [ ] 场景2：Metaso fallback 到 DeepSeek，metadata 标记 fallback
- [ ] 场景3：严格模式开启，fallback 导致失败并明确标记
- [ ] 场景4：严格模式关闭，fallback 被允许并标记
- [ ] 场景5：基础诊断不受影响
- [ ] 所有场景日志记录完整

完成所有检查后，即可确认本轮修复成功。