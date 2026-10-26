# 3. Strict Content-Security-Policy

Status: Accepted.

## Decision

Every HTML response carries (see `app/csp.ts`, set in `app/entry.server.tsx`):

```
default-src 'none'; script-src 'self' 'nonce-<per request>'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'; object-src 'none'
```

plus `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.

- A fresh nonce per request goes on React Router's inline hydration scripts (the framework context supplies it to
  `<Scripts>` and `<Links>`). No `unsafe-inline`, no `unsafe-eval`.
- No inline styles or style attributes: one fingerprinted stylesheet.
- `connect-src 'self'` means the bundle can only call this origin, i.e. `/api/storefront`, which backs the
  `no-network-url-in-bundle` sensor at runtime as well as at build time.
- Product images must be same-origin (or `data:`). **Assumption A1:** media URLs returned by the catalogue are
  served from the storefront origin by the gateway. If a media host is introduced it is added to `img-src`
  explicitly, never with a wildcard.
- The Playwright journey `strict CSP is sent and the pages run without a single violation` fails on any CSP
  console violation across the main pages.
