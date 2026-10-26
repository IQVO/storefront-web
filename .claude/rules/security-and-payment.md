---
paths:
  - "app/csp.ts"
  - "app/entry.server.tsx"
  - "app/components/PaymentFields.tsx"
  - "app/lib/payment.ts"
  - "app/routes/checkout.tsx"
  - "server/static.ts"
---

# CSP and simulated payment (ADR 0003, ADR 0004)

- CSP is built in `app/csp.ts` and set in `entry.server.tsx` with a per-request nonce. Never add `unsafe-inline`,
  `unsafe-eval`, inline `style=` attributes or third-party origins; a new origin needs an ADR line first.
- The app NEVER collects, shapes or sends a card number, expiry or CVC. Payment fields are a sandbox; the only
  value posted is `tok_<scenario>` from `tokenFor`. `isScenario` guards the action. Do not add a text input to
  `PaymentFields`; `components.test.tsx` and the Playwright journey fail if you do.
- PII (names, addresses, e-mail) is typed into forms and posted to the BFF untouched. Do not persist or log it
  in the browser or server; ids and references only.
