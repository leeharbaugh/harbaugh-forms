/**
 * Manager Draft Signing preview PDF bytes.
 *
 * Serves an in-memory render of the document's selected Draft source snapshot
 * (the same source activation would consume). Never creates package revisions,
 * signing_document_versions, credentials, or delivery work. Private
 * signing-artifacts storage is never exposed to the browser.
 */
import { NextResponse } from "next/server";
import { requireSigningActor } from "@/lib/signing/actor";
import { SigningError } from "@/lib/signing/errors";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { loadDraftPreviewDocumentBytes } from "@/lib/signing/preview";
import { createAdminClient } from "@/lib/supabase/admin";

function notFoundResponse(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function forbiddenResponse(): NextResponse {
  return new NextResponse("Forbidden", {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ signingId: string; documentId: string }>;
  },
): Promise<NextResponse> {
  if (!isNativeSigningEnabled()) {
    return notFoundResponse();
  }

  const { signingId, documentId } = await context.params;

  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const document = await loadDraftPreviewDocumentBytes({
      actor,
      signingId,
      signingDocumentId: documentId,
      admin,
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
    if (error instanceof SigningError) {
      if (error.code === "FORBIDDEN") return forbiddenResponse();
      if (error.code === "UNAUTHENTICATED") {
        return new NextResponse("Unauthorized", {
          status: 401,
          headers: {
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
      return notFoundResponse();
    }
    if (error instanceof Error && error.message) {
      console.error(
        "[native-signing-preview] document request failed:",
        error.message,
      );
    }
    return notFoundResponse();
  }
}
