/**
 * Internal Signing worker endpoints. Each authenticates with its own shared
 * secret (`CRON_SECRET` for Vercel Cron, `SIGNING_WORKER_SECRET` for the
 * worker), never a workspace session, so the interactive-login proxy must pass
 * exactly these paths through to their handlers.
 */
export const SIGNING_CRON_WORKER_PATH = "/api/internal/cron/signing-worker" as const;
export const SIGNING_WORKER_PATH = "/api/internal/signing-worker" as const;

export function isInternalSigningWorkerPath(pathname: string): boolean {
  return pathname === SIGNING_CRON_WORKER_PATH || pathname === SIGNING_WORKER_PATH;
}
