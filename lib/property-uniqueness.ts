import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isUniqueViolationError,
  PROPERTY_DUPLICATE_ADDRESS_MESSAGE,
  PROPERTY_RESTORE_ADDRESS_CONFLICT_MESSAGE,
  propertyAddressIdentityKey,
  type PropertyAddressParts,
} from "@/lib/property-address-normalize";
import {
  emptyPropertyInput,
  normalizePropertyInput,
  type PropertyInput,
} from "@/lib/types/property";

export type LivePropertyConflict = {
  id: number;
  status: string;
  street_address: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
};

function identityKeyFromParts(parts: PropertyAddressParts): string {
  return propertyAddressIdentityKey(parts);
}

/**
 * Find a non-deleted property owned by `ownerUserId` at the same
 * normalized address. Optionally exclude a property id (for updates).
 */
export async function findExistingLivePropertyByAddress(
  supabase: SupabaseClient,
  propertyInput: Pick<
    PropertyInput,
    "street_address" | "unit" | "city" | "state" | "zip"
  >,
  ownerUserId: string | null | undefined,
  excludePropertyId?: number | null,
): Promise<LivePropertyConflict | null> {
  if (!ownerUserId) {
    return null;
  }

  const normalized = normalizePropertyInput({
    ...emptyPropertyInput(),
    ...propertyInput,
  });
  const targetKey = identityKeyFromParts(normalized);

  let query = supabase
    .from("properties")
    .select("id, status, street_address, unit, city, state, zip")
    .eq("owner_user_id", ownerUserId)
    .neq("status", "DELETED");

  if (excludePropertyId != null) {
    query = query.neq("id", excludePropertyId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const match = (data ?? []).find(
    (row) =>
      identityKeyFromParts({
        street_address: row.street_address,
        unit: row.unit,
        city: row.city,
        state: row.state,
        zip: row.zip,
      }) === targetKey,
  );

  return match ?? null;
}

export async function assertNoLiveAddressConflict(
  supabase: SupabaseClient,
  propertyInput: Pick<
    PropertyInput,
    "street_address" | "unit" | "city" | "state" | "zip"
  >,
  ownerUserId: string | null | undefined,
  excludePropertyId?: number | null,
): Promise<void> {
  const conflict = await findExistingLivePropertyByAddress(
    supabase,
    propertyInput,
    ownerUserId,
    excludePropertyId,
  );
  if (conflict) {
    throw new Error(PROPERTY_DUPLICATE_ADDRESS_MESSAGE);
  }
}

export async function restoreProperty(
  supabase: SupabaseClient,
  propertyId: number,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Authentication required.");
  }

  const { data: existing, error: fetchError } = await supabase
    .from("properties")
    .select("id, status, street_address, unit, city, state, zip, owner_user_id")
    .eq("id", propertyId)
    .single();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message ?? "Property not found.");
  }

  if (existing.status !== "DELETED") {
    throw new Error("Only deleted properties can be restored.");
  }

  const conflict = await findExistingLivePropertyByAddress(
    supabase,
    {
      street_address: existing.street_address,
      unit: existing.unit ?? "",
      city: existing.city,
      state: existing.state,
      zip: existing.zip,
    },
    existing.owner_user_id,
    propertyId,
  );

  if (conflict) {
    throw new Error(PROPERTY_RESTORE_ADDRESS_CONFLICT_MESSAGE);
  }

  const { error } = await supabase
    .from("properties")
    .update({ status: "ACTIVE" })
    .eq("id", propertyId)
    .eq("status", "DELETED");

  if (error) {
    if (isUniqueViolationError(error)) {
      throw new Error(PROPERTY_RESTORE_ADDRESS_CONFLICT_MESSAGE);
    }
    throw new Error(error.message);
  }
}

export {
  PROPERTY_DUPLICATE_ADDRESS_MESSAGE,
  PROPERTY_RESTORE_ADDRESS_CONFLICT_MESSAGE,
  isUniqueViolationError,
};
