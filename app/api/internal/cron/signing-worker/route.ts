/**
 * Vercel Cron adapter for Native Signing worker batch.
 *
 * GET only. Authenticates via Authorization: Bearer CRON_SECRET.
 * Invokes processSigningWorkBatch with a fixed bounded batch size.
 * Does not accept Signing IDs or work-type overrides.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCronAuthorization } from "@/lib/signing/cron-auth";
import {
  processSigningWorkBatch,
  SIGNING_CRON_WORKER_BATCH_LIMIT,
} from "@/lib/signing/signing-worker-dispatch";
import { NextResponse } from "next/server";

function deny(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!verifyCronAuthorization(request.headers.get("authorization"))) {
    return deny();
  }

  const admin = createAdminClient();
  const result = await processSigningWorkBatch({
    admin,
    limit: SIGNING_CRON_WORKER_BATCH_LIMIT,
    secretOk: true,
  });

  const status =
    result.status === "DENIED"
      ? 401
      : result.status === "SUSPENDED" || result.status === "FEATURE_DISABLED"
        ? 503
        : 200;

  // Safe operational summary only — no secrets, tokens, or raw email bodies.
  return NextResponse.json(
    {
      status: result.status,
      processedCount: result.processed.length,
      workTypes: result.processed.map((item) =>
        typeof item.workType === "string" ? item.workType : "UNKNOWN",
      ),
      detail: result.detail ?? null,
    },
    { status },
  );
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
