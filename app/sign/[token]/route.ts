/**
 * Participant Signing entry exchange.
 *
 * `/sign/{rawCredentialToken}` is a server-only redirector: it validates the
 * bearer credential, mints a short-lived entry session, sets it as an HttpOnly
 * cookie scoped to `/sign`, and redirects to `/sign/continue`. Nothing after
 * this response carries the bearer in a URL, so it cannot leak through browser
 * history, bookmarks, or a Referer header.
 *
 * Every failure — feature gate off, unknown, revoked, superseded, or a Signing
 * that is not In Progress — returns a bare 404 so possession of a token reveals
 * nothing. The token is never logged.
 */
import { NextResponse } from "next/server";
import { validateParticipantCredential } from "@/lib/signing/credentials";
import {
  buildSigningEntryCookieAttributes,
  createSigningEntrySession,
} from "@/lib/signing/entry-sessions";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";

const CONTINUE_PATH = "/sign/continue";

function notFoundResponse(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  if (!isNativeSigningEnabled()) {
    return notFoundResponse();
  }

  const { token } = await context.params;
  const admin = createAdminClient();

  const credential = await validateParticipantCredential(admin, token);
  if (!credential) {
    return notFoundResponse();
  }

  const session = await createSigningEntrySession({ admin, credential });

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
