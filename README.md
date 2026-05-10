<div align="center">

# OfferPilot

**An open-source, multi-stage AI workflow for diagnosing and rewriting technical resumes.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Lint](https://github.com/Erye932/OfferPilot-Web/actions/workflows/lint.yml/badge.svg)](https://github.com/Erye932/OfferPilot-Web/actions/workflows/lint.yml)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)](https://www.prisma.io/)
[![Live Preview](https://img.shields.io/badge/preview-vercel-black?logo=vercel)](https://offerpilot-web.vercel.app)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

[**Live Demo**](https://offerpilot-web.vercel.app) · [**Architecture**](#-architecture) · [**V4 Workflow**](#-v4-workflow-deep-dive) · [**Contributing**](./CONTRIBUTING.md) · [**Roadmap**](#-roadmap)

</div>

---

## ✨ What is OfferPilot?

OfferPilot is an open-source platform that helps job seekers **diagnose**, **restructure**, and **rewrite** their resumes for a target role. Unlike generic chat-style resume tools, OfferPilot runs a **multi-stage diagnostic workflow** grounded in a curated knowledge base of real-world hiring signals, recruiter feedback, and rewrite patterns — instead of just paraphrasing your text.

Built first for the Chinese tech job market, designed to be easily adapted for any locale.

> **Project status:** actively developed. The V4 diagnosis workflow, async task queue, learning database, and PDF parsing pipeline are all in production on the live preview. Roadmap items below describe what's next.

## 🎯 Why OfferPilot?

Most AI resume tools fall into two failure modes: they either **rewrite blindly** (losing the candidate's voice and facts), or they give **generic advice** (`"add quantifiable achievements"`) that nobody can act on.

OfferPilot is different:

- **Grounded in real cases.** A curated corpus of diagnostic rules, insider views, and rewrite patterns — distilled from public recruiter content and consulting notes — drives every diagnosis.
- **Diagnose before rewriting.** A two-stage V4 workflow first identifies *what's wrong and why*, then surgically rewrites the affected sections — never regenerates the whole resume.
- **Resilient AI routing.** A pluggable provider router falls back across multiple LLMs (DeepSeek, Metaso, …) when one is rate-limited or down.
- **Self-improving.** A three-tier learning database captures every diagnosis, every piece of feedback, and promotes high-quality patterns back into the corpus.

## 🏗 Architecture

### High-level

```mermaid
flowchart LR
    U[User] --> FE[Next.js App Router UI]
    FE -->|POST /api/diagnose/tasks| TaskAPI[Task Queue API]
    TaskAPI --> DB[(Postgres / Prisma)]
    TaskAPI -.fire-and-forget.-> Worker[Diagnose Worker]
    Cron[Vercel Cron] --> Worker
    Worker --> V4[V4 Diagnose Workflow]
    FE -->|poll GET /api/diagnose/tasks/:id| TaskAPI
    API[Public REST API] --> PDF[PDF Parser<br/>pdfjs-dist]
    V4 --> Cache[(Research Cache)]
    V4 --> Probe[Missing-Info Probe]
    V4 --> Router[AI Router]
    Router --> DS[DeepSeek]
    Router --> MS[Metaso]
    Router --> Other[Pluggable Providers]
    V4 --> Corpus[(Distilled Corpus<br/>rules · insider views · rewrites)]
    V4 --> LDB[(3-Tier Learning DB)]
    LDB --> Promote[Pattern Promotion]
    Promote --> Corpus
```

The V4 workflow is the heart of the system. It runs a sequence of grounded steps — corpus retrieval → role resolution → research → diagnosis → rewrite — each schema-validated with [zod](https://zod.dev/), each with its own prompt and recovery path.

### Async task architecture

Long-running diagnoses (often **30–60 seconds** of LLM work) cannot live inside a single HTTP request on serverless platforms. OfferPilot ships a small task queue that:

- Accepts a job at `POST /api/diagnose/tasks`, persists it as a `DiagnoseTask` row, and returns a task `id` immediately.
- Triggers an internal worker (`/api/internal/diagnose-worker`) **fire-and-forget** so the request returns in milliseconds.
- Has the frontend **poll** `GET /api/diagnose/tasks/[id]` until status flips to `succeeded` / `failed`, then loads the report.
- A daily **Vercel Cron** (`/api/internal/diagnose-worker/cron`) sweeps stuck `running` tasks older than 5 minutes and any orphaned `queued` tasks — keeping the queue self-healing without a Redis/SQS dependency.

This keeps the entire stack inside **stock Next.js + Postgres**, with no extra infra to run, while still delivering a smooth UX for multi-minute AI work.

## 🧠 V4 Workflow Deep Dive

The V4 diagnosis workflow (`lib/diagnose/v4/workflow.ts`) is split into four phases. Each phase emits a typed, zod-validated artifact that the next phase depends on — so you can replay, cache, or A/B-test any single phase in isolation.

```mermaid
flowchart TB
    subgraph P0 ["Phase 0 · Prep (no AI)"]
        N[normalizeInput] --> M[runMissingInfoProbe]
    end
    subgraph P1 ["Phase 1 · Research (parallel, cached 7d by target_role)"]
        R2[R2 RoleStudy] 
        R3[R3 HrInsider]
    end
    subgraph P2 ["Phase 2 · Resume Study"]
        R5[R5 ResumeStudy<br/>uses R2 + R3 as reference]
    end
    subgraph P3 ["Phase 3 · Diagnosis"]
        Base[Base Analyzer] --> Par{Parallel}
        Par --> HR[HR Simulator]
        Par --> RM[Resume Master]
        Par --> JD[JD Keyword Coverage]
        Par --> Cred[Credibility Check]
        HR --> SC[Self-Critique]
        RM --> SC
        JD --> SC
        Cred --> SC
        SC --> Final[Final Synthesis]
    end
    P0 --> P1 --> P2 --> P3 --> Report[(DiagnoseReport)]
```

**Why split it like this?**

- **Cost.** Cold-start runs ~12 LLM calls; warm runs (cached R2/R3) drop to ~8. The cache is keyed by `target_role`, so the second user in the same role pays a fraction.
- **Quality.** Diagnosis steps run in parallel but **all consume the same `ResearchContext`** (R2 + R3 + R5), so a self-critique step can detect when one branch contradicts another grounded fact.
- **Robustness.** Each step has its own zod schema and recovery path. If `JdKeywordCoverage` 5xx's, the rest of the report still ships.
- **Replayability.** Each artifact is JSON, so reproducing a diagnosis from logs is straightforward — invaluable when iterating on prompts.

## 🧩 Core Features

| Feature | What it does |
|---------|--------------|
| **PDF resume parsing** | Extracts and normalizes text from uploaded PDFs via `pdfjs-dist`, with quality preview before diagnosis. |
| **V4 diagnosis engine** | Multi-step workflow with research cache, missing-info probe, role resolver, persona detection, and structured diagnosis output. |
| **Curated corpus** | 49 diagnostic rules · 32 insider views · 29 rewrite patterns, all schema-versioned and tested. |
| **AI provider router** | Pluggable `lib/ai/router.ts` with provider abstraction, timeout handling, and dual-AI verification mode. |
| **Learning database** | Three-tier Prisma schema: raw production data → service distillation → knowledge promotion — closing the quality flywheel. |
| **Pain Radar agent** | A Tavily-powered market-signal scraper (`agents/pain-radar-tavily.ts`) that surfaces real, fresh job-search pain points for content/feature decisions. |
| **Anonymous-session rate limiting** | Lightweight rate limiter keyed by anonymous session ID, opt-in via `RATE_LIMIT_ENABLED`. |
| **Async task queue** | Diagnose tasks are queued and processed by a worker route, ready for Vercel Cron or external schedulers. |

## 🚀 Tech Stack

| Layer | Stack |
|-------|-------|
| Framework | Next.js 16 (App Router, Server Components) |
| Language | TypeScript 5.9 (strict mode) |
| UI | React 19 + Tailwind CSS 4 |
| Database | PostgreSQL via Prisma 7 (with `@prisma/adapter-pg`) |
| AI | DeepSeek-V3.2, Metaso, pluggable router |
| PDF | `pdfjs-dist` 5 |
| Validation | `zod` 4 |
| Search | Tavily (market-signal agent) |
| Testing | Vitest 3 |
| Deploy | Vercel |

## 🤖 How We Build

OfferPilot is built with a heavy-AI development loop:

- **AI coding agents** (Cursor, Claude Code, Codex CLI, etc.) handle scaffolding, refactors, and test generation under human review.
- **Long-context models** (DeepSeek-V3.2) review and refactor multi-file changes that would be tedious by hand.
- **A `code_search` + `todo_list` discipline** keeps every non-trivial change scoped, testable, and traceable in version control.

We document this workflow openly because we believe small teams should be able to ship serious AI products without a 10-person infra org — and because we want OfferPilot itself to be a great repo for AI assistants to operate inside (clean module boundaries, typed contracts, schema-validated artifacts, no hidden state).

If you're an AI tooling researcher or maintainer, we'd love feedback — open an issue or [discussion](https://github.com/Erye932/OfferPilot-Web/discussions).

## 📦 Getting Started

### Prerequisites

- Node.js ≥ 20
- PostgreSQL 14+ (or any Prisma-compatible Postgres provider)
- An API key for at least one supported AI provider (DeepSeek, Metaso, OpenAI-compatible, …)

### 1. Clone and install

```bash
git clone https://github.com/Erye932/OfferPilot-Web.git
cd OfferPilot-Web
npm install
```

### 2. Configure environment

Create a `.env.local` file in the repo root:

```bash
# Database
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/offerpilot?schema=public"

# Primary AI provider
AI_PRIMARY_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-key-here
AI_TIMEOUT_MS=180000

# Optional: dual-AI verification
DUAL_AI_ENABLED=false

# Optional: market-signal agent
TAVILY_API_KEY=tvly-your-key-here

# Optional: rate limiting (off by default)
RATE_LIMIT_ENABLED=false
```

> **Never commit `.env.local`.** It is already in `.gitignore`.

### 3. Database setup

```bash
npx prisma migrate dev    # apply migrations to your database
npx prisma generate       # generate the Prisma client
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the landing page should load. Upload a PDF resume to trigger the diagnosis workflow.

### 5. Run the test suite

```bash
npm test            # one-shot
npm run test:watch  # watch mode
```

## 🗂 Project Structure

```
.
├── app/                      # Next.js App Router pages and API routes
│   ├── api/
│   │   ├── diagnose/         # Public diagnose endpoints (tasks, report)
│   │   ├── internal/         # Internal worker routes
│   │   ├── pdf/              # PDF parsing
│   │   └── ping*/            # Health checks
│   ├── diagnose/             # Diagnosis UI (input, loading, result)
│   ├── interview/            # Interview prep (WIP)
│   └── demo/                 # Interactive demo
├── components/offerpilot/    # Product UI components + V4 report renderer
├── lib/
│   ├── ai/                   # AI router + provider implementations
│   ├── diagnose/             # Core diagnosis logic
│   │   └── v4/               # V4 workflow: prompts, schemas, steps, cache
│   ├── case-db/              # Service-tier case storage and feedback
│   ├── learning-db/          # Knowledge-tier promotion repository
│   └── prisma.ts             # Prisma client singleton
├── prisma/
│   ├── schema.prisma         # Database schema (8+ models)
│   └── migrations/           # Versioned migrations
├── offerpilot-corpus/
│   ├── distilled/            # Production-ready knowledge base (JSON)
│   ├── templates/            # Authoring templates for new corpus entries
│   └── review/               # Curation notes and rejected items
├── scripts/                  # Corpus, knowledge-base, and reporting scripts
├── agents/                   # Standalone agent scripts (pain-radar-tavily)
├── docs/                     # Integration and workflow guides
└── __tests__/                # Vitest test suite
```

## 🛣 Roadmap

### Near-term (next 1–2 months)
- [ ] **OpenAI / Anthropic / OpenRouter providers** — first-class adapters in `lib/ai/providers/`.
- [ ] **Authoring UI for corpus** — let community contributors propose new diagnostic rules and rewrite patterns without editing JSON by hand.
- [ ] **Self-host guide** — one-command Docker / Compose setup for non-Vercel deployments.
- [ ] **Result-page polish** — share-link, PDF export, and side-by-side rewrite diff.

### Mid-term (this quarter)
- [ ] **Multilingual corpus** — extend the diagnostic rule set beyond the Chinese tech job market.
- [ ] **Public benchmark** — release an anonymized benchmark of resume → diagnosis → rewrite pairs so the community can compare prompts/models objectively.
- [ ] **Self-hosted gpt-oss / LLaMA support** — verify the workflow works end-to-end on local-first models.

### Longer-term
- [ ] **Browser extension** — diagnose any resume in-place on LinkedIn / 拉勾 / Boss.
- [ ] **Interview prep workflow** — reuse the V4 research cache to drive role-specific mock interviews.
- [ ] **Recruiter-side tool** — same engine, inverted: diagnose a JD against a candidate pool.

See [open issues](https://github.com/Erye932/OfferPilot-Web/issues) for the current backlog and good-first-issues.

## 🤝 Contributing

Contributions are very welcome — whether it's a new diagnostic rule, a bug fix, a new AI provider adapter, or improvements to the V4 workflow.

The full guide lives in [`CONTRIBUTING.md`](./CONTRIBUTING.md). Short version:

1. **Open an issue first** for non-trivial changes, so we can align on direction.
2. **Fork → branch → PR.** Use a descriptive branch name like `feat/openai-provider` or `fix/pdf-parse-cjk`.
3. **Keep PRs focused.** One logical change per PR makes review fast.
4. **Add tests** under `__tests__/` for any logic in `lib/`.
5. **Run `npm run lint` and `npm test`** before pushing.

For corpus contributions, see [`offerpilot-corpus/templates/`](./offerpilot-corpus/templates) — every new entry needs a source citation and follows a schema.

By participating you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md). For security issues, please follow [`SECURITY.md`](./SECURITY.md) instead of opening a public issue.

## 🙏 Acknowledgements

OfferPilot stands on the shoulders of an incredible OSS ecosystem:

- [Next.js](https://nextjs.org/), [React](https://react.dev/), [Prisma](https://www.prisma.io/), [Tailwind CSS](https://tailwindcss.com/) — the application backbone.
- [zod](https://zod.dev/) — schema validation that turns LLM output into trustworthy typed data.
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — robust PDF text extraction, even for CJK resumes.
- [DeepSeek](https://www.deepseek.com/), [Metaso](https://metaso.cn/), [Tavily](https://tavily.com/) — AI and search providers powering the workflow.

And to every recruiter, hiring manager, and senior engineer whose public talks and write-ups shaped the diagnostic rules in our corpus — thank you.

## 📄 License

OfferPilot is released under the [MIT License](./LICENSE).

Generated content (diagnoses, rewrites) may include text influenced by third-party LLMs and their training data. Users are responsible for ensuring downstream use complies with applicable terms.

---

<div align="center">

If OfferPilot helps you land an offer, a ⭐ on GitHub goes a long way.

</div>
