# Hushh Research -- Development Commands
# ========================================
# Usage: make <target>
# Run `make help` for available targets.

.PHONY: help dev dev-frontend dev-backend lint test ci-local sync-protocol push-protocol setup verify-setup

# === Help ==================================================================

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# === Subtree Sync ==========================================================

sync-protocol: ## Pull latest consent-protocol from upstream
	@echo "Pulling consent-protocol from upstream..."
	git subtree pull --prefix=consent-protocol consent-upstream main --squash
	@echo "Updating sync bookmark..."
	git update-ref refs/subtree-sync/consent-protocol $$(git rev-parse consent-upstream/main)
	@echo "Done. consent-protocol/ is now in sync with upstream."
	@echo "Bookmark: $$(git rev-parse refs/subtree-sync/consent-protocol | cut -c1-8)"

check-protocol-sync: ## Check if consent-protocol is in sync with upstream (non-blocking)
	@echo "Checking consent-protocol upstream sync status..."
	@git fetch consent-upstream main --quiet 2>/dev/null || { echo "⚠  Could not fetch consent-upstream. Is the remote configured? Run: make setup"; exit 1; }
	@CURRENT=$$(git rev-parse consent-upstream/main 2>/dev/null || echo ""); \
	BOOKMARK=$$(git rev-parse refs/subtree-sync/consent-protocol 2>/dev/null || echo ""); \
	if [ -z "$$BOOKMARK" ]; then \
		echo ""; \
		echo "⚠  No sync bookmark found. Run: make sync-protocol"; \
		echo ""; \
		exit 1; \
	elif [ "$$BOOKMARK" != "$$CURRENT" ]; then \
		AHEAD=$$(git rev-list "$$BOOKMARK".."$$CURRENT" --count 2>/dev/null || echo "?"); \
		echo ""; \
		echo "❌ consent-upstream/main is $$AHEAD commit(s) ahead of last sync."; \
		echo "   Last synced:      $$(echo $$BOOKMARK | cut -c1-8)"; \
		echo "   Current upstream: $$(echo $$CURRENT | cut -c1-8)"; \
		echo "   Run: make sync-protocol"; \
		echo ""; \
		exit 1; \
	else \
		echo "✅ consent-protocol is in sync with upstream."; \
	fi

push-protocol: check-protocol-sync ## Push consent-protocol changes to upstream (syncs first)
	@echo "Pushing consent-protocol/ to upstream..."
	git subtree push --prefix=consent-protocol consent-upstream main
	@echo "Done. Upstream consent-protocol repo is now updated."

push-protocol-force: ## Push consent-protocol to upstream (skip sync check)
	@echo "⚠  Skipping upstream sync check (force mode)..."
	@echo "Pushing consent-protocol/ to upstream..."
	git subtree push --prefix=consent-protocol consent-upstream main
	@echo "Done. Upstream consent-protocol repo is now updated."

setup: ## First-time setup (hooks + remote + verification)
	@sh scripts/setup-hooks.sh
	@echo ""
	@$(MAKE) --no-print-directory verify-setup

verify-setup: ## Verify your dev environment is correctly configured
	@echo ""
	@echo "==============================================="
	@echo " Hushh Research — Setup Verification"
	@echo "==============================================="
	@echo ""
	@printf "  Git hooks path:        "; \
	HP=$$(git config core.hooksPath 2>/dev/null || echo ""); \
	if [ "$$HP" = ".githooks" ]; then printf "\033[32m✅ .githooks\033[0m\n"; \
	else printf "\033[31m❌ not set (run: make setup)\033[0m\n"; fi
	@printf "  pre-commit hook:       "; \
	if [ -x .githooks/pre-commit ]; then printf "\033[32m✅ installed\033[0m\n"; \
	else printf "\033[31m❌ missing or not executable\033[0m\n"; fi
	@printf "  pre-push hook:         "; \
	if [ -x .githooks/pre-push ]; then printf "\033[32m✅ installed\033[0m\n"; \
	else printf "\033[31m❌ missing or not executable\033[0m\n"; fi
	@printf "  consent-upstream:      "; \
	if git remote | grep -q "consent-upstream"; then printf "\033[32m✅ configured\033[0m\n"; \
	else printf "\033[31m❌ not configured (run: make setup)\033[0m\n"; fi
	@printf "  python3:               "; \
	if command -v python3 >/dev/null 2>&1; then printf "\033[32m✅ $$(python3 --version 2>&1)\033[0m\n"; \
	else printf "\033[31m❌ not found\033[0m\n"; fi
	@printf "  ruff:                  "; \
	if python3 -m ruff --version >/dev/null 2>&1; then printf "\033[32m✅ $$(python3 -m ruff --version 2>&1)\033[0m\n"; \
	else printf "\033[31m❌ not found (pip3 install ruff)\033[0m\n"; fi
	@printf "  node:                  "; \
	if command -v node >/dev/null 2>&1; then printf "\033[32m✅ $$(node --version 2>&1)\033[0m\n"; \
	else printf "\033[31m❌ not found\033[0m\n"; fi
	@echo ""

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
