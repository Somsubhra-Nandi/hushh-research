#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
PROTOCOL_DIR="$REPO_ROOT/consent-protocol"

cd "$PROTOCOL_DIR"

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -r requirements-dev.txt

python -m ruff check .
python -m mypy --config-file pyproject.toml --ignore-missing-imports
python -m bandit -r hushh_mcp/ api/ -c pyproject.toml -ll

if [ -d tests ] && [ -n "$(find tests -name 'test_*.py' -o -name '*_test.py' | head -1)" ]; then
  TESTING="true" \
  SECRET_KEY="${SECRET_KEY:-test_secret_key_for_ci_only_32chars_min}" \
  VAULT_ENCRYPTION_KEY="${VAULT_ENCRYPTION_KEY:-0000000000000000000000000000000000000000000000000000000000000000}" \
  python -m pytest tests/ -v --tb=short --cov=hushh_mcp --cov-report=xml --cov-report=term
else
  echo "⚠ No test files found, skipping"
fi

TESTING="true" \
SECRET_KEY="${SECRET_KEY:-test_secret_key_for_ci_only_32chars_min}" \
VAULT_ENCRYPTION_KEY="${VAULT_ENCRYPTION_KEY:-0000000000000000000000000000000000000000000000000000000000000000}" \
python scripts/run_kai_accuracy_suite.py --benchmark-limit 2 --no-fail-benchmark

RUN_DOCKER_VERIFY="${PROTOCOL_VERIFY_DOCKER:-}"
if [ -z "$RUN_DOCKER_VERIFY" ]; then
  if [ "${CI:-}" = "true" ]; then
    RUN_DOCKER_VERIFY="1"
  else
    RUN_DOCKER_VERIFY="0"
  fi
fi

if [ "$RUN_DOCKER_VERIFY" = "1" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ Docker parity check requested, but docker is not installed."
    exit 1
  fi
  docker build -t consent-protocol:ci .
fi
