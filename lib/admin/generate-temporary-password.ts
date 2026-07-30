/**
 * Secure temporary password generation (no secrets persisted).
 * Pure helpers — safe for unit tests (no path aliases).
 */

/** Keep in sync with lib/auth/password-policy MIN_PASSWORD_LENGTH. */
const MIN_TEMPORARY_PASSWORD_LENGTH = 8;

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function randomInt(maxExclusive: number): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0]! % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)]!;
}

export function generateTemporaryPassword(
  length = Math.max(16, MIN_TEMPORARY_PASSWORD_LENGTH),
): string {
  const size = Math.max(length, MIN_TEMPORARY_PASSWORD_LENGTH);
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest: string[] = [];
  for (let i = required.length; i < size; i += 1) {
    rest.push(pick(ALL));
  }
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join("");
}
