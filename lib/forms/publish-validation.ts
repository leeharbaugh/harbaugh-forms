import {
  FIELD_SOURCE_TYPES,
  type FieldSourceType,
} from "@/lib/types/field-source";
import {
  canPublishForm,
  type FormLifecycleSnapshot,
} from "@/lib/types/form-lifecycle";

export type PublishMappingRow = {
  id: string;
  field_id: string | null;
  page_number: number;
  status: string;
  pdf_field_name?: string | null;
  occurrence_index?: number | null;
};

export type PublishFieldRow = {
  id: string;
  status: string;
  source_type: string | null;
  resolver_key: string | null;
};

export type PublishValidationIssue = {
  code: string;
  message: string;
  blocking: boolean;
};

export type PublishValidationResult = {
  ok: boolean;
  issues: PublishValidationIssue[];
  mappingCount: number;
  requiresEmptyMappingsConfirmation: boolean;
};

export function validateFormForPublish(input: {
  form: FormLifecycleSnapshot & {
    scope?: string | null;
    owner_user_id?: string | null;
    source_storage_path?: string | null;
  };
  mappings: PublishMappingRow[];
  fieldsById: Map<string, PublishFieldRow>;
  pdfPageCount: number | null;
  allowEmptyMappings: boolean;
  knownResolverKeys?: ReadonlySet<string>;
}): PublishValidationResult {
  const issues: PublishValidationIssue[] = [];

  if (!canPublishForm(input.form)) {
    issues.push({
      code: "not_draft",
      message: "Only ACTIVE Draft forms can be published.",
      blocking: true,
    });
  }

  if (input.form.scope === "PRIVATE" && !input.form.owner_user_id) {
    issues.push({
      code: "private_owner",
      message: "Private forms require an owner before publishing.",
      blocking: true,
    });
  }

  const storagePath = input.form.source_storage_path?.trim() ?? "";
  if (!storagePath || storagePath.includes("/pending/")) {
    issues.push({
      code: "pdf_missing",
      message: "A readable PDF is required before publishing.",
      blocking: true,
    });
  }

  const activeMappings = input.mappings.filter((m) => m.status === "ACTIVE");
  const requiresEmptyMappingsConfirmation = activeMappings.length === 0;

  if (requiresEmptyMappingsConfirmation && !input.allowEmptyMappings) {
    issues.push({
      code: "empty_mappings",
      message:
        "This form has no field mappings. Confirm it is intentionally non-fillable before publishing.",
      blocking: true,
    });
  }

  const identityKeys = new Set<string>();
  for (const mapping of activeMappings) {
    if (!mapping.field_id) {
      issues.push({
        code: "mapping_unlinked",
        message: `Mapping ${mapping.id} is not linked to a catalog field.`,
        blocking: true,
      });
      continue;
    }

    const field = input.fieldsById.get(mapping.field_id);
    if (!field || field.status !== "ACTIVE") {
      issues.push({
        code: "inactive_field",
        message: `Mapping references an inactive or missing field.`,
        blocking: true,
      });
    } else if (field.source_type) {
      if (
        !FIELD_SOURCE_TYPES.includes(field.source_type as FieldSourceType)
      ) {
        issues.push({
          code: "invalid_source_type",
          message: `Field uses unsupported source type "${field.source_type}".`,
          blocking: true,
        });
      }
      if (
        field.source_type === "custom_resolver" &&
        input.knownResolverKeys &&
        field.resolver_key &&
        !input.knownResolverKeys.has(field.resolver_key)
      ) {
        issues.push({
          code: "invalid_resolver",
          message: `Unknown resolver key "${field.resolver_key}".`,
          blocking: true,
        });
      }
    }

    if (
      input.pdfPageCount != null &&
      (mapping.page_number < 1 || mapping.page_number > input.pdfPageCount)
    ) {
      issues.push({
        code: "invalid_page",
        message: `Mapping page ${mapping.page_number} is outside the PDF (${input.pdfPageCount} pages).`,
        blocking: true,
      });
    }

    const identity = [
      mapping.field_id,
      mapping.pdf_field_name ?? "",
      String(mapping.occurrence_index ?? 0),
      String(mapping.page_number),
    ].join("|");
    if (identityKeys.has(identity)) {
      issues.push({
        code: "duplicate_mapping",
        message: "Duplicate mapping identity detected.",
        blocking: true,
      });
    }
    identityKeys.add(identity);
  }

  return {
    ok: issues.every((issue) => !issue.blocking),
    issues,
    mappingCount: activeMappings.length,
    requiresEmptyMappingsConfirmation,
  };
}
