---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: "Symptom, cause, check and fix for the real failure modes of the storefront-web server, build, CI sensors and shopper flows."
---

# Troubleshooting

Each entry is a symptom, the cause in code, how to check it and the fix. The deployed process is stateless and has one dependency, so most production symptoms trace back to the BFF origin or to a contract change upstream. See the [Runbook](./runbook.md) for the procedures and [Configuration](./configuration.md) for the variables.

## Server and deployment

### Every page shows "Something went wrong" (or a problem title)

- **Cause**: an SSR loader called the BFF and failed. The root `ErrorBoundary` (`app/root.tsx`) renders the RFC 9457 problem `title`/`detail`, or "The store is temporarily unavailable. Please retry shortly." for any 5xx `ApiError`, or the generic text for a thrown non-API error such as a network failure.
- **Check**: `/healthz` still answers 200 (it does not look at the BFF). Call the BFF through the pod: `kubectl -n warehouse-systems exec deploy/storefront-web -- node -e "fetch(process.env.BFF_URL + '/api/storefront/categories').then(r=>console.log(r.status))"`.
- **Fix**: restore the storefront-bff, or correct `config.bffUrl`. Only `GET /categories` is optional (the root and home loaders catch it and fall back to an "All" department bar); the search and product loaders, and the product searches on the home page, propagate a BFF failure.

### `/api/storefront/...` answers 503 `application/problem+json`

- **Cause**: the in-server proxy (`server/proxy.ts`) could not reach `BFF_URL`, or the upstream did not answer within 20 s. The body is `{"type":"/problems/upstream-unavailable","title":"The store is temporarily unavailable","status":503}`. If the response had already started, the connection is destroyed instead.
- **Check**: the same `fetch` as above from the pod; DNS and Service name of the BFF; `kubectl get cm storefront-web -o yaml` for `BFF_URL`.
- **Fix**: same as above. In a cluster the gateway normally routes `/api/storefront` straight to the BFF, so a 503 with this body means the request came through this server's proxy (a port-forward, a direct hit, or a gateway rule that sends the prefix to the web).

### 400 `/problems/invalid-request-target` on `/api/storefront`

- **Cause**: the proxy refuses a request target that carries its own authority (absolute-form `http://host/x` or protocol-relative `//host/x`) so it can never be steered to another host (SSRF guard, `server/proxy.ts`, `server/proxy.test.ts`). The upstream scheme, host and port always come from `BFF_URL`.
- **Fix**: send root-relative paths (`/api/storefront/...`). A client that sends absolute-form targets to the web server is misconfigured.

### 404 on every BFF call, or paths like `/api/storefront/api/storefront/...`

- **Cause**: `BFF_URL` carries a path. It must be an **origin**; `serverBase()` (`app/lib/api.server.ts`) appends `/api/storefront` to whatever it holds, so the SSR loaders call `<path>/api/storefront/...`. (The proxy in `server/proxy.ts` uses only scheme, host and port from `BFF_URL` and ignores its path, so browser calls through the proxy may still work while the SSR pages fail.)
- **Check**: the value of `BFF_URL` in the ConfigMap.
- **Fix**: set `config.bffUrl` to `http://host:port` with no path.

### Pod starts and every request fails with `ECONNREFUSED 127.0.0.1:8080`

- **Cause**: `BFF_URL` was not set, so the code default `http://127.0.0.1:8080` applied (`server/index.ts`, `app/lib/api.server.ts`). Only possible outside the chart, which refuses to render without `config.bffUrl`.
- **Fix**: set `BFF_URL`.

### `helm template` fails

- **Cause**: one of the render guards in `charts/storefront-web/templates/_helpers.tpl`: missing `config.bffUrl`; `config.port` different from `service.targetPort`; `extraEnv` containing `STOREFRONT_STUB`, `BFF_URL`, `PORT` or `COOKIE_SECURE`.
- **Fix**: the error message names the value; follow it.

### Container exits at boot with `ERR_UNKNOWN_FILE_EXTENSION` or a syntax error on `server/index.ts`

- **Cause**: Node older than 22.18. The server is TypeScript run directly by Node (`node server/index.ts`).
- **Check**: `node --version`. The image uses `node:22-slim`; `package.json` requires `>=22.18`.
- **Fix**: upgrade Node (`nvm use`, `.nvmrc` says `22`).

### `Cannot find module '.../build/server/index.js'`

- **Cause**: `npm start` or `npm run start:stub` without a build. The server imports `build/server/index.js` at boot (`server/index.ts` line 14).
- **Fix**: `npm run build` first. In the image the build is baked in; a missing `build/` means the Dockerfile COPY changed.

### The pod is Ready but the shop is down

- **Cause**: by design the probes only prove the listener is up (`server/index.ts`).
- **Fix**: alert on the storefront-bff and on the gateway's 5xx for `/`, not on these probes.

### Cookie marked Secure has no effect

- **Cause**: `COOKIE_SECURE` is rendered by the chart from `config.cookieSecure` but **nothing in this repository reads it** (grep over `app/`, `server/`, `scripts/` finds only chart files and documentation). The `sf_state` cookie is created by the storefront-bff (the stub sets `Path=/api/storefront; HttpOnly; SameSite=Lax; Max-Age=2592000`, `server/stub.ts`) and the `sf_dest` cookie by the browser (`app/lib/destination.ts`: `Path=/; Max-Age=2592000; SameSite=Lax`, never Secure).
- **Check**: look at the `Set-Cookie` header on `POST /api/storefront/carts` or `/shoppers` through the gateway.
- **Fix**: set the `Secure` attribute where the cookie is minted (storefront-bff or the gateway). Treat this as a known gap between the chart's value and the code.

## Shopper-visible flows

### "Please sign in or register on the Account page first."

- **Cause**: the BFF answered `422 /problems/session-required` (`problemMessage` in `app/components/ProblemAlert.tsx`). `GET /carts`, `GET /me` and the order calls need a shopper session in the `sf_state` cookie.
- **Check**: browser devtools, Application, Cookies: `sf_state` under path `/api/storefront`. It is `HttpOnly`, so the page keeps only a marker (`sf.shopperId` in `localStorage`, `app/lib/shopper.ts`) and `/me` stays the authority; a 422 or 404 from `/me` clears the marker.
- **Fix**: sign in or register on `/account`. If it recurs for a signed-in shopper, the cookie is not reaching the BFF: check that the page and `/api/storefront` share an origin (no extra proxy dropping `Cookie`/`Set-Cookie`).

### The cart is empty after a deploy or browser change

- **Cause**: the cart id lives in `localStorage` (`sf.cartId`, `app/lib/cart-session.ts`) and the cart itself in the BFF. A 404 for the remembered id clears the key; a cart that is no longer `OPEN` is forgotten.
- **Fix**: nothing to repair; the shopper adds the item again. A signed-in shopper's open cart is found again through `GET /carts?state=OPEN`.

### "Delivery options were just refreshed. Please choose your delivery option again."

- **Cause**: `409 /problems/stale-delivery-selection`: the quote changed between display and selection.
- **Fix**: choose again in the cart; the quote is re-requested.

### "This item cannot be delivered to ZIP `<zip>` yet."

- **Cause**: the delivery network serves only some 3-character postal prefixes. The web sends `postalPrefixOf(zip)` (`app/lib/destination.ts`), never the full ZIP, and the BFF answers `unavailable: DESTINATION_NOT_SERVED` (`app/components/DeliveryPromise.tsx`). In the stub only prefixes 786 and 787 are served.
- **Check**: the request body of `POST /products/{id}/delivery-date-quotes` must be `{ "postalPrefix": "787" }`; the cart destination body must be `{ "destinationPostalPrefix": "787" }`.
- **Fix**: a different ZIP, or enable the area in the delivery network. If every ZIP is refused, the full ZIP is being sent: that regression has happened before (see `INCIDENTS.md`).

### 400 `json: unknown field "..."` from a BFF call

- **Cause**: the upstream Go services decode strictly. A field the web sends but the contract does not name is rejected. The stub reproduces this (`unknownField` in `server/stub.ts`) so the e2e journey catches it.
- **Fix**: align the body in `app/lib/queries.ts` with the BFF's `apis/openapi.yaml` and add or extend the test in `server/stub.test.ts` / `app/lib/queries.test.ts`.

### Delivery dates are "unavailable right now"

- **Cause**: the client-side `POST /products/{id}/delivery-date-quotes` failed (`DeliveryPromise` catches every error and shows that text). It never blocks the product page, which renders without it.
- **Fix**: check the BFF and the delivery-promise service behind it.

### The department bar only shows "All" and facets show category names oddly

- **Cause**: `GET /categories` answered 404 or failed; `app/root.tsx` swallows the error and `app/lib/departments.ts` falls back to the hit's category names.
- **Fix**: deploy a BFF that serves `/categories`.

### "We are placing your order" never ends

- **Cause**: the checkout session is `PLACING` or `AUTHORIZING` (payment in doubt; the "Time out" scenario produces it). The confirmation page polls every 2 s up to 30 times (about a minute, `app/routes/confirmation.tsx`) and then stops.
- **Fix**: reload `/confirmation/<sessionId>` or open Your Orders; the placement settles server side. If it stays in doubt, investigate the payment and ordering services, not the web.

### "Your payment was declined"

- **Cause**: the "Decline" scenario or a real decline. The session returns to `DECLINED` and the shopper stays on `/checkout` (`outcomeMessage` in `app/lib/checkout.ts`).
- **Fix**: choose another scenario and place the order again. Payments in this study are simulated; the page only posts `tok_approve`, `tok_decline` or `tok_timeout` (`app/lib/payment.ts`). A "card data is not accepted" 422 means someone tried to send a card number, which the contract forbids.

### "This order can no longer be cancelled"

- **Cause**: `409 /problems/cancel-after-lock`: fulfilment has started.
- **Fix**: none; cancellation is no longer possible.

## Build and CI sensors

### `no-network-url-in-bundle` fails

- **Cause**: `scripts/check-bundle.mjs` found, in `build/client`, a rule hit from `scripts/bundle-scan.mjs`: `other-api-route` (an `/api/<x>` or `/graphql/<x>` that is not `/api/storefront`), `in-cluster-host` (`*.svc`, `cluster.local`, `localhost:<port>`), `service-endpoint` (a named network service used as an endpoint), `backend-env` (the string `BFF_URL`) or `absolute-url` (a host not in the allow-list).
- **Check**: the failing line prints file, rule and the matched text.
- **Fix**: call through `app/lib/queries.ts` (relative base) and keep server-only configuration in `*.server.ts` modules. Do not add a host to `ALLOWED_HOSTS` to silence it.

### `e2e` fails locally with "port 3100 is already in use" or stale behaviour

- **Cause**: Playwright reuses a running server on 3100 when `CI` is unset (`reuseExistingServer: !process.env.CI`), so an old build can be served.
- **Fix**: stop the old server, or run with `CI=true`.

### An e2e journey fails with a CSP violation

- **Cause**: `e2e/security.spec.ts` fails on any console message mentioning "content security policy". Inline `<script>`, `style=` attributes or `<style>` blocks, an image from another origin, or a connection to another origin violate `app/csp.ts` (`style-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`).
- **Fix**: move styling to `app/app.css`, serve images from this origin (`public/`), call only `/api/storefront`. Do not loosen the policy: the e2e test asserts the header contains neither `unsafe-inline` nor `unsafe-eval` (ADR 0003).

### `lighthouse-budgets` fails

- **Cause**: the median of three runs exceeded LCP 2.5 s, TBT 200 ms or CLS 0.1 on `/`, `/search?q=mug`, `/products/item-kettle` or `/cart`, in mobile or desktop mode (`lighthouserc.cjs`).
- **Check**: the `lighthouse-reports` artifact (`.lighthouseci/mobile`, `.lighthouseci/desktop`).
- **Fix**: look for new blocking JavaScript, an unsized image (CLS), or a loader that became slower. Do not raise the budget.

### `file-length` fails on a pull request

- **Cause**: on pull requests into `develop` the job runs oxlint `eslint/max-lines` (300 lines of code, blank lines and comments not counted; `.oxlintrc.file-length.json`) over every `.ts`/`.tsx` file the PR adds or touches. Tests, `e2e/`, `docs/` and `build/` are ignored.
- **Fix**: split the file you touched. On pushes and release PRs the same check is informational only. It is not one of the required checks.

### Coverage threshold failure in `web`

- **Cause**: `vitest run --coverage` fell below lines 90, functions 85, statements 88 or branches 70 over `app/lib`, `app/components`, `app/routes`.
- **Fix**: add tests next to the code you changed; see [Testing](../development/testing.md).

### `guide-lint` fails

- **Cause**: an agent guide or skill under `.claude/` has a broken reference or exceeds the context budget (`scripts/harness/guide_lint.py`, `repo_lint.py`).
- **Fix**: run `make guide-lint` and follow the message.

### The Docs workflow fails on a broken link

- **Cause**: every docs page except the ADRs is parsed as MDX, and `docs/docusaurus.config.ts` throws on broken links and anchors.
- **Fix**: run `npm run build` in `docs/`; link pages with absolute `/docs/...` paths or correct relative `.md` paths.
