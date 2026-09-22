"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import {
  addDraftSigningDocumentWithActor,
  addRemainingPacketDocumentsWithActor,
  removeDraftSigningDocumentWithActor,
  reorderDraftSigningDocumentsWithActor,
  updateDraftSigningDocumentMetadataWithActor,
} from "@/lib/signing/draft-documents";
import {
  addDraftSigningParticipantWithActor,
  removeDraftSigningParticipantWithActor,
  updateDraftSigningParticipantWithActor,
} from "@/lib/signing/draft-participants";
import {
  removeDraftSigningFieldWithActor,
  upsertDraftSigningFieldWithActor,
} from "@/lib/signing/draft-fields";
import { requireManageableDraftSigning } from "@/lib/signing/manage";
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
  linkedUserId?: unknown;
  linkedContactId?: unknown;
  displayOrder?: unknown;
  signingCapacityMode?: unknown;
  representedPartyName?: unknown;
  capacityLabel?: unknown;
  capacityWording?: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    addDraftSigningParticipantWithActor(actor, input, admin),
  );
}

export async function updateDraftSigningParticipantAction(input: {
  signingId: unknown;
  participantId: unknown;
  fullName?: unknown;
  email?: unknown;
  optionalRole?: unknown;
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
  return withAuthorizedAdmin(async (actor, admin) => {
    await removeDraftSigningFieldWithActor(actor, input, admin);
    return null;
  });
}

/**
 * Intentionally NOT exported as a browser-facing activation action.
 * Internal promotion remains available only to server/tests/validators via
 * `promotePackageRevisionFromDraftWithActor`.
 */

/**
 * List AVAILABLE Packet Forms on Packets owned by the actor that may be added
 * to this Draft Signing. Used by the manager Draft preparation UI.
 */
export async function listPacketFormsForDraftAction(input: {
  signingId: unknown;
}): Promise<SigningStage3ActionResult> {
  return withAuthorizedAdmin(async (actor, admin) => {
    const { signing } = await requireManageableDraftSigning(
      actor,
      input.signingId,
      admin,
    );

    let packetQuery = admin
      .from("packets")
      .select("id, label, status")
      .eq("owner_user_id", actor.userId)
      .neq("status", "DELETED")
      .order("id", { ascending: false })
      .limit(50);

    if (signing.source_packet_id != null) {
      packetQuery = packetQuery.eq("id", signing.source_packet_id);
    }

    const { data: packets, error: packetError } = await packetQuery;
    if (packetError) throw new Error(packetError.message);

    const packetIds = (packets ?? []).map((row) => row.id as number);
    if (packetIds.length === 0) {
      return [];
    }

    const packetLabelById = new Map(
      (packets ?? []).map((row) => [
        row.id as number,
        (row.label as string | null) ?? null,
      ]),
    );

    const { data: includedDocs, error: includedError } = await admin
      .from("signing_documents")
      .select("source_packet_form_id")
      .eq("signing_id", signing.id)
      .eq("included_in_draft", true)
      .not("source_packet_form_id", "is", null);
    if (includedError) throw new Error(includedError.message);
    const includedFormIds = new Set(
      (includedDocs ?? [])
        .map((row) => row.source_packet_form_id as number | null)
        .filter((id): id is number => id != null),
    );

    const { data: forms, error: formError } = await admin
      .from("packet_forms")
      .select(
        "id, packet_id, document_name, status, availability_state, storage_path, sort_order",
      )
      .in("packet_id", packetIds)
      .eq("status", "ACTIVE")
      .eq("availability_state", "AVAILABLE")
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(200);
    if (formError) throw new Error(formError.message);

    return (forms ?? [])
      .filter((form) => Boolean(form.storage_path))
      .filter((form) => !includedFormIds.has(form.id as number))
      .map((form) => ({
        id: form.id as number,
        packetId: form.packet_id as number,
        documentName: String(form.document_name ?? "Document"),
        packetLabel: packetLabelById.get(form.packet_id as number) ?? null,
        alreadyIncluded: false,
      }));
  });
}
