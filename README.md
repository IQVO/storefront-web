# storefront-web

The React server-side-rendered storefront of the retail-network storefront domain: home, search and category,
product page, cart, checkout, confirmation, orders, order detail with tracking, and order cancellation.

It talks to **one** backend, the [storefront-bff](https://github.com/IQVO/storefront-bff), through the relative base
`/api/storefront`. It stores no personal data, never sees a card number (payment fields are simulated and post only a
scenario token), and invents no ids.

## Disclaimer

This project is a domain-driven design study. It is not associated with, endorsed by or affiliated with any company, and it uses no company's code, data, logos or trademarks. All names, figures and examples are illustrative or synthetic.

## Stack

React 19, Vite 7, React Router 7 framework mode (SSR on Node), TypeScript strict, vitest + Testing Library,
Playwright, Lighthouse CI. Decisions: [docs/adr](docs/adr).

## Run

Node >= 22.18 (`.nvmrc` says 22).

```bash
npm ci

# Develop against a real BFF (run it on :8080, or set BFF_URL)
BFF_URL=http://127.0.0.1:8080 npm run dev     # vite dev server on :5180

# Production build, served by the Node server
npm run build
BFF_URL=http://127.0.0.1:8080 npm start        # :3000, proxies /api/storefront to the BFF

# Or serve the build with the in-memory stub BFF (no backend needed)
npm run build && npm run start:stub
```

| Variable | Where | Meaning |
|---|---|---|
| `BFF_URL` | server only | Origin of storefront-bff. SSR loaders call it; `npm start` also proxies `/api/storefront` to it. Never in the client bundle. |
| `PORT` | server | Listen port (default 3000). |
| `STOREFRONT_STUB` | server | `1` serves the stub BFF under `/api/storefront` (CI, demos). |

In a cluster the gateway routes `/api/storefront` to the BFF and `/` to this service.

## Test

```bash
npm run lint && npm run typecheck     # eslint, react-router typegen + tsc --noEmit
npm test                              # vitest (loaders, actions, components, sensor fixtures)
npm run test:coverage                 # + coverage thresholds
npm run check:bundle                  # after a build: no-network-url-in-bundle
npm run e2e                           # Playwright journeys against the stub BFF
E2E_BASE_URL=http://localhost:3000 npm run e2e   # ...or against a deployment backed by a real BFF
npm run lhci                          # Lighthouse CI budgets, mobile (LHCI_FORM_FACTOR=desktop for desktop)
make check-all                        # lint, typecheck, coverage, bundle-check, e2e
```

First Playwright use: `npx playwright install chromium`. Lighthouse needs Chrome; set `CHROME_PATH` if it is not found.

## CI jobs (`.github/workflows/ci.yml`)

| Job | What it guards |
|---|---|
| `web` | eslint, tsc, vitest with coverage thresholds, production build |
| `no-network-url-in-bundle` | the client bundle holds only `/api/storefront` URLs: no other `/api/<x>` or `/graphql/<x>`, no in-cluster host, no `BFF_URL` |
| `lighthouse-budgets` | LCP <= 2.5 s, TBT <= 200 ms (INP proxy), CLS <= 0.1 on home, search, product page, cart (mobile and desktop) |
| `e2e` | Playwright journeys: browse to confirmation, declined and in-doubt payment, orders to cancel, CSP |
| `guide-lint` | agent-harness guides, repo lint and hook tests |
| `docker-build` | the image builds (and re-runs the bundle sensor inside the build) |

## Security

Strict, nonce-based CSP on every HTML response (ADR 0003): no inline script or style, `connect-src 'self'`.

## Agent harness

Instantiated with the agent-runtime harness of `warehouse-harness-template` (`harness-template: v4`): hooks,
scoped rules in `.claude/rules`, skills in `.claude/skills`, review subagents, memory, `guide-lint` and `repo_lint`.
See `HARNESS.md`.
