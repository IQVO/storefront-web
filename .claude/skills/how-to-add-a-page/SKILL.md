---
name: how-to-add-a-page
description: Add or change a storefront page in app/routes in this repo's order (BFF operation in lib/queries.ts, loader or clientLoader, clientAction, route in app/routes.ts, component, vitest, Playwright journey, stub BFF). Use when touching app/routes, app/routes.ts or adding a screen.
---

# Add a page

1. Does the BFF already expose the operation? Check the storefront-bff OpenAPI contract; add a one-liner to `app/lib/queries.ts` and a row to `app/lib/queries.test.ts`.
2. Catalogue data (no cookie needed): server `loader` with `serverOpts(request)`. Shopper state (cart, orders): `clientLoader` + `HydrateFallback` (see `.claude/rules/routes-and-loaders.md`).
3. Mutations: `clientAction` returning `guarded(...)`; hidden `actionId` from `useRenewedActionId`.
4. Register the route in `app/routes.ts`, run `npm run typecheck` for typegen.
5. Mirror any new BFF behaviour in `server/stub-commerce.ts`.
6. Tests: loader/action tests with `vi.mock("~/lib/queries.ts")`, a component test, and a journey step in `e2e/`.
7. Gate: `make check-all`.
