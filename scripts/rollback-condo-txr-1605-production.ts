/**
 * Rollback helper for TXR-1605 production sync.
 * Restores prior form row metadata and soft-deletes sync-inserted
 * mappings/defaults/fields using CONDO_TXR_1605_PRODUCTION_ROLLBACK.json
 * plus the apply audit. Does NOT touch field_instances.
 *
 * Usage:
 *   npm run rollback:condo-txr-1605-prod -- --dry-run
 *   npm run rollback:condo-txr-1605-prod -- --apply --confirm ROLLBACK_PROD_TXR_1605
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  DEV_REF,
  PROD_REF,
} from "../lib/condo-txr-1605-production-sync.ts";
import {
  assertDistinctProjects,
  assertProductionTargetRef,
  extractProjectRef,
} from "../lib/selective-production/safety.ts";

const CONFIRM = "ROLLBACK_PROD_TXR_1605";
const ROLLBACK_PATH = "CONDO_TXR_1605_PRODUCTION_ROLLBACK.json";
const AUDIT_PATH = "_audit_tmp/condo_txr_1605_sync_run.json";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (
      process.env[m[1]] === undefined ||
      /^(TARGET_|SOURCE_)/.test(m[1])
    ) {
      process.env[m[1]] = val;
    }
  }
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env.ops.production");
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const dryRun = !apply || argv.includes("--dry-run");
  const confirmIdx = argv.indexOf("--confirm");
  const confirm = confirmIdx >= 0 ? argv[confirmIdx + 1] : null;

  const targetUrl = process.env.TARGET_SUPABASE_URL!;
  const targetKey = process.env.TARGET_SUPABASE_SECRET_KEY!;
  const sourceUrl =
    process.env.SOURCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const { sourceRef, targetRef } = assertDistinctProjects({
    sourceUrl,
    targetUrl,
    allowDevAsSource: true,
  });
  assertProductionTargetRef(targetRef);
  if (targetRef !== PROD_REF || sourceRef === PROD_REF) {
    throw new Error("ABORT: environment mismatch");
  }
  if (extractProjectRef(targetUrl) === DEV_REF) {
    throw new Error("ABORT: refusing development target");
  }

  const rollback = JSON.parse(fs.readFileSync(ROLLBACK_PATH, "utf8"));
  const audit = fs.existsSync(AUDIT_PATH)
    ? JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"))
    : null;
  const formId = rollback.productionFormId;
  const insertedFields: string[] =
    audit?.applyResult?.insertedFields?.map(
      (f: { id: string }) => f.id,
    ) ??
    rollback.syncInserted?.fields?.map((f: { id: string }) => f.id) ??
    [];
  const insertedMappings: string[] =
    audit?.applyResult?.insertedMappings ??
    rollback.syncInserted?.mappings?.map((m: { id: string }) => m.id) ??
    [];
  const insertedDefaults: string[] =
    audit?.applyResult?.insertedDefaults ??
    rollback.syncInserted?.defaults?.map((d: { id: string }) => d.id) ??
    [];

  console.log({
    mode: apply && !dryRun ? "APPLY" : "DRY_RUN",
    formId,
    restoreFormName: rollback.priorFormRow.form_name,
    softDeleteMappings: insertedMappings.length,
    softDeleteDefaults: insertedDefaults.length,
    softDeleteFields: insertedFields.length,
  });

  if (!(apply && !dryRun)) {
    console.log("DRY_RUN_COMPLETE — no writes");
    return;
  }
  if (confirm !== CONFIRM) {
    throw new Error(`ABORT: require --confirm ${CONFIRM}`);
  }

  const target = createClient(targetUrl, targetKey, {
    auth: { persistSession: false },
  });
  const now = new Date().toISOString();

  const { error: formErr } = await target
    .from("forms")
    .update({
      form_name: rollback.priorFormRow.form_name,
      source_storage_path: rollback.priorFormRow.source_storage_path,
      update_date: now,
    })
    .eq("id", formId);
  if (formErr) throw formErr;

  for (const id of insertedMappings) {
    const { error } = await target
      .from("form_field_mappings")
      .update({ status: "DELETED", update_date: now })
      .eq("id", id)
      .eq("form_id", formId);
    if (error) throw error;
  }
  for (const id of insertedDefaults) {
    const { error } = await target
      .from("field_defaults")
      .update({ status: "DELETED", update_date: now })
      .eq("id", id)
      .eq("form_id", formId);
    if (error) throw error;
  }
  for (const id of insertedFields) {
    const { count, error: cErr } = await target
      .from("form_field_mappings")
      .select("id", { count: "exact", head: true })
      .eq("field_id", id)
      .eq("status", "ACTIVE");
    if (cErr) throw cErr;
    if ((count ?? 0) > 0) {
      console.warn("SKIP field still mapped", id);
      continue;
    }
    const { error } = await target
      .from("fields")
      .update({ status: "DELETED", update_date: now })
      .eq("id", id)
      .eq("scope", "GLOBAL");
    if (error) throw error;
  }

  console.log("ROLLBACK_COMPLETE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
