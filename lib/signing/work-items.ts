/**
 * Durable Signing work-item claim lease helpers (Stage 6).
 *
 * The work item is never authority: every processor must revalidate Signing
 * state after claiming. Leases expire so crashed workers cannot hold work
 * forever; stale workers must re-claim before marking success.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export type WorkItemProcessingState =
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED";

export type SigningWorkItemRow = {
  id: string;
  signing_id: string;
  work_type: string;
  idempotency_key: string;
  reference_json: Record<string, unknown>;
  processing_state: WorkItemProcessingState;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error_safe: string | null;
  completed_at: string | null;
  claimed_by: string | null;
  claimed_until: string | null;
  processing_started_at: string | null;
};

export const DEFAULT_WORK_ITEM_LEASE_SECONDS = 120;

export function newWorkerId(prefix = "worker"): string {
  return `${prefix}:${randomUUID()}`;
}

function asWorkItem(row: Record<string, unknown>): SigningWorkItemRow {
  return {
    id: row.id as string,
    signing_id: row.signing_id as string,
    work_type: row.work_type as string,
    idempotency_key: row.idempotency_key as string,
    reference_json: (row.reference_json as Record<string, unknown>) ?? {},
    processing_state: row.processing_state as WorkItemProcessingState,
    attempt_count: Number(row.attempt_count ?? 0),
    next_attempt_at: (row.next_attempt_at as string | null) ?? null,
    last_error_safe: (row.last_error_safe as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    claimed_by: (row.claimed_by as string | null) ?? null,
    claimed_until: (row.claimed_until as string | null) ?? null,
    processing_started_at:
      (row.processing_started_at as string | null) ?? null,
  };
}

/**
 * Atomically claim one eligible work item of the given type.
 * Returns null when nothing is claimable.
 */
export async function claimSigningWorkItem(options: {
  admin: SupabaseClient;
  workType: string;
  workerId: string;
  leaseSeconds?: number;
  signingId?: string;
}): Promise<SigningWorkItemRow | null> {
  const leaseSeconds = options.leaseSeconds ?? DEFAULT_WORK_ITEM_LEASE_SECONDS;
  const now = new Date();
  const nowIso = now.toISOString();
  const claimedUntil = new Date(
    now.getTime() + leaseSeconds * 1000,
  ).toISOString();

  let query = options.admin
    .from("signing_work_items")
    .select("*")
    .eq("work_type", options.workType)
    .in("processing_state", ["PENDING", "FAILED", "PROCESSING"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .or(`claimed_until.is.null,claimed_until.lt.${nowIso}`)
    .order("create_date", { ascending: true })
    .limit(5);

  if (options.signingId) {
    query = query.eq("signing_id", options.signingId);
  }

  const { data: candidates, error } = await query;
  if (error) throw new Error(error.message);
  if (!candidates?.length) return null;

  for (const candidate of candidates) {
    const row = asWorkItem(candidate as Record<string, unknown>);
    if (row.processing_state === "SUCCEEDED") continue;

    const { data: claimed, error: claimError } = await options.admin
      .from("signing_work_items")
      .update({
        processing_state: "PROCESSING",
        claimed_by: options.workerId,
        claimed_until: claimedUntil,
        processing_started_at: nowIso,
        attempt_count: row.attempt_count + 1,
        last_error_safe: null,
      })
      .eq("id", row.id)
      .in("processing_state", ["PENDING", "FAILED", "PROCESSING"])
      .or(`claimed_until.is.null,claimed_until.lt.${nowIso}`)
      .select("*")
      .maybeSingle();

    if (claimError) throw new Error(claimError.message);
    if (claimed) return asWorkItem(claimed as Record<string, unknown>);
  }

  return null;
}

/** True when this worker still holds an unexpired lease. */
export function workerHoldsLease(
  item: SigningWorkItemRow,
  workerId: string,
  now: Date = new Date(),
): boolean {
  if (item.claimed_by !== workerId) return false;
  if (!item.claimed_until) return false;
  return new Date(item.claimed_until).getTime() > now.getTime();
}

export async function renewWorkItemLease(options: {
  admin: SupabaseClient;
  workItemId: string;
  workerId: string;
  leaseSeconds?: number;
}): Promise<SigningWorkItemRow | null> {
  const leaseSeconds = options.leaseSeconds ?? DEFAULT_WORK_ITEM_LEASE_SECONDS;
  const now = new Date();
  const claimedUntil = new Date(
    now.getTime() + leaseSeconds * 1000,
  ).toISOString();

  const { data, error } = await options.admin
    .from("signing_work_items")
    .update({ claimed_until: claimedUntil })
    .eq("id", options.workItemId)
    .eq("claimed_by", options.workerId)
    .eq("processing_state", "PROCESSING")
    .gt("claimed_until", now.toISOString())
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asWorkItem(data as Record<string, unknown>) : null;
}

export async function completeWorkItem(options: {
  admin: SupabaseClient;
  workItemId: string;
  workerId: string;
}): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data, error } = await options.admin
    .from("signing_work_items")
    .update({
      processing_state: "SUCCEEDED",
      completed_at: nowIso,
      claimed_by: options.workerId,
      claimed_until: null,
      last_error_safe: null,
    })
    .eq("id", options.workItemId)
    .eq("claimed_by", options.workerId)
    .eq("processing_state", "PROCESSING")
    .gt("claimed_until", nowIso)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function failWorkItem(options: {
  admin: SupabaseClient;
  workItemId: string;
  workerId: string;
  errorSafe: string;
  retryDelaySeconds?: number;
}): Promise<boolean> {
  const now = new Date();
  const retryDelay = options.retryDelaySeconds ?? 30;
  const nextAttempt = new Date(
    now.getTime() + retryDelay * 1000,
  ).toISOString();

  const { data, error } = await options.admin
    .from("signing_work_items")
    .update({
      processing_state: "FAILED",
      last_error_safe: options.errorSafe.slice(0, 500),
      next_attempt_at: nextAttempt,
      claimed_until: null,
    })
    .eq("id", options.workItemId)
    .eq("claimed_by", options.workerId)
    .eq("processing_state", "PROCESSING")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  // If lease was lost, still record failure when possible without claiming success.
  if (!data) {
    const { error: fallbackError } = await options.admin
      .from("signing_work_items")
      .update({
        processing_state: "FAILED",
        last_error_safe: options.errorSafe.slice(0, 500),
        next_attempt_at: nextAttempt,
        claimed_until: null,
      })
      .eq("id", options.workItemId)
      .neq("processing_state", "SUCCEEDED");
    if (fallbackError) throw new Error(fallbackError.message);
    return false;
  }
  return true;
}

export async function requeueFailedWorkItem(options: {
  admin: SupabaseClient;
  signingId: string;
  workType: string;
  idempotencyKey: string;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await options.admin
    .from("signing_work_items")
    .update({
      processing_state: "PENDING",
      next_attempt_at: nowIso,
      claimed_by: null,
      claimed_until: null,
      last_error_safe: null,
      completed_at: null,
    })
    .eq("signing_id", options.signingId)
    .eq("work_type", options.workType)
    .eq("idempotency_key", options.idempotencyKey)
    .in("processing_state", ["FAILED", "PENDING", "PROCESSING"]);
  if (error) throw new Error(error.message);
}
