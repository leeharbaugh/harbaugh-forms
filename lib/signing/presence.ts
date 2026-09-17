/**
 * Native Signing Stage 5 participant presence leases.
 *
 * Presence begins only after identity affirmation: merely opening the Stage 4
 * entry page must never block an agent from acquiring a permitted amendment
 * lock. The lease is owned by the participant's active ceremony browser
 * session, is short and renewable, and server expiry is authoritative.
 *
 * Heartbeat renews the lease. It deliberately does not extend the ceremony
 * inactivity deadline — see `recordMeaningfulCeremonyActivity`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";

/** Short enough that an abandoned tab stops blocking amendments quickly. */
export const SIGNING_PRESENCE_LEASE_TTL_SECONDS = 180;
/** Client heartbeat cadence; well inside the TTL so one lost beat is safe. */
export const SIGNING_PRESENCE_HEARTBEAT_SECONDS = 60;

export type PresenceLease = {
  leaseId: string;
  signingId: string;
  signingParticipantId: string;
  signingBrowserSessionId: string;
  acquiredAt: string;
  renewedAt: string;
  expiresAt: string;
};

function leaseExpiryIso(ttlSeconds: number): string {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}

function parseTtlSeconds(ttlSeconds: number | undefined): number {
  const ttl = ttlSeconds ?? SIGNING_PRESENCE_LEASE_TTL_SECONDS;
  // Bounded: a long "short lease" would reintroduce the abandoned-tab problem.
  if (!Number.isFinite(ttl) || ttl < 60 || ttl > 300) {
    throw new SigningError(
      "INVALID_INPUT",
      "Presence lease lifetime must be between 60 and 300 seconds.",
    );
  }
  return ttl;
}

function toLease(row: Record<string, unknown>): PresenceLease {
  return {
    leaseId: row.id as string,
    signingId: row.signing_id as string,
    signingParticipantId: row.signing_participant_id as string,
    signingBrowserSessionId: row.signing_browser_session_id as string,
    acquiredAt: row.acquired_at as string,
    renewedAt: row.renewed_at as string,
    expiresAt: row.expires_at as string,
  };
}

/**
 * Acquire (or take over) the participant's presence lease for this session.
 *
 * Only one unreleased lease may exist per participant. A lease still held by a
 * different session is released first — session supersession already ended that
 * session, so its lease is stale by construction.
 */
export async function acquirePresenceLease(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  signingBrowserSessionId: string;
  ttlSeconds?: number;
}): Promise<PresenceLease> {
  const ttlSeconds = parseTtlSeconds(options.ttlSeconds);

  const { data: existing, error: existingError } = await options.admin
    .from("signing_participant_presence_leases")
    .select("*")
    .eq("signing_id", options.signingId)
    .eq("signing_participant_id", options.signingParticipantId)
    .is("released_at", null)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    if (
      existing.signing_browser_session_id === options.signingBrowserSessionId
    ) {
      const renewed = await renewPresenceLease({
        admin: options.admin,
        signingId: options.signingId,
        signingBrowserSessionId: options.signingBrowserSessionId,
        ttlSeconds,
      });
      if (renewed) return renewed;
    } else {
      await releasePresenceLeasesForSession({
        admin: options.admin,
        signingId: options.signingId,
        signingBrowserSessionId:
          existing.signing_browser_session_id as string,
        reason: "SUPERSEDED_BY_NEW_SESSION",
      });
    }
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await options.admin
    .from("signing_participant_presence_leases")
    .insert({
      signing_id: options.signingId,
      signing_participant_id: options.signingParticipantId,
      signing_browser_session_id: options.signingBrowserSessionId,
      acquired_at: nowIso,
      renewed_at: nowIso,
      expires_at: leaseExpiryIso(ttlSeconds),
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to acquire presence lease.");
  }
  return toLease(data as Record<string, unknown>);
}

/**
 * Heartbeat renewal. Returns null when this session no longer owns an
 * unreleased lease, which the caller should treat as "presence lost".
 */
export async function renewPresenceLease(options: {
  admin: SupabaseClient;
  signingId: string;
  signingBrowserSessionId: string;
  ttlSeconds?: number;
}): Promise<PresenceLease | null> {
  const ttlSeconds = parseTtlSeconds(options.ttlSeconds);
  const { data, error } = await options.admin
    .from("signing_participant_presence_leases")
    .update({
      renewed_at: new Date().toISOString(),
      expires_at: leaseExpiryIso(ttlSeconds),
    })
    .eq("signing_id", options.signingId)
    .eq("signing_browser_session_id", options.signingBrowserSessionId)
    .is("released_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toLease(data as Record<string, unknown>) : null;
}

export async function releasePresenceLeasesForSession(options: {
  admin: SupabaseClient;
  signingId: string;
  signingBrowserSessionId: string;
  reason: string;
}): Promise<void> {
  const { error } = await options.admin
    .from("signing_participant_presence_leases")
    .update({
      released_at: new Date().toISOString(),
      release_reason: options.reason,
    })
    .eq("signing_id", options.signingId)
    .eq("signing_browser_session_id", options.signingBrowserSessionId)
    .is("released_at", null);
  if (error) throw new Error(error.message);
}

export async function releasePresenceLeasesForParticipant(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  reason: string;
}): Promise<void> {
  const { error } = await options.admin
    .from("signing_participant_presence_leases")
    .update({
      released_at: new Date().toISOString(),
      release_reason: options.reason,
    })
    .eq("signing_id", options.signingId)
    .eq("signing_participant_id", options.signingParticipantId)
    .is("released_at", null);
  if (error) throw new Error(error.message);
}

export async function releasePresenceLeasesForSigning(options: {
  admin: SupabaseClient;
  signingId: string;
  reason: string;
}): Promise<void> {
  const { error } = await options.admin
    .from("signing_participant_presence_leases")
    .update({
      released_at: new Date().toISOString(),
      release_reason: options.reason,
    })
    .eq("signing_id", options.signingId)
    .is("released_at", null);
  if (error) throw new Error(error.message);
}

/** True when this session still holds an unreleased, unexpired lease. */
export async function hasValidPresenceForSession(options: {
  admin: SupabaseClient;
  signingId: string;
  signingBrowserSessionId: string;
}): Promise<boolean> {
  const { data, error } = await options.admin
    .from("signing_participant_presence_leases")
    .select("id")
    .eq("signing_id", options.signingId)
    .eq("signing_browser_session_id", options.signingBrowserSessionId)
    .is("released_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/**
 * Presence is required for ceremony writes: it is what an amendment lock has to
 * contend with, so a write must not be accepted while presence has lapsed.
 * Re-acquired automatically by the caller when the session is still ACTIVE.
 */
export async function requireValidPresenceForSession(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  signingBrowserSessionId: string;
  ttlSeconds?: number;
}): Promise<PresenceLease> {
  const renewed = await renewPresenceLease({
    admin: options.admin,
    signingId: options.signingId,
    signingBrowserSessionId: options.signingBrowserSessionId,
    ttlSeconds: options.ttlSeconds,
  });
  if (renewed) return renewed;

  try {
    return await acquirePresenceLease(options);
  } catch (error) {
    if (error instanceof SigningError) throw error;
    throw new SigningError(
      "PRESENCE_REQUIRED",
      "Your signing session lost its place in this Signing. Reload and try again.",
    );
  }
}

/**
 * Any participant currently present in this Signing.
 *
 * This is the predicate a future agent amendment-lock acquisition must consult:
 * a valid presence lease blocks taking the lock. Kept here so ceremony and lock
 * code share one definition of "present".
 */
export async function hasActivePresenceForSigning(
  admin: SupabaseClient,
  signingId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("signing_participant_presence_leases")
    .select("id")
    .eq("signing_id", signingId)
    .is("released_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
