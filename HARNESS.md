# Harness (harness-template: v4)

storefront-web carries the agent-runtime harness of `warehouse-harness-template`, applied with
`tools/migrate_v3.py --profile platform` then `tools/migrate_v4.py` (precedent: warehouse-console).

| Component | Where |
|---|---|
| Guides | `.claude/rules/*.md` (path-scoped), `.claude/skills/how-to-*`, `docs/adr`, `.claude/memory/MEMORY.md` |
| Review subagents | `.claude/agents/{code-review,architecture-review,domain-review}.md` |
| Agent hooks | `scripts/harness/hook.py` via `.claude/settings.json`, `.codex/hooks.json`, `.opencode/plugins/harness.ts` |
| Sensors | `make check-fast` (lint, typecheck), `make check-all`, `guide-lint`, `repo_lint.py`, CI `web`, `no-network-url-in-bundle`, `lighthouse-budgets`, `e2e` |

Sensor `no-network-url-in-bundle` guards "the web talks only to /api/storefront"; its twin is the bad-fixture test in
`scripts/bundle-scan.test.ts`. `lighthouse-budgets` guards plan section 8.

Incidents go to `INCIDENTS.md` with the sensor that now catches them. CLAUDE.md/AGENTS.md are write-gated: the draft is
in the campaign plans folder.
