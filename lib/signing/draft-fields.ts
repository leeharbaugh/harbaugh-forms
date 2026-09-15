import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";
import {
  requireManageableDraftSigning,
} from "./manage";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

export type SigningDraftFieldRow = {
  id: string;
  signing_id: string;
  signing_document_id: string;
  signing_participant_id: string;
  field_type: "SIGNATURE" | "INITIALS" | "DATE_SIGNED";
  is_required: boolean;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  linked_signature_draft_field_id: string | null;
};

function parseGeometry(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SigningError("INVALID_INPUT", `Invalid ${label}.`);
  }
  return value;
}

function parseFieldType(
  value: unknown,
): "SIGNATURE" | "INITIALS" | "DATE_SIGNED" {
  if (value === "SIGNATURE" || value === "INITIALS" || value === "DATE_SIGNED") {
    return value;
  }
  throw new SigningError(
    "INVALID_INPUT",
    "Field type must be SIGNATURE, INITIALS, or DATE_SIGNED.",
  );
}

export async function upsertDraftSigningFieldWithActor(
  actor: SigningActor,
  input: {
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
  },
  admin: SupabaseClient,
): Promise<SigningDraftFieldRow> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );

  if (!isUuid(input.signingDocumentId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing document id.");
  }
  if (!isUuid(input.signingParticipantId)) {
    throw new SigningError("INVALID_INPUT", "Invalid participant id.");
  }

  const fieldType = parseFieldType(input.fieldType);
  const pageNumber = parseGeometry(input.pageNumber, "page number");
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new SigningError("INVALID_INPUT", "Invalid page number.");
  }
  const x = parseGeometry(input.x, "x");
  const y = parseGeometry(input.y, "y");
  const width = parseGeometry(input.width, "width");
  const height = parseGeometry(input.height, "height");
  if (width <= 0 || height <= 0) {
    throw new SigningError("INVALID_INPUT", "Field size must be positive.");
  }

  const isRequired =
    input.isRequired === undefined ? true : Boolean(input.isRequired);

  let linkedSignatureDraftFieldId: string | null = null;
  if (
    input.linkedSignatureDraftFieldId !== undefined &&
    input.linkedSignatureDraftFieldId !== null
  ) {
    if (!isUuid(input.linkedSignatureDraftFieldId)) {
      throw new SigningError("INVALID_INPUT", "Invalid linked signature field.");
    }
    linkedSignatureDraftFieldId = input.linkedSignatureDraftFieldId;
  }
  if (fieldType === "DATE_SIGNED" && !linkedSignatureDraftFieldId) {
    throw new SigningError(
      "INVALID_INPUT",
      "DATE_SIGNED fields require a linked Signature field.",
    );
  }
  if (fieldType !== "DATE_SIGNED") {
    linkedSignatureDraftFieldId = null;
  }

  const { data: document, error: documentError } = await admin
    .from("signing_documents")
    .select("id, included_in_draft")
    .eq("id", input.signingDocumentId)
    .eq("signing_id", signing.id)
    .maybeSingle();
  if (documentError) throw new Error(documentError.message);
  if (!document || document.included_in_draft !== true) {
    throw new SigningError(
      "INVALID_INPUT",
      "Signer fields must reference an included Draft document.",
    );
  }

  const { data: participant, error: participantError } = await admin
    .from("signing_participants")
    .select("id, participant_status")
    .eq("id", input.signingParticipantId)
    .eq("signing_id", signing.id)
    .maybeSingle();
  if (participantError) throw new Error(participantError.message);
  if (!participant || participant.participant_status === "REMOVED") {
    throw new SigningError(
      "INVALID_INPUT",
      "Signer fields must reference a current Draft participant.",
    );
  }

  if (linkedSignatureDraftFieldId) {
    const { data: linked, error: linkedError } = await admin
      .from("signing_draft_fields")
      .select("id, field_type, signing_participant_id")
      .eq("id", linkedSignatureDraftFieldId)
      .eq("signing_id", signing.id)
      .maybeSingle();
    if (linkedError) throw new Error(linkedError.message);
    if (!linked || linked.field_type !== "SIGNATURE") {
      throw new SigningError(
        "INVALID_INPUT",
        "DATE_SIGNED fields require a linked Signature field.",
      );
    }
    if (linked.signing_participant_id !== input.signingParticipantId) {
      throw new SigningError(
        "INVALID_INPUT",
        "DATE_SIGNED fields must link to a Signature field for the same participant.",
      );
    }
  }

  const payload = {
    signing_id: signing.id,
    signing_document_id: input.signingDocumentId,
    signing_participant_id: input.signingParticipantId,
    field_type: fieldType,
    is_required: isRequired,
    page_number: pageNumber,
    x,
    y,
    width,
    height,
    linked_signature_draft_field_id: linkedSignatureDraftFieldId,
  };

  if (input.fieldId !== undefined && input.fieldId !== null) {
    if (!isUuid(input.fieldId)) {
      throw new SigningError("INVALID_INPUT", "Invalid draft field id.");
    }
    const { data, error } = await admin
      .from("signing_draft_fields")
      .update(payload)
      .eq("id", input.fieldId)
      .eq("signing_id", signing.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update draft field.");
    }
    return data as SigningDraftFieldRow;
  }

  const { data, error } = await admin
    .from("signing_draft_fields")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create draft field.");
  }
  return data as SigningDraftFieldRow;
}

export async function removeDraftSigningFieldWithActor(
  actor: SigningActor,
  input: { signingId: unknown; fieldId: unknown },
  admin: SupabaseClient,
): Promise<void> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!isUuid(input.fieldId)) {
    throw new SigningError("INVALID_INPUT", "Invalid draft field id.");
  }

  await admin
    .from("signing_draft_fields")
    .update({ linked_signature_draft_field_id: null })
    .eq("signing_id", signing.id)
    .eq("linked_signature_draft_field_id", input.fieldId);

  const { error } = await admin
    .from("signing_draft_fields")
    .delete()
    .eq("id", input.fieldId)
    .eq("signing_id", signing.id);
  if (error) throw new Error(error.message);
}
