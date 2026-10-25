/**
 * Optional Reply-To for Native Signing emails. `SIGNING_EMAIL_FROM` may be a
 * sending-only domain with no mailbox, so replies go to this address instead.
 */
export const SIGNING_EMAIL_REPLY_TO_ENV = "SIGNING_EMAIL_REPLY_TO" as const;

/** One plain address; display names and lists are rejected. */
const PLAIN_EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

export type SigningEmailReplyTo =
  | { ok: true; replyTo: string | null }
  | { ok: false };

/** Unset or blank means no Reply-To. A set but malformed value is a configuration error. */
export function resolveSigningEmailReplyTo(
  env: NodeJS.ProcessEnv = process.env,
): SigningEmailReplyTo {
  const raw = env[SIGNING_EMAIL_REPLY_TO_ENV]?.trim();
  if (!raw) return { ok: true, replyTo: null };
  return PLAIN_EMAIL_RE.test(raw) ? { ok: true, replyTo: raw } : { ok: false };
}
