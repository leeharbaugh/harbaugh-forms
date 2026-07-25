/**
 * Pure helpers for Publish structure fingerprints (TOCTOU guard).
 * The authoritative fingerprint is computed in PostgreSQL
 * (form_publish_structure_fingerprint); this mirror is for unit tests.
 */

export type FingerprintFormRow = {
  id: number;
  source_storage_path: string | null;
  update_date: string | null;
  status: string | null;
  publication_state: string | null;
};

export type FingerprintMappingRow = {
  id: string;
  field_id: string | null;
  page_number: number | null;
  pdf_field_name: string | null;
  occurrence_index: number | null;
  status: string | null;
};

export type FingerprintFieldRow = {
  id: string;
  status: string | null;
  source_type: string | null;
  resolver_key: string | null;
};

/**
 * Build the same pre-hash payload the SQL fingerprint function aggregates.
 * Hashing itself is done in Postgres (md5); tests compare payload shape.
 */
export function buildPublishStructureFingerprintPayload(input: {
  form: FingerprintFormRow | null;
  mappings: FingerprintMappingRow[];
  fields: FingerprintFieldRow[];
}): string {
  const formPart = input.form
    ? `form:${input.form.id}|path:${input.form.source_storage_path ?? ""}|updated:${input.form.update_date ?? ""}|status:${input.form.status ?? ""}|pub:${input.form.publication_state ?? ""}`
    : "form:missing";

  const mappingPart = [...input.mappings]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (m) =>
        `${m.id}:${m.field_id ?? ""}:${m.page_number ?? ""}:${m.pdf_field_name ?? ""}:${m.occurrence_index ?? ""}:${m.status ?? ""}`,
    )
    .join(",");

  const fieldPart = [...input.fields]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (f) =>
        `${f.id}:${f.status ?? ""}:${f.source_type ?? ""}:${f.resolver_key ?? ""}`,
    )
    .join(",");

  return `${formPart}|mappings:${mappingPart}|fields:${fieldPart}`;
}
