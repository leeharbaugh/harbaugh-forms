import type { SupabaseClient } from "@supabase/supabase-js";

export type FieldUsageCounts = {
  formFieldMappings: number;
  fieldInstances: number;
  fieldInstanceMappings: number;
};

export function isFieldInUse(counts: FieldUsageCounts): boolean {
  return (
    counts.formFieldMappings > 0 ||
    counts.fieldInstances > 0 ||
    counts.fieldInstanceMappings > 0
  );
}

async function countActiveRows(
  supabase: SupabaseClient,
  table: "form_field_mappings" | "field_instances" | "field_instance_mappings",
  fieldId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("field_id", fieldId)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function getFieldUsageCounts(
  supabase: SupabaseClient,
  fieldId: string,
): Promise<FieldUsageCounts> {
  const [formFieldMappings, fieldInstances, fieldInstanceMappings] =
    await Promise.all([
      countActiveRows(supabase, "form_field_mappings", fieldId),
      countActiveRows(supabase, "field_instances", fieldId),
      countActiveRows(supabase, "field_instance_mappings", fieldId),
    ]);

  return {
    formFieldMappings,
    fieldInstances,
    fieldInstanceMappings,
  };
}

export async function retireFieldGlobally(
  supabase: SupabaseClient,
  fieldId: string,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from("fields")
    .select("id, status")
    .eq("id", fieldId)
    .single();

  if (fetchError || !data) {
    throw new Error("Field not found.");
  }

  if (data.status === "DELETED") {
    throw new Error("Field is already deleted.");
  }

  const cascadeTables = [
    "field_instance_mappings",
    "field_instances",
    "form_field_mappings",
  ] as const;

  for (const table of cascadeTables) {
    const { error } = await supabase
      .from(table)
      .update({ status: "DELETED" })
      .eq("field_id", fieldId)
      .eq("status", "ACTIVE");

    if (error) {
      throw new Error(error.message);
    }
  }

  const { error: fieldError } = await supabase
    .from("fields")
    .update({ status: "DELETED" })
    .eq("id", fieldId)
    .in("status", ["ACTIVE", "INACTIVE"]);

  if (fieldError) {
    throw new Error(fieldError.message);
  }
}
