/**
 * Native Signing completed-package browser sessions.
 *
 * After bearer exchange at `/sign/completed/{token}`, a short-lived HttpOnly
 * cookie scoped to `/sign/package` authorizes package listing and artifact
 * download. Sessions expire independently of non-expiring credentials.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedCompletedPackageCredential } from "./completed-package-credentials";
import { SigningError } from "./errors";

export const SIGNING_COMPLETED_PACKAGE_COOKIE_NAME =
  "hf_signing_completed_package" as const;
/** Scoped so the session cookie is never sent to the agent workspace. */
export const SIGNING_COMPLETED_PACKAGE_COOKIE_PATH = "/sign/package" as const;
/** Documented completed-package session lifetime. */
export const SIGNING_COMPLETED_PACKAGE_SESSION_TTL_MINUTES = 60;

const SESSION_TOKEN_BYTES = 32;
export const SIGNING_COMPLETED_PACKAGE_SESSION_TOKEN_RE =
  /^[A-Za-z0-9_-]{43}$/;

export function generateCompletedPackageSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

export function hashCompletedPackageSessionToken(
  rawSessionToken: string,
): string {
  return createHash("sha256").update(rawSessionToken, "utf8").digest("hex");
}

export function isWellFormedCompletedPackageSessionToken(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    SIGNING_COMPLETED_PACKAGE_SESSION_TOKEN_RE.test(value)
  );
}

export type CompletedPackageCookieAttributes = {
  name: typeof SIGNING_COMPLETED_PACKAGE_COOKIE_NAME;
  value: string;
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: typeof SIGNING_COMPLETED_PACKAGE_COOKIE_PATH;
  maxAge: number;
};

export function buildCompletedPackageCookieAttributes(options: {
  rawSessionToken: string;
  ttlMinutes?: number;
}): CompletedPackageCookieAttributes {
  return {
    name: SIGNING_COMPLETED_PACKAGE_COOKIE_NAME,
    value: options.rawSessionToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: SIGNING_COMPLETED_PACKAGE_COOKIE_PATH,
    maxAge:
      (options.ttlMinutes ?? SIGNING_COMPLETED_PACKAGE_SESSION_TTL_MINUTES) *
      60,
  };
}

export type CreatedCompletedPackageSession = {
  sessionId: string;
  /** In-memory only, for the Set-Cookie header. Never persisted or logged. */
  rawSessionToken: string;
  expiresAt: string;
};

export async function createCompletedPackageSession(options: {
  admin: SupabaseClient;
  credential: ValidatedCompletedPackageCredential;
  ttlMinutes?: number;
}): Promise<CreatedCompletedPackageSession> {
  const ttlMinutes =
    options.ttlMinutes ?? SIGNING_COMPLETED_PACKAGE_SESSION_TTL_MINUTES;
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 60) {
    throw new SigningError(
      "INVALID_INPUT",
      "Completed-package session lifetime must be between 1 and 60 minutes.",
    );
  }

  const rawSessionToken = generateCompletedPackageSessionToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  const { data, error } = await options.admin
    .from("signing_completed_package_sessions")
    .insert({
      signing_id: options.credential.signingId,
      completed_package_credential_id: options.credential.credentialId,
      signing_participant_id: options.credential.signingParticipantId,
      signing_copy_recipient_id: options.credential.signingCopyRecipientId,
      session_token_hash: hashCompletedPackageSessionToken(rawSessionToken),
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();
  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to create completed-package session.",
    );
  }

  const usedAt = new Date().toISOString();
  await options.admin
    .from("signing_completed_package_credentials")
    .update({ last_used_at: usedAt })
    .eq("id", options.credential.credentialId)
    .eq("signing_id", options.credential.signingId);
  await options.admin
    .from("signing_completed_package_credentials")
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

export type ValidatedCompletedPackageSession = {
  sessionId: string;
  signingId: string;
  credentialId: string;
  signingParticipantId: string | null;
  signingCopyRecipientId: string | null;
  expiresAt: string;
  signingTitle: string;
  senderDisplayName: string | null;
  brokerageName: string | null;
};

function hashesMatch(left: string, right: unknown): boolean {
  if (typeof right !== "string" || right.length !== left.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/**
 * Resolve a raw session cookie. Returns null for every failure mode.
 * Requires unexpired session, non-revoked current credential, Signing COMPLETE.
 */
export async function validateCompletedPackageSession(
  admin: SupabaseClient,
  rawSessionToken: unknown,
): Promise<ValidatedCompletedPackageSession | null> {
  if (!isWellFormedCompletedPackageSessionToken(rawSessionToken)) {
    return null;
  }

  const sessionTokenHash = hashCompletedPackageSessionToken(rawSessionToken);
  const { data: session, error } = await admin
    .from("signing_completed_package_sessions")
    .select(
      "id, signing_id, completed_package_credential_id, signing_participant_id, signing_copy_recipient_id, session_token_hash, expires_at, revoked_at",
    )
    .eq("session_token_hash", sessionTokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session || !hashesMatch(sessionTokenHash, session.session_token_hash)) {
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
  ] = await Promise.all([
    admin
      .from("signing_completed_package_credentials")
      .select("id, is_current, revoked_at")
      .eq("id", session.completed_package_credential_id as string)
      .eq("signing_id", session.signing_id as string)
      .maybeSingle(),
    admin
      .from("signings")
      .select(
        "id, title, lifecycle_state, original_sender_display_name, originating_organization_id",
      )
      .eq("id", session.signing_id as string)
      .maybeSingle(),
  ]);
  if (credentialError) throw new Error(credentialError.message);
  if (signingError) throw new Error(signingError.message);

  if (!credential || credential.revoked_at || credential.is_current !== true) {
    return null;
  }
  if (!signing || signing.lifecycle_state !== "COMPLETE") {
    return null;
  }

  const copyRecipientId =
    (session.signing_copy_recipient_id as string | null) ?? null;
  if (copyRecipientId) {
    const { data: copyRecipient, error: copyError } = await admin
      .from("signing_copy_recipients")
      .select("id, status")
      .eq("id", copyRecipientId)
      .eq("signing_id", session.signing_id as string)
      .maybeSingle();
    if (copyError) throw new Error(copyError.message);
    if (!copyRecipient || copyRecipient.status !== "ACTIVE") {
      return null;
    }
  }

  let brokerageName: string | null = null;
  const orgId = signing.originating_organization_id as string | null;
  if (orgId) {
    const { data: org } = await admin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    brokerageName = (org?.name as string | null) ?? null;
  }

  return {
    sessionId: session.id as string,
    signingId: session.signing_id as string,
    credentialId: session.completed_package_credential_id as string,
    signingParticipantId:
      (session.signing_participant_id as string | null) ?? null,
    signingCopyRecipientId: copyRecipientId,
    expiresAt,
    signingTitle: (signing.title as string | null) ?? "Completed Signing",
    senderDisplayName:
      (signing.original_sender_display_name as string | null) ?? null,
    brokerageName,
  };
}

/** Revoke every session derived from a credential. */
export async function revokeCompletedPackageSessionsForCredential(options: {
  admin: SupabaseClient;
  signingId: string;
  credentialId: string;
}): Promise<void> {
  const { error } = await options.admin
    .from("signing_completed_package_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("signing_id", options.signingId)
    .eq("completed_package_credential_id", options.credentialId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}
