// app/api/vault/get/route.ts

/**
 * Get Vault Key Metadata API
 *
 * SYMMETRIC WITH NATIVE:
 * This route proxies to Python backend /db/vault/get
 * to maintain consistency with iOS/Android native plugins.
 *
 * Native (Swift/Kotlin): POST /db/vault/get -> Python
 * Web (Next.js): GET /api/vault/get -> Python (proxy)
 */

import { NextRequest } from "next/server";

import { getPythonApiUrl } from "@/app/api/_utils/backend";
import {
  createUpstreamHeaders,
  resolveRequestId,
  withRequestIdJson,
} from "@/app/api/_utils/request-id";
import { validateFirebaseToken } from "@/lib/auth/validate";
import { isDevelopment, logSecurityEvent } from "@/lib/config";

export const dynamic = "force-dynamic";

const PYTHON_API_URL = getPythonApiUrl();

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request);

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return withRequestIdJson(requestId, { error: "userId required" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");

  if (!authHeader && !isDevelopment()) {
    logSecurityEvent("VAULT_KEY_REJECTED", {
      reason: "No auth header",
      userId,
    });
    return withRequestIdJson(
      requestId,
      { error: "Authorization required", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  if (authHeader) {
    const validation = await validateFirebaseToken(authHeader);

    if (!validation.valid) {
      logSecurityEvent("VAULT_KEY_REJECTED", {
        reason: validation.error,
        userId,
      });
      return withRequestIdJson(
        requestId,
        {
          error: `Authentication failed: ${validation.error}`,
          code: "AUTH_INVALID",
        },
        { status: 401 }
      );
    }
  }

  try {
    const response = await fetch(`${PYTHON_API_URL}/db/vault/get`, {
      method: "POST",
      headers: createUpstreamHeaders(requestId, {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      }),
      body: JSON.stringify({ userId }),
    });

    if (response.status === 404) {
      return withRequestIdJson(requestId, { error: "Vault not found" }, { status: 404 });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[API] request_id=${requestId} vault_get backend_error status=${response.status}`,
        errorText
      );
      return withRequestIdJson(requestId, { error: "Backend error" }, { status: response.status });
    }

    const vault = await response.json();

    logSecurityEvent("VAULT_KEY_SUCCESS", { userId });
    return withRequestIdJson(requestId, vault);
  } catch (error) {
    console.error(`[API] request_id=${requestId} vault_get error:`, error);
    return withRequestIdJson(requestId, { error: "Failed to get vault" }, { status: 500 });
  }
}
