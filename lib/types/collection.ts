import type { SupabaseClient } from "@supabase/supabase-js";
import type { Form } from "@/lib/types/form";

export type CollectionType =
  | "BUYER_REP_PACKET"
  | "LISTING_PACKET"
  | "OFFER_PACKET"
  | "AMENDMENT_PACKET"
  | "CUSTOM";

export type VisibilityScope = "GLOBAL" | "PRIVATE" | "ORGANIZATION";

export type Collection = {
  id: number;
  collection_name: string;
  collection_type: CollectionType;
  description: string | null;
  create_date: string;
  update_date: string;
  status: string;
  scope: VisibilityScope;
  owner_user_id: string | null;
  organization_id: string | null;
};

export type CollectionFormLink = {
  id: number;
  collection_id: number;
  form_id: number;
  sort_order: number;
  is_required: boolean;
  status: string;
  forms?: Form | null;
};

export type CollectionListItem = Collection & {
  collection_forms?: Pick<CollectionFormLink, "id" | "status">[];
};

export type CollectionDetail = Collection & {
  collection_forms?: CollectionFormLink[];
};

export type CollectionFormSelection = {
  form_id: number;
  is_required: boolean;
};

export type CollectionInput = {
  collection_name: string;
  collection_type: CollectionType;
  description: string;
  forms: CollectionFormSelection[];
};

export const COLLECTION_TYPES: CollectionType[] = [
  "BUYER_REP_PACKET",
  "LISTING_PACKET",
  "OFFER_PACKET",
  "AMENDMENT_PACKET",
  "CUSTOM",
];

const COLLECTION_TYPE_LABELS: Record<CollectionType, string> = {
  BUYER_REP_PACKET: "Buyer Rep Packet",
  LISTING_PACKET: "Listing Packet",
  OFFER_PACKET: "Offer Packet",
  AMENDMENT_PACKET: "Amendment Packet",
  CUSTOM: "Custom",
};

export const emptyCollectionInput = (): CollectionInput => ({
  collection_name: "",
  collection_type: "BUYER_REP_PACKET",
  description: "",
  forms: [],
});

export function formatCollectionReference(id: number): string {
  return `#${id}`;
}

export function formatCollectionType(collectionType: CollectionType): string {
  return COLLECTION_TYPE_LABELS[collectionType];
}

export function formatCollectionStatus(status: string): string {
  if (status === "DELETED") return "Deleted";
  if (status === "INACTIVE") return "Inactive";
  return "Active";
}

export function isCollectionDeleted(
  collection: Pick<Collection, "status">,
): boolean {
  return collection.status === "DELETED";
}

export async function deleteCollection(
  supabase: SupabaseClient,
  collectionId: number,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("collections")
    .select("id, status")
    .eq("id", collectionId)
    .single();

  if (fetchError || !data) {
    throw new Error("Collection not found.");
  }

  if (data.status === "DELETED") {
    throw new Error("Collection is already deleted.");
  }

  const { error } = await supabase
    .from("collections")
    .update({ status: "DELETED" })
    .eq("id", collectionId)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }
}

export async function restoreCollection(
  supabase: SupabaseClient,
  collectionId: number,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("collections")
    .select("id, status")
    .eq("id", collectionId)
    .single();

  if (fetchError || !data) {
    throw new Error("Collection not found.");
  }

  if (data.status !== "DELETED") {
    throw new Error("Only deleted collections can be restored.");
  }

  const { error } = await supabase
    .from("collections")
    .update({ status: "ACTIVE" })
    .eq("id", collectionId)
    .eq("status", "DELETED");

  if (error) {
    throw new Error(error.message);
  }
}

export function getActiveFormLinkCount(
  collection: CollectionListItem,
): number {
  return (collection.collection_forms ?? []).filter(
    (link) => link.status === "ACTIVE",
  ).length;
}

export function collectionToInput(
  collection: CollectionDetail,
): CollectionInput {
  const activeLinks = (collection.collection_forms ?? [])
    .filter((link) => link.status === "ACTIVE")
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    collection_name: collection.collection_name,
    collection_type: collection.collection_type,
    description: collection.description ?? "",
    forms: activeLinks.map((link) => ({
      form_id: link.form_id,
      is_required: link.is_required,
    })),
  };
}

export function validateCollectionInput(
  input: CollectionInput,
): string | null {
  if (!input.collection_name.trim()) {
    return "Collection name is required.";
  }

  if (!input.collection_type) {
    return "Collection type is required.";
  }

  if (input.forms.length === 0) {
    return "At least one form is required.";
  }

  const uniqueFormIds = new Set(input.forms.map((form) => form.form_id));
  if (uniqueFormIds.size !== input.forms.length) {
    return "Each form can only be selected once.";
  }

  return null;
}

export function normalizeCollectionInput(input: CollectionInput) {
  const trim = (value: string) => value.trim();

  return {
    collection_name: trim(input.collection_name),
    collection_type: input.collection_type,
    description: trim(input.description) || null,
    forms: input.forms.map((form) => ({
      form_id: form.form_id,
      is_required: form.is_required,
    })),
  };
}

export async function syncCollectionForms(
  supabase: SupabaseClient,
  collectionId: number,
  forms: CollectionFormSelection[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("collection_forms")
    .update({ status: "DELETED" })
    .eq("collection_id", collectionId)
    .eq("status", "ACTIVE");

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (forms.length === 0) {
    return;
  }

  const rows = forms.map((form, index) => ({
    collection_id: collectionId,
    form_id: form.form_id,
    sort_order: index,
    is_required: form.is_required,
  }));

  const { error: insertError } = await supabase
    .from("collection_forms")
    .insert(rows);

  if (insertError) {
    throw new Error(insertError.message);
  }
}
