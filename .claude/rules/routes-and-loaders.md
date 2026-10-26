---
paths:
  - "app/routes/**"
  - "app/routes.ts"
  - "app/root.tsx"
  - "app/entry.*.tsx"
  - "react-router.config.ts"
---

# Routes, loaders and actions (ADR 0001, ADR 0002)

- Catalogue pages (`home`, `search`, `product`) use a server `loader` that calls `lib/queries.ts` with
  `serverOpts(request)` so the browser's cookie is forwarded and `BFF_URL` stays server-side.
- Shopper-state pages (`cart`, `account`, `checkout`, `confirmation`, `orders`, `order-detail`) use `clientLoader`
  + `HydrateFallback`: the `sf_state` cookie is HttpOnly and scoped to `/api/storefront`, so page requests never
  carry it and SSR cannot see the cart or shopper.
- Mutations are `clientAction`s that return `guarded(...)` results (`{ok}` / `{ok:false,error}`), never throw
  an `ApiError` to the error boundary. Redirects are returned, not thrown, from actions.
- A route module exports ONLY route exports (`loader`, `clientLoader`, `action`, `meta`, `links`, `headers`,
  `default`, `HydrateFallback`, `ErrorBoundary`). Shared helpers go to `app/lib` or `app/components`; an extra
  export from a route module broke code splitting and the account page.
- Register a route in `app/routes.ts`; run `npm run typecheck` (typegen) before using `./+types/<route>`.
- Test loaders and actions in `app/routes/*.test.ts(x)` with `vi.mock("~/lib/queries.ts")`.
