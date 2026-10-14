/**
 * Blank form PDF for the Signing placement template editor. Served only to a
 * user who may read the template, and only for the template's exact Form
 * version. Form storage is never exposed to the browser directly.
 */
import { NextResponse } from "next/server";
import { requireSigningActor } from "@/lib/signing/actor";
import { SigningError } from "@/lib/signing/errors";
import { isNativeSigningEnabled } from "@/lib/signing/feature-gate";
import { loadPlacementTemplatePdfWithActor } from "@/lib/signing/placement-templates";
import { createAdminClient } from "@/lib/supabase/admin";

const BASE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; templateId: string }> },
): Promise<NextResponse> {
  if (!isNativeSigningEnabled()) {
    return new NextResponse("Not Found", { status: 404, headers: BASE_HEADERS });
  }
  const { id, templateId } = await context.params;

  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const pdf = await loadPlacementTemplatePdfWithActor(
      actor,
      { formId: id, templateId },
      admin,
    );
    return new NextResponse(Buffer.from(pdf.bytes), {
      status: 200,
      headers: {
        ...BASE_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.bytes.byteLength),
        "Content-Disposition": `inline; filename="${pdf.filename.replace(/[^\w.\- ]+/g, "_")}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    if (error instanceof SigningError && error.code === "UNAUTHENTICATED") {
      return new NextResponse("Unauthorized", { status: 401, headers: BASE_HEADERS });
    }
    if (error instanceof Error && !(error instanceof SigningError) && error.message) {
      console.error("[signing-placement-templates] pdf request failed:", error.message);
    }
    return new NextResponse("Not Found", { status: 404, headers: BASE_HEADERS });
  }
}
