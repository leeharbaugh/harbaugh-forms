import type { SupabaseClient } from "@supabase/supabase-js";
import { SigningError } from "./errors";
import {
  normalizeOptionalText,
  normalizeRequiredText,
  parsePositiveInt,
  requireManageableDraftSigning,
} from "./manage";
import type { SigningActor } from "./types";
import { isUuid } from "./types";

export type SigningDocumentRow = {
  id: string;
  signing_id: string;
  source_packet_form_id: number | null;
  display_order: number;
  logical_label: string | null;
  display_name: string | null;
  filename: string | null;
  included_in_draft: boolean;
};

async function nextDocumentDisplayOrder(
  admin: SupabaseClient,
  signingId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("signing_documents")
    .select("display_order")
    .eq("signing_id", signingId)
    .order("display_order", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data?.[0]?.display_order as number | undefined) ?? -1) + 1;
}

export async function addDraftSigningDocumentWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    sourcePacketFormId: unknown;
    displayName?: unknown;
    filename?: unknown;
    logicalLabel?: unknown;
  },
  admin: SupabaseClient,
): Promise<SigningDocumentRow> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );

  const packetFormId = parsePositiveInt(
    input.sourcePacketFormId,
    "source Packet Form id",
  );

  const { data: packetForm, error: packetFormError } = await admin
    .from("packet_forms")
    .select(
      "id, packet_id, document_name, status, packets!inner(id, owner_user_id, status)",
    )
    .eq("id", packetFormId)
    .maybeSingle();

  if (packetFormError) throw new Error(packetFormError.message);
  if (!packetForm || packetForm.status === "DELETED") {
    throw new SigningError("INVALID_PACKET", "The Packet Form is not available.");
  }

  const packet = Array.isArray(packetForm.packets)
    ? packetForm.packets[0]
    : packetForm.packets;
  if (!packet || packet.status === "DELETED") {
    throw new SigningError("INVALID_PACKET", "The Packet is not available.");
  }
  if (packet.owner_user_id !== actor.userId) {
    throw new SigningError(
      "INVALID_PACKET",
      "The Packet Form is not available to this Signing.",
    );
  }

  // Prefer Signing's source packet when set; otherwise require owner match only.
  if (
    signing.source_packet_id != null &&
    packet.id !== signing.source_packet_id
  ) {
    throw new SigningError(
      "INVALID_PACKET",
      "The Packet Form does not belong to this Signing's source Packet.",
    );
  }

  const displayName =
    normalizeOptionalText(input.displayName, "display name") ??
    String(packetForm.document_name ?? "Document");
  const filename =
    normalizeOptionalText(input.filename, "filename") ??
    `${displayName.replace(/[^\w.-]+/g, "_")}.pdf`;
  const logicalLabel = normalizeOptionalText(input.logicalLabel, "logical label");

  // Re-include a previously excluded logical document for the same source form.
  const { data: existing, error: existingError } = await admin
    .from("signing_documents")
    .select("*")
    .eq("signing_id", signing.id)
    .eq("source_packet_form_id", packetFormId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    if (existing.included_in_draft) {
      throw new SigningError(
        "CONFLICT",
        "That Packet Form is already included in this Signing.",
      );
    }
    const { data: reincluded, error: reincludeError } = await admin
      .from("signing_documents")
      .update({
        included_in_draft: true,
        display_name: displayName,
        filename,
        logical_label: logicalLabel ?? existing.logical_label,
      })
      .eq("id", existing.id)
      .eq("signing_id", signing.id)
      .select("*")
      .single();
    if (reincludeError || !reincluded) {
      throw new Error(
        reincludeError?.message ?? "Failed to re-include Signing document.",
      );
    }
    return reincluded as SigningDocumentRow;
  }

  const displayOrder = await nextDocumentDisplayOrder(admin, signing.id);

  const { data: inserted, error: insertError } = await admin
    .from("signing_documents")
    .insert({
      signing_id: signing.id,
      source_packet_form_id: packetFormId,
      display_order: displayOrder,
      logical_label: logicalLabel,
      display_name: displayName,
      filename,
      included_in_draft: true,
    })
    .select("*")
    .single();

  if (insertError || !inserted) {
    if (insertError?.message?.includes("signing_documents_signing_source_packet_form_uidx")) {
      throw new SigningError(
        "CONFLICT",
        "That Packet Form is already included in this Signing.",
      );
    }
    throw new Error(insertError?.message ?? "Failed to add Signing document.");
  }

  return inserted as SigningDocumentRow;
}

export async function removeDraftSigningDocumentWithActor(
  actor: SigningActor,
  input: { signingId: unknown; signingDocumentId: unknown },
  admin: SupabaseClient,
): Promise<void> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!isUuid(input.signingDocumentId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing document id.");
  }

  const { data: document, error: documentError } = await admin
    .from("signing_documents")
    .select("id, included_in_draft")
    .eq("id", input.signingDocumentId)
    .eq("signing_id", signing.id)
    .maybeSingle();
  if (documentError) throw new Error(documentError.message);
  if (!document) {
    throw new SigningError("NOT_FOUND", "Signing document not found.");
  }

  // Clear Draft field instructions for this document either way.
  await admin
    .from("signing_draft_fields")
    .delete()
    .eq("signing_id", signing.id)
    .eq("signing_document_id", input.signingDocumentId);

  const [{ data: versions, error: versionError }, { data: revisionDocs, error: revisionDocError }] =
    await Promise.all([
      admin
        .from("signing_document_versions")
        .select("id")
        .eq("signing_document_id", input.signingDocumentId)
        .eq("signing_id", signing.id)
        .limit(1),
      admin
        .from("signing_package_revision_documents")
        .select("id")
        .eq("signing_document_id", input.signingDocumentId)
        .eq("signing_id", signing.id)
        .limit(1),
    ]);
  if (versionError) throw new Error(versionError.message);
  if (revisionDocError) throw new Error(revisionDocError.message);

  const hasEvidence =
    (versions && versions.length > 0) ||
    (revisionDocs && revisionDocs.length > 0);

  if (hasEvidence) {
    // Soft-exclude from later Draft promotions; keep historical revision rows.
    const { error: excludeError } = await admin
      .from("signing_documents")
      .update({ included_in_draft: false })
      .eq("id", input.signingDocumentId)
      .eq("signing_id", signing.id);
    if (excludeError) throw new Error(excludeError.message);
    return;
  }

  const { error: deleteError } = await admin
    .from("signing_documents")
    .delete()
    .eq("id", input.signingDocumentId)
    .eq("signing_id", signing.id);
  if (deleteError) throw new Error(deleteError.message);
}

export async function reorderDraftSigningDocumentsWithActor(
  actor: SigningActor,
  input: { signingId: unknown; orderedDocumentIds: unknown },
  admin: SupabaseClient,
): Promise<SigningDocumentRow[]> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!Array.isArray(input.orderedDocumentIds)) {
    throw new SigningError("INVALID_INPUT", "Document order must be an array.");
  }
  const orderedIds = input.orderedDocumentIds.map((id) => {
    if (!isUuid(id)) {
      throw new SigningError("INVALID_INPUT", "Invalid Signing document id.");
    }
    return id;
  });

  const { data: existing, error } = await admin
    .from("signing_documents")
    .select("*")
    .eq("signing_id", signing.id)
    .eq("included_in_draft", true)
    .order("display_order", { ascending: true });
  if (error) throw new Error(error.message);

  const existingIds = new Set((existing ?? []).map((row) => row.id as string));
  if (
    orderedIds.length !== existingIds.size ||
    orderedIds.some((id) => !existingIds.has(id))
  ) {
    throw new SigningError(
      "INVALID_INPUT",
      "Document order must include each included Draft document exactly once.",
    );
  }

  // Two-phase update avoids unique (signing_id, display_order) collisions.
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error: tempError } = await admin
      .from("signing_documents")
      .update({ display_order: -(i + 1) })
      .eq("id", orderedIds[i])
      .eq("signing_id", signing.id);
    if (tempError) throw new Error(tempError.message);
  }
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error: finalError } = await admin
      .from("signing_documents")
      .update({ display_order: i })
      .eq("id", orderedIds[i])
      .eq("signing_id", signing.id);
    if (finalError) throw new Error(finalError.message);
  }

  const { data: updated, error: reloadError } = await admin
    .from("signing_documents")
    .select("*")
    .eq("signing_id", signing.id)
    .eq("included_in_draft", true)
    .order("display_order", { ascending: true });
  if (reloadError) throw new Error(reloadError.message);
  return (updated ?? []) as SigningDocumentRow[];
}

export async function updateDraftSigningDocumentMetadataWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    signingDocumentId: unknown;
    displayName?: unknown;
    filename?: unknown;
    logicalLabel?: unknown;
  },
  admin: SupabaseClient,
): Promise<SigningDocumentRow> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );
  if (!isUuid(input.signingDocumentId)) {
    throw new SigningError("INVALID_INPUT", "Invalid Signing document id.");
  }

  const patch: Record<string, string | null> = {};
  if (input.displayName !== undefined) {
    patch.display_name = normalizeRequiredText(input.displayName, "display name");
  }
  if (input.filename !== undefined) {
    patch.filename = normalizeRequiredText(input.filename, "filename");
  }
  if (input.logicalLabel !== undefined) {
    patch.logical_label = normalizeOptionalText(input.logicalLabel, "logical label");
  }
  if (Object.keys(patch).length === 0) {
    throw new SigningError("INVALID_INPUT", "No document metadata updates provided.");
  }

  const { data, error } = await admin
    .from("signing_documents")
    .update(patch)
    .eq("id", input.signingDocumentId)
    .eq("signing_id", signing.id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update Signing document.");
  }
  return data as SigningDocumentRow;
}
