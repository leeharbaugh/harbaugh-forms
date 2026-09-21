/**
 * Request-driven Signing worker kick.
 *
 * Durable work items remain authoritative. Cron is a recovery/sweep schedule.
 * After enqueue points (Finish → FINALIZE, completed-package delivery, retry),
 * schedule the same bounded batch processor so Hobby daily Cron is not the
 * sole latency path.
 *
 * Uses Next.js `after()` so participant/manager responses are not blocked by
 * PDF/email work. `after()` is not durable: if the continuation fails, queued
 * work remains for Cron/manual worker. Never logs secrets.
 */
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processSigningWorkBatch } from "./signing-worker-dispatch";

/** Request-driven kick may need more slots than daily Cron sweep (finalize→combined→deliveries). */
export const SIGNING_WORKER_KICK_BATCH_LIMIT = 10;

export function kickSigningWorkProcessing(options: {
  admin: SupabaseClient;
  signingId?: string;
  limit?: number;
}): void {
  const limit = Math.min(
    Math.max(options.limit ?? SIGNING_WORKER_KICK_BATCH_LIMIT, 1),
    25,
  );
  const admin = options.admin;
  const signingId = options.signingId;

  const run = async () => {
    try {
      await processSigningWorkBatch({
        admin,
        limit,
        secretOk: true,
        signingId,
      });
    } catch (error) {
      // Best-effort kick only. Durable queue + Cron remain authoritative.
      console.error(
        "[native-signing-worker-kick] processing failed:",
        error instanceof Error ? error.message : "unknown error",
      );
    }
  };

  try {
    after(() => {
      void run();
    });
  } catch {
    // Outside a Next.js request context (some scripts/tests), run inline.
    void run();
  }
}
