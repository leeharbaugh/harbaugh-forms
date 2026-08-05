/**
 * Production-only: set txr_2216_tenant_names source to custom_resolver / tenant_names.
 * Dry-run by default; pass --apply to write.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const FORM_ID = 51;
const FIELD_KEY = "txr_2216_tenant_names";
const FIELD_ID = "2b103fac-7501-437b-b42f-e6955a5a1b05";
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
  const apply = process.argv.includes("--apply");
  const url = process.env.TARGET_SUPABASE_URL!;
  const key =
    process.env.TARGET_SUPABASE_SECRET_KEY?.trim() ||
    process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("missing TARGET_SUPABASE_*");
  if (refOf(url) !== PROD_REF) {
    throw new Error(`ABORT: not production (${refOf(url)})`);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: form, error: formErr } = await sb
    .from("forms")
    .select(
      "id,form_code,status,publication_state,published_at,version_label",
    )
    .eq("id", FORM_ID)
    .single();
  if (formErr) throw formErr;
  if (
    form.form_code !== "TXR-2216" ||
    form.status !== "ACTIVE" ||
    form.publication_state !== "DRAFT" ||
    form.published_at != null
  ) {
    throw new Error(`ABORT: form guard failed ${JSON.stringify(form)}`);
  }

  const { data: field, error: fieldErr } = await sb
    .from("fields")
    .select(
      "id,field_key,field_label,source_type,source_path,resolver_key,default_value,default_checked,fallback_value,field_data_type,field_widget_type,status,scope",
    )
    .eq("id", FIELD_ID)
    .single();
  if (fieldErr) throw fieldErr;
  if (field.field_key !== FIELD_KEY) {
    throw new Error(`ABORT: field key mismatch ${field.field_key}`);
  }
  if (field.source_type !== "manual_only") {
    throw new Error(
      `ABORT: expected manual_only, got ${field.source_type}/${field.resolver_key}`,
    );
  }

  const { data: maps, error: mapErr } = await sb
    .from("form_field_mappings")
    .select("id,page_number,x,y,width,height,status")
    .eq("form_id", FORM_ID)
    .eq("field_id", FIELD_ID)
    .eq("status", "ACTIVE");
  if (mapErr) throw mapErr;
  if ((maps ?? []).length !== 1) {
    throw new Error(`ABORT: expected 1 mapping, got ${(maps ?? []).length}`);
  }
  const beforeMapping = maps![0];

  const report: Record<string, unknown> = {
    mode: apply ? "APPLY" : "DRY_RUN",
    inspectedAt: new Date().toISOString(),
    form,
    before: field,
    mappingBefore: beforeMapping,
  };

  if (!apply) {
    writeFileSync(
      "_audit_tmp/txr2216_tenant_names_source_apply.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    console.log("DRY_RUN_COMPLETE — re-run with --apply to update production");
    return;
  }

  const { data: updated, error: updErr } = await sb
    .from("fields")
    .update({
      source_type: "custom_resolver",
      source_path: null,
      resolver_key: "tenant_names",
      update_date: new Date().toISOString(),
    })
    .eq("id", FIELD_ID)
    .eq("field_key", FIELD_KEY)
    .eq("status", "ACTIVE")
    .select(
      "id,field_key,field_label,source_type,source_path,resolver_key,default_value,default_checked,fallback_value,field_data_type,field_widget_type,status",
    )
    .single();
  if (updErr) throw updErr;

  const { data: mapsAfter } = await sb
    .from("form_field_mappings")
    .select("id,page_number,x,y,width,height,status")
    .eq("id", beforeMapping.id)
    .single();

  const { data: formAfter } = await sb
    .from("forms")
    .select("id,status,publication_state,published_at")
    .eq("id", FORM_ID)
    .single();

  report.after = updated;
  report.mappingAfter = mapsAfter;
  report.formAfter = formAfter;
  report.checks = {
    keyUnchanged: updated.field_key === FIELD_KEY,
    labelUnchanged: updated.field_label === field.field_label,
    sourceUpdated:
      updated.source_type === "custom_resolver" &&
      updated.resolver_key === "tenant_names" &&
      updated.source_path == null,
    noDefaults:
      updated.default_value == null &&
      updated.default_checked == null &&
      updated.fallback_value == null,
    placementUnchanged:
      mapsAfter &&
      mapsAfter.x === beforeMapping.x &&
      mapsAfter.y === beforeMapping.y &&
      mapsAfter.width === beforeMapping.width &&
      mapsAfter.height === beforeMapping.height,
    formStillDraft:
      formAfter?.status === "ACTIVE" &&
      formAfter?.publication_state === "DRAFT" &&
      formAfter?.published_at == null,
  };

  writeFileSync(
    "_audit_tmp/txr2216_tenant_names_source_apply.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));

  const failed = Object.entries(report.checks as Record<string, boolean>).filter(
    ([, v]) => !v,
  );
  if (failed.length) {
    throw new Error(`post-apply checks failed: ${JSON.stringify(failed)}`);
  }
  console.log("APPLY_COMPLETE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
