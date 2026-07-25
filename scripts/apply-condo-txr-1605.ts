/**
 * Guarded development-only apply for TXR-1605 condominium contract catalog.
 *
 * Usage:
 *   npm run apply:condo-txr-1605 -- --dry-run
 *   npm run apply:condo-txr-1605 -- --execute
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEV_REF = "ewxsxwzezhkeawnjvigx";
const PROD_REF = "eetonalyyyssvkyfdoxh";
const MANIFEST_PATH = path.join("data", "condo-txr-1605", "manifest.json");

type Manifest = {
  form: {
    stableIdentity: {
      form_code: string;
      version_label: string;
      form_name: string;
      form_category: string;
      state_code: string;
    };
    description: string;
    scope: string;
    status: string;
    pdf: {
      localPath: string;
      storagePathTemplate: string;
      bytes: number;
      md5: string;
      sha256: string;
    };
  };
  newFields: Array<{
    field_key: string;
    field_name: string;
    field_label: string;
    field_data_type: string;
    field_widget_type: string;
    source_type: string;
    source_path: string | null;
    resolver_key: string | null;
    required?: boolean;
    notes?: string;
  }>;
  mappings: Array<{
    page_number: number;
    field_key: string;
    reuseOrNew: string;
    field_widget_type: string;
    mapping_name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    page_width?: number;
    page_height?: number;
    occurrence_index?: number;
    required?: boolean;
    notes?: string;
  }>;
  expectedCounts: Record<string, number>;
  deviations?: string[];
};

function assertDevUrl(url: string) {
  const host = new URL(url).hostname;
  console.log("RESOLVED_SUPABASE_URL=", url);
  console.log("RESOLVED_HOST=", host);
  if (!host.startsWith(`${DEV_REF}.`)) {
    throw new Error(`ABORT: expected project ref ${DEV_REF}, got ${host}`);
  }
  if (host.includes(PROD_REF)) {
    throw new Error("ABORT: production project ref detected");
  }
}

function loadManifest(): Manifest {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw) as Manifest;
}

function checksumFile(filePath: string) {
  const buf = fs.readFileSync(filePath);
  return {
    bytes: buf.length,
    md5: crypto.createHash("md5").update(buf).digest("hex"),
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    buf,
  };
}

async function findExistingForm(sb: SupabaseClient, manifest: Manifest) {
  const code = manifest.form.stableIdentity.form_code;
  const version = manifest.form.stableIdentity.version_label;
  const { data, error } = await sb
    .from("forms")
    .select("id, form_code, version_label, status, scope, source_storage_path")
    .eq("status", "ACTIVE")
    .ilike("form_code", code);
  if (error) throw error;
  const matches = (data ?? []).filter(
    (f) =>
      f.form_code?.toLowerCase() === code.toLowerCase() &&
      (f.version_label || "") === version,
  );
  return matches;
}

async function ensureNewFields(
  sb: SupabaseClient,
  manifest: Manifest,
  dryRun: boolean,
) {
  const created: Array<{ field_key: string; id: string; action: string }> = [];
  for (const field of manifest.newFields) {
    const { data: existing, error } = await sb
      .from("fields")
      .select("id, field_key, status, scope, source_type, source_path, resolver_key")
      .eq("field_key", field.field_key)
      .eq("scope", "GLOBAL")
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) throw error;
    if (existing) {
      // Conflict if source metadata differs materially
      if (
        (existing.source_type || "manual_only") !== field.source_type ||
        (existing.source_path || null) !== (field.source_path || null) ||
        (existing.resolver_key || null) !== (field.resolver_key || null)
      ) {
        throw new Error(
          `Conflict: ACTIVE Global field ${field.field_key} exists with different source metadata`,
        );
      }
      created.push({ field_key: field.field_key, id: existing.id, action: "reuse_existing" });
      continue;
    }
    if (dryRun) {
      created.push({ field_key: field.field_key, id: "(dry-run)", action: "would_insert" });
      continue;
    }
    const { data: inserted, error: insErr } = await sb
      .from("fields")
      .insert({
        field_key: field.field_key,
        field_name: field.field_name,
        field_label: field.field_label,
        field_data_type: field.field_data_type,
        field_widget_type: field.field_widget_type,
        source_type: field.source_type,
        source_path: field.source_path,
        resolver_key: field.resolver_key,
        required: field.required ?? false,
        notes: field.notes ?? null,
        default_value: null,
        default_checked: null,
        fallback_value: null,
        scope: "GLOBAL",
        owner_user_id: null,
        organization_id: null,
        status: "ACTIVE",
      })
      .select("id, field_key")
      .single();
    if (insErr) throw insErr;
    created.push({ field_key: field.field_key, id: inserted.id, action: "inserted" });
  }
  return created;
}

async function resolveFieldIdMap(
  sb: SupabaseClient,
  fieldKeys: string[],
) {
  const unique = [...new Set(fieldKeys)];
  const { data, error } = await sb
    .from("fields")
    .select("id, field_key, status, scope")
    .in("field_key", unique)
    .eq("status", "ACTIVE")
    .eq("scope", "GLOBAL");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (map.has(row.field_key)) {
      throw new Error(`Duplicate ACTIVE Global field_key: ${row.field_key}`);
    }
    map.set(row.field_key, row.id);
  }
  const missing = unique.filter((k) => !map.has(k));
  if (missing.length) {
    throw new Error(`Missing ACTIVE Global fields: ${missing.join(", ")}`);
  }
  return map;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || !args.includes("--execute");
  if (!args.includes("--dry-run") && !args.includes("--execute")) {
    console.log("No mode flag provided; defaulting to --dry-run");
  }
  if (args.includes("--execute") && args.includes("--dry-run")) {
    throw new Error("Pass only one of --dry-run or --execute");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or secret key");
  assertDevUrl(url);

  const manifest = loadManifest();
  const pdfPath = manifest.form.pdf.localPath;
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Missing PDF at ${pdfPath}`);
  }
  const local = checksumFile(pdfPath);
  if (local.bytes !== manifest.form.pdf.bytes) {
    throw new Error(
      `PDF byte mismatch: local ${local.bytes} vs manifest ${manifest.form.pdf.bytes}`,
    );
  }
  if (local.md5 !== manifest.form.pdf.md5 || local.sha256 !== manifest.form.pdf.sha256) {
    throw new Error("PDF checksum mismatch vs manifest");
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const existing = await findExistingForm(sb, manifest);
  if (existing.length > 1) {
    throw new Error(
      `ABORT: multiple ACTIVE forms match ${manifest.form.stableIdentity.form_code} / ${manifest.form.stableIdentity.version_label}`,
    );
  }
  if (existing.length === 1) {
    throw new Error(
      `ABORT: ACTIVE form already exists id=${existing[0].id} path=${existing[0].source_storage_path}. Idempotent re-apply of full catalog not supported; aborting to avoid duplicate.`,
    );
  }

  console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "execute", mappings: manifest.mappings.length, newFields: manifest.newFields.length, expected: manifest.expectedCounts }, null, 2));

  const fieldActions = await ensureNewFields(sb, manifest, dryRun);
  console.log("field_actions", fieldActions);

  if (dryRun) {
    // new fields won't exist yet — only verify reuse keys
    const reuseKeys = manifest.mappings
      .filter((m) => /^reuse/i.test(m.reuseOrNew))
      .map((m) => m.field_key);
    await resolveFieldIdMap(sb, reuseKeys);
    console.log("DRY_RUN_OK: would create form + upload PDF + insert", manifest.mappings.length, "mappings");
    console.log("deviations", manifest.deviations);
    return;
  }

  // Insert form first (path placeholder), then upload, then update path
  const identity = manifest.form.stableIdentity;
  const { data: formRow, error: formErr } = await sb
    .from("forms")
    .insert({
      form_code: identity.form_code,
      form_name: identity.form_name,
      form_category: identity.form_category,
      state_code: identity.state_code,
      version_label: identity.version_label,
      description: manifest.form.description,
      source_storage_path: "pending/condo-txr-1605",
      scope: "GLOBAL",
      owner_user_id: null,
      organization_id: null,
      status: "ACTIVE",
    })
    .select("id")
    .single();
  if (formErr) throw formErr;
  const formId = formRow.id as number;
  const storagePath = manifest.form.pdf.storagePathTemplate.replace(
    "{formId}",
    String(formId),
  );

  const { error: upErr } = await sb.storage
    .from("form-templates")
    .upload(storagePath, local.buf, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upErr) {
    await sb.from("forms").update({ status: "DELETED" }).eq("id", formId);
    throw upErr;
  }

  // Verify remote size via download checksum
  const { data: remoteBlob, error: dlErr } = await sb.storage
    .from("form-templates")
    .download(storagePath);
  if (dlErr) throw dlErr;
  const remoteBuf = Buffer.from(await remoteBlob.arrayBuffer());
  const remoteMd5 = crypto.createHash("md5").update(remoteBuf).digest("hex");
  if (remoteBuf.length !== local.bytes || remoteMd5 !== local.md5) {
    throw new Error("Remote PDF checksum/size mismatch after upload");
  }

  const { error: pathErr } = await sb
    .from("forms")
    .update({ source_storage_path: storagePath })
    .eq("id", formId);
  if (pathErr) throw pathErr;

  const allKeys = manifest.mappings.map((m) => m.field_key);
  const idMap = await resolveFieldIdMap(sb, allKeys);

  const mappingRows = manifest.mappings.map((m) => ({
    form_id: formId,
    field_id: idMap.get(m.field_key)!,
    mapping_name: m.mapping_name,
    occurrence_index: m.occurrence_index ?? 0,
    page_number: m.page_number,
    x: m.x,
    y: m.y,
    width: m.width,
    height: m.height,
    page_width: m.page_width ?? 612,
    page_height: m.page_height ?? 792,
    field_widget_type: m.field_widget_type,
    required: m.required ?? false,
    notes: m.notes ?? null,
    status: "ACTIVE",
    default_value_override: null,
  }));

  // Insert in chunks
  const chunkSize = 50;
  for (let i = 0; i < mappingRows.length; i += chunkSize) {
    const chunk = mappingRows.slice(i, i + chunkSize);
    const { error: mapErr } = await sb.from("form_field_mappings").insert(chunk);
    if (mapErr) throw mapErr;
  }

  // Validate counts
  const { count: mapCount, error: cErr } = await sb
    .from("form_field_mappings")
    .select("id", { count: "exact", head: true })
    .eq("form_id", formId)
    .eq("status", "ACTIVE");
  if (cErr) throw cErr;

  const report = {
    ok: true,
    formId,
    storagePath,
    md5: local.md5,
    bytes: local.bytes,
    mappingCount: mapCount,
    expectedMappings: manifest.expectedCounts.mappings,
    fieldActions,
  };
  console.log(JSON.stringify(report, null, 2));
  if (mapCount !== manifest.expectedCounts.mappings) {
    throw new Error(
      `Mapping count mismatch: got ${mapCount}, expected ${manifest.expectedCounts.mappings}`,
    );
  }

  fs.mkdirSync("_audit_tmp", { recursive: true });
  fs.writeFileSync(
    "_audit_tmp/condo_txr_1605_apply_report.json",
    JSON.stringify({ ...report, newFieldIds: fieldActions }, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
