import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureFieldInstancesForPacketForm } from "@/lib/field-instances";
import {
  copyFormPdfToPacketForm,
} from "@/lib/packet-form-storage";
import { resolveFormStoragePath } from "@/lib/storage-path-resolve";
import type { FormLibraryScope } from "@/lib/form-storage";

/**
 * Packets that may receive newly published content.
 * Soft-deleted packets and VOID packet forms are skipped.
 */
function packetAllowsNewContent(packetStatus: string | null | undefined): boolean {
  return packetStatus === "ACTIVE";
}

export type ActivatePendingResult = {
  activatedCount: number;
  skippedCount: number;
};

/**
 * On Publish: activate ACTIVE packet_forms for this form that are
 * PENDING_PUBLICATION. Initializes missing field instances only.
 * Idempotent — repeated publish does not duplicate or rewrite instances.
 */
export async function activatePendingPacketFormsForPublishedForm(
  supabase: SupabaseClient,
  formId: number,
): Promise<ActivatePendingResult> {
  const { data: pendingRows, error } = await supabase
    .from("packet_forms")
    .select("id, packet_id, status, document_state, availability_state, storage_path")
    .eq("form_id", formId)
    .eq("status", "ACTIVE")
    .eq("availability_state", "PENDING_PUBLICATION");

  if (error) {
    throw new Error(error.message);
  }

  if (!pendingRows?.length) {
    return { activatedCount: 0, skippedCount: 0 };
  }

  const { data: form, error: formError } = await supabase
    .from("forms")
    .select(
      "id, form_name, form_code, source_storage_path, scope, owner_user_id, status, publication_state",
    )
    .eq("id", formId)
    .single();

  if (formError || !form) {
    throw new Error(formError?.message ?? "Published form not found.");
  }

  if (
    form.status !== "ACTIVE" ||
    form.publication_state !== "PUBLISHED"
  ) {
    return { activatedCount: 0, skippedCount: pendingRows.length };
  }

  const packetIds = [
    ...new Set(pendingRows.map((row) => row.packet_id as number)),
  ];
  const { data: packets, error: packetError } = await supabase
    .from("packets")
    .select("id, status, owner_user_id")
    .in("id", packetIds);

  if (packetError) {
    throw new Error(packetError.message);
  }

  const packetById = new Map(
    (packets ?? []).map((packet) => [packet.id as number, packet]),
  );

  let activatedCount = 0;
  let skippedCount = 0;

  for (const row of pendingRows) {
    const packet = packetById.get(row.packet_id as number);
    if (!packet || !packetAllowsNewContent(packet.status as string)) {
      skippedCount += 1;
      continue;
    }

    if (row.document_state === "VOID") {
      skippedCount += 1;
      continue;
    }

    const ownerUserId = packet.owner_user_id as string | null;
    if (!ownerUserId) {
      skippedCount += 1;
      continue;
    }

    let storagePath = (row.storage_path as string | null)?.trim() || null;
    if (!storagePath) {
      const sourceStoragePath = (form.source_storage_path as string | null)?.trim();
      if (!sourceStoragePath) {
        skippedCount += 1;
        continue;
      }

      const resolved = await resolveFormStoragePath(supabase, {
        formId: form.id as number,
        path: sourceStoragePath,
        formCode: form.form_code as string | null,
        scope: (form.scope as FormLibraryScope | null) ?? "GLOBAL",
        ownerUserId: form.owner_user_id as string | null,
      });

      storagePath = await copyFormPdfToPacketForm(supabase, {
        ownerUserId,
        packetId: row.packet_id as number,
        packetFormId: row.id as number,
        sourceStoragePath: resolved.resolvedPath,
        documentName:
          (form.form_name as string | null)?.trim() || `Form #${formId}`,
      });
    }

    const { error: updateError } = await supabase
      .from("packet_forms")
      .update({
        availability_state: "AVAILABLE",
        storage_path: storagePath,
      })
      .eq("id", row.id)
      .eq("status", "ACTIVE")
      .eq("availability_state", "PENDING_PUBLICATION");

    if (updateError) {
      throw new Error(updateError.message);
    }

    // Insert-only missing instances; never rewrite existing snapshots.
    await ensureFieldInstancesForPacketForm(supabase, row.id as number);
    activatedCount += 1;
  }

  return { activatedCount, skippedCount };
}
