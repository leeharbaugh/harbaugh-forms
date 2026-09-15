import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateSigningAuthority } from "./authority";
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

  const { data: signing, error } = await admin
    .from("signings")
    .select("*")
    .eq("id", signingIdRaw)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!signing) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }

  const typed = signing as SigningRow;

  const { data: associations, error: associationError } = await admin
    .from("signing_agent_associations")
    .select("*")
    .eq("signing_id", typed.id);

  if (associationError) {
    throw new Error(associationError.message);
  }

  const authority = evaluateSigningAuthority({
    signing: {
      signingId: typed.id,
      originatingOrganizationId: typed.originating_organization_id,
      lifecycleState: typed.lifecycle_state,
      currentPrimaryAgentAssociationId:
        typed.current_primary_agent_association_id,
      associations: (associations ?? []).map((row) => ({
        id: row.id as string,
        agentUserId: row.agent_user_id as string | null,
        associationRole: row.association_role as "PRIMARY" | "CO_AGENT",
        effectiveEndedAt: row.effective_ended_at as string | null,
      })),
    },
    actorUserId: actor.userId,
    memberships: actor.memberships,
  });

  if (!authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (!authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot manage this Signing.");
  }
  if (typed.lifecycle_state !== "DRAFT") {
    throw new SigningError(
      "CONFLICT",
      "Only Draft Signings may be prepared in Stage 3.",
    );
  }

  return { signing: typed, canManage: true };
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
