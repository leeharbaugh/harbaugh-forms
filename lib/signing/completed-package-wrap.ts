/**
 * Native Signing completed-package credential wrapping.
 *
 * Purpose-separated from ceremony credential wraps (`credentials.ts`). Uses
 * distinct environment variables and AAD purpose `completed-package-v1` so
 * rotating either keyring is independent. Never falls back to Supabase keys.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { SigningError } from "./errors";

const WRAP_ENVELOPE_PREFIX = "v2.";
const WRAP_IV_BYTES = 12;
const WRAP_TAG_BYTES = 16;
const AES_256_KEY_BYTES = 32;
const MIN_WRAP_KEY_PASSPHRASE_LENGTH = 32;
const AAD_PURPOSE = "completed-package-v1";

export const COMPLETED_PACKAGE_WRAP_KEY_ID_ENV =
  "SIGNING_COMPLETED_PACKAGE_WRAP_KEY_ID" as const;
export const COMPLETED_PACKAGE_WRAP_KEY_ENV =
  "SIGNING_COMPLETED_PACKAGE_WRAP_KEY" as const;
export const COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV =
  "SIGNING_COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS" as const;

const WRAP_KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** 32 random bytes, base64url encoded (43 characters, no padding). */
export const COMPLETED_PACKAGE_TOKEN_BYTES = 32;
export const COMPLETED_PACKAGE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export class CompletedPackageWrapConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompletedPackageWrapConfigError";
  }
}

export type CompletedPackageWrapKeyring = {
  currentKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
};

/** Row identity bound into AES-GCM AAD. Exactly one recipient id is set. */
export type CompletedPackageWrapContext = {
  credentialId: string;
  signingId: string;
  signingParticipantId: string | null;
  signingCopyRecipientId: string | null;
};

export function generateCompletedPackageToken(): string {
  return randomBytes(COMPLETED_PACKAGE_TOKEN_BYTES).toString("base64url");
}

export function hashCompletedPackageToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function isWellFormedCompletedPackageToken(
  value: unknown,
): value is string {
  return typeof value === "string" && COMPLETED_PACKAGE_TOKEN_RE.test(value);
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
  const stripped = normalized.replace(/=+$/, "");
  if (decoded.toString("base64").replace(/=+$/, "") !== stripped) {
    return null;
  }
  return decoded;
}

export function deriveCompletedPackageWrapKey(
  material: unknown,
  label: string,
): Buffer {
  if (typeof material !== "string" || !material.trim()) {
    throw new CompletedPackageWrapConfigError(
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
  throw new CompletedPackageWrapConfigError(
    `${label} must be 32 bytes encoded as base64/base64url, or at least ${MIN_WRAP_KEY_PASSPHRASE_LENGTH} characters.`,
  );
}

function requireWrapKeyId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CompletedPackageWrapConfigError(`${label} is missing or empty.`);
  }
  const trimmed = value.trim();
  if (!WRAP_KEY_ID_RE.test(trimmed)) {
    throw new CompletedPackageWrapConfigError(
      `${label} must be a short alphanumeric key version id (for example "v1").`,
    );
  }
  return trimmed;
}

export function buildCompletedPackageWrapKeyring(options: {
  currentKeyId: unknown;
  currentKeyMaterial: unknown;
  previousKeys?: Iterable<{ keyId: unknown; keyMaterial: unknown }>;
}): CompletedPackageWrapKeyring {
  const currentKeyId = requireWrapKeyId(
    options.currentKeyId,
    COMPLETED_PACKAGE_WRAP_KEY_ID_ENV,
  );
  const keys = new Map<string, Buffer>([
    [
      currentKeyId,
      deriveCompletedPackageWrapKey(
        options.currentKeyMaterial,
        COMPLETED_PACKAGE_WRAP_KEY_ENV,
      ),
    ],
  ]);

  for (const previous of options.previousKeys ?? []) {
    const keyId = requireWrapKeyId(
      previous.keyId,
      COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV,
    );
    if (keys.has(keyId)) {
      throw new CompletedPackageWrapConfigError(
        `${COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV} repeats key id "${keyId}".`,
      );
    }
    keys.set(
      keyId,
      deriveCompletedPackageWrapKey(
        previous.keyMaterial,
        COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV,
      ),
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
        throw new CompletedPackageWrapConfigError(
          `${COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV} entries must be "keyId:keyMaterial" pairs separated by commas.`,
        );
      }
      return {
        keyId: entry.slice(0, separator),
        keyMaterial: entry.slice(separator + 1),
      };
    });
}

/**
 * Resolve the completed-package wrapping keyring.
 * Fail closed when keys are missing — no Supabase key fallback.
 */
export function resolveCompletedPackageWrapKeyring(
  env: NodeJS.ProcessEnv = process.env,
): CompletedPackageWrapKeyring {
  const keyId = env[COMPLETED_PACKAGE_WRAP_KEY_ID_ENV]?.trim();
  const keyMaterial = env[COMPLETED_PACKAGE_WRAP_KEY_ENV]?.trim();
  if (!keyId || !keyMaterial) {
    throw new CompletedPackageWrapConfigError(
      `Missing ${COMPLETED_PACKAGE_WRAP_KEY_ENV} and/or ${COMPLETED_PACKAGE_WRAP_KEY_ID_ENV}. Completed-package wrapping requires a dedicated key; the Supabase service key is not accepted.`,
    );
  }
  return buildCompletedPackageWrapKeyring({
    currentKeyId: keyId,
    currentKeyMaterial: keyMaterial,
    previousKeys: parsePreviousKeysSpec(
      env[COMPLETED_PACKAGE_WRAP_PREVIOUS_KEYS_ENV],
    ),
  });
}

function requireContextPart(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SigningError(
      "VALIDATION_FAILED",
      `Completed-package wrap context is missing ${label}.`,
    );
  }
  return value.trim();
}

function nullableIdPart(value: string | null | undefined): string {
  if (value == null || !String(value).trim()) return "null";
  return String(value).trim();
}

/**
 * AAD: purpose|credentialId|signingId|participantIdOrNull|copyRecipientIdOrNull|wrapKeyId
 */
export function buildCompletedPackageWrapAad(
  context: CompletedPackageWrapContext,
  wrapKeyId: string,
): Buffer {
  const participantId = context.signingParticipantId;
  const copyRecipientId = context.signingCopyRecipientId;
  const participantSet =
    participantId != null && String(participantId).trim().length > 0;
  const copySet =
    copyRecipientId != null && String(copyRecipientId).trim().length > 0;
  if (participantSet === copySet) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "Completed-package wrap context requires exactly one recipient id.",
    );
  }

  return Buffer.from(
    [
      AAD_PURPOSE,
      requireContextPart(context.credentialId, "credential id"),
      requireContextPart(context.signingId, "Signing id"),
      nullableIdPart(participantId),
      nullableIdPart(copyRecipientId),
      requireWrapKeyId(wrapKeyId, "wrap key id"),
    ].join("|"),
    "utf8",
  );
}

export type WrappedCompletedPackageToken = {
  wrapped: string;
  wrapKeyId: string;
};

export function wrapCompletedPackageTokenWithKeyring(options: {
  keyring: CompletedPackageWrapKeyring;
  rawToken: string;
  context: CompletedPackageWrapContext;
}): WrappedCompletedPackageToken {
  const wrapKeyId = options.keyring.currentKeyId;
  const key = options.keyring.keys.get(wrapKeyId);
  if (!key) {
    throw new CompletedPackageWrapConfigError(
      `Completed-package wrap keyring is missing material for its current key id "${wrapKeyId}".`,
    );
  }
  if (!isWellFormedCompletedPackageToken(options.rawToken)) {
    throw new SigningError(
      "VALIDATION_FAILED",
      "Refusing to wrap a malformed completed-package token.",
    );
  }

  const iv = randomBytes(WRAP_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(buildCompletedPackageWrapAad(options.context, wrapKeyId));
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

export function unwrapCompletedPackageTokenWithKeyring(options: {
  keyring: CompletedPackageWrapKeyring;
  wrapped: string | null | undefined;
  wrapKeyId: string | null | undefined;
  context: CompletedPackageWrapContext;
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
    decipher.setAAD(
      buildCompletedPackageWrapAad(options.context, wrapKeyId.trim()),
    );
    decipher.setAuthTag(tag);
    const raw = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return isWellFormedCompletedPackageToken(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function wrapCompletedPackageToken(options: {
  rawToken: string;
  context: CompletedPackageWrapContext;
}): WrappedCompletedPackageToken {
  return wrapCompletedPackageTokenWithKeyring({
    keyring: resolveCompletedPackageWrapKeyring(),
    rawToken: options.rawToken,
    context: options.context,
  });
}

export function unwrapCompletedPackageToken(options: {
  wrapped: string | null | undefined;
  wrapKeyId: string | null | undefined;
  context: CompletedPackageWrapContext;
}): string | null {
  return unwrapCompletedPackageTokenWithKeyring({
    keyring: resolveCompletedPackageWrapKeyring(),
    wrapped: options.wrapped,
    wrapKeyId: options.wrapKeyId,
    context: options.context,
  });
}
