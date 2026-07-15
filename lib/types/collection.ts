import type { SupabaseClient } from "@supabase/supabase-js";
import type { Form } from "@/lib/types/form";
import {
  assertCanEditCollection,
  COLLECTION_PERMISSION_DENIED,
  isActiveAppAdmin,
  type LibraryActor,
} from "@/lib/library-permissions";

async function loadLibraryActor(
  supabase: SupabaseClient,
  userId: string,
): Promise<LibraryActor> {
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("status, app_role, onboarding_status")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("organization_id, membership_role, status")
      .eq("user_id", userId)
      .eq("status", "ACTIVE"),
  ]);

  const rows = memberships ?? [];
  return {
    userId,
    isActiveAdmin: isActiveAppAdmin(profile),
    memberOrganizationIds: rows.map(
      (row: { organization_id: string }) => row.organization_id,
    ),
    orgAdminOrganizationIds: rows
      .filter(
        (row: { membership_role: string }) =>
          row.membership_role === "ORG_ADMIN",
      )
      .map((row: { organization_id: string }) => row.organization_id),
  };
}

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
  organizations?: { name: string } | null;
};

export type CollectionDetail = Collection & {
  collection_forms?: CollectionFormLink[];
  organizations?: { name: string } | null;
};

export type CollectionFormSelection = {
  form_id: number;
  is_required: boolean;
};

export type CollectionCreateScope = "PRIVATE" | "ORGANIZATION";

export type CollectionInput = {
  collection_name: string;
  collection_type: CollectionType;
  description: string;
  forms: CollectionFormSelection[];
  /** Create-only: PRIVATE (default) or ORGANIZATION. */
  scope: CollectionCreateScope;
  organization_id: string | null;
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
  scope: "PRIVATE",
  organization_id: null,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  const [{ data: actor }, { data, error: fetchError }] = await Promise.all([
    loadLibraryActor(supabase, user.id).then((value) => ({ data: value })),
    supabase
      .from("collections")
      .select("id, status, scope, owner_user_id, organization_id")
      .eq("id", collectionId)
      .single(),
  ]);

  if (fetchError || !data) {
    throw new Error("Collection not found.");
  }

  assertCanEditCollection(actor, data);

  if (data.status === "DELETED") {
    throw new Error("Collection is already deleted.");
  }

  const { data: deletedRows, error } = await supabase
    .from("collections")
    .update({ status: "DELETED" })
    .eq("id", collectionId)
    .eq("status", "ACTIVE")
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  if (!deletedRows?.length) {
    throw new Error(COLLECTION_PERMISSION_DENIED);
  }
}

export async function restoreCollection(
  supabase: SupabaseClient,
  collectionId: number,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  const [{ data: actor }, { data, error: fetchError }] = await Promise.all([
    loadLibraryActor(supabase, user.id).then((value) => ({ data: value })),
    supabase
      .from("collections")
      .select("id, status, scope, owner_user_id, organization_id")
      .eq("id", collectionId)
      .single(),
  ]);

  if (fetchError || !data) {
    throw new Error("Collection not found.");
  }

  assertCanEditCollection(actor, data);

  if (data.status !== "DELETED") {
    throw new Error("Only deleted collections can be restored.");
  }

  const { data: restoredRows, error } = await supabase
    .from("collections")
    .update({ status: "ACTIVE" })
    .eq("id", collectionId)
    .eq("status", "DELETED")
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  if (!restoredRows?.length) {
    throw new Error(COLLECTION_PERMISSION_DENIED);
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
    scope:
      collection.scope === "ORGANIZATION" ? "ORGANIZATION" : "PRIVATE",
    organization_id: collection.organization_id,
  };
}

export function validateCollectionInput(
  input: CollectionInput,
  options?: { forCreate?: boolean },
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

  if (options?.forCreate) {
    if (input.scope !== "PRIVATE" && input.scope !== "ORGANIZATION") {
      return "Collections may only be Private or Organization.";
    }
    if (input.scope === "ORGANIZATION" && !input.organization_id) {
      return "Select an organization for this collection.";
    }
  }

  return null;
}

export function normalizeCollectionInput(input: CollectionInput) {
  const trim = (value: string) => value.trim();
  const scope: CollectionCreateScope =
    input.scope === "ORGANIZATION" ? "ORGANIZATION" : "PRIVATE";

  return {
    collection_name: trim(input.collection_name),
    collection_type: input.collection_type,
    description: trim(input.description) || null,
    forms: input.forms.map((form) => ({
      form_id: form.form_id,
      is_required: form.is_required,
    })),
    scope,
    organization_id:
      scope === "ORGANIZATION" ? input.organization_id : null,
  };
}

export async function syncCollectionForms(
  supabase: SupabaseClient,
  collectionId: number,
  forms: CollectionFormSelection[],
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  const [{ data: actor }, { data: collection, error: collectionError }] =
    await Promise.all([
      loadLibraryActor(supabase, user.id).then((value) => ({ data: value })),
      supabase
        .from("collections")
        .select("id, status, scope, owner_user_id, organization_id")
        .eq("id", collectionId)
        .single(),
    ]);

  if (collectionError || !collection) {
    throw new Error(collectionError?.message ?? "Collection not found.");
  }

  assertCanEditCollection(actor, collection);

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

export async function cloneLibraryCollection(
  supabase: SupabaseClient,
  sourceCollectionId: number,
): Promise<number> {
  const { data, error } = await supabase.rpc("clone_library_collection", {
    p_source_collection_id: sourceCollectionId,
  });

  if (error) {
    // Fall back to legacy RPC name if migration not yet applied.
    const legacy = await supabase.rpc("clone_global_collection", {
      p_source_collection_id: sourceCollectionId,
    });
    if (legacy.error) {
      throw new Error(error.message);
    }
    const legacyId =
      typeof legacy.data === "number" ? legacy.data : Number(legacy.data);
    if (!Number.isFinite(legacyId)) {
      throw new Error("Clone succeeded but no collection id was returned.");
    }
    return legacyId;
  }

  const newId = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(newId)) {
    throw new Error("Clone succeeded but no collection id was returned.");
  }

  return newId;
}

/** @deprecated Prefer cloneLibraryCollection */
export async function cloneGlobalCollection(
  supabase: SupabaseClient,
  sourceCollectionId: number,
): Promise<number> {
  return cloneLibraryCollection(supabase, sourceCollectionId);
}
