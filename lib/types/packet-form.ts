import type { SupabaseClient } from "@supabase/supabase-js";
import {
  copyFormPdfToPacketForm,
  uploadExternalPdfToPacketForm,
} from "@/lib/packet-form-storage";
import type { CollectionFormLink } from "@/lib/types/collection";
import type { DocumentState, PacketForm } from "@/lib/types/packet";

export type PacketFormOrigin =
  | "collection"
  | "added_internal"
  | "external_upload";

export type DraftExternalPacketForm = {
  clientId: string;
  documentName: string;
  file: File;
  notes: string;
};

export type PacketFormRowInput = {
  packetId: number;
  formId: number | null;
  collectionFormId: number | null;
  documentName: string;
  origin: PacketFormOrigin;
  sortOrder: number;
  isRequired: boolean;
  storagePath: string | null;
  notes?: string | null;
  generatedByUserId?: string | null;
};

const FORM_SELECT = "id, form_name, form_code, source_storage_path, status";

export function formatPacketFormOrigin(origin: PacketFormOrigin): string {
  switch (origin) {
    case "collection":
      return "Collection default";
    case "added_internal":
      return "Added form";
    case "external_upload":
      return "External upload";
  }
}

export function sortPacketForms<
  T extends { sort_order?: number; id: number },
>(forms: T[]): T[] {
  return [...forms].sort((a, b) => {
    const aOrder = a.sort_order ?? 0;
    const bOrder = b.sort_order ?? 0;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.id - b.id;
  });
}

export function getNextPacketFormSortOrder(
  forms: Pick<PacketForm, "sort_order" | "status">[],
): number {
  const activeForms = forms.filter((form) => form.status === "ACTIVE");
  if (activeForms.length === 0) {
    return 0;
  }
  return Math.max(...activeForms.map((form) => form.sort_order ?? 0)) + 10;
}

export function validateAdditionalInternalFormId(
  formId: number,
  collectionFormIds: number[],
  additionalFormIds: number[],
): string | null {
  if (collectionFormIds.includes(formId)) {
    return "This form is already included from the collection.";
  }

  if (additionalFormIds.includes(formId)) {
    return "This form has already been added.";
  }

  return null;
}

export function warnDuplicateExternalDocumentName(
  documentName: string,
  existingNames: string[],
): string | null {
  const normalized = documentName.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const duplicate = existingNames.some(
    (name) => name.trim().toLowerCase() === normalized,
  );

  if (duplicate) {
    return `A document named "${documentName.trim()}" is already in this packet. You can still add it, but names will match.`;
  }

  return null;
}

export function getActiveCollectionFormLinks(
  links: CollectionFormLink[] | undefined,
): CollectionFormLink[] {
  return (links ?? [])
    .filter((link) => link.status === "ACTIVE")
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function insertPacketFormRow(
  supabase: SupabaseClient,
  input: PacketFormRowInput,
): Promise<void> {
  const { error } = await supabase.from("packet_forms").insert({
    packet_id: input.packetId,
    form_id: input.formId,
    collection_form_id: input.collectionFormId,
    document_name: input.documentName,
    document_state: "DRAFT" as DocumentState,
    document_type: "PDF",
    origin: input.origin,
    sort_order: input.sortOrder,
    is_required: input.isRequired,
    storage_path: input.storagePath,
    notes: input.notes ?? null,
    generated_by_user_id: input.generatedByUserId ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function createCollectionPacketForms(
  supabase: SupabaseClient,
  packetId: number,
  collectionFormLinks: CollectionFormLink[],
  generatedByUserId: string | null,
): Promise<void> {
  const activeLinks = getActiveCollectionFormLinks(collectionFormLinks);

  for (const link of activeLinks) {
    const formName =
      link.forms?.form_name?.trim() || `Form #${link.form_id}`;
    const sourceStoragePath = link.forms?.source_storage_path?.trim();

    if (!sourceStoragePath) {
      throw new Error(`Source PDF is missing for form "${formName}".`);
    }

    const storagePath = await copyFormPdfToPacketForm(
      supabase,
      sourceStoragePath,
      packetId,
      link.form_id,
      formName,
    );

    await insertPacketFormRow(supabase, {
      packetId,
      formId: link.form_id,
      collectionFormId: link.id,
      documentName: formName,
      origin: "collection",
      sortOrder: link.sort_order,
      isRequired: link.is_required,
      storagePath,
      generatedByUserId,
    });
  }
}

export async function addInternalFormToPacket(
  supabase: SupabaseClient,
  packetId: number,
  formId: number,
  sortOrder: number,
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("packet_forms")
    .select("id")
    .eq("packet_id", packetId)
    .eq("form_id", formId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    throw new Error("This form is already in the packet.");
  }

  const { data: formData, error: formError } = await supabase
    .from("forms")
    .select(FORM_SELECT)
    .eq("id", formId)
    .eq("status", "ACTIVE")
    .single();

  if (formError || !formData) {
    throw new Error(formError?.message ?? "Form not found.");
  }

  const form = formData as {
    id: number;
    form_name: string;
    source_storage_path: string | null;
  };

  const formName = form.form_name?.trim() || `Form #${form.id}`;
  const sourceStoragePath = form.source_storage_path?.trim();

  if (!sourceStoragePath) {
    throw new Error(`Source PDF is missing for form "${formName}".`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const storagePath = await copyFormPdfToPacketForm(
    supabase,
    sourceStoragePath,
    packetId,
    form.id,
    formName,
  );

  await insertPacketFormRow(supabase, {
    packetId,
    formId: form.id,
    collectionFormId: null,
    documentName: formName,
    origin: "added_internal",
    sortOrder,
    isRequired: false,
    storagePath,
    generatedByUserId: user?.id ?? null,
  });
}

export async function addExternalFormToPacket(
  supabase: SupabaseClient,
  packetId: number,
  file: File,
  documentName: string,
  sortOrder: number,
  notes?: string | null,
): Promise<void> {
  const trimmedName = documentName.trim();
  if (!trimmedName) {
    throw new Error("Document name is required.");
  }

  if (file.type && file.type !== "application/pdf") {
    throw new Error("Only PDF files can be uploaded.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const storagePath = await uploadExternalPdfToPacketForm(
    supabase,
    packetId,
    file,
    trimmedName,
  );

  await insertPacketFormRow(supabase, {
    packetId,
    formId: null,
    collectionFormId: null,
    documentName: trimmedName,
    origin: "external_upload",
    sortOrder,
    isRequired: false,
    storagePath,
    notes: notes?.trim() || null,
    generatedByUserId: user?.id ?? null,
  });
}

export async function softDeletePacketForm(
  supabase: SupabaseClient,
  packetFormId: number,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("packet_forms")
    .select("id, status, origin, is_required")
    .eq("id", packetFormId)
    .single();

  if (fetchError || !data) {
    throw new Error("Packet form not found.");
  }

  if (data.status === "DELETED") {
    throw new Error("Packet form is already removed.");
  }

  if (
    (data.origin ?? "collection") === "collection" &&
    data.is_required
  ) {
    throw new Error("Required collection forms cannot be removed from a packet.");
  }

  const { error } = await supabase
    .from("packet_forms")
    .update({ status: "DELETED" })
    .eq("id", packetFormId)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }
}

export async function reorderPacketForm(
  supabase: SupabaseClient,
  packetFormId: number,
  direction: -1 | 1,
): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from("packet_forms")
    .select("id, packet_id, sort_order, status")
    .eq("id", packetFormId)
    .single();

  if (currentError || !current) {
    throw new Error("Packet form not found.");
  }

  if (current.status !== "ACTIVE") {
    throw new Error("Only active forms can be reordered.");
  }

  const { data: siblings, error: siblingsError } = await supabase
    .from("packet_forms")
    .select("id, sort_order")
    .eq("packet_id", current.packet_id)
    .eq("status", "ACTIVE")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (siblingsError || !siblings) {
    throw new Error(siblingsError?.message ?? "Failed to load packet forms.");
  }

  const ordered = sortPacketForms(
    siblings as Array<{ id: number; sort_order: number }>,
  );
  const currentIndex = ordered.findIndex((row) => row.id === packetFormId);
  const swapIndex = currentIndex + direction;

  if (currentIndex < 0 || swapIndex < 0 || swapIndex >= ordered.length) {
    return;
  }

  const currentRow = ordered[currentIndex];
  const swapRow = ordered[swapIndex];

  const { error: firstError } = await supabase
    .from("packet_forms")
    .update({ sort_order: swapRow.sort_order })
    .eq("id", currentRow.id);

  if (firstError) {
    throw new Error(firstError.message);
  }

  const { error: secondError } = await supabase
    .from("packet_forms")
    .update({ sort_order: currentRow.sort_order })
    .eq("id", swapRow.id);

  if (secondError) {
    throw new Error(secondError.message);
  }
}

export async function createAdditionalInternalPacketForms(
  supabase: SupabaseClient,
  packetId: number,
  formIds: number[],
  startingSortOrder: number,
  generatedByUserId: string | null,
): Promise<void> {
  let sortOrder = startingSortOrder;

  for (const formId of formIds) {
    const { data: formData, error: formError } = await supabase
      .from("forms")
      .select(FORM_SELECT)
      .eq("id", formId)
      .eq("status", "ACTIVE")
      .single();

    if (formError || !formData) {
      throw new Error(formError?.message ?? `Form #${formId} not found.`);
    }

    const form = formData as {
      id: number;
      form_name: string;
      source_storage_path: string | null;
    };

    const formName = form.form_name?.trim() || `Form #${form.id}`;
    const sourceStoragePath = form.source_storage_path?.trim();

    if (!sourceStoragePath) {
      throw new Error(`Source PDF is missing for form "${formName}".`);
    }

    const storagePath = await copyFormPdfToPacketForm(
      supabase,
      sourceStoragePath,
      packetId,
      form.id,
      formName,
    );

    await insertPacketFormRow(supabase, {
      packetId,
      formId: form.id,
      collectionFormId: null,
      documentName: formName,
      origin: "added_internal",
      sortOrder,
      isRequired: false,
      storagePath,
      generatedByUserId,
    });

    sortOrder += 10;
  }
}

export async function createExternalPacketForms(
  supabase: SupabaseClient,
  packetId: number,
  externalForms: DraftExternalPacketForm[],
  startingSortOrder: number,
  generatedByUserId: string | null,
): Promise<void> {
  let sortOrder = startingSortOrder;

  for (const externalForm of externalForms) {
    const storagePath = await uploadExternalPdfToPacketForm(
      supabase,
      packetId,
      externalForm.file,
      externalForm.documentName,
    );

    await insertPacketFormRow(supabase, {
      packetId,
      formId: null,
      collectionFormId: null,
      documentName: externalForm.documentName.trim(),
      origin: "external_upload",
      sortOrder,
      isRequired: false,
      storagePath,
      notes: externalForm.notes.trim() || null,
      generatedByUserId,
    });

    sortOrder += 10;
  }
}

export function getCollectionFormIds(links: CollectionFormLink[]): number[] {
  return getActiveCollectionFormLinks(links).map((link) => link.form_id);
}

export function getMaxCollectionSortOrder(links: CollectionFormLink[]): number {
  const activeLinks = getActiveCollectionFormLinks(links);
  if (activeLinks.length === 0) {
    return -10;
  }
  return Math.max(...activeLinks.map((link) => link.sort_order));
}
