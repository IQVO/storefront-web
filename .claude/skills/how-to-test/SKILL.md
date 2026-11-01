---
name: how-to-test
description: Write or diagnose tests and failing CI jobs in this repo - vitest coverage thresholds, Playwright journeys against the stub BFF, the no-network-url-in-bundle sensor and Lighthouse budgets. Use when adding tests or fixing a red web, e2e, no-network-url-in-bundle or lighthouse-budgets job.
---

# Test and diagnose

- Unit/component: `npm test`; coverage gate `npm run test:coverage` (thresholds in `vitest.config.ts`).
- Journeys: `npm run e2e` (stub BFF, built automatically); `E2E_BASE_URL=... npm run e2e` for a real BFF.
- Bundle sensor: `npm run build && npm run check:bundle`; fixtures live in `scripts/bundle-scan.test.ts`. A hit names the rule and the string; fix the code, never the allow-list unless it is a pure namespace string.
- Lighthouse: `npm run build && npm run lhci` (`LHCI_FORM_FACTOR=desktop` for desktop; set `CHROME_PATH`). Fix the page (image priority, JS weight, layout shift), never the budget.
- Do not run two builds at once: a rebuild under a running server mismatches asset hashes.
