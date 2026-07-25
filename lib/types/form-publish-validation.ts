/**
 * Pure Publish validation helpers.
 * Dependency-free for Node --experimental-strip-types tests.
 */

export type FormLifecycleSnapshot = {
  status: string | null | undefined;
  publication_state: string | null | undefined;
};

function canPublishForm(form: FormLifecycleSnapshot): boolean {
  return form.status === "ACTIVE" && form.publication_state === "DRAFT";
}

/** Keep aligned with FIELD_SOURCE_TYPES in field-source.ts. */
const SUPPORTED_SOURCE_TYPES = [
  "settings_agent",
  "settings_brokerage",
  "packet_contact",
  "packet_property",
  "buyer_rep_details",
  "representation_agreement",
  "custom_resolver",
  "manual_only",
  "packet_instance",
] as const;

export type PublishMappingRow = {
  id: string;
  field_id: string | null;
  page_number: number;
  status: string;
  pdf_field_name?: string | null;
  occurrence_index?: number | null;
  mapping_name?: string | null;
};

export type PublishFieldRow = {
  id: string;
  status: string;
  source_type: string | null;
  resolver_key: string | null;
  field_key?: string | null;
  field_label?: string | null;
  field_name?: string | null;
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
  pdfPageCount: number | null;
  invalidPageMappingCount: number;
};

function mappingDisplayLabel(
  mapping: PublishMappingRow,
  field: PublishFieldRow | undefined,
): string {
  const fromField =
    field?.field_label?.trim() ||
    field?.field_name?.trim() ||
    field?.field_key?.trim();
  if (fromField) {
    return fromField;
  }
  const fromMapping = mapping.mapping_name?.trim() || mapping.pdf_field_name?.trim();
  if (fromMapping) {
    return fromMapping;
  }
  return "Unnamed field";
}

/**
 * Pure Publish validation. Callers must supply an authoritative server-side
 * `pdfPageCount` (never a client-supplied value). Pass null only when the PDF
 * could not be read — that itself is a blocking issue.
 */
export function validateFormForPublish(input: {
  form: FormLifecycleSnapshot & {
    scope?: string | null;
    owner_user_id?: string | null;
    source_storage_path?: string | null;
  };
  mappings: PublishMappingRow[];
  fieldsById: Map<string, PublishFieldRow>;
  /**
   * Authoritative page count from the stored PDF, or null when the PDF could
   * not be loaded / counted. Null is always a blocking publish failure.
   */
  pdfPageCount: number | null;
  pdfLoadError?: string | null;
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

  if (input.pdfPageCount == null) {
    issues.push({
      code: "pdf_unreadable",
      message:
        input.pdfLoadError?.trim() ||
        "A readable PDF with a determinate page count is required before publishing.",
      blocking: true,
    });
  } else if (
    !Number.isFinite(input.pdfPageCount) ||
    input.pdfPageCount < 1
  ) {
    issues.push({
      code: "pdf_page_count_unknown",
      message: "The PDF page count could not be determined.",
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

  const outOfRangeLabels: string[] = [];
  const identityKeys = new Set<string>();

  for (const mapping of activeMappings) {
    if (!mapping.field_id) {
      issues.push({
        code: "mapping_unlinked",
        message: `A mapping on page ${mapping.page_number} is not linked to a catalog field.`,
        blocking: true,
      });
      continue;
    }

    const field = input.fieldsById.get(mapping.field_id);
    if (!field || field.status !== "ACTIVE") {
      issues.push({
        code: "inactive_field",
        message: `Mapping “${mappingDisplayLabel(mapping, field)}” references an inactive or missing field.`,
        blocking: true,
      });
    } else if (field.source_type) {
      if (
        !(SUPPORTED_SOURCE_TYPES as readonly string[]).includes(
          field.source_type,
        )
      ) {
        issues.push({
          code: "invalid_source_type",
          message: `Field “${mappingDisplayLabel(mapping, field)}” uses unsupported source type "${field.source_type}".`,
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
          message: `Field “${mappingDisplayLabel(mapping, field)}” has unknown resolver key "${field.resolver_key}".`,
          blocking: true,
        });
      }
    }

    if (
      input.pdfPageCount != null &&
      Number.isFinite(input.pdfPageCount) &&
      input.pdfPageCount >= 1 &&
      (mapping.page_number < 1 || mapping.page_number > input.pdfPageCount)
    ) {
      outOfRangeLabels.push(
        `“${mappingDisplayLabel(mapping, field)}” (page ${mapping.page_number})`,
      );
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
        message: `Duplicate mapping identity for “${mappingDisplayLabel(mapping, field)}”.`,
        blocking: true,
      });
    }
    identityKeys.add(identity);
  }

  if (outOfRangeLabels.length > 0 && input.pdfPageCount != null) {
    const count = outOfRangeLabels.length;
    const pageLabel = `${input.pdfPageCount}-page`;
    const fieldWord = count === 1 ? "field references" : "fields reference";
    const detail =
      count <= 3
        ? ` Invalid mappings: ${outOfRangeLabels.join(", ")}.`
        : ` Invalid mappings include: ${outOfRangeLabels.slice(0, 3).join(", ")}, and ${count - 3} more.`;
    issues.push({
      code: "invalid_page",
      message: `This form cannot be published because ${count} mapped ${fieldWord} pages outside the ${pageLabel} PDF.${detail}`,
      blocking: true,
    });
  }

  return {
    ok: issues.every((issue) => !issue.blocking),
    issues,
    mappingCount: activeMappings.length,
    requiresEmptyMappingsConfirmation,
    pdfPageCount: input.pdfPageCount,
    invalidPageMappingCount: outOfRangeLabels.length,
  };
}
