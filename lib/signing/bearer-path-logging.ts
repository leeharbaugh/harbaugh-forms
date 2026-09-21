/**
 * Bearer-in-URL infrastructure logging findings for Native Signing.
 *
 * Authoritative sources (2026-09-21 research):
 * - https://vercel.com/docs/logs/runtime
 *   Runtime Logs expose `requestPath` as the actual URL path (e.g.
 *   `/blog/my-post`), distinct from the route pattern (`/blog/[slug]`).
 * - https://vercel.com/docs/drains/reference/logs
 *   Log drains include `proxy.path` with the request path and query parameters.
 * - https://vercel.com/docs/analytics/redacting-sensitive-data
 *   Web Analytics can redact/drop events via `beforeSend`; this does **not**
 *   redact Runtime Logs or Log Drains.
 *
 * Conclusion: placing a raw bearer in `/sign/[token]` or
 * `/sign/completed/[token]` can appear in Vercel Runtime Logs and Log Drains
 * when those products are used. Application code cannot suppress platform
 * requestPath capture.
 *
 * Mitigations in this scaffolding:
 * - Application routes must never log URL/token/cookie/hash/secret values.
 * - No `@vercel/analytics` is installed; no middleware captures paths.
 * - Referrer-Policy: no-referrer on bearer exchange responses.
 * - Residual production enablement blocker: until ticket-based exchange
 *   architecture or verified operational log-access controls, treat
 *   platform path logging as a rollout research/ops constraint.
 */
export const BEARER_PATH_LOGGING_PRODUCTION_BLOCKER =
  "Vercel Runtime Logs requestPath and Log Drain proxy.path can capture bearer URL path segments; app code cannot redact them." as const;

export const BEARER_PATH_LOGGING_SOURCES = [
  "https://vercel.com/docs/logs/runtime",
  "https://vercel.com/docs/drains/reference/logs",
  "https://vercel.com/docs/analytics/redacting-sensitive-data",
] as const;
