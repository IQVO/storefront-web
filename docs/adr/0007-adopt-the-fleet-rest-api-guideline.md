# 7. Adopt the fleet REST API guideline

Status: Accepted. Design source: the fleet REST API guideline (warehouse-docs, STANDARD.md) and the storefront-bff
cutover. Supersedes the `X-Action-Id` sentence of ADR 0002.

## Context

storefront-bff moved to the fleet REST guideline in one hard cutover: noun routes instead of `:verb` custom
methods, an `Idempotency-Key` header on every POST and PATCH, a paged `{items, nextCursor}` envelope on every
collection, and `409 idempotency-key-reused`. storefront-web is the BFF's browser client (and its Node SSR layer),
so it must change in the same release; there are no aliases and no toggles.

## Decision

- **Routes.** `POST /products/{id}/delivery-date-quotes`, `POST /carts/{id}/delivery-quotes`,
  `PUT /carts/{id}/delivery-selection`, `PUT /carts/{id}/destination`, `POST /checkout/{id}/confirmations`,
  `POST /orders/{id}/cancellations` replace `:delivery-dates`, `:delivery:quote`, `:delivery:select`, the POST
  destination, `:confirm` and `:cancel`. The stub BFF serves only the new routes (the old ones answer 404).
- **Idempotency.** `Idempotency-Key` replaces `X-Action-Id` on every POST and PATCH: one `crypto.randomUUID()` per
  user action (`app/lib/action-id.ts`), reused on a retry until the action succeeded; `callRaw` mints a fresh key if
  a caller gives none. PUT and DELETE carry none. A `409 idempotency-key-reused` is a bug in the page: it is logged
  with `console.error` and never retried. The stub BFF answers 400 `idempotency-key-required` / `-invalid`.
- **Lists.** Requests use `limit` and `cursor` (the retired `after` is gone); responses are read from `items`.
  Product search answers `{items, facets, categorySuggestions, nextCursor}` (it was `hits` and `next`) and shows one
  page with a "Next page" link carrying `nextCursor`; `/orders` shows "Older orders" the same way. Neither assumes page
  one is everything. `GET /carts?state=OPEN` only needs any open cart, so it reads the first page.
  `GET /categories` is the BFF's `x-pagination-exempt: view` navigation tree and keeps `{version, categories}`.

## Exemptions

None: storefront-web serves no API of its own, so there is no `x-pagination-exempt` and no OpenAPI document to lint.

## Consequences

- Must be deployed together with the storefront-bff cutover (BREAKING for any BFF that still serves the old routes).
- The page types follow the wire: `ProductSearchResult` is `{items, facets, categorySuggestions, nextCursor}`.
