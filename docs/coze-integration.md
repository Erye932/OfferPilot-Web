# Coze 工作流对接文档

> **重要说明**：本文档中请求/响应 JSON 为符合接口 schema 的示例，非生产环境真实调用返回。生产样例需实际调用后获取。

---

## 接口一：POST /api/diagnose/tasks

创建异步诊断任务。

**URL**: `https://offerpilot-web.vercel.app/api/diagnose/tasks`

**Method**: `POST`

**Headers**:
```
Content-Type: application/json
```

**请求体**:
```json
{
  "resume_text": "张三\n北京大学 计算机硕士\n字节跳动 | 后端工程师 | 2022.07 - 2024.06\n- 负责用户增长系统后端开发",
  "target_role": "后端开发工程师",
  "jd_text": "3年以上Java开发经验\n熟悉Spring、MySQL",
  "tier": "free",
  "diagnose_mode": "basic"
}
```

**成功返回**（HTTP 200）:
```json
{
  "task_id": "cmxxxxx123456789",
  "status": "queued"
}
```

**失败返回**（HTTP 400/500）:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "缺少必要参数：resume_text 和 target_role"
  }
}
```

---

## 接口二：GET /api/diagnose/tasks/{task_id}

查询任务状态。

**URL**: `https://offerpilot-web.vercel.app/api/diagnose/tasks/{task_id}`

**Method**: `GET`

**Headers**:
```
Content-Type: application/json
```

**status=queued 返回**:
```json
{
  "task_id": "cmxxxxx123456789",
  "status": "queued",
  "report_id": null,
  "error_message": null,
  "created_at": "2026-04-15T10:30:00.000Z",
  "updated_at": "2026-04-15T10:30:00.000Z",
  "started_at": null,
  "finished_at": null
}
```

**status=running 返回**:
```json
{
  "task_id": "cmxxxxx123456789",
  "status": "running",
  "report_id": null,
  "error_message": null,
  "created_at": "2026-04-15T10:30:00.000Z",
  "updated_at": "2026-04-15T10:30:05.000Z",
  "started_at": "2026-04-15T10:30:05.000Z",
  "finished_at": null
}
```

**status=done 返回**:
```json
{
  "task_id": "cmxxxxx123456789",
  "status": "done",
  "report_id": "cmyyyyy987654321",
  "error_message": null,
  "created_at": "2026-04-15T10:30:00.000Z",
  "updated_at": "2026-04-15T10:31:00.000Z",
  "started_at": "2026-04-15T10:30:05.000Z",
  "finished_at": "2026-04-15T10:31:00.000Z"
}
```

**status=failed 返回**:
```json
{
  "task_id": "cmxxxxx123456789",
  "status": "failed",
  "report_id": null,
  "error_message": "DeepSeek API 错误: connection timeout",
  "created_at": "2026-04-15T10:30:00.000Z",
  "updated_at": "2026-04-15T10:30:45.000Z",
  "started_at": "2026-04-15T10:30:05.000Z",
  "finished_at": "2026-04-15T10:30:45.000Z"
}
```

---

## 接口三：GET /api/diagnose/report/{report_id}

查询完整诊断报告。

**URL**: `https://offerpilot-web.vercel.app/api/diagnose/report/{report_id}`

**Method**: `GET`

**Headers**:
```
Content-Type: application/json
```

**成功返回**（HTTP 200）:
```json
{
  "scenario": "normal",
  "main_judgment": "简历整体达标，有3个可优化项",
  "core_issues": [
    {
      "title": "量化数据缺失让HR无法判断你的实际贡献",
      "summary": "简历中'负责用户增长系统后端开发'一段缺乏具体数据支撑",
      "suggestion": "建议补充具体的用户增长数字或项目成果",
      "priority": 1,
      "dimension": "evidence",
      "jd_relevance": "high"
    }
  ],
  "audit_rows": [
    {
      "section": "work_experience",
      "dimension": "evidence",
      "status": "ok",
      "title": "工作经历数据充分性",
      "evidence": ["字节跳动 | 后端工程师 | 2022.07 - 2024.06"],
      "evidence_strength": "medium"
    }
  ],
  "grouped_issues_by_section": {
    "work_experience": [...]
  },
  "grouped_issues_by_dimension": {
    "evidence": [...]
  },
  "missing_info_summary": ["缺少具体项目成果数据"],
  "metadata": {
    "target_role": "后端开发工程师",
    "has_jd": true,
    "generated_at": "2026-04-15T10:31:00.000Z",
    "diagnose_mode": "basic",
    "report_id": "cmyyyyy987654321",
    "session_id": "cmsession123456",
    "created_at": "2026-04-15T10:31:00.000Z"
  }
}
```

**失败返回**（HTTP 404）:
```json
{
  "error": "报告不存在"
}
```

---

## curl 验证命令

**1. 创建任务**
```bash
curl -X POST https://offerpilot-web.vercel.app/api/diagnose/tasks \
  -H "Content-Type: application/json" \
  -d '{"resume_text":"张三\n北京大学\n字节跳动 后端工程师","target_role":"后端开发工程师","tier":"free"}'
```

**2. 查询任务状态**（把 `{task_id}` 替换为上一步返回的值）
```bash
curl https://offerpilot-web.vercel.app/api/diagnose/tasks/{task_id}
```

**3. 查询完整报告**（当 status=done 后，把 `{report_id}` 替换为返回的值）
```bash
curl https://offerpilot-web.vercel.app/api/diagnose/report/{report_id}
```

---

## 字段速查

| 字段 | 来源接口 | 说明 |
|------|------|------|
| `task_id` | 创建任务返回 | 唯一任务标识，用于后续查询 |
| `status` | 查询任务返回 | `queued` → `running` → `done` 或 `failed` |
| `report_id` | 查询任务返回（done 时） | 用于查询完整报告 |
| `error_message` | 查询任务返回（failed 时） | 失败原因描述 |

**鉴权**: 无，无需 Authorization header

**CORS**: 标准允许

---

## Coze 节点字段映射表

| Coze 变量 | 取值表达式 | 说明 |
|------|------|------|
| `task_id` | `{{task_create.result.task_id}}` | 创建任务后从响应中提取 |
| `task_status` | `{{task_status.result.status}}` | queued / running / done / failed |
| `report_id` | `{{task_status.result.report_id}}` | done 时才有值 |
| `error_message` | `{{task_status.result.error_message}}` | failed 时才有值 |
| `main_judgment` | `{{report.result.main_judgment}}` | 从报告接口取 |
| `core_issues` | `{{report.result.core_issues}}` | 从报告接口取 |
| `audit_rows` | `{{report.result.audit_rows}}` | 从报告接口取 |

---

## Coze 工作流建议节点顺序

1. **HTTP 请求节点**：POST `/api/diagnose/tasks`
   - 输入：`resume_text`、`target_role`、`jd_text`（可选）、`tier`

2. **变量赋值节点**：`task_id = task_create.result.task_id`

3. **轮询节点**（Coze Loop）：
   - GET `/api/diagnose/tasks/{task_id}`
   - 条件判断：`task_status.status != done && task_status.status != failed`
   - **每 15 秒查一次，最多 20 次，超时则判定为超时失败**
   - 超时判定：循环 20 次 × 15 秒 = 5 分钟

4. **条件分支**：
   - 如果 `task_status.status == done` → GET `/api/diagnose/report/{task_status.result.report_id}`
   - 如果 `task_status.status == failed` → 输出错误信息
   - 如果循环超时 → 提示"任务处理超时，请稍后再用 task_id 查询"

---

## 请求字段必填说明

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `resume_text` | **必填** | - | 简历全文文本 |
| `target_role` | **必填** | - | 目标岗位名称 |
| `jd_text` | 可选 | `""` | 职位描述，不传则自动跳过 JD 相关分析 |
| `tier` | 可选 | `"free"` | `free` 或 `paid` |
| `diagnose_mode` | 可选 | `"basic"` | `basic`（快速诊断）或 `deep`（深度诊断） |
| `resume_paragraphs` | 可选 | - | 预分段简历，不传则系统自动分段 |
| `source_type` | 可选 | `"paste"` | `paste` 或 `pdf` |
| `uploaded_file_id` | 可选 | - | PDF 上传后返回的文件 ID |

**最小请求示例**（只需两个必填字段）：
```json
{
  "resume_text": "张三\n北京大学\n字节跳动 后端工程师",
  "target_role": "后端开发工程师"
}
```

---

## 错误类型分层

### 接口层错误（HTTP 4xx/5xx）

| error.code | HTTP 状态码 | 含义 | Coze 处理建议 |
|------|---------|------|------|
| `VALIDATION_ERROR` | 400 | 参数缺失或格式错误 | 停，检查请求体 |
| `RATE_LIMIT_EXCEEDED` | 429 | 当日免费额度用完 | 停，第二天再试 |
| `NOT_FOUND` | 404 | 任务或报告不存在 | 停，检查 ID 是否正确 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 | 可重试一次 |
| `AI_SERVICE_UNAVAILABLE` | 502 | DeepSeek/MetaSO 等 AI 服务不可用 | 可重试一次 |
| `SERVER_CONFIG_ERROR` | 500 | 服务器配置缺失（如 API Key 未配置） | 停，联系运维 |
| `INSUFFICIENT_INPUT` | 400 | 输入信息不足无法诊断 | 停，补充简历或岗位信息 |

### 任务层错误（GET /api/diagnose/tasks/{id} 的 failed 状态）

`status=failed` 时，`error_message` 字段表示任务执行过程中的实际报错：

| 可能的 error_message 类型 | 说明 | Coze 处理建议 |
|------|------|------|
| `DeepSeek API 错误: connection timeout` | AI 服务连接超时 | 可重试 |
| `DeepSeek API 错误: 429 rate limit` | AI 服务限流 | 等 30 秒后重试 |
| `JSON 解析失败` | AI 返回格式异常 | 可重试 |
| 其他未分类错误 | 需人工排查 | 停，保留 task_id |

### Coze 端错误处理建议

```
IF error.code == "VALIDATION_ERROR" → 终止，提示检查输入
IF error.code == "RATE_LIMIT_EXCEEDED" → 终止，提示明天再试
IF error.code == "NOT_FOUND" → 终止，检查 ID 是否正确
IF error.code IN ["INTERNAL_ERROR", "AI_SERVICE_UNAVAILABLE"] → 重试一次
IF error.code == "SERVER_CONFIG_ERROR" → 终止，联系运维
IF status == "failed" → 检查 error_message，判断是否重试
IF 轮询超过 20 次 → 超时，提示稍后再用 task_id 查询
```
