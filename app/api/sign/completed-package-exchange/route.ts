/**
 * Completed-package exchange: POST { publicId, secret } → HttpOnly package cookie.
 */
import { NextResponse } from "next/server";
import { appendCompletedPackageAccessLog } from "@/lib/signing/completed-package-access";
import { validateCompletedPackageCredentialByPublicIdAndSecret } from "@/lib/signing/completed-package-credentials";
import {
  buildCompletedPackageCookieAttributes,
  createCompletedPackageSession,
} from "@/lib/signing/completed-package-sessions";
import {
  SIGNING_COMPLETED_PACKAGE_EXCHANGE_PATH,
  SIGNING_PACKAGE_PATH,
} from "@/lib/signing/bearer-transport";
import {
  assertExchangeRequestShape,
  exchangeUnavailableJson,
  methodNotAllowed,
  readExchangeJsonBody,
} from "@/lib/signing/exchange-request";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request): Promise<Response> {
  if (!isNativeSigningEnabled()) {
    return exchangeUnavailableJson();
  }
  if (!assertExchangeRequestShape(request)) {
    return exchangeUnavailableJson();
  }

  const body = await readExchangeJsonBody(request);
  if (!body) {
    return exchangeUnavailableJson();
  }

  const admin = createAdminClient();
  const credential =
    await validateCompletedPackageCredentialByPublicIdAndSecret(
      admin,
      body.publicId,
      body.secret,
    );
  if (!credential) {
    return exchangeUnavailableJson();
  }

  let session;
  try {
    session = await createCompletedPackageSession({ admin, credential });
  } catch {
    return exchangeUnavailableJson();
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

  const response = NextResponse.json(
    { ok: true, redirectTo: SIGNING_PACKAGE_PATH },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
  response.cookies.set(
    buildCompletedPackageCookieAttributes({
      rawSessionToken: session.rawSessionToken,
    }),
  );
  return response;
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

void SIGNING_COMPLETED_PACKAGE_EXCHANGE_PATH;
