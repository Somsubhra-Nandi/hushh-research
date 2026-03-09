#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WEB_DIR="$REPO_ROOT/hushh-webapp"
cd "$WEB_DIR"

npm run cap:build:mobile
npm run cap:sync:ios:prod
