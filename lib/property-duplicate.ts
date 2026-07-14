import type { SupabaseClient } from "@supabase/supabase-js";
import { findExistingActivePropertyByAddress } from "@/lib/contact-property-from-address";
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
  return `A property at ${formattedAddress} already exists. Would you like to update that property with the information you entered?`;
}

export function formatPropertyDuplicateInfoMessage(
  formattedAddress: string,
): string {
  return `A property at ${formattedAddress} already exists. No new property was created.`;
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
  const existingPropertyId = await findExistingActivePropertyByAddress(
    supabase,
    propertyInput,
    user?.id ?? null,
  );

  if (existingPropertyId != null) {
    const formattedAddress = formatPropertyAddress(normalized);
    const choice = await onDuplicate({
      existingPropertyId,
      formattedAddress,
    });

    if (choice === "cancel") {
      return null;
    }

    const { error } = await supabase
      .from("properties")
      .update(normalized)
      .eq("id", existingPropertyId)
      .eq("status", "ACTIVE");

    if (error) {
      throw new Error(error.message);
    }

    return existingPropertyId;
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
    throw new Error(error?.message ?? "Failed to create property.");
  }

  return data.id as number;
}
