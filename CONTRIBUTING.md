# Contributing to OfferPilot

Thanks for considering a contribution! OfferPilot is built in the open and we want it to stay that way. This guide gets you from zero to a merged PR with as little friction as possible.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating you agree to uphold it.

## Where to start

| If you want to… | Start here |
|---|---|
| Report a bug | [Open a bug report issue](https://github.com/Erye932/OfferPilot-Web/issues/new?template=bug_report.yml) |
| Propose a feature | [Open a feature request](https://github.com/Erye932/OfferPilot-Web/issues/new?template=feature_request.yml) |
| Add a diagnostic rule, insider view, or rewrite pattern | [Open a corpus contribution](https://github.com/Erye932/OfferPilot-Web/issues/new?template=corpus_contribution.yml) |
| Ask a question or share an idea | [Discussions](https://github.com/Erye932/OfferPilot-Web/discussions) |
| Report a security vulnerability | See [`SECURITY.md`](./SECURITY.md) — **do not** open a public issue |

For non-trivial code changes, please open an issue first so we can align on direction before you spend time on a PR.

## Development setup

### Prerequisites

- **Node.js ≥ 20**
- **PostgreSQL 14+** (any Prisma-compatible Postgres works — Neon, Supabase, local, etc.)
- An API key for at least one supported AI provider (DeepSeek, Metaso, OpenAI-compatible, …)

### Bootstrap

```bash
git clone https://github.com/<your-username>/OfferPilot-Web.git
cd OfferPilot-Web
npm install
cp .env.example .env.local   # if .env.example doesn't exist, see README §2
npx prisma migrate dev
npm run dev
```

Then visit http://localhost:3000.

### Useful scripts

```bash
npm run lint          # ESLint (Next config + TypeScript rules)
npm run cleanup       # ESLint --fix
npm test              # Vitest one-shot
npm run test:watch    # Vitest watch mode
npm run db:studio     # Prisma Studio
```

## Project layout (recap)

```
app/                    Next.js App Router pages + API routes
components/             React components (UI + product)
lib/
  ai/                   AI router and provider implementations
  diagnose/v4/          The V4 diagnosis workflow (steps, prompts, schemas, cache)
  case-db/              Service-tier case storage and feedback
  learning-db/          Knowledge-tier promotion repository
prisma/schema.prisma    Database schema
offerpilot-corpus/      Distilled knowledge base + authoring templates
__tests__/              Vitest test suite
```

## Workflow

### 1. Fork → branch

Fork the repo, then:

```bash
git checkout -b feat/<short-description>      # for features
git checkout -b fix/<short-description>       # for bug fixes
git checkout -b docs/<short-description>      # for documentation
git checkout -b corpus/<short-description>    # for corpus changes
```

### 2. Make your change

- **Keep PRs focused.** One logical change per PR. If you're tempted to bundle unrelated cleanups, split them.
- **Match the existing style.** TypeScript strict mode, no `any` unless commented why.
- **Schema first.** Anything that crosses the LLM boundary must be validated by a `zod` schema.
- **No hidden state.** New features should fit the existing module boundaries (`lib/ai/`, `lib/diagnose/`, etc.). If you find yourself reaching for a global, open an issue first.

### 3. Add tests

- For any non-trivial change in `lib/`, add or update a Vitest test under `__tests__/`.
- Tests should be deterministic — mock the AI router (`lib/ai/router.ts`) rather than calling real providers from CI.

### 4. Verify locally

```bash
npm run lint
npm test
npm run build      # optional but recommended for changes that touch app/ or next.config
```

### 5. Commit and PR

We don't enforce conventional commits, but we appreciate them. Examples:

```
feat(ai): add OpenAI provider adapter
fix(pdf-parse): handle CJK filename edge case
docs(readme): document async task architecture
corpus(rules): add rule for missing impact verbs in PM resumes
```

Then push your branch and open a PR. Fill out the PR template — it helps reviewers a lot.

## Code review

- A maintainer will review within a few days. We aim for actionable feedback, not nitpicks.
- Don't be alarmed if we suggest splitting your PR — it's almost always to get part of it merged faster, not to reject the work.
- We squash-merge by default to keep `main` history linear.

## AI-assisted contributions

We use AI coding assistants ourselves and welcome PRs that were drafted with them. Two ground rules:

1. **You are responsible for the code you submit.** Read every line, run the tests, understand the change.
2. **No commit-author forgery.** Commit with your real GitHub identity. Never set author metadata to a maintainer or another contributor.

## Corpus contributions

The `offerpilot-corpus/distilled/` JSON files power the diagnosis engine. Anything that lands there has to be:

- **Sourced.** Every entry needs a citation (URL, talk, book, or "consulting note: <date>" with author signoff).
- **Schema-valid.** See `offerpilot-corpus/templates/` for the authoring templates.
- **Reviewed.** A maintainer will pair a PR with a sanity check on phrasing and applicability before merging.

If your contribution is from a private consulting note or under NDA, please **don't submit it** — the corpus is open by design and we cannot accept content we can't ship publicly.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](./LICENSE).

---

Questions? Open a [Discussion](https://github.com/Erye932/OfferPilot-Web/discussions) or ping us in an issue. Welcome aboard 👋
