/**
 * Native Signing Stage 5 ceremony browser sessions (Model B).
 *
 * The Stage 4 entry session (`hf_signing_entry`) is pre-ceremony access
 * plumbing. After the participant affirmatively selects "I am [Name]" the
 * server creates a distinct ceremony browser session, and from then on *that*
 * session — never the entry session — is the authority for consent, adoption,
 * placements, Finish, and Decline.
 *
 * Invariants:
 * - Only the SHA-256 digest of the session token is persisted; the raw token
 *   exists solely in the participant's `hf_signing_ceremony` cookie.
 * - Exactly one ACTIVE session per participant per Signing. Re-entering
 *   supersedes the prior session, releases its presence lease, and preserves
 *   every already server-accepted action.
 * - Inactivity is 60 minutes from the last *meaningful* participant activity.
 *   Presence heartbeat renews the lease and must never touch that deadline.
 * - Creating a ceremony session terminates the entry session that produced it,
 *   so a lingering entry cookie cannot be replayed as ceremony authority.
 * - Every validation re-checks Signing state, participant state, and the
 *   underlying credential or handoff, so a revocation takes effect immediately.
 * - Neither the entry token, the handoff token, nor the session token is logged.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revokeSigningEntrySessionById } from "./entry-sessions";
import { SigningError, type SigningErrorCode } from "./errors";
import { releasePresenceLeasesForSession } from "./presence";

export const SIGNING_CEREMONY_COOKIE_NAME = "hf_signing_ceremony" as const;
/** Scoped so ceremony authority is never sent to the agent workspace. */
export const SIGNING_CEREMONY_COOKIE_PATH = "/sign" as const;
/** Approved ceremony inactivity window, in minutes of meaningful activity. */
export const SIGNING_CEREMONY_INACTIVITY_MINUTES = 60;

const SESSION_TOKEN_BYTES = 32;
export const SIGNING_CEREMONY_SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type CeremonySessionProvenance =
  | { kind: "CREDENTIAL"; credentialId: string }
  | { kind: "IN_PERSON_HANDOFF"; handoffId: string };

export function generateCeremonySessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function hashCeremonySessionToken(rawSessionToken: string): string {
  return createHash("sha256").update(rawSessionToken, "utf8").digest("hex");
}

export function isWellFormedCeremonySessionToken(
  value: unknown,
): value is string {
  return (
    typeof value === "string" && SIGNING_CEREMONY_SESSION_TOKEN_RE.test(value)
  );
}

export type SigningCeremonyCookieAttributes = {
  name: typeof SIGNING_CEREMONY_COOKIE_NAME;
  value: string;
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: typeof SIGNING_CEREMONY_COOKIE_PATH;
  maxAge: number;
};

/**
 * Cookie attributes for the affirmation response.
 *
 * `secure` is always set: browsers treat `http://localhost` as a secure
 * context, so development still works without weakening the deployed cookie.
 */
export function buildSigningCeremonyCookieAttributes(options: {
  rawSessionToken: string;
  inactivityMinutes?: number;
}): SigningCeremonyCookieAttributes {
  return {
    name: SIGNING_CEREMONY_COOKIE_NAME,
    value: options.rawSessionToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: SIGNING_CEREMONY_COOKIE_PATH,
    maxAge:
      (options.inactivityMinutes ?? SIGNING_CEREMONY_INACTIVITY_MINUTES) * 60,
  };
}

/** Cookie attributes that clear the ceremony cookie. */
export function buildClearedSigningCeremonyCookieAttributes(): SigningCeremonyCookieAttributes {
  return {
    name: SIGNING_CEREMONY_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: SIGNING_CEREMONY_COOKIE_PATH,
    maxAge: 0,
  };
}

export type CreatedCeremonyBrowserSession = {
  sessionId: string;
  /** In-memory only, for the Set-Cookie header. Never persisted or logged. */
  rawSessionToken: string;
  inactivityExpiresAt: string;
  supersededSessionIds: string[];
};

/**
 * Create the ceremony session that replaces entry-session authority.
 *
 * Supersession runs first so the one-ACTIVE-per-participant unique index can
 * never be the thing that fails, and the prior session's presence lease is
 * released before the new session acquires its own.
 */
export async function createCeremonyBrowserSession(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  provenance: CeremonySessionProvenance;
  /** Entry session to terminate; it must not survive as ceremony authority. */
  entrySessionIdToTerminate?: string | null;
  inactivityMinutes?: number;
}): Promise<CreatedCeremonyBrowserSession> {
  const inactivityMinutes =
    options.inactivityMinutes ?? SIGNING_CEREMONY_INACTIVITY_MINUTES;
  if (
    !Number.isFinite(inactivityMinutes) ||
    inactivityMinutes < 5 ||
    inactivityMinutes > 60
  ) {
    throw new SigningError(
      "INVALID_INPUT",
      "Ceremony inactivity must be between 5 and 60 minutes.",
    );
  }

  const supersededSessionIds = await supersedeActiveCeremonySessions({
    admin: options.admin,
    signingId: options.signingId,
    signingParticipantId: options.signingParticipantId,
    reason: "SUPERSEDED_BY_NEW_SESSION",
  });

  // Terminated before the new session exists: if the insert below fails the
  // participant must re-open their link rather than keep a usable entry cookie.
  if (options.entrySessionIdToTerminate) {
    await revokeSigningEntrySessionById({
      admin: options.admin,
      signingId: options.signingId,
      sessionId: options.entrySessionIdToTerminate,
      reason: "SUPERSEDED_BY_CEREMONY_SESSION",
    });
  }

  const rawSessionToken = generateCeremonySessionToken();
  // Derive every timestamp from one clock reading so the
  // `inactivity_expires_at > create_date` check cannot fail when the app
  // host and Postgres clocks disagree by a few seconds (or more).
  const createdAtMs = Date.now();
  const createdAt = new Date(createdAtMs).toISOString();
  const inactivityExpiresAt = new Date(
    createdAtMs + inactivityMinutes * 60_000,
  ).toISOString();

  const { data, error } = await options.admin
    .from("signing_browser_sessions")
    .insert({
      signing_id: options.signingId,
      signing_participant_id: options.signingParticipantId,
      signing_participant_credential_id:
        options.provenance.kind === "CREDENTIAL"
          ? options.provenance.credentialId
          : null,
      signing_in_person_handoff_id:
        options.provenance.kind === "IN_PERSON_HANDOFF"
          ? options.provenance.handoffId
          : null,
      session_token_hash: hashCeremonySessionToken(rawSessionToken),
      status: "ACTIVE",
      create_date: createdAt,
      identity_affirmed_at: createdAt,
      last_meaningful_activity_at: createdAt,
      inactivity_expires_at: inactivityExpiresAt,
    })
    .select("id, inactivity_expires_at")
    .single();
  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to create ceremony browser session.",
    );
  }

  const sessionId = data.id as string;
  for (const supersededId of supersededSessionIds) {
    await options.admin
      .from("signing_browser_sessions")
      .update({ superseded_by_session_id: sessionId })
      .eq("id", supersededId)
      .eq("signing_id", options.signingId)
      .is("superseded_by_session_id", null);
  }

  return {
    sessionId,
    rawSessionToken,
    inactivityExpiresAt:
      (data.inactivity_expires_at as string | null) ?? inactivityExpiresAt,
    supersededSessionIds,
  };
}

/** End every ACTIVE session for one participant, releasing their presence. */
export async function supersedeActiveCeremonySessions(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  reason: string;
  status?: "SUPERSEDED" | "REVOKED" | "ENDED" | "EXPIRED";
}): Promise<string[]> {
  const { data: active, error } = await options.admin
    .from("signing_browser_sessions")
    .select("id")
    .eq("signing_id", options.signingId)
    .eq("signing_participant_id", options.signingParticipantId)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);

  const endedIds: string[] = [];
  for (const row of active ?? []) {
    const sessionId = row.id as string;
    await releasePresenceLeasesForSession({
      admin: options.admin,
      signingId: options.signingId,
      signingBrowserSessionId: sessionId,
      reason: options.reason,
    });
    const { data: ended, error: endError } = await options.admin
      .from("signing_browser_sessions")
      .update({
        status: options.status ?? "SUPERSEDED",
        ended_at: new Date().toISOString(),
        ended_reason: options.reason,
      })
      .eq("id", sessionId)
      .eq("signing_id", options.signingId)
      .eq("status", "ACTIVE")
      .select("id")
      .maybeSingle();
    if (endError) throw new Error(endError.message);
    if (ended) endedIds.push(sessionId);
  }
  return endedIds;
}

/** End one specific ceremony session (Finish, Decline, explicit exit). */
export async function endCeremonyBrowserSession(options: {
  admin: SupabaseClient;
  signingId: string;
  sessionId: string;
  reason: string;
  status?: "ENDED" | "EXPIRED" | "REVOKED";
}): Promise<void> {
  await releasePresenceLeasesForSession({
    admin: options.admin,
    signingId: options.signingId,
    signingBrowserSessionId: options.sessionId,
    reason: options.reason,
  });
  const { error } = await options.admin
    .from("signing_browser_sessions")
    .update({
      status: options.status ?? "ENDED",
      ended_at: new Date().toISOString(),
      ended_reason: options.reason,
    })
    .eq("id", options.sessionId)
    .eq("signing_id", options.signingId)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);
}

/** End every ACTIVE ceremony session in a Signing (Decline, cancellation). */
export async function endActiveCeremonySessionsForSigning(options: {
  admin: SupabaseClient;
  signingId: string;
  reason: string;
  status?: "ENDED" | "REVOKED";
}): Promise<number> {
  const { data: active, error } = await options.admin
    .from("signing_browser_sessions")
    .select("id")
    .eq("signing_id", options.signingId)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);

  let ended = 0;
  for (const row of active ?? []) {
    await endCeremonyBrowserSession({
      admin: options.admin,
      signingId: options.signingId,
      sessionId: row.id as string,
      reason: options.reason,
      status: options.status ?? "ENDED",
    });
    ended += 1;
  }
  return ended;
}

export type ValidatedCeremonySession = {
  sessionId: string;
  signingId: string;
  signingParticipantId: string;
  credentialId: string | null;
  inPersonHandoffId: string | null;
  identityAffirmedAt: string;
  lastMeaningfulActivityAt: string;
  inactivityExpiresAt: string;
  participantFullName: string;
  participantStatus: string;
  signingTitle: string;
  senderTimezone: string;
  currentPackageRevisionId: string | null;
  frozenPackageRevisionId: string | null;
};

export type CeremonySessionResolution =
  | { ok: true; session: ValidatedCeremonySession }
  | {
      ok: false;
      code: Extract<
        SigningErrorCode,
        "SESSION_EXPIRED" | "SESSION_SUPERSEDED" | "CEREMONY_FORBIDDEN"
      >;
      message: string;
    };

function hashesMatch(left: string, right: unknown): boolean {
  if (typeof right !== "string" || right.length !== left.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

const FORBIDDEN: CeremonySessionResolution = {
  ok: false,
  code: "CEREMONY_FORBIDDEN",
  message: "This signing session is no longer available.",
};

/**
 * Resolve the ceremony cookie to its participant.
 *
 * A superseded session is reported distinctly so the older browser tab can show
 * "you continued in another window" instead of a bare error; every other
 * failure (unknown, revoked, ended, Signing no longer In Progress, credential
 * no longer current, consumed/revoked handoff, participant removed) is
 * indistinguishable.
 */
export async function resolveCeremonyBrowserSession(
  admin: SupabaseClient,
  rawSessionToken: unknown,
): Promise<CeremonySessionResolution> {
  if (!isWellFormedCeremonySessionToken(rawSessionToken)) {
    return FORBIDDEN;
  }

  const sessionTokenHash = hashCeremonySessionToken(rawSessionToken);
  const { data: session, error } = await admin
    .from("signing_browser_sessions")
    .select(
      "id, signing_id, signing_participant_id, signing_participant_credential_id, signing_in_person_handoff_id, session_token_hash, status, identity_affirmed_at, last_meaningful_activity_at, inactivity_expires_at",
    )
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session || !hashesMatch(sessionTokenHash, session.session_token_hash)) {
    return FORBIDDEN;
  }

  if (session.status === "SUPERSEDED") {
    return {
      ok: false,
      code: "SESSION_SUPERSEDED",
      message:
        "You continued this Signing in another window. Reopen your Signing link to continue here.",
    };
  }
  if (session.status !== "ACTIVE") {
    return {
      ok: false,
      code: "SESSION_EXPIRED",
      message:
        "This signing session has ended. Reopen your Signing link to continue.",
    };
  }

  const inactivityExpiresAt = session.inactivity_expires_at as string;
  if (
    !inactivityExpiresAt ||
    new Date(inactivityExpiresAt).getTime() <= Date.now()
  ) {
    // Server expiry is authoritative: record it and release presence so an
    // abandoned tab stops blocking amendment-lock acquisition.
    await endCeremonyBrowserSession({
      admin,
      signingId: session.signing_id as string,
      sessionId: session.id as string,
      reason: "INACTIVITY_TIMEOUT",
      status: "EXPIRED",
    });
    return {
      ok: false,
      code: "SESSION_EXPIRED",
      message:
        "This signing session timed out. Reopen your Signing link and confirm your identity to continue; your completed work was saved.",
    };
  }

  const credentialId =
    (session.signing_participant_credential_id as string | null) ?? null;
  const handoffId =
    (session.signing_in_person_handoff_id as string | null) ?? null;

  const [
    { data: signing, error: signingError },
    { data: participant, error: participantError },
  ] = await Promise.all([
    admin
      .from("signings")
      .select(
        "id, title, lifecycle_state, sender_timezone, current_package_revision_id, frozen_package_revision_id",
      )
      .eq("id", session.signing_id as string)
      .maybeSingle(),
    admin
      .from("signing_participants")
      .select("id, full_name, participant_status")
      .eq("id", session.signing_participant_id as string)
      .eq("signing_id", session.signing_id as string)
      .maybeSingle(),
  ]);
  if (signingError) throw new Error(signingError.message);
  if (participantError) throw new Error(participantError.message);

  if (!signing || signing.lifecycle_state !== "IN_PROGRESS") {
    return FORBIDDEN;
  }
  if (!participant || participant.participant_status === "REMOVED") {
    return FORBIDDEN;
  }

  // A revoked or re-issued credential invalidates sessions derived from it.
  if (credentialId) {
    const { data: credential, error: credentialError } = await admin
      .from("signing_participant_credentials")
      .select("id, is_current, revoked_at")
      .eq("id", credentialId)
      .eq("signing_id", session.signing_id as string)
      .maybeSingle();
    if (credentialError) throw new Error(credentialError.message);
    if (!credential || credential.revoked_at || credential.is_current !== true) {
      return FORBIDDEN;
    }
  }

  // A revoked handoff invalidates the supervised session it produced.
  if (handoffId) {
    const { data: handoff, error: handoffError } = await admin
      .from("signing_in_person_handoffs")
      .select("id, revoked_at")
      .eq("id", handoffId)
      .eq("signing_id", session.signing_id as string)
      .maybeSingle();
    if (handoffError) throw new Error(handoffError.message);
    if (!handoff || handoff.revoked_at) {
      return FORBIDDEN;
    }
  }

  return {
    ok: true,
    session: {
      sessionId: session.id as string,
      signingId: session.signing_id as string,
      signingParticipantId: session.signing_participant_id as string,
      credentialId,
      inPersonHandoffId: handoffId,
      identityAffirmedAt: session.identity_affirmed_at as string,
      lastMeaningfulActivityAt: session.last_meaningful_activity_at as string,
      inactivityExpiresAt,
      participantFullName: participant.full_name as string,
      participantStatus: participant.participant_status as string,
      signingTitle: signing.title as string,
      senderTimezone: (signing.sender_timezone as string) ?? "America/Chicago",
      currentPackageRevisionId:
        (signing.current_package_revision_id as string | null) ?? null,
      frozenPackageRevisionId:
        (signing.frozen_package_revision_id as string | null) ?? null,
    },
  };
}

/** Render-path helper: null for every failure mode. */
export async function validateCeremonyBrowserSession(
  admin: SupabaseClient,
  rawSessionToken: unknown,
): Promise<ValidatedCeremonySession | null> {
  const resolved = await resolveCeremonyBrowserSession(admin, rawSessionToken);
  return resolved.ok ? resolved.session : null;
}

/** Write-path helper: throws the specific ceremony session error. */
export async function requireCeremonyBrowserSession(
  admin: SupabaseClient,
  rawSessionToken: unknown,
): Promise<ValidatedCeremonySession> {
  const resolved = await resolveCeremonyBrowserSession(admin, rawSessionToken);
  if (!resolved.ok) {
    throw new SigningError(resolved.code, resolved.message);
  }
  return resolved.session;
}

/**
 * Reset the inactivity deadline after deliberate participant interaction:
 * identity/consent/adoption, Start Signing, document navigation, placement
 * attempts, replacement/removal, Finish, Decline.
 *
 * Presence heartbeat must NOT call this — see `renewPresenceLease`.
 */
export async function recordMeaningfulCeremonyActivity(options: {
  admin: SupabaseClient;
  signingId: string;
  sessionId: string;
  inactivityMinutes?: number;
}): Promise<string | null> {
  const nowIso = new Date().toISOString();
  const inactivityExpiresAt = new Date(
    Date.now() +
      (options.inactivityMinutes ?? SIGNING_CEREMONY_INACTIVITY_MINUTES) *
        60_000,
  ).toISOString();

  // Guarded on an unexpired ACTIVE row so a timed-out session cannot extend
  // itself, and so ending a session is not silently undone by a late write.
  const { data, error } = await options.admin
    .from("signing_browser_sessions")
    .update({
      last_meaningful_activity_at: nowIso,
      inactivity_expires_at: inactivityExpiresAt,
    })
    .eq("id", options.sessionId)
    .eq("signing_id", options.signingId)
    .eq("status", "ACTIVE")
    .gt("inactivity_expires_at", nowIso)
    .select("inactivity_expires_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.inactivity_expires_at as string | null) ?? null;
}
