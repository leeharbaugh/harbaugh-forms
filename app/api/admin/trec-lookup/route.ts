import { NextResponse } from "next/server";
import {
  AdminAuthorizationError,
  requireAppAdmin,
} from "@/lib/admin/require-app-admin";
import { recordAuditEvent } from "@/lib/audit/record";
import { lookupTrecLicenses } from "@/lib/trec/lookup";
import type { TrecLicenseTypeCode } from "@/lib/trec/normalize";

type Body = {
  licenseNumber?: string;
  fullName?: string;
  licenseTypes?: TrecLicenseTypeCode[];
  limit?: number;
};

export async function POST(request: Request) {
  try {
    const actor = await requireAppAdmin();
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    await recordAuditEvent({
      actorUserId: actor.userId,
      actorDisplayName: actor.profile.display_name,
      actorRoleSnapshot: "ADMIN",
      eventCategory: "trec",
      action: "trec_lookup_submitted",
      summary: "TREC license lookup submitted via API.",
      metadata: {
        hasLicenseNumber: Boolean(body.licenseNumber?.trim()),
        hasName: Boolean(body.fullName?.trim()),
      },
    });

    const result = await lookupTrecLicenses({
      licenseNumber: body.licenseNumber,
      fullName: body.fullName,
      licenseTypes: body.licenseTypes,
      limit: body.limit,
    });

    if (!result.ok) {
      await recordAuditEvent({
        actorUserId: actor.userId,
        eventCategory: "trec",
        action: "trec_lookup_failed",
        summary: result.error,
        success: false,
        failureClassification: result.code,
      });
      return NextResponse.json(result, { status: 200 });
    }

    await recordAuditEvent({
      actorUserId: actor.userId,
      eventCategory: "trec",
      action:
        result.candidates.length === 0
          ? "no_trec_match_found"
          : "trec_lookup_succeeded",
      summary:
        result.candidates.length === 0
          ? "No TREC matches found."
          : `TREC lookup returned ${result.candidates.length} candidate(s).`,
      metadata: { candidateCount: result.candidates.length },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      const status =
        error.code === "UNAUTHENTICATED"
          ? 401
          : error.code === "INACTIVE"
            ? 403
            : 403;
      return NextResponse.json(
        { ok: false, error: error.message },
        { status },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected error.",
      },
      { status: 500 },
    );
  }
}
