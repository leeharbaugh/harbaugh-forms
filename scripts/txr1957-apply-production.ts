/**
 * Production-safe apply for TXR-1957 / T-47.1 (production Global form id 53,
 * ACTIVE + DRAFT, 0 AcroForm fields, 0 mappings).
 *
 * Dry-run (default) writes no database rows.
 *
 * Usage:
 *   node --experimental-strip-types scripts/txr1957-apply-production.ts
 *   node --experimental-strip-types --env-file=.env.local --env-file=.env.ops.production scripts/txr1957-apply-production.ts --apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  LEE_USER_ID,
  TXR_1957_DEFAULTS,
  TXR_1957_EXPECTED_COUNTS,
  TXR_1957_FORM_CODE,
  TXR_1957_FORM_FAMILY_KEY,
  TXR_1957_FORM_ID,
  TXR_1957_FORM_NAME,
  TXR_1957_NEW_FIELDS,
  TXR_1957_PAGE_HEIGHT,
  TXR_1957_PAGE_WIDTH,
  TXR_1957_PDF_MD5,
  TXR_1957_PLACEMENTS,
  TXR_1957_REUSE_FIELDS,
  TXR_1957_STORAGE_PATH,
  TXR_1957_VERSION_LABEL,
  fieldByKey,
} from "../lib/txr-1957-inventory.ts";

const DEV_REF = "ewxsxwzezhkeawnjvigx";
const PROD_REF = "eetonalyyyssvkyfdoxh";
const FIELD_NOTE = "TXR-1957 / T-47.1 initial Draft catalog field";
const MAPPING_NOTE = "TXR-1957 / T-47.1 initial Draft placement (underline-derived; awaiting Lee visual review)";

function refOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

type Fingerprint = {
  packets: number;
  packet_forms: number;
  field_instances: number;
  field_instance_fingerprint: string;
  field_defaults_active: number;
  active_mappings_other_forms: number;
  active_mappings_form_53: number;
  active_fields: number;
};

async function count(
  sb: SupabaseClient,
  table: string,
  filter?: (q: ReturnType<SupabaseClient["from"]>) => ReturnType<SupabaseClient["from"]>,
): Promise<number> {
  let q = sb.from(table).select("id", { count: "exact", head: true });
  if (filter) q = filter(q as never) as never;
  const { count: c, error } = await q;
  if (error) throw error;
  return c ?? 0;
}

async function captureFingerprint(sb: SupabaseClient): Promise<Fingerprint> {
  const { data: instances, error } = await sb
    .from("field_instances")
    .select("id, packet_form_id, field_id, status, update_date")
    .order("id");
  if (error) throw error;
  const fiFp = createHash("sha256").update(JSON.stringify(instances ?? [])).digest("hex");
  return {
    packets: await count(sb, "packets"),
    packet_forms: await count(sb, "packet_forms"),
    field_instances: (instances ?? []).length,
    field_instance_fingerprint: fiFp,
    field_defaults_active: await count(sb, "field_defaults", (q) =>
      q.eq("status", "ACTIVE") as never,
    ),
    active_mappings_other_forms: await count(sb, "form_field_mappings", (q) =>
      q.eq("status", "ACTIVE").neq("form_id", TXR_1957_FORM_ID) as never,
    ),
    active_mappings_form_53: await count(sb, "form_field_mappings", (q) =>
      q.eq("status", "ACTIVE").eq("form_id", TXR_1957_FORM_ID) as never,
    ),
    active_fields: await count(sb, "fields", (q) => q.eq("status", "ACTIVE") as never),
  };
}

async function runProductionGuards(sb: SupabaseClient) {
  const { data: form, error: formErr } = await sb
    .from("forms")
    .select(
      "id, form_code, form_name, version_label, form_family_key, status, publication_state, published_at, source_storage_path, scope",
    )
    .eq("id", TXR_1957_FORM_ID)
    .maybeSingle();
  if (formErr) throw formErr;
  if (
    !form ||
    form.status !== "ACTIVE" ||
    form.publication_state !== "DRAFT" ||
    form.published_at != null ||
    form.scope !== "GLOBAL" ||
    form.form_code !== TXR_1957_FORM_CODE ||
    form.version_label !== TXR_1957_VERSION_LABEL ||
    form.form_family_key !== TXR_1957_FORM_FAMILY_KEY ||
    form.form_name !== TXR_1957_FORM_NAME ||
    form.source_storage_path !== TXR_1957_STORAGE_PATH
  ) {
    throw new Error(`ABORT: form 53 identity/state guard failed: ${JSON.stringify(form)}`);
  }

  const { count: mapCount, error: mapErr } = await sb
    .from("form_field_mappings")
    .select("id", { count: "exact", head: true })
    .eq("form_id", TXR_1957_FORM_ID)
    .eq("status", "ACTIVE");
  if (mapErr) throw mapErr;
  if ((mapCount ?? 0) !== 0) {
    throw new Error(`ABORT: form 53 already has ${mapCount} ACTIVE mappings`);
  }

  const { data: blob, error: dlErr } = await sb.storage
    .from("form-templates")
    .download(TXR_1957_STORAGE_PATH);
  if (dlErr || !blob) throw new Error(`ABORT: could not download form PDF: ${dlErr?.message}`);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const md5 = createHash("md5").update(bytes).digest("hex");
  if (md5 !== TXR_1957_PDF_MD5) {
    throw new Error(`ABORT: PDF md5 mismatch — expected ${TXR_1957_PDF_MD5}, got ${md5}`);
  }

  const { data: collisions, error: colErr } = await sb
    .from("fields")
    .select("id, field_key, status")
    .ilike("field_key", "txr_1957%")
    .eq("status", "ACTIVE");
  if (colErr) throw colErr;
  if ((collisions ?? []).length > 0) {
    throw new Error(`ABORT: ACTIVE txr_1957% fields already exist: ${JSON.stringify(collisions)}`);
  }

  for (const [key, id] of Object.entries(TXR_1957_REUSE_FIELDS)) {
    const { data: reuseField, error: reuseErr } = await sb
      .from("fields")
      .select("id, field_key, status, scope, source_type, source_path")
      .eq("field_key", key)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (reuseErr) throw reuseErr;
    if (!reuseField || reuseField.scope !== "GLOBAL") {
      throw new Error(`ABORT: reuse field ${key} not ACTIVE GLOBAL: ${JSON.stringify(reuseField)}`);
    }
    if (reuseField.id !== id) {
      throw new Error(`ABORT: reuse field ${key} id mismatch — expected ${id}, got ${reuseField.id}`);
    }
  }

  return { form, pdfMd5: md5, pdfBytes: bytes.length };
}

async function softRollback(
  sb: SupabaseClient,
  createdFieldIds: string[],
  createdMappingIds: string[],
  createdDefaultIds: string[],
  reason: string,
) {
  console.error("\n=== ROLLBACK TRIGGERED ===");
  console.error("reason:", reason);
  const now = new Date().toISOString();
  if (createdDefaultIds.length > 0) {
    const { error } = await sb
      .from("field_defaults")
      .update({ status: "DELETED", update_date: now })
      .in("id", createdDefaultIds);
    if (error) console.error("ROLLBACK: failed to soft-delete defaults:", error);
    else console.error(`ROLLBACK: soft-deleted ${createdDefaultIds.length} defaults`);
  }
  if (createdMappingIds.length > 0) {
    const { error } = await sb
      .from("form_field_mappings")
      .update({ status: "DELETED", update_date: now })
      .in("id", createdMappingIds);
    if (error) console.error("ROLLBACK: failed to soft-delete mappings:", error);
    else console.error(`ROLLBACK: soft-deleted ${createdMappingIds.length} mappings`);
  }
  if (createdFieldIds.length > 0) {
    const { error } = await sb
      .from("fields")
      .update({ status: "DELETED", update_date: now })
      .in("id", createdFieldIds);
    if (error) console.error("ROLLBACK: failed to soft-delete fields:", error);
    else console.error(`ROLLBACK: soft-deleted ${createdFieldIds.length} fields`);
  }
  console.error("=== ROLLBACK COMPLETE ===\n");
}

function buildFieldRows() {
  return TXR_1957_NEW_FIELDS.map((f) => ({
    field_key: f.field_key,
    field_name: f.field_key,
    field_label: f.field_label,
    field_data_type: f.field_data_type,
    field_widget_type: f.field_widget_type,
    default_value: null,
    default_checked: null,
    required: false,
    notes: FIELD_NOTE,
    source_type: f.source_type,
    source_path: f.source_path,
    resolver_key: f.resolver_key,
    fallback_value: null,
    scope: "GLOBAL",
    owner_user_id: null,
    organization_id: null,
    status: "ACTIVE",
  }));
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`MODE=${apply ? "APPLY" : "DRY_RUN"}`);

  if (TXR_1957_PLACEMENTS.length !== TXR_1957_EXPECTED_COUNTS.placements) {
    throw new Error("ABORT: placement count mismatch");
  }
  if (TXR_1957_NEW_FIELDS.length !== TXR_1957_EXPECTED_COUNTS.newFields) {
    throw new Error("ABORT: new field count mismatch");
  }

  mkdirSync("_audit_tmp", { recursive: true });
  writeFileSync(
    "_audit_tmp/txr1957_apply_manifest.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        form: {
          id: TXR_1957_FORM_ID,
          form_code: TXR_1957_FORM_CODE,
          version_label: TXR_1957_VERSION_LABEL,
          source_storage_path: TXR_1957_STORAGE_PATH,
        },
        newFields: TXR_1957_NEW_FIELDS,
        placements: TXR_1957_PLACEMENTS,
        defaults: TXR_1957_DEFAULTS,
        counts: TXR_1957_EXPECTED_COUNTS,
      },
      null,
      2,
    ),
  );
  console.log("WROTE_MANIFEST=_audit_tmp/txr1957_apply_manifest.json");
  console.log(JSON.stringify(TXR_1957_EXPECTED_COUNTS, null, 2));

  if (!apply) {
    console.log("\nDRY_RUN_COMPLETE — no database connection opened. Re-run with --apply to write to production.");
    return;
  }

  const targetUrl = requireEnv("TARGET_SUPABASE_URL");
  const targetKey =
    process.env.TARGET_SUPABASE_SECRET_KEY?.trim() ||
    process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!targetKey) {
    throw new Error("ABORT: missing TARGET_SUPABASE_SECRET_KEY / TARGET_SUPABASE_SERVICE_ROLE_KEY");
  }
  const targetRef = refOf(targetUrl);
  console.log("TARGET_PROJECT_REF=", targetRef);
  if (targetRef !== PROD_REF) {
    throw new Error(`ABORT: TARGET_SUPABASE_URL must resolve to production (${PROD_REF}), got ${targetRef}`);
  }
  const devRef = refOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("NEXT_PUBLIC_PROJECT_REF=", devRef);
  if (devRef !== DEV_REF) {
    throw new Error(`ABORT: NEXT_PUBLIC_SUPABASE_URL must resolve to development (${DEV_REF}), got ${devRef}`);
  }

  const sb = createClient(targetUrl, targetKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const createdFieldIds: string[] = [];
  const createdMappingIds: string[] = [];
  const createdDefaultIds: string[] = [];

  try {
    const guardInfo = await runProductionGuards(sb);
    console.log("GUARDS_OK=", { form: guardInfo.form.id, pdfMd5: guardInfo.pdfMd5 });

    const before = await captureFingerprint(sb);
    console.log("FINGERPRINT_BEFORE=", before);
    if (before.active_mappings_form_53 !== 0) {
      throw new Error("ABORT: form 53 already has ACTIVE mappings");
    }

    const { data: insertedFields, error: insFieldErr } = await sb
      .from("fields")
      .insert(buildFieldRows())
      .select("id, field_key");
    if (insFieldErr) throw insFieldErr;
    createdFieldIds.push(...insertedFields.map((f: { id: string }) => f.id));
    console.log(`INSERTED_FIELDS=${insertedFields.length}`);

    const fieldIdByKey = new Map<string, string>();
    for (const f of insertedFields as Array<{ id: string; field_key: string }>) {
      fieldIdByKey.set(f.field_key, f.id);
    }
    for (const [key, id] of Object.entries(TXR_1957_REUSE_FIELDS)) {
      fieldIdByKey.set(key, id);
    }

    const mappingRows = TXR_1957_PLACEMENTS.map((p) => {
      const fieldId = fieldIdByKey.get(p.field_key);
      if (!fieldId) throw new Error(`ABORT: no resolved field id for ${p.field_key}`);
      const field = fieldByKey(p.field_key);
      return {
        form_id: TXR_1957_FORM_ID,
        field_id: fieldId,
        mapping_name: p.mapping_name,
        occurrence_index: null,
        page_number: p.page_number,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        page_width: TXR_1957_PAGE_WIDTH,
        page_height: TXR_1957_PAGE_HEIGHT,
        font_size: p.font_size,
        alignment: null,
        field_widget_type: field.field_widget_type,
        is_multiline: p.is_multiline,
        mask_background: p.mask_background,
        default_value_override: null,
        required: false,
        notes: MAPPING_NOTE,
        pdf_field_name: null,
        pdf_field_type: null,
        pdf_export_value: null,
        status: "ACTIVE",
      };
    });

    const { data: insertedMappings, error: mapErr } = await sb
      .from("form_field_mappings")
      .insert(mappingRows)
      .select("id");
    if (mapErr) throw mapErr;
    createdMappingIds.push(...insertedMappings.map((m: { id: string }) => m.id));
    console.log(`INSERTED_MAPPINGS=${createdMappingIds.length}`);

    const defaultRows = TXR_1957_DEFAULTS.map((d) => {
      const fieldId = fieldIdByKey.get(d.field_key);
      if (!fieldId) throw new Error(`ABORT: no field id for default ${d.field_key}`);
      return {
        field_id: fieldId,
        form_id: TXR_1957_FORM_ID,
        form_field_mapping_id: null,
        scope: "PRIVATE",
        owner_user_id: LEE_USER_ID,
        organization_id: null,
        default_value: d.default_value,
        default_checked: null,
        created_by_user_id: LEE_USER_ID,
        updated_by_user_id: LEE_USER_ID,
        notes: d.notes,
        status: "ACTIVE",
      };
    });
    const { data: insertedDefaults, error: defErr } = await sb
      .from("field_defaults")
      .insert(defaultRows)
      .select("id");
    if (defErr) throw defErr;
    createdDefaultIds.push(...insertedDefaults.map((d: { id: string }) => d.id));
    console.log(`INSERTED_DEFAULTS=${createdDefaultIds.length}`);

    const { count: form53ActiveMappings, error: verifyErr } = await sb
      .from("form_field_mappings")
      .select("id", { count: "exact", head: true })
      .eq("form_id", TXR_1957_FORM_ID)
      .eq("status", "ACTIVE");
    if (verifyErr) throw verifyErr;
    if (form53ActiveMappings !== TXR_1957_EXPECTED_COUNTS.placements) {
      throw new Error(
        `ABORT: post-insert form 53 ACTIVE mapping count = ${form53ActiveMappings}, expected ${TXR_1957_EXPECTED_COUNTS.placements}`,
      );
    }

    const after = await captureFingerprint(sb);
    console.log("FINGERPRINT_AFTER=", after);

    const isolationOk =
      after.packets === before.packets &&
      after.packet_forms === before.packet_forms &&
      after.field_instances === before.field_instances &&
      after.field_instance_fingerprint === before.field_instance_fingerprint &&
      after.field_defaults_active === before.field_defaults_active + TXR_1957_EXPECTED_COUNTS.defaults &&
      after.active_mappings_other_forms === before.active_mappings_other_forms &&
      after.active_mappings_form_53 === TXR_1957_EXPECTED_COUNTS.placements &&
      after.active_fields === before.active_fields + TXR_1957_EXPECTED_COUNTS.newFields;

    if (!isolationOk) {
      throw new Error(
        `ABORT: post-apply isolation check failed. before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
      );
    }

    const result = {
      appliedAt: new Date().toISOString(),
      formId: TXR_1957_FORM_ID,
      insertedFields: insertedFields.map((f: { id: string; field_key: string }) => ({
        id: f.id,
        field_key: f.field_key,
      })),
      insertedMappingIds: createdMappingIds,
      insertedDefaultIds: createdDefaultIds,
      before,
      after,
      isolationOk,
    };
    writeFileSync("_audit_tmp/txr1957_apply_result.json", JSON.stringify(result, null, 2));
    console.log("APPLY_COMPLETE isolationOk=true");
  } catch (err) {
    await softRollback(sb, createdFieldIds, createdMappingIds, createdDefaultIds, String(err));
    throw err;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
