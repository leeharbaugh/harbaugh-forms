import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import { SigningError } from "./errors";
import { assertNativeSigningEnabled } from "./feature-gate";
import { isUuid, type SigningActor, type SigningRow } from "./types";

export type ManagedDraftSigning = {
  signing: SigningRow;
  canManage: true;
};

/**
 * Authorize Draft management for a Signing, then return the Signing row.
 * Callers must not use a privileged client for evidence until this succeeds.
 * Revalidates agent, TC (delegation + operator association), and ORG_ADMIN paths.
 */
export async function requireManageableDraftSigning(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
): Promise<ManagedDraftSigning> {
  assertNativeSigningEnabled();

  if (!isUuid(signingIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }

  const bundle = await loadSigningAuthorityBundle(admin, actor, signingIdRaw);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (!bundle.authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot manage this Signing.");
  }
  if (bundle.signing.lifecycle_state !== "DRAFT") {
    throw new SigningError(
      "CONFLICT",
      "Only Draft Signings may be prepared in Stage 3.",
    );
  }

  return { signing: bundle.signing, canManage: true };
}

/**
 * Authorize management for unfinished Signings (Draft or In Progress).
 */
export async function requireManageableSigning(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
): Promise<{ signing: SigningRow; canManage: true }> {
  assertNativeSigningEnabled();

  if (!isUuid(signingIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }

  const bundle = await loadSigningAuthorityBundle(admin, actor, signingIdRaw);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (!bundle.authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot manage this Signing.");
  }

  return { signing: bundle.signing, canManage: true };
}

export function parsePositiveInt(value: unknown, label: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^-?\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SigningError("INVALID_INPUT", `Invalid ${label}.`);
  }
  return parsed;
}

export function parseNonNegativeInt(value: unknown, label: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^-?\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new SigningError("INVALID_INPUT", `Invalid ${label}.`);
  }
  return parsed;
}

export function normalizeOptionalText(
  value: unknown,
  label: string,
  maxLength = 300,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new SigningError("INVALID_INPUT", `Invalid ${label}.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new SigningError("INVALID_INPUT", `${label} is too long.`);
  }
  return trimmed;
}

export function normalizeRequiredText(
  value: unknown,
  label: string,
  maxLength = 300,
): string {
  const normalized = normalizeOptionalText(value, label, maxLength);
  if (!normalized) {
    throw new SigningError("INVALID_INPUT", `${label} is required.`);
  }
  return normalized;
}
