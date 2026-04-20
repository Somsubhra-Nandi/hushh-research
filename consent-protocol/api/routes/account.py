# consent-protocol/api/routes/account.py
"""
Account API Routes
==================

Endpoints for account lifecycle management.

Routes:
    DELETE /api/account/delete - Delete account and all data
    GET    /api/account/export - Export all user data as a portable bundle

Security:
    ALL routes require VAULT_OWNER token.
"""

import logging
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

from api.middleware import require_vault_owner_token
from hushh_mcp.services.account_service import AccountService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["Account"])


class DeleteAccountRequest(BaseModel):
    target: Literal["investor", "ria", "both"] = Field(
        default="both",
        description="Delete only the investor persona, only the RIA persona, or the full account.",
    )


@router.delete("/delete")
async def delete_account(
    payload: DeleteAccountRequest | None = Body(default=None),
    token_data: dict = Depends(require_vault_owner_token),
):
    """
    Delete logged-in user's account and ALL data.

    Requires VAULT_OWNER token (Unlock to Delete).
    This action is irreversible.
    """
    user_id = token_data["user_id"]
    target = payload.target if payload else "both"
    logger.warning("⚠️ DELETE ACCOUNT REQUESTED for user %s target=%s", user_id, target)

    service = AccountService()
    result = await service.delete_account(user_id, target=target)

    if not result["success"]:
        raise HTTPException(status_code=500, detail=f"Deletion failed: {result.get('error')}")

    return result


@router.get("/export")
async def export_account_data(
    token_data: dict = Depends(require_vault_owner_token),
):
    """
    Export all data for the logged-in user as a portable JSON bundle.

    Requires VAULT_OWNER token (vault must be unlocked to export).

    BYOK guarantee: raw vault key material is NEVER included in the export.
    Only safe metadata is returned (key method, wrapper count, timestamps).

    Returns a JSON object with:
    - schema_version: export format version
    - exported_at: ISO-8601 UTC timestamp
    - actor_profile: persona state and marketplace opt-in
    - pkm_index: queryable metadata (domains, tags, activity score)
    - vault_metadata: key protection method and wrapper count (no raw keys)
    - pkm_manifests: domain manifest entries (path/version metadata)
    - pkm_scope_registry: consent scope registrations
    """
    user_id = token_data["user_id"]
    logger.info("📦 Data export requested for user %s", user_id)

    service = AccountService()
    result = await service.export_data(user_id)

    if not result["success"]:
        raise HTTPException(status_code=500, detail=f"Export failed: {result.get('error')}")

    return result["export"]