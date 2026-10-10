import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";
import { requireManageableDraftSigning } from "./manage";
import type { PreparedContentRenderItem } from "./prepared-content-pdf";
import {
  isPreparedContentType,
  preparedContentNeedsParticipant,
  type PreparedContentType,
} from "./prepared-content-types";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

export type SigningDraftPreparedContentRow = {
  id: string;
  signing_id: string;
  signing_document_id: string;
  signing_participant_id: string | null;
  content_type: PreparedContentType;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

function parseNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SigningError("INVALID_INPUT", `Invalid ${label}.`);
  }
  return value;
}

/**
 * Create or update manager-prepared content on a Draft document. Manage
 * authority is required; the content never grants participant authority.
 */
export async function upsertDraftPreparedContentWithActor(
  actor: SigningActor,
  input: {
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
  },
  admin: SupabaseClient,
): Promise<SigningDraftPreparedContentRow> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );

  if (!isPreparedContentType(input.contentType)) {
    throw new SigningError(
      "INVALID_INPUT",
      "Prepared content must be a Printed Name or a Checkmark.",
    );
  }
  const contentType = input.contentType;
  if (!isUuid(input.signingDocumentId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing document id.");
  }
  const pageNumber = parseNumber(input.pageNumber, "page number");
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new SigningError("INVALID_INPUT", "Invalid page number.");
  }
  const x = parseNumber(input.x, "x");
  const y = parseNumber(input.y, "y");
  const width = parseNumber(input.width, "width");
  const height = parseNumber(input.height, "height");
  if (width <= 0 || height <= 0) {
    throw new SigningError("INVALID_INPUT", "Prepared content size must be positive.");
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
      "Prepared content must reference an included Draft document.",
    );
  }

  let participantId: string | null = null;
  if (preparedContentNeedsParticipant(contentType)) {
    if (!isUuid(input.signingParticipantId)) {
      throw new SigningError("INVALID_INPUT", "Choose a participant for the Printed Name.");
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
        "Printed Name must reference a current Draft participant.",
      );
    }
    participantId = participant.id as string;
  }

  const payload = {
    signing_id: signing.id,
    signing_document_id: input.signingDocumentId,
    signing_participant_id: participantId,
    content_type: contentType,
    page_number: pageNumber,
    x,
    y,
    width,
    height,
  };

  if (input.contentId !== undefined && input.contentId !== null) {
    if (!isUuid(input.contentId)) {
      throw new SigningError("INVALID_INPUT", "Invalid prepared content id.");
    }
    const { data, error } = await admin
      .from("signing_draft_prepared_content")
      .update(payload)
      .eq("id", input.contentId)
      .eq("signing_id", signing.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      throw new SigningError("NOT_FOUND", "Prepared content not found.");
    }
    return data as SigningDraftPreparedContentRow;
  }

  const { data, error } = await admin
    .from("signing_draft_prepared_content")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to save prepared content.");
  }
  return data as SigningDraftPreparedContentRow;
}

export async function removeDraftPreparedContentWithActor(
  actor: SigningActor,
  input: { signingId: unknown; contentId: unknown },
  admin: SupabaseClient,
): Promise<{ removedFieldIds: string[] }> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!isUuid(input.contentId)) {
    throw new SigningError("INVALID_INPUT", "Invalid prepared content id.");
  }
  const { data, error } = await admin
    .from("signing_draft_prepared_content")
    .delete()
    .eq("id", input.contentId)
    .eq("signing_id", signing.id)
    .select("id");
  if (error) throw new Error(error.message);
  return { removedFieldIds: (data ?? []).map((row) => row.id as string) };
}

/**
 * Server-only render input for one document: Printed Name text comes from the
 * participant's current Draft name, read at prepared-version build time.
 */
export async function loadPreparedContentRenderItems(
  admin: SupabaseClient,
  signingId: string,
  signingDocumentId: string,
): Promise<PreparedContentRenderItem[]> {
  const { data: rows, error } = await admin
    .from("signing_draft_prepared_content")
    .select("content_type, signing_participant_id, page_number, x, y, width, height")
    .eq("signing_id", signingId)
    .eq("signing_document_id", signingDocumentId);
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const participantIds = [
    ...new Set(
      rows
        .map((row) => row.signing_participant_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const names = new Map<string, string>();
  if (participantIds.length > 0) {
    const { data: participants, error: participantError } = await admin
      .from("signing_participants")
      .select("id, full_name, participant_status")
      .eq("signing_id", signingId)
      .in("id", participantIds);
    if (participantError) throw new Error(participantError.message);
    for (const participant of participants ?? []) {
      if (participant.participant_status === "REMOVED") continue;
      names.set(participant.id as string, participant.full_name as string);
    }
  }

  return rows.map((row) => {
    const contentType = row.content_type as PreparedContentType;
    const participantId = row.signing_participant_id as string | null;
    if (contentType === "PRINTED_NAME" && (!participantId || !names.has(participantId))) {
      throw new SigningError(
        "VALIDATION_FAILED",
        "A Printed Name references a participant who is no longer in this Signing.",
      );
    }
    return {
      contentType,
      pageNumber: row.page_number as number,
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height),
      text: contentType === "PRINTED_NAME" ? names.get(participantId!)! : null,
    };
  });
}
