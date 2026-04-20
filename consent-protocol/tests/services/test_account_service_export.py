# tests/services/test_account_service_export.py
"""
Unit tests for AccountService.export_data().

All tests are fully offline — no database required.
Uses MagicMock to simulate the DB connection and verify
that the correct queries are issued and the response shape
matches the AccountExportResult contract expected by the frontend.
"""

from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from hushh_mcp.services.account_service import AccountService

USER_ID = "test-user-export-001"

# ---------------------------------------------------------------------------
# Fake DB rows
# ---------------------------------------------------------------------------

FAKE_ACTOR_ROW = {
    "personas": ["investor", "ria"],
    "last_active_persona": "investor",
    "investor_marketplace_opt_in": True,
    "created_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
    "updated_at": datetime(2025, 6, 1, tzinfo=timezone.utc),
}

FAKE_PKM_INDEX_ROW = {
    "available_domains": ["financial", "health"],
    "computed_tags": ["investor", "active"],
    "domain_summaries": {"financial": {"summary": "test"}},
    "activity_score": 0.85,
    "last_active_at": datetime(2025, 6, 1, tzinfo=timezone.utc),
    "total_attributes": 42,
    "model_version": 2,
    "updated_at": datetime(2025, 6, 1, tzinfo=timezone.utc),
}

FAKE_VAULT_ROW = {
    "primary_method": "passkey",
    "created_at": datetime(2025, 1, 1, tzinfo=timezone.utc),
    "updated_at": datetime(2025, 6, 1, tzinfo=timezone.utc),
}

FAKE_MANIFEST_ROWS = [
    {
        "domain": "financial",
        "path": "portfolio",
        "version": 3,
        "updated_at": datetime(2025, 6, 1, tzinfo=timezone.utc),
    }
]

FAKE_SCOPE_ROWS = [
    {
        "scope": "attr.financial.*",
        "granted_at": datetime(2025, 3, 1, tzinfo=timezone.utc),
        "expires_at": None,
    }
]


# ---------------------------------------------------------------------------
# Helper: build a fake connection whose query responses are configurable
# ---------------------------------------------------------------------------

def _make_conn(
    *,
    actor_row=FAKE_ACTOR_ROW,
    pkm_index_row=FAKE_PKM_INDEX_ROW,
    vault_row=FAKE_VAULT_ROW,
    vault_wrapper_count=2,
    manifest_rows=None,
    scope_rows=None,
):
    if manifest_rows is None:
        manifest_rows = FAKE_MANIFEST_ROWS
    if scope_rows is None:
        scope_rows = FAKE_SCOPE_ROWS

    call_count = {"n": 0}

    def _execute(query, params=None):
        result = MagicMock()
        sql = str(query)
        call_count["n"] += 1

        if "actor_profiles" in sql:
            row = MagicMock()
            row.__getitem__ = lambda self, k: actor_row[k] if actor_row else None
            mappings_result = MagicMock()
            mappings_result.first.return_value = (
                _make_mapping(actor_row) if actor_row else None
            )
            result.mappings.return_value = mappings_result

        elif "pkm_index" in sql:
            mappings_result = MagicMock()
            mappings_result.first.return_value = (
                _make_mapping(pkm_index_row) if pkm_index_row else None
            )
            result.mappings.return_value = mappings_result

        elif "vault_keys" in sql:
            mappings_result = MagicMock()
            mappings_result.first.return_value = (
                _make_mapping(vault_row) if vault_row else None
            )
            result.mappings.return_value = mappings_result

        elif "vault_key_wrappers" in sql:
            result.scalar.return_value = vault_wrapper_count

        elif "pkm_manifests" in sql:
            mappings_result = MagicMock()
            mappings_result.all.return_value = [_make_mapping(r) for r in manifest_rows]
            result.mappings.return_value = mappings_result

        elif "pkm_scope_registry" in sql:
            mappings_result = MagicMock()
            mappings_result.all.return_value = [_make_mapping(r) for r in scope_rows]
            result.mappings.return_value = mappings_result

        return result

    conn = MagicMock()
    conn.execute.side_effect = _execute
    return conn


def _make_mapping(d: dict):
    """Return a MagicMock that supports dict-style key access."""
    m = MagicMock()
    m.__getitem__ = lambda self, k: d[k]
    m.get = lambda k, default=None: d.get(k, default)
    return m


@contextmanager
def _fake_db_connection(conn):
    yield conn


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_export_data_returns_success():
    service = AccountService()
    conn = _make_conn()

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        return_value=_fake_db_connection(conn),
    ):
        service._table_exists = lambda _conn, table: True
        result = await service.export_data(USER_ID)

    assert result["success"] is True
    assert "export" in result


@pytest.mark.asyncio
async def test_export_data_schema_version_is_1():
    service = AccountService()
    conn = _make_conn()

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        return_value=_fake_db_connection(conn),
    ):
        service._table_exists = lambda _conn, table: True
        result = await service.export_data(USER_ID)

    assert result["export"]["schema_version"] == 1


@pytest.mark.asyncio
async def test_export_data_includes_actor_profile():
    service = AccountService()
    conn = _make_conn()

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        return_value=_fake_db_connection(conn),
    ):
        service._table_exists = lambda _conn, table: True
        result = await service.export_data(USER_ID)

    profile = result["export"]["actor_profile"]
    assert profile is not None
    assert "investor" in profile["personas"]
    assert profile["last_active_persona"] == "investor"
    assert profile["investor_marketplace_opt_in"] is True


@pytest.mark.asyncio
async def test_export_data_includes_pkm_index():
    service = AccountService()
    conn = _make_conn()

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        return_value=_fake_db_connection(conn),
    ):
        service._table_exists = lambda _conn, table: True
        result = await service.export_data(USER_ID)

    pkm = result["export"]["pkm_index"]
    assert pkm is not None
    assert "financial" in pkm["available_domains"]
    assert pkm["total_attributes"] == 42
    assert pkm["model_version"] == 2


@pytest.mark.asyncio
async def test_export_data_vault_metadata_never_includes_raw_keys():
    """BYOK guarantee: vault_metadata must not contain any key bytes."""
    service = AccountService()
    conn = _make_conn()

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        return_value=_fake_db_connection(conn),
    ):
        service._table_exists = lambda _conn, table: True
        result = await service.export_data(USER_ID)

    vault = result["export"]["vault_metadata"]
    assert vault is not None
    assert vault["primary_method"] == "passkey"
    assert vault["wrapper_count"] == 2
    # Critically: no raw key material fields
    assert "vault_key_hash" not in vault
    assert "encrypted_vault_key" not in vault
    assert "recovery_encrypted_vault_key" not in vault
    assert "salt" not in vault
    assert "iv" not in vault


@pytest.mark.asyncio
async def test_export_data_includes_pkm_manifests():
    service = AccountService()
    conn = _make_conn()

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        return_value=_fake_db_connection(conn),
    ):
        service._table_exists = lambda _conn, table: True
        result = await service.export_data(USER_ID)

    manifests = result["export"]["pkm_manifests"]
    assert isinstance(manifests, list)
    assert len(manifests) == 1
    assert manifests[0]["domain"] == "financial"
    assert manifests[0]["path"] == "portfolio"
    assert manifests[0]["version"] == 3


@pytest.mark.asyncio
async def test_export_data_includes_pkm_scope_registry():
    service = AccountService()
    conn = _make_conn()

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        return_value=_fake_db_connection(conn),
    ):
        service._table_exists = lambda _conn, table: True
        result = await service.export_data(USER_ID)

    scopes = result["export"]["pkm_scope_registry"]
    assert isinstance(scopes, list)
    assert scopes[0]["scope"] == "attr.financial.*"


@pytest.mark.asyncio
async def test_export_data_skips_optional_tables_when_missing():
    """pkm_manifests and pkm_scope_registry are optional — skip if absent."""
    service = AccountService()
    conn = _make_conn(manifest_rows=[], scope_rows=[])

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        return_value=_fake_db_connection(conn),
    ):
        # Simulate optional tables not existing
        service._table_exists = lambda _conn, table: table not in (
            "pkm_manifests", "pkm_scope_registry"
        )
        result = await service.export_data(USER_ID)

    assert result["success"] is True
    assert result["export"]["pkm_manifests"] == []
    assert result["export"]["pkm_scope_registry"] == []


@pytest.mark.asyncio
async def test_export_data_handles_missing_actor_profile_gracefully():
    """User with no actor_profile row should still get a valid export."""
    service = AccountService()
    conn = _make_conn(actor_row=None)

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        return_value=_fake_db_connection(conn),
    ):
        service._table_exists = lambda _conn, table: True
        result = await service.export_data(USER_ID)

    assert result["success"] is True
    assert result["export"]["actor_profile"] is None


@pytest.mark.asyncio
async def test_export_data_returns_failure_on_db_error():
    """DB exception must be caught and returned as success=False."""
    service = AccountService()

    def _exploding_conn():
        raise RuntimeError("DB connection failed")

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        side_effect=_exploding_conn,
    ):
        result = await service.export_data(USER_ID)

    assert result["success"] is False
    assert "error" in result
    assert "DB connection failed" in result["error"]


@pytest.mark.asyncio
async def test_export_data_exported_at_is_iso8601_utc():
    """exported_at must be a valid ISO-8601 UTC timestamp."""
    service = AccountService()
    conn = _make_conn()

    with patch(
        "hushh_mcp.services.account_service.get_db_connection",
        return_value=_fake_db_connection(conn),
    ):
        service._table_exists = lambda _conn, table: True
        result = await service.export_data(USER_ID)

    exported_at = result["export"]["exported_at"]
    assert exported_at is not None
    # Must be parseable as ISO-8601
    parsed = datetime.fromisoformat(exported_at)
    assert parsed.tzinfo is not None  # must be timezone-aware