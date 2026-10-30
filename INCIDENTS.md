# Incidents

| Date | What escaped | Fix | Sensor now guarding it |
|---|---|---|---|
| 2026-10-26 | A helper exported from a route module broke the account page after build (found by the first Playwright run) | Moved to `app/lib/shopper.ts` | Rule in `.claude/rules/routes-and-loaders.md`; the e2e journeys |
| 2026-10-29 | Live cluster: the cart destination was posted as `{postalPrefix}`; shopping-cart's strict decoder answered 400 `json: unknown field "postalPrefix"` (the stub accepted it) | `setDestination` sends `{destinationPostalPrefix}` | `server/stub.test.ts` (stub rejects unknown fields), `queries.test.ts`, journey asserts the body |
| 2026-10-29 | Live cluster: the full ZIP (`78701`) was sent as the destination; every quote answered `DESTINATION_NOT_SERVED` (prefix length is 3) | One `postalPrefixOf` for delivery dates and the cart | `destination.test.ts`, stub serves only 3-character prefixes, journey "not served" |
| 2026-10-29 | Live cluster: the category facet showed raw ids (`cat-80c58ef626f7 (1)`) | Names from `GET /categories`, fallback to the hits' category path | `departments.test.ts`, journey asserts no `cat-` in the facets |
| 2026-10-29 | Live cluster: `GET /carts` answered 422 on every product page for anonymous visitors | Listed only with a remembered shopper session | `cart-session.test.ts`, journey asserts no 4xx from `/api/storefront` |
