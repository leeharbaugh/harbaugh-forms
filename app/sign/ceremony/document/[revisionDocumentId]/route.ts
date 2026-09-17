/**
 * Ceremony document bytes.
 *
 * Serves the exact immutable prepared PDF frozen by the participant's package
 * revision, mediated entirely by the server: the private `signing-artifacts`
 * bucket is never exposed to the browser, and no signed URL is issued.
 *
 * Authority is the ceremony browser session cookie, so no document bytes are
 * disclosed before "I am [Name]". Draft source snapshots are never served, and
 * bytes that no longer match their recorded fingerprint fail closed.
 *
 * Every failure is a bare 404.
 */
import { NextResponse } from "next/server";
import {
  requireCeremonyBrowserSession,
  SIGNING_CEREMONY_COOKIE_NAME,
} from "@/lib/signing/browser-sessions";
import { loadCeremonyDocumentBytes } from "@/lib/signing/ceremony-documents";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";

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
  context: { params: Promise<{ revisionDocumentId: string }> },
): Promise<NextResponse> {
  if (!isNativeSigningEnabled()) {
    return notFoundResponse();
  }

  const cookieStore = await cookies();
  const rawSessionToken = cookieStore.get(SIGNING_CEREMONY_COOKIE_NAME)?.value;
  if (!rawSessionToken) {
    return notFoundResponse();
  }

  const { revisionDocumentId } = await context.params;
  const admin = createAdminClient();

  try {
    const session = await requireCeremonyBrowserSession(admin, rawSessionToken);
    const document = await loadCeremonyDocumentBytes({
      admin,
      session,
      revisionDocumentId,
    });

    return new NextResponse(Buffer.from(document.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(document.bytes.byteLength),
        "Content-Disposition": `inline; filename="${document.filename.replace(/[^\w.\- ]+/g, "_")}"`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    // Ceremony failures are not disclosed to the participant here; the ceremony
    // page reports session state. Never log a session token.
    if (error instanceof Error && error.message) {
      console.error(
        "[native-signing-ceremony] document request failed:",
        error.message,
      );
    }
    return notFoundResponse();
  }
}
