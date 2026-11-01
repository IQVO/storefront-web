---
id: integration
title: Integration
sidebar_label: Integration
description: "Every upstream and downstream of storefront-web: the storefront-bff routes it calls, who calls it, the contract rules it relies on and how each failure surfaces."
---

# Integration

storefront-web has **one upstream, the storefront-bff**, and no downstream consumers apart from the shopper's browser and the web gateway in front of it. It is not a Kafka producer or consumer, exposes no REST API of its own (beyond `/healthz`, `/readyz` and the proxy), no MCP and no A2A, and calls nothing else: the context rule in ADR 0002 is "the web app talks only to the BFF", enforced by the `no-network-url-in-bundle` sensor, the eslint ban on absolute URL literals and the CSP's `connect-src 'self'`.

## Edges

| Edge | Direction | Protocol | Contract | Present? |
|---|---|---|---|---|
| storefront-bff | web calls it | HTTP/JSON under `/api/storefront`, errors as RFC 9457 `application/problem+json` | the BFF's `apis/openapi.yaml` ([reference](https://iqvo.github.io/warehouse-docs/storefront/api-reference/rest/storefront-bff/storefront-bff-api)) | yes, the only one |
| Web gateway | calls the web | HTTP; routes `/` to this Service and `/api/storefront` to the BFF | not in this repo | yes in a cluster; the in-server proxy covers direct access |
| Shopper's browser | calls the web | HTTP; HTML, JS, CSS, SVG, `/api/storefront` | n/a | yes |
| Kubernetes probes | call the web | `GET /healthz`, `GET /readyz` | `server/index.ts` | yes |
| Any storefront or retail-network service (product-discovery, shopping-cart, checkout, customer-ordering, delivery-promise, pricing, payment provider) | none | none | none | **absent by design**; they are reached only through the BFF |
| Kafka / CloudEvents | none | none | none | absent: no producer, no consumer |
| Authentication provider | none | none | none | absent: there is no auth anywhere; sign-in is a synthetic e-mail lookup |
| Telemetry backend | none | none | none | absent: no OpenTelemetry dependency |

## The BFF routes it calls

All paths are relative to `/api/storefront`. In the browser they are fetched with `credentials: "same-origin"`; on the server (SSR loaders) the base is `<BFF_URL>/api/storefront` with the incoming `Cookie` forwarded. Every operation is one function in `app/lib/queries.ts`.

| Function | Method and path | Where it runs | Used by | Upstream behind the BFF |
|---|---|---|---|---|
| `searchProducts` | `GET /products` (`q`, `categoryId`, `inStock`, `priceMin`, `priceMax`, `sort`, `after`, `limit`) | server | `/`, `/search` | product-discovery |
| `getProduct` | `GET /products/{id}` | server, and browser (cart, checkout, order detail titles) | `/products/:id`, `/cart`, `/checkout`, `/orders/:id` | product-discovery |
| `listCategories` | `GET /categories` | server | root layout, `/` | product-discovery |
| `quoteDeliveryDates` | `POST /products/{id}:delivery-dates` body `{postalPrefix}` | browser | buy box, cart | delivery-promise joined with pricing |
| `createCart` | `POST /carts` | browser | first add to cart | shopping-cart |
| `listCarts` | `GET /carts?state=OPEN` | browser, only with a remembered shopper | cart lookup | shopping-cart |
| `getCart` | `GET /carts/{id}` | browser | cart, checkout, confirmation | shopping-cart |
| `addCartLine` | `POST /carts/{id}/lines` body `{catalogItemId, quantity}` | browser | add to cart | shopping-cart |
| `setLineQuantity` | `PATCH /carts/{id}/lines/{item}` body `{quantity}` | browser | cart | shopping-cart |
| `removeLine` | `DELETE /carts/{id}/lines/{item}` | browser | cart | shopping-cart |
| `setDestination` | `POST /carts/{id}/destination` body `{destinationPostalPrefix}` | browser | cart | shopping-cart |
| `quoteCartDelivery` | `POST /carts/{id}/delivery:quote` | browser | cart | shopping-cart |
| `selectCartDelivery` | `POST /carts/{id}/delivery:select` body `{groupNo, offerId}` | browser | cart | shopping-cart |
| `openCheckout` | `POST /checkout` body `{shipToAddressId, cartId?}` | browser | checkout | checkout |
| `getCheckout` | `GET /checkout/{id}` | browser | checkout, confirmation | checkout |
| `confirmCheckout` | `POST /checkout/{id}:confirm` body `{paymentMethodToken}` | browser | checkout | checkout |
| `listOrders` | `GET /orders?after=` | browser | `/orders` | customer-ordering |
| `getOrder` | `GET /orders/{id}` | browser | confirmation, order detail | customer-ordering |
| `cancelOrder` | `POST /orders/{id}:cancel` body `{reason}` | browser | order detail | customer-ordering |
| `createSession` | `POST /sessions` body `{email}` | browser | sign in | customer-ordering |
| `registerShopper` | `POST /shoppers` | browser | register | customer-ordering |
| `getMe` | `GET /me` | browser | account, checkout, header | customer-ordering |
| `addMyAddress` | `POST /me/addresses` | browser | account | customer-ordering |

The "upstream behind the BFF" column is informational and comes from the aggregator's storefront components page (warehouse-docs, `storefront/docs/components.md`); the web never addresses those services. All 23 operations above exist in the BFF's `storefront/apis/storefront-bff/openapi.yaml` on warehouse-docs `main`; the BFF also serves `GET /healthz` and `GET /readyz`, which the web does not call.

Mutating calls carry `X-Action-Id` (one random token per user action, reused on a retry of the same click) so the BFF can deduplicate with the idempotency key it mints.

## Contract rules the web relies on

- **State cookie.** The BFF sets and reads `sf_state` (cart, shopper and last-checkout ids) with `HttpOnly; SameSite=Lax; Path=/api/storefront`. The web forwards it implicitly in the browser and explicitly in SSR loaders (`serverOpts`). It is state, not authentication.
- **Destination prefix.** The retail network keys delivery quotes by the first 3 characters of the postal code. The web sends `postalPrefixOf(zip)` for `:delivery-dates` (`{postalPrefix}`) and for the cart destination (`{destinationPostalPrefix}`); upstream decoders are strict, so any other field is a 400.
- **Session-required.** `GET /carts`, `GET /me` and the order calls answer `422 /problems/session-required` without a shopper in the cookie; the web asks only when it holds a shopper marker.
- **Payment.** `POST /checkout/{id}:confirm` receives only `tok_approve`, `tok_decline` or `tok_timeout`. The BFF refuses card-shaped tokens with 422.
- **Time zones.** Delivery windows carry an optional IANA `timeZone`; absent means UTC (ADR 0006).
- **Optional route.** `GET /categories` may be missing on an older BFF; the web degrades to an "All" department bar.

## Failure behaviour

The web has no retry, no circuit breaker, no cache and no fallback data: a failed call is shown to the shopper, and the next user action retries. The BFF enforces its own time budgets (the aggregator records 2 s for queries, 5 s for commands, 15 s for checkout confirmation, answering 504 on expiry and never retrying).

| Failure | Where it surfaces | What the shopper sees | Retried by the web? |
|---|---|---|---|
| BFF unreachable from an SSR loader (`/`, `/search`, `/products/:id`) | thrown out of the loader | the root error boundary: "Something went wrong" or the problem title, with a link home | no; reload |
| `GET /categories` fails or 404 | caught in the root and home loaders | the department bar shows "All" | no |
| Product 404 | `product.tsx` loader | the "Page not found" boundary | no |
| BFF unreachable through the in-server proxy | `server/proxy.ts` | browser call fails with `503 /problems/upstream-unavailable` (after at most 20 s); the action shows "The store is temporarily unavailable. Please try again shortly." | no |
| 504 from the BFF (budget expired) | `problemMessage` | "That took too long. Nothing was changed; please try again." | no |
| `session-required` (422) | `problemMessage`, `cart-session.ts`, `shopper.ts` | "Please sign in or register on the Account page first.", or an anonymous visitor is treated as having no cart and no account | no |
| `stale-delivery-selection` (409) | cart actions | "Delivery options were just refreshed. Please choose your delivery option again." | no |
| `cancel-after-lock` (409) | order detail action | "This order can no longer be cancelled because fulfilment has started." | no |
| Payment declined (session state `DECLINED`) | checkout action | the shopper stays on checkout with the declined message | by the shopper |
| Placement in doubt (`PLACING`/`AUTHORIZING`) | confirmation page | "We are placing your order"; revalidates every 2 s up to 30 times | yes, polling for about a minute |
| `REQUOTE_REQUIRED`, `EXPIRED`, `FAILED` | checkout action | explains that nothing was charged | no |
| Delivery dates fail | buy box and cart | "Delivery dates are unavailable right now" (cart: charges omitted); the page still works | no |
| Remembered cart id gone (404) or not `OPEN` | `currentCart` | the key is cleared and the cart looks empty | n/a |
| Any other problem | `problemMessage` | the problem's `detail`, else its `title`, else "The request could not be completed." | no |

A BFF outage never fails the probes: `/healthz` and `/readyz` stay 200, so the Deployment keeps serving error pages instead of restarting. See [Troubleshooting](../operations/troubleshooting.md) and the [Runbook](../operations/runbook.md).

## Changing a contract

When the BFF contract changes, update `app/lib/queries.ts`, the stub (`server/stub*.ts`) and the contract assertions in `app/lib/queries.test.ts` and `server/stub.test.ts` in the same change. The stub is deliberately as strict as the services behind the BFF so that a drift fails in CI rather than on the cluster; two incidents (a wrongly named destination field and a full ZIP sent as destination) are recorded in `INCIDENTS.md`.
