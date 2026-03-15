import { NextRequest } from "next/server";

import { getPythonApiUrl } from "@/app/api/_utils/backend";
import {
  createUpstreamHeaders,
  resolveRequestId,
  withRequestIdJson,
} from "@/app/api/_utils/request-id";
import { validateFirebaseToken } from "@/lib/auth/validate";
import { isDevelopment } from "@/lib/config";

export const dynamic = "force-dynamic";

const PYTHON_API_URL = getPythonApiUrl();

export async function POST(request: NextRequest) {
  const requestId = resolveRequestId(request);

  try {
    const body = (await request.json().catch(() => ({}))) as { userId?: string };
    const authHeader = request.headers.get("Authorization");

    if (!authHeader && !isDevelopment()) {
      return withRequestIdJson(
        requestId,
        { error: "Authorization required", code: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    if (authHeader) {
      const validation = await validateFirebaseToken(authHeader);
      if (!validation.valid && !isDevelopment()) {
        return withRequestIdJson(
          requestId,
          { error: `Authentication failed: ${validation.error}`, code: "AUTH_INVALID" },
          { status: 401 }
        );
      }
    }

    const response = await fetch(`${PYTHON_API_URL}/db/vault/bootstrap-state`, {
      method: "POST",
      headers: createUpstreamHeaders(requestId, {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      }),
      body: JSON.stringify({
        ...(body.userId ? { userId: body.userId } : {}),
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return withRequestIdJson(
        requestId,
        { error: payload?.error || payload?.detail || "Backend error" },
        { status: response.status }
      );
    }

    return withRequestIdJson(requestId, payload);
  } catch (error) {
    console.error(`[API] request_id=${requestId} vault_bootstrap_state error:`, error);
    return withRequestIdJson(requestId, { error: "Internal server error" }, { status: 500 });
  }
}
