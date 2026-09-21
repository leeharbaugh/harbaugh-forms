/**
 * Completed-package bearer exchange.
 *
 * `/sign/completed/{rawToken}` validates the completed-package credential,
 * mints a short-lived package session cookie scoped to `/sign/package`, and
 * redirects to `/sign/package`. Failures use a generic unavailable message.
 * The token is never logged.
 */
import { NextResponse } from "next/server";
import { appendCompletedPackageAccessLog } from "@/lib/signing/completed-package-access";
import { validateCompletedPackageCredential } from "@/lib/signing/completed-package-credentials";
import {
  buildCompletedPackageCookieAttributes,
  createCompletedPackageSession,
} from "@/lib/signing/completed-package-sessions";
import { SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE } from "@/lib/signing/external-access";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";

const PACKAGE_PATH = "/sign/package";

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

  const credential = await validateCompletedPackageCredential(admin, token);
  if (!credential) {
    return unavailableResponse();
  }

  let session;
  try {
    session = await createCompletedPackageSession({ admin, credential });
  } catch {
    // Concurrent suspension/epoch bump between validate and mint must not
    // leak NOT_READY / suspension details via a 500.
    return unavailableResponse();
  }

  try {
    await appendCompletedPackageAccessLog({
      admin,
      signingId: credential.signingId,
      accessKind: "PACKAGE_SESSION_OPENED",
      outcome: "SUCCEEDED",
      completedPackageCredentialId: credential.credentialId,
      completedPackageSessionId: session.sessionId,
      signingParticipantId: credential.signingParticipantId,
      signingCopyRecipientId: credential.signingCopyRecipientId,
    });
  } catch (error) {
    console.error(
      "[native-signing-completion-delivery] access log failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: PACKAGE_PATH,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
  response.cookies.set(
    buildCompletedPackageCookieAttributes({
      rawSessionToken: session.rawSessionToken,
    }),
  );
  return response;
}
