/**
 * Read-only post-apply verification for TXR-1957 on production.
 */
import { createClient } from "@supabase/supabase-js";
import {
  LEE_USER_ID,
  TXR_1957_EXPECTED_COUNTS,
  TXR_1957_FORM_ID,
  TXR_1957_NEW_FIELDS,
  TXR_1957_PLACEMENTS,
  TXR_1957_REUSE_FIELDS,
} from "../lib/txr-1957-inventory.ts";

const PROD_REF = "eetonalyyyssvkyfdoxh";

function refOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const url = process.env.TARGET_SUPABASE_URL!;
  const key = process.env.TARGET_SUPABASE_SECRET_KEY!;
  if (refOf(url) !== PROD_REF) throw new Error("ABORT: not production");
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: fields, error: fErr } = await sb
    .from("fields")
    .select("id, field_key, field_label, field_data_type, field_widget_type, source_type, source_path, resolver_key, status, scope")
    .in("field_key", TXR_1957_NEW_FIELDS.map((f) => f.field_key))
    .eq("status", "ACTIVE");
  if (fErr) throw fErr;

  const { data: mappings, error: mErr } = await sb
    .from("form_field_mappings")
    .select("id, form_id, field_id, mapping_name, page_number, x, y, width, height, is_multiline, mask_background, field_widget_type, status, fields(field_key, source_type, source_path, resolver_key)")
    .eq("form_id", TXR_1957_FORM_ID)
    .eq("status", "ACTIVE");
  if (mErr) throw mErr;

  const { data: defaults, error: dErr } = await sb
    .from("field_defaults")
    .select("id, field_id, form_id, scope, owner_user_id, organization_id, default_value, status")
    .eq("form_id", TXR_1957_FORM_ID)
    .eq("status", "ACTIVE");
  if (dErr) throw dErr;

  const { count: form52Maps } = await sb
    .from("form_field_mappings")
    .select("id", { count: "exact", head: true })
    .eq("form_id", 52)
    .eq("status", "ACTIVE");

  const errors: string[] = [];
  if ((fields ?? []).length !== TXR_1957_EXPECTED_COUNTS.newFields) {
    errors.push(`new fields ${fields?.length} != ${TXR_1957_EXPECTED_COUNTS.newFields}`);
  }
  if ((mappings ?? []).length !== TXR_1957_EXPECTED_COUNTS.placements) {
    errors.push(`mappings ${mappings?.length} != ${TXR_1957_EXPECTED_COUNTS.placements}`);
  }
  if ((defaults ?? []).length !== TXR_1957_EXPECTED_COUNTS.defaults) {
    errors.push(`defaults ${defaults?.length} != ${TXR_1957_EXPECTED_COUNTS.defaults}`);
  }
  if ((form52Maps ?? 0) !== 0) errors.push("DELETED form 52 unexpectedly has ACTIVE mappings");

  for (const f of fields ?? []) {
    const spec = TXR_1957_NEW_FIELDS.find((s) => s.field_key === f.field_key);
    if (!spec) {
      errors.push(`unexpected field ${f.field_key}`);
      continue;
    }
    if (f.scope !== "GLOBAL") errors.push(`${f.field_key} scope ${f.scope}`);
    if (f.source_type !== spec.source_type) errors.push(`${f.field_key} source ${f.source_type}`);
    if ((f.source_path ?? null) !== spec.source_path) errors.push(`${f.field_key} path ${f.source_path}`);
    if ((f.resolver_key ?? null) !== spec.resolver_key) errors.push(`${f.field_key} resolver ${f.resolver_key}`);
    if (/signature|initial/i.test(f.field_key)) errors.push(`signature-like ${f.field_key}`);
  }

  for (const m of mappings ?? []) {
    const key = (m.fields as { field_key?: string } | null)?.field_key;
    const spec = TXR_1957_PLACEMENTS.find((p) => p.field_key === key);
    if (!spec) {
      errors.push(`unexpected mapping ${key}`);
      continue;
    }
    if (m.page_number !== spec.page_number) errors.push(`${key} page ${m.page_number}`);
    if (Number(m.x) !== spec.x || Number(m.y) !== spec.y) errors.push(`${key} xy mismatch`);
    if (Boolean(m.is_multiline) !== spec.is_multiline) errors.push(`${key} multiline mismatch`);
    if (Boolean(m.mask_background) !== spec.mask_background) errors.push(`${key} mask mismatch`);
  }

  for (const d of defaults ?? []) {
    if (d.scope !== "PRIVATE" || d.owner_user_id !== LEE_USER_ID || d.organization_id != null) {
      errors.push(`default ${d.id} not Lee Personal form-scoped`);
    }
    if (d.form_id !== TXR_1957_FORM_ID) errors.push(`default ${d.id} wrong form`);
  }
  const defaultValues = (defaults ?? []).map((d) => d.default_value).sort();
  if (JSON.stringify(defaultValues) !== JSON.stringify(["None", "Texas", "Texas"].sort())) {
    errors.push(`default values ${JSON.stringify(defaultValues)}`);
  }

  const reusePresent = Object.values(TXR_1957_REUSE_FIELDS).every((id) =>
    (mappings ?? []).some((m) => m.field_id === id),
  );
  if (!reusePresent) errors.push("missing reused Global field mapping");

  console.log(JSON.stringify({
    newFields: fields?.length,
    mappings: mappings?.length,
    defaults: defaults?.length,
    form52ActiveMappings: form52Maps,
    errors,
    ok: errors.length === 0,
  }, null, 2));
  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
