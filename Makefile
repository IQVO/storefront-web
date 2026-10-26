# Makefile for storefront-web: thin wrappers over npm so `make check` works in every fleet repo.
.PHONY: help install lint typecheck test coverage build bundle-check e2e lighthouse check check-all
help:
	@echo "targets: install lint typecheck test coverage build bundle-check e2e lighthouse check check-all check-fast guide-lint harness-test"
install:
	npm ci
lint:
	npm run lint
typecheck:
	npm run typecheck
test:
	npm test
coverage: ## vitest with the coverage thresholds in vitest.config.ts
	npm run test:coverage
build:
	npm run build
bundle-check: build ## sensor no-network-url-in-bundle against the fresh build
	npm run check:bundle
e2e: ## Playwright journeys; E2E_BASE_URL=... runs them against a real BFF instead of the stub
	npm run e2e
lighthouse: build ## Lighthouse CI budgets (mobile then desktop), served with the stub BFF
	npm run lhci
	LHCI_FORM_FACTOR=desktop npm run lhci
check: lint typecheck test build
check-all: lint typecheck coverage bundle-check e2e

# --- agent harness (harness-template v3) -----------------------------------
.PHONY: check-fast guide-lint harness-test
# Fast local gate used by the agent Stop hook (this repo's own quick checks).
check-fast: lint typecheck

guide-lint: ## lint agent guides: skills load, references resolve, context budget
	python3 scripts/harness/guide_lint.py

harness-test: ## unit-test the agent hooks (pre/post/stop)
	python3 scripts/harness/test_hook.py
	python3 scripts/harness/test_red_issue.py
