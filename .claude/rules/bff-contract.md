---
paths:
  - "app/lib/**"
  - "server/**"
  - "scripts/bundle-scan.mjs"
  - "scripts/check-bundle.mjs"
---

# The BFF contract (ADR 0002)

- `app/lib/api.ts` is the ONLY place that knows a backend base: `API_BASE = "/api/storefront"`. No other
  `/api/<x>` or `/graphql/<x>` path, no absolute URL, no in-cluster host in anything the client bundle imports
  (`no-network-url-in-bundle` and an ESLint rule enforce it). Server-only code lives in `*.server.ts`.
- Operations are one-liners in `app/lib/queries.ts`; the source of truth for paths, verbs and problem types is
  the storefront-bff OpenAPI contract. Path segments go through `seg()`; query strings through `query()`.
- The web app never invents ids. Ids come from BFF answers; `X-Action-Id` (`lib/action-id.ts`) is the one
  random per-click token, stable across retries of a failed click and renewed after success.
- `server/stub-handler.ts` + `stub-commerce.ts` mirror the BFF for CI. When the BFF contract changes, update the
  stub AND the contract tests in `app/lib/queries.test.ts` in the same change.
- Errors are RFC 9457 problems (`ApiError.slug`); shopper-facing text lives in `components/ProblemAlert.tsx`.
