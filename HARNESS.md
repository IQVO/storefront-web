# Harness (harness-template: v4)

storefront-web carries the agent-runtime harness of `warehouse-harness-template`, applied with
`tools/migrate_v3.py --profile platform` then `tools/migrate_v4.py` (precedent: warehouse-console). It is a
TypeScript app: the Go sensors of the service template (golangci-lint, arch-go, gremlins, godog, govulncheck,
Spectral) do not apply here.

| Component | Where |
|---|---|
| Guides | `CLAUDE.md` (= `AGENTS.md`), `.claude/rules/*.md` (path-scoped), `.claude/skills/how-to-*`, `docs/adr`, `.claude/memory/MEMORY.md` |
| Review subagents | `.claude/agents/{code-review,architecture-review,domain-review}.md` |
| Agent hooks | `scripts/harness/hook.py` via `.claude/settings.json`, `.codex/hooks.json`, `.opencode/plugins/harness.ts`: pre-tool blocks (push to develop/main, `--no-verify`, bare `rm -rf`, generated files) and the Stop gate `make check-fast`. Its post-edit gofmt/vet feedback has no Go files to check here. |

## Sensors

| Sensor | Runs | Lifecycle | Blocking? |
|---|---|---|---|
| `make check-fast` | `npm run lint` (eslint) + `npm run typecheck` (react-router typegen + tsc) | agent Stop hook | yes (local) |
| CI `web` | eslint, typecheck, `check:api` (generated `app/lib/api-schema.ts` == `openapi/storefront-bff.yaml`), vitest with the coverage thresholds of `vitest.config.ts`, production build | PR, push | yes |
| CI `pinned-contracts` | `scripts/harness/pinned_contract_gate.py`: every copy listed in `contracts/pinned.json` equals the producer's develop (+ the gate's own tests) | PR, push | yes |
| CI `file-length` | oxlint `max-lines` (300 code lines, `.oxlintrc.file-length.json`) on the `.ts`/`.tsx` files a PR into develop adds or touches; backlog report otherwise | PR into develop | yes (backlog informational) |
| CI `no-network-url-in-bundle` | `npm run check:bundle` on a fresh build: the client bundle holds only `/api/storefront` URLs (twin bad-fixture test `scripts/bundle-scan.test.ts`) | PR, push | yes |
| CI `lighthouse-budgets` | Lighthouse CI (`lighthouserc.cjs`), mobile then desktop: LCP <= 2.5 s, TBT <= 200 ms, CLS <= 0.1 | PR, push | yes |
| CI `e2e` | Playwright journeys (`e2e/`) against the stub BFF, incl. the CSP check | PR, push | yes |
| CI `docker-build` | the root `Dockerfile` builds | PR, push | yes |
| CI `helm-lint` | `ct lint` + `helm lint` with every `ci/` values file of `charts/storefront-web` | PR | yes |
| CI `chart-tests` | every `charts/storefront-web/tests` script; a test printing SKIP fails | PR, push | yes |
| CI `guide-lint` | `guide_lint.py` (guides: skills load, references resolve, budget), `repo_lint.py` (workflow/dependabot/chart config), hook, red-issue and repo-lint unit tests | PR, push | yes |
| `codeql.yml`, `docs.yml`, `ai-review.yml` | code scanning, docs site build, advisory AI review | see each workflow | per workflow |

Local equivalents: `make check` (lint typecheck test build check-api), `make check-all` (lint typecheck coverage
bundle-check e2e), `make lighthouse`, `make guide-lint`, `make harness-test`.

`no-network-url-in-bundle` guards "the web talks only to /api/storefront" (ADR 0002); `lighthouse-budgets` guards
plan section 8 (ADR 0005). Incidents go to `INCIDENTS.md` (the canonical fleet log) with the sensor that now catches
them.
