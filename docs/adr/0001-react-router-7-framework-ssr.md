# 1. React Router 7 framework mode with SSR on Node

Status: Accepted. Design source: campaign plan section 0b (storefront-web row) and Phase 5.

## Context

The storefront needs search-engine-visible, fast-to-first-paint catalogue pages (home, search, product) and a set
of shopper-state pages (cart, checkout, orders). The plan fixes the stack: React 19, Vite, React Router 7 in
framework mode with SSR on the Node runtime, TypeScript strict, vitest and Playwright.

## Decision

- React Router `7.18.x` (pinned, not 8) in framework mode, `ssr: true`; the v8 future flags are enabled so the
  upgrade is a version bump. Vite 7 and TypeScript 5.9 are the newest majors the framework supports together.
- **Catalogue pages use server `loader`s** (home, search, product): the HTML arrives rendered, the LCP image is
  eager and high priority, and the loader forwards the browser's cookie to the BFF.
- **Shopper-state pages use `clientLoader` + `HydrateFallback`** (cart, account, checkout, confirmation, orders,
  order detail). See ADR 0002: the BFF's `sf_state` cookie is `HttpOnly` and scoped to `/api/storefront`, so a page
  request never carries it and the server cannot render these pages; the browser fetches them with its cookie.
- `server/index.ts` is a small `node:http` server: static files (fingerprinted assets immutable, brotli/gzip),
  `/healthz`, the SSR handler, and `/api/storefront` forwarded to `BFF_URL` (or answered by the stub BFF when
  `STOREFRONT_STUB=1`). In a cluster the gateway routes `/api/storefront` itself. TypeScript is executed with
  Node's type stripping (Node >= 22.18), hence `erasableSyntaxOnly`.
- Route modules export only route exports; shared helpers live in `app/lib` (a helper exported from a route module
  broke code splitting and the account page in practice).

## Consequences

- No Express or `@react-router/serve`: fewer dependencies, one place that sets headers.
- Cart-like pages show a skeleton first; their Lighthouse numbers measure that shell, which is the honest cost of
  keeping cookie state out of the server.
