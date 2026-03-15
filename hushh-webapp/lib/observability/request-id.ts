export const REQUEST_ID_HEADER = "x-request-id";

const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_.:-]{8,128}$/;

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function extractHeaderValue(
  headers: Headers | HeadersInit | null | undefined,
  key: string
): string | null {
  if (!headers) return null;

  if (headers instanceof Headers) {
    return headers.get(key);
  }

  if (Array.isArray(headers)) {
    for (const [name, value] of headers) {
      if (String(name).toLowerCase() === key.toLowerCase()) {
        return String(value);
      }
    }
    return null;
  }

  const record = headers as Record<string, string | number | boolean | undefined>;
  for (const [name, value] of Object.entries(record)) {
    if (name.toLowerCase() === key.toLowerCase()) {
      return value === undefined ? null : String(value);
    }
  }
  return null;
}

export function sanitizeRequestId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (!SAFE_REQUEST_ID_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function getOrCreateRequestId(
  headers: Headers | HeadersInit | null | undefined
): string {
  const fromHeader = sanitizeRequestId(extractHeaderValue(headers, REQUEST_ID_HEADER));
  return fromHeader || createRequestId();
}
