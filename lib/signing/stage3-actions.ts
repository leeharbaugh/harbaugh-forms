"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import {
  addDraftSigningDocumentWithActor,
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
  email: unknown;
  optionalRole?: unknown;
  linkedUserId?: unknown;
  linkedContactId?: unknown;
  displayOrder?: unknown;
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
