# Claude Code 提示词：修复 OfferPilot-Web Deep 模式无法正确调用 Metaso

你现在在 **OfferPilot-Web** 仓库根目录。你的任务不是只做代码审阅，而是要：

1. **先深度审计代码路径**，确认 Deep 模式为什么没有稳定调用 Metaso。
2. **在仓库内直接修复**问题，要求尽量小改动、可回滚、可验证。
3. **修复后自己验证**，并输出一组固定文件，方便我把结果再交给另一个模型做更高阶分析。

---

## 一、背景与已知线索

我已经有一份初步诊断，怀疑点包括但不限于：

- `DUAL_AI_ENABLED` 未配置或未生效，导致 deep 路径未进入。
- `METASO_API_KEY` 缺失或为空，导致 provider 直接失败。
- `METASO_API_BASE_URL` 非法或格式错误。
- `lib/ai/providers/metaso.ts` 里存在断路器，之前连续失败后可能直接拒绝请求。
- `lib/ai/router.ts` 里 `research` 任务可能允许 fallback，Metaso 失败后会退回 DeepSeek，造成“看似 Deep 正常、其实没用秘塔”的假象。
- `lib/diagnose/v2/workflow.ts` 里的 `runDeepResearchMemo` 可能吞错，只记 warning 并把 `researchMemo` 置空，导致主流程继续但研究结果缺失。
- 前端请求可能没有显式传 `diagnose_mode: "deep"`，默认落回 basic。
- `AI_TIMEOUT_MS`、`AI_RETRY_MAX`、`AI_CIRCUIT_FAIL_THRESHOLD` 等配置可能导致误熔断或超时。

你必须基于真实代码确认，不要把上述内容当成事实照单全收。

---

## 二、工作目标

你的目标是做到下面 6 件事：

### 目标 1：找出“真正的主因”与“次要诱因”
不要只给可能性列表。请明确区分：

- **主因（Primary Root Cause）**
- **次因（Secondary Contributing Factors）**
- **会制造误导的现象（Misleading Symptoms）**

### 目标 2：修复 Deep 模式到 Metaso 的调用链
修复后必须满足：

- 当前端传 `diagnose_mode: "deep"` 且 `DUAL_AI_ENABLED === "true"` 时，深度路径会进入。
- `research` 任务默认优先走 Metaso。
- 如果 Metaso 失败，日志里必须能明确看出失败原因、是否 fallback、最终用了哪个 provider。
- 不能再出现“静默失败但表面成功”的情况，至少要让调试时可观测。

### 目标 3：保留生产可用性
不要为了排障把线上稳定性全部破坏。你可以做这些事：

- 增加结构化日志
- 增加 debug 开关
- 改善错误消息
- 把 silent catch 改成“记录充分上下文后再决定是否继续”
- 给 fallback 增加显式标记

但不要做这些高风险改动，除非代码证明确有必要：

- 全量重写 AI Router
- 大范围改动接口协议
- 随意删除断路器
- 把所有异常都改成 hard fail 而不分环境

### 目标 4：补充验证材料
修复后，请自行生成验证文件，证明：

- deep 请求条件正确
- Metaso provider 被真正调用
- fallback 行为可见
- 配置检查更清晰
- 至少有一条测试或脚本能复现/验证关键链路

### 目标 5：输出可交付文件
你必须在仓库根目录创建一个目录：

`deep-metaso-fix-output/`

并输出以下文件：

1. `01_root_cause.md`
2. `02_code_changes.md`
3. `03_verification.md`
4. `04_manual_actions_required.md`
5. `05_env_checklist.md`
6. `debug_curl_examples.sh`
7. `final_patch.diff`

### 目标 6：如果你无法完成某一步，必须如实写入文件
不要假装完成。凡是以下类型问题，请明确写到 `04_manual_actions_required.md`：

- 需要真实线上环境变量才能验证
- 需要真实 Metaso Key 才能验证
- 需要部署平台权限才能验证
- 需要前端手工点按或浏览器 network panel 才能验证
- 需要查看运行时日志或第三方平台状态

---

## 三、执行顺序（严格按顺序）

### 第 1 步：先理解项目结构
先做只读检查，至少完成以下动作：

- 浏览仓库目录结构
- 搜索以下关键词并定位文件：
  - `diagnose_mode`
  - `DUAL_AI_ENABLED`
  - `METASO_API_KEY`
  - `METASO_API_BASE_URL`
  - `AI_TIMEOUT_MS`
  - `AI_RETRY_MAX`
  - `AI_CIRCUIT_FAIL_THRESHOLD`
  - `runDeepResearchMemo`
  - `researchMemo`
  - `fallback`
  - `Circuit breaker`
  - `metaso`
  - `deepseek`
  - `/api/diagnose`

重点审阅这些路径（如果存在）：

- `app/api/diagnose/route.ts`
- `lib/diagnose/v2/workflow.ts`
- `lib/ai/router.ts`
- `lib/ai/providers/metaso.ts`
- `lib/diagnose/types.ts`

如果实际文件路径不同，请根据仓库真实结构调整，不要因为路径不完全一致就中断任务。

### 第 2 步：画出真实调用链
请根据代码整理调用链，至少回答这些问题：

1. deep 请求从哪里进入？
2. 进入 deep 的必要条件是什么？
3. deep workflow 如何调用 research memo？
4. research task 最终如何映射到 Metaso provider？
5. fallback 条件是什么？
6. 哪些地方会吞错？
7. 哪些地方会让日志误导人？
8. 断路器状态存放在哪里？是进程内状态还是持久化状态？

把这部分写到 `01_root_cause.md`。

### 第 3 步：确认“最可能主因”
不要只列可能性。请结合代码回答：

- 哪个问题最可能导致“Deep 模式看起来正常，但并没有真正使用 Metaso”？
- 哪个问题最可能导致“Deep 模式直接退化为 basic 或普通流程”？
- 哪个问题最可能导致“修复变量后依然失败”？

请在 `01_root_cause.md` 中写出：

- 主因
- 次因
- 证据（文件 + 代码逻辑）
- 风险说明

### 第 4 步：实施修复
请直接修改代码。修复原则：

#### 4.1 入口可观测
在 `/api/diagnose` 入口附近增加结构化日志，至少包含：

- `diagnose_mode`
- `DUAL_AI_ENABLED` 的原始值和布尔判断值
- 是否存在 `METASO_API_KEY`
- `METASO_API_BASE_URL` 是否存在
- 本次是否进入 deep 流程

注意：
- 日志中不得泄露完整 API Key
- 可以记录长度、前缀、是否存在

#### 4.2 Router 可观测
在 AI router 中增加结构化日志，至少包含：

- 当前 task
- primary provider
- primary failure 原因
- 错误是否 retryable
- 是否触发 fallback
- fallback 后使用了哪个 provider

#### 4.3 Provider 可观测
在 Metaso provider 中增加必要日志，至少包含：

- breaker 当前状态
- fail count
- threshold
- 是否因 breaker open 而拒绝请求
- base URL 校验失败原因
- 非 2xx 响应时的状态码与摘要

#### 4.4 减少 silent failure
对 `runDeepResearchMemo` 相关逻辑进行改造，目标是：

- 不再出现“researchMemo 为空但没有可追踪上下文”的情况
- 至少在 debug 或 server log 中能明确看到失败的异常信息
- 如果保留继续执行逻辑，也必须把“Deep 研究阶段失败”写清楚

#### 4.5 保持 fallback，但让它可见
不要简单粗暴删除 fallback，除非代码证明 fallback 本身就是 bug。

更优方案：

- 保留 fallback
- 明确记录 fallback 发生
- 把最终使用的 provider 带到日志或返回元信息中（如果项目风格允许）

#### 4.6 环境变量校验更清晰
如果当前项目没有统一的 env 校验逻辑，请新增最小必要的校验工具或辅助函数，使这些错误更容易定位：

- `DUAL_AI_ENABLED` 未开启
- `METASO_API_KEY` 缺失
- `METASO_API_BASE_URL` 非法

### 第 5 步：补充验证能力
你必须至少完成其中两项：

1. 新增或修复测试（单元测试 / 集成测试）
2. 新增一个最小调试脚本
3. 新增一个可执行的 curl 示例脚本
4. 新增一个内部 debug endpoint（仅限开发环境、且风险可控）

验证能力的目标是：

- 能证明 deep 请求条件判断正确
- 能证明 Metaso provider 路径被调用
- 能证明 fallback 被显式记录
- 能证明 silent catch 已改善

### 第 6 步：运行检查
请根据仓库现状尽可能运行：

- lint
- typecheck
- test
- build

如果某个命令不存在，就如实记录。

所有执行过的命令、结果、失败原因，都写到 `03_verification.md`。

### 第 7 步：产出最终文件
请在 `deep-metaso-fix-output/` 中生成：

#### `01_root_cause.md`
必须包含：
- 问题摘要
- 真实调用链
- 主因
- 次因
- 误导性现象
- 风险点

#### `02_code_changes.md`
必须包含：
- 改了哪些文件
- 每个文件改了什么
- 为什么这么改
- 哪些改动是为了 debug
- 哪些改动是正式修复

#### `03_verification.md`
必须包含：
- 运行过的命令
- 输出摘要
- 哪些通过
- 哪些失败
- 为什么失败
- 如何手工进一步验证

#### `04_manual_actions_required.md`
必须包含：
- 需要我手工做的事情
- 按优先级排序
- 每一步要在哪里做
- 预期看到什么结果
- 异常情况下如何判断

#### `05_env_checklist.md`
必须包含：
- 所有关键环境变量
- 正确示例
- 错误示例
- 部署后是否需要重启或重新部署
- 如何验证变量已经在运行时生效

#### `debug_curl_examples.sh`
至少提供：
- 检查 `/api/diagnose` 的示例
- 检查 Metaso API 可用性的示例
- 如果适合，提供 debug endpoint 的示例

#### `final_patch.diff`
导出最终补丁，方便我快速审阅。

---

## 四、输出风格要求

你在终端总结时请按下面格式输出：

1. **一句话结论**：主因是什么
2. **修复摘要**：改了哪几类问题
3. **验证摘要**：哪些验证通过了，哪些还需要我手工做
4. **最重要的下一步**：我现在应该先做什么

不要只说“已修复”。必须写清楚有没有真实验证到：

- deep 模式进入
- Metaso provider 被调用
- fallback 可见
- 环境变量检查可见

---

## 五、禁止事项

请不要做这些事情：

- 不要伪造线上验证结果
- 不要假装调用成功，如果没有真实 key 或网络环境支撑
- 不要把完整 API Key 写入日志、文件或 diff
- 不要因为发现 fallback 就直接删除整套容错逻辑
- 不要输出空泛建议而不改代码

---

## 六、加分项（可做可不做）

如果项目风格允许，可以额外做这些增强：

- 在 diagnose 响应中加入非敏感调试字段，例如 `provider_used` 或 `deep_diagnosis_enabled`
- 给断路器增加更明确的 reset 说明
- 给开发环境增加一个只读状态检查接口
- 在文档中补一节“为什么 Deep 模式看似成功却没走 Metaso”

---

## 七、开始执行

现在开始执行，先审计后修复，不要跳过审计。

最终务必产出：

- 修复后的代码
- `deep-metaso-fix-output/` 目录及全部文件
- 终端摘要

如果你发现仓库实际结构和上面路径不同，请根据真实结构继续完成任务，不要中断。
