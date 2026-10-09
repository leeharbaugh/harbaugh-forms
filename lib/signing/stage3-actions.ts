"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import {
  addDraftSigningDocumentWithActor,
  addRemainingPacketDocumentsWithActor,
  listPacketFormsForDraftWithActor,
  removeDraftSigningDocumentWithActor,
  reorderDraftSigningDocumentsWithActor,
  updateDraftSigningDocumentMetadataWithActor,
} from "@/lib/signing/draft-documents";
import {
  addAdHocDraftSigningDocumentWithActor,
  readPdfBytesFromUnknown,
} from "@/lib/signing/ad-hoc-documents";
import {
  addDraftSigningParticipantWithActor,
  includeInternalSignerWithActor,
  loadInternalSignerOptionsWithActor,
  removeDraftSigningParticipantWithActor,
  updateDraftSigningParticipantWithActor,
} from "@/lib/signing/draft-participants";
import {
  removeDraftSigningFieldWithActor,
  upsertDraftSigningFieldWithActor,
} from "@/lib/signing/draft-fields";
import {
  removeDraftPreparedContentWithActor,
  upsertDraftPreparedContentWithActor,
} from "@/lib/signing/draft-prepared-content";
import {
  loadDraftRemovedPacketParticipantsWithActor,
  loadDraftSourcePacketStateWithActor,
  restoreDraftPacketParticipantWithActor,
  selectDraftSourcePacketWithActor,
} from "@/lib/signing/source-packet";
import { SigningError } from "@/lib/signing/errors";
import { NativeSigningDisabledError } from "@/lib/signing/feature-gate";
import { createAdminClient } from "@/lib/supabase/admin";

export type SigningStage3ActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; code: string; error: string };

function toActionError(error: unknown): SigningStage3ActionResult {
  if (error instanceof NativeSigningDisabledError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof SigningError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof Error && error.message) {
    console.error("[native-signing-stage3] unexpected error:", error.message);
  } else {
    console.error("[native-signing-stage3] unexpected error");
  }
  return { ok: false, code: "INTERNAL", error: "Unexpected Signing error." };
}

async function withAuthorizedAdmin<T>(
  run: (
    actor: Awaited<ReturnType<typeof requireSigningActor>>,
    admin: ReturnType<typeof createAdminClient>,
  ) => Promise<T>,
): Promise<SigningStage3ActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const data = await run(actor, admin);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addDraftSigningDocumentAction(input: {
  signingId: unknown;
  sourcePacketFormId: unknown;
  displayName?: unknown;
  filename?: unknown;
  logicalLabel?: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    addDraftSigningDocumentWithActor(actor, input, admin),
  );
}

export async function removeDraftSigningDocumentAction(input: {
  signingId: unknown;
  signingDocumentId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin(async (actor, admin) => {
    await removeDraftSigningDocumentWithActor(actor, input, admin);
    return null;
  });
}

export async function addRemainingPacketDocumentsAction(input: {
  signingId: unknown;
  packetId?: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    addRemainingPacketDocumentsWithActor(actor, input, admin),
  );
}

export async function addAdHocDraftSigningDocumentAction(input: {
  signingId: unknown;
  filename?: unknown;
  displayName?: unknown;
  pdfFile: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin(async (actor, admin) => {
    const pdfBytes = await readPdfBytesFromUnknown(input.pdfFile);
    return addAdHocDraftSigningDocumentWithActor(
      actor,
      {
        signingId: input.signingId,
        filename: input.filename,
        displayName: input.displayName,
        pdfBytes,
      },
      admin,
    );
  });
}

export async function reorderDraftSigningDocumentsAction(input: {
  signingId: unknown;
  orderedDocumentIds: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    reorderDraftSigningDocumentsWithActor(actor, input, admin),
  );
}

export async function updateDraftSigningDocumentMetadataAction(input: {
  signingId: unknown;
  signingDocumentId: unknown;
  displayName?: unknown;
  filename?: unknown;
  logicalLabel?: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    updateDraftSigningDocumentMetadataWithActor(actor, input, admin),
  );
}

export async function addDraftSigningParticipantAction(input: {
  signingId: unknown;
  fullName: unknown;
  email?: unknown;
  optionalRole?: unknown;
  roleCode?: unknown;
  linkedContactId?: unknown;
  displayOrder?: unknown;
  signingCapacityMode?: unknown;
  representedPartyName?: unknown;
  capacityLabel?: unknown;
  capacityWording?: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    addDraftSigningParticipantWithActor(
      actor,
      {
        signingId: input.signingId,
        fullName: input.fullName,
        email: input.email,
        optionalRole: input.optionalRole,
        roleCode: input.roleCode,
        linkedContactId: input.linkedContactId,
        displayOrder: input.displayOrder,
        signingCapacityMode: input.signingCapacityMode,
        representedPartyName: input.representedPartyName,
        capacityLabel: input.capacityLabel,
        capacityWording: input.capacityWording,
      },
      admin,
    ),
  );
}

export async function getInternalSignerOptionsAction(input: {
  signingId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    loadInternalSignerOptionsWithActor(actor, input, admin),
  );
}

export async function includeInternalSignerAction(input: {
  signingId: unknown;
  kind: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    includeInternalSignerWithActor(actor, input, admin),
  );
}

export async function updateDraftSigningParticipantAction(input: {
  signingId: unknown;
  participantId: unknown;
  fullName?: unknown;
  email?: unknown;
  optionalRole?: unknown;
  roleCode?: unknown;
  signingCapacityMode?: unknown;
  representedPartyName?: unknown;
  capacityLabel?: unknown;
  capacityWording?: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    updateDraftSigningParticipantWithActor(actor, input, admin),
  );
}

export async function removeDraftSigningParticipantAction(input: {
  signingId: unknown;
  participantId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin(async (actor, admin) => {
    await removeDraftSigningParticipantWithActor(actor, input, admin);
    return null;
  });
}

export async function upsertDraftSigningFieldAction(input: {
  signingId: unknown;
  fieldId?: unknown;
  signingDocumentId: unknown;
  signingParticipantId: unknown;
  fieldType: unknown;
  isRequired?: unknown;
  pageNumber: unknown;
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
  linkedSignatureDraftFieldId?: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    upsertDraftSigningFieldWithActor(actor, input, admin),
  );
}

export async function removeDraftSigningFieldAction(input: {
  signingId: unknown;
  fieldId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    removeDraftSigningFieldWithActor(actor, input, admin),
  );
}

export async function upsertDraftPreparedContentAction(input: {
  signingId: unknown;
  contentId?: unknown;
  signingDocumentId: unknown;
  signingParticipantId?: unknown;
  contentType: unknown;
  pageNumber: unknown;
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    upsertDraftPreparedContentWithActor(actor, input, admin),
  );
}

export async function removeDraftPreparedContentAction(input: {
  signingId: unknown;
  contentId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    removeDraftPreparedContentWithActor(actor, input, admin),
  );
}

export async function getDraftRemovedPacketParticipantsAction(input: {
  signingId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    loadDraftRemovedPacketParticipantsWithActor(actor, input, admin),
  );
}

export async function restoreDraftPacketParticipantAction(input: {
  signingId: unknown;
  contactId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    restoreDraftPacketParticipantWithActor(actor, input, admin),
  );
}

export async function getDraftSourcePacketStateAction(input: {
  signingId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    loadDraftSourcePacketStateWithActor(actor, input, admin),
  );
}

export async function selectDraftSourcePacketAction(input: {
  signingId: unknown;
  packetId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    selectDraftSourcePacketWithActor(actor, input, admin),
  );
}

/**
 * Intentionally NOT exported as a browser-facing activation action.
 * Internal promotion remains available only to server/tests/validators via
 * `promotePackageRevisionFromDraftWithActor`.
 */

/**
 * List AVAILABLE Packet Forms from this Draft Signing's source Packet that may
 * still be added. Empty until a source Packet is selected (one source Packet
 * per Signing). Used by the manager Draft preparation UI.
 */
export async function listPacketFormsForDraftAction(input: {
  signingId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    listPacketFormsForDraftWithActor(actor, input, admin),
  );
}
