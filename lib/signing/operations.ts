import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateSigningAuthority } from "./authority";
import { assertNativeSigningEnabled } from "./feature-gate";
import { SigningError } from "./errors";
import {
  isUuid,
  normalizeSigningTitle,
  type SigningActor,
  type SigningAgentAssociationRow,
  type SigningRow,
  type SigningSummary,
} from "./types";

export type CreateDraftSigningInput = {
  title: unknown;
  /** Optional source Packet id. Ownership is verified server-side. */
  sourcePacketId?: unknown;
};

export type UpdateDraftSigningTitleInput = {
  signingId: unknown;
  title: unknown;
};

function toSummary(
  signing: SigningRow,
  associations: SigningAgentAssociationRow[],
  authority: ReturnType<typeof evaluateSigningAuthority>,
): SigningSummary {
  const primary =
    associations.find(
      (row) =>
        row.id === signing.current_primary_agent_association_id ||
        (row.association_role === "PRIMARY" && row.effective_ended_at == null),
    ) ?? null;

  return {
    id: signing.id,
    title: signing.title,
    lifecycleState: signing.lifecycle_state,
    finalizationCondition: signing.finalization_condition,
    originatingOrganizationId: signing.originating_organization_id,
    sourcePacketId: signing.source_packet_id,
    originalSenderUserId: signing.original_sender_user_id,
    originalSenderDisplayName: signing.original_sender_display_name,
    originalSenderEmail: signing.original_sender_email,
    currentPrimaryAgentAssociationId:
      signing.current_primary_agent_association_id,
    createDate: signing.create_date,
    updateDate: signing.update_date,
    canManage: authority.canManage,
    canRead: authority.canRead,
    isBrokerageAdministrator: authority.isBrokerageAdministrator,
    primaryAssociation: primary
      ? {
          id: primary.id,
          agentUserId: primary.agent_user_id,
          associationRole: primary.association_role,
          agentDisplayName: primary.agent_display_name,
          effectiveEndedAt: primary.effective_ended_at,
        }
      : null,
  };
}

async function loadSigningBundle(
  admin: SupabaseClient,
  signingId: string,
): Promise<{
  signing: SigningRow;
  associations: SigningAgentAssociationRow[];
} | null> {
  const { data: signing, error: signingError } = await admin
    .from("signings")
    .select("*")
    .eq("id", signingId)
    .maybeSingle();

  if (signingError) {
    throw new Error(signingError.message);
  }
  if (!signing) {
    return null;
  }

  const { data: associations, error: associationError } = await admin
    .from("signing_agent_associations")
    .select("*")
    .eq("signing_id", signingId);

  if (associationError) {
    throw new Error(associationError.message);
  }

  return {
    signing: signing as SigningRow,
    associations: (associations ?? []) as SigningAgentAssociationRow[],
  };
}

/**
 * Core Draft Signing creation. Caller must already be an authorized SigningActor.
 * Service-role client is accepted only after caller authorization.
 * Never trusts browser identity fields.
 */
export async function createDraftSigningWithActor(
  actor: SigningActor,
  input: CreateDraftSigningInput,
  admin: SupabaseClient,
): Promise<SigningSummary> {
  assertNativeSigningEnabled();

  let title: string;
  try {
    title = normalizeSigningTitle(input.title);
  } catch {
    throw new SigningError("INVALID_INPUT", "A Signing title is required.");
  }

  let sourcePacketId: number | null = null;
  if (input.sourcePacketId !== undefined && input.sourcePacketId !== null) {
    const raw = input.sourcePacketId;
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw)
          ? Number(raw)
          : NaN;
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new SigningError("INVALID_PACKET", "Invalid source Packet.");
    }

    // Ownership is checked against the session-derived actor, never a browser
    // spoofed owner_user_id. Service-role is used only after requireSigningActor.
    const { data: packet, error: packetError } = await admin
      .from("packets")
      .select("id, owner_user_id, status")
      .eq("id", parsed)
      .maybeSingle();

    if (packetError) {
      throw new Error(packetError.message);
    }
    if (!packet || packet.status === "DELETED") {
      throw new SigningError(
        "INVALID_PACKET",
        "The selected Packet is not available.",
      );
    }
    if (packet.owner_user_id !== actor.userId) {
      throw new SigningError(
        "INVALID_PACKET",
        "The selected Packet is not available to this Signing.",
      );
    }
    sourcePacketId = packet.id as number;
  }

  const { data: signingInsert, error: signingInsertError } = await admin
    .from("signings")
    .insert({
      originating_organization_id: actor.originatingOrganizationId,
      source_packet_id: sourcePacketId,
      original_sender_user_id: actor.userId,
      original_sender_display_name: actor.displayName,
      original_sender_email: actor.email,
      title,
      lifecycle_state: "DRAFT",
      finalization_condition: "NOT_STARTED",
    })
    .select("*")
    .single();

  if (signingInsertError || !signingInsert) {
    throw new Error(
      signingInsertError?.message ?? "Failed to create Signing.",
    );
  }

  const signing = signingInsert as SigningRow;

  const { data: associationInsert, error: associationError } = await admin
    .from("signing_agent_associations")
    .insert({
      signing_id: signing.id,
      agent_user_id: actor.userId,
      association_role: "PRIMARY",
      agent_display_name: actor.displayName,
      agent_email: actor.email,
      added_by_user_id: actor.userId,
    })
    .select("*")
    .single();

  if (associationError || !associationInsert) {
    await admin.from("signings").delete().eq("id", signing.id);
    throw new Error(
      associationError?.message ?? "Failed to create primary agent association.",
    );
  }

  const association = associationInsert as SigningAgentAssociationRow;

  const { data: updatedSigning, error: pointerError } = await admin
    .from("signings")
    .update({ current_primary_agent_association_id: association.id })
    .eq("id", signing.id)
    .select("*")
    .single();

  if (pointerError || !updatedSigning) {
    await admin.from("signing_agent_associations").delete().eq("id", association.id);
    await admin.from("signings").delete().eq("id", signing.id);
    throw new Error(
      pointerError?.message ?? "Failed to set current primary agent association.",
    );
  }

  const { error: eventError } = await admin.from("signing_events").insert({
    signing_id: signing.id,
    event_type: "SIGNING_CREATED",
    actor_type: "PRIMARY_AGENT",
    actor_user_id: actor.userId,
    actor_display_name: actor.displayName,
    visibility: "BUSINESS",
    summary: "Draft Signing created",
  });

  if (eventError) {
    await admin
      .from("signings")
      .update({ current_primary_agent_association_id: null })
      .eq("id", signing.id);
    await admin.from("signing_agent_associations").delete().eq("id", association.id);
    await admin.from("signings").delete().eq("id", signing.id);
    throw new Error(eventError.message);
  }

  const finalSigning = updatedSigning as SigningRow;
  const authority = evaluateSigningAuthority({
    signing: {
      signingId: finalSigning.id,
      originatingOrganizationId: finalSigning.originating_organization_id,
      lifecycleState: finalSigning.lifecycle_state,
      currentPrimaryAgentAssociationId:
        finalSigning.current_primary_agent_association_id,
      associations: [
        {
          id: association.id,
          agentUserId: association.agent_user_id,
          associationRole: association.association_role,
          effectiveEndedAt: association.effective_ended_at,
        },
      ],
    },
    actorUserId: actor.userId,
    memberships: actor.memberships,
  });

  return toSummary(finalSigning, [association], authority);
}

/**
 * Trusted Signing reader. Possession of a UUID alone is never sufficient.
 */
export async function getSigningForActor(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
): Promise<SigningSummary> {
  assertNativeSigningEnabled();

  if (!isUuid(signingIdRaw)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }

  const bundle = await loadSigningBundle(admin, signingIdRaw);
  if (!bundle) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }

  const authority = evaluateSigningAuthority({
    signing: {
      signingId: bundle.signing.id,
      originatingOrganizationId: bundle.signing.originating_organization_id,
      lifecycleState: bundle.signing.lifecycle_state,
      currentPrimaryAgentAssociationId:
        bundle.signing.current_primary_agent_association_id,
      associations: bundle.associations.map((row) => ({
        id: row.id,
        agentUserId: row.agent_user_id,
        associationRole: row.association_role,
        effectiveEndedAt: row.effective_ended_at,
      })),
    },
    actorUserId: actor.userId,
    memberships: actor.memberships,
  });

  if (!authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }

  return toSummary(bundle.signing, bundle.associations, authority);
}

/**
 * Minimal Draft metadata update: title only.
 * Does not mutate provenance, associations, revisions, or evidence.
 */
export async function updateDraftSigningTitleForActor(
  actor: SigningActor,
  input: UpdateDraftSigningTitleInput,
  admin: SupabaseClient,
): Promise<SigningSummary> {
  assertNativeSigningEnabled();

  if (!isUuid(input.signingId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing id.");
  }

  let title: string;
  try {
    title = normalizeSigningTitle(input.title);
  } catch {
    throw new SigningError("INVALID_INPUT", "A Signing title is required.");
  }

  const bundle = await loadSigningBundle(admin, input.signingId);
  if (!bundle) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }

  const authority = evaluateSigningAuthority({
    signing: {
      signingId: bundle.signing.id,
      originatingOrganizationId: bundle.signing.originating_organization_id,
      lifecycleState: bundle.signing.lifecycle_state,
      currentPrimaryAgentAssociationId:
        bundle.signing.current_primary_agent_association_id,
      associations: bundle.associations.map((row) => ({
        id: row.id,
        agentUserId: row.agent_user_id,
        associationRole: row.association_role,
        effectiveEndedAt: row.effective_ended_at,
      })),
    },
    actorUserId: actor.userId,
    memberships: actor.memberships,
  });

  if (!authority.canManage) {
    throw new SigningError("FORBIDDEN", "You cannot update this Signing.");
  }

  if (bundle.signing.lifecycle_state !== "DRAFT") {
    throw new SigningError(
      "CONFLICT",
      "Only Draft Signings may be retitled in Stage 2.",
    );
  }

  const { data: updated, error: updateError } = await admin
    .from("signings")
    .update({ title })
    .eq("id", bundle.signing.id)
    .eq("lifecycle_state", "DRAFT")
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? "Failed to update Signing title.");
  }

  const { error: eventError } = await admin.from("signing_events").insert({
    signing_id: bundle.signing.id,
    event_type: "SIGNING_TITLE_UPDATED",
    actor_type: authority.isBrokerageAdministrator
      ? "BROKERAGE_ADMINISTRATOR"
      : authority.activeAssociation?.associationRole === "CO_AGENT"
        ? "CO_AGENT"
        : "PRIMARY_AGENT",
    actor_user_id: actor.userId,
    actor_display_name: actor.displayName,
    visibility: "BUSINESS",
    summary: "Draft Signing title updated",
  });

  if (eventError) {
    throw new Error(eventError.message);
  }

  return toSummary(updated as SigningRow, bundle.associations, authority);
}
