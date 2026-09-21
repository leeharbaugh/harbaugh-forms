/**
 * Supervised in-person handoff exchange (path-bearer residual).
 *
 * Unlike emailed invitation/package links (UUID path + fragment secret + POST
 * exchange), device handoff still uses `/sign/in-person/{rawHandoffToken}` as a
 * server-only redirector: validate handoff → HttpOnly cookie scoped to `/sign`
 * → `/sign/continue`. Tokens are agent-issued for supervised device handoff
 * (not emailed), TTL-bounded (~15 min), epoch-bound, superseded on reissue, and
 * consumed at identity affirmation — accepted residual vs emailed long-lived
 * credentials (see decisions.md / security.md R14).
 *
 * Failures return a generic unavailable message. The token is never logged.
 */
import { NextResponse } from "next/server";
import { SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE } from "@/lib/signing/external-access";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import {
  buildSigningHandoffCookieAttributes,
  validateInPersonHandoff,
} from "@/lib/signing/in-person-handoff";
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

  // Validation only: the handoff is consumed at identity affirmation, so a
  // mis-click on the link does not burn the agent's handoff.
  const handoff = await validateInPersonHandoff(admin, token);
  if (!handoff) {
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
    buildSigningHandoffCookieAttributes({ rawHandoffToken: token }),
  );
  return response;
}
