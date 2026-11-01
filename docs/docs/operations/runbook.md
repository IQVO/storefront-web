---
id: runbook
title: Runbook
sidebar_label: Runbook
description: "Operating the storefront-web Deployment: runtime shape, dependencies, probes, release and rollback, routine procedures and failure modes."
---

# Storefront Web runbook

Storefront Web is the retail network's shopper-facing storefront: a React 19 server-side-rendered app (React Router 7 framework mode) served by a small Node server (`server/index.ts`). It renders home, search, product, cart, checkout, confirmation, account and orders pages and has exactly **one** backend, the storefront-bff, reached server-side at `BFF_URL` (`app/lib/api.server.ts`). No database, no Kafka, no secret. This runbook covers the one deployed process and what to do when it misbehaves. For the variables see [Configuration](./configuration.md); for symptoms see [Troubleshooting](./troubleshooting.md).

## Runtime shape (single web Deployment)

One `web` Deployment (`charts/storefront-web/templates/deployment.yaml`, 1 replica by default) runs `node server/index.ts` (the image's `CMD`, root `Dockerfile`): one process that, on `PORT` (default 3000):

- answers `GET /healthz` and `GET /readyz` itself (any path equal to either, any method),
- proxies `/api/storefront` and `/api/storefront/*` to the BFF (`server/proxy.ts`), so the browser only ever sees the relative base `/api/storefront`,
- serves the static client assets from `build/client` (GET and HEAD only; fingerprinted `/assets/*` are `immutable`, the rest `max-age=300`, Brotli or gzip above 1 KiB),
- hands everything else to the React Router SSR handler, which streams HTML with a per-request CSP nonce (`app/entry.server.tsx`, `app/csp.ts`).

The process keeps **no state**: carts, orders and the `sf_state` cookie belong to the BFF and its upstream services, so any replica can serve any request and a restart loses nothing. (The only in-memory state anywhere is the stub BFF, which is never deployed.)

Graceful shutdown: `SIGTERM`/`SIGINT` close the listener and exit once connections drain (`server/index.ts`); the chart allows `terminationGracePeriodSeconds: 30`.

`STOREFRONT_STUB` (the in-memory stub BFF behind `npm run start:stub`) exists for local CI and demos only. The chart refuses to render it (`tests/render_test.sh`, `tests/test_service_selectors.py`): a deployed storefront-web always talks to a real storefront-bff.

## Dependencies

| Dependency | Used for | Source |
|---|---|---|
| storefront-bff (REST) | every SSR loader call and the in-server `/api/storefront` proxy; the **only** backend | chart value `config.bffUrl` (in-cluster e.g. `http://storefront-bff.warehouse-systems.svc.cluster.local:8080`) |
| Web gateway | exposure: `/` to this Service, `/api/storefront` to the BFF | outside this chart |

There is no other dependency. `BFF_URL` is read on the Node server only (`app/lib/api.server.ts`); it never reaches the client bundle, which the `no-network-url-in-bundle` CI job proves.

The chart **refuses to render** without `config.bffUrl` (and when `config.port` differs from `service.targetPort`, or `extraEnv` sets `STOREFRONT_STUB`/`BFF_URL`/`PORT`/`COOKIE_SECURE`), so a release fails at `helm template` / `helm install` naming the value instead of serving 502s (`charts/storefront-web/templates/_helpers.tpl`).

## Health and probes

The server answers both endpoints itself with `200 ok` as soon as the listener is up; **neither checks the BFF** (`server/index.ts`). Boot is fast (it imports the build and listens), so the chart configures no startup probe:

- Liveness: `GET /healthz` on the `http` port (3000), `initialDelaySeconds: 5`, `periodSeconds: 10`.
- Readiness: `GET /readyz` on the `http` port (3000), `initialDelaySeconds: 3`, `periodSeconds: 5`.
- The image carries the same contract as a `HEALTHCHECK` against `/healthz` (root `Dockerfile`).

Consequence: a BFF outage never restarts or un-readies the pod. Pages error (SSR loaders fail) while probes stay green. Judge BFF health from the storefront-bff side, not from these probes.

## Configuration

Rendered by the chart (ConfigMap via `envFrom` plus explicit `env`; pods roll on change through the `checksum/config` annotation):

| Env var | Chart value | Default | Notes |
|---|---|---|---|
| `BFF_URL` | `config.bffUrl` | **required** (render fails naming it) | server-side origin of storefront-bff; never in the client bundle |
| `PORT` | `config.port` | `3000` | must equal `service.targetPort`; the chart fails the render otherwise |
| `COOKIE_SECURE` | `config.cookieSecure` | `"false"` | rendered by the chart but not read by any code in this repository (see [Configuration](./configuration.md)) |
| `STOREFRONT_STUB` | none | never rendered | in-memory stub BFF; the chart refuses it (`extraEnv` guard) |

`extraEnv` may add further variables but refuses `STOREFRONT_STUB` and any variable the chart renders itself (the same variable is never set twice).

## Routing (the web gateway owns exposure)

The chart renders no Ingress/HTTPRoute and stays `ClusterIP` 80 to `http` (3000). In a cluster the gateway routes:

- `/` (and everything not under `/api/storefront`) to this service,
- `/api/storefront` to the storefront-bff.

The in-server proxy to the BFF covers direct (non-gateway) access, for example a port-forward:

```bash
kubectl -n warehouse-systems port-forward svc/storefront-web 3000:80
curl http://localhost:3000/healthz
```

## Routine procedures

### Release

1. CI on the PR must be green: `web`, `no-network-url-in-bundle`, `lighthouse-budgets`, `e2e`, `guide-lint`, `docker-build` (the required checks), plus `helm-lint` and `chart-tests` for chart changes. See [Testing](../development/testing.md).
2. The image is built from the root `Dockerfile` (`warehouse/storefront-web`); an empty `image.tag` means `v` + the chart's `appVersion`.
3. `helm upgrade --install storefront-web charts/storefront-web --set config.bffUrl=<bff origin>` (plus your environment values). Changing `config.*` changes the ConfigMap checksum and rolls the pods.
4. Verify: `kubectl -n warehouse-systems rollout status deploy/storefront-web`, then load `/`, `/search` and a product page through the gateway.

### Roll back

`helm rollback storefront-web <revision>` (or redeploy the previous `image.tag`). Nothing needs migrating or replaying: there is no database and no queue.

### Change the BFF origin

Set `config.bffUrl` and upgrade the release; the pods roll. Never put the origin in the client: the `no-network-url-in-bundle` sensor would fail the build.

### Scale

Raise `replicaCount`. Replicas are interchangeable (no sticky sessions are needed because the cookie belongs to the BFF and travels with each request). Resource defaults are 100m/128Mi requests and 500m/256Mi limits.

### Read the logs

```bash
kubectl -n warehouse-systems logs deploy/storefront-web
```

The server logs `storefront-web listening on :<port> (BFF <origin>)` at boot, and `console.error` of a render error message after the shell was sent (`app/entry.server.tsx`). There is no access log and no metrics endpoint; rely on the gateway's logs for traffic.

## Failure modes

### Release will not render

- Symptom: `helm template`/`helm install` fails naming `config.bffUrl` (missing or empty), `extraEnv sets ...`, or `config.port`.
- Action: set `config.bffUrl` to the in-cluster BFF origin; remove the named variable from `extraEnv`; keep `config.port` equal to `service.targetPort`.

### Pod crash-loop

- Symptom: restarts climb on the pod-restart alert.
- Diagnosis: `kubectl -n warehouse-systems logs deploy/storefront-web --previous`. The listening line at boot is missing when the process died before `listen` (for example the `build/` directory is absent from the image, so the dynamic import of `build/server/index.js` throws).
- Action: fix the named cause and roll again. The Deployment is hardened (non-root uid 1000, read-only root filesystem, drop ALL capabilities), so an image that needs to write outside `/tmp` (the one `emptyDir`) fails here.

### BFF unreachable

- Symptom: pages fail (SSR loaders error, the root `ErrorBoundary` shows "Something went wrong" or the problem title), proxy calls to `/api/storefront` answer `503 application/problem+json` with type `/problems/upstream-unavailable`; `/healthz` and `/readyz` stay 200, pods stay Ready.
- Diagnosis: from a pod, `kubectl -n warehouse-systems exec deploy/storefront-web -- node -e "fetch(process.env.BFF_URL + '/api/storefront/categories').then(r=>console.log(r.status))"` (the image has Node but no `wget`/`curl`); confirm `config.bffUrl` in the ConfigMap (`kubectl -n warehouse-systems get cm storefront-web -o yaml`). The readiness probe does not detect this, so check storefront-bff health directly.
- Action: restore storefront-bff; nothing needs replaying (no queue, no state).

### Wrong backend behind the proxy

- Symptom: data from the wrong environment, or `BFF_URL` host unreachable only from pods.
- Diagnosis: `BFF_URL` is server-side only. Read it from the ConfigMap or the Deployment env, never from the browser bundle (which holds only `/api/storefront`, enforced by `no-network-url-in-bundle`).
- Action: correct `config.bffUrl` and upgrade.

### Slow pages

- Symptom: slow first byte on dynamic pages.
- Diagnosis: the home loader fans out one `GET /products` per busy department after `GET /categories` (`app/routes/home.tsx`), and each SSR page waits for its loader, so BFF latency is page latency. The proxy gives up after 20 s; SSR streaming aborts at 6 s (`app/entry.server.tsx`).
- Action: investigate storefront-bff and its upstream services; scaling this Deployment does not help when the BFF is the bottleneck.
