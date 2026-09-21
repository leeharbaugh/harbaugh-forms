/**
 * Bearer-in-URL infrastructure logging findings for Native Signing.
 *
 * Authoritative sources (re-verified 2026-09-21):
 * - https://vercel.com/docs/logs/runtime
 *   Runtime Logs expose `requestPath` as the actual URL path (e.g.
 *   `/blog/my-post`), distinct from the route pattern (`/blog/[slug]`).
 *   Retention: Hobby 1 hour; Pro 1 day; Observability Plus 30 days.
 * - https://vercel.com/docs/drains/reference/logs
 *   Log drains include `proxy.path` with the request path and query parameters.
 *   Sampling can filter by path prefix but does not redact path contents.
 * - https://vercel.com/docs/analytics/redacting-sensitive-data
 *   Web Analytics can redact/drop events via `beforeSend`; this does **not**
 *   redact Runtime Logs or Log Drains.
 *
 * Conclusion: placing a raw bearer in `/sign/[token]` or
 * `/sign/completed/[token]` can appear in Vercel Runtime Logs and Log Drains
 * when those products are used. Application code cannot suppress platform
 * requestPath capture. No project setting disables path logging.
 *
 * Mitigations in this scaffolding:
 * - Application routes must never log URL/token/cookie/hash/secret values.
 * - No `@vercel/analytics` is installed; no middleware captures paths.
 * - Referrer-Policy: no-referrer on bearer exchange responses.
 *
 * Production enablement blocker (not a scaffolding merge blocker):
 * Harden transport before Native Signing is enabled — prefer path-id +
 * fragment secret (or short-lived one-time exchange ticket) → HttpOnly
 * durable session. Completed-package non-expiring bearers are highest risk.
 */
export const BEARER_PATH_LOGGING_PRODUCTION_BLOCKER =
  "Vercel Runtime Logs requestPath and Log Drain proxy.path can capture bearer URL path segments; app code cannot redact them." as const;

export const BEARER_PATH_LOGGING_SOURCES = [
  "https://vercel.com/docs/logs/runtime",
  "https://vercel.com/docs/drains/reference/logs",
  "https://vercel.com/docs/analytics/redacting-sensitive-data",
] as const;
