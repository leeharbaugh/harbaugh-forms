/**
 * Native Signing Stage 4 participant entry sessions.
 *
 * The invitation link is `/sign/{rawCredentialToken}`. Opening it exchanges the
 * bearer credential for a short-lived entry session held in an HttpOnly cookie
 * and redirects to `/sign/continue`, so the raw credential does not linger in
 * the address bar, browser history, bookmarks, or a Referer header.
 *
 * This is access plumbing only — no ceremony, no consent, no signer evidence:
 *
 * - Only the SHA-256 digest of the session token is persisted; the raw session
 *   token exists solely in the participant's cookie.
 * - Every validation re-checks that the Signing is In Progress and that the
 *   originating credential is still the participant's current credential, so
 *   revoking or re-issuing a credential immediately invalidates its sessions.
 * - Neither the credential token nor the session token is ever logged.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedParticipantCredential } from "./credentials";
import {
  assertSigningExternalAccessActive,
  isCredentialEpochCurrent,
  requireIssuanceAccessEpoch,
} from "./external-access";
import { SigningError } from "./errors";

export const SIGNING_ENTRY_COOKIE_NAME = "hf_signing_entry" as const;
/** Scoped so the session cookie is never sent to the agent workspace. */
export const SIGNING_ENTRY_COOKIE_PATH = "/sign" as const;
export const SIGNING_ENTRY_SESSION_TTL_MINUTES = 30;

const SESSION_TOKEN_BYTES = 32;
export const SIGNING_ENTRY_SESSION_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateSigningEntrySessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function hashSigningEntrySessionToken(rawSessionToken: string): string {
  return createHash("sha256").update(rawSessionToken, "utf8").digest("hex");
}

export function isWellFormedSigningEntrySessionToken(
  value: unknown,
): value is string {
  return (
    typeof value === "string" && SIGNING_ENTRY_SESSION_TOKEN_RE.test(value)
  );
}

export type SigningEntryCookieAttributes = {
  name: typeof SIGNING_ENTRY_COOKIE_NAME;
  value: string;
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: typeof SIGNING_ENTRY_COOKIE_PATH;
  maxAge: number;
};

/**
 * Cookie attributes for the exchange response.
 *
 * `secure` is always set: browsers treat `http://localhost` as a secure context,
 * so development still works without weakening the deployed cookie.
 */
export function buildSigningEntryCookieAttributes(options: {
  rawSessionToken: string;
  ttlMinutes?: number;
}): SigningEntryCookieAttributes {
  return {
    name: SIGNING_ENTRY_COOKIE_NAME,
    value: options.rawSessionToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: SIGNING_ENTRY_COOKIE_PATH,
    maxAge:
      (options.ttlMinutes ?? SIGNING_ENTRY_SESSION_TTL_MINUTES) * 60,
  };
}

/** Clear entry cookie after suspension/epoch mismatch (authority remains server-side). */
export function buildClearedSigningEntryCookieAttributes(): SigningEntryCookieAttributes {
  return {
    name: SIGNING_ENTRY_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: SIGNING_ENTRY_COOKIE_PATH,
    maxAge: 0,
  };
}

export type CreatedSigningEntrySession = {
  sessionId: string;
  /** In-memory only, for the Set-Cookie header. Never persisted or logged. */
  rawSessionToken: string;
  expiresAt: string;
};

/**
 * Exchange a validated credential for a fresh entry session.
 * A participant may hold more than one session (multiple devices); each is
 * independently expiring and revocable.
 */
export async function createSigningEntrySession(options: {
  admin: SupabaseClient;
  credential: ValidatedParticipantCredential;
  ttlMinutes?: number;
}): Promise<CreatedSigningEntrySession> {
  const ttlMinutes = options.ttlMinutes ?? SIGNING_ENTRY_SESSION_TTL_MINUTES;
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) {
    throw new SigningError(
      "INVALID_INPUT",
      "Entry session lifetime must be between 1 and 60 minutes.",
    );
  }

  const accessEpoch = await requireIssuanceAccessEpoch(options.admin);
  const rawSessionToken = generateSigningEntrySessionToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  const { data, error } = await options.admin
    .from("signing_entry_sessions")
    .insert({
      signing_id: options.credential.signingId,
      signing_participant_id: options.credential.signingParticipantId,
      signing_participant_credential_id: options.credential.credentialId,
      session_token_hash: hashSigningEntrySessionToken(rawSessionToken),
      expires_at: expiresAt,
      access_epoch: accessEpoch,
    })
    .select("id, expires_at")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create Signing entry session.");
  }

  // Credential usage bookkeeping: the raw bearer is never recorded, only that
  // the link was opened.
  const usedAt = new Date().toISOString();
  await options.admin
    .from("signing_participant_credentials")
    .update({ last_used_at: usedAt })
    .eq("id", options.credential.credentialId)
    .eq("signing_id", options.credential.signingId);
  await options.admin
    .from("signing_participant_credentials")
    .update({ first_used_at: usedAt })
    .eq("id", options.credential.credentialId)
    .eq("signing_id", options.credential.signingId)
    .is("first_used_at", null);

  return {
    sessionId: data.id as string,
    rawSessionToken,
    expiresAt: (data.expires_at as string | null) ?? expiresAt,
  };
}

export type ValidatedSigningEntrySession = {
  sessionId: string;
  signingId: string;
  signingParticipantId: string;
  credentialId: string;
  expiresAt: string;
  participantFullName: string;
  participantEmail: string;
  signingTitle: string;
};

function hashesMatch(left: string, right: unknown): boolean {
  if (typeof right !== "string" || right.length !== left.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/**
 * Resolve a raw session cookie value to its participant.
 *
 * Returns null for every failure mode (unknown, expired, revoked, Signing no
 * longer In Progress, credential no longer current, participant removed) so a
 * stale cookie reveals nothing about whether a Signing exists.
 */
export async function validateSigningEntrySession(
  admin: SupabaseClient,
  rawSessionToken: unknown,
): Promise<ValidatedSigningEntrySession | null> {
  const currentEpoch = await assertSigningExternalAccessActive(admin);
  if (!currentEpoch) {
    return null;
  }
  if (!isWellFormedSigningEntrySessionToken(rawSessionToken)) {
    return null;
  }

  const sessionTokenHash = hashSigningEntrySessionToken(rawSessionToken);
  const { data: session, error } = await admin
    .from("signing_entry_sessions")
    .select(
      "id, signing_id, signing_participant_id, signing_participant_credential_id, session_token_hash, expires_at, revoked_at, access_epoch",
    )
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session || !hashesMatch(sessionTokenHash, session.session_token_hash)) {
    return null;
  }
  if (
    !isCredentialEpochCurrent(
      session.access_epoch as string | null,
      currentEpoch,
    )
  ) {
    return null;
  }
  if (session.revoked_at) {
    return null;
  }
  const expiresAt = session.expires_at as string;
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    return null;
  }

  const [
    { data: credential, error: credentialError },
    { data: signing, error: signingError },
    { data: participant, error: participantError },
  ] = await Promise.all([
    admin
      .from("signing_participant_credentials")
      .select("id, is_current, revoked_at")
      .eq("id", session.signing_participant_credential_id as string)
      .eq("signing_id", session.signing_id as string)
      .maybeSingle(),
    admin
      .from("signings")
      .select("id, title, lifecycle_state")
      .eq("id", session.signing_id as string)
      .maybeSingle(),
    admin
      .from("signing_participants")
      .select("id, full_name, email, participant_status")
      .eq("id", session.signing_participant_id as string)
      .eq("signing_id", session.signing_id as string)
      .maybeSingle(),
  ]);
  if (credentialError) throw new Error(credentialError.message);
  if (signingError) throw new Error(signingError.message);
  if (participantError) throw new Error(participantError.message);

  // A revoked or superseded credential invalidates sessions derived from it.
  if (!credential || credential.revoked_at || credential.is_current !== true) {
    return null;
  }
  if (!signing || signing.lifecycle_state !== "IN_PROGRESS") {
    return null;
  }
  if (!participant || participant.participant_status === "REMOVED") {
    return null;
  }

  return {
    sessionId: session.id as string,
    signingId: session.signing_id as string,
    signingParticipantId: session.signing_participant_id as string,
    credentialId: session.signing_participant_credential_id as string,
    expiresAt,
    participantFullName: participant.full_name as string,
    participantEmail: participant.email as string,
    signingTitle: signing.title as string,
  };
}

/** Best-effort liveness marker for support and debugging. Never fails a render. */
export async function touchSigningEntrySession(
  admin: SupabaseClient,
  session: { sessionId: string; signingId: string },
): Promise<void> {
  try {
    await admin
      .from("signing_entry_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", session.sessionId)
      .eq("signing_id", session.signingId);
  } catch (error) {
    console.error(
      "[native-signing-stage4] entry session touch failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}

/**
 * Revoke one entry session.
 *
 * Used when a ceremony browser session takes over authority after "I am
 * [Name]": the entry session must not survive as a second, longer-lived way to
 * reach ceremony state.
 */
export async function revokeSigningEntrySessionById(options: {
  admin: SupabaseClient;
  signingId: string;
  sessionId: string;
  reason: string;
}): Promise<void> {
  const { error } = await options.admin
    .from("signing_entry_sessions")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: options.reason,
    })
    .eq("id", options.sessionId)
    .eq("signing_id", options.signingId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}

/** Revoke every session derived from a credential (revoke / re-issue paths). */
export async function revokeSigningEntrySessionsForCredential(options: {
  admin: SupabaseClient;
  signingId: string;
  credentialId: string;
  reason: string;
}): Promise<void> {
  const { error } = await options.admin
    .from("signing_entry_sessions")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_reason: options.reason,
    })
    .eq("signing_id", options.signingId)
    .eq("signing_participant_credential_id", options.credentialId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}
