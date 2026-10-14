"use server";

import "server-only";

import { requireSigningActor } from "@/lib/signing/actor";
import { SigningError } from "@/lib/signing/errors";
import { NativeSigningDisabledError } from "@/lib/signing/feature-gate";
import {
  applyPlacementTemplateWithActor,
  loadPlacementTemplateApplyPreviewWithActor,
} from "@/lib/signing/placement-template-apply";
import {
  copyPlacementTemplateWithActor,
  createPlacementTemplateWithActor,
  deletePlacementTemplateWithActor,
  loadFormPlacementPageWithActor,
  loadPlacementTemplateEditorWithActor,
  removePlacementTemplateFieldWithActor,
  upsertPlacementTemplateFieldWithActor,
} from "@/lib/signing/placement-templates";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlacementTemplateActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; code: string; error: string };

function toActionError(error: unknown): PlacementTemplateActionResult {
  if (error instanceof NativeSigningDisabledError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof SigningError) {
    return { ok: false, code: error.code, error: error.message };
  }
  if (error instanceof Error && error.message) {
    console.error("[signing-placement-templates] unexpected error:", error.message);
  } else {
    console.error("[signing-placement-templates] unexpected error");
  }
  return { ok: false, code: "INTERNAL", error: "Unexpected placement template error." };
}

/** The session actor is established before the service-role client is created. */
async function withAuthorizedAdmin<T>(
  run: (
    actor: Awaited<ReturnType<typeof requireSigningActor>>,
    admin: ReturnType<typeof createAdminClient>,
  ) => Promise<T>,
): Promise<PlacementTemplateActionResult> {
  try {
    const actor = await requireSigningActor();
    const admin = createAdminClient();
    const data = await run(actor, admin);
    return { ok: true, data };
  } catch (error) {
    return toActionError(error);
  }
}

export async function loadFormPlacementPageAction(input: {
  formId: unknown;
}): Promise<PlacementTemplateActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    loadFormPlacementPageWithActor(actor, input, admin),
  );
}

export async function createPlacementTemplateAction(input: {
  formId: unknown;
  scope: unknown;
  organizationId?: unknown;
}): Promise<PlacementTemplateActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    createPlacementTemplateWithActor(actor, input, admin),
  );
}

export async function deletePlacementTemplateAction(input: {
  templateId: unknown;
}): Promise<PlacementTemplateActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    deletePlacementTemplateWithActor(actor, input, admin),
  );
}

export async function copyPlacementTemplateAction(input: {
  sourceTemplateId: unknown;
  targetFormId: unknown;
}): Promise<PlacementTemplateActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    copyPlacementTemplateWithActor(actor, input, admin),
  );
}

export async function loadPlacementTemplateEditorAction(input: {
  templateId: unknown;
}): Promise<PlacementTemplateActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    loadPlacementTemplateEditorWithActor(actor, input, admin),
  );
}

export async function upsertPlacementTemplateFieldAction(input: {
  templateId: unknown;
  fieldId?: unknown;
  slotKey?: unknown;
  fieldType: unknown;
  isRequired?: unknown;
  pageNumber: unknown;
  x: unknown;
  y: unknown;
  width: unknown;
  height: unknown;
  linkedTemplateFieldId?: unknown;
  dateLinkMode?: unknown;
}): Promise<PlacementTemplateActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    upsertPlacementTemplateFieldWithActor(actor, input, admin),
  );
}

export async function removePlacementTemplateFieldAction(input: {
  templateId: unknown;
  fieldId: unknown;
}): Promise<PlacementTemplateActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    removePlacementTemplateFieldWithActor(actor, input, admin),
  );
}

export async function getPlacementTemplateApplyPreviewAction(input: {
  signingId: unknown;
  signingDocumentId: unknown;
}): Promise<PlacementTemplateActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    loadPlacementTemplateApplyPreviewWithActor(actor, input, admin),
  );
}

export async function applyPlacementTemplateAction(input: {
  signingId: unknown;
  signingDocumentId: unknown;
  templateId: unknown;
  requestId: unknown;
}): Promise<PlacementTemplateActionResult> {
  return withAuthorizedAdmin((actor, admin) =>
    applyPlacementTemplateWithActor(actor, input, admin),
  );
}
