from __future__ import annotations

import argparse
import json
from pathlib import Path

from scripts.ops import supabase_logical_backup as backup


def _args(tmp_path, **overrides) -> argparse.Namespace:
    payload = {
        "project_id": "hushh-pda",
        "db_host": "db.example.supabase.co",
        "db_port": "5432",
        "db_name": "postgres",
        "db_user": "postgres",
        "db_password": "secret",
        "bucket": "hushh-pda-prod-db-backups",
        "prefix": "prod/supabase-logical",
        "retention_days": "14",
        "dump_timeout_seconds": "60",
        "gzip_level": "6",
        "environment": "production",
        "report_path": str(tmp_path / "backup-report.json"),
    }
    payload.update(overrides)
    return argparse.Namespace(**payload)


def test_logical_backup_success_writes_report_and_manifests(monkeypatch, tmp_path):
    uploaded_json: list[tuple[str, dict]] = []

    def fake_run_pg_dump(**kwargs):
        output_path = Path(kwargs["output_path"])
        output_path.write_bytes(b"backup-bytes")

    def fake_upload_backup(**kwargs):
        assert Path(kwargs["backup_path"]).exists()
        return f"gs://{kwargs['bucket_name']}/{kwargs['backup_object']}"

    def fake_upload_json(**kwargs):
        uploaded_json.append((kwargs["object_name"], kwargs["payload"]))

    monkeypatch.setattr(backup, "_run_pg_dump", fake_run_pg_dump)
    monkeypatch.setattr(backup, "_upload_backup", fake_upload_backup)
    monkeypatch.setattr(backup, "_upload_json", fake_upload_json)
    monkeypatch.setattr(backup, "_pg_dump_version", lambda: "pg_dump (PostgreSQL) 16.0")

    result = backup.run(_args(tmp_path))
    assert result == 0

    report = json.loads((tmp_path / "backup-report.json").read_text(encoding="utf-8"))
    assert report["status"] == "ok"
    assert report["bucket"] == "hushh-pda-prod-db-backups"
    assert report["backup_object_uri"].startswith("gs://hushh-pda-prod-db-backups/")
    assert len(uploaded_json) == 2
    uploaded_names = {name for name, _ in uploaded_json}
    assert any(name.endswith(".manifest.json") for name in uploaded_names)
    assert "prod/supabase-logical/latest.json" in uploaded_names


def test_logical_backup_fails_cleanly_when_required_values_missing(tmp_path):
    result = backup.run(_args(tmp_path, db_host=""))
    assert result == 1

    report = json.loads((tmp_path / "backup-report.json").read_text(encoding="utf-8"))
    assert report["status"] == "error"
    assert "missing required value: DB_HOST" in report["error"]
