# Hushh Research -- Development Commands
# ========================================
# Usage: make <target>
# Run `make help` for available targets.

.PHONY: help dev dev-frontend dev-backend lint test verify-docs ci-local env-bootstrap env-use run-web run-backend db-init-iam verify-iam-schema

ENV ?= dev
CONFIRM_PROD_LOCAL ?= 0

# === Help ==================================================================

help: ## Show this help
	@grep -h -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# === Subtree Sync ==========================================================

ifneq ("$(wildcard consent-protocol/ops/monorepo/protocol.mk)","")
include consent-protocol/ops/monorepo/protocol.mk
endif

# === Development ===========================================================

dev: ## Start frontend + backend (backend backgrounded)
	@echo "Starting backend on :8000..."
	@cd consent-protocol && python3 -m uvicorn server:app --reload --port 8000 &
	@echo "Starting frontend on :3000..."
	@cd hushh-webapp && npm run dev

dev-frontend: ## Start frontend only
	cd hushh-webapp && npm run dev

dev-backend: ## Start backend only
	cd consent-protocol && python3 -m uvicorn server:app --reload --port 8000

# === Quality ===============================================================

lint: ## Run all linters (backend + frontend)
	@echo "=== Backend (ruff) ==="
	cd consent-protocol && ruff check . && ruff format --check .
	@echo ""
	@echo "=== Frontend (eslint) ==="
	cd hushh-webapp && npm run lint

test: ## Run all tests (backend + frontend)
	@echo "=== Backend (pytest) ==="
	cd consent-protocol && pytest tests/ -v
	@echo ""
	@echo "=== Frontend (vitest) ==="
	cd hushh-webapp && npm test

verify-docs: ## Verify docs/runtime parity and route documentation truth
	node scripts/verify-doc-runtime-parity.cjs

ci-local: ## Full local CI simulation (mirrors GitHub Actions)
	./scripts/test-ci-local.sh

# === Environment Profiles ====================================================

env-bootstrap: ## Create/hydrate local env profiles from templates + GCP secrets
	bash scripts/env/bootstrap_profiles.sh

env-use: ## Activate local profile files (ENV=dev|uat|prod, set CONFIRM_PROD_LOCAL=1 for prod)
	@if [ "$(ENV)" = "prod" ] && [ "$(CONFIRM_PROD_LOCAL)" != "1" ]; then \
		echo "Refusing prod profile activation without CONFIRM_PROD_LOCAL=1"; \
		exit 1; \
	fi
	@FLAGS=""; \
	if [ "$(ENV)" = "prod" ] && [ "$(CONFIRM_PROD_LOCAL)" = "1" ]; then FLAGS="--confirm-prod-local"; fi; \
	bash scripts/env/use_profile.sh "$(ENV)" $$FLAGS

run-web: env-use ## Activate profile then run frontend dev server (ENV=dev|uat|prod)
	cd hushh-webapp && npm run dev

run-backend: env-use ## Activate profile then run backend dev server (ENV=dev|uat|prod)
	cd consent-protocol && python3 -m uvicorn server:app --reload --port 8000

db-init-iam: ## Apply IAM foundation migrations explicitly (020 + 021)
	cd consent-protocol && PYTHONPATH=. .venv/bin/python db/migrate.py --iam

verify-iam-schema: ## Verify IAM tables/templates readiness
	cd consent-protocol && PYTHONPATH=. .venv/bin/python scripts/verify_iam_schema.py
