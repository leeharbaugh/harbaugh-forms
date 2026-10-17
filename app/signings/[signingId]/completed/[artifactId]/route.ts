/**
 * Manager View / Download of one immutable completed Signing artifact.
 *
 * View (`inline`) and Download (`?download=1`, `attachment`) return the same
 * verified bytes. The browser supplies only the Signing id and an opaque
 * artifact id; authority and the artifact's Signing binding are resolved on
 * the server before any service-role read. Storage is never exposed.
 */
import { NextResponse } from "next/server";
import { requireSigningActor } from "@/lib/signing/actor";
import {
  completedArtifactContentDisposition,
  loadCompletedArtifactForActor,
} from "@/lib/signing/completed-documents";
import { SigningError } from "@/lib/signing/errors";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

function textResponse(status: number, body: string): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ signingId: string; artifactId: string }> },
): Promise<NextResponse> {
  if (!isNativeSigningEnabled()) return textResponse(404, "Not Found");

  const { signingId, artifactId } = await context.params;
  const download = new URL(request.url).searchParams.get("download") === "1";

  try {
    const actor = await requireSigningActor();
    const artifact = await loadCompletedArtifactForActor({
      actor,
      signingId,
      artifactId,
      admin: createAdminClient(),
    });
    return new NextResponse(Buffer.from(artifact.bytes), {
      status: 200,
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Length": String(artifact.bytes.byteLength),
        "Content-Disposition": completedArtifactContentDisposition(
          download ? "attachment" : "inline",
          artifact.filename,
        ),
        "X-Signing-Artifact-SHA256": artifact.sha256,
      },
    });
  } catch (error) {
    if (error instanceof SigningError) {
      if (error.code === "UNAUTHENTICATED") return textResponse(401, "Unauthorized");
      if (error.code === "INTEGRITY_MISMATCH") {
        console.error("[native-signing-completed-documents] integrity check failed");
        return textResponse(409, error.message);
      }
      return textResponse(404, "Not Found");
    }
    console.error(
      "[native-signing-completed-documents] request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return textResponse(404, "Not Found");
  }
}
