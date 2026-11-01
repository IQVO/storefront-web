#!/usr/bin/env bash
# Chart render assertions for storefront-web: the storefront-bff is the only
# backend, so config.bffUrl has no silent default, STOREFRONT_STUB (the
# in-memory stub BFF) is never rendered, the pod is hardened, and the env
# server/index.ts reads is the env the chart renders.
# Run: bash charts/storefront-web/tests/render_test.sh   (needs helm)
set -euo pipefail

chart_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_dir="$(cd "$chart_dir/../.." && pwd)"
release=storefront-web
# Dummy values: the chart refuses to render without config.bffUrl. It is never
# dialled.
base=(--set config.bffUrl=http://storefront-bff.example.invalid)
# Every optional value set.
everything=(--set config.cookieSecure=true --set replicaCount=2)

fail() { echo "FAIL: $*" >&2; exit 1; }
command -v helm >/dev/null || fail "helm is not installed"

configmap="$(helm template "$release" "$chart_dir" "${base[@]}" --show-only templates/configmap.yaml)"
web_deployment="$(helm template "$release" "$chart_dir" "${base[@]}" --show-only templates/deployment.yaml)"
configmap_name="$(awk '/^  name:/ {print $2; exit}' <<<"$configmap")"
[[ -n "$configmap_name" ]] || fail "could not read the ConfigMap name"

# Every non-secret config value is rendered into the chart ConfigMap, and the
# web Deployment -- the only workload -- must mount it with envFrom, or a value
# that is only in the ConfigMap silently does nothing.
grep -A3 'envFrom:' <<<"$web_deployment" | grep -q 'configMapRef:' \
  || fail "web Deployment does not mount the ConfigMap via envFrom"
grep -A3 'envFrom:' <<<"$web_deployment" | grep -q "name: $configmap_name" \
  || fail "web Deployment envFrom does not reference ConfigMap $configmap_name"
grep -q 'checksum/config:' <<<"$web_deployment" || fail "the pods must roll when the ConfigMap changes (checksum/config)"

# A tuned config.* value reaches the ConfigMap the web mounts and the container env.
tuned="$(helm template "$release" "$chart_dir" "${base[@]}" --set config.cookieSecure=true --show-only templates/configmap.yaml)"
grep -q 'COOKIE_SECURE: "true"' <<<"$tuned" || fail "config.cookieSecure is not rendered into the ConfigMap"

# The env contract (README, server/index.ts, app/lib/api.server.ts): every
# variable the server reads is rendered, except STOREFRONT_STUB, which the
# chart refuses (it switches to an in-memory stub BFF -- local CI/demos only).
server_env() {
  grep -rohE 'process\.env\[?"?[A-Z][A-Z0-9_]*"?' "$repo_dir"/server/*.ts "$repo_dir"/app/lib/*.server.ts \
    | grep -oE '[A-Z][A-Z0-9_]+' | sort -u
}
# Word splitting is safe: the names are [A-Z0-9_] only (bash 3.2 has no mapfile).
# shellcheck disable=SC2207
web_vars=($(server_env))
(( ${#web_vars[@]} >= 3 )) || fail "found only ${#web_vars[@]} env names in server/; the scan is looking in the wrong place"
full_deployment="$(helm template "$release" "$chart_dir" "${base[@]}" "${everything[@]}" --show-only templates/deployment.yaml)"
for var in "${web_vars[@]}"; do
  if [[ "$var" == "STOREFRONT_STUB" ]]; then
    if grep -q 'name: STOREFRONT_STUB$' <<<"$full_deployment"; then
      fail "the chart must never render STOREFRONT_STUB (the in-memory stub BFF)"
    fi
    continue
  fi
  grep -q "name: $var\$" <<<"$full_deployment" || fail "the web Deployment does not render $var, which the server reads"
done

# Every key the ConfigMap renders is a variable the server reads (no dead keys),
# except COOKIE_SECURE: part of the chart's env contract (the sf_state cookie's
# Secure flag over HTTPS), rendered though no server code reads it yet.
web_known=" ${web_vars[*]} COOKIE_SECURE "
while read -r key; do
  [[ "$web_known" == *" $key "* ]] || fail "ConfigMap key $key is read by no server code"
done < <(awk '/^data:/ {d=1; next} d && /^  [A-Z]/ {sub(/:.*/, ""); sub(/^  /, ""); print}' <<<"$configmap")

# The mandatory configuration is rendered from values.
env_value() { # env_value <rendered> <NAME>
  grep -A1 "name: $2\$" <<<"$1" | grep -m1 'value:' | sed -E 's/.*value: "?//; s/"$//'
}
[[ "$(env_value "$web_deployment" BFF_URL)" == "http://storefront-bff.example.invalid" ]] \
  || fail "BFF_URL is not rendered from config.bffUrl"
[[ "$(env_value "$web_deployment" PORT)" == "3000" ]] || fail "PORT is not rendered from config.port"
[[ "$(env_value "$web_deployment" COOKIE_SECURE)" == "false" ]] || fail "COOKIE_SECURE must default to false"
grep -q '^  BFF_URL: "http://storefront-bff.example.invalid"' <<<"$configmap" || fail "the ConfigMap does not carry BFF_URL"
grep -q '^  PORT: "3000"' <<<"$configmap" || fail "the ConfigMap does not carry PORT"
[[ "$(env_value "$full_deployment" COOKIE_SECURE)" == "true" ]] || fail "COOKIE_SECURE must follow config.cookieSecure"

# Pod hardening, probes and the image tag.
for want in 'runAsNonRoot: true' 'readOnlyRootFilesystem: true' 'allowPrivilegeEscalation: false' 'type: RuntimeDefault' 'path: /healthz' 'path: /readyz'; do
  grep -q -- "$want" <<<"$web_deployment" || fail "the web Deployment lacks '$want'"
done
grep -A2 'drop:' <<<"$web_deployment" | grep -q 'ALL' || fail "the web container must drop ALL capabilities"
grep -A3 'livenessProbe:' <<<"$web_deployment" | grep -q '/healthz' || fail "livenessProbe must be /healthz"
grep -A3 'readinessProbe:' <<<"$web_deployment" | grep -q '/readyz' || fail "readinessProbe must be /readyz"
grep -q 'containerPort: 3000' <<<"$web_deployment" || fail "the container port must be service.targetPort (3000)"
grep -q 'image: "warehouse/storefront-web:v0.1.0"' <<<"$web_deployment" \
  || fail "an empty image.tag must resolve to v<appVersion>, the tag the release job publishes"
tagged="$(helm template "$release" "$chart_dir" "${base[@]}" --set image.tag=v9.9.9 --show-only templates/deployment.yaml)"
grep -q 'image: "warehouse/storefront-web:v9.9.9"' <<<"$tagged" || fail "image.tag must override the default"

# Only the web component exists: one Deployment, one Service, no route and no
# autoscaler templates at all (exposure is the web gateway's job).
render_all="$(helm template "$release" "$chart_dir" "${base[@]}" "${everything[@]}")"
[[ "$(grep -c '^kind: Deployment' <<<"$render_all")" == 1 ]] || fail "exactly one Deployment (the web) must render"
[[ "$(grep -c '^kind: Service$' <<<"$render_all")" == 1 ]] || fail "exactly one Service (the web) must render"
for stray in HorizontalPodAutoscaler Ingress HTTPRoute; do
  if grep -q "^kind: $stray" <<<"$render_all"; then fail "the chart must not render a $stray"; fi
done
if grep -qiE 'in-memory|stub BFF' <<<"$render_all"; then
  fail "the render must not carry stub / in-memory wording"
fi

# --- refusals: the mandatory values name themselves ---------------------------------
expect_refusal() { # expect_refusal <why> <needle> <helm args...>
  local why="$1" needle="$2" err; shift 2
  if err="$(helm template "$release" "$chart_dir" "$@" 2>&1)"; then
    fail "the chart must refuse to render: $why"
  fi
  grep -qF -- "$needle" <<<"$err" || fail "the refusal for '$why' does not name '$needle':
$err"
}
expect_refusal "no config.bffUrl" "config.bffUrl"
expect_refusal "an empty config.bffUrl" "config.bffUrl" --set config.bffUrl=
expect_refusal "STOREFRONT_STUB through extraEnv" "STOREFRONT_STUB" "${base[@]}" \
  --set 'extraEnv[0].name=STOREFRONT_STUB' --set 'extraEnv[0].value=1'
for owned in BFF_URL PORT COOKIE_SECURE; do
  expect_refusal "the chart-owned $owned through extraEnv" "extraEnv sets $owned" "${base[@]}" \
    --set "extraEnv[0].name=$owned" --set 'extraEnv[0].value=x'
done
expect_refusal "a port off the container port" "config.port" "${base[@]}" --set config.port=9090

echo "PASS: storefront-web chart render assertions"
