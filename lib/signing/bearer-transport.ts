/**
 * Path-safe Native Signing bearer transport.
 *
 * Emailed links use a nonsecret credential UUID in the path and the high-entropy
 * secret in the URL fragment. The fragment is never sent on the initial GET, so
 * Vercel Runtime Logs / Log Drains see only `/sign/{uuid}` or
 * `/sign/completed/{uuid}`. Client bootstrap POSTs publicId + secret to mint
 * the existing HttpOnly session cookies.
 *
 * Public ID alone never authenticates.
 */
import { isUuid } from "./types";

export const SIGNING_ENTRY_EXCHANGE_PATH = "/api/sign/entry-exchange" as const;
export const SIGNING_COMPLETED_PACKAGE_EXCHANGE_PATH =
  "/api/sign/completed-package-exchange" as const;

export const SIGNING_CONTINUE_PATH = "/sign/continue" as const;
export const SIGNING_PACKAGE_PATH = "/sign/package" as const;

/** Same entropy as current bearer tokens (32 bytes base64url). */
export const FRAGMENT_SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

/** Nonsecret public credential id (UUID). */
export function isSigningCredentialPublicId(
  value: unknown,
): value is string {
  return isUuid(value);
}

export function isFragmentSecret(value: unknown): value is string {
  return typeof value === "string" && FRAGMENT_SECRET_RE.test(value);
}

export function resolveAppBaseUrlForTransport(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000"
  ).replace(/\/+$/, "");
}

/**
 * Invitation URL: path holds public id only; secret is fragment-only.
 * Do not URL-encode the fragment secret (base64url is fragment-safe).
 */
export function buildParticipantInviteUrl(
  publicId: string,
  rawSecret: string,
): string {
  if (!isSigningCredentialPublicId(publicId)) {
    throw new Error("Participant invite public id must be a UUID.");
  }
  if (!isFragmentSecret(rawSecret)) {
    throw new Error("Participant invite secret is malformed.");
  }
  return `${resolveAppBaseUrlForTransport()}/sign/${publicId}#${rawSecret}`;
}

export function buildCompletedPackageUrl(
  publicId: string,
  rawSecret: string,
): string {
  if (!isSigningCredentialPublicId(publicId)) {
    throw new Error("Completed-package public id must be a UUID.");
  }
  if (!isFragmentSecret(rawSecret)) {
    throw new Error("Completed-package secret is malformed.");
  }
  return `${resolveAppBaseUrlForTransport()}/sign/completed/${publicId}#${rawSecret}`;
}

/** Pathname only — suitable for asserting logs never contain the secret. */
export function participantInvitePathname(publicId: string): string {
  return `/sign/${publicId}`;
}

export function completedPackagePathname(publicId: string): string {
  return `/sign/completed/${publicId}`;
}
