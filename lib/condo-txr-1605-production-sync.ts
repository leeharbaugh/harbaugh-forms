/**
 * Pure planning helpers for TXR-1605 development → existing production form sync.
 */
export const DEV_REF = "ewxsxwzezhkeawnjvigx";
export const PROD_REF = "eetonalyyyssvkyfdoxh";
export const FORM_CODE = "TXR-1605";
export const VERSION_LABEL = "TXR-1605-05-04-2026";
export const CONFIRM_TOKEN = "EXISTING_PROD_TXR_1605";
export const LEE_AUTH_UUID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";
export const LEE_AUTH_EMAIL = "lee@leeharbaugh.com";
export const DGR_ORGANIZATION_ID = "b788f525-53f4-42ed-b5a1-cb741398a974";
export const DGR_ORGANIZATION_NAME = "Davey Goosmann Realty";

export const STRUCTURAL_FIELD_COLS = [
  "field_name",
  "field_label",
  "field_data_type",
  "field_widget_type",
  "source_type",
  "source_path",
  "resolver_key",
  "required",
] as const;

export type FieldOp =
  | "REUSE"
  | "INSERT"
  | "UPDATE_METADATA"
  | "CONFLICT"
  | "NO_CHANGE";

export type MappingOp = "INSERT" | "UPDATE" | "NO_CHANGE" | "CONFLICT";
export type DefaultOp =
  | "INSERT"
  | "UPDATE"
  | "NO_CHANGE"
  | "SOFT_DELETE"
  | "CONFLICT";
export type StorageOp = "COPY" | "REUSE" | "REPLACE" | "CONFLICT";

export type StructuralField = {
  field_key: string;
  field_name: string;
  field_label: string;
  field_data_type: string;
  field_widget_type: string;
  source_type: string | null;
  source_path: string | null;
  resolver_key: string | null;
  required: boolean | null;
  notes?: string | null;
  status?: string;
  scope?: string;
  id?: string;
};

export type MappingLike = {
  id?: string;
  field_key: string;
  page_number: number;
  occurrence_index?: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  page_width?: number | null;
  page_height?: number | null;
  font_size?: number | null;
  alignment?: string | null;
  field_widget_type?: string | null;
  mapping_name?: string | null;
  default_value_override?: string | null;
  required?: boolean | null;
  notes?: string | null;
  pdf_field_name?: string | null;
  pdf_field_type?: string | null;
  pdf_export_value?: string | null;
  status?: string;
};

export type DefaultLike = {
  id?: string;
  field_key: string;
  scope: "PRIVATE" | "ORGANIZATION";
  owner_user_id?: string | null;
  organization_id?: string | null;
  form_field_mapping_id?: string | null;
  default_value?: string | null;
  default_checked?: boolean | null;
  notes?: string | null;
  status?: string;
  created_by_user_id?: string | null;
  updated_by_user_id?: string | null;
};

export function mappingNaturalKey(m: {
  field_key: string;
  page_number: number;
  occurrence_index?: number | null;
}): string {
  return `${m.field_key.toLowerCase()}|${m.page_number}|${m.occurrence_index ?? 0}`;
}

export function defaultNaturalKey(d: {
  scope: string;
  owner_user_id?: string | null;
  organization_id?: string | null;
  field_key: string;
  form_field_mapping_id?: string | null;
}): string {
  const owner =
    d.scope === "PRIVATE"
      ? `user:${d.owner_user_id ?? ""}`
      : `org:${d.organization_id ?? ""}`;
  return `${d.scope}|${owner}|${d.field_key.toLowerCase()}|map:${d.form_field_mapping_id ?? "none"}`;
}

export function nearlyEqual(
  a: number | null | undefined,
  b: number | null | undefined,
  eps = 0.05,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) <= eps;
}

export function structuralFieldDiffs(
  dev: StructuralField,
  prod: StructuralField,
): Partial<Record<(typeof STRUCTURAL_FIELD_COLS)[number], { dev: unknown; prod: unknown }>> {
  const diffs: Partial<
    Record<(typeof STRUCTURAL_FIELD_COLS)[number], { dev: unknown; prod: unknown }>
  > = {};
  for (const col of STRUCTURAL_FIELD_COLS) {
    const dv = (dev[col] ?? null) as unknown;
    const pv = (prod[col] ?? null) as unknown;
    if (String(dv) !== String(pv)) {
      diffs[col] = { dev: dv, prod: pv };
    }
  }
  return diffs;
}

export function mappingContentEqual(a: MappingLike, b: MappingLike): boolean {
  return (
    nearlyEqual(a.x, b.x) &&
    nearlyEqual(a.y, b.y) &&
    nearlyEqual(a.width, b.width) &&
    nearlyEqual(a.height, b.height) &&
    nearlyEqual(a.page_width, b.page_width) &&
    nearlyEqual(a.page_height, b.page_height) &&
    nearlyEqual(a.font_size, b.font_size) &&
    String(a.alignment ?? "") === String(b.alignment ?? "") &&
    String(a.field_widget_type ?? "") === String(b.field_widget_type ?? "") &&
    String(a.mapping_name ?? "") === String(b.mapping_name ?? "") &&
    String(a.default_value_override ?? "") ===
      String(b.default_value_override ?? "") &&
    Boolean(a.required) === Boolean(b.required) &&
    String(a.notes ?? "") === String(b.notes ?? "") &&
    String(a.pdf_field_name ?? "") === String(b.pdf_field_name ?? "") &&
    String(a.pdf_field_type ?? "") === String(b.pdf_field_type ?? "") &&
    String(a.pdf_export_value ?? "") === String(b.pdf_export_value ?? "")
  );
}

export function defaultContentEqual(a: DefaultLike, b: DefaultLike): boolean {
  return (
    String(a.default_value ?? "") === String(b.default_value ?? "") &&
    (a.default_checked ?? null) === (b.default_checked ?? null) &&
    String(a.notes ?? "") === String(b.notes ?? "") &&
    String(a.form_field_mapping_id ?? "") ===
      String(b.form_field_mapping_id ?? "")
  );
}

export function planFieldOperation(options: {
  fieldKey: string;
  devField: StructuralField;
  prodField: StructuralField | null;
  otherProdActiveMappingCount: number;
  txr1605Created: boolean;
}): {
  operation: FieldOp;
  diffs?: ReturnType<typeof structuralFieldDiffs>;
  blocker?: string;
} {
  const { prodField, otherProdActiveMappingCount } = options;
  if (!prodField) {
    return { operation: "INSERT" };
  }
  const diffs = structuralFieldDiffs(options.devField, prodField);
  if (Object.keys(diffs).length === 0) {
    return { operation: "REUSE" };
  }
  if (otherProdActiveMappingCount > 0) {
    return {
      operation: "CONFLICT",
      diffs,
      blocker: `Shared Global field ${options.fieldKey} differs and is used by ${otherProdActiveMappingCount} other ACTIVE mapping(s)`,
    };
  }
  return { operation: "UPDATE_METADATA", diffs };
}

export function planMappingOperation(options: {
  dev: MappingLike;
  prod: MappingLike | null;
}): { operation: MappingOp; blocker?: string } {
  if (!options.prod) return { operation: "INSERT" };
  if (mappingContentEqual(options.dev, options.prod)) {
    return { operation: "NO_CHANGE" };
  }
  return { operation: "UPDATE" };
}

export function planDefaultOperation(options: {
  dev: DefaultLike | null;
  prod: DefaultLike | null;
}): { operation: DefaultOp; blocker?: string } {
  if (options.dev && !options.prod) return { operation: "INSERT" };
  if (!options.dev && options.prod) return { operation: "SOFT_DELETE" };
  if (options.dev && options.prod) {
    if (defaultContentEqual(options.dev, options.prod)) {
      return { operation: "NO_CHANGE" };
    }
    return { operation: "UPDATE" };
  }
  return { operation: "NO_CHANGE" };
}

export function planStorageOperation(options: {
  source: { bytes: number; md5: string; sha256: string; path: string } | null;
  target: { bytes: number; md5: string; sha256: string; path: string } | null;
  targetFormPath: string;
}): {
  operation: StorageOp;
  targetPath: string;
  blocker?: string;
} {
  if (!options.source) {
    return {
      operation: "CONFLICT",
      targetPath: options.targetFormPath,
      blocker: "Source PDF missing",
    };
  }
  if (
    options.target &&
    options.target.md5 === options.source.md5 &&
    options.target.bytes === options.source.bytes &&
    options.target.sha256 === options.source.sha256
  ) {
    return {
      operation: "REUSE",
      targetPath: options.target.path || options.targetFormPath,
    };
  }
  if (!options.target) {
    return { operation: "COPY", targetPath: options.targetFormPath };
  }
  return { operation: "REPLACE", targetPath: options.targetFormPath };
}

export function looksLikeSignatureFieldKey(fieldKey: string): boolean {
  const k = fieldKey.toLowerCase();
  return (
    /(^|_)signatures?($|_)/.test(k) ||
    /(^|_)initials?($|_)/.test(k) ||
    /(^|_)receipt($|_)/.test(k)
  );
}

export function summarizeOps<T extends string>(
  ops: Array<{ operation: T }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of ops) {
    out[row.operation] = (out[row.operation] || 0) + 1;
  }
  return out;
}

export function parseSyncArgs(argv: string[]): {
  dryRun: boolean;
  apply: boolean;
  confirm: string | null;
  writeManifest: boolean;
} {
  const apply = argv.includes("--apply");
  const dryRun = !apply || argv.includes("--dry-run");
  let confirm: string | null = null;
  const idx = argv.indexOf("--confirm");
  if (idx >= 0 && argv[idx + 1]) confirm = argv[idx + 1];
  return {
    dryRun: dryRun || !apply,
    apply,
    confirm,
    writeManifest: true,
  };
}
