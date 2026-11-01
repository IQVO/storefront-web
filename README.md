# storefront-web

[![CI](https://github.com/IQVO/storefront-web/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/IQVO/storefront-web/actions/workflows/ci.yml?query=branch%3Adevelop) [![Node](https://img.shields.io/badge/node-22.18-339933?logo=nodedotjs&logoColor=white)](https://github.com/IQVO/storefront-web/blob/develop/package.json) [![docs](https://img.shields.io/badge/docs-iqvo.github.io-blue)](https://iqvo.github.io/storefront-web/)

The React server-side-rendered storefront of the retail-network storefront domain: home, search and category,
product page, cart, checkout, confirmation, orders, order detail with tracking, and order cancellation.

It talks to **one** backend, the [storefront-bff](https://github.com/IQVO/storefront-bff), through the relative base
`/api/storefront`. It stores no personal data, never sees a card number (payment fields are simulated and post only a
scenario token), and invents no ids.

## Disclaimer

This project is a domain-driven design study. It is not associated with, endorsed by or affiliated with any company, and it uses no company's code, data, logos or trademarks. All names, figures and examples are illustrative or synthetic.

## Documentation

This storefront front end is documented as part of the warehouse-docs
storefront section — the storefront domain pages and the model that is the
single source of truth live at
<https://iqvo.github.io/warehouse-docs/storefront/>. Decisions for this repo
live in docs/adr/ (5 ADRs).

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

## Storefront UI

A general-merchandise marketplace layout: dark header (wordmark, "Deliver to" chip, department + text search,
account, returns and orders, cart badge) over a department bar fed by the BFF's `GET /categories` (the web degrades
to "All" and to the hits' category names while a BFF without that route answers 404); home with department cards and
"Popular in" rows; search with department/price/availability facets; a three-column product page whose buy box shows
the network's delivery promise; cart with delivery options as radio cards; a numbered one-page checkout; confirmation,
orders and an order detail with the promise and a shipment tracker. All styling is in `app/app.css` (strict CSP).

- **Delivery destination.** The network keys every quote by the first 3 characters of the normalised postal code
  (`postalPrefixOf` in `app/lib/destination.ts`): the shopper types and sees `78701`, the BFF receives `787`, for the
  product page's delivery dates and the cart's destination (`{destinationPostalPrefix}`). The typed ZIP is kept in a
  first-party `sf_dest` cookie that holds only the ZIP and its prefix.
- **Shopper session.** `GET /carts` and `/me` need a shopper session; the browser remembers only the BFF-minted shopper
  id after a sign-in or registration and never calls them for an anonymous visitor.
- **Department illustrations.** `public/media/departments/<slug>.svg` (original line art) are served by this app;
  live product content points at `http://storefront.localhost/media/departments/<slug>.svg` and the pages load them
  from their own origin.

The stub BFF (`server/stub*.ts`) enforces the upstream contracts the real BFF relays unchanged: strict decoders
(`postalPrefix` on the cart destination is a 400), `DESTINATION_NOT_SERVED` for anything but the served 3-character
prefixes 786/787, and 422 session-required on `GET /carts` without a shopper (`server/stub.test.ts`).

## Test

```bash
npm run lint && npm run typecheck     # eslint, react-router typegen + tsc --noEmit
npm test                              # vitest (loaders, actions, components, sensor fixtures)
npm run test:coverage                 # + coverage thresholds
npm run check:bundle                  # after a build: no-network-url-in-bundle
npm run e2e                           # Playwright journeys against the stub BFF
E2E_BASE_URL=http://localhost:3000 npm run e2e   # ...or against a deployment backed by a real BFF
npm run e2e:live                      # a real purchase on the live cluster (E2E_LIVE=1, base http://storefront.localhost)
npm run lhci                          # Lighthouse CI budgets, mobile (LHCI_FORM_FACTOR=desktop for desktop)
make check-all                        # lint, typecheck, coverage, bundle-check, e2e
```

`e2e/live-purchase.spec.ts` is skipped unless `E2E_LIVE=1`. It opens the first purchasable product, reads the promise
for ZIP 78701, adds it to the cart, registers a synthetic Austin shopper, chooses a delivery option, checks out with the
Approve scenario and asserts the confirmation and the order detail show the same promise window (order id, tier and
window are printed and attached as annotations). To run it against a local build talking to the cluster's gateway:
`npm run build && BFF_URL=http://localhost:8000 PORT=3200 npm start`, then
`E2E_BASE_URL=http://127.0.0.1:3200 npm run e2e:live` (`BFF_URL` is the gateway origin: the server adds `/api/storefront`).

First Playwright use: `npx playwright install chromium`. Lighthouse needs Chrome; set `CHROME_PATH` if it is not found.

## CI jobs (`.github/workflows/ci.yml`)

| Job | What it guards |
|---|---|
| `web` | eslint, tsc, vitest with coverage thresholds, production build |
| `no-network-url-in-bundle` | the client bundle holds only `/api/storefront` URLs: no other `/api/<x>` or `/graphql/<x>`, no in-cluster host, no `BFF_URL` |
| `lighthouse-budgets` | LCP <= 2.5 s, TBT <= 200 ms (INP proxy), CLS <= 0.1 on home, search, product page, cart (mobile and desktop) |
| `e2e` | Playwright journeys: browse to confirmation, declined and in-doubt payment, orders to cancel, CSP |
| `guide-lint` | agent-harness guides, repo lint and hook tests |
| `helm-lint` | `ct lint --charts charts/storefront-web` against the chart's `ci/` values files, plus `helm lint` |
| `chart-tests` | chart render assertions (`render_test.sh`, `test_service_selectors.py`) |
| `docker-build` | the image builds (and re-runs the bundle sensor inside the build) |

## Security

Strict, nonce-based CSP on every HTML response (ADR 0003): no inline script or style, `connect-src 'self'`.

## Helm chart

`charts/storefront-web` is a minimal chart for the web Deployment: one
process (the Node SSR server, static assets and the `/api/storefront` proxy,
port 3000), one replica, running as the node user (uid/gid 1000, read-only
root filesystem). It refuses to render without the mandatory `config.bffUrl`
value — the BFF origin is deployment configuration, never part of the client
bundle. The image is built from the root Dockerfile (`warehouse/storefront-web`).

## Agent harness

Instantiated with the agent-runtime harness of `warehouse-harness-template` (`harness-template: v4`): hooks,
scoped rules in `.claude/rules`, skills in `.claude/skills`, review subagents, memory, `guide-lint` and `repo_lint`.
See `HARNESS.md`.

## Architecture Decision Records

Five ADRs live in [`docs/adr/`](docs/adr/):

- [0001 — React Router 7 framework SSR](docs/adr/0001-react-router-7-framework-ssr.md)
- [0002 — BFF-only API access and the state cookie](docs/adr/0002-bff-only-and-state-cookie.md)
- [0003 — strict, nonce-based CSP](docs/adr/0003-strict-csp.md)
- [0004 — simulated payment fields](docs/adr/0004-simulated-payment-fields.md)
- [0005 — CI sensors and the stub BFF](docs/adr/0005-ci-sensors-and-stub-bff.md)
