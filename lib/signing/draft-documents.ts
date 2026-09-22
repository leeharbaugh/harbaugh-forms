import type { SupabaseClient } from "@supabase/supabase-js";
import { captureAndSelectDraftSourceSnapshot } from "./draft-source-snapshots";
import { SigningError } from "./errors";
import {
  normalizeOptionalText,
  normalizeRequiredText,
  parsePositiveInt,
  requireManageableDraftSigning,
} from "./manage";
import { resolveSigningPacketOwnerUserId } from "./operations";
import { SIGNING_ARTIFACTS_BUCKET } from "./stage1-schema";
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
  /** Stage 4: reproducible Draft preparation state used for promotion. */
  selected_draft_source_snapshot_id: string | null;
  /** Live fingerprint accepted by Keep Current against the selected snapshot. */
  acknowledged_live_content_fingerprint: string | null;
};

async function reloadSigningDocument(
  admin: SupabaseClient,
  signingId: string,
  signingDocumentId: string,
): Promise<SigningDocumentRow> {
  const { data, error } = await admin
    .from("signing_documents")
    .select("*")
    .eq("id", signingDocumentId)
    .eq("signing_id", signingId)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to reload Signing document.");
  }
  return data as SigningDocumentRow;
}

async function nextDocumentDisplayOrder(
  admin: SupabaseClient,
  signingId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("signing_documents")
    .select("display_order")
    .eq("signing_id", signingId)
    .eq("included_in_draft", true)
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
    const displayOrder = await nextDocumentDisplayOrder(admin, signing.id);
    const { data: reincluded, error: reincludeError } = await admin
      .from("signing_documents")
      .update({
        included_in_draft: true,
        display_order: displayOrder,
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

    // Re-include preserves the previously selected Draft source snapshot.
    // It must never silently refresh preparation state from live content.
    // Legacy rows predating Stage 4 capture once so promotion stays possible.
    if (!reincluded.selected_draft_source_snapshot_id) {
      await captureAndSelectDraftSourceSnapshot({
        admin,
        signingId: signing.id,
        signingDocumentId: reincluded.id as string,
        packetFormId,
        expectedOwnerUserId: resolveSigningPacketOwnerUserId(signing),
      });
      return reloadSigningDocument(admin, signing.id, reincluded.id as string);
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

  // Adding a document captures its Draft source snapshot immediately, so the
  // Signing owns a reproducible preparation state from the start.
  try {
    await captureAndSelectDraftSourceSnapshot({
      admin,
      signingId: signing.id,
      signingDocumentId: inserted.id as string,
      packetFormId,
      expectedOwnerUserId: resolveSigningPacketOwnerUserId(signing),
    });
  } catch (error) {
    // A document without a snapshot cannot be promoted; roll the fresh insert
    // back so the Draft never holds an unpromotable document.
    await admin
      .from("signing_documents")
      .delete()
      .eq("id", inserted.id as string)
      .eq("signing_id", signing.id);
    throw error;
  }

  return reloadSigningDocument(admin, signing.id, inserted.id as string);
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

  // No evidence exists yet: drop the Draft preparation state with the document.
  // Pointer must be cleared first (RESTRICT FK), then snapshot rows/objects.
  const { error: clearPointerError } = await admin
    .from("signing_documents")
    .update({
      selected_draft_source_snapshot_id: null,
      acknowledged_live_content_fingerprint: null,
    })
    .eq("id", input.signingDocumentId)
    .eq("signing_id", signing.id);
  if (clearPointerError) throw new Error(clearPointerError.message);

  const { data: snapshots, error: snapshotError } = await admin
    .from("signing_draft_source_snapshots")
    .select("id, source_pdf_storage_bucket, source_pdf_object_key")
    .eq("signing_id", signing.id)
    .eq("signing_document_id", input.signingDocumentId);
  if (snapshotError) throw new Error(snapshotError.message);

  if (snapshots && snapshots.length > 0) {
    const { error: snapshotDeleteError } = await admin
      .from("signing_draft_source_snapshots")
      .delete()
      .eq("signing_id", signing.id)
      .eq("signing_document_id", input.signingDocumentId);
    if (snapshotDeleteError) throw new Error(snapshotDeleteError.message);

    await admin.storage
      .from(SIGNING_ARTIFACTS_BUCKET)
      .remove(
        snapshots.map((row) => row.source_pdf_object_key as string),
      );
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

/**
 * Add every remaining eligible Packet Form from the Signing's source Packet
 * (or an explicitly selected owned Packet for standalone Signings).
 * Skips forms already included; uses the same eligibility as Packet → Create Signing.
 */
export async function addRemainingPacketDocumentsWithActor(
  actor: SigningActor,
  input: {
    signingId: unknown;
    /** Required when the Signing has no source_packet_id (standalone). */
    packetId?: unknown;
  },
  admin: SupabaseClient,
): Promise<{ addedCount: number; skippedDuplicateCount: number }> {
  const { signing } = await requireManageableDraftSigning(
    actor,
    input.signingId,
    admin,
  );

  let packetId: number | null = signing.source_packet_id;
  if (packetId == null) {
    packetId = parsePositiveInt(input.packetId, "Packet id");
  } else if (input.packetId !== undefined && input.packetId !== null) {
    const requested = parsePositiveInt(input.packetId, "Packet id");
    if (requested !== packetId) {
      throw new SigningError(
        "INVALID_PACKET",
        "This Signing is tied to a different source Packet.",
      );
    }
  }

  const { data: packet, error: packetError } = await admin
    .from("packets")
    .select("id, owner_user_id, status")
    .eq("id", packetId)
    .maybeSingle();
  if (packetError) throw new Error(packetError.message);
  if (!packet || packet.status === "DELETED") {
    throw new SigningError("INVALID_PACKET", "The Packet is not available.");
  }
  if (packet.owner_user_id !== actor.userId) {
    throw new SigningError(
      "INVALID_PACKET",
      "The Packet is not available to this Signing.",
    );
  }
  if (
    signing.source_packet_id != null &&
    packet.id !== signing.source_packet_id
  ) {
    throw new SigningError(
      "INVALID_PACKET",
      "The Packet does not belong to this Signing's source Packet.",
    );
  }

  const { data: forms, error: formError } = await admin
    .from("packet_forms")
    .select(
      "id, document_name, status, availability_state, storage_path, sort_order",
    )
    .eq("packet_id", packetId)
    .eq("status", "ACTIVE")
    .eq("availability_state", "AVAILABLE")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (formError) throw new Error(formError.message);

  let addedCount = 0;
  let skippedDuplicateCount = 0;
  for (const form of forms ?? []) {
    if (!form.storage_path) continue;
    try {
      await addDraftSigningDocumentWithActor(
        actor,
        {
          signingId: signing.id,
          sourcePacketFormId: form.id,
          displayName: form.document_name ?? "Document",
        },
        admin,
      );
      addedCount += 1;
    } catch (error) {
      if (
        error instanceof SigningError &&
        error.code === "CONFLICT" &&
        /already included/i.test(error.message)
      ) {
        skippedDuplicateCount += 1;
        continue;
      }
      throw error;
    }
  }

  return { addedCount, skippedDuplicateCount };
}
