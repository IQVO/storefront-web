# Incidents

| Date | What escaped | Fix | Sensor now guarding it |
|---|---|---|---|
| 2026-10-26 | A helper exported from a route module broke the account page after build (found by the first Playwright run) | Moved to `app/lib/shopper.ts` | Rule in `.claude/rules/routes-and-loaders.md`; the e2e journeys |
