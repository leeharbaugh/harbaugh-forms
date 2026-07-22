import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPropertyHoaWritePayload,
  pickPrimaryPropertyHoa,
  type PropertyHoa,
  type PropertyHoaFormFields,
} from "@/lib/types/property-hoa";

export type { PropertyHoaFormFields } from "@/lib/types/property-hoa";
export {
  buildPropertyHoaWritePayload,
  extractPropertyHoaFormFields,
  propertyHoaFormFieldsFromRow,
} from "@/lib/types/property-hoa";

/**
 * Temporary single-HOA UI convention: the Property screen reads/writes the
 * first ACTIVE `property_hoas` row (ordered by create_date, then id).
 * The schema still supports multiple HOAs; this is not a permanent business rule.
 */

export async function loadActivePropertyHoasForProperty(
  supabase: SupabaseClient,
  propertyId: number,
): Promise<PropertyHoa[]> {
  const { data, error } = await supabase
    .from("property_hoas")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "ACTIVE")
    .order("create_date", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as PropertyHoa[]) ?? [];
}

export async function loadPrimaryActivePropertyHoa(
  supabase: SupabaseClient,
  propertyId: number,
): Promise<PropertyHoa | null> {
  const rows = await loadActivePropertyHoasForProperty(supabase, propertyId);
  return pickPrimaryPropertyHoa(rows);
}

/**
 * Sync the Property-screen HOA inputs to exactly one primary ACTIVE row.
 * - Nonblank HOA name + no ACTIVE row → insert
 * - Nonblank HOA name + ACTIVE rows → update first only
 * - Blank HOA name + ACTIVE primary → soft-delete first only (status=DELETED)
 * Never hard-deletes; never mutates additional ACTIVE rows.
 */
export async function syncPrimaryPropertyHoaFromForm(
  supabase: SupabaseClient,
  propertyId: number,
  fields: PropertyHoaFormFields,
): Promise<void> {
  const payload = buildPropertyHoaWritePayload(fields);
  const primary = await loadPrimaryActivePropertyHoa(supabase, propertyId);

  if (!payload) {
    if (!primary) {
      return;
    }

    const { error } = await supabase
      .from("property_hoas")
      .update({ status: "DELETED" })
      .eq("id", primary.id)
      .eq("status", "ACTIVE");

    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  if (primary) {
    const { error } = await supabase
      .from("property_hoas")
      .update(payload)
      .eq("id", primary.id)
      .eq("status", "ACTIVE");

    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from("property_hoas").insert({
    property_id: propertyId,
    status: "ACTIVE",
    ...payload,
  });

  if (error) {
    throw new Error(error.message);
  }
}
