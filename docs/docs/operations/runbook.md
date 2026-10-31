# Storefront Web runbook

Storefront Web is the retail network's shopper-facing storefront: a React 19 server-side-rendered app (React Router 7 framework mode) served by a small Node server (`server/index.ts`). It renders home, search, product, cart, checkout and orders pages and has exactly **one** backend, the storefront-bff, reached server-side at `BFF_URL` (`README.md`, `app/lib/api.server.ts`). No database, no Kafka. This runbook covers the one deployed process and what to do when it misbehaves.

## Runtime shape (single web Deployment)

One `web` Deployment (`charts/storefront-web/templates/deployment.yaml`, 1 replica) runs `node server/index.ts` (the image's `CMD`, root `Dockerfile`): one process that, on `PORT` (default 3000):

- serves the SSR React Router build (`build/`),
- serves the static client assets,
- answers `GET /healthz` and `GET /readyz` itself, and
- proxies `/api/storefront` and `/api/storefront/*` to the BFF, so the browser only ever sees the relative base `/api/storefront`.

Graceful shutdown: `SIGTERM`/`SIGINT` close the listener and drain in-flight requests (`server/index.ts`); the chart allows `terminationGracePeriodSeconds: 30`.

`STOREFRONT_STUB` (the in-memory stub BFF behind `npm run start:stub`) exists for local CI and demos only. The chart refuses to render it (`tests/render_test.sh`): a deployed storefront-web always talks to a real storefront-bff.

## Dependencies

| Dependency | Used for | Source |
| --- | --- | --- |
| storefront-bff (REST) | every SSR loader call and the in-server `/api/storefront` proxy; the **only** backend | chart value `config.bffUrl` (in-cluster e.g. `http://storefront-bff.warehouse-systems.svc.cluster.local:8080`) |

There is no other dependency: no database, no message broker, no secret. `BFF_URL` is read on the Node server only (`app/lib/api.server.ts`); it never reaches the client bundle, which the `no-network-url-in-bundle` CI job proves.

The chart **refuses to render** without `config.bffUrl` — there is no silent default in a deployed runtime, so a release fails at `helm template` / `helm install` naming the value instead of serving 502s.

## Health and probes

The server answers both endpoints itself with `200 ok` as soon as the listener is up; **neither checks the BFF** (`server/index.ts`). Boot is fast, so the chart configures no startup probe:

- Liveness: `GET /healthz` on the `http` port (3000), `initialDelaySeconds: 5`, `periodSeconds: 10`.
- Readiness: `GET /readyz` on the `http` port (3000), `initialDelaySeconds: 3`, `periodSeconds: 5`.
- The image carries the same contract as a `HEALTHCHECK` against `/healthz` (root `Dockerfile`).

Consequence: a BFF outage never restarts or un-readies the pod — pages error (SSR loaders fail), probes stay green. Judge BFF health from the storefront-bff side, not from these probes.

## Configuration

Env vars `server/index.ts` and `app/lib/api.server.ts` read, rendered by the chart (ConfigMap + explicit `env`, pods roll on change via `checksum/config`):

| Env var | Chart value | Default | Notes |
| --- | --- | --- | --- |
| `BFF_URL` | `config.bffUrl` | **required** (render fails naming it) | server-side origin of storefront-bff; never in the client bundle |
| `PORT` | `config.port` | `3000` | must equal `service.targetPort`; the chart fails the render otherwise |
| `COOKIE_SECURE` | `config.cookieSecure` | `"false"` | `"true"` marks the `sf_state` cookie Secure (serve over HTTPS) |
| `STOREFRONT_STUB` | — | never rendered | in-memory stub BFF; the chart refuses it (`extraEnv` guard) |

`extraEnv` may add further variables but refuses `STOREFRONT_STUB` and any variable the chart renders itself (the same variable is never set twice).

## Routing (the web gateway owns exposure)

The chart renders no Ingress/HTTPRoute and stays `ClusterIP` 80 → `http` (3000). In a cluster the gateway routes:

- `/` (and everything not under `/api/storefront`) → this service,
- `/api/storefront` → the storefront-bff.

The in-server proxy to the BFF covers direct (non-gateway) access, e.g. port-forward:

```
kubectl -n warehouse-systems port-forward svc/storefront-web 3000:80
curl http://localhost:3000/healthz
```

## Failure modes

### Release will not render

- Symptom: `helm template`/`helm install` fails naming `config.bffUrl` (missing or empty), `extraEnv sets ...`, or `config.port`.
- Action: set `config.bffUrl` to the in-cluster BFF origin; remove the named variable from `extraEnv`; keep `config.port` equal to `service.targetPort`.

### Pod crash-loop

- Symptom: restarts climb on the pod-restart alert.
- Diagnosis: `kubectl -n warehouse-systems logs deploy/storefront-web --previous`. The server prints `storefront-web listening on :<port> (BFF <origin>)` at boot; absence means the process died before listen.
- Action: fix the named cause and roll again. The Deployment is hardened (non-root uid 1000, read-only root filesystem, drop ALL capabilities), so an image that needs to write outside `/tmp` (the one `emptyDir`) fails here.

### BFF unreachable

- Symptom: pages fail (SSR loaders error), proxy calls to `/api/storefront` fail; `/healthz` and `/readyz` stay 200, pods stay Ready.
- Diagnosis: from a pod, `wget -qO- http://<bff-origin>/... `; confirm `config.bffUrl` in the ConfigMap (`kubectl -n warehouse-systems get cm storefront-web -o yaml`). The readiness probe does not detect this — check storefront-bff health directly.
- Action: restore storefront-bff; nothing needs replaying (no queue, no state).

### Wrong backend behind the proxy

- Symptom: data from the wrong environment, or `BFF_URL` host unreachable only from pods.
- Diagnosis: `BFF_URL` is server-side only — read it from the ConfigMap or the Deployment env, never from the browser bundle (which holds only `/api/storefront`, enforced by `no-network-url-in-bundle`).
