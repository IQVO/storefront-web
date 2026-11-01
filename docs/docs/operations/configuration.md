---
id: configuration
title: Configuration
sidebar_label: Configuration
description: "Every environment variable the storefront-web SSR server reads, what the build reads (nothing), the Helm values that render them and the tooling knobs."
---

# Configuration

storefront-web is one Node process plus a build step, so configuration lives in four places, each read at a different time:

| Where | Read when | Controls |
|---|---|---|
| `process.env` in `server/index.ts` and `app/lib/api.server.ts` | when `node server/index.ts` starts (and `BFF_URL` again on every SSR loader call) | listen port, the BFF origin, the stub switch |
| `react-router.config.ts`, `vite.config.ts` | at `npm run build` / `npm run dev` | SSR on, the `~` alias, source maps off; no environment variables |
| `app/csp.ts` | per HTML response | the Content-Security-Policy and the other security headers (code, not configuration) |
| `charts/storefront-web/values.yaml` | at `helm install/upgrade` | renders the three server variables, the Service, probes, resources, security context |

## Build-time environment variables

There are **none**. The code reads no `VITE_*` key and no custom `import.meta.env` value (a grep over `app/`, `server/`, `scripts/` finds neither), so the same image runs against any BFF and the client bundle contains no endpoint except the relative base `/api/storefront`. The `no-network-url-in-bundle` job fails the build if a `BFF_URL`, an in-cluster host or another `/api/<x>` path ever reaches `build/client` (`scripts/bundle-scan.mjs`, see [Testing](/docs/development/testing)).

`NODE_ENV=production` is set by the `Dockerfile` (`ENV NODE_ENV=production PORT=3000`) and read implicitly by React and Vite; no application code branches on it.

## SSR server variables (`server/index.ts`, `app/lib/api.server.ts`)

There is a single binary, the Node server started by `npm start` (`node server/index.ts`, the image's `CMD`). The table lists every variable it reads.

| Variable | Default | Required | Read in | Meaning |
|---|---|---|---|---|
| `BFF_URL` | `http://127.0.0.1:8080` | **yes in a deployment** (the chart refuses to render without `config.bffUrl`); the code default only suits local development | `server/index.ts` line 11 (the `/api/storefront` proxy), `app/lib/api.server.ts` line 9 (`serverBase()` for every SSR loader) | Origin of the storefront-bff, the only backend. The loaders call `<BFF_URL>/api/storefront/...` (a trailing slash is trimmed); the proxy forwards `/api/storefront` and `/api/storefront/*` to it. With `STOREFRONT_STUB=1` the server overwrites it with its own loopback origin (`http://127.0.0.1:<PORT>`) at boot. Server only: never in the client bundle |
| `PORT` | `3000` | no | `server/index.ts` line 10 | Listen port, parsed with `Number(...)`. The chart requires it to equal `service.targetPort` |
| `STOREFRONT_STUB` | unset | no | `server/index.ts` line 12 | Exactly `1` serves the in-memory stub BFF (`server/stub*.ts`) under `/api/storefront` instead of proxying. For CI, Lighthouse and demos; the chart refuses to render it |

Notes:

- `BFF_URL` is read at runtime. Changing it needs a restart of the process (and, in Kubernetes, a pod roll, which the `checksum/config` annotation does when the ConfigMap changes).
- The `BFF_URL` default in the code is a loopback address, not a safe default for a deployment: a pod started without it would serve pages that fail with `ECONNREFUSED` loader errors. The Helm chart removes that foot-gun by failing the render.
- `COOKIE_SECURE` is **rendered by the chart** (ConfigMap and Deployment `env`, `config.cookieSecure`, default `"false"`) but **no code in this repository reads it**: a grep for `COOKIE_SECURE` over `app/`, `server/` and `scripts/` finds nothing. The `sf_state` cookie is set by the storefront-bff, not by this server, so its `Secure` attribute is decided there. See the discrepancy in [Troubleshooting](./troubleshooting.md#cookie-marked-secure-has-no-effect).

## Helm values (`charts/storefront-web/values.yaml`)

| Key | Default | Meaning |
|---|---|---|
| `config.bffUrl` | `""` (**required**; render fails naming it) | becomes `BFF_URL`. In-cluster: `http://storefront-bff.warehouse-systems.svc.cluster.local:8080` |
| `config.port` | `3000` | becomes `PORT`; must equal `service.targetPort` or the render fails |
| `config.cookieSecure` | `"false"` | becomes `COOKIE_SECURE` (not read by this repo's code, see above) |
| `extraEnv` | `[]` | extra env entries; the chart refuses `STOREFRONT_STUB` and any variable it renders itself |
| `replicaCount` | `1` | |
| `image.repository` / `image.tag` / `image.pullPolicy` | `warehouse/storefront-web` / `""` (= `v` + `appVersion`) / `IfNotPresent` | |
| `service.type` / `service.port` / `service.targetPort` | `ClusterIP` / `80` / `3000` | |
| `livenessProbe` | `GET /healthz` on `http`, delay 5 s, period 10 s | |
| `readinessProbe` | `GET /readyz` on `http`, delay 3 s, period 5 s | |
| `terminationGracePeriodSeconds` | `30` | the server drains on `SIGTERM` |
| `resources` | requests 100m / 128Mi, limits 500m / 256Mi | |
| `podSecurityContext` | `runAsNonRoot`, uid/gid/fsGroup `1000`, `RuntimeDefault` seccomp | the image's `node` user |
| `securityContext` | `readOnlyRootFilesystem: true`, `allowPrivilegeEscalation: false`, drop `ALL` | the Deployment mounts a 16 Mi `emptyDir` at `/tmp` |
| `serviceAccount.create`, `podAnnotations`, `podLabels`, `imagePullSecrets`, `nameOverride`, `fullnameOverride`, `nodeSelector`, `tolerations`, `affinity` | empty / `true` | standard |

The chart renders no Ingress or HTTPRoute; the web gateway routes `/` to this Service and `/api/storefront` to the BFF. See the [Runbook](./runbook.md).

## Fixed behaviour you cannot configure

These are constants in code, listed so nobody hunts for a knob:

| Behaviour | Value | Where |
|---|---|---|
| Proxy upstream timeout | 20 s, then `503 application/problem+json` (`/problems/upstream-unavailable`) | `server/proxy.ts` |
| SSR stream timeout | `streamTimeout` 5 s (abort at 6 s) | `app/entry.server.tsx` |
| Static assets cache | `/assets/*` `public, max-age=31536000, immutable`; everything else `public, max-age=300` | `server/static.ts` |
| Compression | Brotli (quality 5) then gzip for HTML and compressible static files over 1 KiB | `server/static.ts`, `app/entry.server.tsx` |
| CSP and security headers | nonce-based, `connect-src 'self'` | `app/csp.ts` |
| Dev server port | `5180` (`npm run dev`) | `package.json` |
| Node | `>=22.18` (`engines`), `.nvmrc` says `22`, image `node:22-slim` | `package.json`, `Dockerfile` |

## Tooling variables (not read by the server)

| Variable | Read in | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `playwright.config.ts` | set: run the journeys against that deployment (real BFF); unset: build, start the stub on port 3100 and test it |
| `E2E_LIVE`, `E2E_LIVE_QUERY` | `e2e/live-purchase.spec.ts` | `E2E_LIVE=1` un-skips the live purchase journey; `E2E_LIVE_QUERY` is the optional product search term it starts from |
| `CI` | `playwright.config.ts` | one retry, HTML reporter, never reuse a running server |
| `LHCI_FORM_FACTOR` | `lighthouserc.cjs` | `desktop` switches the Lighthouse preset (default is mobile); the stub is served on port 3200 |
| `CHROME_PATH` | Lighthouse CI itself | location of Chrome when it is not found automatically (the CI job sets `/usr/bin/google-chrome`) |
| `TZ` | `app/lib/dates.test.ts` | the unit test switches it to prove promise windows render in the destination's zone, not the process zone |
