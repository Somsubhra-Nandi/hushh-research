#!/usr/bin/env python3
"""Lightweight runtime-first audit for app-wide edge-case hotspots.

Generates a JSON report under temp/ without adding test-suite bloat.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
RG_BASE = [
    "rg",
    "--no-messages",
    "--glob",
    "!**/.venv/**",
    "--glob",
    "!**/venv/**",
    "--glob",
    "!**/node_modules/**",
    "--glob",
    "!**/.next/**",
]


def _run(cmd: list[str]) -> str:
    try:
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=20)
    except subprocess.TimeoutExpired:
        return ""
    if proc.returncode != 0:
        return ""
    return proc.stdout.strip()


def _rg_count(pattern: str, paths: list[str]) -> int:
    out = _run([*RG_BASE, "-n", pattern, *paths])
    if not out:
        return 0
    return len(out.splitlines())


def _rg_lines(pattern: str, paths: list[str], limit: int = 40) -> list[str]:
    out = _run([*RG_BASE, "-n", pattern, *paths])
    if not out:
        return []
    return out.splitlines()[:limit]


def _read(path: str) -> str:
    full = ROOT / path
    if not full.exists():
        return ""
    return full.read_text(encoding="utf-8")


def _ttl_snapshot() -> dict[str, Any]:
    market = _read("consent-protocol/api/routes/kai/market_insights.py")
    web = _read("hushh-webapp/components/kai/views/kai-market-preview-view.tsx")

    def find(name: str, text: str) -> int | None:
        m = re.search(rf"{re.escape(name)}\s*=\s*(\d+)", text)
        return int(m.group(1)) if m else None

    return {
        "backend_home_fresh": find("HOME_FRESH_TTL_SECONDS", market),
        "backend_quotes_fresh": find("QUOTES_FRESH_TTL_SECONDS", market),
        "frontend_poll_ms": find("POLL_INTERVAL_MS", web),
        "frontend_cache_ttl_ms": find("MARKET_HOME_CACHE_TTL_MS", web),
    }


def _sequential_external_loops() -> list[str]:
    return _rg_lines(
        "await fetch_market_data|await fetch_market_news",
        ["consent-protocol/api/routes/kai/market_insights.py"],
        limit=120,
    )


def build_report() -> dict[str, Any]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "spinner_references": {
            "animate_spin": _rg_count("animate-spin", ["hushh-webapp"]),
            "loader_components": _rg_count("HushhLoader|Spinner", ["hushh-webapp"]),
        },
        "vault_state_fetch_sites": _rg_lines("getVaultState\\(", ["hushh-webapp"], limit=60),
        "vault_get_proxy_routes": _rg_lines("/db/vault/get", ["hushh-webapp", "consent-protocol"], limit=20),
        "ttl_snapshot": _ttl_snapshot(),
        "sequential_external_loop_patterns": _sequential_external_loops(),
        "provider_cooldown_hooks": _rg_lines(
            "provider_cooldown|pmp:global|FMP_GLOBAL_COOLDOWN_KEY", ["consent-protocol"], limit=80
        ),
        "notes": [
            "This audit is heuristic and complements runtime smoke verification.",
            "Use with scripts/verify-pre-launch.sh for release gating.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate app edge-case audit report")
    parser.add_argument(
        "--out",
        default=f"temp/app-edge-case-audit-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json",
        help="Output report path",
    )
    args = parser.parse_args()

    out_path = ROOT / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    report = build_report()
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(str(out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
