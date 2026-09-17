/**
 * Native Signing Stage 5 shared-device agent workspace lock.
 *
 * While a participant uses an in-person handoff on the agent's browser, an
 * HttpOnly lock cookie prevents ordinary workspace routes until the issuing
 * agent explicitly unlocks on Return-to-Agent (with password re-verification).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";
import { isUuid, type SigningActor } from "./types";

export const DEVICE_HANDOFF_LOCK_COOKIE_NAME = "hf_device_handoff_lock" as const;
export const DEVICE_HANDOFF_LOCK_COOKIE_PATH = "/" as const;
/**
 * Device lock outlives the short handoff entry token: the participant may take
 * the full ceremony (including the 60-minute inactivity window) before the
 * agent returns. Handoff entry tokens remain shorter; this lock is separate.
 */
export const DEVICE_HANDOFF_LOCK_TTL_MINUTES = 240;

const LOCK_TOKEN_BYTES = 32;
export const DEVICE_HANDOFF_LOCK_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function generateDeviceHandoffLockToken(): string {
  return randomBytes(LOCK_TOKEN_BYTES).toString("base64url");
}

export function hashDeviceHandoffLockToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function isWellFormedDeviceHandoffLockToken(
  value: unknown,
): value is string {
  return typeof value === "string" && DEVICE_HANDOFF_LOCK_TOKEN_RE.test(value);
}

export type DeviceHandoffLockCookieAttributes = {
  name: typeof DEVICE_HANDOFF_LOCK_COOKIE_NAME;
  value: string;
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: typeof DEVICE_HANDOFF_LOCK_COOKIE_PATH;
  maxAge: number;
};

export function buildDeviceHandoffLockCookieAttributes(options: {
  rawLockToken: string;
  ttlMinutes?: number;
}): DeviceHandoffLockCookieAttributes {
  return {
    name: DEVICE_HANDOFF_LOCK_COOKIE_NAME,
    value: options.rawLockToken,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: DEVICE_HANDOFF_LOCK_COOKIE_PATH,
    maxAge: (options.ttlMinutes ?? DEVICE_HANDOFF_LOCK_TTL_MINUTES) * 60,
  };
}

export function buildClearedDeviceHandoffLockCookieAttributes(): DeviceHandoffLockCookieAttributes {
  return {
    name: DEVICE_HANDOFF_LOCK_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: DEVICE_HANDOFF_LOCK_COOKIE_PATH,
    maxAge: 0,
  };
}

export type CreatedDeviceHandoffLock = {
  lockId: string;
  /** In-memory only for the lock cookie. Never persisted or logged. */
  rawLockToken: string;
  expiresAt: string;
};

function hashesMatch(left: string, right: unknown): boolean {
  if (typeof right !== "string" || right.length !== left.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/**
 * Create or replace the open device lock for a Signing when handoff begins.
 */
export async function createDeviceHandoffLock(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  agentUserId: string;
  handoffId?: string | null;
  ttlMinutes?: number;
}): Promise<CreatedDeviceHandoffLock> {
  const ttlMinutes = options.ttlMinutes ?? DEVICE_HANDOFF_LOCK_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  const { error: releasePriorError } = await options.admin
    .from("signing_device_handoff_locks")
    .update({
      released_at: new Date().toISOString(),
      release_reason: "SUPERSEDED_BY_NEW_HANDOFF",
    })
    .eq("signing_id", options.signingId)
    .is("released_at", null);
  if (releasePriorError) throw new Error(releasePriorError.message);

  const rawLockToken = generateDeviceHandoffLockToken();
  const { data, error } = await options.admin
    .from("signing_device_handoff_locks")
    .insert({
      signing_id: options.signingId,
      signing_participant_id: options.signingParticipantId,
      agent_user_id: options.agentUserId,
      lock_token_hash: hashDeviceHandoffLockToken(rawLockToken),
      expires_at: expiresAt,
      signing_in_person_handoff_id: options.handoffId ?? null,
    })
    .select("id, expires_at")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create device handoff lock.");
  }

  return {
    lockId: data.id as string,
    rawLockToken,
    expiresAt: (data.expires_at as string | null) ?? expiresAt,
  };
}

export type ValidatedDeviceHandoffLock = {
  lockId: string;
  signingId: string;
  signingParticipantId: string;
  agentUserId: string;
  expiresAt: string;
};

/**
 * Resolve the lock cookie to an open lock row, or null when absent/invalid.
 */
export async function validateDeviceHandoffLock(
  admin: SupabaseClient,
  rawLockToken: unknown,
): Promise<ValidatedDeviceHandoffLock | null> {
  if (!isWellFormedDeviceHandoffLockToken(rawLockToken)) {
    return null;
  }

  const lockTokenHash = hashDeviceHandoffLockToken(rawLockToken);
  const { data, error } = await admin
    .from("signing_device_handoff_locks")
    .select(
      "id, signing_id, signing_participant_id, agent_user_id, lock_token_hash, expires_at, released_at",
    )
    .eq("lock_token_hash", lockTokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !hashesMatch(lockTokenHash, data.lock_token_hash)) {
    return null;
  }
  if (data.released_at) return null;
  const expiresAt = data.expires_at as string;
  if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
    return null;
  }

  return {
    lockId: data.id as string,
    signingId: data.signing_id as string,
    signingParticipantId: data.signing_participant_id as string,
    agentUserId: data.agent_user_id as string,
    expiresAt,
  };
}

export type ReleaseDeviceHandoffLockResult = {
  signingId: string;
  releasedAt: string;
};

/**
 * Explicit agent unlock: must match lock issuer and pass password re-verification.
 */
export async function releaseDeviceHandoffLockWithActor(options: {
  admin: SupabaseClient;
  actor: SigningActor;
  rawLockToken: unknown;
  password: unknown;
  signInWithPassword: (credentials: {
    email: string;
    password: string;
  }) => Promise<{ error: { message: string } | null }>;
}): Promise<ReleaseDeviceHandoffLockResult> {
  if (typeof options.password !== "string" || !options.password) {
    throw new SigningError("INVALID_INPUT", "Enter your password to continue.");
  }

  const lock = await validateDeviceHandoffLock(options.admin, options.rawLockToken);
  if (!lock) {
    throw new SigningError(
      "CEREMONY_FORBIDDEN",
      "This device is not in an active handoff lock, or the lock expired.",
    );
  }

  if (lock.agentUserId !== options.actor.userId) {
    throw new SigningError(
      "FORBIDDEN",
      "Only the agent who started this in-person handoff can unlock this device.",
    );
  }

  const { data: profile, error: profileError } = await options.admin
    .from("profiles")
    .select("email")
    .eq("id", options.actor.userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  const email = profile?.email;
  if (typeof email !== "string" || !email.trim()) {
    throw new SigningError("NOT_READY", "Your account email is not available.");
  }

  const { error: authError } = await options.signInWithPassword({
    email: email.trim(),
    password: options.password,
  });
  if (authError) {
    throw new SigningError(
      "FORBIDDEN",
      "Password verification failed. The workspace stays locked.",
    );
  }

  const releasedAt = new Date().toISOString();
  const { data: released, error } = await options.admin
    .from("signing_device_handoff_locks")
    .update({
      released_at: releasedAt,
      release_reason: "AGENT_RETURN_TO_WORKSPACE",
    })
    .eq("id", lock.lockId)
    .eq("signing_id", lock.signingId)
    .eq("agent_user_id", options.actor.userId)
    .is("released_at", null)
    .select("signing_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!released) {
    throw new SigningError(
      "CONFLICT",
      "This device lock was already released. Reload and continue.",
    );
  }

  return {
    signingId: released.signing_id as string,
    releasedAt,
  };
}

/** Paths that remain reachable while the device handoff lock cookie is set. */
export function isPathAllowedDuringDeviceHandoffLock(pathname: string): boolean {
  return (
    pathname.startsWith("/sign") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth")
  );
}

export function parseSigningId(value: unknown): string | null {
  return isUuid(value) ? value : null;
}
