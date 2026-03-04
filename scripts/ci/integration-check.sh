#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WEB_DIR="$REPO_ROOT/hushh-webapp"

cd "$WEB_DIR"

npm --version

if [ -f scripts/verify-route-contracts.cjs ]; then
  npm run verify:routes
else
  echo "⚠ WARNING: verify-route-contracts.cjs not found, skipping"
fi

if [ -f scripts/verify-native-parity.cjs ]; then
  npm run verify:parity
else
  echo "⚠ WARNING: verify-native-parity.cjs not found, skipping"
fi

if [ -f scripts/verify-capacitor-runtime-config.cjs ]; then
  npm run verify:capacitor:config
else
  echo "⚠ WARNING: verify-capacitor-runtime-config.cjs not found, skipping"
fi

if [ -f scripts/verify-capacitor-routes.cjs ]; then
  npm run verify:capacitor:routes
else
  echo "⚠ WARNING: verify-capacitor-routes.cjs not found, skipping"
fi

if [ -f "$REPO_ROOT/scripts/verify-doc-links.cjs" ]; then
  node "$REPO_ROOT/scripts/verify-doc-links.cjs"
else
  echo "⚠ WARNING: scripts/verify-doc-links.cjs not found, skipping"
fi
