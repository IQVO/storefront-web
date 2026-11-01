---
id: introduction
title: Introduction
sidebar_label: Introduction
description: "What storefront-web is, what it owns and does not own, the shopper journeys it serves and where to read next."
---

# Storefront Web

Storefront Web is the shopper-facing web application of the retail-network storefront: a React 19 server-side-rendered site (React Router 7 framework mode on Node) where a shopper browses departments, searches, reads a product page with the network's delivery promise, fills a cart, picks delivery options, checks out with a simulated payment and tracks or cancels the order. It is an **application in the experience layer** (area Storefront, class Experience): it carries no domain model and is not a bounded context. It has exactly one backend, the [storefront-bff](https://github.com/IQVO/storefront-bff), reached through the relative base `/api/storefront`.

:::note
This is a domain-driven-design study. It is not associated with any company; payments are simulated, product data is synthetic and the app never sees a card number.
:::

## What it owns

| Concern | Where it lives |
|---|---|
| The pages and their data loading | `app/routes.ts` and `app/routes/*.tsx`: nine routes, see [Architecture](./architecture.md) |
| The BFF client and its error model | `app/lib/api.ts`, `app/lib/queries.ts`, `app/lib/api.server.ts` |
| Shopper-side session memory (opaque ids only) | `app/lib/cart-session.ts`, `app/lib/shopper.ts`, `app/lib/destination.ts` |
| The delivery destination (ZIP typed, 3-character prefix sent) | `app/lib/destination.ts`, cookie `sf_dest` |
| Rendering of delivery promises in the destination's time zone | `app/lib/dates.ts`, `app/lib/promise.ts` (ADR 0006) |
| The Node server: SSR, static assets, health probes, the `/api/storefront` proxy | `server/index.ts`, `server/proxy.ts`, `server/static.ts` |
| The Content-Security-Policy and security headers | `app/csp.ts` (ADR 0003) |
| The simulated payment fields | `app/components/PaymentFields.tsx`, `app/lib/payment.ts` (ADR 0004) |
| The stub BFF that lets CI run without a backend | `server/stub*.ts`, `server/fixtures.ts` (ADR 0005) |
| The container image and the Helm chart | `Dockerfile`, `charts/storefront-web/` |
| CI gates: bundle sensor, Lighthouse budgets, e2e journeys | `scripts/`, `lighthouserc.cjs`, `e2e/`, `.github/workflows/ci.yml` |

## What it does NOT own

- **No business rules and no data.** Prices, stock, carts, checkout state, payments and orders belong to the storefront contexts and to the retail network behind the BFF. The web renders what the BFF answers and relays commands.
- **No ids.** Cart, session, order and address ids come from BFF answers. The only value the app generates is `X-Action-Id`, a random per-click token that lets the BFF deduplicate a retried click (ADR 0002).
- **No authentication.** Sign-in is a synthetic lookup by e-mail (`POST /sessions`) and registration (`POST /shoppers`); the `sf_state` cookie carries state, not credentials.
- **No personal data at rest.** Addresses are typed into forms and posted to the BFF untouched; the browser stores only opaque ids (`sf.cartId`, `sf.shopperId`, `sf.checkoutId`) and the ZIP with its prefix in `sf_dest`.
- **No card data.** The "payment fields" are an inert widget; the only thing posted is a scenario token (`tok_approve`, `tok_decline`, `tok_timeout`).
- **No database, no Kafka, no secret, no OpenTelemetry.** It publishes and consumes no events and exposes no API of its own beyond `/healthz`, `/readyz` and the proxy to the BFF.
- **No call to any service except the BFF.** The bundle may reach only `/api/storefront`; the `no-network-url-in-bundle` job enforces it.

## Subdomain classification and neighbours

The warehouse-docs storefront section classifies the six storefront bounded contexts (Core: pricing; Supporting: product-discovery, shopping-cart, checkout; Generic: product-content, customer-payments) and states that the experience layer, `storefront-bff` and `storefront-web`, carries no domain model and is not a bounded context ([Subdomain classification](https://iqvo.github.io/warehouse-docs/storefront/strategic-design/subdomain-classification), [Edge and supporting components](https://iqvo.github.io/warehouse-docs/storefront/components)). Storefront Web is therefore classified **Experience**: it composes other contexts' capabilities into pages, through the BFF only. The same section records the component as built on `develop` and not deployed (checked 2026-10-27 against warehouse-infra); verify before relying on it.

## Main capabilities

| Capability | Routes | Notes |
|---|---|---|
| Browse and search | `/`, `/search` | department cards and "Popular in" rows, facets by department, price and availability; server-rendered |
| Product page | `/products/:id` | server-rendered detail plus a client-side delivery promise for the shopper's ZIP |
| Cart and delivery choice | `/cart` | quantity changes, destination, delivery quote, one option per shipment group |
| Account | `/account` | register, sign in, add a saved address |
| Checkout | `/checkout`, `/confirmation/:sessionId` | review, simulated payment (approve, decline, time out), in-doubt placement polling |
| Orders | `/orders`, `/orders/:id` | list, detail with the promise and a shipment tracker, cancellation |

## Where to read next

- Run it in five minutes: [Quickstart](./quickstart.md).
- How a request flows through server, loaders, cookie state and CSP: [Architecture](./architecture.md).
- Every variable: [Configuration](../operations/configuration.md); operating it: [Runbook](../operations/runbook.md) and [Troubleshooting](../operations/troubleshooting.md).
- Gates and tests: [Testing](../development/testing.md).
- The BFF routes it calls and what happens when they fail: [Integration](../ecosystem/integration.md).
- Why it is built this way: the [ADR index](/docs/adr).
