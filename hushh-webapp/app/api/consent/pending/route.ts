// app/api/consent/pending/route.ts

/**
 * Get Pending Consent Requests API
 *
 * Proxies to Python backend to get pending consent requests for a user.
 * Requires VAULT_OWNER token for authentication (consent-first architecture).
 */

import { NextRequest } from "next/server";

import { getPythonApiUrl } from "@/app/api/_utils/backend";
import {
  createUpstreamHeaders,
  resolveRequestId,
  withRequestIdJson,
} from "@/app/api/_utils/request-id";

const BACKEND_URL = getPythonApiUrl();

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request);

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return withRequestIdJson(requestId, { error: "userId is required" }, { status: 400 });
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return withRequestIdJson(
        requestId,
        { error: "Authorization header required" },
        { status: 401 }
      );
    }

    console.log(`[API] request_id=${requestId} pending_consents user_id_present=true`);

    const response = await fetch(
      `${BACKEND_URL}/api/consent/pending?userId=${encodeURIComponent(userId)}`,
      {
        method: "GET",
        headers: createUpstreamHeaders(requestId, {
          "Content-Type": "application/json",
          Authorization: authHeader,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(
        `[API] request_id=${requestId} pending_consents backend_error status=${response.status}`,
        error
      );
      return withRequestIdJson(
        requestId,
        { error: "Failed to fetch pending consents" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return withRequestIdJson(requestId, data);
  } catch (error) {
    console.error(`[API] request_id=${requestId} pending_consents error:`, error);
    return withRequestIdJson(requestId, { error: "Internal server error" }, { status: 500 });
  }
}
