/**
 * Archive Signing.
 *
 * Archive is organizational state, not lifecycle: `signings.archived_at`
 * hides a Signing from the default Signings list and never changes
 * `lifecycle_state`, evidence, documents or history. Any lifecycle state may
 * be archived, and archive is reversible.
 *
 * Archiving an In Progress Signing revokes every active participant access
 * path in one database transaction (`signing_archive`). Unarchive clears
 * `archived_at` only: it never restores revoked links, issues credentials or
 * reopens anything. Resuming an In Progress Signing needs Replace.
 *
 * Authority: the same managers who may rename the Signing in its current
 * lifecycle state. Historical readers and participants cannot archive.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSigningAuthorityBundle } from "./authority-context";
import { SigningError } from "./errors";
import {
  buildResponsibleContextMetadata,
  requireSigningEventActorType,
} from "./event-actor";
import { assertNativeSigningEnabled } from "./feature-gate";
import { getSigningForActor } from "./operations";
import { canRenameSigning } from "./rename";
import { appendSigningEvent } from "./signing-events";
import { isUuid, type SigningActor, type SigningSummary } from "./types";

export const SIGNING_ARCHIVED_REVOCATION_REASON = "SIGNING_ARCHIVED";

/** Same people who may rename the Signing in its current lifecycle state. */
export const canArchiveSigning = canRenameSigning;

/** Fail closed when an action would create participant access on an archived Signing. */
export function assertSigningNotArchived(
  signing: { archived_at?: string | null },
  message = "This Signing is archived. Unarchive it before issuing participant links.",
): void {
  if (signing.archived_at) {
    throw new SigningError("CONFLICT", message);
  }
}

type ArchiveFunctionResult = {
  already_archived: boolean;
  archived_at: string;
  lifecycle_state: string;
  revoked_credentials: number;
  revoked_entry_sessions: number;
  revoked_handoffs: number;
  revoked_browser_sessions: number;
  released_presence_leases: number;
};

async function loadArchiveBundle(
  actor: SigningActor,
  signingId: unknown,
  admin: SupabaseClient,
  verb: "archive" | "unarchive",
) {
  assertNativeSigningEnabled();
  if (!isUuid(signingId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }
  const bundle = await loadSigningAuthorityBundle(admin, actor, signingId);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (
    !canArchiveSigning({
      authority: bundle.authority,
      lifecycleState: bundle.signing.lifecycle_state,
      originatingOrganizationId: bundle.signing.originating_organization_id,
      memberships: actor.memberships,
    })
  ) {
    throw new SigningError("FORBIDDEN", `You cannot ${verb} this Signing.`);
  }
  return bundle;
}

export async function archiveSigningForActor(
  actor: SigningActor,
  input: { signingId: unknown },
  admin: SupabaseClient,
): Promise<SigningSummary> {
  const { signing, authority } = await loadArchiveBundle(
    actor,
    input.signingId,
    admin,
    "archive",
  );
  if (signing.archived_at) {
    return getSigningForActor(actor, signing.id, admin);
  }

  const { data, error } = await admin.rpc("signing_archive", {
    p_signing_id: signing.id,
  });
  if (error) {
    if (/SIGNING_ARCHIVE_NOT_FOUND/.test(error.message)) {
      throw new SigningError("NOT_FOUND", "Signing not found.");
    }
    throw new Error(error.message);
  }
  const result = data as ArchiveFunctionResult;

  if (!result.already_archived) {
    const revokedAccess = result.lifecycle_state === "IN_PROGRESS";
    await appendSigningEvent(admin, {
      signingId: signing.id,
      eventType: "SIGNING_ARCHIVED",
      actorType: requireSigningEventActorType(authority),
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      visibility: "BUSINESS",
      summary: revokedAccess
        ? "Signing archived; participant access revoked"
        : "Signing archived",
      detailsJson: {
        ...buildResponsibleContextMetadata({
          responsibleUserId: signing.original_sender_user_id,
          responsibleDisplayName: signing.original_sender_display_name,
        }),
        archivedAt: result.archived_at,
        lifecycleState: result.lifecycle_state,
        participantAccessRevoked: revokedAccess,
        revokedCredentials: result.revoked_credentials,
        revokedEntrySessions: result.revoked_entry_sessions,
        revokedHandoffs: result.revoked_handoffs,
        revokedBrowserSessions: result.revoked_browser_sessions,
        releasedPresenceLeases: result.released_presence_leases,
      },
      idempotencyKey: `SIGNING_ARCHIVED:${result.archived_at}`,
    });
  }

  return getSigningForActor(actor, signing.id, admin);
}

export async function unarchiveSigningForActor(
  actor: SigningActor,
  input: { signingId: unknown },
  admin: SupabaseClient,
): Promise<SigningSummary> {
  const { signing, authority } = await loadArchiveBundle(
    actor,
    input.signingId,
    admin,
    "unarchive",
  );
  const previousArchivedAt = signing.archived_at ?? null;
  if (!previousArchivedAt) {
    return getSigningForActor(actor, signing.id, admin);
  }

  const { data: updated, error: updateError } = await admin
    .from("signings")
    .update({ archived_at: null })
    .eq("id", signing.id)
    .eq("archived_at", previousArchivedAt)
    .select("id")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);

  if (updated) {
    await appendSigningEvent(admin, {
      signingId: signing.id,
      eventType: "SIGNING_UNARCHIVED",
      actorType: requireSigningEventActorType(authority),
      actorUserId: actor.userId,
      actorDisplayName: actor.displayName,
      visibility: "BUSINESS",
      summary: "Signing unarchived",
      detailsJson: {
        ...buildResponsibleContextMetadata({
          responsibleUserId: signing.original_sender_user_id,
          responsibleDisplayName: signing.original_sender_display_name,
        }),
        previousArchivedAt,
        lifecycleState: signing.lifecycle_state,
        participantAccessRestored: false,
      },
      idempotencyKey: `SIGNING_UNARCHIVED:${previousArchivedAt}`,
    });
  }

  return getSigningForActor(actor, signing.id, admin);
}
