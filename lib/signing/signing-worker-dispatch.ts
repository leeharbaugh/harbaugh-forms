/**
 * Internal Signing worker batch dispatch.
 *
 * Requires a shared worker secret (constant-time compare). Honors:
 * - Native Signing feature gate (FEATURE_DISABLED — queue unchanged)
 * - recovery-safe work suspension (SUSPENDED — queue unchanged)
 *
 * Access suspension is enforced inside invitation/completed-package handlers.
 */
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FINALIZE_SIGNING_WORK_TYPE } from "./ceremony-finish";
import {
  processNextCompletedPackageDeliveryWorkItem,
  DELIVER_COMPLETED_PACKAGE_WORK_TYPE,
} from "./completed-package-delivery";
import {
  PARTICIPANT_INVITATION_WORK_TYPE,
  processParticipantInvitationWorkItem,
} from "./delivery";
import {
  GENERATE_COMBINED_PACKAGE_WORK_TYPE,
  processNextCombinedPackageWorkItem,
  processNextFinalizationWorkItem,
  type FinalizationWorkerResult,
} from "./finalization-worker";
import { isNativeSigningEnabled } from "./feature-gate";
import {
  claimSigningWorkItem,
  newWorkerId,
} from "./work-items";
import { isSigningWorkSuspended } from "./work-suspension";

export const SIGNING_WORKER_SECRET_HEADER = "x-signing-worker-secret" as const;
export const SIGNING_WORKER_SECRET_ENV = "SIGNING_WORKER_SECRET" as const;
export const DEFAULT_SIGNING_WORKER_BATCH_LIMIT = 5;
/** Fixed Cron batch size — no query/body override on the Cron route. */
export const SIGNING_CRON_WORKER_BATCH_LIMIT = 5;

export type SigningWorkerBatchResult = {
  status: "OK" | "SUSPENDED" | "DENIED" | "FEATURE_DISABLED";
  processed: Array<Record<string, unknown>>;
  detail?: string;
};

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Still run a compare against equal-length buffers to reduce timing skew.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function verifySigningWorkerSecret(
  providedHeader: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = env[SIGNING_WORKER_SECRET_ENV]?.trim();
  if (!expected || !providedHeader) {
    return false;
  }
  return secretsMatch(providedHeader.trim(), expected);
}

async function processNextInvitationWorkItem(options: {
  admin: SupabaseClient;
  workerId: string;
  signingId?: string;
}): Promise<Record<string, unknown> | null> {
  const claimed = await claimSigningWorkItem({
    admin: options.admin,
    workType: PARTICIPANT_INVITATION_WORK_TYPE,
    workerId: options.workerId,
    signingId: options.signingId,
  });
  if (!claimed) return null;

  // Existing invitation path manages its own processing_state transitions.
  // Lease was claimed so concurrent workers skip this row; invitation processor
  // re-marks PROCESSING and records attempts.
  const result = await processParticipantInvitationWorkItem({
    admin: options.admin,
    workItemId: claimed.id,
  });
  return { workType: PARTICIPANT_INVITATION_WORK_TYPE, ...result };
}

/**
 * Process up to `limit` Signing work items across supported types.
 * Returns SUSPENDED without claiming when work is suspended.
 */
export async function processSigningWorkBatch(options: {
  admin: SupabaseClient;
  workerId?: string;
  limit?: number;
  secretOk: boolean;
  signingId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<SigningWorkerBatchResult> {
  if (!options.secretOk) {
    return { status: "DENIED", processed: [], detail: "Invalid worker secret." };
  }

  if (!isNativeSigningEnabled(options.env)) {
    return {
      status: "FEATURE_DISABLED",
      processed: [],
      detail: "Native Signing is not enabled; queue left unchanged.",
    };
  }

  if (await isSigningWorkSuspended(options.admin)) {
    return {
      status: "SUSPENDED",
      processed: [],
      detail: "Signing work is suspended.",
    };
  }

  const workerId = options.workerId ?? newWorkerId("signing-worker");
  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_SIGNING_WORKER_BATCH_LIMIT, 1),
    25,
  );
  const processed: Array<Record<string, unknown>> = [];

  for (let i = 0; i < limit; i += 1) {
    if (await isSigningWorkSuspended(options.admin)) {
      return {
        status: "SUSPENDED",
        processed,
        detail: "Signing work became suspended mid-batch.",
      };
    }

    const finalize: FinalizationWorkerResult =
      await processNextFinalizationWorkItem({
        admin: options.admin,
        workerId: `${workerId}:finalize`,
        signingId: options.signingId,
      });
    if (finalize.status !== "NO_WORK") {
      processed.push({
        workType: FINALIZE_SIGNING_WORK_TYPE,
        ...finalize,
      });
      continue;
    }

    const combined: FinalizationWorkerResult =
      await processNextCombinedPackageWorkItem({
        admin: options.admin,
        workerId: `${workerId}:combined`,
        signingId: options.signingId,
      });
    if (combined.status !== "NO_WORK") {
      processed.push({
        workType: GENERATE_COMBINED_PACKAGE_WORK_TYPE,
        ...combined,
      });
      continue;
    }

    const completed = await processNextCompletedPackageDeliveryWorkItem({
      admin: options.admin,
      workerId: `${workerId}:completed`,
      signingId: options.signingId,
    });
    if ("outcome" in completed && completed.outcome === "NO_WORK") {
      // fall through
    } else if ("outcome" in completed && completed.outcome === "SUSPENDED") {
      return { status: "SUSPENDED", processed, detail: "Signing work is suspended." };
    } else {
      processed.push({
        workType: DELIVER_COMPLETED_PACKAGE_WORK_TYPE,
        ...completed,
      });
      continue;
    }

    const invitation = await processNextInvitationWorkItem({
      admin: options.admin,
      workerId: `${workerId}:invitation`,
      signingId: options.signingId,
    });
    if (invitation) {
      processed.push(invitation);
      continue;
    }

    break;
  }

  return { status: "OK", processed };
}
