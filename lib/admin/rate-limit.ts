/**
 * Lightweight in-process rate / duplicate-submission guard for Global Admin
 * destructive actions. Not a distributed limiter; serverless instances are
 * independent, but this still blocks rapid double-clicks and retries.
 * Pure module (no server-only) so unit tests can exercise it directly.
 */

type RateBucket = {
  count: number;
  windowStartedAt: number;
  lastAt: number;
};

const buckets = new Map<string, RateBucket>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 8;
const MIN_INTERVAL_MS = 1_500;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; error: string; retryAfterMs: number };

export function assertAdminActionRateLimit(options: {
  actorUserId: string;
  action: string;
  maxPerWindow?: number;
  windowMs?: number;
  minIntervalMs?: number;
}): RateLimitResult {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxPerWindow = options.maxPerWindow ?? DEFAULT_MAX;
  const minIntervalMs = options.minIntervalMs ?? MIN_INTERVAL_MS;
  const key = `${options.actorUserId}:${options.action}`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStartedAt >= windowMs) {
    buckets.set(key, { count: 1, windowStartedAt: now, lastAt: now });
    return { ok: true };
  }

  if (now - existing.lastAt < minIntervalMs) {
    return {
      ok: false,
      error: "Please wait a moment before retrying this action.",
      retryAfterMs: minIntervalMs - (now - existing.lastAt),
    };
  }

  if (existing.count >= maxPerWindow) {
    const retryAfterMs = windowMs - (now - existing.windowStartedAt);
    return {
      ok: false,
      error: "Too many attempts. Try again shortly.",
      retryAfterMs,
    };
  }

  existing.count += 1;
  existing.lastAt = now;
  return { ok: true };
}

/** Test helper — clears all buckets. */
export function resetAdminActionRateLimitsForTests(): void {
  buckets.clear();
}
