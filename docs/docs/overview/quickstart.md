---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
description: "Install, run the storefront against the stub BFF or a real one, build, test and serve the image locally."
---

# Quickstart

storefront-web needs **no database, no Kafka and no secret**. Its only dependency is the storefront-bff, and for local work you do not even need that: the repository ships an in-memory stub BFF (`server/stub*.ts`).

:::note
The commands and responses below are derived from the code on this branch (`package.json`, `Makefile`, `server/`). They are not pasted from a captured terminal session.
:::

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | `>=22.18` (`engines` in `package.json`; `.nvmrc` says `22`) | the server runs TypeScript directly (`node server/index.ts`), which needs Node's native type stripping |
| npm | the one that ships with Node 22 | `npm ci` against the committed `package-lock.json` |
| Chromium for Playwright | installed once with `npx playwright install chromium` | `npm run e2e` |
| Chrome | any recent; set `CHROME_PATH` if it is not found | `npm run lhci` |
| GNU make | any | optional thin wrappers over npm |
| Docker | optional | `docker build -t storefront-web:ci .` |
| Helm, Python 3 | optional | chart tests under `charts/storefront-web/tests/` and the harness linters under `scripts/harness/` |

## Run it against the stub BFF (no backend)

```bash
npm ci
npm run build
npm run start:stub        # STOREFRONT_STUB=1 node server/index.ts, listening on :3000
```

The server logs `storefront-web listening on :3000 (stub BFF)`. Open `http://localhost:3000/`. The stub serves synthetic departments and products (for example `item-kettle`, `item-mug`) and enforces the same contract as the real BFF: a 3-character destination prefix, `422 session-required` on `GET /carts` without a shopper, problem+json errors. Typing the ZIP `78701` (prefix `787`) gives delivery promises; `10001` is answered "not served".

First calls, from another terminal:

```bash
curl -i http://localhost:3000/healthz                              # 200, body: ok
curl -s http://localhost:3000/api/storefront/categories            # the department tree
curl -s 'http://localhost:3000/api/storefront/products?q=kettle'   # search hits and facets
curl -i -X POST http://localhost:3000/api/storefront/carts         # 201 and Set-Cookie: sf_state=...; Path=/api/storefront; HttpOnly
```

## Run it against a real BFF

```bash
BFF_URL=http://127.0.0.1:8080 npm run dev                # Vite dev server with HMR on :5180
npm run build
BFF_URL=http://127.0.0.1:8080 npm start                  # production server on :3000
```

`BFF_URL` is the BFF **origin** (the server appends `/api/storefront`). When pointing at the platform gateway, use its origin, for example `BFF_URL=http://localhost:8000 PORT=3200 npm start`. See [Configuration](./../operations/configuration.md) for every variable and [Integration](./../ecosystem/integration.md) for the routes called.

## Command reference

| Command | What it does |
|---|---|
| `npm ci` / `make install` | install the locked dependencies |
| `npm run dev` | `react-router dev --port 5180` |
| `npm run build` / `make build` | `react-router build` into `build/client` and `build/server` |
| `npm start` | `node server/index.ts`: SSR, static assets, `/healthz`, `/readyz`, the `/api/storefront` proxy |
| `npm run start:stub` | the same with `STOREFRONT_STUB=1` |
| `npm run lint` / `make lint` | `eslint .` |
| `npm run typecheck` / `make typecheck` | `react-router typegen && tsc --noEmit` |
| `npm test` / `make test` | `vitest run` |
| `npm run test:coverage` / `make coverage` | vitest with the thresholds of `vitest.config.ts` |
| `npm run check:bundle` | the `no-network-url-in-bundle` sensor over `build/client` (run `npm run build` first) |
| `make bundle-check` | `build` then `check:bundle` |
| `npm run e2e` / `make e2e` | Playwright journeys, building and serving the stub on port 3100 |
| `npm run e2e:live` | one real purchase against a live storefront (`E2E_LIVE=1`, base `http://storefront.localhost` unless `E2E_BASE_URL` is set) |
| `npm run lhci` | Lighthouse CI budgets (mobile); `LHCI_FORM_FACTOR=desktop` for desktop |
| `make lighthouse` | `build`, then `lhci` for mobile and for desktop |
| `make check` | `lint`, `typecheck`, `test`, `build` |
| `make check-fast` | `lint`, `typecheck` (the agent Stop hook gate) |
| `make check-all` | `lint`, `typecheck`, `coverage`, `bundle-check`, `e2e` |
| `make guide-lint` | `python3 scripts/harness/guide_lint.py` |
| `make harness-test` | `test_hook.py` and `test_red_issue.py` |

## Build and run the image

```bash
docker build -t storefront-web:local .
docker run --rm -p 3000:3000 -e BFF_URL=http://host.docker.internal:8080 storefront-web:local
```

The build stage runs `npm run build && npm run check:bundle`, so an image never exists with a leaking bundle. The runtime stage is `node:22-slim` as user `node`, port 3000, with a `HEALTHCHECK` on `/healthz`.

## Where to go next

- How a request flows: [Architecture](./architecture.md).
- Day-two operation: [Runbook](./../operations/runbook.md) and [Troubleshooting](./../operations/troubleshooting.md).
- Writing and gating changes: [Testing](./../development/testing.md).
