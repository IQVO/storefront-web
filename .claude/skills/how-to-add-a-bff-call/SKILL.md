---
name: how-to-add-a-bff-call
description: Call a new storefront-bff route from the web app without leaking another backend URL into the client bundle. Use when touching app/lib/api.ts, app/lib/queries.ts or server/stub-handler.ts.
---

# Add a BFF call

Only `/api/storefront` exists for the browser. Add the function to `app/lib/queries.ts` using `call`, `seg` and `query` from `app/lib/api.ts`; server-side use passes `serverOpts(request)`. Update the stub in `server/` and the contract table in `app/lib/queries.test.ts`; run `npm run build && npm run check:bundle`.
