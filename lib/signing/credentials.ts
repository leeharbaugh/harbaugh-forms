/**
 * Native Signing Stage 4 participant credentials.
 *
 * A participant credential is an opaque bearer token delivered only to the
 * participant. Authentication uses the SHA-256 hex digest only.
 *
 * For invitation retry (same link, same credential), the server also stores an
 * AES-GCM wrapped copy (`token_wrapped`) decryptable only with a server wrap
 * key. That ciphertext is never a browser verifier, never logged, and never
 * placed in events or work-item reference JSON.
 *
 * Credentials are unusable while the Signing is still Draft.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";

/** 32 random bytes, base64url encoded (43 characters, no padding). */
const CREDENTIAL_TOKEN_BYTES = 32;
const WRAP_PREFIX = "v1.";

export const PARTICIPANT_CREDENTIAL_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export type IssuedParticipantCredential = {
  credentialId: string;
  /** In-memory only for immediate delivery. Prefer unwrap for retries. */
  rawToken: string;
};

export function generateParticipantCredentialToken(): string {
  return randomBytes(CREDENTIAL_TOKEN_BYTES).toString("base64url");
}

export function hashParticipantCredentialToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function resolveCredentialWrapKey(): Buffer {
  const explicit = process.env.SIGNING_CREDENTIAL_WRAP_KEY?.trim();
  const material =
    explicit && explicit.length > 0
      ? explicit
      : process.env.SUPABASE_SECRET_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!material) {
    throw new Error(
      "Missing SIGNING_CREDENTIAL_WRAP_KEY (or SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY) for credential wrap.",
    );
  }
  return createHash("sha256").update(material, "utf8").digest();
}

/** Server-only wrap of the raw bearer for invitation retry. */
export function wrapParticipantCredentialToken(rawToken: string): string {
  const key = resolveCredentialWrapKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(rawToken, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    WRAP_PREFIX +
    Buffer.concat([iv, tag, ciphertext]).toString("base64url")
  );
}

/** Server-only unwrap for invitation retry. Returns null if unwrap fails. */
export function unwrapParticipantCredentialToken(
  wrapped: string | null | undefined,
): string | null {
  if (!wrapped || !wrapped.startsWith(WRAP_PREFIX)) {
    return null;
  }
  try {
    const payload = Buffer.from(wrapped.slice(WRAP_PREFIX.length), "base64url");
    if (payload.length < 12 + 16 + 1) {
      return null;
    }
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const ciphertext = payload.subarray(28);
    const key = resolveCredentialWrapKey();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const raw = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return isWellFormedParticipantCredentialToken(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function isWellFormedParticipantCredentialToken(
  value: unknown,
): value is string {
  return (
    typeof value === "string" && PARTICIPANT_CREDENTIAL_TOKEN_RE.test(value)
  );
}

/**
 * Issue one current credential per participant as part of activation.
 * Any pre-existing current credential is superseded rather than duplicated.
 */
export async function issueParticipantCredentialsForActivation(options: {
  admin: SupabaseClient;
  signingId: string;
  participantIds: string[];
  issuedByUserId: string;
}): Promise<Map<string, IssuedParticipantCredential>> {
  const issued = new Map<string, IssuedParticipantCredential>();

  for (const participantId of options.participantIds) {
    const rawToken = generateParticipantCredentialToken();

    const { data: priorCurrent, error: priorError } = await options.admin
      .from("signing_participant_credentials")
      .select("id")
      .eq("signing_id", options.signingId)
      .eq("signing_participant_id", participantId)
      .eq("is_current", true)
      .is("revoked_at", null)
      .maybeSingle();
    if (priorError) throw new Error(priorError.message);

    if (priorCurrent) {
      const { error: supersedeError } = await options.admin
        .from("signing_participant_credentials")
        .update({
          is_current: false,
          revoked_at: new Date().toISOString(),
          revoked_reason: "REPLACED_ON_ACTIVATION",
        })
        .eq("id", priorCurrent.id as string)
        .eq("signing_id", options.signingId);
      if (supersedeError) throw new Error(supersedeError.message);
    }

    const { data: inserted, error: insertError } = await options.admin
      .from("signing_participant_credentials")
      .insert({
        signing_id: options.signingId,
        signing_participant_id: participantId,
        token_hash: hashParticipantCredentialToken(rawToken),
        token_wrapped: wrapParticipantCredentialToken(rawToken),
        issued_by_user_id: options.issuedByUserId,
        is_current: true,
      })
      .select("id")
      .single();
    if (insertError || !inserted) {
      throw new Error(
        insertError?.message ?? "Failed to issue participant credential.",
      );
    }

    if (priorCurrent) {
      await options.admin
        .from("signing_participant_credentials")
        .update({ replaced_by_credential_id: inserted.id as string })
        .eq("id", priorCurrent.id as string)
        .eq("signing_id", options.signingId);
    }

    issued.set(participantId, {
      credentialId: inserted.id as string,
      rawToken,
    });
  }

  return issued;
}

export type ValidatedParticipantCredential = {
  credentialId: string;
  signingId: string;
  signingParticipantId: string;
  participantFullName: string;
  participantEmail: string;
  signingTitle: string;
};

/**
 * Resolve a raw bearer token to its participant.
 *
 * Returns null for every failure mode (unknown, revoked, superseded, or a
 * Signing that is not IN_PROGRESS) so possession of a token never reveals
 * whether a Signing exists or what state it is in. Draft Signings are
 * explicitly unusable: credentials only work after activation.
 */
export async function validateParticipantCredential(
  admin: SupabaseClient,
  rawToken: unknown,
): Promise<ValidatedParticipantCredential | null> {
  if (!isWellFormedParticipantCredentialToken(rawToken)) {
    return null;
  }

  const { data: credential, error } = await admin
    .from("signing_participant_credentials")
    .select(
      "id, signing_id, signing_participant_id, is_current, revoked_at",
    )
    .eq("token_hash", hashParticipantCredentialToken(rawToken))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!credential || credential.revoked_at || credential.is_current !== true) {
    return null;
  }

  const [{ data: signing, error: signingError }, { data: participant, error: participantError }] =
    await Promise.all([
      admin
        .from("signings")
        .select("id, title, lifecycle_state")
        .eq("id", credential.signing_id as string)
        .maybeSingle(),
      admin
        .from("signing_participants")
        .select("id, full_name, email, participant_status")
        .eq("id", credential.signing_participant_id as string)
        .eq("signing_id", credential.signing_id as string)
        .maybeSingle(),
    ]);
  if (signingError) throw new Error(signingError.message);
  if (participantError) throw new Error(participantError.message);

  if (!signing || signing.lifecycle_state !== "IN_PROGRESS") {
    return null;
  }
  if (!participant || participant.participant_status === "REMOVED") {
    return null;
  }

  return {
    credentialId: credential.id as string,
    signingId: signing.id as string,
    signingParticipantId: participant.id as string,
    participantFullName: participant.full_name as string,
    participantEmail: participant.email as string,
    signingTitle: signing.title as string,
  };
}

/**
 * Load the raw bearer for an existing current credential (invitation retry).
 * Uses server-only unwrap. Never log the returned value.
 */
export async function loadRawParticipantCredentialToken(options: {
  admin: SupabaseClient;
  signingId: string;
  credentialId: string;
}): Promise<string | null> {
  const { data, error } = await options.admin
    .from("signing_participant_credentials")
    .select("token_wrapped, token_hash, is_current, revoked_at")
    .eq("id", options.credentialId)
    .eq("signing_id", options.signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.revoked_at || data.is_current !== true) {
    return null;
  }
  const raw = unwrapParticipantCredentialToken(
    data.token_wrapped as string | null,
  );
  if (!raw) return null;
  if (hashParticipantCredentialToken(raw) !== data.token_hash) {
    return null;
  }
  return raw;
}

/** Guard for callers that must not accept a token-shaped value by accident. */
export function assertWellFormedParticipantCredentialToken(
  value: unknown,
): string {
  if (!isWellFormedParticipantCredentialToken(value)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing link.");
  }
  return value;
}
