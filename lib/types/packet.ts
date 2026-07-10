import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAdditionalInternalPacketForms,
  createCollectionPacketForms,
  createExternalPacketForms,
  getCollectionFormIds,
  getMaxCollectionSortOrder,
  validateAdditionalInternalFormId,
} from "@/lib/types/packet-form";
import type { DraftExternalPacketForm, PacketFormOrigin } from "@/lib/types/packet-form";
import { formatContactDisplayName } from "@/lib/types/contact";
import {
  type BuyerRepAgreementListItem,
  formatAgreementReference,
  formatDate,
  getOrderedContactNames,
} from "@/lib/types/buyer-rep-agreement";
import type { Form } from "@/lib/types/form";
import type {
  Collection,
  CollectionFormLink,
} from "@/lib/types/collection";
import type {
  PacketContact,
  PacketContactAssignment,
} from "@/lib/types/packet-contact";
import type { Property } from "@/lib/types/property";
import {
  getPacketContactRequiredMessage,
  getPropertyRequiredMessage,
  type PacketWorkflowType,
  workflowRequiresProperty,
} from "@/lib/types/packet-workflow";

/** Buyer rep packets never persist a subject property. */
export function resolvePacketPropertyIdForSave(
  packetType: PacketWorkflowType | null,
  propertyId: number | null,
): number | null {
  if (packetType === "buyer_rep") {
    return null;
  }

  return propertyId;
}

export type DocumentState = "DRAFT" | "FINAL" | "SIGNED" | "VOID";

export type Packet = {
  id: number;
  collection_id: number;
  representation_agreement_id: number | null;
  packet_type: PacketWorkflowType | null;
  property_id: number | null;
  label: string;
  generated_by_user_id: string | null;
  notes: string | null;
  create_date: string;
  update_date: string;
  status: string;
};

export type PacketForm = {
  id: number;
  packet_id: number;
  form_id: number | null;
  collection_form_id: number | null;
  document_name: string;
  document_state: DocumentState;
  document_type?: string;
  origin?: PacketFormOrigin;
  sort_order?: number;
  is_required?: boolean;
  storage_path: string | null;
  generated_pdf_url: string | null;
  notes: string | null;
  field_data: Record<string, unknown>;
  signed_date: string | null;
  generated_by_user_id: string | null;
  create_date: string;
  update_date: string;
  status: string;
  forms?: Form | null;
};

export type PacketListItem = Packet & {
  collections?: Pick<Collection, "id" | "collection_name" | "collection_type"> | null;
  representation_agreements?: BuyerRepAgreementListItem | null;
  packet_forms?: Pick<PacketForm, "id" | "status">[];
};

export type PacketDetail = Packet & {
  collections?: Pick<Collection, "id" | "collection_name" | "collection_type"> | null;
  properties?: Property | null;
  packet_contacts?: PacketContact[];
  representation_agreements?: BuyerRepAgreementListItem | null;
  packet_forms?: PacketForm[];
};

export const PACKET_DETAIL_SELECT = `
  *,
  collections(
    id,
    collection_name,
    collection_type
  ),
  properties(*),
  packet_contacts(
    id,
    contact_id,
    sort_order,
    status,
    packet_role,
    contacts(*)
  ),
  representation_agreements(
    *,
    buyer_rep_details(*),
    representation_agreement_clients(
      sort_order,
      status,
      contacts(*)
    )
  ),
  packet_forms(
    *,
    forms(
      id,
      form_name,
      form_code,
      form_category,
      source_storage_path
    )
  )
`;

export function formatPacketReference(id: number): string {
  return `#${id}`;
}

export function formatPacketStatus(status: string): string {
  if (status === "DELETED") return "Deleted";
  if (status === "INACTIVE") return "Inactive";
  return "Active";
}

export function isPacketDeleted(
  packet: Pick<Packet, "status">,
): boolean {
  return packet.status === "DELETED";
}

export async function deletePacket(
  supabase: SupabaseClient,
  packetId: number,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("packets")
    .select("id, status")
    .eq("id", packetId)
    .single();

  if (fetchError || !data) {
    throw new Error("Packet not found.");
  }

  if (data.status === "DELETED") {
    throw new Error("Packet is already deleted.");
  }

  const { error: formsError } = await supabase
    .from("packet_forms")
    .update({ status: "DELETED" })
    .eq("packet_id", packetId)
    .eq("status", "ACTIVE");

  if (formsError) {
    throw new Error(formsError.message);
  }

  const { error: packetError } = await supabase
    .from("packets")
    .update({ status: "DELETED" })
    .eq("id", packetId)
    .eq("status", "ACTIVE");

  if (packetError) {
    throw new Error(packetError.message);
  }
}

export async function restorePacket(
  supabase: SupabaseClient,
  packetId: number,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("packets")
    .select("id, status")
    .eq("id", packetId)
    .single();

  if (fetchError || !data) {
    throw new Error("Packet not found.");
  }

  if (data.status !== "DELETED") {
    throw new Error("Only deleted packets can be restored.");
  }

  const { error: packetError } = await supabase
    .from("packets")
    .update({ status: "ACTIVE" })
    .eq("id", packetId)
    .eq("status", "DELETED");

  if (packetError) {
    throw new Error(packetError.message);
  }

  const { error: formsError } = await supabase
    .from("packet_forms")
    .update({ status: "ACTIVE" })
    .eq("packet_id", packetId)
    .eq("status", "DELETED");

  if (formsError) {
    throw new Error(formsError.message);
  }
}

export function formatDocumentState(state: DocumentState): string {
  return state.charAt(0) + state.slice(1).toLowerCase();
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return formatDate(date);
  }

  const datePart = formatDate(date);
  const timePart = parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${datePart} ${timePart}`;
}

export function buildPacketLabel(
  contactNames: string,
  collectionName: string,
  date: Date = new Date(),
): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  const dateLabel = `${month}/${day}/${year}`;

  return `${contactNames} - ${collectionName} - ${dateLabel}`;
}

export function getActivePacketFormCount(packet: PacketListItem): number {
  return (packet.packet_forms ?? []).filter(
    (form) => form.status === "ACTIVE",
  ).length;
}

export function formatRelatedAgreementLabel(
  agreement: BuyerRepAgreementListItem | null | undefined,
): string {
  if (!agreement) return "—";

  const contactNames = getOrderedContactNames(agreement);
  return `${contactNames} (${formatAgreementReference(agreement.id)})`;
}

export function validateCreatePacketFromCollectionInput(input: {
  collectionId: number | null;
  packetType: PacketWorkflowType;
  contactIds: number[];
  propertyId: number | null;
}): string | null {
  if (input.collectionId == null) {
    return "Choose a collection before continuing.";
  }

  if (input.contactIds.length === 0) {
    return getPacketContactRequiredMessage(input.packetType);
  }

  const propertyId = resolvePacketPropertyIdForSave(
    input.packetType,
    input.propertyId,
  );

  if (
    workflowRequiresProperty(input.packetType) &&
    propertyId == null
  ) {
    return getPropertyRequiredMessage(input.packetType);
  }

  return null;
}

export type UpdatePacketInput = {
  label: string;
  packetType: PacketWorkflowType | null;
  collectionId: number;
  propertyId: number | null;
  notes: string | null;
  status: string;
};

export function validateUpdatePacketInput(input: {
  label: string;
  packetType: PacketWorkflowType | null;
  collectionId: number | null;
  propertyId: number | null;
  hasLegacyAgreement: boolean;
}): string | null {
  if (!input.label.trim()) {
    return "Packet label is required.";
  }

  if (input.collectionId == null) {
    return "A collection is required.";
  }

  const propertyId = resolvePacketPropertyIdForSave(
    input.packetType,
    input.propertyId,
  );

  if (
    input.packetType &&
    workflowRequiresProperty(input.packetType) &&
    propertyId == null
  ) {
    return getPropertyRequiredMessage(input.packetType);
  }

  return null;
}

export async function updatePacket(
  supabase: SupabaseClient,
  packetId: number,
  input: UpdatePacketInput,
  options?: { hasLegacyAgreement?: boolean },
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from("packets")
    .select("id, status, representation_agreement_id")
    .eq("id", packetId)
    .single();

  if (fetchError || !existing) {
    throw new Error("Packet not found.");
  }

  if (existing.status === "DELETED") {
    throw new Error("Deleted packets cannot be edited. Restore the packet first.");
  }

  const hasLegacyAgreement =
    options?.hasLegacyAgreement ?? existing.representation_agreement_id != null;

  const validationError = validateUpdatePacketInput({
    label: input.label,
    packetType: input.packetType,
    collectionId: input.collectionId,
    propertyId: input.propertyId,
    hasLegacyAgreement,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  const updateRow: Record<string, unknown> = {
    label: input.label.trim(),
    property_id: resolvePacketPropertyIdForSave(
      input.packetType,
      input.propertyId,
    ),
    notes: input.notes?.trim() || null,
    status: input.status,
  };

  if (!hasLegacyAgreement) {
    updateRow.packet_type = input.packetType;
    updateRow.collection_id = input.collectionId;
  }

  const { error } = await supabase
    .from("packets")
    .update(updateRow)
    .eq("id", packetId)
    .neq("status", "DELETED");

  if (error) {
    throw new Error(error.message);
  }
}

/** @legacy Requires a representation agreement anchor. */
export function validateCreatePacketInput(
  collectionId: number | null,
  agreementId: number | null,
): string | null {
  if (agreementId == null) {
    return "A representation agreement is required.";
  }

  if (collectionId == null) {
    return "A collection is required.";
  }

  return null;
}

export function validateGeneratePacketInput(
  collectionId: number | null,
  agreementId: number | null,
): string | null {
  return validateCreatePacketInput(collectionId, agreementId);
}

const COLLECTION_FOR_GENERATION_SELECT = `
  *,
  collection_forms(
    id,
    form_id,
    sort_order,
    is_required,
    status,
    forms(
      id,
      form_name,
      form_code,
      source_storage_path
    )
  )
`;

const AGREEMENT_FOR_GENERATION_SELECT = `
  *,
  representation_agreement_clients(
    sort_order,
    status,
    contacts(*)
  )
`;

export type CreatePacketFromCollectionInput = {
  collectionId: number;
  packetType: PacketWorkflowType;
  contacts: PacketContactAssignment[];
  propertyId?: number | null;
  label?: string;
  additionalInternalFormIds?: number[];
  externalForms?: DraftExternalPacketForm[];
};

/**
 * Creates a packet from a collection plus packet_contacts (no agreement anchor).
 */
export async function createPacketFromCollection(
  supabase: SupabaseClient,
  input: CreatePacketFromCollectionInput,
): Promise<{ packetId: number }> {
  const validationError = validateCreatePacketFromCollectionInput({
    collectionId: input.collectionId,
    packetType: input.packetType,
    contactIds: input.contacts.map((contact) => contact.contactId),
    propertyId: input.propertyId ?? null,
  });
  if (validationError) {
    throw new Error(validationError);
  }

  const { data: collectionData, error: collectionError } = await supabase
    .from("collections")
    .select(COLLECTION_FOR_GENERATION_SELECT)
    .eq("id", input.collectionId)
    .eq("status", "ACTIVE")
    .single();

  if (collectionError || !collectionData) {
    throw new Error(collectionError?.message ?? "Collection not found.");
  }

  const collectionWithForms = collectionData as Collection & {
    collection_forms?: CollectionFormLink[];
  };

  const activeFormLinks = (collectionWithForms.collection_forms ?? [])
    .filter((link) => link.status === "ACTIVE")
    .sort((a, b) => a.sort_order - b.sort_order);

  if (activeFormLinks.length === 0) {
    throw new Error("The selected collection must contain at least one form.");
  }

  const collectionFormIds = getCollectionFormIds(
    collectionWithForms.collection_forms ?? [],
  );
  const additionalFormIds = input.additionalInternalFormIds ?? [];
  const uniqueAdditional = new Set(additionalFormIds);
  if (uniqueAdditional.size !== additionalFormIds.length) {
    throw new Error("Duplicate additional forms are not allowed.");
  }

  for (const formId of additionalFormIds) {
    const duplicateError = validateAdditionalInternalFormId(
      formId,
      collectionFormIds,
      [],
    );
    if (duplicateError) {
      throw new Error(duplicateError);
    }
  }

  const contactIds = input.contacts.map((contact) => contact.contactId);
  const { data: contactsData, error: contactsError } = await supabase
    .from("contacts")
    .select("*")
    .eq("status", "ACTIVE")
    .in("id", contactIds);

  if (contactsError) {
    throw new Error(contactsError.message);
  }

  const contactsById = new Map(
    ((contactsData ?? []) as { id: number }[]).map((contact) => [
      contact.id,
      contact,
    ]),
  );

  for (const assignment of input.contacts) {
    if (!contactsById.has(assignment.contactId)) {
      throw new Error(`Contact #${assignment.contactId} not found.`);
    }
  }

  const orderedContactNames = input.contacts
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((assignment) =>
      formatContactDisplayName(
        contactsById.get(assignment.contactId) as Parameters<
          typeof formatContactDisplayName
        >[0],
      ),
    )
    .join(" & ");

  const packetLabel =
    input.label?.trim() ||
    buildPacketLabel(orderedContactNames, collectionWithForms.collection_name);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: createdPacket, error: createError } = await supabase
    .from("packets")
    .insert({
      collection_id: input.collectionId,
      representation_agreement_id: null,
      packet_type: input.packetType,
      property_id: resolvePacketPropertyIdForSave(
        input.packetType,
        input.propertyId ?? null,
      ),
      label: packetLabel,
      generated_by_user_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (createError || !createdPacket) {
    throw new Error(createError?.message ?? "Failed to create packet.");
  }

  const packetContactRows = input.contacts.map((assignment) => ({
    packet_id: createdPacket.id,
    contact_id: assignment.contactId,
    packet_role: assignment.packetRole,
    sort_order: assignment.sortOrder,
  }));

  const { error: packetContactsError } = await supabase
    .from("packet_contacts")
    .insert(packetContactRows);

  if (packetContactsError) {
    throw new Error(packetContactsError.message);
  }

  await createCollectionPacketForms(
    supabase,
    createdPacket.id,
    collectionWithForms.collection_forms ?? [],
    user?.id ?? null,
  );

  if (additionalFormIds.length > 0) {
    const startingSortOrder =
      getMaxCollectionSortOrder(collectionWithForms.collection_forms ?? []) + 10;
    await createAdditionalInternalPacketForms(
      supabase,
      createdPacket.id,
      additionalFormIds,
      startingSortOrder,
      user?.id ?? null,
    );
  }

  const externalForms = input.externalForms ?? [];
  if (externalForms.length > 0) {
    const collectionMax = getMaxCollectionSortOrder(
      collectionWithForms.collection_forms ?? [],
    );
    const additionalCount = additionalFormIds.length;
    const startingSortOrder =
      collectionMax + 10 + additionalCount * 10;
    await createExternalPacketForms(
      supabase,
      createdPacket.id,
      externalForms,
      startingSortOrder,
      user?.id ?? null,
    );
  }

  return { packetId: createdPacket.id };
}

/**
 * @legacy Creates a packet anchored to a representation_agreement row.
 * Use {@link createPacketFromCollection} for normal packet creation.
 */
export async function generatePacketFromAgreement(
  supabase: SupabaseClient,
  agreementId: number,
  collectionId: number,
): Promise<{ packetId: number }> {
  const validationError = validateCreatePacketInput(
    collectionId,
    agreementId,
  );
  if (validationError) {
    throw new Error(validationError);
  }

  const { data: agreementData, error: agreementError } = await supabase
    .from("representation_agreements")
    .select(AGREEMENT_FOR_GENERATION_SELECT)
    .eq("id", agreementId)
    .eq("status", "ACTIVE")
    .single();

  if (agreementError || !agreementData) {
    throw new Error(agreementError?.message ?? "Representation agreement not found.");
  }

  const agreement = agreementData as BuyerRepAgreementListItem;

  const { data: collectionData, error: collectionError } = await supabase
    .from("collections")
    .select(COLLECTION_FOR_GENERATION_SELECT)
    .eq("id", collectionId)
    .eq("status", "ACTIVE")
    .single();

  if (collectionError || !collectionData) {
    throw new Error(collectionError?.message ?? "Collection not found.");
  }

  const collectionWithForms = collectionData as Collection & {
    collection_forms?: CollectionFormLink[];
  };

  const activeFormLinks = (collectionWithForms.collection_forms ?? [])
    .filter((link) => link.status === "ACTIVE")
    .sort((a, b) => a.sort_order - b.sort_order);

  if (activeFormLinks.length === 0) {
    throw new Error("The selected collection must contain at least one form.");
  }

  const contactNames = getOrderedContactNames(agreement);
  const packetLabel = buildPacketLabel(
    contactNames,
    collectionWithForms.collection_name,
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: createdPacket, error: createError } = await supabase
    .from("packets")
    .insert({
      collection_id: collectionId,
      representation_agreement_id: agreementId,
      packet_type:
        agreement.agreement_type === "LISTING"
          ? "listing"
          : agreement.agreement_type === "BUYER_REP"
            ? "buyer_rep"
            : null,
      property_id:
        agreement.agreement_type === "BUYER_REP"
          ? null
          : agreement.property_id ?? null,
      label: packetLabel,
      generated_by_user_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (createError || !createdPacket) {
    throw new Error(createError?.message ?? "Failed to create packet.");
  }

  await createCollectionPacketForms(
    supabase,
    createdPacket.id,
    collectionWithForms.collection_forms ?? [],
    user?.id ?? null,
  );

  return { packetId: createdPacket.id };
}
