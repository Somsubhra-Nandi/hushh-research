#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Mirrors the blocking CI surface. Set INCLUDE_ADVISORY_CHECKS=1 for extra non-blocking checks.
exec scripts/ci/orchestrate.sh all
