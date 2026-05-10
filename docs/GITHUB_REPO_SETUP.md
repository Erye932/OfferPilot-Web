# GitHub 仓库元数据配置清单

> 这份清单是给仓库 owner 在 GitHub 网页端执行的一次性配置。所有项目代码层面的改动已经在仓库内完成，下面这些只能在 github.com 上点鼠标完成。
>
> 全部完成后，仓库的"专业感"会从 1 star 个人项目级别升到"看起来像一个有团队在维护的小型 OSS 项目"，对 OpenAI Codex OSS 申请审核员是关键的第一印象。

---

## 1. About 区域（仓库首页右上角）

进入仓库首页 → 右上角 About 框旁边的齿轮图标 → 编辑：

### Description（描述）

直接复制粘贴，限制 350 字符以内：

```
Open-source multi-stage AI workflow for diagnosing and rewriting technical resumes. Grounded in a curated corpus of recruiter signals; pluggable LLM router; async task queue on stock Next.js + Postgres.
```

### Website（网站）

```
https://offerpilot-web.vercel.app
```

### Topics（标签，最多 20 个，按重要性排序）

复制粘贴下面这一串，GitHub 会自动按空格切分：

```
ai resume career-tools nextjs typescript prisma postgresql llm deepseek openai-compatible vercel zod tailwindcss multi-agent ai-agents prompt-engineering ai-workflow open-source-ai job-search developer-tools
```

如果某个 topic 提示不存在，GitHub 会让你新建 — 直接确认即可。

### 勾选项

- [x] Releases（让 release 显示在右栏）
- [x] Packages（即使暂时没有，留着方便以后加）
- [ ] Deployments（看你愿不愿意展示 Vercel 部署，建议勾上代表"在线运行"）

---

## 2. Social preview（社交预览图）

GitHub 链接被分享到 Twitter / LinkedIn / Discord 时显示的卡片。默认是仓库截图，效果差。

**Settings → General → Social preview → Edit → Upload an image**

推荐尺寸：**1280 × 640 px**，不超过 1MB，PNG 或 JPG。

如果你暂时没有图，可以用以下任一快速方案：

- 用 Figma 或 Canva 用 5 分钟做一张：左侧"OfferPilot"大字 + slogan，右侧贴 README 的架构图截图，整体黑底亮色文字。
- 或用 [GitHub Socialify](https://socialify.git.ci/) 生成（输入仓库地址即可，免费）— 很多 OSS 项目都用这个，质量过得去。
- 或截图运行中的 V4 工作流页面 + 加上仓库名水印。

---

## 3. 启用 Discussions

**Settings → General → Features → Discussions → Set up discussions**

启用后，GitHub 会引导你创建第一个 Welcome 帖。建议直接用下面的内容（**Categories 用默认即可**）。

### 第一个 Discussion：Welcome（Announcements 分类）

标题：

```
Welcome to OfferPilot Discussions
```

正文：

```markdown
Welcome — and thanks for stopping by.

OfferPilot is an open-source platform that helps job seekers diagnose and rewrite their resumes for a target role, using a multi-stage AI workflow grounded in a curated knowledge base of recruiter signals.

This is the place for:

- **Q&A** — questions about installing, running, or extending OfferPilot.
- **Show & tell** — share your fork, your custom corpus, your screenshots, your offer letters.
- **Ideas** — proposals you're not yet sure should be issues.
- **General** — anything else.

If you find a bug, please open an [issue](../../issues/new/choose) instead.

If you find a security vulnerability, please follow [SECURITY.md](../../blob/main/SECURITY.md) — do not post it here.

Looking forward to building this with you.
```

### 第二个 Discussion：Roadmap（Ideas 分类）

标题：

```
Roadmap discussion: what should we build next?
```

正文：

```markdown
The current roadmap is in the [README](../../blob/main/README.md#-roadmap), split into near-term, mid-term, and longer-term buckets.

If you have opinions about priorities — especially:

- Which AI provider adapter should land first (OpenAI, Anthropic, OpenRouter, self-hosted)?
- Should the multilingual corpus start with English or another language?
- Is the public benchmark interesting to you?

— please reply here. The roadmap is not set in stone; if there's pull from real users we'll re-prioritize.
```

---

## 4. 创建初始 Issues（用作"good first issue"和路线图入口）

每条单独开一个 issue。这一步的目的是让审核员看到 backlog 是真实的、可被新贡献者认领的，而不是一个"刚 push 完代码就来申请"的状态。

**仓库 → Issues → New issue → Feature request 模板。** 复制下面的标题和正文即可。

### Issue #1

标题：

```
[feature] Add OpenAI provider adapter to lib/ai/providers
```

正文（粘贴时把模板里的 problem / solution 字段对应到下面这两块）：

> **What problem does this solve?**
>
> The AI router only ships with DeepSeek and Metaso adapters today. Many self-hosters and enterprise users only have access to OpenAI-compatible endpoints (OpenAI, Azure OpenAI, OpenRouter, Together, Groq, etc.). Without an OpenAI adapter, OfferPilot is hard to evaluate outside the China market.
>
> **Proposed solution**
>
> Add `lib/ai/providers/openai.ts` implementing the same `Provider` interface used by `deepseek.ts`. Should:
> - Read `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` from env.
> - Support OpenAI-compatible base URLs so the same adapter works for OpenRouter / Azure / Together with config only.
> - Wire up to the router in `lib/ai/router.ts` so `AI_PRIMARY_PROVIDER=openai` routes correctly.
> - Update README env section + add a vitest unit test mocking the HTTP layer.
>
> **Affected area:** AI router / providers
>
> **Are you willing to contribute?** Looking for help — happy to review PRs.

加标签：`enhancement`、`good first issue`、`help wanted`、`area:ai-router`

### Issue #2

标题：

```
[feature] Docker / Compose self-host guide
```

正文：

> **What problem does this solve?**
>
> The current Quick Start assumes you'll run on Vercel. Several potential users have asked for a self-host path that doesn't depend on any specific cloud provider — for privacy reasons, for offline trials, and for users in regions where Vercel is slow.
>
> **Proposed solution**
>
> - Add a `Dockerfile` for the Next.js app.
> - Add a `docker-compose.yml` that brings up the app + Postgres in one command.
> - Document `npm run db:migrate` flow inside the container.
> - Add a `docs/SELF_HOSTING.md` with step-by-step instructions.
>
> **Affected area:** Build / deployment
>
> **Are you willing to contribute?** Looking for help.

加标签：`enhancement`、`good first issue`、`help wanted`、`area:deployment`

### Issue #3

标题：

```
[feature] Side-by-side rewrite diff on the result page
```

正文：

> **What problem does this solve?**
>
> Today the diagnosis report shows the rewritten bullets but doesn't show *what changed* relative to the user's original text. Users have to mentally diff, which is high friction.
>
> **Proposed solution**
>
> On the result page, render each rewritten bullet next to its original with a word-level diff highlight (added text in green, removed in red). The data is already in the V4 report — just needs UI work in `components/offerpilot/report-v4/`.
>
> **Affected area:** Frontend (UI / React)
>
> **Are you willing to contribute?** Looking for help.

加标签：`enhancement`、`good first issue`、`area:frontend`

### Issue #4

标题：

```
[feature] Public benchmark dataset for resume diagnosis
```

正文：

> **What problem does this solve?**
>
> There is no standard way to compare resume-AI tools objectively. Anyone can claim "we're better than ChatGPT" — there's no evidence to back it up. This blocks both research and adoption.
>
> **Proposed solution**
>
> Curate ~50 anonymized resumes (with consent) covering a range of roles and seniorities. For each, publish:
> - The original resume text
> - The diagnosis report from OfferPilot V4
> - A "gold" expert critique written by a senior recruiter / engineering manager
>
> Release as `offerpilot-benchmark/` in this repo or a sibling repo, MIT-licensed, with a script that scores any resume-AI's output against the gold critiques.
>
> **Affected area:** Corpus content
>
> **Are you willing to contribute?** Looking for collaborators — especially senior engineers and recruiters who'd write expert critiques.

加标签：`enhancement`、`help wanted`、`area:corpus`、`research`

### Issue #5

标题：

```
[feature] Authoring UI for corpus rules and rewrite patterns
```

正文：

> **What problem does this solve?**
>
> Today, contributing a new diagnostic rule or rewrite pattern means hand-editing JSON in `offerpilot-corpus/distilled/`. This is intimidating for non-engineers — the people most qualified to write good rules (recruiters, hiring managers, senior ICs) are exactly the ones we're locking out.
>
> **Proposed solution**
>
> Build a `/admin/corpus/new` page that:
> - Renders a form per corpus type (rule / insider view / rewrite pattern).
> - Validates against the same zod schemas the runtime uses.
> - Outputs a ready-to-paste JSON snippet **and** opens a pre-filled GitHub issue using the corpus contribution template.
>
> No auth needed v1; the GitHub PR review is the moderation step.
>
> **Affected area:** Frontend (UI / React)
>
> **Are you willing to contribute?** Looking for help.

加标签：`enhancement`、`area:frontend`、`area:corpus`

---

## 5. 标签（Labels）建议

**Issues → Labels → New label**

GitHub 默认有一些标签，再补这些（每个建议设个易识别的颜色）：

| Label | 颜色 | 描述 |
|---|---|---|
| `area:ai-router` | `#0e8a16` | AI router and provider adapters |
| `area:diagnose-v4` | `#5319e7` | V4 diagnosis workflow |
| `area:frontend` | `#1d76db` | UI / React components |
| `area:corpus` | `#fbca04` | Distilled knowledge base |
| `area:deployment` | `#d93f0b` | Build / Docker / Vercel |
| `research` | `#c5def5` | Research questions / benchmarks |
| `corpus` | `#fbca04` | Corpus content changes |
| `needs-triage` | `#cccccc` | Awaiting maintainer review |
| `needs-review` | `#cccccc` | Submitted, awaiting review |

GitHub 默认已经有 `bug`、`enhancement`、`good first issue`、`help wanted`、`documentation` — 不用重复创建。

---

## 6. Branch protection（建议但不强制）

**Settings → Branches → Add branch protection rule**

为 `main` 分支添加保护规则：

- [x] Require a pull request before merging（要求 PR）
- [x] Require status checks to pass before merging（要求 CI 通过 → 选 `Lint`）
- [x] Require linear history（拒绝 merge commit，保持历史干净）
- [ ] Require approvals（你是单人项目，先不开，否则没人能 approve）

这一项做完后，给审核员的信号是"这个项目有 CI gate，不是把代码直接 push 进 main"。

---

## 7. 校验清单

最后逐项核对（在 github.com 仓库首页扫一眼）：

- [ ] About 区域有描述、网站、topics
- [ ] 仓库右栏 Releases / Packages 显示位置正确
- [ ] Social preview 不再是默认截图
- [ ] Discussions 标签出现在仓库 nav 上，且至少有 2 个置顶帖
- [ ] Issues 标签出现，且至少有 5 个 backlog issues，至少 3 个标了 `good first issue`
- [ ] 仓库根有 `LICENSE`、`README.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`（这五个 GitHub 会在 Insights → Community Standards 里逐项打勾）
- [ ] Insights → Community Standards 页面，每一项都是绿色对勾
- [ ] CI（Actions → Lint workflow）在最近一次 push 上是绿色

如果上面全部完成，仓库的"OSS 完整度"就达到了一个能拿出去申请的水平。

---

## 8. 完成后告诉我

把以下信息回复给我，我会接着写申请文案：

1. Insights → Community Standards 是否所有项都绿了
2. 是否完成了 5 个初始 issues
3. 你最想在申请文案里强调的"独特价值"是什么（例如：V4 多阶段工作流、self-improving learning DB、做中文求职市场的开源 AI 等 —— 你的直觉比我准）
