/**
 * Participant entry exchange: POST { publicId, secret } → HttpOnly entry cookie.
 * GET with a bearer in the path is no longer accepted for authentication.
 */
import { NextResponse } from "next/server";
import {
  SIGNING_CONTINUE_PATH,
  SIGNING_ENTRY_EXCHANGE_PATH,
} from "@/lib/signing/bearer-transport";
import { validateParticipantCredentialByPublicIdAndSecret } from "@/lib/signing/credentials";
import {
  buildSigningEntryCookieAttributes,
  createSigningEntrySession,
} from "@/lib/signing/entry-sessions";
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

  const publicId = body.publicId;
  const secret = body.secret;
  const admin = createAdminClient();
  const credential = await validateParticipantCredentialByPublicIdAndSecret(
    admin,
    publicId,
    secret,
  );
  if (!credential) {
    return exchangeUnavailableJson();
  }

  let session;
  try {
    session = await createSigningEntrySession({ admin, credential });
  } catch {
    return exchangeUnavailableJson();
  }

  const response = NextResponse.json(
    { ok: true, redirectTo: SIGNING_CONTINUE_PATH },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
  response.cookies.set(
    buildSigningEntryCookieAttributes({
      rawSessionToken: session.rawSessionToken,
    }),
  );
  return response;
}

export async function GET(): Promise<Response> {
  return methodNotAllowed();
}

// Satisfy tooling that looks for the path constant.
void SIGNING_ENTRY_EXCHANGE_PATH;
