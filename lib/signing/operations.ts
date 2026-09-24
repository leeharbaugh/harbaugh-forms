import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateLoadedSigningAuthority,
  loadSigningAuthorityBundle,
  loadSigningOperatorAssociations,
  type SigningOperatorAssociationRow,
} from "./authority-context";
import {
  deriveOriginatingOrganizationId,
  hasSigningAccountAccess,
  isActiveSigningOrganizationMembership,
} from "./eligibility";
import {
  buildResponsibleContextMetadata,
  requireSigningEventActorType,
} from "./event-actor";
import { assertNativeSigningEnabled } from "./feature-gate";
import { SigningError } from "./errors";
import { findActiveOperatorDelegation } from "./operator-delegations";
import { appendSigningEvent } from "./signing-events";
import {
  isUuid,
  normalizeSigningTitle,
  type SigningActor,
  type SigningAgentAssociationRow,
  type SigningRow,
  type SigningSummary,
} from "./types";
import { formatProfileDisplayName } from "@/lib/types/profile";
import type { Profile } from "@/lib/types/profile";

export type CreateDraftSigningInput = {
  title: unknown;
  /** Optional source Packet id. Ownership is verified server-side. */
  sourcePacketId?: unknown;
  /**
   * Responsible agent/broker User for this Signing.
   * When omitted (or equal to the actor), the actor is the responsible User.
   * When a different User is supplied, the actor must hold an active TC
   * delegation to that User in the originating organization.
   */
  responsibleUserId?: unknown;
};

export type UpdateDraftSigningTitleInput = {
  signingId: unknown;
  title: unknown;
};

function mapTitleError(error: unknown): never {
  const code = error instanceof Error ? error.message : "TITLE_REQUIRED";
  if (code === "TITLE_TOO_LONG") {
    throw new SigningError(
      "INVALID_INPUT",
      "Signing title must be 200 characters or fewer.",
    );
  }
  throw new SigningError("INVALID_INPUT", "A Signing title is required.");
}

function resolveOriginatingOrganizationId(actor: SigningActor): string {
  try {
    return deriveOriginatingOrganizationId({
      primaryOrganizationId: actor.profile.primary_organization_id,
      memberships: actor.memberships,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "NO_ACTIVE_ORGANIZATION") {
      throw new SigningError(
        "INELIGIBLE_ORGANIZATION",
        "An active brokerage membership is required for Native Signing.",
      );
    }
    if (code === "AMBIGUOUS_ORGANIZATION") {
      throw new SigningError(
        "INELIGIBLE_ORGANIZATION",
        "Set a primary organization before creating a Signing.",
      );
    }
    throw error;
  }
}

function toSummary(
  signing: SigningRow,
  associations: SigningAgentAssociationRow[],
  authority: Awaited<ReturnType<typeof evaluateLoadedSigningAuthority>>,
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
    createdByUserId: signing.created_by_user_id ?? null,
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
    isTransactionCoordinator: authority.isTransactionCoordinator,
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

async function loadResponsibleProfile(
  admin: SupabaseClient,
  responsibleUserId: string,
  organizationId: string,
): Promise<{ profile: Profile; displayName: string; email: string | null }> {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", responsibleUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) {
    throw new SigningError("NOT_FOUND", "Responsible User not found.");
  }
  const typed = profile as Profile;
  if (!hasSigningAccountAccess(typed)) {
    throw new SigningError(
      "INELIGIBLE_ACCOUNT",
      "The responsible User is not eligible for Native Signing.",
    );
  }

  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("organization_id, membership_role, status, organizations(status)")
    .eq("user_id", responsibleUserId)
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membership) {
    throw new SigningError(
      "INELIGIBLE_ORGANIZATION",
      "The responsible User is not an active member of the organization.",
    );
  }
  const org = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations;
  if (
    !org ||
    !isActiveSigningOrganizationMembership({
      organizationId: membership.organization_id as string,
      membershipRole: membership.membership_role as "MEMBER" | "ORG_ADMIN",
      membershipStatus: membership.status as string,
      organizationStatus: org.status as string,
    })
  ) {
    throw new SigningError(
      "INELIGIBLE_ORGANIZATION",
      "The responsible User is not eligible in the organization.",
    );
  }

  return {
    profile: typed,
    displayName: formatProfileDisplayName(typed),
    email: typed.email,
  };
}

/**
 * Core Draft Signing creation. Caller must already be an authorized SigningActor.
 * Creator identity is distinct from responsible agent/broker identity.
 * Service-role client is accepted only after caller authorization.
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
  } catch (error) {
    mapTitleError(error);
  }

  const originatingOrganizationId = resolveOriginatingOrganizationId(actor);

  let responsibleUserId = actor.userId;
  if (input.responsibleUserId !== undefined && input.responsibleUserId !== null) {
    if (!isUuid(input.responsibleUserId)) {
      throw new SigningError("INVALID_INPUT", "Invalid responsible User id.");
    }
    responsibleUserId = input.responsibleUserId;
  }

  const creatingAsTc = responsibleUserId !== actor.userId;
  let activeDelegationId: string | null = null;

  if (creatingAsTc) {
    const delegation = await findActiveOperatorDelegation(admin, {
      organizationId: originatingOrganizationId,
      responsibleUserId,
      delegateUserId: actor.userId,
    });
    if (!delegation) {
      throw new SigningError(
        "FORBIDDEN",
        "You are not delegated as Transaction Coordinator for that User.",
      );
    }
    activeDelegationId = delegation.id;
  }

  const responsible = creatingAsTc
    ? await loadResponsibleProfile(
        admin,
        responsibleUserId,
        originatingOrganizationId,
      )
    : {
        profile: actor.profile,
        displayName: actor.displayName,
        email: actor.email,
      };

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
    // Packet ownership is the responsible User (not the TC operational actor).
    if (packet.owner_user_id !== responsibleUserId) {
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
      originating_organization_id: originatingOrganizationId,
      source_packet_id: sourcePacketId,
      created_by_user_id: actor.userId,
      original_sender_user_id: responsibleUserId,
      original_sender_display_name: responsible.displayName,
      original_sender_email: responsible.email,
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
      agent_user_id: responsibleUserId,
      association_role: "PRIMARY",
      agent_display_name: responsible.displayName,
      agent_email: responsible.email,
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

  let operatorAssociation: SigningOperatorAssociationRow | null = null;
  if (creatingAsTc && activeDelegationId) {
    const { data: operatorInsert, error: operatorError } = await admin
      .from("signing_operator_associations")
      .insert({
        signing_id: signing.id,
        operator_user_id: actor.userId,
        operator_role: "TRANSACTION_COORDINATOR",
        operator_display_name: actor.displayName,
        operator_email: actor.email,
        status: "ACTIVE",
        signing_operator_delegation_id: activeDelegationId,
        added_by_user_id: actor.userId,
      })
      .select("*")
      .single();

    if (operatorError || !operatorInsert) {
      await admin
        .from("signing_agent_associations")
        .delete()
        .eq("id", association.id);
      await admin.from("signings").delete().eq("id", signing.id);
      throw new Error(
        operatorError?.message ??
          "Failed to create Transaction Coordinator association.",
      );
    }
    operatorAssociation = operatorInsert as SigningOperatorAssociationRow;
  }

  const { data: updatedSigning, error: pointerError } = await admin
    .from("signings")
    .update({ current_primary_agent_association_id: association.id })
    .eq("id", signing.id)
    .select("*")
    .single();

  if (pointerError || !updatedSigning) {
    if (operatorAssociation) {
      await admin
        .from("signing_operator_associations")
        .delete()
        .eq("id", operatorAssociation.id);
    }
    await admin.from("signing_agent_associations").delete().eq("id", association.id);
    await admin.from("signings").delete().eq("id", signing.id);
    throw new Error(
      pointerError?.message ?? "Failed to set current primary agent association.",
    );
  }

  const actorType = creatingAsTc ? "TRANSACTION_COORDINATOR" : "PRIMARY_AGENT";
  const responsibleMeta = creatingAsTc
    ? buildResponsibleContextMetadata({
        responsibleUserId,
        responsibleDisplayName: responsible.displayName,
      })
    : undefined;

  const { error: eventError } = await (async () => {
    try {
      await appendSigningEvent(admin, {
        signingId: signing.id,
        eventType: "SIGNING_CREATED",
        actorType,
        actorUserId: actor.userId,
        actorDisplayName: actor.displayName,
        visibility: "BUSINESS",
        summary: creatingAsTc
          ? `Draft Signing created by Transaction Coordinator on behalf of ${responsible.displayName}`
          : "Draft Signing created",
        detailsJson: {
          createdByUserId: actor.userId,
          responsibleUserId,
          ...(responsibleMeta ?? {}),
        },
      });
      return { error: null };
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  })();

  if (eventError) {
    await admin
      .from("signings")
      .update({ current_primary_agent_association_id: null })
      .eq("id", signing.id);
    if (operatorAssociation) {
      await admin
        .from("signing_operator_associations")
        .delete()
        .eq("id", operatorAssociation.id);
    }
    await admin.from("signing_agent_associations").delete().eq("id", association.id);
    await admin.from("signings").delete().eq("id", signing.id);
    throw new Error(eventError.message);
  }

  const finalSigning = updatedSigning as SigningRow;
  const operatorAssociations = operatorAssociation
    ? [operatorAssociation]
    : await loadSigningOperatorAssociations(admin, finalSigning.id);

  const authority = await evaluateLoadedSigningAuthority({
    signing: finalSigning,
    associations: [association],
    operatorAssociations,
    actorUserId: actor.userId,
    memberships: actor.memberships,
    admin,
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

  const bundle = await loadSigningAuthorityBundle(admin, actor, signingIdRaw);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }

  return toSummary(bundle.signing, bundle.associations, bundle.authority);
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
  } catch (error) {
    mapTitleError(error);
  }

  const bundle = await loadSigningAuthorityBundle(admin, actor, input.signingId);
  if (!bundle || !bundle.authority.canRead) {
    throw new SigningError("NOT_FOUND", "Signing not found.");
  }
  if (!bundle.authority.canManage) {
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

  const actorType = requireSigningEventActorType(bundle.authority);
  const responsibleMeta = buildResponsibleContextMetadata({
    responsibleUserId: bundle.signing.original_sender_user_id,
    responsibleDisplayName: bundle.signing.original_sender_display_name,
  });

  await appendSigningEvent(admin, {
    signingId: bundle.signing.id,
    eventType: "SIGNING_TITLE_UPDATED",
    actorType,
    actorUserId: actor.userId,
    actorDisplayName: actor.displayName,
    visibility: "BUSINESS",
    summary: "Draft Signing title updated",
    detailsJson: responsibleMeta,
  });

  return toSummary(updated as SigningRow, bundle.associations, bundle.authority);
}

/**
 * Packet ownership for Draft source operations: responsible sender, not TC.
 */
export function resolveSigningPacketOwnerUserId(signing: SigningRow): string {
  if (signing.original_sender_user_id) {
    return signing.original_sender_user_id;
  }
  throw new SigningError(
    "CONFLICT",
    "Signing has no responsible sender for Packet ownership checks.",
  );
}

/**
 * List Signings the actor may read via agent, TC operator, or originating
 * brokerage administrator authority. Trusted-server only.
 */
export async function listSigningsForActor(
  actor: SigningActor,
  admin: SupabaseClient,
): Promise<SigningSummary[]> {
  assertNativeSigningEnabled();

  const adminOrgIds = actor.memberships
    .filter(
      (membership) =>
        isActiveSigningOrganizationMembership(membership) &&
        membership.membershipRole === "ORG_ADMIN",
    )
    .map((membership) => membership.organizationId);

  const [
    { data: agentRows, error: agentError },
    { data: operatorRows, error: operatorError },
    { data: senderRows, error: senderError },
    orgResult,
  ] = await Promise.all([
    admin
      .from("signing_agent_associations")
      .select("signing_id")
      .eq("agent_user_id", actor.userId),
    admin
      .from("signing_operator_associations")
      .select("signing_id")
      .eq("operator_user_id", actor.userId),
    admin
      .from("signings")
      .select("id")
      .eq("original_sender_user_id", actor.userId),
    adminOrgIds.length > 0
      ? admin
          .from("signings")
          .select("id")
          .in("originating_organization_id", adminOrgIds)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ]);

  if (agentError) throw new Error(agentError.message);
  if (operatorError) throw new Error(operatorError.message);
  if (senderError) throw new Error(senderError.message);
  if (orgResult.error) throw new Error(orgResult.error.message);

  const candidateIds = new Set<string>();
  for (const row of agentRows ?? []) {
    if (typeof row.signing_id === "string") candidateIds.add(row.signing_id);
  }
  for (const row of operatorRows ?? []) {
    if (typeof row.signing_id === "string") candidateIds.add(row.signing_id);
  }
  for (const row of senderRows ?? []) {
    if (typeof row.id === "string") candidateIds.add(row.id);
  }
  for (const row of orgResult.data ?? []) {
    if (typeof row.id === "string") candidateIds.add(row.id);
  }

  if (candidateIds.size === 0) {
    return [];
  }

  const { data: signingRows, error: signingError } = await admin
    .from("signings")
    .select("*")
    .in("id", [...candidateIds])
    .order("update_date", { ascending: false });

  if (signingError) throw new Error(signingError.message);

  const summaries: SigningSummary[] = [];
  for (const row of (signingRows ?? []) as SigningRow[]) {
    const [{ data: associations, error: associationError }, operatorAssociations] =
      await Promise.all([
        admin
          .from("signing_agent_associations")
          .select("*")
          .eq("signing_id", row.id),
        loadSigningOperatorAssociations(admin, row.id),
      ]);
    if (associationError) throw new Error(associationError.message);

    const agentAssociations = (associations ??
      []) as SigningAgentAssociationRow[];
    const authority = await evaluateLoadedSigningAuthority({
      signing: row,
      associations: agentAssociations,
      operatorAssociations,
      actorUserId: actor.userId,
      memberships: actor.memberships,
      admin,
    });
    if (!authority.canRead) continue;
    summaries.push(toSummary(row, agentAssociations, authority));
  }

  return summaries;
}
