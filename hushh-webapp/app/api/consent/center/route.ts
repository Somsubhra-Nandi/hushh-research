import { NextRequest } from "next/server";

import { getPythonApiUrl } from "@/app/api/_utils/backend";
import {
  createUpstreamHeaders,
  resolveRequestId,
  withRequestIdJson,
} from "@/app/api/_utils/request-id";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(request);
  const authHeader = request.headers.get("authorization") || "";
  const targetUrl = `${getPythonApiUrl()}/api/consent/center${request.nextUrl.search}`;

  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: createUpstreamHeaders(requestId, {
        ...(authHeader ? { Authorization: authHeader } : {}),
      }),
    });
    const payload = await response
      .json()
      .catch(async () => ({ detail: await response.text().catch(() => "") }));

    return withRequestIdJson(requestId, payload, { status: response.status });
  } catch (error) {
    console.error(`[CONSENT API] request_id=${requestId} center_proxy_error`, error);
    return withRequestIdJson(requestId, { error: "Failed to load consent center" }, { status: 500 });
  }
}
