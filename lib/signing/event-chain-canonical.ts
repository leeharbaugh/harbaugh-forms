/**
 * Deterministic canonical encoding for Native Signing protected event chain v1.
 *
 * Does not rely on JSON key order. Sanitizes details before hashing.
 */
import { sha256HexBuffer } from "./event-chain-keys";

export const EVENT_CHAIN_FORMAT_VERSION = "v1" as const;

const BLOCKED_DETAIL_KEYS = new Set([
  "ip",
  "ipAddress",
  "ip_address",
  "userAgent",
  "user_agent",
  "ua",
  "sessionId",
  "session_id",
  "browserSessionId",
  "browser_session_id",
  "rawToken",
  "token",
  "accessToken",
  "access_token",
  "credentialToken",
  "password",
  "wrapKey",
  "wrappingKey",
  "wrapSecret",
  "integrityKey",
  "integrity_key",
  "hmac",
  "hmacTag",
  "hmac_tag",
  "authenticationTag",
  "authentication_tag",
  "priorEventDigest",
  "eventDigest",
]);

export type CanonicalSigningEventInput = {
  signingId: string;
  sequenceNumber: number;
  eventType: string;
  actorType: string;
  actorUserId: string | null;
  actorParticipantId: string | null;
  actorDisplayName: string | null;
  visibility: string;
  packageRevisionId: string | null;
  signingDocumentVersionId: string | null;
  signingFieldId: string | null;
  signingFieldPlacementId: string | null;
  summary: string | null;
  detailsJson: unknown;
  /** Normalized UTC ISO-8601; MAC-covered wall-clock evidence. */
  eventOccurredAt: string;
  priorEventDigest: string;
  idempotencyKey: string | null;
};

/**
 * Normalize timestamptz round-trips to a stable UTC ISO string before hashing.
 */
export function normalizeEventOccurredAt(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error("Canonical eventOccurredAt must be a valid timestamp.");
  }
  return new Date(ms).toISOString();
}

function encodeNull(): string {
  return "N";
}

function encodeString(value: string | null | undefined): string {
  if (value == null) return encodeNull();
  const utf8 = Buffer.from(value, "utf8");
  return `S${utf8.length}:${utf8.toString("utf8")}`;
}

function encodeNumber(value: number): string {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error("Canonical event sequence must be a finite integer.");
  }
  return `I${value}`;
}

function sanitizeDetails(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDetails(entry));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    ).sort(([a], [b]) => a.localeCompare(b))) {
      if (BLOCKED_DETAIL_KEYS.has(key)) continue;
      out[key] = sanitizeDetails(entry);
    }
    return out;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return null;
}

function encodeJson(value: unknown): string {
  const sanitized = sanitizeDetails(value);
  if (sanitized == null) return encodeNull();
  const json = JSON.stringify(sanitized);
  return encodeString(json);
}

/**
 * Length-prefixed field concatenation. Field order is part of the format.
 */
export function canonicalizeSigningEventV1(
  input: CanonicalSigningEventInput,
): Buffer {
  const parts = [
    encodeString(EVENT_CHAIN_FORMAT_VERSION),
    encodeString(input.signingId),
    encodeNumber(input.sequenceNumber),
    encodeString(input.eventType),
    encodeString(input.actorType),
    encodeString(input.actorUserId),
    encodeString(input.actorParticipantId),
    encodeString(input.actorDisplayName),
    encodeString(input.visibility),
    encodeString(input.packageRevisionId),
    encodeString(input.signingDocumentVersionId),
    encodeString(input.signingFieldId),
    encodeString(input.signingFieldPlacementId),
    encodeString(input.summary),
    encodeJson(input.detailsJson),
    encodeString(normalizeEventOccurredAt(input.eventOccurredAt)),
    encodeString(input.priorEventDigest),
    encodeString(input.idempotencyKey),
  ];
  return Buffer.from(parts.join("|"), "utf8");
}

export function digestCanonicalEvent(canonical: Buffer): string {
  return sha256HexBuffer(canonical);
}

/**
 * Genesis prior digest for a Signing chain checkpoint.
 * Binds format version, signing id, and unprotected prefix end sequence.
 */
export function buildGenesisPriorDigest(options: {
  signingId: string;
  unprotectedPrefixEndSequence: number;
}): string {
  const payload = [
    encodeString(EVENT_CHAIN_FORMAT_VERSION),
    encodeString("GENESIS"),
    encodeString(options.signingId),
    encodeNumber(options.unprotectedPrefixEndSequence),
  ].join("|");
  return sha256HexBuffer(payload);
}

export { sanitizeDetails as sanitizeSigningEventDetails };
