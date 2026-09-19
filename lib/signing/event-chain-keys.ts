/**
 * Native Signing Stage 6 protected event-chain keyring.
 *
 * Purpose-separated from credential wrap keys and Supabase service credentials.
 * Missing or malformed configuration fails closed for protected append/verify.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const EVENT_CHAIN_KEY_ID_ENV = "SIGNING_EVENT_CHAIN_KEY_ID" as const;
export const EVENT_CHAIN_KEY_ENV = "SIGNING_EVENT_CHAIN_KEY" as const;
export const EVENT_CHAIN_PREVIOUS_KEYS_ENV =
  "SIGNING_EVENT_CHAIN_PREVIOUS_KEYS" as const;

const KEY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MIN_KEY_PASSPHRASE_LENGTH = 32;
const HMAC_KEY_BYTES = 32;

export class SigningEventChainConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SigningEventChainConfigError";
  }
}

export type EventChainKeyring = {
  currentKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
};

function deriveKeyMaterial(raw: string): Buffer {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new SigningEventChainConfigError(
      "Signing event-chain key material is empty.",
    );
  }

  // Accept base64 of exactly 32 bytes, else derive via SHA-256 from a long passphrase.
  try {
    const asB64 = Buffer.from(trimmed, "base64");
    if (asB64.length === HMAC_KEY_BYTES && asB64.toString("base64") === trimmed) {
      return asB64;
    }
  } catch {
    // fall through
  }

  if (trimmed.length < MIN_KEY_PASSPHRASE_LENGTH) {
    throw new SigningEventChainConfigError(
      "Signing event-chain key passphrase is too short.",
    );
  }
  return createHash("sha256").update(trimmed, "utf8").digest();
}

function parsePreviousKeys(raw: string | undefined): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  if (!raw?.trim()) return map;

  // Format: id1:key1,id2:key2  (keys may be base64; id cannot contain ':')
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) {
      throw new SigningEventChainConfigError(
        "SIGNING_EVENT_CHAIN_PREVIOUS_KEYS entry is malformed.",
      );
    }
    const id = trimmed.slice(0, colon).trim();
    const keyRaw = trimmed.slice(colon + 1);
    if (!KEY_ID_RE.test(id)) {
      throw new SigningEventChainConfigError(
        "SIGNING_EVENT_CHAIN_PREVIOUS_KEYS contains an invalid key id.",
      );
    }
    map.set(id, deriveKeyMaterial(keyRaw));
  }
  return map;
}

/**
 * Load the current signing key plus any verify-only previous versions.
 * Encryption/MAC always uses `currentKeyId`.
 */
export function loadEventChainKeyringFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EventChainKeyring {
  const currentKeyId = env[EVENT_CHAIN_KEY_ID_ENV]?.trim();
  const currentKeyRaw = env[EVENT_CHAIN_KEY_ENV]?.trim();
  if (!currentKeyId || !KEY_ID_RE.test(currentKeyId)) {
    throw new SigningEventChainConfigError(
      "SIGNING_EVENT_CHAIN_KEY_ID is missing or invalid.",
    );
  }
  if (!currentKeyRaw) {
    throw new SigningEventChainConfigError(
      "SIGNING_EVENT_CHAIN_KEY is missing.",
    );
  }

  const keys = parsePreviousKeys(env[EVENT_CHAIN_PREVIOUS_KEYS_ENV]);
  keys.set(currentKeyId, deriveKeyMaterial(currentKeyRaw));
  return { currentKeyId, keys };
}

export function hmacSha256Hex(key: Buffer, data: Buffer | string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}

export function sha256HexBuffer(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function resolveEventChainKey(
  keyring: EventChainKeyring,
  keyId: string,
): Buffer {
  const key = keyring.keys.get(keyId);
  if (!key) {
    throw new SigningEventChainConfigError(
      `Signing event-chain key id is unavailable for verification.`,
    );
  }
  return key;
}
