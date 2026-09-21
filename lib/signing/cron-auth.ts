/**
 * Vercel Cron authentication for Native Signing worker adapter.
 *
 * Prefer CRON_SECRET (Vercel-native Authorization: Bearer) over reusing
 * SIGNING_WORKER_SECRET so Cron and manual worker auth remain separable.
 */
import { timingSafeEqual } from "node:crypto";

export const CRON_SECRET_ENV = "CRON_SECRET" as const;

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * True when Authorization is exactly `Bearer <CRON_SECRET>`.
 * Missing/empty CRON_SECRET fails closed.
 */
export function verifyCronAuthorization(
  authorizationHeader: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = env[CRON_SECRET_ENV]?.trim();
  if (!expected || !authorizationHeader) {
    return false;
  }
  const trimmed = authorizationHeader.trim();
  const prefix = "Bearer ";
  if (!trimmed.startsWith(prefix)) {
    return false;
  }
  const provided = trimmed.slice(prefix.length).trim();
  if (!provided) {
    return false;
  }
  return secretsMatch(provided, expected);
}
