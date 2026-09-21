/**
 * Internal Signing worker endpoint. POST only.
 * Requires header x-signing-worker-secret === SIGNING_WORKER_SECRET.
 * No browser auth path.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_SIGNING_WORKER_BATCH_LIMIT,
  processSigningWorkBatch,
  SIGNING_WORKER_SECRET_HEADER,
  verifySigningWorkerSecret,
} from "@/lib/signing/signing-worker-dispatch";
import { NextResponse } from "next/server";

function deny(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const secretHeader = request.headers.get(SIGNING_WORKER_SECRET_HEADER);
  if (!verifySigningWorkerSecret(secretHeader)) {
    return deny();
  }

  let limit = DEFAULT_SIGNING_WORKER_BATCH_LIMIT;
  try {
    const body = (await request.json().catch(() => null)) as {
      limit?: unknown;
    } | null;
    if (
      body &&
      typeof body.limit === "number" &&
      Number.isFinite(body.limit) &&
      body.limit >= 1
    ) {
      limit = Math.min(Math.floor(body.limit), 25);
    }
  } catch {
    // default limit
  }

  const admin = createAdminClient();
  const result = await processSigningWorkBatch({
    admin,
    limit,
    secretOk: true,
  });

  const status =
    result.status === "DENIED"
      ? 401
      : result.status === "SUSPENDED" || result.status === "FEATURE_DISABLED"
        ? 503
        : 200;

  return NextResponse.json(result, { status });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
