#!/usr/bin/env python3
"""Validate freshness and integrity of logical backup artifacts stored in GCS.

The script reads the latest manifest (prefer `prefix/latest.json`) and enforces:
  - status == ok
  - backup object exists
  - backup age <= threshold hours
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from google.cloud import storage
except Exception:  # pragma: no cover - exercised in runtime checks
    storage = None  # type: ignore[assignment]


def _require_storage_lib() -> None:
    if storage is None:
        raise RuntimeError(
            "google-cloud-storage is not installed. Install dependencies and retry."
        )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp /= 1000.0
        return datetime.fromtimestamp(timestamp, tz=timezone.utc)
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _normalize_prefix(prefix: str) -> str:
    normalized = prefix.strip().strip("/")
    return normalized or "prod/supabase-logical"


def _load_json_blob(blob: storage.Blob) -> dict[str, Any] | None:
    if not blob.exists():
        return None
    try:
        raw = blob.download_as_text()
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
        return None
    except Exception:
        return None


def _latest_manifest_from_listing(bucket: storage.Bucket, prefix: str) -> tuple[dict[str, Any] | None, str | None]:
    latest_blob: storage.Blob | None = None
    for blob in bucket.list_blobs(prefix=f"{prefix}/"):
        if not blob.name.endswith(".manifest.json"):
            continue
        if latest_blob is None:
            latest_blob = blob
            continue
        latest_updated = latest_blob.updated or latest_blob.time_created
        current_updated = blob.updated or blob.time_created
        if current_updated and latest_updated:
            if current_updated > latest_updated:
                latest_blob = blob
        elif current_updated and not latest_updated:
            latest_blob = blob

    if latest_blob is None:
        return None, None
    return _load_json_blob(latest_blob), latest_blob.name


def _extract_backup_object(manifest: dict[str, Any], bucket_name: str) -> str | None:
    object_name = manifest.get("backup_object")
    if isinstance(object_name, str) and object_name.strip():
        return object_name.strip()

    uri = manifest.get("backup_object_uri")
    if not isinstance(uri, str) or not uri.startswith("gs://"):
        return None
    expected_prefix = f"gs://{bucket_name}/"
    if not uri.startswith(expected_prefix):
        return None
    tail = uri[len(expected_prefix) :].strip()
    return tail or None


def _write_report(report_path: str, payload: dict[str, Any]) -> None:
    if not report_path:
        return
    path = Path(report_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def run(args: argparse.Namespace) -> int:
    now = _utc_now()
    bucket_name = (args.bucket or "").strip()
    prefix = _normalize_prefix(args.prefix)
    max_age_hours = float(args.max_age_hours)
    project_id = (args.project_id or "").strip()

    violations: list[str] = []
    notes: list[str] = []
    latest_manifest: dict[str, Any] | None = None
    latest_manifest_object: str | None = None

    if not bucket_name:
        payload = {
            "checked_at": _iso_utc(now),
            "status": "error",
            "violations": ["missing_bucket"],
            "notes": ["BACKUP_BUCKET is required"],
        }
        _write_report(args.report_path, payload)
        print(json.dumps(payload, indent=2))
        return 2

    try:
        _require_storage_lib()
        client = storage.Client(project=project_id or None)
        bucket = client.bucket(bucket_name)

        latest_pointer_object = f"{prefix}/latest.json"
        latest_pointer_blob = bucket.blob(latest_pointer_object)
        latest_manifest = _load_json_blob(latest_pointer_blob)
        latest_manifest_object = latest_pointer_object if latest_manifest else None

        if latest_manifest is None:
            latest_manifest, latest_manifest_object = _latest_manifest_from_listing(bucket, prefix)

        if latest_manifest is None:
            violations.append("latest_manifest_missing")
            notes.append("No latest.json pointer or manifest files were found under prefix.")
        else:
            latest_status = str(latest_manifest.get("status") or "").strip().lower()
            if latest_status != "ok":
                violations.append(f"latest_status_not_ok:{latest_status or 'missing'}")

            completed_at = _parse_datetime(
                latest_manifest.get("backup_completed_at")
                or latest_manifest.get("checked_at")
                or latest_manifest.get("timestamp")
            )
            if completed_at is None:
                violations.append("latest_backup_completed_at_missing")
            else:
                age_hours = round((now - completed_at).total_seconds() / 3600.0, 2)
                if age_hours > max_age_hours:
                    violations.append(f"latest_backup_age_exceeds_threshold:{age_hours:.2f}h>{max_age_hours:.2f}h")

            backup_object = _extract_backup_object(latest_manifest, bucket_name)
            if not backup_object:
                violations.append("backup_object_missing")
            else:
                backup_blob = bucket.blob(backup_object)
                if not backup_blob.exists():
                    violations.append("backup_object_not_found")

    except Exception as exc:
        violations.append("gcs_check_failed")
        notes.append(str(exc))

    latest_backup_payload: dict[str, Any] = {}
    if latest_manifest is not None:
        latest_backup_payload = {
            "status": latest_manifest.get("status"),
            "backup_completed_at": latest_manifest.get("backup_completed_at"),
            "backup_object_uri": latest_manifest.get("backup_object_uri"),
            "backup_object": latest_manifest.get("backup_object"),
            "checksum_sha256": latest_manifest.get("checksum_sha256"),
            "backup_size_bytes": latest_manifest.get("backup_size_bytes"),
        }

    report = {
        "checked_at": _iso_utc(now),
        "project_id": project_id,
        "bucket": bucket_name,
        "prefix": prefix,
        "policy": {
            "max_age_hours": max_age_hours,
        },
        "latest_manifest_object": latest_manifest_object,
        "latest_backup": latest_backup_payload,
        "violations": violations,
        "notes": notes,
        "status": "ok" if not violations else "error",
    }

    _write_report(args.report_path, report)
    print(json.dumps(report, indent=2))
    return 0 if not violations else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check logical backup freshness from GCS manifests.")
    parser.add_argument("--project-id", default=os.getenv("PROJECT_ID", ""), help="GCP project ID.")
    parser.add_argument("--bucket", default=os.getenv("BACKUP_BUCKET", ""), help="Backup bucket name.")
    parser.add_argument(
        "--prefix",
        default=os.getenv("BACKUP_PREFIX", "prod/supabase-logical"),
        help="Object prefix where manifests are stored.",
    )
    parser.add_argument(
        "--max-age-hours",
        default=os.getenv("BACKUP_MAX_AGE_HOURS", "30"),
        help="Maximum allowed age for latest successful backup.",
    )
    parser.add_argument("--report-path", default="", help="Optional JSON report output path.")
    return parser.parse_args()


if __name__ == "__main__":
    sys.exit(run(parse_args()))
