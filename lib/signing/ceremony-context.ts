/**
 * Native Signing Stage 5 ceremony context.
 *
 * Two clearly separated read models plus the shared write guard:
 *
 * 1. `loadPreAffirmationContext` — everything the participant may see *before*
 *    "I am [Name]": their own name, the sending agent's name, the agent's
 *    brokerage, and optionally the neutral Signing title. No document titles,
 *    no PDF bytes, no contractual detail, no field assignments, no progress, no
 *    other participants' activity, and deliberately not the participant's email.
 * 2. `loadCeremonyOverview` — the ceremony read model, available only once a
 *    valid ceremony browser session exists.
 * 3. `requireCeremonyWriteContext` — revalidation every meaningful write shares:
 *    Signing In Progress, participant still able to act, no active amendment
 *    lock, an actionable package revision, a revision participant snapshot, and
 *    live presence. An entry session alone can never satisfy it, because it
 *    takes an already-validated ceremony session.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadAdoptedMarksForParticipant,
  suggestTypedInitialsFromDisplayName,
  type AdoptedMarkView,
} from "./adopted-marks";
import { assertNoActiveAmendmentLock } from "./amendment-locks";
import type { ValidatedCeremonySession } from "./browser-sessions";
import {
  checkConsentSatisfied,
  loadCurrentConsentDisclosure,
  type ConsentState,
} from "./consent-disclosure";
import { SigningError } from "./errors";
import { requireValidPresenceForSession } from "./presence";

export type CeremonyEntryMode = "REMOTE" | "IN_PERSON";

export type PreAffirmationContext = {
  signingId: string;
  signingParticipantId: string;
  mode: CeremonyEntryMode;
  participantFullName: string;
  /** `signings.original_sender_display_name` — who sent this Signing. */
  senderDisplayName: string;
  /** Originating brokerage/organization name. */
  brokerageName: string;
  /** Neutral Signing title, when already available. */
  signingTitle: string | null;
};

/**
 * Minimal identity and official-business context for `/sign/continue`.
 *
 * Returns null for every unusable state so a stale cookie reveals nothing.
 */
export async function loadPreAffirmationContext(options: {
  admin: SupabaseClient;
  signingId: string;
  signingParticipantId: string;
  mode: CeremonyEntryMode;
}): Promise<PreAffirmationContext | null> {
  const [
    { data: signing, error: signingError },
    { data: participant, error: participantError },
  ] = await Promise.all([
    options.admin
      .from("signings")
      .select(
        "id, title, lifecycle_state, original_sender_display_name, originating_organization_id",
      )
      .eq("id", options.signingId)
      .maybeSingle(),
    options.admin
      .from("signing_participants")
      .select("id, full_name, participant_status")
      .eq("id", options.signingParticipantId)
      .eq("signing_id", options.signingId)
      .maybeSingle(),
  ]);
  if (signingError) throw new Error(signingError.message);
  if (participantError) throw new Error(participantError.message);

  if (!signing || signing.lifecycle_state !== "IN_PROGRESS") return null;
  if (!participant || participant.participant_status === "REMOVED") return null;

  const { data: organization, error: organizationError } = await options.admin
    .from("organizations")
    .select("id, name")
    .eq("id", signing.originating_organization_id as string)
    .maybeSingle();
  if (organizationError) throw new Error(organizationError.message);

  return {
    signingId: signing.id as string,
    signingParticipantId: participant.id as string,
    mode: options.mode,
    participantFullName: participant.full_name as string,
    senderDisplayName: signing.original_sender_display_name as string,
    brokerageName: (organization?.name as string | null) ?? "",
    signingTitle: (signing.title as string | null) ?? null,
  };
}

export type CeremonyWriteContext = {
  session: ValidatedCeremonySession;
  /** The revision participants may act on: frozen when set, else current. */
  packageRevisionId: string;
  frozenPackageRevisionId: string | null;
  /** `signing_package_revision_participants.id` for this participant. */
  revisionParticipantId: string;
  /**
   * Identity display name (actual signatory). Affirmation and events use this.
   */
  displayedName: string;
  /** PERSONAL or REPRESENTATIVE (frozen). */
  capacityMode: "PERSONAL" | "REPRESENTATIVE";
  /** Exact text a typed Signature must match. */
  expectedTypedSignatureText: string;
  representedPartyName: string | null;
  capacityWording: string | null;
};

/**
 * Shared revalidation for every meaningful ceremony write.
 *
 * `requirePresence` is false only for the write that establishes presence
 * (identity affirmation acquires the lease itself).
 */
export async function requireCeremonyWriteContext(options: {
  admin: SupabaseClient;
  session: ValidatedCeremonySession;
  requirePresence?: boolean;
}): Promise<CeremonyWriteContext> {
  const { admin, session } = options;

  if (session.participantStatus === "REMOVED") {
    throw new SigningError(
      "CEREMONY_FORBIDDEN",
      "This participant can no longer act on this Signing.",
    );
  }
  if (session.participantStatus === "DECLINED") {
    throw new SigningError(
      "DECLINED",
      "This Signing was declined and can no longer be signed.",
    );
  }
  if (session.participantStatus === "FINISHED") {
    throw new SigningError(
      "ALREADY_FINISHED",
      "You already finished signing. Reopen your link to review what you signed.",
    );
  }

  await assertNoActiveAmendmentLock(admin, session.signingId);

  const packageRevisionId = resolveActionableRevisionId(session);
  const revisionParticipantId = await loadRevisionParticipantId({
    admin,
    signingId: session.signingId,
    packageRevisionId,
    signingParticipantId: session.signingParticipantId,
  });

  const { data: revisionParticipant, error: revisionParticipantError } =
    await admin
      .from("signing_package_revision_participants")
      .select(
        "frozen_full_name, frozen_signing_capacity_mode, frozen_represented_party_name, frozen_capacity_wording",
      )
      .eq("id", revisionParticipantId)
      .eq("signing_id", session.signingId)
      .maybeSingle();
  if (revisionParticipantError) {
    throw new Error(revisionParticipantError.message);
  }

  if (options.requirePresence !== false) {
    await requireValidPresenceForSession({
      admin,
      signingId: session.signingId,
      signingParticipantId: session.signingParticipantId,
      signingBrowserSessionId: session.sessionId,
    });
  }

  const signatoryName =
    (revisionParticipant?.frozen_full_name as string | null) ??
    session.participantFullName;
  const capacityModeRaw =
    (revisionParticipant?.frozen_signing_capacity_mode as string | null) ??
    "PERSONAL";
  const capacityMode =
    capacityModeRaw === "REPRESENTATIVE" ? "REPRESENTATIVE" : "PERSONAL";
  const capacityWording =
    (revisionParticipant?.frozen_capacity_wording as string | null) ?? null;
  const representedPartyName =
    (revisionParticipant?.frozen_represented_party_name as string | null) ??
    null;
  const expectedTypedSignatureText =
    capacityMode === "REPRESENTATIVE"
      ? (capacityWording ?? "").trim()
      : signatoryName.trim();

  return {
    session,
    packageRevisionId,
    frozenPackageRevisionId: session.frozenPackageRevisionId,
    revisionParticipantId,
    displayedName: signatoryName,
    capacityMode,
    expectedTypedSignatureText,
    representedPartyName,
    capacityWording,
  };
}

/**
 * The revision a participant may act on.
 *
 * Placements target the frozen revision once the package is frozen; the Stage 1
 * `signings_frozen_implies_current` constraint keeps frozen equal to current,
 * and this re-checks it rather than trusting the pointer pair.
 */
export function resolveActionableRevisionId(
  session: Pick<
    ValidatedCeremonySession,
    "currentPackageRevisionId" | "frozenPackageRevisionId"
  >,
): string {
  const current = session.currentPackageRevisionId;
  if (!current) {
    throw new SigningError(
      "CONFLICT",
      "This Signing has no actionable package. Please contact the sending agent.",
    );
  }
  const frozen = session.frozenPackageRevisionId;
  if (frozen && frozen !== current) {
    throw new SigningError(
      "CONFLICT",
      "This Signing package changed. Reload this page to review the current documents.",
    );
  }
  return frozen ?? current;
}

async function loadRevisionParticipantId(options: {
  admin: SupabaseClient;
  signingId: string;
  packageRevisionId: string;
  signingParticipantId: string;
}): Promise<string> {
  const { data, error } = await options.admin
    .from("signing_package_revision_participants")
    .select("id")
    .eq("signing_id", options.signingId)
    .eq("package_revision_id", options.packageRevisionId)
    .eq("signing_participant_id", options.signingParticipantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new SigningError(
      "CEREMONY_FORBIDDEN",
      "You are not a participant in the current version of this Signing.",
    );
  }
  return data.id as string;
}

export type CeremonyDocumentView = {
  revisionDocumentId: string;
  displayName: string;
  displayOrder: number;
  assignedFieldCount: number;
  acceptedFieldCount: number;
};

export type CeremonyFieldView = {
  fieldId: string;
  fieldType: "SIGNATURE" | "INITIALS" | "DATE_SIGNED";
  revisionDocumentId: string;
  isRequired: boolean;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  linkedSignatureFieldId: string | null;
  placementId: string | null;
  acceptedAt: string | null;
  renderedSenderLocalDate: string | null;
};

export type CeremonyStep =
  | "CONSENT"
  | "ADOPT_SIGNATURE"
  | "ADOPT_INITIALS"
  | "SIGN"
  | "FINISH"
  | "FINISHED";

export type CeremonyOverview = {
  signingId: string;
  signingTitle: string;
  participantFullName: string;
  displayedName: string;
  /** PERSONAL or REPRESENTATIVE. */
  capacityMode: "PERSONAL" | "REPRESENTATIVE";
  representedPartyName: string | null;
  capacityWording: string | null;
  /** Exact text typed Signature must match. */
  expectedTypedSignatureText: string;
  participantStatus: string;
  packageRevisionId: string;
  frozenPackageRevisionId: string | null;
  inactivityExpiresAt: string;
  consent: ConsentState;
  marks: { signature: AdoptedMarkView | null; initials: AdoptedMarkView | null };
  documents: CeremonyDocumentView[];
  fields: CeremonyFieldView[];
  requiredRemaining: number;
  canFinish: boolean;
  nextStep: CeremonyStep;
  /** Suggested typed initials (editable until first Initials use). */
  suggestedTypedInitials: string;
  /** True when this ceremony session began from supervised in-person handoff. */
  inPersonCeremony: boolean;
};

/**
 * Ceremony read model. Requires a valid ceremony browser session: nothing here
 * is disclosed before identity affirmation.
 */
export async function loadCeremonyOverview(options: {
  admin: SupabaseClient;
  session: ValidatedCeremonySession;
}): Promise<CeremonyOverview> {
  const { admin, session } = options;
  const packageRevisionId = resolveActionableRevisionId(session);

  const revisionParticipantId = await loadRevisionParticipantId({
    admin,
    signingId: session.signingId,
    packageRevisionId,
    signingParticipantId: session.signingParticipantId,
  });

  const [
    { data: revisionParticipant, error: revisionParticipantError },
    { data: revisionDocuments, error: revisionDocumentError },
    { data: fields, error: fieldError },
    { data: placements, error: placementError },
    { data: participantRow, error: participantRowError },
  ] = await Promise.all([
    admin
      .from("signing_package_revision_participants")
      .select(
        "frozen_full_name, frozen_signing_capacity_mode, frozen_represented_party_name, frozen_capacity_wording",
      )
      .eq("id", revisionParticipantId)
      .eq("signing_id", session.signingId)
      .maybeSingle(),
    admin
      .from("signing_package_revision_documents")
      .select("id, display_order, frozen_display_name")
      .eq("signing_id", session.signingId)
      .eq("package_revision_id", packageRevisionId)
      .order("display_order", { ascending: true }),
    admin
      .from("signing_fields")
      .select(
        "id, field_type, package_revision_document_id, is_required, page_number, x, y, width, height, linked_signature_field_id",
      )
      .eq("signing_id", session.signingId)
      .eq("package_revision_id", packageRevisionId)
      .eq("package_revision_participant_id", revisionParticipantId),
    admin
      .from("signing_field_placements")
      .select(
        "id, signing_field_id, accepted_at, rendered_sender_local_date, disposition",
      )
      .eq("signing_id", session.signingId)
      .eq("signing_participant_id", session.signingParticipantId)
      .eq("disposition", "ACCEPTED"),
    admin
      .from("signing_participants")
      .select("participant_status, finished_at")
      .eq("id", session.signingParticipantId)
      .eq("signing_id", session.signingId)
      .maybeSingle(),
  ]);
  if (revisionParticipantError) throw new Error(revisionParticipantError.message);
  if (revisionDocumentError) throw new Error(revisionDocumentError.message);
  if (fieldError) throw new Error(fieldError.message);
  if (placementError) throw new Error(placementError.message);
  if (participantRowError) throw new Error(participantRowError.message);

  const displayedName =
    (revisionParticipant?.frozen_full_name as string | null) ??
    session.participantFullName;
  const capacityModeRaw =
    (revisionParticipant?.frozen_signing_capacity_mode as string | null) ??
    "PERSONAL";
  const capacityMode =
    capacityModeRaw === "REPRESENTATIVE" ? "REPRESENTATIVE" : "PERSONAL";
  const representedPartyName =
    (revisionParticipant?.frozen_represented_party_name as string | null) ??
    null;
  const capacityWording =
    (revisionParticipant?.frozen_capacity_wording as string | null) ?? null;
  const expectedTypedSignatureText =
    capacityMode === "REPRESENTATIVE"
      ? (capacityWording ?? "").trim()
      : displayedName.trim();

  const currentDisclosure = await loadCurrentConsentDisclosure(admin);
  const consent = await checkConsentSatisfied({
    admin,
    signingId: session.signingId,
    signingParticipantId: session.signingParticipantId,
    currentDisclosure,
  });
  const marks = await loadAdoptedMarksForParticipant({
    admin,
    signingId: session.signingId,
    signingParticipantId: session.signingParticipantId,
  });

  const placementByFieldId = new Map<string, Record<string, unknown>>();
  for (const row of placements ?? []) {
    placementByFieldId.set(row.signing_field_id as string, row);
  }

  const fieldViews: CeremonyFieldView[] = (fields ?? []).map((row) => {
    const placement = placementByFieldId.get(row.id as string);
    return {
      fieldId: row.id as string,
      fieldType: row.field_type as CeremonyFieldView["fieldType"],
      revisionDocumentId: row.package_revision_document_id as string,
      isRequired: row.is_required === true,
      pageNumber: row.page_number as number,
      x: row.x as number,
      y: row.y as number,
      width: row.width as number,
      height: row.height as number,
      linkedSignatureFieldId:
        (row.linked_signature_field_id as string | null) ?? null,
      placementId: (placement?.id as string | null) ?? null,
      acceptedAt: (placement?.accepted_at as string | null) ?? null,
      renderedSenderLocalDate:
        (placement?.rendered_sender_local_date as string | null) ?? null,
    };
  });

  const documents: CeremonyDocumentView[] = (revisionDocuments ?? []).map(
    (row) => {
      const documentId = row.id as string;
      const assigned = fieldViews.filter(
        (field) => field.revisionDocumentId === documentId,
      );
      return {
        revisionDocumentId: documentId,
        displayName: row.frozen_display_name as string,
        displayOrder: row.display_order as number,
        assignedFieldCount: assigned.length,
        acceptedFieldCount: assigned.filter((field) => field.placementId)
          .length,
      };
    },
  );

  // DATE_SIGNED is applied automatically with its Signature, so it is never a
  // participant to-do item.
  const participantActionableFields = fieldViews.filter(
    (field) => field.fieldType === "SIGNATURE" || field.fieldType === "INITIALS",
  );
  const requiredRemaining = participantActionableFields.filter(
    (field) => field.isRequired && !field.placementId,
  ).length;

  const needsSignatureMark =
    participantActionableFields.some((field) => field.fieldType === "SIGNATURE") &&
    !marks.signature;
  const needsInitialsMark =
    participantActionableFields.some((field) => field.fieldType === "INITIALS") &&
    !marks.initials;

  const participantStatus =
    (participantRow?.participant_status as string | null) ??
    session.participantStatus;

  let nextStep: CeremonyStep;
  if (participantStatus === "FINISHED") {
    nextStep = "FINISHED";
  } else if (!consent.satisfied) {
    nextStep = "CONSENT";
  } else if (needsSignatureMark) {
    nextStep = "ADOPT_SIGNATURE";
  } else if (needsInitialsMark) {
    nextStep = "ADOPT_INITIALS";
  } else if (requiredRemaining > 0) {
    nextStep = "SIGN";
  } else {
    nextStep = "FINISH";
  }

  return {
    signingId: session.signingId,
    signingTitle: session.signingTitle,
    participantFullName: session.participantFullName,
    displayedName,
    capacityMode,
    representedPartyName,
    capacityWording,
    expectedTypedSignatureText,
    participantStatus,
    packageRevisionId,
    frozenPackageRevisionId: session.frozenPackageRevisionId,
    inactivityExpiresAt: session.inactivityExpiresAt,
    consent,
    marks,
    documents,
    fields: fieldViews,
    requiredRemaining,
    canFinish: participantStatus !== "FINISHED" && requiredRemaining === 0,
    nextStep,
    suggestedTypedInitials: suggestTypedInitialsFromDisplayName(displayedName),
    inPersonCeremony: session.inPersonHandoffId !== null,
  };
}
