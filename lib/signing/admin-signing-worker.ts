/**
 * Global Admin Signing worker sweep (system ops — not business Signing authority).
 */
import "server-only";

import { assertAdminActionRateLimit } from "@/lib/admin/rate-limit";
import { requireAppAdmin } from "@/lib/admin/require-app-admin";
import { recordAuditEvent } from "@/lib/audit/record";
import {
  processSigningWorkBatch,
  SIGNING_CRON_WORKER_BATCH_LIMIT,
} from "@/lib/signing/signing-worker-dispatch";
import { createAdminClient } from "@/lib/supabase/admin";

export type SigningWorkerQueueSnapshot = {
  pendingCount: number;
  failedCount: number;
  processingCount: number;
  oldestPendingAt: string | null;
  oldestPendingAgeSeconds: number | null;
};

export async function getSigningWorkerQueueSnapshot(
  admin = createAdminClient(),
): Promise<SigningWorkerQueueSnapshot> {
  const { data: rows, error } = await admin
    .from("signing_work_items")
    .select("processing_state, next_attempt_at, create_date")
    .in("processing_state", ["PENDING", "FAILED", "PROCESSING"]);
  if (error) throw new Error(error.message);

  let pendingCount = 0;
  let failedCount = 0;
  let processingCount = 0;
  let oldestPendingAt: string | null = null;

  for (const row of rows ?? []) {
    const state = String(row.processing_state ?? "");
    if (state === "PENDING") pendingCount += 1;
    else if (state === "FAILED") failedCount += 1;
    else if (state === "PROCESSING") processingCount += 1;

    if (state === "PENDING" || state === "FAILED") {
      const stamp = String(
        row.next_attempt_at ?? row.create_date ?? "",
      );
      if (
        stamp &&
        (!oldestPendingAt || Date.parse(stamp) < Date.parse(oldestPendingAt))
      ) {
        oldestPendingAt = stamp;
      }
    }
  }

  const oldestPendingAgeSeconds =
    oldestPendingAt != null && Number.isFinite(Date.parse(oldestPendingAt))
      ? Math.max(0, Math.floor((Date.now() - Date.parse(oldestPendingAt)) / 1000))
      : null;

  return {
    pendingCount,
    failedCount,
    processingCount,
    oldestPendingAt,
    oldestPendingAgeSeconds,
  };
}

export type ManualSigningWorkerRunResult = {
  ok: boolean;
  error?: string;
  status?: string;
  processedCount?: number;
  workTypes?: string[];
  detail?: string | null;
  queue?: SigningWorkerQueueSnapshot;
};

export async function runSigningWorkerNowWithAppAdmin(): Promise<ManualSigningWorkerRunResult> {
  const actor = await requireAppAdmin();
  const rate = assertAdminActionRateLimit({
    actorUserId: actor.userId,
    action: "signing_worker_manual_run",
    maxPerWindow: 12,
    minIntervalMs: 2_000,
  });
  if (!rate.ok) {
    return { ok: false, error: rate.error };
  }

  const admin = createAdminClient();
  const result = await processSigningWorkBatch({
    admin,
    limit: SIGNING_CRON_WORKER_BATCH_LIMIT,
    secretOk: true,
  });

  const queue = await getSigningWorkerQueueSnapshot(admin).catch(() => null);

  await recordAuditEvent({
    actorUserId: actor.userId,
    actorDisplayName:
      actor.profile.display_name ?? actor.email ?? actor.userId,
    actorRoleSnapshot: "ADMIN",
    eventCategory: "security",
    action: "signing_worker_manual_run",
    targetEntityType: "signing_work_items",
    summary: "Global Admin ran Native Signing worker sweep",
    metadata: {
      status: result.status,
      processedCount: result.processed.length,
      workTypes: result.processed.map((item) =>
        typeof item.workType === "string" ? item.workType : "UNKNOWN",
      ),
      detail: result.detail ?? null,
    },
    mandatory: true,
    success:
      result.status === "OK" ||
      result.status === "FEATURE_DISABLED" ||
      result.status === "SUSPENDED",
  });

  return {
    ok: true,
    status: result.status,
    processedCount: result.processed.length,
    workTypes: result.processed.map((item) =>
      typeof item.workType === "string" ? item.workType : "UNKNOWN",
    ),
    detail: result.detail ?? null,
    queue: queue ?? undefined,
  };
}
