from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from scripts.ops import logical_backup_freshness_check as check


class _FakeBlob:
    def __init__(
        self,
        *,
        name: str,
        exists: bool = True,
        payload: dict | None = None,
        updated: datetime | None = None,
    ) -> None:
        self.name = name
        self._exists = exists
        self._payload = payload
        self.updated = updated
        self.time_created = updated

    def exists(self) -> bool:
        return self._exists

    def download_as_text(self) -> str:
        if self._payload is None:
            raise RuntimeError("blob has no payload")
        return json.dumps(self._payload)


class _FakeBucket:
    def __init__(self, blobs: dict[str, _FakeBlob]) -> None:
        self._blobs = blobs

    def blob(self, name: str) -> _FakeBlob:
        return self._blobs.get(name, _FakeBlob(name=name, exists=False))

    def list_blobs(self, prefix: str) -> list[_FakeBlob]:
        return [blob for name, blob in self._blobs.items() if name.startswith(prefix)]


class _FakeClient:
    def __init__(self, *, bucket: _FakeBucket, project: str | None = None) -> None:
        self._bucket = bucket
        self.project = project

    def bucket(self, _bucket_name: str) -> _FakeBucket:
        return self._bucket


def _args(tmp_path, **overrides) -> argparse.Namespace:
    payload = {
        "project_id": "hushh-pda",
        "bucket": "hushh-pda-prod-db-backups",
        "prefix": "prod/supabase-logical",
        "max_age_hours": "30",
        "report_path": str(tmp_path / "report.json"),
    }
    payload.update(overrides)
    return argparse.Namespace(**payload)


def test_freshness_check_passes_with_recent_ok_manifest(monkeypatch, tmp_path):
    now = datetime.now(timezone.utc)
    manifest = {
        "status": "ok",
        "backup_completed_at": (now - timedelta(hours=1)).isoformat(),
        "backup_object": "prod/supabase-logical/date=2026-03-04/snap.dump.gz",
        "backup_object_uri": "gs://hushh-pda-prod-db-backups/prod/supabase-logical/date=2026-03-04/snap.dump.gz",
        "checksum_sha256": "abc123",
        "backup_size_bytes": 123,
    }
    blobs = {
        "prod/supabase-logical/latest.json": _FakeBlob(
            name="prod/supabase-logical/latest.json",
            payload=manifest,
            updated=now,
        ),
        "prod/supabase-logical/date=2026-03-04/snap.dump.gz": _FakeBlob(
            name="prod/supabase-logical/date=2026-03-04/snap.dump.gz",
            exists=True,
            updated=now,
        ),
    }
    fake_bucket = _FakeBucket(blobs=blobs)
    fake_storage = SimpleNamespace(
        Client=lambda project=None: _FakeClient(project=project, bucket=fake_bucket)
    )
    monkeypatch.setattr(check, "storage", fake_storage)

    result = check.run(_args(tmp_path))
    assert result == 0
    report = json.loads((tmp_path / "report.json").read_text(encoding="utf-8"))
    assert report["status"] == "ok"
    assert report["violations"] == []


def test_freshness_check_fails_when_backup_is_stale(monkeypatch, tmp_path):
    now = datetime.now(timezone.utc)
    manifest = {
        "status": "ok",
        "backup_completed_at": (now - timedelta(hours=36)).isoformat(),
        "backup_object": "prod/supabase-logical/date=2026-03-03/snap.dump.gz",
    }
    blobs = {
        "prod/supabase-logical/latest.json": _FakeBlob(
            name="prod/supabase-logical/latest.json",
            payload=manifest,
            updated=now,
        ),
        "prod/supabase-logical/date=2026-03-03/snap.dump.gz": _FakeBlob(
            name="prod/supabase-logical/date=2026-03-03/snap.dump.gz",
            exists=True,
            updated=now,
        ),
    }
    fake_bucket = _FakeBucket(blobs=blobs)
    fake_storage = SimpleNamespace(
        Client=lambda project=None: _FakeClient(project=project, bucket=fake_bucket)
    )
    monkeypatch.setattr(check, "storage", fake_storage)

    result = check.run(_args(tmp_path, max_age_hours="30"))
    assert result == 1
    report = json.loads((tmp_path / "report.json").read_text(encoding="utf-8"))
    assert report["status"] == "error"
    assert any("latest_backup_age_exceeds_threshold" in v for v in report["violations"])


def test_freshness_check_rejects_missing_bucket(tmp_path):
    result = check.run(_args(tmp_path, bucket=""))
    assert result == 2
    report = json.loads((tmp_path / "report.json").read_text(encoding="utf-8"))
    assert report["status"] == "error"
    assert "missing_bucket" in report["violations"]
