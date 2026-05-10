# Security Policy

We take security seriously. OfferPilot processes user resumes and (optionally) calls third-party AI providers, so we want vulnerabilities reported and fixed quickly.

## Supported versions

OfferPilot is in active development. Security fixes are applied to the **`main`** branch and the latest deployment on the live preview. We do not currently maintain LTS branches.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report privately via either of:

- **GitHub Security Advisories.** Use the [private vulnerability reporting form](https://github.com/Erye932/OfferPilot-Web/security/advisories/new) on this repository (preferred — gives us a private workspace to discuss and patch).
- **Email.** If you can't use GitHub Advisories, email the maintainer at the address listed on the [GitHub profile](https://github.com/Erye932) with the subject line `OfferPilot security report`.

Please include:

1. A description of the vulnerability and its impact.
2. Steps to reproduce — ideally a minimal proof of concept.
3. Affected versions, commit SHAs, or deployed URLs.
4. Any suggested mitigations, if you have them.

## What to expect

| Step | Target time |
|---|---|
| Initial acknowledgement | within **3 business days** |
| Triage and severity assessment | within **7 business days** |
| Fix and coordinated disclosure | depends on severity; typically **30–90 days** |

We'll keep you updated and credit you in the release notes (or anonymously, if you prefer) once the fix ships.

## Scope

In scope:

- The OfferPilot web application code in this repository.
- The deployed preview at `https://offerpilot-web.vercel.app` (please be respectful — no destructive testing, no DDoS, no automated scanners hammering the API).
- API routes under `/api/`.

Out of scope:

- Third-party AI providers (DeepSeek, Metaso, Tavily, etc.) — report directly to them.
- Self-hosted forks running on your own infrastructure.
- Social-engineering, physical, or DoS attacks.
- Findings that require a compromised user device or a malicious browser extension.

## Things we already know

- The free tier of the live preview has **rate limits and prompt-injection mitigations that are best-effort, not bulletproof**. Demonstrating that a hostile resume can steer the LLM into off-topic output is interesting but not, on its own, a security issue.
- Generated content quality is not a security issue. Prompt-quality bugs belong in regular issues.

## Safe harbor

Good-faith security research conducted within this policy will not be pursued or reported by us. We thank you in advance for helping keep OfferPilot users safe.
