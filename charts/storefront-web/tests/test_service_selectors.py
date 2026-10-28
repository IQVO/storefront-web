#!/usr/bin/env python3
"""Assert this chart's Service selector isolates its one component.

Why this exists (fleet-wide): `app.kubernetes.io/name` + `instance` are identical
on every pod a release creates. A Service that selects on those two alone selects
ALL of them, which turns into a wrong answer the day a second component is added.
The web Deployment carries `app.kubernetes.io/component: web` in
selector.matchLabels and its pod labels, and the Service selects on it, so the
Service selects EXACTLY ONE Deployment. This test fails if that ever stops
being true.

storefront-web has exactly one component: the Node SSR server (React Router 7
framework mode, port 3000), whose only backend is the storefront-bff at
config.bffUrl (BFF_URL). No database, no Kafka, no route: the web gateway owns
exposure.

Run: python3 charts/storefront-web/tests/test_service_selectors.py
Needs: helm, PyYAML.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

CHART_DIR = Path(__file__).resolve().parents[1]
RELEASE = "storefront-web"

# Dummy values: the chart refuses to render without config.bffUrl. It is never
# dialled.
BASE = ["--set", "config.bffUrl=http://storefront-bff.example.invalid"]
ENABLE_EVERYTHING = BASE + [
    "--set", "config.cookieSecure=true",
    "--set", "replicaCount=2",
    "--set", "extraEnv[0].name=EXTRA_EXAMPLE",
    "--set", "extraEnv[0].value=1",
]

# Every variable the server reads, with a dedicated chart value. STOREFRONT_STUB
# is deliberately absent: the chart refuses it (in-memory stub, local CI only).
WEB_ENV = ("BFF_URL", "PORT", "COOKIE_SECURE")


def helm_template(extra_args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["helm", "template", RELEASE, str(CHART_DIR), *extra_args],
        capture_output=True, text=True,
    )


def render(extra_args: list[str]) -> list[dict]:
    result = helm_template(extra_args)
    if result.returncode != 0:
        raise SystemExit(f"FAIL: helm template {' '.join(extra_args)}:\n{result.stderr}")
    try:
        import yaml  # type: ignore
    except ModuleNotFoundError:  # pragma: no cover - environment guard
        print("SKIP: PyYAML not available; cannot assert selectors", file=sys.stderr)
        raise SystemExit(0)
    return [d for d in yaml.safe_load_all(result.stdout) if d]


def selector_of(doc: dict) -> dict:
    return doc.get("spec", {}).get("selector") or {}


def pod_labels_of(doc: dict) -> dict:
    return doc.get("spec", {}).get("template", {}).get("metadata", {}).get("labels") or {}


def matches(selector: dict, labels: dict) -> bool:
    return bool(selector) and all(labels.get(k) == v for k, v in selector.items())


def env_of(dep: dict) -> list[dict]:
    return dep["spec"]["template"]["spec"]["containers"][0].get("env", [])


def env_names(dep: dict) -> list[str]:
    return [e["name"] for e in env_of(dep)]


def env_value(dep: dict, name: str) -> str | None:
    return next((e.get("value") for e in env_of(dep) if e["name"] == name), None)


def env_from_configmaps(dep: dict) -> list[str]:
    env_from = dep["spec"]["template"]["spec"]["containers"][0].get("envFrom", [])
    return [e["configMapRef"]["name"] for e in env_from if "configMapRef" in e]


def check_components(docs: list[dict], failures: list[str]) -> None:
    services = {d["metadata"]["name"]: d for d in docs if d.get("kind") == "Service"}
    deployments = {d["metadata"]["name"]: d for d in docs if d.get("kind") == "Deployment"}

    if set(deployments) != {RELEASE}:
        failures.append(f"the chart has exactly one Deployment (the web), rendered: {sorted(deployments)}")
    if set(services) != {RELEASE}:
        failures.append(f"the chart has exactly one Service (the web), rendered: {sorted(services)}")
    if RELEASE not in services:
        failures.append("the web Service was not rendered")
    elif selector_of(services[RELEASE]).get("app.kubernetes.io/component") != "web":
        failures.append("the web Service selector must pin component=web")

    # The Deployment's own selector must pin the component too, and be
    # satisfied by its pod labels.
    for name, dep in deployments.items():
        match_labels = dep["spec"]["selector"].get("matchLabels") or {}
        if "app.kubernetes.io/component" not in match_labels:
            failures.append(f"Deployment {name} selector.matchLabels lacks app.kubernetes.io/component")
        if not matches(match_labels, pod_labels_of(dep)):
            failures.append(f"Deployment {name} pod labels do not satisfy its own selector")

    # The real invariant: the Service selects exactly one Deployment.
    for svc_name, svc in services.items():
        sel = selector_of(svc)
        hit = [d for d, dep in deployments.items() if matches(sel, pod_labels_of(dep))]
        if len(hit) != 1:
            failures.append(f"Service {svc_name} selects {len(hit)} Deployments {sorted(hit)}; expected exactly 1")

    # No optional route or autoscaler exists in this chart.
    stray = [d["kind"] for d in docs if d.get("kind") in {"HorizontalPodAutoscaler", "Ingress", "HTTPRoute"}]
    if stray:
        failures.append(f"the chart must not render routes or autoscalers: {stray}")

    web = deployments.get(RELEASE)
    if web is None:
        failures.append("the web Deployment was not rendered")
        return

    # The ConfigMap the web mounts by envFrom is the one this chart renders.
    configmaps = {d["metadata"]["name"] for d in docs if d.get("kind") == "ConfigMap"}
    mounted = env_from_configmaps(web)
    if mounted != [RELEASE]:
        failures.append(f"the web Deployment must envFrom-mount the chart ConfigMap {RELEASE}, got {mounted}")
    elif RELEASE not in configmaps:
        failures.append(f"the ConfigMap {RELEASE} the web Deployment mounts was not rendered")

    web_env = env_names(web)
    for want in (*WEB_ENV, "EXTRA_EXAMPLE"):
        if want not in web_env:
            failures.append(f"the web Deployment does not render {want} from its dedicated value")
    if "STOREFRONT_STUB" in web_env:
        failures.append("the web Deployment must never render STOREFRONT_STUB (the in-memory stub BFF)")
    duplicates = sorted({n for n in web_env if web_env.count(n) > 1})
    if duplicates:
        failures.append(f"the web Deployment renders env vars twice: {duplicates}")

    # The env contract values.
    if env_value(web, "BFF_URL") != "http://storefront-bff.example.invalid":
        failures.append(f"BFF_URL renders {env_value(web, 'BFF_URL')!r}, want the config.bffUrl value")
    if env_value(web, "PORT") != "3000":
        failures.append(f"PORT renders {env_value(web, 'PORT')!r}, want '3000' (config.port == service.targetPort)")
    if env_value(web, "COOKIE_SECURE") != "true":
        failures.append(f"COOKIE_SECURE renders {env_value(web, 'COOKIE_SECURE')!r}, want 'true' from config.cookieSecure")

    # Service wiring: ClusterIP 80 -> the container's http port (3000).
    svc = services.get(RELEASE)
    if svc is not None:
        spec = svc.get("spec", {})
        if spec.get("type") != "ClusterIP":
            failures.append(f"the web Service must stay ClusterIP, got {spec.get('type')}")
        ports = spec.get("ports", [])
        if not ports or ports[0].get("port") != 80 or ports[0].get("targetPort") != "http":
            failures.append(f"the web Service must map 80 -> http (3000), got {ports}")
        probes = web["spec"]["template"]["spec"]["containers"][0]
        live = probes.get("livenessProbe", {}).get("httpGet", {})
        ready = probes.get("readinessProbe", {}).get("httpGet", {})
        if live.get("path") != "/healthz" or live.get("port") != "http":
            failures.append(f"livenessProbe must be GET /healthz on the http port, got {live}")
        if ready.get("path") != "/readyz" or ready.get("port") != "http":
            failures.append(f"readinessProbe must be GET /readyz on the http port, got {ready}")


def check_refusals(failures: list[str]) -> None:
    cases: list[tuple[str, list[str], str]] = [
        ("without config.bffUrl", [], "config.bffUrl"),
        ("an empty config.bffUrl", ["--set", "config.bffUrl="], "config.bffUrl"),
        ("STOREFRONT_STUB through extraEnv",
         BASE + ["--set", "extraEnv[0].name=STOREFRONT_STUB", "--set", "extraEnv[0].value=1"], "STOREFRONT_STUB"),
        ("a chart-owned variable through extraEnv",
         BASE + ["--set", "extraEnv[0].name=BFF_URL", "--set", "extraEnv[0].value=x"], "extraEnv sets BFF_URL"),
        ("a chart-owned PORT through extraEnv",
         BASE + ["--set", "extraEnv[0].name=PORT", "--set", "extraEnv[0].value=8080"], "extraEnv sets PORT"),
        ("a port off the container port", BASE + ["--set", "config.port=9090"], "config.port"),
    ]
    for label, args, needle in cases:
        result = helm_template(args)
        if result.returncode == 0 or needle not in result.stderr:
            failures.append(f"chart rendered (or failed for another reason) {label}")


def main() -> int:
    failures: list[str] = []

    check_components(render(ENABLE_EVERYTHING), failures)

    # Defaults: one replica, COOKIE_SECURE off, no extra env.
    defaults = render(BASE)
    dep = next(d for d in defaults if d.get("kind") == "Deployment")
    if dep["spec"].get("replicas") != 1:
        failures.append(f"the web Deployment must default to 1 replica, got {dep['spec'].get('replicas')}")
    names = env_names(dep)
    if "EXTRA_EXAMPLE" in names:
        failures.append("extraEnv must be empty by default")
    if env_value(dep, "COOKIE_SECURE") != "false":
        failures.append(f"COOKIE_SECURE must default to 'false', got {env_value(dep, 'COOKIE_SECURE')!r}")

    check_refusals(failures)

    if failures:
        for f in failures:
            print(f"FAIL: {f}")
        return 1

    print("PASS: the web Service selects exactly one Deployment (component=web); the chart ConfigMap is envFrom-mounted; "
          "every server env var has a dedicated value and STOREFRONT_STUB is refused; the Service maps 80 -> http (3000); "
          "no route or autoscaler renders; the chart refuses to render without config.bffUrl, with a chart-owned variable "
          "in extraEnv, or with a port off the container port")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
