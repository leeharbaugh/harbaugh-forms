/**
 * Supervised in-person handoff exchange.
 *
 * Mirrors the Stage 4 `/sign/{token}` credential exchange: `/sign/in-person/
 * {rawHandoffToken}` is a server-only redirector that validates the handoff,
 * moves the token out of the URL into an HttpOnly cookie scoped to `/sign`, and
 * redirects to `/sign/continue` for identity affirmation. Nothing after this
 * response carries the token in a URL, so it cannot leak through browser
 * history, bookmarks, or a Referer header.
 *
 * Every failure — feature gate off, unknown, expired, consumed, revoked, or a
 * Signing that is not In Progress — returns a bare 404 so possession of a token
 * reveals nothing. The token is never logged.
 */
import { NextResponse } from "next/server";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import {
  buildSigningHandoffCookieAttributes,
  validateInPersonHandoff,
} from "@/lib/signing/in-person-handoff";
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

  // Validation only: the handoff is consumed at identity affirmation, so a
  // mis-click on the link does not burn the agent's handoff.
  const handoff = await validateInPersonHandoff(admin, token);
  if (!handoff) {
    return notFoundResponse();
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
    buildSigningHandoffCookieAttributes({ rawHandoffToken: token }),
  );
  return response;
}
