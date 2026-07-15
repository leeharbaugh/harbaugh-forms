import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findExistingLivePropertyByAddress,
  isUniqueViolationError,
  PROPERTY_DUPLICATE_ADDRESS_MESSAGE,
} from "@/lib/property-uniqueness";
import {
  formatPropertyAddress,
  normalizePropertyInput,
  type PropertyInput,
  validatePropertyInput,
} from "@/lib/types/property";

export const PROPERTY_DUPLICATE_TITLE = "Property already exists";

export type PropertyDuplicateChoice = "update" | "cancel";

export type PropertyDuplicatePromptInfo = {
  existingPropertyId: number;
  formattedAddress: string;
};

export function formatPropertyDuplicateConfirmMessage(
  formattedAddress: string,
): string {
  return `You already have a property at this address (${formattedAddress}). Would you like to update that property with the information you entered?`;
}

export function formatPropertyDuplicateInfoMessage(
  formattedAddress: string,
): string {
  return `You already have a property at this address (${formattedAddress}). No new property was created.`;
}

export async function saveNewPropertyWithDuplicateHandling(
  supabase: SupabaseClient,
  propertyInput: PropertyInput,
  onDuplicate: (
    info: PropertyDuplicatePromptInfo,
  ) => Promise<PropertyDuplicateChoice>,
): Promise<number | null> {
  const validationError = validatePropertyInput(propertyInput);
  if (validationError) {
    throw new Error(validationError);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const normalized = normalizePropertyInput(propertyInput);
  const conflict = await findExistingLivePropertyByAddress(
    supabase,
    propertyInput,
    user?.id ?? null,
  );

  if (conflict != null) {
    if (conflict.status !== "ACTIVE") {
      throw new Error(PROPERTY_DUPLICATE_ADDRESS_MESSAGE);
    }

    const formattedAddress = formatPropertyAddress(normalized);
    const choice = await onDuplicate({
      existingPropertyId: conflict.id,
      formattedAddress,
    });

    if (choice === "cancel") {
      return null;
    }

    const { error } = await supabase
      .from("properties")
      .update(normalized)
      .eq("id", conflict.id)
      .eq("status", "ACTIVE");

    if (error) {
      throw new Error(error.message);
    }

    return conflict.id;
  }

  const { data, error } = await supabase
    .from("properties")
    .insert({
      ...normalized,
      owner_user_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (isUniqueViolationError(error)) {
      throw new Error(PROPERTY_DUPLICATE_ADDRESS_MESSAGE);
    }
    throw new Error(error?.message ?? "Failed to create property.");
  }

  return data.id as number;
}
