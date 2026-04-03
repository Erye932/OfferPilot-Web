# 学习型数据库数据入库时机与流程

## 概述
本数据库设计为三层结构：
1. **原始生产数据层**：现有 UploadedFile、DiagnoseSession、DiagnoseReport、UsageRecord
2. **服务沉淀层**：新增 Lead、ServiceCase、CaseSnapshot、DiagnosisLabel、RewritePair、FeedbackEvent
3. **知识学习层**：新增 KnowledgePattern、PatternEvidence

## 数据入库时机

### 1. 线索进来时 → Lead
**触发时机**：用户通过任何渠道（小红书、闲鱼、转介绍、直接访问等）首次接触。
**数据来源**：人工录入或渠道对接 API。
**写入操作**：`createLead()`
**提升价值**：建立渠道来源画像，优化获客策略。

### 2. 开始服务时 → ServiceCase
**触发时机**：用户同意接受服务（免费检查、基础修改、深度修改、定制等）。
**数据来源**：服务创建表单。
**写入操作**：`createServiceCase()`
**提升价值**：建立服务案例跟踪，记录服务类型与用户授权。

### 3. 跑完诊断后 → attachSessionToCase
**触发时机**：诊断接口完成，已创建 DiagnoseSession 和 DiagnoseReport。
**数据来源**：现有诊断接口 `persistDiagnoseResult()` 之后。
**写入操作**：`attachSessionToCase(serviceCaseId, diagnoseSessionId, diagnoseReportId)`
**提升价值**：关联服务案例与诊断结果，形成完整数据链。

### 4. 人工判断完成后 → DiagnosisLabel
**触发时机**：人工专家审阅诊断报告后，给出更精确的标签与风险评级。
**数据来源**：人工标注界面或后台管理工具。
**写入操作**：`saveDiagnosisLabel()`
**提升价值**：积累高质量诊断标签，提升 AI 诊断的准确性与风险识别能力。

### 5. 人工改写完成后 → RewritePair
**触发时机**：人工专家完成简历改写，产生“原文-改写后”对。
**数据来源**：改写工具或文本对比界面。
**写入操作**：`saveRewritePair()` 或 `saveRewritePairs()`
**提升价值**：积累改写模式库，为 AI 改写提供高质量训练数据。

### 6. 交付后 → FeedbackEvent(stage=after_delivery)
**触发时机**：交付最终简历给用户后，立即收集初步反馈。
**数据来源**：交付确认界面或自动触发。
**写入操作**：`saveFeedbackEvent({ stage: 'after_delivery', ... })`
**提升价值**：记录用户对交付成果的即时满意度。

### 7. 7天/30天回访 → FeedbackEvent(stage=day7/day30)
**触发时机**：交付后第7天、第30天主动回访。
**数据来源**：回访工具（问卷、电话、消息）。
**写入操作**：`saveFeedbackEvent({ stage: 'day7'/'day30', ... })`
**提升价值**：跟踪长期效果（面试数、Offer数），验证服务真实价值。

### 8. 周度沉淀 → KnowledgePattern + PatternEvidence
**触发时机**：每周数据复盘会议或自动化模式发现。
**数据来源**：从多个 ServiceCase 中提取共性模式。
**写入操作**：
- `createKnowledgePattern()` 创建新模式
- `attachPatternEvidence()` 关联证据案例
**提升价值**：形成可复用的诊断模式、改写模式、面试风险模式等，反哺产品智能。

## 最小落地方案

### 方案一：逐步增量写入
1. 先实现 `createServiceCase()` 和 `attachSessionToCase()`，在现有诊断接口后调用。
2. 人工标注流程独立，使用简单脚本或管理界面调用 `saveDiagnosisLabel()`。
3. 改写流程独立，使用简单脚本或工具调用 `saveRewritePair()`。
4. 反馈收集使用轻量表单调用 `saveFeedbackEvent()`。

### 方案二：集成到现有诊断流程
修改 `app/api/diagnose/route.ts` 中的 `persistDiagnoseResult()` 函数：
```typescript
// 在创建 session 和 report 后
const session = await prisma.diagnoseSession.create({...});
const report = await prisma.diagnoseReport.create({...});

// 如果存在 serviceCaseId（可通过请求头或参数传递）
if (serviceCaseId) {
  await attachSessionToCase(serviceCaseId, session.id, report.id);
}
```

### 方案三：独立管理后台
创建简单的管理页面（Next.js App Router）：
- `/admin/leads` - 线索管理
- `/admin/cases` - 服务案例管理
- `/admin/patterns` - 知识模式管理

## 数据质量飞轮

### 每层数据如何提升产品质量
| 数据层 | 提升方向 | 具体机制 |
|--------|----------|----------|
| **Lead** | 获客优化 | 分析渠道转化率，优化投放策略 |
| **ServiceCase** | 服务流程优化 | 跟踪服务类型分布，优化服务设计 |
| **DiagnosisLabel** | 诊断准确性提升 | 积累人工标注，训练 AI 判断更精准 |
| **RewritePair** | 改写质量提升 | 积累优质改写对，提升 AI 改写能力 |
| **FeedbackEvent** | 服务效果验证 | 跟踪用户满意度与真实就业结果 |
| **KnowledgePattern** | 产品智能增强 | 形成可复用模式库，反哺诊断与改写 |

### 形成专有知识资产
1. **标签库**：从 DiagnosisLabel 中提取高频问题标签。
2. **改写库**：从 RewritePair 中提取优质改写模式。
3. **反馈库**：从 FeedbackEvent 中提取有效服务模式。
4. **模式库**：从 KnowledgePattern 中提取可复用业务规则。

这些资产可：
- 增强现有 Corpus（语料库）质量
- 优化诊断提示词（prompts）
- 生成更精准的改写建议
- 预测简历投递风险
- 提供个性化职业建议

## 技术实施建议

### 优先级排序
1. **高优先级**：ServiceCase + attachSessionToCase（立即产生价值）
2. **中优先级**：DiagnosisLabel + RewritePair（积累核心知识）
3. **低优先级**：FeedbackEvent + KnowledgePattern（长期价值）

### 数据安全与合规
- `consentSaveRaw` 和 `consentUseAnonymized` 字段确保用户授权
- 敏感数据（原始简历）默认不存储，或存储时匿名化
- 定期清理过期数据，遵守数据保留策略

### 性能考虑
- 高频查询字段已加索引
- Json 字段仅用于高变结构数据
- 批量写入支持（如 saveRewritePairs）