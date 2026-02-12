# Hushh Research -- Development Commands
# ========================================
# Usage: make <target>
# Run `make help` for available targets.

.PHONY: help dev dev-frontend dev-backend lint test ci-local sync-protocol push-protocol setup

# === Help ==================================================================

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# === Subtree Sync ==========================================================

sync-protocol: ## Pull latest consent-protocol from upstream
	@echo "Pulling consent-protocol from upstream..."
	git subtree pull --prefix=consent-protocol consent-upstream main --squash
	@echo "Done. consent-protocol/ is now in sync with upstream."

push-protocol: ## Push consent-protocol changes to upstream
	@echo "Pushing consent-protocol/ to upstream..."
	git subtree push --prefix=consent-protocol consent-upstream main
	@echo "Done. Upstream consent-protocol repo is now updated."

setup: ## First-time setup (add upstream remote)
	@git remote add consent-upstream https://github.com/hushh-labs/consent-protocol.git 2>/dev/null && \
		echo "Remote 'consent-upstream' added." || \
		echo "Remote 'consent-upstream' already configured."
	@echo "Run 'make sync-protocol' to pull the latest backend."

# === Development ===========================================================

dev: ## Start frontend + backend (backend backgrounded)
	@echo "Starting backend on :8000..."
	@cd consent-protocol && python -m uvicorn server:app --reload --port 8000 &
	@echo "Starting frontend on :3000..."
	@cd hushh-webapp && npm run dev

dev-frontend: ## Start frontend only
	cd hushh-webapp && npm run dev

dev-backend: ## Start backend only
	cd consent-protocol && python -m uvicorn server:app --reload --port 8000

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

ci-local: ## Full local CI simulation (mirrors GitHub Actions)
	./scripts/test-ci-local.sh
