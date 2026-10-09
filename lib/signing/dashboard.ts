/**
 * Native Signing Stage 4 Signing dashboard read model.
 *
 * Projection for the agent-facing Signing page. Readiness is derived on demand
 * and never stored. Nothing here exposes credential tokens. For a Draft the
 * manager may manage, loading first applies Draft participant sync (Packet
 * auto-add and live linked identity); nothing is written once activated.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SigningDocumentRow } from "./draft-documents";
import { signingEmailSandboxed } from "./delivery";
import { isParticipantLinkQaHelperEnabled } from "./feature-gate";
import { getSigningForActor } from "./operations";
import {
  summarizeParticipantAccess,
  type CredentialStatusRow,
  type InvitationAttemptRow,
  type InvitationInstructionRow,
  type ParticipantAccessStatus,
} from "./participant-access-status";
import {
  evaluateSigningReadiness,
  type SigningReadinessBlocker,
} from "./readiness";
import { getDocumentSourceStatus, type DocumentSourceStatus } from "./source-drift";
import type {
  SigningCapacityLabel,
  SigningCapacityMode,
} from "./capacity-notices";
import type { SigningActor, SigningSummary } from "./types";
import {
  participantIdentitySourceKind,
  syncDraftParticipantIdentities,
  type ParticipantIdentitySourceKind,
} from "./draft-participant-sync";
import { requireManageableDraftSigning } from "./manage";
import { autoAddDraftPacketParticipants } from "./source-packet";

export type SigningDashboardDocument = {
  id: string;
  displayName: string;
  filename: string | null;
  displayOrder: number;
  sourceKind: string | null;
  sourcePacketFormId: number | null;
  selectedDraftSourceSnapshotId: string | null;
  sourceStatus: DocumentSourceStatus;
};

export type SigningDashboardParticipant = {
  id: string;
  fullName: string;
  email: string;
  optionalRole: string | null;
  roleCode: string | null;
  participantStatus: string;
  displayOrder: number;
  hasSignatureOrInitialsField: boolean;
  deliveryState: string | null;
  lastDeliveryFailureSafe: string | null;
  hasActiveInvitationLink: boolean;
  access: ParticipantAccessStatus;
  capacityMode?: SigningCapacityMode;
  representedPartyName?: string | null;
  capacityLabel?: SigningCapacityLabel | null;
  capacityWording?: string | null;
  /** Where name/email come from while Draft; AD_HOC is manager-typed. */
  identitySource: ParticipantIdentitySourceKind;
};

export type SigningDashboard = {
  /** Draft only: Packet participants added automatically on this load. */
  participantSync: { addedFromPacket: string[] };
  signing: SigningSummary & {
    activationMode: string | null;
    activatedAt: string | null;
  };
  ready: boolean;
  /** Development email sandbox: invitations are accepted but not sent. */
  emailSandboxed: boolean;
  /** Development QA: show Copy/Open signing link (never in production). */
  participantLinkQaHelper: boolean;
  blockers: SigningReadinessBlocker[];
  documents: SigningDashboardDocument[];
  participants: SigningDashboardParticipant[];
};

export async function loadSigningDashboardForActor(
  actor: SigningActor,
  signingIdRaw: unknown,
  admin: SupabaseClient,
): Promise<SigningDashboard> {
  const summary = await getSigningForActor(actor, signingIdRaw, admin);
  const packetOwnerUserId =
    summary.originalSenderUserId ?? actor.userId;

  const addedFromPacket: string[] = [];
  if (summary.lifecycleState === "DRAFT" && summary.canManage) {
    const { signing } = await requireManageableDraftSigning(
      actor,
      summary.id,
      admin,
    );
    const { addedParticipants } = await autoAddDraftPacketParticipants(
      actor,
      admin,
      signing,
    );
    addedFromPacket.push(...addedParticipants.map((party) => party.fullName));
    await syncDraftParticipantIdentities(admin, signing);
  }

  const [
    { data: activation, error: activationError },
    { data: documentRows, error: documentError },
    { data: participantRows, error: participantError },
    { data: draftFieldRows, error: draftFieldError },
    { data: deliveryRows, error: deliveryError },
    { data: credentialRows, error: credentialError },
  ] = await Promise.all([
    admin
      .from("signings")
      .select("activation_mode, activated_at")
      .eq("id", summary.id)
      .maybeSingle(),
    admin
      .from("signing_documents")
      .select("*")
      .eq("signing_id", summary.id)
      .eq("included_in_draft", true)
      .order("display_order", { ascending: true }),
    admin
      .from("signing_participants")
      .select("*")
      .eq("signing_id", summary.id)
      .neq("participant_status", "REMOVED")
      .order("display_order", { ascending: true }),
    admin
      .from("signing_draft_fields")
      .select("signing_participant_id, field_type")
      .eq("signing_id", summary.id),
    admin
      .from("signing_delivery_instructions")
      .select("id, signing_participant_id, delivery_state, create_date")
      .eq("signing_id", summary.id)
      .eq("purpose", "INVITATION")
      .order("create_date", { ascending: true }),
    admin
      .from("signing_participant_credentials")
      .select("signing_participant_id, issued_at, is_current, revoked_at, revoked_reason")
      .eq("signing_id", summary.id),
  ]);

  if (activationError) throw new Error(activationError.message);
  if (documentError) throw new Error(documentError.message);
  if (participantError) throw new Error(participantError.message);
  if (draftFieldError) throw new Error(draftFieldError.message);
  if (deliveryError) throw new Error(deliveryError.message);
  if (credentialError) throw new Error(credentialError.message);

  const isDraft = summary.lifecycleState === "DRAFT";

  let ready = false;
  let blockers: SigningReadinessBlocker[] = [
    {
      code: "NOT_DRAFT",
      message: "This Signing is no longer a Draft.",
    },
  ];
  const sourceStatusByDocumentId = new Map<string, DocumentSourceStatus>();

  if (isDraft) {
    const readiness = await evaluateSigningReadiness(admin, summary.id, actor);
    ready = readiness.ready;
    blockers = readiness.blockers;
    for (const document of readiness.documents) {
      sourceStatusByDocumentId.set(
        document.signingDocumentId,
        document.sourceStatus,
      );
    }
  }

  const documents: SigningDashboardDocument[] = [];
  for (const row of (documentRows ?? []) as unknown as SigningDocumentRow[]) {
    const cached = sourceStatusByDocumentId.get(row.id);
    const sourceStatus =
      cached ??
      (isDraft
        ? (await getDocumentSourceStatus(admin, row, packetOwnerUserId)).status
        : "CURRENT");
    documents.push({
      id: row.id,
      displayName: row.display_name ?? row.logical_label ?? "Document",
      filename: row.filename,
      displayOrder: row.display_order,
      sourceKind:
        (row.source_kind as string | null | undefined) ??
        (row.source_packet_form_id != null ? "PACKET_FORM" : "AD_HOC_PDF"),
      sourcePacketFormId: row.source_packet_form_id,
      selectedDraftSourceSnapshotId:
        row.selected_draft_source_snapshot_id ?? null,
      sourceStatus,
    });
  }

  const latestDeliveryByParticipantId = new Map<string, string>();
  for (const row of deliveryRows ?? []) {
    latestDeliveryByParticipantId.set(
      row.signing_participant_id as string,
      row.delivery_state as string,
    );
  }

  const failureByParticipantId = new Map<string, string>();
  let attemptRows: InvitationAttemptRow[] = [];
  const instructionIds = (deliveryRows ?? []).map((row) => row.id as string);
  if (instructionIds.length > 0) {
    const { data: attempts, error: attemptError } = await admin
      .from("signing_delivery_attempts")
      .select(
        "delivery_instruction_id, outcome, failure_detail_safe, attempt_number, attempted_at, provider_reference",
      )
      .in("delivery_instruction_id", instructionIds)
      .order("attempt_number", { ascending: true });
    if (attemptError) throw new Error(attemptError.message);
    attemptRows = (attempts ?? []) as unknown as InvitationAttemptRow[];

    const participantByInstructionId = new Map(
      (deliveryRows ?? []).map((row) => [
        row.id as string,
        row.signing_participant_id as string,
      ]),
    );
    for (const attempt of attempts ?? []) {
      const participantId = participantByInstructionId.get(
        attempt.delivery_instruction_id as string,
      );
      if (!participantId) continue;
      if (attempt.outcome === "FAILED") {
        failureByParticipantId.set(
          participantId,
          (attempt.failure_detail_safe as string | null) ??
            "Invitation delivery failed.",
        );
      } else {
        failureByParticipantId.delete(participantId);
      }
    }
  }

  const credentialStatusRows = (credentialRows ?? []) as unknown as CredentialStatusRow[];
  const participantsWithActiveLink = new Set(
    credentialStatusRows
      .filter((row) => row.is_current && !row.revoked_at)
      .map((row) => row.signing_participant_id),
  );
  const instructionRows = (deliveryRows ?? []) as unknown as InvitationInstructionRow[];

  const participants: SigningDashboardParticipant[] = (
    participantRows ?? []
  ).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string,
    email: row.email as string,
    optionalRole: (row.optional_role as string | null) ?? null,
    roleCode: (row.role_code as string | null) ?? null,
    participantStatus: row.participant_status as string,
    displayOrder: row.display_order as number,
    hasSignatureOrInitialsField: (draftFieldRows ?? []).some(
      (field) =>
        field.signing_participant_id === row.id &&
        (field.field_type === "SIGNATURE" || field.field_type === "INITIALS"),
    ),
    deliveryState: latestDeliveryByParticipantId.get(row.id as string) ?? null,
    lastDeliveryFailureSafe:
      failureByParticipantId.get(row.id as string) ?? null,
    hasActiveInvitationLink: participantsWithActiveLink.has(row.id as string),
    access: summarizeParticipantAccess(
      row.id as string,
      credentialStatusRows,
      instructionRows,
      attemptRows,
    ),
    capacityMode:
      (row.signing_capacity_mode as SigningCapacityMode | undefined) ??
      undefined,
    representedPartyName:
      (row.represented_party_name as string | null | undefined) ?? undefined,
    capacityLabel:
      (row.capacity_label as SigningCapacityLabel | null | undefined) ??
      undefined,
    capacityWording:
      (row.capacity_wording as string | null | undefined) ?? undefined,
    identitySource: participantIdentitySourceKind({
      linked_contact_id: (row.linked_contact_id as number | null) ?? null,
      linked_user_id: (row.linked_user_id as string | null) ?? null,
      linked_brokerage_settings_id:
        (row.linked_brokerage_settings_id as number | null) ?? null,
    }),
  }));

  return {
    participantSync: { addedFromPacket },
    signing: {
      ...summary,
      activationMode: (activation?.activation_mode as string | null) ?? null,
      activatedAt: (activation?.activated_at as string | null) ?? null,
    },
    ready,
    emailSandboxed: signingEmailSandboxed(),
    participantLinkQaHelper: isParticipantLinkQaHelperEnabled(),
    blockers,
    documents,
    participants,
  };
}
