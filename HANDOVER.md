# OfferPilot 项目交接文档

> 日期：2026-04-23
> 状态：Agent 脚本已裁剪；仅保留真实搜索线索工具；API Key 与 Hermes 配置待处理

---

## 一、项目概况

**产品**：OfferPilot - AI简历诊断平台
**目标**：跑通 AI 简历诊断平台，并用真实发布、真实提交、真实反馈形成可验证商业闭环
**技术栈**：Next.js + Vercel + PostgreSQL + DeepSeek AI + Hermes Agent

---

## 二、已完成内容

### 2.1 后端API（可正常运行）

| API端点 | 状态 | 说明 |
|---------|------|------|
| POST /api/diagnose/tasks | ✅ | 创建诊断任务 |
| GET /api/diagnose/tasks/{id} | ✅ | 查询任务状态 |
| GET /api/diagnose/report/{id} | ✅ | 获取诊断报告 |
| POST /api/internal/diagnose-worker | ✅ | 执行诊断任务 |

**部署地址**：https://offerpilot-web.vercel.app

### 2.2 知识库数据

位置：`offerpilot-corpus/distilled/`

| 文件 | 数量 | 说明 |
|------|------|------|
| diagnosis-rules.json | 49条 | 诊断规则 |
| insider-views.json | 32条 | 内行视角 |
| rewrite-patterns.json | 29条 | 改写模式 |

**问题**：用户认为数据质量不够，需要扩展真实案例。

### 2.3 Agent 脚本清理结果（已裁剪）

位置：`agents/`

当前只保留：

| 脚本 | 功能 | 状态 |
|------|------|------|
| pain-radar-tavily.ts | Tavily 自动搜索热点线索 | 保留，需人工判断 |

已删除：

| 脚本 | 删除原因 |
|------|------|
| orchestrator.ts | 调度模拟脚本，会制造“自动化商业闭环”错觉 |
| pain-radar.ts | 预设痛点库 + 随机热度，不是真实平台扫描 |
| content-factory.ts | 生成泛营销文案，不能直接发布 |
| content-strategist.ts | 强营销策略和虚假案例风险，不符合当前发布标准 |
| monetization.ts | 模拟交易、模拟转化率、模拟收入，不能用于决策 |
| data-engine.ts | mock 简历解析，不是真实数据清洗链路 |
| evolution.ts | mock 用户反馈，还可能改写知识库规则，风险高 |

**运行方式**：
```bash
cd C:/Users/Administrator/Desktop/offerpilot-web
npx tsx agents/pain-radar-tavily.ts --query="简历 求职 2026"
```

### 2.4 Coze对接

- **API文档**：`coze-integration.md`
- **教程**：`docs/coze-workflow-tutorial.md`
- **状态**：教程已写，用户实际配置时卡在HTTP节点参数设置

### 2.5 Hermes Agent安装

- **版本**：v0.10.0
- **安装位置**：WSL Ubuntu `/root/.hermes/`
- **数据目录**：`/mnt/d/hermes-data/`（对应Windows D盘）
- **启动命令**：`wsl -d Ubuntu -e bash -lc "hermes chat"`

---

## 三、未解决问题（Critical）

### 3.1 API Key全部无效 ❌

| Key | 来源 | 测试结果 | 状态 |
|-----|------|----------|------|
| `sk-f8ff6e2ad0c54251b7adb1515c4c87c6` | DeepSeek官方 | Authentication Fails | ❌失效 |
| `sk-gV1gIpH1Na9IHQJ52efKhtHlNiTd2xNXF9DSUhUByUTOAKUH` | Kimi官方 | Incorrect API key | ❌失效 |
| `sk-WX8Y85Y76xelLEGDePap1ikfqOUAWM6xfXaIHhodmImPOOar` | Kimi官方（新） | Incorrect API key | ❌可能被泄露检测禁用 |
| `sk-UbTACinmIBJT67Oqd3QpzLDIejovO796dlvy7X3kbC4v6nKX` | gpt-agent.cc | Invalid token | ❌失效 |
| `sk-xh0IhqEsXlegV5I3CA9doHEORTDYMdZWWvXXN17e85TiPRQL` | rsxermu666.cn | 之前能通 | ❌用户确认已过期 |

**阻塞影响**：
- Hermes Agent无法启动聊天
- 诊断工作流无法调用AI
- 被删除的模拟 Agent 脚本无法提供真实业务判断

### 3.2 WSL新实例

- 用户刚创建了新的Ubuntu WSL实例
- 需要重新配置用户、PATH、代理等
- Hermes配置可能需要重新写入

---

## 四、关键配置信息

### 4.1 环境变量（.env.local）

```bash
DATABASE_URL="postgresql://postgres:14521452@localhost:5432/offerpilot?schema=public"
DEEPSEEK_API_KEY=sk-f8ff6e2ad0c54251b7adb1515c4c87c6  # 已失效
METASO_API_KEY=mk-2916966690C98B2D804AA980AD493978
METASO_API_BASE_URL=https://metaso.cn/api
TAVILY_API_KEY=[REDACTED]  # 有效，1000次/月
AI_PRIMARY_PROVIDER=deepseek
AI_TIMEOUT_MS=180000
DUAL_AI_ENABLED=true
```

### 4.2 Hermes配置路径

```
WSL内：/root/.hermes/config.yaml
Windows对应：\\wsl$\Ubuntu\root\.hermes\config.yaml
数据目录：D:\hermes-data\
```

### 4.3 Tavily API（可用）

- **Key**：`[REDACTED]`
- **状态**：有效，剩余约998次/月
- **用途**：痛点雷达自动搜索热点

---

## 五、下一步行动清单

### Priority 1：解决API Key（阻塞一切）

1. 获取一个**确认有效**的API Key
   - 建议：OpenRouter（一个Key通吃所有模型）
   - 或：重新注册DeepSeek/Kimi，生成新Key
   - **关键**：先在本地curl测试通过，再配进Hermes

2. 配置Hermes
   ```bash
   wsl -d Ubuntu
   su -
   nano /root/.hermes/config.yaml
   # 修改 base_url, api_key, model
   ```

3. 启动Hermes验证
   ```bash
   hermes chat
   # 输入：你好
   # 期望：AI正常回复
   ```

### Priority 2：只保留真实数据线索工具

`agents/` 目录当前只保留 `pain-radar-tavily.ts`：
- 可用于搜索简历/求职相关热点线索；
- 输出只能作为选题参考；
- 不得直接把生成结果当成真实需求验证或发布文案。

已删除的模拟脚本不再注册为 Hermes 工具。

### Priority 3：跑通商业闭环

1. 每天运行痛点雷达
2. 生成文案发小红书
3. 闲鱼接单
4. 收集反馈优化规则

---

## 六、文件位置速查

| 内容 | 路径 |
|------|------|
| 项目根目录 | `C:/Users/Administrator/Desktop/offerpilot-web` |
| Agent脚本 | `C:/Users/Administrator/Desktop/offerpilot-web/agents/` |
| 知识库 | `C:/Users/Administrator/Desktop/offerpilot-web/offerpilot-corpus/distilled/` |
| Coze文档 | `C:/Users/Administrator/Desktop/offerpilot-web/coze-integration.md` |
| Hermes数据 | `D:/hermes-data/` |
| Tavily输出 | `C:/Users/Administrator/Desktop/offerpilot-web/outputs/pain-radar/` |
| 文案策略 | `C:/Users/Administrator/Desktop/offerpilot-web/outputs/content-strategy/` |

---

## 七、联系人/资源

- **用户目标**：7月参加黑客松，需要提交作品
- **核心诉求**：用真实工具、真实发布、真实反馈形成可变现和可展示资产，不再依赖模拟 Agent 叙事
- **当前情绪**：对API Key问题感到沮丧，希望尽快跑通

---

## 八、已知坑

1. **WSL编码问题**：PowerShell调用WSL时输出乱码，用纯bash命令更稳定
2. **Hermes模型名**：不要瞎猜，先查询API支持的模型列表
3. **Key安全**：不要在对话/截图中暴露API Key，会被平台自动禁用
4. **代理配置**：WSL2 NAT模式下，Windows的localhost代理不会自动映射到WSL

---

*文档由 Claude 生成，2026-04-23*
