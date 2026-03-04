#!/usr/bin/env python3
"""Supabase production backup posture checker and restore-point gate.

Read-only by default. Optionally creates a restore point for pre-deploy gates.

Usage examples:
  python3 scripts/ops/supabase_backup_posture_check.py \
    --project-ref "$SUPABASE_PROJECT_REF_PROD" \
    --management-token "$SUPABASE_MANAGEMENT_TOKEN" \
    --require-pitr --max-backup-age-hours 24

  python3 scripts/ops/supabase_backup_posture_check.py \
    --project-ref "$SUPABASE_PROJECT_REF_PROD" \
    --management-token "$SUPABASE_MANAGEMENT_TOKEN" \
    --require-pitr --max-backup-age-hours 24 \
    --create-restore-point \
    --restore-point-label "predeploy-${GITHUB_SHA:-local}"
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib import error, request


DEFAULT_API_BASE = "https://api.supabase.com/v1"
DEFAULT_TIMEOUT_SECONDS = 30
SUCCESS_BACKUP_STATES = {"completed", "success", "succeeded", "done", "available", "ready"}


@dataclass
class ApiResponse:
    status_code: int
    payload: Any


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        # Treat large numbers as ms epoch.
        if value > 10_000_000_000:
            return datetime.fromtimestamp(float(value) / 1000.0, tz=timezone.utc)
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if not isinstance(value, str):
        return None

    raw = value.strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _request_json(
    *,
    api_base: str,
    path: str,
    token: str,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> ApiResponse:
    url = f"{api_base.rstrip('/')}/{path.lstrip('/')}"
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    req = request.Request(url=url, method=method.upper(), data=body)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("apikey", token)
    req.add_header("Content-Type", "application/json")

    try:
        with request.urlopen(req, timeout=timeout_seconds) as resp:
            raw = resp.read().decode("utf-8").strip()
            parsed = json.loads(raw) if raw else {}
            return ApiResponse(status_code=resp.status, payload=parsed)
    except error.HTTPError as http_err:
        raw = http_err.read().decode("utf-8").strip()
        parsed: Any
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"error": raw}
        return ApiResponse(status_code=http_err.code, payload=parsed)
    except error.URLError as url_err:
        reason = getattr(url_err, "reason", None)
        return ApiResponse(
            status_code=0,
            payload={"error": f"network_error: {reason or str(url_err)}"},
        )
    except TimeoutError:
        return ApiResponse(
            status_code=0,
            payload={"error": f"network_error: request timed out after {timeout_seconds}s"},
        )


def _extract_list(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []

    for key in ("backups", "data", "items", "result"):
        value = payload.get(key)
        if isinstance(value, list):
            return [x for x in value if isinstance(x, dict)]
        if isinstance(value, dict):
            nested = _extract_list(value)
            if nested:
                return nested
    return [payload]


def _extract_latest_backup(backups: list[dict[str, Any]]) -> tuple[datetime | None, dict[str, Any] | None]:
    candidates: list[tuple[datetime, dict[str, Any]]] = []
    time_keys = (
        "completed_at",
        "finished_at",
        "inserted_at",
        "created_at",
        "updated_at",
        "timestamp",
        "time",
    )
    for backup in backups:
        status = str(backup.get("status", "")).strip().lower()
        if status and status not in SUCCESS_BACKUP_STATES:
            continue
        for key in time_keys:
            dt = _parse_datetime(backup.get(key))
            if dt is not None:
                candidates.append((dt, backup))
                break
    if not candidates:
        return None, None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0]


def _extract_message(payload: Any) -> str:
    if isinstance(payload, dict):
        for key in ("message", "error", "msg", "details"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        nested_error = payload.get("error")
        if isinstance(nested_error, dict):
            return _extract_message(nested_error)
    if isinstance(payload, str):
        return payload.strip()
    return ""


def _create_restore_point(
    *,
    api_base: str,
    project_ref: str,
    token: str,
    label: str | None,
    timeout_seconds: int,
) -> ApiResponse:
    path = f"projects/{project_ref}/database/backups/restore-point"

    # Prefer a labeled request when supported, then fallback to empty JSON payload.
    attempted_payloads: list[dict[str, Any] | None] = []
    if label:
        attempted_payloads.append({"description": label})
    attempted_payloads.append({})

    last_response = ApiResponse(status_code=0, payload={"error": "restore point creation failed"})
    for payload in attempted_payloads:
        resp = _request_json(
            api_base=api_base,
            path=path,
            token=token,
            method="POST",
            payload=payload,
            timeout_seconds=timeout_seconds,
        )
        last_response = resp
        if resp.status_code in (200, 201):
            return resp
        # Retry without payload only for validation errors.
        if resp.status_code not in (400, 422):
            return resp
    return last_response


def run(args: argparse.Namespace) -> int:
    started_at = _now_utc()
    violations: list[str] = []
    notes: list[str] = []

    project_ref = args.project_ref or os.getenv("SUPABASE_PROJECT_REF_PROD", "").strip()
    token = args.management_token or os.getenv("SUPABASE_MANAGEMENT_TOKEN", "").strip()
    api_base = args.api_base or os.getenv("SUPABASE_MANAGEMENT_API_BASE", DEFAULT_API_BASE)

    if not project_ref:
        print("ERROR: project ref missing. Set --project-ref or SUPABASE_PROJECT_REF_PROD.", file=sys.stderr)
        return 2
    if not token:
        print(
            "ERROR: management token missing. Set --management-token or SUPABASE_MANAGEMENT_TOKEN.",
            file=sys.stderr,
        )
        return 2

    backup_resp = _request_json(
        api_base=api_base,
        path=f"projects/{project_ref}/database/backups",
        token=token,
        method="GET",
        timeout_seconds=args.timeout_seconds,
    )
    backups: list[dict[str, Any]] = []
    latest_backup_dt: datetime | None = None
    latest_backup: dict[str, Any] | None = None

    if backup_resp.status_code != 200:
        msg = _extract_message(backup_resp.payload)
        violations.append(f"backup_list_api_failed:{backup_resp.status_code}")
        notes.append(f"backup_list_error={msg or 'unknown'}")
    else:
        backups = _extract_list(backup_resp.payload)
        latest_backup_dt, latest_backup = _extract_latest_backup(backups)
        if latest_backup_dt is None:
            violations.append("latest_backup_timestamp_missing")
        else:
            age_hours = (_now_utc() - latest_backup_dt).total_seconds() / 3600.0
            if age_hours > float(args.max_backup_age_hours):
                violations.append(
                    f"latest_backup_age_exceeds_threshold:{age_hours:.2f}h>{args.max_backup_age_hours:.2f}h"
                )

    pitr_available: bool | None = None
    pitr_resp = _request_json(
        api_base=api_base,
        path=f"projects/{project_ref}/database/backups/restore-point",
        token=token,
        method="GET",
        timeout_seconds=args.timeout_seconds,
    )
    if pitr_resp.status_code == 200:
        pitr_available = True
    elif pitr_resp.status_code in (404, 422):
        pitr_available = False
        notes.append(f"restore_point_endpoint_unavailable_status={pitr_resp.status_code}")
    else:
        pitr_available = None
        violations.append(f"restore_point_probe_failed:{pitr_resp.status_code}")
        notes.append(_extract_message(pitr_resp.payload) or "restore point probe error")

    if args.require_pitr and pitr_available is not True:
        violations.append("pitr_not_available")

    restore_point_created = False
    restore_point_id: str | None = None
    restore_point_resp_status: int | None = None
    restore_point_error: str | None = None
    if args.create_restore_point:
        create_resp = _create_restore_point(
            api_base=api_base,
            project_ref=project_ref,
            token=token,
            label=args.restore_point_label,
            timeout_seconds=args.timeout_seconds,
        )
        restore_point_resp_status = create_resp.status_code
        if create_resp.status_code in (200, 201):
            restore_point_created = True
            payload = create_resp.payload if isinstance(create_resp.payload, dict) else {}
            restore_point_id = (
                str(payload.get("id") or payload.get("name") or payload.get("reference") or "").strip()
                or None
            )
        else:
            restore_point_error = _extract_message(create_resp.payload) or "unknown restore point error"
            violations.append(f"restore_point_create_failed:{create_resp.status_code}")

    latest_backup_age_hours = None
    if latest_backup_dt is not None:
        latest_backup_age_hours = round((_now_utc() - latest_backup_dt).total_seconds() / 3600.0, 2)

    report = {
        "checked_at": _isoformat_utc(_now_utc()),
        "project_ref": project_ref,
        "api_base": api_base.rstrip("/"),
        "policy": {
            "max_backup_age_hours": float(args.max_backup_age_hours),
            "require_pitr": bool(args.require_pitr),
            "create_restore_point": bool(args.create_restore_point),
            "restore_point_label": args.restore_point_label,
        },
        "backup_metrics": {
            "backup_api_status": backup_resp.status_code,
            "backup_count": len(backups),
            "latest_backup_at": _isoformat_utc(latest_backup_dt) if latest_backup_dt else None,
            "latest_backup_age_hours": latest_backup_age_hours,
            "latest_backup_status": (latest_backup or {}).get("status"),
        },
        "pitr_metrics": {
            "probe_status": pitr_resp.status_code,
            "pitr_available": pitr_available,
        },
        "restore_point": {
            "created": restore_point_created,
            "id": restore_point_id,
            "response_status": restore_point_resp_status,
            "error": restore_point_error,
        },
        "violations": violations,
        "notes": notes,
        "status": "ok" if not violations else "error",
        "duration_ms": round((_now_utc() - started_at).total_seconds() * 1000, 2),
    }

    if args.report_path:
        with open(args.report_path, "w", encoding="utf-8") as report_file:
            json.dump(report, report_file, indent=2)

    if args.print_json:
        print(json.dumps(report, indent=2))
    else:
        print(f"backup posture status={report['status']} violations={len(violations)}")

    return 0 if not violations else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check Supabase production backup posture and optionally create a restore point."
    )
    parser.add_argument(
        "--project-ref",
        default="",
        help="Supabase project ref (defaults to SUPABASE_PROJECT_REF_PROD).",
    )
    parser.add_argument(
        "--management-token",
        default="",
        help="Supabase Management API token (defaults to SUPABASE_MANAGEMENT_TOKEN).",
    )
    parser.add_argument(
        "--api-base",
        default=DEFAULT_API_BASE,
        help=f"Supabase Management API base URL (default: {DEFAULT_API_BASE}).",
    )
    parser.add_argument(
        "--max-backup-age-hours",
        type=float,
        default=24.0,
        help="Fail if latest successful backup age exceeds this threshold.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="HTTP timeout for management API calls.",
    )
    parser.add_argument(
        "--require-pitr",
        action="store_true",
        help="Require restore-point endpoint availability as PITR readiness signal.",
    )
    parser.add_argument(
        "--create-restore-point",
        action="store_true",
        help="Create restore point (pre-deploy safety gate).",
    )
    parser.add_argument(
        "--restore-point-label",
        default="",
        help="Optional restore point label (if API supports it).",
    )
    parser.add_argument(
        "--report-path",
        default="",
        help="Optional path to write JSON report.",
    )
    parser.add_argument(
        "--print-json",
        action="store_true",
        default=True,
        help="Print JSON report to stdout (default: true).",
    )
    return parser.parse_args()


if __name__ == "__main__":
    sys.exit(run(parse_args()))
