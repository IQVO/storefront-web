# 5. CI sensors and the stub BFF

Status: Accepted. Design source: plan section 0b (storefront sensors) and section 8 (web budgets).

## Decision

- Required CI jobs: `web` (eslint, tsc, vitest with coverage thresholds, build), `no-network-url-in-bundle`,
  `lighthouse-budgets`; plus `e2e` (Playwright), `guide-lint` (harness) and `docker-build`.
- **Stub BFF.** `server/stub-handler.ts` is a stateful in-memory implementation of the BFF routes (same paths,
  statuses, problem+json and `sf_state` cookie semantics as storefront-bff's `apis/openapi.yaml`, synthetic data).
  `STOREFRONT_STUB=1 npm start` serves it under `/api/storefront`, so CI needs no running BFF. Playwright
  journeys use it by default; `E2E_BASE_URL` points them at a real BFF-backed deployment (locally gated).
- **Budgets** (`lighthouserc.cjs`, mobile and desktop, median of 3 runs, home, search, product page and cart):
  LCP <= 2.5 s, Total Blocking Time <= 200 ms (INP is a field metric; TBT is its lab proxy, held to the INP
  target), CLS <= 0.1. The cart is measured as its empty-cart shell, since the stub has no cookie-scoped cart for a
  cold Lighthouse run.
- The stub can drift from the real BFF; the locally-gated Playwright run against a real BFF is the check on that.
