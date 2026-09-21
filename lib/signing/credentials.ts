/**
 * Native Signing Stage 4 participant credentials.
 *
 * A participant credential is an opaque bearer token delivered only to the
 * participant. Authentication uses the SHA-256 hex digest (`token_hash`) only:
 * nothing in the authentication path ever decrypts anything.
 *
 * For invitation retry (same link, same credential), the server also stores an
 * AES-256-GCM wrapped copy (`token_wrapped`) plus the id of the wrapping key
 * version (`wrap_key_id`). That ciphertext is never a browser verifier, never
 * logged, and never placed in events or work-item reference JSON.
 *
 * Wrapping keys are purpose-separated and required: the Supabase service key is
 * never used as wrapping key material, so rotating database credentials and
 * rotating the credential wrap key are independent operations. Missing or
 * malformed key configuration fails closed.
 *
 * Credentials are unusable while the Signing is still Draft.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertSigningExternalAccessActive,
  isCredentialEpochCurrent,
  requireIssuanceAccessEpoch,
} from "./external-access";
import { SigningError } from "./errors";

/** 32 random bytes, base64url encoded (43 characters, no padding). */
const CREDENTIAL_TOKEN_BYTES = 32;

export const PARTICIPANT_CREDENTIAL_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Envelope version for AAD-bound wraps written against a named key version.
 * Pre-Stage-4-review `v1.` envelopes (no AAD, service-key derived) are not
 * accepted: those credentials must be re-issued rather than silently unwrapped.
 */
const WRAP_ENVELOPE_PREFIX = "v2.";
const WRAP_IV_BYTES = 12;
const WRAP_TAG_BYTES = 16;
const AES_256_KEY_BYTES = 32;
/** A non-base64 secret must carry at least this much material before hashing. */
const MIN_WRAP_KEY_PASSPHRASE_LENGTH = 32;

export const WRAP_KEY_ID_ENV = "SIGNING_CREDENTIAL_WRAP_KEY_ID" as const;
export const WRAP_KEY_ENV = "SIGNING_CREDENTIAL_WRAP_KEY" as const;
export const WRAP_PREVIOUS_KEYS_ENV =
  "SIGNING_CREDENTIAL_WRAP_PREVIOUS_KEYS" as const;

const WRAP_KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Configuration is a deployment error, not a per-request Signing outcome. */
export class SigningCredentialWrapConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SigningCredentialWrapConfigError";
  }
}

/**
 * Current key version plus any decrypt-only previous versions.
 * Encryption always uses `currentKeyId`; decryption selects by the key id
 * recorded on the credential row.
 */
export type CredentialWrapKeyring = {
  currentKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
};

/** Row identity bound into the AES-GCM authenticated associated data. */
export type CredentialWrapContext = {
  credentialId: string;
  signingId: string;
  signingParticipantId: string;
};

export type IssuedParticipantCredential = {
  credentialId: string;
  wrapKeyId: string;
  /** In-memory only for immediate delivery. Prefer unwrap for retries. */
  rawToken: string;
};

export function generateParticipantCredentialToken(): string {
  return randomBytes(CREDENTIAL_TOKEN_BYTES).toString("base64url");
}

export function hashParticipantCredentialToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function decodeBase64KeyMaterial(material: string): Buffer | null {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(material)) {
    return null;
  }
  const normalized = material.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length !== AES_256_KEY_BYTES) {
    return null;
  }
  // Buffer's base64 decoder silently skips characters it cannot use, so the
  // round trip is what actually proves the input was well-formed base64.
  const stripped = normalized.replace(/=+$/, "");
  if (decoded.toString("base64").replace(/=+$/, "") !== stripped) {
    return null;
  }
  return decoded;
}

/**
 * Turn configured key material into a 32-byte AES-256 key.
 *
 * Accepts either 32 raw bytes encoded as base64/base64url (preferred) or a
 * passphrase of at least 32 characters, which is SHA-256'd. Anything shorter
 * fails closed rather than being stretched into a weak key.
 */
export function deriveCredentialWrapKey(
  material: unknown,
  label: string,
): Buffer {
  if (typeof material !== "string" || !material.trim()) {
    throw new SigningCredentialWrapConfigError(
      `${label} is missing or empty.`,
    );
  }
  const trimmed = material.trim();
  const decoded = decodeBase64KeyMaterial(trimmed);
  if (decoded) {
    return decoded;
  }
  if (trimmed.length >= MIN_WRAP_KEY_PASSPHRASE_LENGTH) {
    return createHash("sha256").update(trimmed, "utf8").digest();
  }
  throw new SigningCredentialWrapConfigError(
    `${label} must be 32 bytes encoded as base64/base64url, or at least ${MIN_WRAP_KEY_PASSPHRASE_LENGTH} characters.`,
  );
}

function requireWrapKeyId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SigningCredentialWrapConfigError(`${label} is missing or empty.`);
  }
  const trimmed = value.trim();
  if (!WRAP_KEY_ID_RE.test(trimmed)) {
    throw new SigningCredentialWrapConfigError(
      `${label} must be a short alphanumeric key version id (for example "v1").`,
    );
  }
  return trimmed;
}

/**
 * Build a keyring explicitly. Exported so wrap/unwrap behaviour, including key
 * rotation, is testable without any environment or database dependency.
 */
export function buildCredentialWrapKeyring(options: {
  currentKeyId: unknown;
  currentKeyMaterial: unknown;
  previousKeys?: Iterable<{ keyId: unknown; keyMaterial: unknown }>;
}): CredentialWrapKeyring {
  const currentKeyId = requireWrapKeyId(options.currentKeyId, WRAP_KEY_ID_ENV);
  const keys = new Map<string, Buffer>([
    [currentKeyId, deriveCredentialWrapKey(options.currentKeyMaterial, WRAP_KEY_ENV)],
  ]);

  for (const previous of options.previousKeys ?? []) {
    const keyId = requireWrapKeyId(previous.keyId, WRAP_PREVIOUS_KEYS_ENV);
    if (keys.has(keyId)) {
      throw new SigningCredentialWrapConfigError(
        `${WRAP_PREVIOUS_KEYS_ENV} repeats key id "${keyId}".`,
      );
    }
    keys.set(
      keyId,
      deriveCredentialWrapKey(previous.keyMaterial, WRAP_PREVIOUS_KEYS_ENV),
    );
  }

  return { currentKeyId, keys };
}

function parsePreviousKeysSpec(
  spec: string | undefined,
): { keyId: string; keyMaterial: string }[] {
  if (!spec || !spec.trim()) {
    return [];
  }
  return spec
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator <= 0 || separator === entry.length - 1) {
        throw new SigningCredentialWrapConfigError(
          `${WRAP_PREVIOUS_KEYS_ENV} entries must be "keyId:keyMaterial" pairs separated by commas.`,
        );
      }
      return {
        keyId: entry.slice(0, separator),
        keyMaterial: entry.slice(separator + 1),
      };
    });
}

/**
 * Resolve the wrapping keyring from purpose-separated environment variables.
 *
 * There is deliberately no fallback to the Supabase secret / service-role key:
 * database credentials must not double as long-lived encryption keys, and a
 * boundary test asserts those names appear nowhere in this module.
 */
export function resolveCredentialWrapKeyring(
  env: NodeJS.ProcessEnv = process.env,
): CredentialWrapKeyring {
  const keyId = env[WRAP_KEY_ID_ENV]?.trim();
  const keyMaterial = env[WRAP_KEY_ENV]?.trim();
  if (!keyId || !keyMaterial) {
    throw new SigningCredentialWrapConfigError(
      `Missing ${WRAP_KEY_ENV} and/or ${WRAP_KEY_ID_ENV}. Native Signing credential wrapping requires a dedicated key; the Supabase service key is not accepted.`,
    );
  }
  return buildCredentialWrapKeyring({
    currentKeyId: keyId,
    currentKeyMaterial: keyMaterial,
    previousKeys: parsePreviousKeysSpec(env[WRAP_PREVIOUS_KEYS_ENV]),
  });
}

function requireContextPart(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SigningError(
      "VALIDATION_FAILED",
      `Credential wrap context is missing ${label}.`,
    );
  }
  return value.trim();
}

/**
 * Authenticated associated data binding a wrapped bearer to exactly one
 * credential row, Signing, participant, and key version. Moving ciphertext
 * between rows, Signings, or key versions fails the GCM tag check.
 */
export function buildCredentialWrapAad(
  context: CredentialWrapContext,
  wrapKeyId: string,
): Buffer {
  return Buffer.from(
    [
      requireContextPart(context.credentialId, "credential id"),
      requireContextPart(context.signingId, "Signing id"),
      requireContextPart(context.signingParticipantId, "participant id"),
      requireWrapKeyId(wrapKeyId, "wrap key id"),
    ].join("|"),
    "utf8",
  );
}

export type WrappedParticipantCredential = {
  wrapped: string;
  wrapKeyId: string;
};

/** Pure wrap against an explicit keyring. Always uses the current key version. */
export function wrapParticipantCredentialTokenWithKeyring(options: {
  keyring: CredentialWrapKeyring;
  rawToken: string;
  context: CredentialWrapContext;
}): WrappedParticipantCredential {
  const wrapKeyId = options.keyring.currentKeyId;
  const key = options.keyring.keys.get(wrapKeyId);
  if (!key) {
    throw new SigningCredentialWrapConfigError(
      `Credential wrap keyring is missing material for its current key id "${wrapKeyId}".`,
    );
  }
  if (!isWellFormedParticipantCredentialToken(options.rawToken)) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "Refusing to wrap a malformed credential token.",
    );
  }

  const iv = randomBytes(WRAP_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(buildCredentialWrapAad(options.context, wrapKeyId));
  const ciphertext = Buffer.concat([
    cipher.update(options.rawToken, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    wrapKeyId,
    wrapped:
      WRAP_ENVELOPE_PREFIX +
      Buffer.concat([iv, tag, ciphertext]).toString("base64url"),
  };
}

/**
 * Pure unwrap against an explicit keyring.
 *
 * Fails closed (null) for an unknown key id, an unsupported envelope, tampered
 * ciphertext, or a context/AAD mismatch. Never throws on attacker-controlled
 * input so callers cannot distinguish failure modes.
 */
export function unwrapParticipantCredentialTokenWithKeyring(options: {
  keyring: CredentialWrapKeyring;
  wrapped: string | null | undefined;
  wrapKeyId: string | null | undefined;
  context: CredentialWrapContext;
}): string | null {
  const { wrapped, wrapKeyId } = options;
  if (!wrapped || !wrapped.startsWith(WRAP_ENVELOPE_PREFIX)) {
    return null;
  }
  if (typeof wrapKeyId !== "string" || !wrapKeyId.trim()) {
    return null;
  }
  const key = options.keyring.keys.get(wrapKeyId.trim());
  if (!key) {
    return null;
  }

  try {
    const payload = Buffer.from(
      wrapped.slice(WRAP_ENVELOPE_PREFIX.length),
      "base64url",
    );
    if (payload.length < WRAP_IV_BYTES + WRAP_TAG_BYTES + 1) {
      return null;
    }
    const iv = payload.subarray(0, WRAP_IV_BYTES);
    const tag = payload.subarray(WRAP_IV_BYTES, WRAP_IV_BYTES + WRAP_TAG_BYTES);
    const ciphertext = payload.subarray(WRAP_IV_BYTES + WRAP_TAG_BYTES);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(buildCredentialWrapAad(options.context, wrapKeyId.trim()));
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

/** Server-only wrap of the raw bearer for invitation retry. */
export function wrapParticipantCredentialToken(options: {
  rawToken: string;
  context: CredentialWrapContext;
}): WrappedParticipantCredential {
  return wrapParticipantCredentialTokenWithKeyring({
    keyring: resolveCredentialWrapKeyring(),
    rawToken: options.rawToken,
    context: options.context,
  });
}

/** Server-only unwrap for invitation retry. Returns null if unwrap fails. */
export function unwrapParticipantCredentialToken(options: {
  wrapped: string | null | undefined;
  wrapKeyId: string | null | undefined;
  context: CredentialWrapContext;
}): string | null {
  return unwrapParticipantCredentialTokenWithKeyring({
    keyring: resolveCredentialWrapKeyring(),
    wrapped: options.wrapped,
    wrapKeyId: options.wrapKeyId,
    context: options.context,
  });
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
 *
 * The credential id is generated before wrapping so the ciphertext can be bound
 * to its own row identity through AAD.
 */
export async function issueParticipantCredentialsForActivation(options: {
  admin: SupabaseClient;
  signingId: string;
  participantIds: string[];
  issuedByUserId: string;
}): Promise<Map<string, IssuedParticipantCredential>> {
  const issued = new Map<string, IssuedParticipantCredential>();
  // Resolved once up front so a misconfigured deployment fails before any
  // credential row is written.
  const keyring = resolveCredentialWrapKeyring();
  const accessEpoch = await requireIssuanceAccessEpoch(options.admin);

  for (const participantId of options.participantIds) {
    const credentialId = randomUUID();
    const rawToken = generateParticipantCredentialToken();
    const { wrapped, wrapKeyId } = wrapParticipantCredentialTokenWithKeyring({
      keyring,
      rawToken,
      context: {
        credentialId,
        signingId: options.signingId,
        signingParticipantId: participantId,
      },
    });

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
        id: credentialId,
        signing_id: options.signingId,
        signing_participant_id: participantId,
        token_hash: hashParticipantCredentialToken(rawToken),
        token_wrapped: wrapped,
        wrap_key_id: wrapKeyId,
        issued_by_user_id: options.issuedByUserId,
        is_current: true,
        access_epoch: accessEpoch,
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
        .update({ replaced_by_credential_id: credentialId })
        .eq("id", priorCurrent.id as string)
        .eq("signing_id", options.signingId);
    }

    issued.set(participantId, { credentialId, wrapKeyId, rawToken });
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
 * Authentication is hash-only: `token_wrapped` is never read or decrypted here.
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
  // Order: suspension → structure → epoch → hash/revoke → lifecycle → scope.
  // Generic null on every failure; never leak epoch values.
  const currentEpoch = await assertSigningExternalAccessActive(admin);
  if (!currentEpoch) {
    return null;
  }
  if (!isWellFormedParticipantCredentialToken(rawToken)) {
    return null;
  }

  const { data: credential, error } = await admin
    .from("signing_participant_credentials")
    .select(
      "id, signing_id, signing_participant_id, is_current, revoked_at, access_epoch",
    )
    .eq("token_hash", hashParticipantCredentialToken(rawToken))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!credential) {
    return null;
  }
  if (
    !isCredentialEpochCurrent(
      credential.access_epoch as string | null,
      currentEpoch,
    )
  ) {
    return null;
  }
  if (credential.revoked_at || credential.is_current !== true) {
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

/** Constant-time hash comparison for values the server itself derived. */
function hashesMatch(left: string, right: unknown): boolean {
  if (typeof right !== "string" || right.length !== left.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/**
 * Load the raw bearer for an existing current credential (invitation retry).
 *
 * Uses server-only unwrap with AAD reconstructed from the stored row, so a
 * ciphertext copied from another credential or Signing fails closed. Never log
 * the returned value.
 */
export async function loadRawParticipantCredentialToken(options: {
  admin: SupabaseClient;
  signingId: string;
  credentialId: string;
}): Promise<string | null> {
  const { data, error } = await options.admin
    .from("signing_participant_credentials")
    .select(
      "id, signing_id, signing_participant_id, token_wrapped, wrap_key_id, token_hash, is_current, revoked_at",
    )
    .eq("id", options.credentialId)
    .eq("signing_id", options.signingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.revoked_at || data.is_current !== true) {
    return null;
  }

  const raw = unwrapParticipantCredentialToken({
    wrapped: data.token_wrapped as string | null,
    wrapKeyId: data.wrap_key_id as string | null,
    context: {
      credentialId: data.id as string,
      signingId: data.signing_id as string,
      signingParticipantId: data.signing_participant_id as string,
    },
  });
  if (!raw) return null;
  if (!hashesMatch(hashParticipantCredentialToken(raw), data.token_hash)) {
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
