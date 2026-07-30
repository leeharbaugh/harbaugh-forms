/**
 * Guarded sync: current development TXR-1605 catalog → existing production form.
 *
 * Usage:
 *   npm run sync:condo-txr-1605-prod -- --dry-run
 *   npm run sync:condo-txr-1605-prod -- --apply --confirm EXISTING_PROD_TXR_1605
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CONFIRM_TOKEN,
  DGR_ORGANIZATION_ID,
  DGR_ORGANIZATION_NAME,
  DEV_REF,
  FORM_CODE,
  LEE_AUTH_EMAIL,
  LEE_AUTH_UUID,
  PROD_REF,
  VERSION_LABEL,
  defaultNaturalKey,
  looksLikeSignatureFieldKey,
  mappingNaturalKey,
  parseSyncArgs,
  planDefaultOperation,
  planFieldOperation,
  planMappingOperation,
  planStorageOperation,
  summarizeOps,
  type DefaultLike,
  type MappingLike,
  type StructuralField,
} from "../lib/condo-txr-1605-production-sync.ts";
import {
  assertDistinctProjects,
  assertProductionTargetRef,
  extractProjectRef,
} from "../lib/selective-production/safety.ts";
import { buildGlobalFormStoragePath } from "../lib/form-storage.ts";

const MANIFEST_OUT = "CONDO_TXR_1605_PRODUCTION_SYNC_MANIFEST.json";
const PRE_SYNC_OUT = "CONDO_TXR_1605_PRODUCTION_PRE_SYNC.json";
const POST_SYNC_OUT = "CONDO_TXR_1605_PRODUCTION_POST_SYNC.json";
const ROLLBACK_OUT = "CONDO_TXR_1605_PRODUCTION_ROLLBACK.json";
const AUDIT_TMP = path.join("_audit_tmp", "condo_txr_1605_sync_run.json");

type Row = Record<string, unknown>;

function loadEnvFile(filePath: string, options?: { overrideMatching?: RegExp }) {
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
    const override =
      process.env[m[1]] === undefined ||
      Boolean(options?.overrideMatching?.test(m[1]));
    if (override) process.env[m[1]] = val;
  }
}

function client(url: string, key: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchAll(
  sb: SupabaseClient,
  table: string,
  select: string,
  applyFilters?: (q: ReturnType<SupabaseClient["from"]>) => unknown,
): Promise<Row[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: Row[] = [];
  for (;;) {
    let q: unknown = sb.from(table).select(select).range(from, from + pageSize - 1);
    if (applyFilters) q = applyFilters(q as ReturnType<SupabaseClient["from"]>);
    const { data, error } = await (q as PromiseLike<{
      data: Row[] | null;
      error: { message: string } | null;
    }>);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function countExact(
  sb: SupabaseClient,
  table: string,
  applyFilters?: (q: ReturnType<SupabaseClient["from"]>) => unknown,
) {
  let q: unknown = sb.from(table).select("*", { count: "exact", head: true });
  if (applyFilters) q = applyFilters(q as ReturnType<SupabaseClient["from"]>);
  const { count, error } = await (q as PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>);
  if (error) throw error;
  return count ?? 0;
}

async function downloadPdfMeta(sb: SupabaseClient, storagePath: string | null) {
  if (!storagePath) return null;
  const { data, error } = await sb.storage
    .from("form-templates")
    .download(storagePath);
  if (error) throw new Error(`PDF download failed for ${storagePath}: ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  return {
    path: storagePath,
    bytes: buf.length,
    md5: crypto.createHash("md5").update(buf).digest("hex"),
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    buf,
  };
}

function fingerprintInstances(rows: Row[]) {
  const normalized = rows
    .map((r) => ({
      id: r.id,
      packet_id: r.packet_id,
      packet_form_id: r.packet_form_id,
      field_id: r.field_id,
      value: r.value ?? null,
      value_json: r.value_json ?? null,
      source: r.source ?? null,
      is_override: r.is_override ?? null,
      status: r.status ?? null,
      create_date: r.create_date ?? null,
      update_date: r.update_date ?? null,
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    count: normalized.length,
    sha256: crypto
      .createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex"),
  };
}

async function resolveExactForm(
  sb: SupabaseClient,
  label: string,
  requireActiveGlobal: boolean,
) {
  const rows = await fetchAll(
    sb,
    "forms",
    "*",
    (q) => q.ilike("form_code", FORM_CODE),
  );
  const matches = rows.filter((f) => {
    const codeOk =
      String(f.form_code).toLowerCase() === FORM_CODE.toLowerCase();
    const versionOk = (f.version_label || "") === VERSION_LABEL;
    if (!codeOk || !versionOk) return false;
    if (!requireActiveGlobal) return true;
    return f.status === "ACTIVE" && f.scope === "GLOBAL";
  });
  if (matches.length !== 1) {
    throw new Error(
      `ABORT ${label}: expected exactly 1 form for ${FORM_CODE}/${VERSION_LABEL}` +
        (requireActiveGlobal ? " ACTIVE GLOBAL" : "") +
        `, got ${matches.length}`,
    );
  }
  return matches[0];
}

async function loadFormBundle(sb: SupabaseClient, formId: number) {
  const mappings = await fetchAll(sb, "form_field_mappings", "*", (q) =>
    q.eq("form_id", formId).eq("status", "ACTIVE"),
  );
  const fieldIds = [...new Set(mappings.map((m) => String(m.field_id)))];
  const fields: Row[] = [];
  for (let i = 0; i < fieldIds.length; i += 100) {
    const chunk = fieldIds.slice(i, i + 100);
    if (!chunk.length) break;
    const { data, error } = await sb.from("fields").select("*").in("id", chunk);
    if (error) throw error;
    fields.push(...((data ?? []) as Row[]));
  }
  const fieldById = new Map(fields.map((f) => [String(f.id), f]));
  const enrichedMappings: Array<MappingLike & { field_id: string; id: string }> =
    mappings.map((m) => {
      const f = fieldById.get(String(m.field_id));
      return {
        id: String(m.id),
        field_id: String(m.field_id),
        field_key: String(f?.field_key ?? ""),
        page_number: Number(m.page_number),
        occurrence_index: (m.occurrence_index as number | null) ?? 0,
        x: Number(m.x),
        y: Number(m.y),
        width: Number(m.width),
        height: Number(m.height),
        page_width: (m.page_width as number | null) ?? null,
        page_height: (m.page_height as number | null) ?? null,
        font_size: (m.font_size as number | null) ?? null,
        alignment: (m.alignment as string | null) ?? null,
        field_widget_type: (m.field_widget_type as string | null) ?? null,
        mapping_name: (m.mapping_name as string | null) ?? null,
        default_value_override:
          (m.default_value_override as string | null) ?? null,
        required: (m.required as boolean | null) ?? null,
        notes: (m.notes as string | null) ?? null,
        pdf_field_name: (m.pdf_field_name as string | null) ?? null,
        pdf_field_type: (m.pdf_field_type as string | null) ?? null,
        pdf_export_value: (m.pdf_export_value as string | null) ?? null,
        status: String(m.status),
      };
    });

  const defaultsRaw = await fetchAll(sb, "field_defaults", "*", (q) =>
    q.eq("form_id", formId).eq("status", "ACTIVE"),
  );
  const defaults: DefaultLike[] = defaultsRaw.map((d) => {
    const f = fieldById.get(String(d.field_id));
    // Defaults may reference fields not in mappings; fetch later if needed
    return {
      id: String(d.id),
      field_key: String(f?.field_key ?? ""),
      field_id: String(d.field_id),
      scope: d.scope as "PRIVATE" | "ORGANIZATION",
      owner_user_id: (d.owner_user_id as string | null) ?? null,
      organization_id: (d.organization_id as string | null) ?? null,
      form_field_mapping_id:
        (d.form_field_mapping_id as string | null) ?? null,
      default_value: (d.default_value as string | null) ?? null,
      default_checked: (d.default_checked as boolean | null) ?? null,
      notes: (d.notes as string | null) ?? null,
      status: String(d.status),
      created_by_user_id: (d.created_by_user_id as string | null) ?? null,
      updated_by_user_id: (d.updated_by_user_id as string | null) ?? null,
    } as DefaultLike & { field_id: string };
  });

  // Resolve missing field_keys on defaults
  const missingDefaultFieldIds = defaults
    .filter((d) => !d.field_key)
    .map((d) => String((d as { field_id?: string }).field_id));
  if (missingDefaultFieldIds.length) {
    const { data, error } = await sb
      .from("fields")
      .select("id, field_key")
      .in("id", missingDefaultFieldIds);
    if (error) throw error;
    const map = new Map((data ?? []).map((f) => [String(f.id), String(f.field_key)]));
    for (const d of defaults) {
      if (!d.field_key) {
        d.field_key = map.get(String((d as { field_id?: string }).field_id)) || "";
      }
    }
  }

  return { mappings: enrichedMappings, fields, defaults };
}

async function loadProdFieldsByKeys(sb: SupabaseClient, keys: string[]) {
  const out = new Map<string, Row>();
  for (let i = 0; i < keys.length; i += 80) {
    const chunk = keys.slice(i, i + 80);
    const { data, error } = await sb
      .from("fields")
      .select("*")
      .eq("status", "ACTIVE")
      .eq("scope", "GLOBAL")
      .in("field_key", chunk);
    if (error) throw error;
    for (const f of data ?? []) out.set(String(f.field_key), f as Row);
  }
  return out;
}

async function otherMappingCount(
  sb: SupabaseClient,
  fieldId: string,
  excludeFormId: number,
) {
  return countExact(sb, "form_field_mappings", (q) =>
    q
      .eq("field_id", fieldId)
      .eq("status", "ACTIVE")
      .neq("form_id", excludeFormId),
  );
}

async function captureSafetyFingerprint(sb: SupabaseClient, formId: number) {
  const counts = {
    packets: await countExact(sb, "packets"),
    packet_forms: await countExact(sb, "packet_forms"),
    field_instances: await countExact(sb, "field_instances"),
    forms: await countExact(sb, "forms"),
    form_field_mappings: await countExact(sb, "form_field_mappings"),
    field_defaults: await countExact(sb, "field_defaults"),
    fields: await countExact(sb, "fields"),
    target_form_mappings_active: await countExact(
      sb,
      "form_field_mappings",
      (q) => q.eq("form_id", formId).eq("status", "ACTIVE"),
    ),
    target_form_defaults_active: await countExact(sb, "field_defaults", (q) =>
      q.eq("form_id", formId).eq("status", "ACTIVE"),
    ),
    mappings_outside_target: await countExact(sb, "form_field_mappings", (q) =>
      q.neq("form_id", formId),
    ),
    defaults_outside_target: await countExact(sb, "field_defaults", (q) =>
      q.or(`form_id.is.null,form_id.neq.${formId}`),
    ),
  };
  const instances = await fetchAll(
    sb,
    "field_instances",
    "id, packet_id, packet_form_id, field_id, value, value_json, source, is_override, status, create_date, update_date",
  );
  return {
    capturedAt: new Date().toISOString(),
    counts,
    fieldInstanceFingerprint: fingerprintInstances(instances),
  };
}

async function verifyIdentities(prod: SupabaseClient) {
  const { data: profile, error: pErr } = await prod
    .from("profiles")
    .select("id, email, status, display_name, primary_organization_id")
    .eq("id", LEE_AUTH_UUID)
    .single();
  if (pErr) throw pErr;
  if (profile.email !== LEE_AUTH_EMAIL) {
    throw new Error(
      `ABORT: production Lee email mismatch (${profile.email} != ${LEE_AUTH_EMAIL})`,
    );
  }
  const { data: auth, error: aErr } =
    await prod.auth.admin.getUserById(LEE_AUTH_UUID);
  if (aErr) {
    console.warn(
      "WARN: auth.admin.getUserById failed; continuing with verified profiles row:",
      aErr.message,
    );
  } else if (auth.user?.email !== LEE_AUTH_EMAIL) {
    throw new Error("ABORT: production Auth email mismatch for Lee");
  }
  const { data: org, error: oErr } = await prod
    .from("organizations")
    .select("id, name, status")
    .eq("id", DGR_ORGANIZATION_ID)
    .single();
  if (oErr) throw oErr;
  if (org.name !== DGR_ORGANIZATION_NAME || org.status !== "ACTIVE") {
    throw new Error("ABORT: Davey Goosmann Realty org identity mismatch");
  }
  const { data: mem, error: mErr } = await prod
    .from("organization_members")
    .select("id, status, membership_role")
    .eq("user_id", LEE_AUTH_UUID)
    .eq("organization_id", DGR_ORGANIZATION_ID)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (mErr) throw mErr;
  if (!mem) {
    throw new Error("ABORT: Lee is not an ACTIVE member of DGR in production");
  }
  return {
    profile,
    org,
    mem,
    authEmail: auth?.user?.email ?? profile.email,
  };
}

function toStructural(f: Row): StructuralField {
  return {
    id: String(f.id),
    field_key: String(f.field_key),
    field_name: String(f.field_name),
    field_label: String(f.field_label),
    field_data_type: String(f.field_data_type),
    field_widget_type: String(f.field_widget_type),
    source_type: (f.source_type as string | null) ?? null,
    source_path: (f.source_path as string | null) ?? null,
    resolver_key: (f.resolver_key as string | null) ?? null,
    required: (f.required as boolean | null) ?? null,
    notes: (f.notes as string | null) ?? null,
    status: String(f.status ?? ""),
    scope: String(f.scope ?? ""),
  };
}

async function buildManifest(options: {
  source: SupabaseClient;
  target: SupabaseClient;
  gitCommit: string;
  sourceRef: string;
  targetRef: string;
}) {
  const { source, target, gitCommit, sourceRef, targetRef } = options;
  const devForm = await resolveExactForm(source, "DEV", true);
  const prodForm = await resolveExactForm(target, "PROD", true);

  // Reject TXR-1401 / addendum confusion
  const name = String(prodForm.form_name || "");
  if (/addendum/i.test(name) || /1401/i.test(String(prodForm.form_code))) {
    throw new Error(`ABORT: production candidate looks like addendum: ${name}`);
  }

  const identities = await verifyIdentities(target);
  const devBundle = await loadFormBundle(source, Number(devForm.id));
  const prodBundle = await loadFormBundle(target, Number(prodForm.id));

  if (devBundle.mappings.some((m) => looksLikeSignatureFieldKey(m.field_key))) {
    throw new Error("ABORT: signature/initials-like field key present on development form");
  }

  const distinctKeys = [
    ...new Set(devBundle.mappings.map((m) => m.field_key)),
  ].sort();
  const prodFieldsByKey = await loadProdFieldsByKeys(target, distinctKeys);
  const sourcePdf = await downloadPdfMeta(
    source,
    String(devForm.source_storage_path),
  );
  const targetPdf = await downloadPdfMeta(
    target,
    String(prodForm.source_storage_path),
  );
  const targetPath = buildGlobalFormStoragePath(
    Number(prodForm.id),
    "CondoListing.pdf",
  );

  const fieldOps = [];
  for (const key of distinctKeys) {
    const devFieldRow = devBundle.fields.find((f) => f.field_key === key);
    if (!devFieldRow) {
      throw new Error(`ABORT: missing development field row for ${key}`);
    }
    const prodFieldRow = prodFieldsByKey.get(key) ?? null;
    const otherCount = prodFieldRow
      ? await otherMappingCount(target, String(prodFieldRow.id), Number(prodForm.id))
      : 0;
    const txr1605Created =
      key.startsWith("contract_condo_") || !prodFieldRow;
    const planned = planFieldOperation({
      fieldKey: key,
      devField: toStructural(devFieldRow),
      prodField: prodFieldRow ? toStructural(prodFieldRow) : null,
      otherProdActiveMappingCount: otherCount,
      txr1605Created,
    });
    fieldOps.push({
      field_key: key,
      label: String(devFieldRow.field_label),
      widget_type: String(devFieldRow.field_widget_type),
      data_type: String(devFieldRow.field_data_type),
      source_type: (devFieldRow.source_type as string | null) ?? null,
      source_path: (devFieldRow.source_path as string | null) ?? null,
      resolver_key: (devFieldRow.resolver_key as string | null) ?? null,
      required: Boolean(devFieldRow.required),
      status: String(devFieldRow.status),
      origin: txr1605Created ? "TXR-1605-created" : "reused-preexisting",
      development_field_id: String(devFieldRow.id),
      production_field_id: prodFieldRow ? String(prodFieldRow.id) : null,
      operation: planned.operation,
      diffs: planned.diffs ?? null,
      blocker: planned.blocker ?? null,
      notes: (devFieldRow.notes as string | null) ?? null,
    });
  }

  const prodMapByKey = new Map(
    prodBundle.mappings.map((m) => [mappingNaturalKey(m), m]),
  );
  const mappingOps = devBundle.mappings.map((dev) => {
    const prod = prodMapByKey.get(mappingNaturalKey(dev)) ?? null;
    const planned = planMappingOperation({ dev, prod });
    return {
      field_key: dev.field_key,
      page_number: dev.page_number,
      occurrence_index: dev.occurrence_index ?? 0,
      x: dev.x,
      y: dev.y,
      width: dev.width,
      height: dev.height,
      page_width: dev.page_width,
      page_height: dev.page_height,
      font_size: dev.font_size,
      alignment: dev.alignment,
      field_widget_type: dev.field_widget_type,
      mapping_name: dev.mapping_name,
      default_value_override: dev.default_value_override,
      required: dev.required,
      notes: dev.notes,
      pdf_field_name: dev.pdf_field_name,
      pdf_field_type: dev.pdf_field_type,
      pdf_export_value: dev.pdf_export_value,
      development_mapping_id: dev.id,
      production_mapping_id: prod?.id ?? null,
      operation: planned.operation,
      blocker: planned.blocker ?? null,
    };
  });

  // Stale prod mappings on this form not present in development
  const devMapKeys = new Set(devBundle.mappings.map(mappingNaturalKey));
  const staleMappingOps = prodBundle.mappings
    .filter((m) => !devMapKeys.has(mappingNaturalKey(m)))
    .map((m) => ({
      field_key: m.field_key,
      page_number: m.page_number,
      occurrence_index: m.occurrence_index ?? 0,
      production_mapping_id: m.id,
      operation: "CONFLICT" as const,
      blocker:
        "Production has ACTIVE mapping absent from development; refusing automatic removal",
    }));

  const approvedDevDefaults = devBundle.defaults.filter((d) => {
    if (d.scope === "PRIVATE") {
      return d.owner_user_id === LEE_AUTH_UUID;
    }
    if (d.scope === "ORGANIZATION") {
      return d.organization_id === DGR_ORGANIZATION_ID;
    }
    return false;
  });
  const approvedProdDefaults = prodBundle.defaults.filter((d) => {
    if (d.scope === "PRIVATE") return d.owner_user_id === LEE_AUTH_UUID;
    if (d.scope === "ORGANIZATION")
      return d.organization_id === DGR_ORGANIZATION_ID;
    return false;
  });

  // Reject unexpected owners on prod form-scoped defaults
  const unexpectedProdDefaults = prodBundle.defaults.filter((d) => {
    if (d.scope === "PRIVATE" && d.owner_user_id !== LEE_AUTH_UUID) return true;
    if (
      d.scope === "ORGANIZATION" &&
      d.organization_id !== DGR_ORGANIZATION_ID
    )
      return true;
    return false;
  });
  if (unexpectedProdDefaults.length) {
    throw new Error(
      `ABORT: unexpected owners on production form-scoped defaults (${unexpectedProdDefaults.length})`,
    );
  }

  const prodDefByKey = new Map(
    approvedProdDefaults.map((d) => [defaultNaturalKey(d), d]),
  );
  const devDefByKey = new Map(
    approvedDevDefaults.map((d) => [defaultNaturalKey(d), d]),
  );
  const defaultKeys = new Set([...devDefByKey.keys(), ...prodDefByKey.keys()]);
  const defaultOps = [...defaultKeys].map((k) => {
    const dev = devDefByKey.get(k) ?? null;
    const prod = prodDefByKey.get(k) ?? null;
    const planned = planDefaultOperation({ dev, prod });
    return {
      natural_key: k,
      scope: (dev ?? prod)!.scope,
      owner_user_id: (dev ?? prod)!.owner_user_id ?? null,
      organization_id: (dev ?? prod)!.organization_id ?? null,
      field_key: (dev ?? prod)!.field_key,
      form_field_mapping_id: (dev ?? prod)!.form_field_mapping_id ?? null,
      default_value: dev?.default_value ?? null,
      default_checked: dev?.default_checked ?? null,
      notes: dev?.notes ?? null,
      development_default_id: dev?.id ?? null,
      production_default_id: prod?.id ?? null,
      operation: planned.operation,
      blocker: planned.blocker ?? null,
    };
  });

  const storage = planStorageOperation({
    source: sourcePdf,
    target: targetPdf,
    targetFormPath: targetPath,
  });

  const formNameUpdate =
    String(devForm.form_name) !== String(prodForm.form_name)
      ? {
          operation: "UPDATE" as const,
          from: String(prodForm.form_name),
          to: String(devForm.form_name),
        }
      : { operation: "NO_CHANGE" as const, from: String(prodForm.form_name), to: String(devForm.form_name) };

  const blockers = [
    ...fieldOps.filter((f) => f.operation === "CONFLICT").map((f) => f.blocker),
    ...mappingOps.filter((m) => m.operation === "CONFLICT").map((m) => m.blocker),
    ...staleMappingOps.map((m) => m.blocker),
    ...defaultOps.filter((d) => d.operation === "CONFLICT").map((d) => d.blocker),
    storage.blocker,
  ].filter(Boolean);

  const expected = {
    fields_reused: fieldOps.filter((f) => f.operation === "REUSE").length,
    fields_inserted: fieldOps.filter((f) => f.operation === "INSERT").length,
    fields_updated: fieldOps.filter((f) => f.operation === "UPDATE_METADATA")
      .length,
    fields_conflict: fieldOps.filter((f) => f.operation === "CONFLICT").length,
    mappings_inserted: mappingOps.filter((m) => m.operation === "INSERT").length,
    mappings_updated: mappingOps.filter((m) => m.operation === "UPDATE").length,
    mappings_unchanged: mappingOps.filter((m) => m.operation === "NO_CHANGE")
      .length,
    mappings_stale_conflicts: staleMappingOps.length,
    personal_defaults_inserted: defaultOps.filter(
      (d) => d.scope === "PRIVATE" && d.operation === "INSERT",
    ).length,
    personal_defaults_updated: defaultOps.filter(
      (d) => d.scope === "PRIVATE" && d.operation === "UPDATE",
    ).length,
    personal_defaults_unchanged: defaultOps.filter(
      (d) => d.scope === "PRIVATE" && d.operation === "NO_CHANGE",
    ).length,
    organization_defaults_inserted: defaultOps.filter(
      (d) => d.scope === "ORGANIZATION" && d.operation === "INSERT",
    ).length,
    organization_defaults_updated: defaultOps.filter(
      (d) => d.scope === "ORGANIZATION" && d.operation === "UPDATE",
    ).length,
    organization_defaults_unchanged: defaultOps.filter(
      (d) => d.scope === "ORGANIZATION" && d.operation === "NO_CHANGE",
    ).length,
    storage_operation: storage.operation,
    packet_instance_changes: 0,
    final_mapping_count: mappingOps.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    sourceGitCommit: gitCommit,
    source: {
      projectRef: sourceRef,
      formId: Number(devForm.id),
      stableIdentity: {
        form_code: FORM_CODE,
        version_label: VERSION_LABEL,
        form_name: String(devForm.form_name),
        form_category: String(devForm.form_category),
        state_code: String(devForm.state_code),
        scope: String(devForm.scope),
        status: String(devForm.status),
      },
      pdf: sourcePdf
        ? {
            path: sourcePdf.path,
            bytes: sourcePdf.bytes,
            md5: sourcePdf.md5,
            sha256: sourcePdf.sha256,
          }
        : null,
      mappingCount: devBundle.mappings.length,
      distinctFieldCount: distinctKeys.length,
    },
    target: {
      projectRef: targetRef,
      formId: Number(prodForm.id),
      stableIdentity: {
        form_code: String(prodForm.form_code),
        version_label: String(prodForm.version_label),
        form_name: String(prodForm.form_name),
        form_category: String(prodForm.form_category),
        state_code: String(prodForm.state_code),
        scope: String(prodForm.scope),
        status: String(prodForm.status),
      },
      pdf: targetPdf
        ? {
            path: targetPdf.path,
            bytes: targetPdf.bytes,
            md5: targetPdf.md5,
            sha256: targetPdf.sha256,
          }
        : null,
      mappingCount: prodBundle.mappings.length,
      distinctFieldCount: prodBundle.fields.length,
    },
    identities: {
      lee: {
        userId: LEE_AUTH_UUID,
        email: identities.profile.email,
        authEmail: identities.authEmail,
      },
      organization: {
        id: identities.org.id,
        name: identities.org.name,
      },
      membership: identities.mem,
    },
    formRow: formNameUpdate,
    catalogFields: fieldOps,
    formMappings: mappingOps,
    staleProductionMappings: staleMappingOps,
    scopedDefaults: defaultOps,
    storage: {
      ...storage,
      sourceChecksum: sourcePdf
        ? { bytes: sourcePdf.bytes, md5: sourcePdf.md5, sha256: sourcePdf.sha256 }
        : null,
      targetChecksum: targetPdf
        ? { bytes: targetPdf.bytes, md5: targetPdf.md5, sha256: targetPdf.sha256 }
        : null,
    },
    expectedCounts: expected,
    fieldOpSummary: summarizeOps(fieldOps),
    mappingOpSummary: summarizeOps(mappingOps),
    defaultOpSummary: summarizeOps(defaultOps),
    blockers,
    _runtime: {
      devForm,
      prodForm,
      devBundle,
      sourcePdf,
      targetPdf,
    },
  };
}

async function applyManifest(
  target: SupabaseClient,
  manifest: Awaited<ReturnType<typeof buildManifest>>,
) {
  const now = new Date().toISOString();
  const prodFormId = manifest.target.formId;
  const fieldIdByKey = new Map<string, string>();

  // Seed existing production field IDs
  for (const f of manifest.catalogFields) {
    if (f.production_field_id) {
      fieldIdByKey.set(f.field_key, f.production_field_id);
    }
  }

  const insertedFields: Array<{ field_key: string; id: string }> = [];
  for (const f of manifest.catalogFields.filter((x) => x.operation === "INSERT")) {
    const id = crypto.randomUUID();
    const devField = manifest._runtime.devBundle.fields.find(
      (row) => row.field_key === f.field_key,
    );
    if (!devField) throw new Error(`Missing dev field ${f.field_key}`);
    const row = {
      id,
      field_key: f.field_key,
      field_name: String(devField.field_name),
      field_label: String(devField.field_label),
      field_data_type: String(devField.field_data_type),
      field_widget_type: String(devField.field_widget_type),
      source_type: (devField.source_type as string | null) ?? null,
      source_path: (devField.source_path as string | null) ?? null,
      resolver_key: (devField.resolver_key as string | null) ?? null,
      required: Boolean(devField.required),
      notes: (devField.notes as string | null) ?? null,
      default_value: null,
      default_checked: null,
      fallback_value: null,
      scope: "GLOBAL",
      owner_user_id: null,
      organization_id: null,
      status: "ACTIVE",
      create_date: now,
      update_date: now,
    };
    const { error } = await target.from("fields").insert(row);
    if (error) throw error;
    fieldIdByKey.set(f.field_key, id);
    insertedFields.push({ field_key: f.field_key, id });
  }

  for (const f of manifest.catalogFields.filter(
    (x) => x.operation === "UPDATE_METADATA",
  )) {
    const id = f.production_field_id!;
    const devField = manifest._runtime.devBundle.fields.find(
      (row) => row.field_key === f.field_key,
    );
    if (!devField) throw new Error(`Missing dev field ${f.field_key}`);
    const { error } = await target
      .from("fields")
      .update({
        field_name: String(devField.field_name),
        field_label: String(devField.field_label),
        field_data_type: String(devField.field_data_type),
        field_widget_type: String(devField.field_widget_type),
        source_type: (devField.source_type as string | null) ?? null,
        source_path: (devField.source_path as string | null) ?? null,
        resolver_key: (devField.resolver_key as string | null) ?? null,
        required: Boolean(devField.required),
        notes: (devField.notes as string | null) ?? null,
        update_date: now,
      })
      .eq("id", id);
    if (error) throw error;
  }

  if (manifest.formRow.operation === "UPDATE") {
    const { error } = await target
      .from("forms")
      .update({
        form_name: manifest.formRow.to,
        update_date: now,
      })
      .eq("id", prodFormId);
    if (error) throw error;
  }

  // Storage REPLACE/COPY if needed
  if (
    manifest.storage.operation === "COPY" ||
    manifest.storage.operation === "REPLACE"
  ) {
    const buf = manifest._runtime.sourcePdf?.buf;
    if (!buf) throw new Error("Source PDF buffer missing for upload");
    const uploadPath = manifest.storage.targetPath;
    const { error: upErr } = await target.storage
      .from("form-templates")
      .upload(uploadPath, buf, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) throw upErr;
    const verify = await downloadPdfMeta(target, uploadPath);
    if (
      !verify ||
      verify.md5 !== manifest.storage.sourceChecksum?.md5 ||
      verify.bytes !== manifest.storage.sourceChecksum?.bytes
    ) {
      throw new Error("ABORT: production PDF checksum mismatch after upload");
    }
    if (String(manifest._runtime.prodForm.source_storage_path) !== uploadPath) {
      const { error } = await target
        .from("forms")
        .update({ source_storage_path: uploadPath, update_date: now })
        .eq("id", prodFormId);
      if (error) throw error;
    }
  }

  const insertedMappings: string[] = [];
  const updatedMappings: string[] = [];
  for (const m of manifest.formMappings) {
    const fieldId = fieldIdByKey.get(m.field_key);
    if (!fieldId) throw new Error(`No production field id for ${m.field_key}`);
    if (m.operation === "INSERT") {
      const id = crypto.randomUUID();
      const { error } = await target.from("form_field_mappings").insert({
        id,
        form_id: prodFormId,
        field_id: fieldId,
        mapping_name: m.mapping_name,
        occurrence_index: m.occurrence_index ?? 0,
        page_number: m.page_number,
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        page_width: m.page_width,
        page_height: m.page_height,
        font_size: m.font_size,
        alignment: m.alignment,
        field_widget_type: m.field_widget_type,
        default_value_override: m.default_value_override,
        required: m.required ?? false,
        notes: m.notes,
        pdf_field_name: m.pdf_field_name,
        pdf_field_type: m.pdf_field_type,
        pdf_export_value: m.pdf_export_value,
        status: "ACTIVE",
        create_date: now,
        update_date: now,
      });
      if (error) throw error;
      insertedMappings.push(id);
    } else if (m.operation === "UPDATE") {
      const { error } = await target
        .from("form_field_mappings")
        .update({
          field_id: fieldId,
          mapping_name: m.mapping_name,
          occurrence_index: m.occurrence_index ?? 0,
          page_number: m.page_number,
          x: m.x,
          y: m.y,
          width: m.width,
          height: m.height,
          page_width: m.page_width,
          page_height: m.page_height,
          font_size: m.font_size,
          alignment: m.alignment,
          field_widget_type: m.field_widget_type,
          default_value_override: m.default_value_override,
          required: m.required ?? false,
          notes: m.notes,
          pdf_field_name: m.pdf_field_name,
          pdf_field_type: m.pdf_field_type,
          pdf_export_value: m.pdf_export_value,
          update_date: now,
        })
        .eq("id", m.production_mapping_id!)
        .eq("form_id", prodFormId);
      if (error) throw error;
      updatedMappings.push(String(m.production_mapping_id));
    }
  }

  const insertedDefaults: string[] = [];
  const updatedDefaults: string[] = [];
  const softDeletedDefaults: string[] = [];
  for (const d of manifest.scopedDefaults) {
    const fieldId = fieldIdByKey.get(d.field_key);
    if (!fieldId && d.operation !== "SOFT_DELETE") {
      throw new Error(`No production field id for default ${d.field_key}`);
    }
    if (d.operation === "INSERT") {
      const id = crypto.randomUUID();
      const { error } = await target.from("field_defaults").insert({
        id,
        field_id: fieldId,
        form_id: prodFormId,
        form_field_mapping_id: d.form_field_mapping_id,
        scope: d.scope,
        owner_user_id: d.scope === "PRIVATE" ? LEE_AUTH_UUID : null,
        organization_id:
          d.scope === "ORGANIZATION" ? DGR_ORGANIZATION_ID : null,
        default_value: d.default_value,
        default_checked: d.default_checked,
        created_by_user_id: LEE_AUTH_UUID,
        updated_by_user_id: LEE_AUTH_UUID,
        notes: d.notes,
        status: "ACTIVE",
        create_date: now,
        update_date: now,
      });
      if (error) throw error;
      insertedDefaults.push(id);
    } else if (d.operation === "UPDATE") {
      const { error } = await target
        .from("field_defaults")
        .update({
          default_value: d.default_value,
          default_checked: d.default_checked,
          notes: d.notes,
          updated_by_user_id: LEE_AUTH_UUID,
          update_date: now,
        })
        .eq("id", d.production_default_id!)
        .eq("form_id", prodFormId);
      if (error) throw error;
      updatedDefaults.push(String(d.production_default_id));
    } else if (d.operation === "SOFT_DELETE") {
      const { error } = await target
        .from("field_defaults")
        .update({ status: "DELETED", update_date: now })
        .eq("id", d.production_default_id!)
        .eq("form_id", prodFormId);
      if (error) throw error;
      softDeletedDefaults.push(String(d.production_default_id));
    }
  }

  return {
    insertedFields,
    insertedMappings,
    updatedMappings,
    insertedDefaults,
    updatedDefaults,
    softDeletedDefaults,
  };
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env.ops.production", {
    overrideMatching: /^(TARGET_|SOURCE_)/,
  });
  const args = parseSyncArgs(process.argv.slice(2));

  const sourceUrl =
    process.env.SOURCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const sourceKey =
    process.env.SOURCE_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const targetUrl = process.env.TARGET_SUPABASE_URL!;
  const targetKey = process.env.TARGET_SUPABASE_SECRET_KEY!;

  const { sourceRef, targetRef } = assertDistinctProjects({
    sourceUrl,
    targetUrl,
    allowDevAsSource: true,
  });
  assertProductionTargetRef(targetRef);
  if (sourceRef !== DEV_REF) {
    throw new Error(`ABORT: source must be development ${DEV_REF}, got ${sourceRef}`);
  }
  if (targetRef !== PROD_REF) {
    throw new Error(`ABORT: target must be production ${PROD_REF}, got ${targetRef}`);
  }
  // Refuse reverse
  if (extractProjectRef(sourceUrl) === PROD_REF) {
    throw new Error("ABORT: refusing production as source");
  }
  if (extractProjectRef(targetUrl) === DEV_REF) {
    throw new Error("ABORT: refusing development as target");
  }

  console.log("SOURCE_REF=", sourceRef);
  console.log("TARGET_REF=", targetRef);
  console.log("MODE=", args.apply && !args.dryRun ? "APPLY" : "DRY_RUN");

  if (args.apply && !args.dryRun) {
    if (args.confirm !== CONFIRM_TOKEN) {
      throw new Error(
        `ABORT: --apply requires --confirm ${CONFIRM_TOKEN}`,
      );
    }
  }

  const source = client(sourceUrl, sourceKey);
  const target = client(targetUrl, targetKey);
  const gitCommit = (
    process.env.GIT_COMMIT ||
    fs.readFileSync(".git/HEAD", "utf8").trim()
  ).slice(0, 80);

  const manifest = await buildManifest({
    source,
    target,
    gitCommit,
    sourceRef,
    targetRef,
  });

  // Refresh pre-sync with correct form id
  const preSync = await captureSafetyFingerprint(target, manifest.target.formId);
  const rollback = {
    createdAt: new Date().toISOString(),
    productionFormId: manifest.target.formId,
    priorFormRow: {
      id: manifest.target.formId,
      form_name: manifest.target.stableIdentity.form_name,
      source_storage_path: manifest._runtime.prodForm.source_storage_path,
      version_label: manifest.target.stableIdentity.version_label,
      form_code: manifest.target.stableIdentity.form_code,
    },
    priorMappings: manifest._runtime
      ? await fetchAll(target, "form_field_mappings", "*", (q) =>
          q.eq("form_id", manifest.target.formId),
        )
      : [],
    priorDefaults: await fetchAll(target, "field_defaults", "*", (q) =>
      q.eq("form_id", manifest.target.formId),
    ),
    priorPdf: manifest.target.pdf,
    instructions: [
      "Restore form_name/source_storage_path from priorFormRow if changed.",
      "Soft-delete mappings inserted by this sync (status=DELETED) for form_id.",
      "Soft-delete defaults inserted by this sync for form_id.",
      "Soft-delete Global fields inserted by this sync only if unused elsewhere.",
      "Never modify field_instances.",
    ],
  };

  const publicManifest = { ...manifest, _runtime: undefined };
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(publicManifest, null, 2));
  console.log("WROTE_MANIFEST=", MANIFEST_OUT);

  // Pre-sync and rollback snapshots: write on apply; on dry-run only if missing
  // so a post-apply idempotency dry-run cannot clobber audit artifacts.
  if (args.apply && !args.dryRun) {
    fs.writeFileSync(PRE_SYNC_OUT, JSON.stringify(preSync, null, 2));
    fs.writeFileSync(ROLLBACK_OUT, JSON.stringify(rollback, null, 2));
    console.log("WROTE_PRE_SYNC=", PRE_SYNC_OUT);
    console.log("WROTE_ROLLBACK=", ROLLBACK_OUT);
  } else {
    if (!fs.existsSync(PRE_SYNC_OUT)) {
      fs.writeFileSync(PRE_SYNC_OUT, JSON.stringify(preSync, null, 2));
      console.log("WROTE_PRE_SYNC=", PRE_SYNC_OUT);
    } else {
      console.log("KEPT_EXISTING_PRE_SYNC=", PRE_SYNC_OUT);
    }
    if (!fs.existsSync(ROLLBACK_OUT)) {
      fs.writeFileSync(ROLLBACK_OUT, JSON.stringify(rollback, null, 2));
      console.log("WROTE_ROLLBACK=", ROLLBACK_OUT);
    } else {
      console.log("KEPT_EXISTING_ROLLBACK=", ROLLBACK_OUT);
    }
  }
  console.log("EXPECTED=", JSON.stringify(manifest.expectedCounts, null, 2));
  console.log("BLOCKERS=", manifest.blockers);
  console.log("FORM=", {
    dev: manifest.source.formId,
    prod: manifest.target.formId,
    formRow: manifest.formRow,
    storage: manifest.storage.operation,
  });

  if (manifest.blockers.length) {
    throw new Error(`ABORT: ${manifest.blockers.length} blocker(s) present`);
  }

  if (!(args.apply && !args.dryRun)) {
    console.log("DRY_RUN_COMPLETE — no writes performed");
    fs.mkdirSync(path.dirname(AUDIT_TMP), { recursive: true });
    fs.writeFileSync(
      AUDIT_TMP,
      JSON.stringify({ mode: "dry-run", expected: manifest.expectedCounts }, null, 2),
    );
    return;
  }

  const applyResult = await applyManifest(target, manifest);
  const postSync = await captureSafetyFingerprint(target, manifest.target.formId);
  fs.writeFileSync(POST_SYNC_OUT, JSON.stringify(postSync, null, 2));

  if (
    postSync.fieldInstanceFingerprint.sha256 !==
    preSync.fieldInstanceFingerprint.sha256
  ) {
    throw new Error("ABORT: packet field-instance fingerprint changed");
  }
  if (postSync.counts.packets !== preSync.counts.packets) {
    throw new Error("ABORT: packet count changed");
  }
  if (postSync.counts.packet_forms !== preSync.counts.packet_forms) {
    throw new Error("ABORT: packet_form count changed");
  }
  if (postSync.counts.field_instances !== preSync.counts.field_instances) {
    throw new Error("ABORT: field_instance count changed");
  }

  // Idempotency check by rebuilding plan
  const after = await buildManifest({
    source,
    target,
    gitCommit,
    sourceRef,
    targetRef,
  });
  const publicAfter = { ...after, _runtime: undefined };
  fs.writeFileSync(
    path.join("_audit_tmp", "condo_txr_1605_post_apply_plan.json"),
    JSON.stringify(publicAfter, null, 2),
  );

  const nonIdle = [
    ...after.catalogFields.filter(
      (f) => f.operation !== "REUSE" && f.operation !== "NO_CHANGE",
    ),
    ...after.formMappings.filter((m) => m.operation !== "NO_CHANGE"),
    ...after.scopedDefaults.filter((d) => d.operation !== "NO_CHANGE"),
  ];
  if (after.storage.operation !== "REUSE") {
    nonIdle.push({ operation: after.storage.operation } as never);
  }
  if (after.formRow.operation !== "NO_CHANGE") {
    nonIdle.push({ operation: after.formRow.operation } as never);
  }

  console.log("APPLY_RESULT=", {
    insertedFields: applyResult.insertedFields.length,
    insertedMappings: applyResult.insertedMappings.length,
    updatedMappings: applyResult.updatedMappings.length,
    insertedDefaults: applyResult.insertedDefaults.length,
    updatedDefaults: applyResult.updatedDefaults.length,
    softDeletedDefaults: applyResult.softDeletedDefaults.length,
  });
  console.log("POST_IDEMPOTENCY_PENDING_OPS=", nonIdle.length);
  console.log(
    "PACKET_FP_UNCHANGED=",
    postSync.fieldInstanceFingerprint.sha256 ===
      preSync.fieldInstanceFingerprint.sha256,
  );

  fs.mkdirSync(path.dirname(AUDIT_TMP), { recursive: true });
  fs.writeFileSync(
    AUDIT_TMP,
    JSON.stringify(
      {
        mode: "apply",
        applyResult,
        preSync,
        postSync,
        postPlanExpected: after.expectedCounts,
        pendingAfterApply: nonIdle.length,
      },
      null,
      2,
    ),
  );

  if (nonIdle.length) {
    throw new Error(
      `ABORT: post-apply plan still has ${nonIdle.length} non-idle operation(s)`,
    );
  }
  console.log("APPLY_COMPLETE");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
