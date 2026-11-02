# BFF OpenAPI snapshot

`storefront-bff.yaml` is a read-only snapshot of storefront-bff's
`apis/openapi.yaml` at `origin/develop` — the contract this SPA talks to.
`app/lib/api-schema.ts` is generated from it (openapi-typescript) and is
checked into the repo so typecheck needs no network access.

Refresh both when the BFF contract changes:

```sh
git -C ../storefront-bff show origin/develop:apis/openapi.yaml > openapi/storefront-bff.yaml
npm run gen:api
```

CI (`npm run check:api`) regenerates from the snapshot and fails on drift,
so a hand-edited generated file or a stale one never lands on develop.
