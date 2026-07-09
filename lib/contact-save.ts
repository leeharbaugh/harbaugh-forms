import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPropertyInputFromContactAddress,
  findExistingActivePropertyByAddress,
  validateContactPropertyCreation,
} from "@/lib/contact-property-from-address";
import {
  type ContactInput,
  normalizeContactInput,
  validateContactInput,
} from "@/lib/types/contact";
import {
  formatPropertyAddress,
  normalizePropertyInput,
} from "@/lib/types/property";

export type SaveContactWithOptionalPropertyInput = {
  contact: ContactInput;
  addAddressAsProperty: boolean;
  mode: "create" | "edit";
  contactId?: number;
};

export type SaveContactWithOptionalPropertyResult = {
  contactId: number;
  propertyId?: number;
  propertyCreated?: boolean;
  propertyDuplicateSkipped?: boolean;
  duplicatePropertyAddress?: string;
};

export async function saveContactWithOptionalProperty(
  supabase: SupabaseClient,
  input: SaveContactWithOptionalPropertyInput,
): Promise<SaveContactWithOptionalPropertyResult> {
  const normalized = normalizeContactInput(input.contact);
  const validationError = validateContactInput(normalized);
  if (validationError) {
    throw new Error(validationError);
  }

  if (input.addAddressAsProperty) {
    const propertyValidationError = validateContactPropertyCreation(normalized);
    if (propertyValidationError) {
      throw new Error(propertyValidationError);
    }
  }

  let contactId = input.contactId ?? null;

  if (input.mode === "create") {
    const { data, error } = await supabase
      .from("contacts")
      .insert(normalized)
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create contact.");
    }

    contactId = data.id as number;
  } else {
    if (contactId == null) {
      throw new Error("Contact id is required when editing.");
    }

    const { error } = await supabase
      .from("contacts")
      .update(normalized)
      .eq("id", contactId)
      .eq("status", "ACTIVE");

    if (error) {
      throw new Error(error.message);
    }
  }

  if (!input.addAddressAsProperty) {
    return { contactId: contactId as number };
  }

  const propertyInput = buildPropertyInputFromContactAddress(normalized);
  if (!propertyInput) {
    throw new Error("Enter an address before adding it as a property.");
  }

  const existingPropertyId = await findExistingActivePropertyByAddress(
    supabase,
    propertyInput,
  );
  if (existingPropertyId != null) {
    return {
      contactId: contactId as number,
      propertyDuplicateSkipped: true,
      duplicatePropertyAddress: formatPropertyAddress(
        normalizePropertyInput(propertyInput),
      ),
    };
  }

  const normalizedProperty = normalizePropertyInput(propertyInput);
  const { data, error } = await supabase
    .from("properties")
    .insert(normalizedProperty)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create property.");
  }

  return {
    contactId: contactId as number,
    propertyId: data.id as number,
    propertyCreated: true,
  };
}
