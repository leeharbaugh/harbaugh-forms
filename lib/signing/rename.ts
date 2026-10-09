/**
 * Signing rename.
 *
 * The Signing name is operational metadata for managers, not signing
 * evidence: package revisions, prepared/completed documents, hashes,
 * participant links and the stored audit certificate never read it again, so
 * renaming is allowed in every lifecycle state. Only `signings.title` changes,
 * and each rename appends a business history event (old and new name).
 *
 * Authority: whoever may manage the Signing. While Draft / In Progress that is
 * `canManage`; once finished, the same people (brokerage administrator, active
 * primary or co-agent, active TC) provided they remain eligible in the
 * originating brokerage. Historical readers and participants cannot rename.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SigningAuthorityResult } from "./authority";
import {
  isEligibleInOriginatingBrokerage,
  type SigningOrganizationMembership,
} from "./eligibility";
import { SigningError } from "./errors";
import { assertNativeSigningEnabled } from "./feature-gate";
import { getSigningForActor } from "./operations";
import { appendSigningEvent } from "./signing-events";
import {
  buildResponsibleContextMetadata,
  requireSigningEventActorType,
} from "./event-actor";
import { loadSigningAuthorityBundle } from "./authority-context";
import {
  isUuid,
  normalizeSigningTitle,
  SIGNING_TITLE_MAX_LENGTH,
  type SigningActor,
  type SigningSummary,
} from "./types";

export function canRenameSigning(options: {
  authority: SigningAuthorityResult;
  lifecycleState: string;
  originatingOrganizationId: string;
  memberships: readonly SigningOrganizationMembership[];
}): boolean {
  const { authority, lifecycleState } = options;
  if (lifecycleState === "DRAFT" || lifecycleState === "IN_PROGRESS") {
    return authority.canManage;
  }
  if (
    !isEligibleInOriginatingBrokerage({
      organizationId: options.originatingOrganizationId,
      memberships: options.memberships,
    })
  ) {
    return false;
  }
  if (authority.isBrokerageAdministrator) return true;
  if (
    authority.activeAssociation &&
    (authority.activeAssociation.associationRole === "PRIMARY" ||
      authority.activeAssociation.associationRole === "CO_AGENT")
  ) {
    return true;
  }
  return authority.activeOperatorAssociation != null;
}

export async function renameSigningForActor(
  actor: SigningActor,
  input: { signingId: unknown; title: unknown },
  admin: SupabaseClient,
): Promise<SigningSummary> {
  assertNativeSigningEnabled();

  if (!isUuid(input.signingId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }

  let title: string;
  try {
    title = normalizeSigningTitle(input.title);
  } catch (error) {
    if (error instanceof Error && error.message === "TITLE_TOO_LONG") {
      throw new SigningError(
        "INVALID_INPUT",
        `Signing name must be ${SIGNING_TITLE_MAX_LENGTH} characters or fewer.`,
      );
    }
    throw new SigningError("INVALID_INPUT", "A Signing name is required.");
  }

  const bundle = await loadSigningAuthorityBundle(admin, actor, input.signingId);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  const { signing, authority } = bundle;
  if (
    !canRenameSigning({
      authority,
      lifecycleState: signing.lifecycle_state,
      originatingOrganizationId: signing.originating_organization_id,
      memberships: actor.memberships,
    })
  ) {
    throw new SigningError("FORBIDDEN", "You cannot rename this Signing.");
  }

  const previousTitle = signing.title;
  if (title === previousTitle) {
    return getSigningForActor(actor, signing.id, admin);
  }

  const { data: updated, error: updateError } = await admin
    .from("signings")
    .update({ title })
    .eq("id", signing.id)
    .eq("title", previousTitle)
    .select("id")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!updated) {
    throw new SigningError(
      "CONFLICT",
      "This Signing was renamed by someone else. Reload and try again.",
    );
  }

  await appendSigningEvent(admin, {
    signingId: signing.id,
    eventType: "SIGNING_TITLE_UPDATED",
    actorType: requireSigningEventActorType(authority),
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    visibility: "BUSINESS",
    summary: "Signing renamed",
    detailsJson: {
      ...buildResponsibleContextMetadata({
        responsibleUserId: signing.original_sender_user_id,
        responsibleDisplayName: signing.original_sender_display_name,
      }),
      previousTitle,
      newTitle: title,
      lifecycleState: signing.lifecycle_state,
    },
  });

  return getSigningForActor(actor, signing.id, admin);
}
