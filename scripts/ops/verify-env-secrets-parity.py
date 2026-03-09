#!/usr/bin/env python3
"""Verify required Secret Manager keys exist for backend/frontend deploy parity.

This script intentionally performs a strict existence check only. It does not
read secret values.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from typing import Iterable

BACKEND_REQUIRED = (
    "SECRET_KEY",
    "VAULT_ENCRYPTION_KEY",
    "GOOGLE_API_KEY",
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON",
    "FRONTEND_URL",
    "DB_USER",
    "DB_PASSWORD",
    "APP_REVIEW_MODE",
    "REVIEWER_UID",
    "MCP_DEVELOPER_TOKEN",
)

FRONTEND_REQUIRED = (
    "BACKEND_URL",
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_AUTH_SERVICE_ACCOUNT_JSON",
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_VAPID_KEY",
    "NEXT_PUBLIC_AUTH_FIREBASE_API_KEY",
    "NEXT_PUBLIC_AUTH_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_AUTH_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_AUTH_FIREBASE_APP_ID",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_STAGING",
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID_PRODUCTION",
    "NEXT_PUBLIC_GTM_ID_STAGING",
    "NEXT_PUBLIC_GTM_ID_PRODUCTION",
)

NATIVE_RELEASE_REQUIRED = (
    "IOS_GOOGLESERVICE_INFO_PLIST_B64",
    "ANDROID_GOOGLE_SERVICES_JSON_B64",
)


def _has_secret(project: str, name: str) -> bool:
    cmd = [
        "gcloud",
        "secrets",
        "describe",
        name,
        "--project",
        project,
        "--format=value(name)",
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    return result.returncode == 0 and bool(result.stdout.strip())


def _format_names(names: Iterable[str]) -> str:
    return ", ".join(sorted(names))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify required GCP Secret Manager keys for deploy parity."
    )
    parser.add_argument("--project", required=True, help="GCP project id")
    parser.add_argument("--region", default="us-central1", help="Reserved for parity interface")
    parser.add_argument(
        "--backend-service",
        default="consent-protocol",
        help="Reserved for parity interface",
    )
    parser.add_argument(
        "--frontend-service",
        default="hushh-webapp",
        help="Reserved for parity interface",
    )
    parser.add_argument(
        "--require-native-artifacts",
        action="store_true",
        help="Also require native Firebase artifact secrets for native release checks.",
    )
    args = parser.parse_args()

    del args.region, args.backend_service, args.frontend_service

    required = list(BACKEND_REQUIRED + FRONTEND_REQUIRED)
    if args.require_native_artifacts:
        required.extend(NATIVE_RELEASE_REQUIRED)
    required = tuple(dict.fromkeys(required))
    missing = [name for name in required if not _has_secret(args.project, name)]

    print(f"Project: {args.project}")
    print(f"Required backend secrets ({len(BACKEND_REQUIRED)}): {_format_names(BACKEND_REQUIRED)}")
    print(f"Required frontend secrets ({len(FRONTEND_REQUIRED)}): {_format_names(FRONTEND_REQUIRED)}")
    if args.require_native_artifacts:
        print(
            "Required native release secrets "
            f"({len(NATIVE_RELEASE_REQUIRED)}): {_format_names(NATIVE_RELEASE_REQUIRED)}"
        )

    if missing:
        print(f"Missing secrets ({len(missing)}): {_format_names(missing)}")
        return 1

    print(f"All required secrets present ({len(required)}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
