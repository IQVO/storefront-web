# CLAUDE.md — storefront-web

`storefront-web` is the shopper-facing web app of the retail-network
storefront domain in the `warehouse-systems` fleet (GitHub org `IQVO`). It is
a TypeScript app, not a Go service: React 19 + Vite, React Router framework
mode with SSR on a Node server (ADR 0001; `react-router` 8 in `package.json`),
vitest + Testing Library, Playwright and Lighthouse CI. Pages: home, search
and category, product, cart, checkout, confirmation, orders, order detail with
tracking, cancellation. It talks to exactly ONE backend, storefront-bff,
through the relative base `/api/storefront`. It stores no personal data,
never sees a card number and invents no ids. It ships one image (root
`Dockerfile`, the Node SSR server + static assets + the `/api/storefront`
proxy on port 3000) and the `charts/storefront-web` Helm chart.

## Hard rules (each one cost an incident or is sensor-checked)

1. **BFF only** (ADR 0002). `app/lib/api.ts` is the only place that knows a
   backend base (`API_BASE = "/api/storefront"`). No other `/api/<x>` or
   `/graphql/<x>` path, no absolute URL, no in-cluster host and no `BFF_URL`
   in anything the client bundle imports: the `no-network-url-in-bundle` CI
   job, its bad-fixture test `scripts/bundle-scan.test.ts` and an ESLint rule
   (`eslint.config.js`) enforce it. Server-only code lives in `*.server.ts`.
2. **The BFF contract is pinned, never edited.** `openapi/storefront-bff.yaml`
   is a copy of storefront-bff's OpenAPI spec on its develop branch
   (`contracts/pinned.json`; the `pinned-contracts` CI job runs
   `scripts/harness/pinned_contract_gate.py`). Refresh = copy the producer
   file, then `make gen-api`; `make check-api` fails when
   `app/lib/api-schema.ts` drifts from the snapshot. A contract change updates
   the stub BFF (`server/stub-handler.ts`, `server/stub-commerce.ts`) and its
   contract tests in the same change.
3. **No invented ids.** Ids come from BFF answers. The one random token is the
   per-click `Idempotency-Key` (`app/lib/action-id.ts`), stable across retries
   of a failed click and renewed after success.
4. **Destination is a 3-character postal prefix** (`postalPrefixOf` in
   `app/lib/destination.ts`), never the full ZIP; the cart destination body is
   exactly `{destinationPostalPrefix}`.
5. **Strict nonce-based CSP** (ADR 0003), built in `app/csp.ts` and set in
   `app/entry.server.tsx`: never `unsafe-inline`, `unsafe-eval`, inline
   `style=` or a third-party origin; all styling is in `app/app.css`. A new
   origin needs an ADR first. `e2e/security.spec.ts` checks it.
6. **Simulated payment only** (ADR 0004): the app never collects, shapes or
   sends a card number, expiry or CVC; the only posted value is a
   `tok_<scenario>` token. Never add a text input to
   `app/components/PaymentFields.tsx`. PII typed into forms goes to the BFF
   untouched and is never persisted or logged here.
7. **Shopper-state pages use `clientLoader`** (the `sf_state` cookie is
   HttpOnly and scoped to `/api/storefront`, so SSR cannot see it); catalogue
   pages use a server `loader`. Mutations are `clientAction`s returning
   `guarded(...)` results. A route module exports ONLY route exports (an extra
   export broke code splitting once). Register routes in `app/routes.ts`.
8. **Budgets only go down by fixing the page** (ADR 0005): Lighthouse LCP
   2.5 s, TBT 200 ms, CLS 0.1 in `lighthouserc.cjs`; coverage thresholds in
   `vitest.config.ts` only go up after measuring. Never raise a budget to get
   green.
9. **Promise windows render in the destination's time zone** (ADR 0006).
10. **Shopper sessions are the BFF's.** The browser keeps only the BFF-minted
    shopper id; calls that need a session (`GET /carts`, `/me`) are made only
    when `hasShopperSession()`.

## Commands

```bash
make check-fast    # eslint + typecheck: the agent Stop gate, run before saying "done"
make check         # lint typecheck test build check-api
make check-all     # lint typecheck coverage bundle-check e2e
make coverage      # vitest with the thresholds in vitest.config.ts
make bundle-check  # build + the no-network-url-in-bundle sensor
make e2e           # Playwright journeys against the stub BFF (E2E_BASE_URL=... for a real BFF)
make lighthouse    # build + Lighthouse CI budgets, mobile then desktop
make gen-api       # regenerate app/lib/api-schema.ts from the pinned BFF spec
make guide-lint    # these guides: skills load, references resolve, context budget
make harness-test  # unit tests of the agent hooks
```

Run locally (Node >= 22.18; `.nvmrc` and CI use 26): `npm ci`, then `BFF_URL=http://127.0.0.1:8080
npm run dev` (`:5180`), or `npm run build && npm run start:stub` to serve the
build with the in-memory stub BFF on `:3000` (no backend needed).

## Where things are written down (read before editing the matching area)

- `.claude/rules/bff-contract.md`: the BFF client, stub and contract.
  `.claude/rules/routes-and-loaders.md`: routes, loaders, actions.
  `.claude/rules/security-and-payment.md`: CSP, payment, PII.
  `.claude/rules/ci-and-budgets.md`: CI jobs, budgets, thresholds.
  `.claude/rules/fleet/readme-standard.md`: the fleet README standard.
- `docs/adr/`: decisions (index: `docs/adr/index.md`). Operating docs:
  `docs/docs/operations/` (configuration, runbook, troubleshooting),
  `docs/docs/development/testing.md`, `docs/docs/ecosystem/integration.md`.
- `HARNESS.md`: what each sensor runs and why. `INCIDENTS.md`: the fleet
  incident log. `README.md`: stack, env vars, CI job table.

The hook's post-edit feedback (gofmt/vet) has nothing to check in this repo;
the Stop gate (`make check-fast`) and CI are the sensors.

harness-template: v4
(hooks, guide-lint).

<!-- harness:scoped-rules:start (generated by tools/migrate_v3.py in warehouse-harness-template; do not hand-edit) -->
## Scoped rules and harness

Claude Code loads each rule below automatically when you touch the matching paths. OpenCode and Codex do NOT: read the rule BEFORE editing matching files.

| When touching | Read |
|---|---|
| `app/lib/**`, `server/**`, `scripts/bundle-scan.mjs` ... | `.claude/rules/bff-contract.md` |
| `.github/**`, `Makefile`, `lighthouserc.cjs` ... | `.claude/rules/ci-and-budgets.md` |
| `app/routes/**`, `app/routes.ts`, `app/root.tsx` ... | `.claude/rules/routes-and-loaders.md` |
| `app/csp.ts`, `app/entry.server.tsx`, `app/components/PaymentFields.tsx` ... | `.claude/rules/security-and-payment.md` |

Hooks (`scripts/harness/hook.py`, wired for Claude Code, Codex and OpenCode) block pushes to develop/main, `--no-verify`, bare `rm -rf`, and edits to generated files, and feed gofmt/vet findings back after each edit. Before saying "done" run `make check-fast`; the full gate is `make check-all`. `HARNESS_OFF=1` disables the hooks when debugging the harness itself.
<!-- harness:scoped-rules:end -->
