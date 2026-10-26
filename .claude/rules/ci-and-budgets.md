---
paths:
  - ".github/**"
  - "Makefile"
  - "lighthouserc.cjs"
  - "playwright.config.ts"
  - "vitest.config.ts"
  - "eslint.config.js"
  - "Dockerfile"
---

# CI jobs and budgets (ADR 0005)

- Required jobs: `web`, `no-network-url-in-bundle`, `lighthouse-budgets`; also `e2e`, `guide-lint`, `docker-build`.
- Budgets in `lighthouserc.cjs` are the plan's section 8 numbers: LCP 2500 ms, TBT 200 ms (INP proxy), CLS 0.1.
  Measure, then fix the page; never raise a budget or lower a coverage threshold to get green.
- Coverage thresholds in `vitest.config.ts` only go up after measuring.
- Never push `develop` or `main` from an agent, never `--no-verify`, never force-push (the hook blocks them).
