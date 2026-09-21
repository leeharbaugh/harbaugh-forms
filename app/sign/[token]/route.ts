/**
 * Participant Signing entry exchange.
 *
 * `/sign/{rawCredentialToken}` is a server-only redirector: it validates the
 * bearer credential, mints a short-lived entry session, sets it as an HttpOnly
 * cookie scoped to `/sign`, and redirects to `/sign/continue`. Nothing after
 * this response carries the bearer in a URL, so it cannot leak through browser
 * history, bookmarks, or a Referer header.
 *
 * Failures return a generic unavailable message (no epoch/token leakage).
 * The token is never logged.
 */
import { NextResponse } from "next/server";
import { validateParticipantCredential } from "@/lib/signing/credentials";
import {
  buildSigningEntryCookieAttributes,
  createSigningEntrySession,
} from "@/lib/signing/entry-sessions";
import { SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE } from "@/lib/signing/external-access";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";

const CONTINUE_PATH = "/sign/continue";

function unavailableResponse(): NextResponse {
  return new NextResponse(SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE, {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  if (!isNativeSigningEnabled()) {
    return unavailableResponse();
  }

  const { token } = await context.params;
  const admin = createAdminClient();

  const credential = await validateParticipantCredential(admin, token);
  if (!credential) {
    return unavailableResponse();
  }

  let session;
  try {
    session = await createSigningEntrySession({ admin, credential });
  } catch {
    // Concurrent suspension/epoch bump between validate and mint must not
    // leak NOT_READY / suspension details via a 500.
    return unavailableResponse();
  }

  // A relative Location keeps the redirect independent of forwarded host
  // headers, so a spoofed Host cannot send the participant elsewhere.
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: CONTINUE_PATH,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
  response.cookies.set(
    buildSigningEntryCookieAttributes({
      rawSessionToken: session.rawSessionToken,
    }),
  );
  return response;
}
