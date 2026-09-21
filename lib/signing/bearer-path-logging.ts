/**
 * Bearer-in-URL infrastructure logging findings for Native Signing.
 *
 * Authoritative sources (re-verified 2026-09-21):
 * - https://vercel.com/docs/logs/runtime
 *   Runtime Logs expose `requestPath` as the actual URL path (e.g.
 *   `/blog/my-post`), distinct from the route pattern (`/blog/[slug]`).
 *   Search Params (query) are also shown. Request bodies are not listed as
 *   Runtime Log fields. Retention: Hobby 1 hour; Pro 1 day; Observability Plus
 *   30 days.
 * - https://vercel.com/docs/drains/reference/logs
 *   Log drains include `proxy.path` with the request path and query parameters.
 *   Sampling can filter by path prefix but does not redact path contents.
 *   Drain fields do not include request bodies; application `message`/`stdout`
 *   content is whatever the app writes.
 * - https://vercel.com/docs/analytics/redacting-sensitive-data
 *   Web Analytics can redact/drop events via `beforeSend`; this does **not**
 *   redact Runtime Logs or Log Drains.
 *
 * Conclusion (emailed links, post transport hardening):
 * Invitation and completed-package secrets travel in the URL fragment (not sent
 * on GET) then in POST JSON to exchange endpoints. Platform path/query logs see
 * only `/sign/{uuid}` / `/sign/completed/{uuid}`. Default Vercel logging does
 * not capture POST bodies; app routes must not log bodies/tokens.
 *
 * Residual: `/sign/in-person/[token]` remains a short-lived supervised path
 * bearer for device handoff (acceptable controlled residual; not emailed).
 *
 * Mitigations:
 * - Application routes must never log URL/token/cookie/hash/secret values.
 * - No `@vercel/analytics` is installed; no middleware captures paths.
 * - Referrer-Policy: no-referrer on bearer exchange responses.
 */
export const BEARER_PATH_LOGGING_PRODUCTION_BLOCKER =
  "Resolved for emailed participant/package links: path holds nonsecret credential UUID only; secret travels in URL fragment and POSTs to exchange endpoints (Vercel Runtime/Drains do not auto-log POST bodies). Residual: /sign/in-person/[token] still path-bearer for supervised device handoff (acceptable controlled residual)." as const;

export const BEARER_PATH_LOGGING_SOURCES = [
  "https://vercel.com/docs/logs/runtime",
  "https://vercel.com/docs/drains/reference/logs",
  "https://vercel.com/docs/analytics/redacting-sensitive-data",
] as const;
