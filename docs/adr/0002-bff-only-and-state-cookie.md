# 2. The web app talks only to the BFF and never invents ids

Status: Accepted. Design source: plan section 4.7 (storefront-bff) and rules 3 and 4 of the campaign.

## Context

`/api/storefront` is the storefront's only edge. Cart, shopper and last-checkout ids live in the `sf_state`
cookie (HttpOnly, SameSite=Lax, path `/api/storefront`): state, not authentication.

## Decision

- **One backend base.** The browser bundle knows `/api/storefront` (`app/lib/api.ts`) and nothing else. The server
  loaders reach the BFF through `BFF_URL`, read at runtime in `app/lib/api.server.ts` (a `.server` module, stripped
  from the client build). CI sensor `no-network-url-in-bundle` greps the build for any other `/api/<x>` or
  `/graphql/<x>` path, in-cluster hosts, service endpoints, `BFF_URL` and non-allow-listed absolute URLs; its
  unit tests include bad fixtures so the sensor can be seen to fail. An ESLint rule also bans absolute URL
  literals outside `.server.ts`.
- **Ids come from the BFF.** Pages use ids from BFF answers (`cartId`, `sessionId`, `orderId`, `addressId`).
  The only locally minted value is `X-Action-Id`, a random per-click token the BFF documents; it is kept for a
  retry of the same click and renewed after success, so the BFF's minted Idempotency-Key deduplicates retries.
- **A1 Cart id memory.** Because the cookie is HttpOnly and path-scoped, page code cannot read the cart id.
  The id the BFF returned from `POST /carts` is remembered in `localStorage` (`sf.cartId`) and re-validated with
  `GET /carts/{id}` on every use (404 or a non-OPEN cart clears it; the shopper's `GET /carts?state=OPEN` is the
  fallback when a shopper is signed in). The same applies to the checkout session id in `sessionStorage`.
- **A2 Sign-in.** `POST /sessions` (e-mail lookup) and `POST /shoppers` (register with one saved address) are the
  whole account story; there is no password and no authentication, as everywhere in the storefront.
- **A3 PII.** Addresses are typed into forms and posted to the BFF untouched; the web app keeps no copy. Checkout
  opens a session with a `shipToAddressId` reference only.
- **A4 Category facet.** The product-discovery `category` facet values are used as `categoryId` filter values and
  as labels, because the facet carries no separate id and name.
- **A5 Product titles in the cart.** Cart lines carry only `catalogItemId`; the cart page fetches each product
  (`GET /products/{id}`) for title and price, and falls back to the id if that fails.
