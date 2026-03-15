import { NextRequest } from "next/server";

import { getPythonApiUrl } from "@/app/api/_utils/backend";
import {
  createUpstreamHeaders,
  resolveRequestId,
  withRequestIdJson,
} from "@/app/api/_utils/request-id";

export const dynamic = "force-dynamic";

async function proxyRequest(
  request: NextRequest,
  params: { path: string[] },
  method: "GET" | "POST"
) {
  const requestId = resolveRequestId(request);
  const query = request.nextUrl.search;
  const path = params.path.join("/");
  const targetUrl = `${getPythonApiUrl()}/api/iam/${path}${query}`;

  const authHeader = request.headers.get("authorization") || "";
  const headers = createUpstreamHeaders(requestId, {
    ...(authHeader ? { Authorization: authHeader } : {}),
    ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
  });

  const body = method === "POST" ? JSON.stringify(await request.json().catch(() => ({}))) : undefined;

  try {
    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
    });
    const payload = await response
      .json()
      .catch(async () => ({ detail: await response.text().catch(() => "") }));

    return withRequestIdJson(requestId, payload, {
      status: response.status,
    });
  } catch (error) {
    console.error(`[IAM API] request_id=${requestId} proxy_error`, error);
    return withRequestIdJson(
      requestId,
      { error: "Failed to proxy IAM request" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, await params, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, await params, "POST");
}
