#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WEB_DIR="$REPO_ROOT/hushh-webapp"
cd "$WEB_DIR"

npm run verify:routes
npm run verify:parity
npm run verify:capacitor:config
npm run cap:build:mobile
npm run verify:capacitor:routes
