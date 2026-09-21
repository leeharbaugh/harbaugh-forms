/**
 * Shared helpers for fragment-secret POST exchange endpoints.
 * Never log secrets or publicId+secret pairs.
 */
import { SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE } from "@/lib/signing/external-access";

export const MAX_EXCHANGE_BODY_BYTES = 4_096;

export function exchangeUnavailableJson(): Response {
  return Response.json(
    { ok: false, error: SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

export function methodNotAllowed(): Response {
  return Response.json(
    { ok: false, error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

/**
 * Require JSON content-type and same-origin style requests for cookie minting.
 * Bearer possession is the authenticator; this reduces casual cross-site POST.
 */
export function assertExchangeRequestShape(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return false;
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const requestUrl = new URL(request.url);
      const originUrl = new URL(origin);
      if (originUrl.host !== requestUrl.host) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

export async function readExchangeJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > MAX_EXCHANGE_BODY_BYTES) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
