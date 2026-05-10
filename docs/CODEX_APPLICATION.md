# OpenAI Codex for Open Source 申请文案

> 这份文档是给你**复制粘贴到 OpenAI 申请表**用的。每个段落都写了两个版本（短版 / 长版），按申请表的字段限制选用。
>
> **免责声明：** OpenAI Codex OSS 项目的官方申请门槛通常包括 1000+ stars 或核心维护者身份。OfferPilot 当前 1 star，**走"按字面规则"路径几乎确定不通过**。下面所有文案都是冲着"破格录取"写的，靠的是项目质量、独特定位、技术深度。预期通过率仍然偏低，但远高于交白卷。
>
> 如果你想要一份完全诚实的概率评估和备选方案，参见本文末尾的 §6。

---

## 0. 申请前必做

在提交申请前，先确认下面三项已经完成（按 `docs/GITHUB_REPO_SETUP.md` 走一遍）：

- [ ] 仓库 Community Standards 全绿（LICENSE / README / CONTRIBUTING / CoC / SECURITY / Issue 模板 / PR 模板）
- [ ] 至少 5 条 backlog issues，至少 3 条标了 `good first issue`
- [ ] Discussions 已启用，至少有 1 篇 Welcome 帖
- [ ] CI（Lint workflow）最近一次运行是绿的
- [ ] Live preview（Vercel）能正常完成一次完整诊断

只要有一项缺失，申请审核员一查仓库就会看到"在赶工"的痕迹。

---

## 1. 一句话项目定位（用于"What is your project?" 短字段）

复制粘贴：

```
OfferPilot is an open-source, multi-stage AI workflow that diagnoses and rewrites technical resumes for a target role, grounded in a curated corpus of real recruiter signals rather than blind LLM paraphrasing.
```

---

## 2. 项目简介（用于 200–500 字段）

```
OfferPilot is an open-source platform built on Next.js, TypeScript, and Postgres that helps job seekers diagnose and rewrite their resumes for a specific target role.

Most AI resume tools today fall into two failure modes: they either rewrite blindly (losing the candidate's voice and facts), or they give generic advice ("add quantifiable achievements") that nobody can act on. OfferPilot takes a different approach: a four-phase diagnosis workflow (V4) splits research, role analysis, and surgical rewriting into separately cached, schema-validated steps — each one auditable, replayable, and independently testable.

The system is grounded in a curated, MIT-licensed corpus of diagnostic rules, recruiter insider views, and rewrite patterns distilled from public hiring content. A pluggable AI router lets the same workflow run against DeepSeek, Metaso, and (soon) any OpenAI-compatible provider. An async task queue runs entirely on stock Next.js + Postgres, with no Redis or SQS dependency, making the project genuinely self-hostable.

OfferPilot was built primarily for the Chinese tech job market — historically underserved by Western resume-AI products — but the architecture and corpus are explicitly designed to be locale-extensible. Open-sourcing it is the only way the corpus can grow into something globally useful.
```

---

## 3. 为什么开源（"Why open source?" 字段）

短版（约 150 字）：

```
The corpus is the moat — and a closed corpus is a small, biased corpus. Open-sourcing means recruiters, hiring managers, and senior engineers worldwide can contribute the diagnostic rules and rewrite patterns they actually use, with public source citations. The same goes for AI providers: open-sourcing the router lets the workflow run on whatever LLM the user trusts (commercial, self-hosted, or local). Closed-source resume-AI is a worse product.
```

长版（约 350 字，建议优先用）：

```
Three reasons:

1. The corpus is the actual moat — and a closed corpus is a small, biased corpus. The diagnostic rules in OfferPilot work because they reflect how senior recruiters and hiring managers actually evaluate resumes. The only way that knowledge base grows into something globally useful is by letting practitioners contribute openly, with public source citations and reviewable schemas. We can't replicate that with a private team.

2. The architecture is more useful as reference than as a service. The four-phase V4 workflow, the schema-first AI boundary, the async task queue on stock Next.js — these are patterns we'd want any AI builder to be able to learn from, fork, and improve. There's nothing about the diagnosis problem that justifies hiding the implementation.

3. Trust matters in this category. Resume content is sensitive personal data. Users (and especially their employers) have legitimate reasons to want to inspect, fork, and self-host. Closed-source resume-AI is a worse product because it asks for trust it cannot earn.

Practically, open-sourcing also lets the project benefit from AI coding agents themselves — every contributor (including agents like Codex) gets full read access to architecture, tests, and the corpus, which is the only way modern AI-assisted development scales.
```

---

## 4. 项目影响力 / 你想用 Codex 做什么（"How will Codex help?" 字段）

```
Codex would directly accelerate the four highest-value items on our roadmap:

1. Provider adapter expansion. The current router only ships DeepSeek and Metaso adapters. Codex's strength at conforming to existing interfaces makes it ideal for landing OpenAI, Anthropic, OpenRouter, and self-hosted gpt-oss adapters quickly, with full vitest coverage. Estimated unlock: ~10x the addressable user base.

2. Public benchmark dataset. We want to release ~50 anonymized resume → diagnosis → expert-critique pairs as an MIT-licensed benchmark. Codex would help script the anonymization pipeline, the scoring harness, and the CI integration — work that's tedious but well-specified.

3. Self-host story. A clean Dockerfile + docker-compose + step-by-step migration guide is the single biggest unblock for adoption outside the live preview. Codex pattern-matches well to "ship a self-host story" tasks.

4. Authoring UI for the corpus. The corpus is the project's moat, but contributing to it today means hand-editing JSON. Codex can scaffold a `/admin/corpus/new` form that validates against the same zod schemas the runtime uses, and opens pre-filled GitHub issues — turning corpus contribution from "engineer-only" to "any practitioner with 10 minutes."

The deeper bet: OfferPilot itself is designed to be a great repo for AI assistants to operate inside. Schema-validated artifacts at every LLM boundary, no hidden state, narrow module contracts, comprehensive tests. Giving Codex access to a project explicitly built to be agent-friendly is a useful proof point — both for us and for OpenAI's research on what "agent-ready" code looks like in practice.
```

---

## 5. 项目状态 / 路线图（"Project status / roadmap" 字段）

```
Status: actively developed, single primary maintainer with help from AI coding assistants. The V4 diagnosis workflow, async task queue, three-tier learning database, and PDF parsing pipeline are all in production on the live preview at https://offerpilot-web.vercel.app.

Stars and downloads are intentionally not the lead metric — the project is ~1 month old and was hardened in private before opening to contribution. The README, CONTRIBUTING, SECURITY, Code of Conduct, Issue templates, PR template, and CI are all in place; backlog issues are tagged for new contributors. We chose to invest in repo quality before any star-chasing.

Near-term roadmap (next 1–2 months):
- OpenAI / Anthropic / OpenRouter provider adapters
- Authoring UI for corpus contributions  
- Self-host guide (Docker / Compose)
- Result-page polish: share-link, PDF export, diff view

Mid-term (this quarter):
- Multilingual corpus
- Public benchmark dataset
- Self-hosted gpt-oss / LLaMA verification

Longer-term:
- Browser extension
- Interview prep workflow on the same V4 research cache
- Recruiter-side: invert the engine to diagnose JDs against candidate pools
```

---

## 6. 不加滤镜的概率评估和备选方案

> 你说想要诚实评估，这一节就是。**任何宣称"按这份文案走 100% 通过"的人都是在骗你。**

### 6.1 OpenAI 的官方门槛（截至 2026 年公开信息）

OpenAI Codex for Open Source 项目的常见判定线包括：

- 项目获得 **1000+ GitHub stars**（非硬性，但是事实门槛之一）
- 申请人是项目的**核心维护者** —— 用 commit 历史和 GitHub Insights 验证
- 项目**公开**、**有 OSI 兼容许可证**、**积极维护**（最近 30/90 天有 commit）
- 项目**对生态有贡献** —— 这是最主观的一项，也是你唯一能靠文案影响的

OfferPilot 当前状态对照：

| 项 | 要求 | 现状 | 评分 |
|---|---|---|---|
| 公开仓库 | 必须 | OK | 通过 |
| OSI 许可证 | 必须 | MIT | 通过 |
| 核心维护者 | 必须 | 你是唯一 contributor | 通过 |
| 积极维护 | 软要求 | 最近频繁 commit | 通过 |
| Stars | 1000+（事实门槛） | 1 | **不通过** |
| 生态贡献 | 主观判断 | 中文求职市场 + AI workflow 复杂度 | **可争取** |

**结论：按字面规则，被拒概率 > 90%。**靠这份文案补回来的空间在"生态贡献"这一项 —— 也就是审核员看到项目后的主观判断。

### 6.2 你能合法做的事（按性价比排序）

1. **完成 §0 的所有准备**。这是免费且必须的，不做就是给自己挖坑。

2. **写一封给具体人的邮件**。OpenAI 的项目申请如果只是表单提交，淹没的概率高。如果你能在 OpenAI 的 DevRel / OSS Programs 团队里找到一个人（比如某个 Codex 团队成员的 X / 个人博客），礼貌地发一封短信介绍项目并附申请编号，转化率会显著高于纯表单。**注意：不要群发、不要骚扰、不要试图走关系。**

3. **争取 1–2 篇技术博客被收录**。把 README 里"V4 Workflow Deep Dive"和"Async task architecture"两节扩展成两篇独立文章，发到 dev.to / Hacker News / r/LocalLLaMA。即使没爆，也能让审核员搜到项目时多 2–3 条独立信号。

4. **递交 Pull Request 到上游项目**。比如往 `pdfjs-dist` 修一个 CJK bug，往 zod 写一个 example。每一个被合并的上游 PR 都能让"积极维护开源生态"这一项变得可信。

### 6.3 你**不应该**做的事

> 这些是真的会让你被拒的红线。审核员每天看上百个申请，识别假信号是他们的肌肉记忆。

- **不要买 stars**（"涨星服务"）。GitHub 风控会标记，OpenAI 审核员通过 GitHub API 能直接看出 star 来源的地理分布、注册时长、有无其他活动 —— 假账号特征非常明显。被发现的代价：永久拉黑申请，且可能被 GitHub 账号警告。
- **不要伪造 commit 历史**（用别人的邮箱伪造 author）。同上，hard fail。
- **不要刷 issue / PR**（自己开自己关）。审核员会看互动密度和讨论深度，而不是单纯数量。
- **不要在文案里夸大事实**。比如声称"used by 1000+ users"但没有数据 —— 这会让整份申请的可信度归零。

### 6.4 备选方案（按推荐度排序）

如果申请被拒（**这是最可能的结果**），下面这些是合法的备选路径：

| 方案 | 成本 | 推荐度 |
|---|---|---|
| 继续认真做项目 6 个月，攒到 200+ 真实 stars 后重新申请 | 时间成本高，金钱成本 0 | **推荐**：你已经有一个值得做的项目，副作用全是正向的 |
| 申请 GitHub 学生认证 + Pro 学生包（GitHub Education） | 免费，需要学生身份 | 如果你是学生：值得 |
| 申请 OpenAI 其他 grant 项目（Researcher Access、Startup Credits） | 免费，需要符合条件 | 视情况 |
| 直接订阅 ChatGPT Plus（$20/月） | $20/月 | 短期最确定的方案，但你说想免费 |
| 订阅 Codex 单独的 API + IDE 插件 | 按 token 算，重度使用可能更贵 | 看用量 |

### 6.5 一句话总结

**这份文案 + 仓库准备 + 主动联系，是你能合法做的全部事情。预期通过率 5%–15%。** 通过率不会更高了，任何承诺更高的方案都涉及灰产。

如果你接受这个概率，按 §0 检查清单走一遍 → 提交申请 → 等回复（通常 4–8 周）。期间继续认真做项目，无论结果如何，都不亏。

---

## 7. 申请提交后的清单

提交后保留以下证据，方便后续追问或重新申请：

- [ ] 申请提交时仓库的 commit SHA（截图）
- [ ] 申请提交时仓库的 stars / contributors / issue 数量（截图）
- [ ] 申请表填写内容的本地副本（这份文档已经是了）
- [ ] 提交确认邮件 / 申请编号

如果 8 周内没收到回复，可以在 OpenAI 官方渠道礼貌追问一次，**只追问一次**。
