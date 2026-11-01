---
id: testing
title: Testing
sidebar_label: Testing
description: "The storefront-web test pyramid: vitest unit and route tests, the stub BFF, Playwright journeys, the bundle sensor, Lighthouse budgets, chart tests and the CI jobs."
---

# Testing

A frontend has no database or broker to integration-test; what protects it is a layered set of gates, from fast unit tests to browser journeys and performance budgets, all runnable without a backend because the stub BFF stands in for storefront-bff.

| Layer | Tool | Where | Count today | Backend needed |
|---|---|---|---|---|
| Lint and types | eslint, `react-router typegen` + `tsc --noEmit` | whole repo | n/a | no |
| Unit and component | vitest 5, jsdom, Testing Library | `app/**/*.test.{ts,tsx}` | 143 `it`/`test` declarations over 21 files (a static count; `each` tables expand at run time) | no |
| Loader and action | vitest + React Router `createRoutesStub` | `app/routes/*.test.ts(x)` | `loaders.test.ts` 6, `actions.test.ts` 15, `pages.test.tsx` 18, `pages2.test.tsx` 18 | no |
| Server and stub | vitest (node APIs) | `server/proxy.test.ts` (5), `server/stub.test.ts` (5) | 10 | no |
| Sensor logic | vitest | `scripts/bundle-scan.test.ts` | 1 | no |
| Bundle sensor | `scripts/check-bundle.mjs` | over `build/client` | CI job `no-network-url-in-bundle` | no |
| End-to-end | Playwright (chromium) | `e2e/*.spec.ts` | 5 journeys + 3 security checks run in CI; 1 live purchase skipped unless `E2E_LIVE=1` | stub by default, real BFF with `E2E_BASE_URL` |
| Performance | Lighthouse CI | `lighthouserc.cjs` | 4 URLs x mobile and desktop x 3 runs | stub |
| Chart | `helm`, bash and Python | `charts/storefront-web/tests/` | `render_test.sh`, `test_service_selectors.py` | no |
| Agent harness | Python | `scripts/harness/` | `guide_lint.py`, `repo_lint.py`, `test_hook.py`, `test_red_issue.py`, `test_repo_lint.py` | no |

There are no contract tests against the BFF's OpenAPI document, no mutation testing and no visual regression. Contract drift is instead caught by the stub, which enforces the upstream rules (see below).

## Running

| Target | Command | Notes |
|---|---|---|
| Lint | `make lint` / `npm run lint` | `eslint .` with `typescript-eslint`, `eslint-plugin-react-hooks`, `eqeqeq`, no `any`, consistent type imports, and a `no-restricted-syntax` rule that bans absolute `http(s)://` string literals in app code (ADR 0002; relaxed for `*.server.ts`, tests, `e2e/`, `server/`, `scripts/`, config files) (`eslint.config.js`) |
| Types | `make typecheck` / `npm run typecheck` | `react-router typegen && tsc --noEmit` |
| Unit tests | `make test` / `npm test` | `vitest run`, jsdom |
| Coverage | `make coverage` / `npm run test:coverage` | v8 provider over `app/lib`, `app/components`, `app/routes`; thresholds lines 90, functions 85, statements 88, branches 70 (`vitest.config.ts`) |
| Bundle sensor | `make bundle-check` | `build` then `node scripts/check-bundle.mjs` |
| E2E | `make e2e` / `npm run e2e` | builds, starts the stub on port 3100, runs chromium with one worker; first use needs `npx playwright install chromium` |
| E2E against a real BFF | `E2E_BASE_URL=http://localhost:3000 npm run e2e` | no web server is started; the target must already run |
| Live purchase | `npm run e2e:live` | `e2e/live-purchase.spec.ts`; places a real order in the cluster with synthetic data |
| Lighthouse | `make lighthouse` | build, then mobile and desktop budgets on port 3200 |
| Everything fast | `make check` | lint, typecheck, test, build |
| Everything | `make check-all` | lint, typecheck, coverage, bundle-check, e2e |
| Harness | `make guide-lint`, `make harness-test` | Python linters and hook tests |
| Chart | `bash charts/storefront-web/tests/render_test.sh`, `python3 charts/storefront-web/tests/test_service_selectors.py` | need `helm`; the Python test needs PyYAML |

## Unit, component and route tests

`vitest.config.ts` includes `app/**/*.test.{ts,tsx}`, `server/**/*.test.ts` and `scripts/**/*.test.ts`, runs under jsdom, aliases `~` to `app/`, and loads `app/test/setup.ts` (jest-dom matchers, cleanup after each test, `localStorage` cleared, a 4 s async timeout for Testing Library because route stubs resolve loaders asynchronously).

- **`app/lib/*.test.ts`**: the pure logic. `api.test.ts` (headers, `X-Action-Id`, cookie forwarding, problem parsing), `queries.test.ts` (request bodies, notably `{destinationPostalPrefix}`), `destination.test.ts` (3-character prefix), `dates.test.ts` (promise windows in the destination's time zone, switching `TZ`), `cart-session.test.ts`, `checkout.test.ts`, `payment.test.ts`, `promise.test.ts`, `departments.test.ts`, `order-status.test.ts`, `money.test.ts`, `search-params.test.ts`, `action-id.test.tsx`.
- **`app/components/*.test.tsx`**: rendering and interaction through Testing Library (`components.test.tsx`, `CartLink.test.tsx`).
- **`app/routes/loaders.test.ts`**: server loaders receive a `Request` carrying a cookie and must forward it to the BFF (`opts?.cookie`).
- **`app/routes/actions.test.ts`**, **`pages.test.tsx`**, **`pages2.test.tsx`**: client actions and whole route components mounted with `createRoutesStub`, with `~/lib/queries.ts` mocked.
- **`server/proxy.test.ts`**: the proxy forwards method, path and query to the BFF origin, pins the upstream `Host`, pipes bodies, rejects absolute-form and protocol-relative request targets with 400, and reports an unreachable upstream as 503 problem+json.
- **`server/stub.test.ts`**: the stub enforces the upstream contracts: strict decoders (an unknown field is a 400), `DESTINATION_NOT_SERVED` for any prefix other than 786/787, and 422 `session-required` on `GET /carts` without a shopper.
- **`scripts/bundle-scan.test.ts`**: each rule of the bundle sensor fires on a sample (for example `process.env.BFF_URL` yields `backend-env`).

Rules from the repo's own guide (`.claude/skills/how-to-test/SKILL.md`): a bundle-sensor hit names the rule and the string, so fix the code and never the allow-list unless the string is a pure namespace; fix a Lighthouse failure in the page (image priority, JS weight, layout shift), never the budget; and do not run two builds at once, because a rebuild under a running server mismatches asset hashes. When an incident escapes, add the guard test and a row to `INCIDENTS.md`.

## The stub BFF

`server/stub*.ts` is an in-memory, stateful stand-in for storefront-bff, mounted under `/api/storefront` when `STOREFRONT_STUB=1` (ADR 0005). It serves synthetic departments and products (`server/fixtures.ts`, for example `item-kettle`, `item-mug`), carts, delivery quotes, checkout sessions with the three payment scenarios, orders and shoppers, sets the `sf_state` cookie the way the BFF does, and returns problem+json for errors. It exists so CI needs no running backend and so the web cannot drift unnoticed from contracts the BFF relays unchanged. The incident log shows why: a body field sent as `postalPrefix` (instead of `destinationPostalPrefix`) and a full ZIP sent as the destination both passed a lenient fake and failed on the live cluster; the stub now rejects both.

## End-to-end journeys (Playwright)

`playwright.config.ts`: `testDir: e2e`, one worker, chromium (Desktop Chrome), `trace: retain-on-failure`, one retry and an HTML report when `CI` is set. Without `E2E_BASE_URL` it starts `npm run build && STOREFRONT_STUB=1 PORT=3100 node server/index.ts` and waits on `/healthz` (120 s timeout).

| File | Test | What it proves |
|---|---|---|
| `journeys.spec.ts` | browse, product promise, cart, checkout, confirmation | the happy path; the destination body is exactly `{destinationPostalPrefix: "787"}`; no `/api/storefront` response with status 400 or above on the way |
| `journeys.spec.ts` | a ZIP outside the service areas | "This item cannot be delivered to ZIP 10001 yet." |
| `journeys.spec.ts` | a declined payment | the shopper stays on checkout with the declined alert |
| `journeys.spec.ts` | orders, detail with promise and tracker, cancel | the order goes from Placed to Cancelled |
| `journeys.spec.ts` | department navigation | filters by category id, facets show names not ids, every `/api/*` call starts with `/api/storefront/` |
| `security.spec.ts` | strict CSP | the header has `default-src 'none'`, a nonce `script-src`, no `unsafe-inline`/`unsafe-eval`, `frame-ancestors 'none'`; seven pages load with no CSP console violation |
| `security.spec.ts` | department illustrations | served by this origin as `image/svg+xml` |
| `security.spec.ts` | in-doubt payment | the "Time out" scenario shows "placing your order" and then settles on the confirmation |
| `live-purchase.spec.ts` | buy on the live network | skipped unless `E2E_LIVE=1`; product, promise, registration, delivery choice, Approve checkout, same promise window on confirmation and order detail |

Shared steps (`addToCart`, `register`, `signIn`, `chooseDelivery`, `checkout`, `seePromise`) live in `e2e/steps.ts`.

## The `no-network-url-in-bundle` sensor

`scripts/check-bundle.mjs` walks `build/client` (`.js .mjs .css .html .json .map`) and applies `scripts/bundle-scan.mjs`. It fails (exit 1) on any hit of: `other-api-route` (an `/api/` or `/graphql/` path other than `/api/storefront`), `in-cluster-host` (`*.svc`, `cluster.local`, loopback with a port), `service-endpoint` (one of fifteen network service names used as an endpoint), `backend-env` (the string `BFF_URL`) and `absolute-url` (any host outside `localhost, www.w3.org, react.dev, reactrouter.com, github.com, reactjs.org, developer.mozilla.org`). It exits 2 when there is nothing to scan. The Dockerfile runs it too, so an image cannot be built from a leaking bundle.

## Lighthouse budgets

`lighthouserc.cjs` starts `STOREFRONT_STUB=1 PORT=3200 node server/index.ts`, audits only the performance category, three runs per URL, and asserts on the **median run**:

| Metric | Budget (error above) |
|---|---|
| `largest-contentful-paint` | 2500 ms |
| `total-blocking-time` (lab proxy for INP) | 200 ms |
| `cumulative-layout-shift` | 0.1 |

URLs: `/`, `/search?q=mug`, `/products/item-kettle`, `/cart`. `LHCI_FORM_FACTOR=desktop` switches to the desktop preset; CI runs mobile first and desktop second, and uploads `.lighthouseci` as the `lighthouse-reports` artifact. Reports are written to `.lighthouseci/mobile` or `.lighthouseci/desktop`.

## CI jobs (`.github/workflows/ci.yml`)

Runs on pushes and pull requests to `develop` and `main`.

| Job | Required | What it guards |
|---|---|---|
| `guide-lint` | yes | `guide_lint.py`, `repo_lint.py`, `test_hook.py`, `test_red_issue.py`, `test_repo_lint.py` (agent guides, repo lint, hook tests) |
| `web` | yes | `npm ci`, `lint`, `typecheck`, `test:coverage` (with the thresholds), `build` |
| `file-length` | no | on pull requests into `develop`: at most 300 lines of code in every `.ts`/`.tsx` file the PR touches (oxlint `max-lines`, `.oxlintrc.file-length.json`); informational elsewhere |
| `no-network-url-in-bundle` | yes | `build` then `check:bundle` |
| `lighthouse-budgets` | yes | `build`, `lhci` mobile, `lhci` desktop with `CHROME_PATH=/usr/bin/google-chrome` |
| `e2e` | yes | `npx playwright install --with-deps chromium`, `npm run e2e` with `CI=true`; uploads `playwright-report` and `test-results` on failure |
| `docker-build` | yes | `docker build -t storefront-web:ci .` (which re-runs the bundle sensor inside the build) |
| `helm-lint` | no | pull requests only: `ct lint` and `helm lint` with each `charts/storefront-web/ci/*.yaml` |
| `chart-tests` | no | every `charts/storefront-web/tests/*.sh` and `test_*.py`; a test printing `SKIP` fails the job |

Other workflows: `codeql.yml` (code scanning), `ai-review.yml` and `docs.yml` (builds this site on pull requests, deploys on push to `main`). The documentation build is separate from the required checks.

## Adding a test

1. Logic in `app/lib`: add `<name>.test.ts` beside it and run `npm test`; route tests mount the component with `createRoutesStub` and mock `~/lib/queries.ts`.
2. A new BFF call: add the function to `app/lib/queries.ts`, assert its path, method and body in `queries.test.ts`, give the stub the route in `server/stub*.ts` with the same strictness as the real contract, and extend a journey if the shopper flow changes.
3. A new page: add the route to `app/routes.ts`, a `loader` (server) or `clientLoader` (needs the cookie) and a route test; check Lighthouse if it is on the critical path.
4. Anything in the browser that touches a new origin must fail `no-network-url-in-bundle` or the CSP journey: fix the code, not the gate.
