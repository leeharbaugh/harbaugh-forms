/**
 * READ-ONLY forensic dump for Form #1 (Buyer Rep / TXR-1501).
 * Does not mutate any rows, storage objects, or packets.
 *
 * Run:
 *   npx --yes node --experimental-strip-types --env-file=.env.local --env-file=.env.ops.production scripts/forensic-form-1-placements.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";

const DEV_REF = "ewxsxwzezhkeawnjvigx";
const PROD_REF = "eetonalyyyssvkyfdoxh";
const FORM_ID = 1;

type MappingRow = {
  id: string;
  form_id: number;
  field_id: string | null;
  mapping_name: string | null;
  occurrence_index: number | null;
  page_number: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  page_width: number | null;
  page_height: number | null;
  font_size: number | null;
  alignment: string | null;
  field_widget_type: string | null;
  pdf_field_name: string | null;
  status: string;
  create_date: string;
  update_date: string;
  fields: {
    id: string;
    field_key: string;
    field_label: string | null;
    field_widget_type: string | null;
    status: string;
  } | null;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function client(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function assertRef(url: string, expected: string, label: string) {
  if (!url.includes(expected)) {
    throw new Error(`${label} URL must include ${expected}, got ${url}`);
  }
}

function fingerprintMappings(rows: MappingRow[]): string {
  const normalized = [...rows]
    .map((r) =>
      [
        r.id,
        r.field_id,
        r.occurrence_index ?? 0,
        r.page_number,
        Number(r.x).toFixed(4),
        Number(r.y).toFixed(4),
        r.width == null ? "" : Number(r.width).toFixed(4),
        r.height == null ? "" : Number(r.height).toFixed(4),
        r.page_width ?? "",
        r.page_height ?? "",
        r.status,
      ].join("|"),
    )
    .sort();
  return createHash("sha256").update(normalized.join("\n")).digest("hex");
}

async function loadForm(sb: SupabaseClient) {
  const { data, error } = await sb
    .from("forms")
    .select(
      "id, form_code, form_name, version_label, scope, owner_user_id, status, publication_state, source_storage_path, create_date, update_date, form_family_key, copied_from_form_id, form_category",
    )
    .eq("id", FORM_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function loadMappings(sb: SupabaseClient): Promise<MappingRow[]> {
  const { data, error } = await sb
    .from("form_field_mappings")
    .select(
      "id, form_id, field_id, mapping_name, occurrence_index, page_number, x, y, width, height, page_width, page_height, font_size, alignment, field_widget_type, pdf_field_name, status, create_date, update_date, fields(id, field_key, field_label, field_widget_type, status)",
    )
    .eq("form_id", FORM_ID)
    .neq("status", "DELETED")
    .order("page_number", { ascending: true })
    .order("y", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MappingRow[];
}

async function loadAllActiveMappingFingerprint(sb: SupabaseClient) {
  const { data, error } = await sb
    .from("form_field_mappings")
    .select(
      "id, form_id, field_id, occurrence_index, page_number, x, y, width, height, page_width, page_height, status",
    )
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);
  const byForm = new Map<number, string[]>();
  for (const row of data ?? []) {
    const key = [
      row.id,
      row.field_id,
      row.occurrence_index ?? 0,
      row.page_number,
      Number(row.x).toFixed(4),
      Number(row.y).toFixed(4),
      row.width == null ? "" : Number(row.width).toFixed(4),
      row.height == null ? "" : Number(row.height).toFixed(4),
      row.page_width ?? "",
      row.page_height ?? "",
    ].join("|");
    const list = byForm.get(row.form_id) ?? [];
    list.push(key);
    byForm.set(row.form_id, list);
  }
  const fingerprints: Record<string, { count: number; sha256: string }> = {};
  for (const [formId, keys] of [...byForm.entries()].sort((a, b) => a[0] - b[0])) {
    keys.sort();
    fingerprints[String(formId)] = {
      count: keys.length,
      sha256: createHash("sha256").update(keys.join("\n")).digest("hex"),
    };
  }
  return fingerprints;
}

async function loadPacketPlacementOverrides(sb: SupabaseClient) {
  const { data: packetForms, error: pfError } = await sb
    .from("packet_forms")
    .select("id, packet_id, form_id, status, document_state")
    .eq("form_id", FORM_ID);
  if (pfError) throw new Error(pfError.message);
  const pfIds = (packetForms ?? []).map((p) => p.id);
  if (pfIds.length === 0) {
    return { packetForms: [], overrides: [] };
  }
  const { data: overrides, error } = await sb
    .from("field_instance_mappings")
    .select(
      "id, packet_form_id, field_id, form_field_mapping_id, page_number, x, y, width, height, page_width, page_height, status, update_date",
    )
    .in("packet_form_id", pfIds)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);
  return { packetForms: packetForms ?? [], overrides: overrides ?? [] };
}

async function loadPdfMeta(
  sb: SupabaseClient,
  storagePath: string | null | undefined,
) {
  if (!storagePath) return null;
  const { data, error } = await sb.storage
    .from("form-templates")
    .download(storagePath);
  if (error || !data) {
    return { error: error?.message ?? "download failed", storagePath };
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const md5 = createHash("md5").update(bytes).digest("hex");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdf.getPages().map((page, index) => {
    const { width, height } = page.getSize();
    return { page: index + 1, width, height };
  });
  return {
    storagePath,
    byteLength: bytes.length,
    md5,
    sha256,
    pageCount: pdf.getPageCount(),
    pages,
  };
}

function summarizeAnomalies(rows: MappingRow[]) {
  const active = rows.filter((r) => r.status === "ACTIVE");
  const dupKeys = new Map<string, number>();
  for (const r of active) {
    const key = `${r.field_id}|${r.page_number}|${r.occurrence_index ?? 0}`;
    dupKeys.set(key, (dupKeys.get(key) ?? 0) + 1);
  }
  const duplicates = [...dupKeys.entries()].filter(([, n]) => n > 1);
  const outOfPage = active.filter(
    (r) =>
      r.page_width != null &&
      r.page_height != null &&
      (r.x < 0 ||
        r.y < 0 ||
        r.x > Number(r.page_width) ||
        r.y > Number(r.page_height) ||
        (r.width != null && r.x + Number(r.width) > Number(r.page_width) + 20) ||
        (r.height != null &&
          r.y + Number(r.height) > Number(r.page_height) + 20)),
  );
  const zeroSize = active.filter(
    (r) =>
      r.width == null ||
      r.height == null ||
      Number(r.width) <= 0 ||
      Number(r.height) <= 0,
  );
  const oddPageDims = active.filter(
    (r) =>
      (r.page_width != null && Math.abs(Number(r.page_width) - 612) > 1) ||
      (r.page_height != null && Math.abs(Number(r.page_height) - 792) > 1),
  );
  const clustered = active.filter(
    (r) => Number(r.x) < 5 && Number(r.y) < 5,
  );
  return {
    activeCount: active.length,
    inactiveCount: rows.filter((r) => r.status === "INACTIVE").length,
    duplicateFieldPageOccurrence: duplicates,
    outOfPageBounds: outOfPage.map((r) => ({
      id: r.id,
      key: r.fields?.field_key,
      page: r.page_number,
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      page_width: r.page_width,
      page_height: r.page_height,
    })),
    zeroSize: zeroSize.map((r) => ({
      id: r.id,
      key: r.fields?.field_key,
    })),
    oddPageDimsCount: oddPageDims.length,
    nearOriginCount: clustered.length,
    updateDateMin: active
      .map((r) => r.update_date)
      .sort()[0] ?? null,
    updateDateMax: active
      .map((r) => r.update_date)
      .sort()
      .at(-1) ?? null,
  };
}

async function dumpEnv(label: string, sb: SupabaseClient) {
  const form = await loadForm(sb);
  const mappings = await loadMappings(sb);
  const packet = await loadPacketPlacementOverrides(sb);
  const pdf = await loadPdfMeta(sb, form?.source_storage_path);
  const allFormFingerprints = await loadAllActiveMappingFingerprint(sb);
  return {
    label,
    form,
    mappingFingerprint: fingerprintMappings(mappings.filter((m) => m.status === "ACTIVE")),
    anomalies: summarizeAnomalies(mappings),
    pdf,
    packet,
    mappingCount: mappings.length,
    mappings,
    allFormFingerprints,
  };
}

function compareEnvs(dev: Awaited<ReturnType<typeof dumpEnv>>, prod: Awaited<ReturnType<typeof dumpEnv>>) {
  const byKey = (rows: MappingRow[]) => {
    const map = new Map<string, MappingRow>();
    for (const r of rows.filter((m) => m.status === "ACTIVE")) {
      const key = `${r.fields?.field_key ?? r.field_id}|p${r.page_number}|o${r.occurrence_index ?? 0}`;
      map.set(key, r);
    }
    return map;
  };
  const d = byKey(dev.mappings);
  const p = byKey(prod.mappings);
  const keys = new Set([...d.keys(), ...p.keys()]);
  const rows = [];
  for (const key of [...keys].sort()) {
    const left = d.get(key);
    const right = p.get(key);
    const sameCoords =
      left &&
      right &&
      Number(left.x) === Number(right.x) &&
      Number(left.y) === Number(right.y) &&
      Number(left.width ?? 0) === Number(right.width ?? 0) &&
      Number(left.height ?? 0) === Number(right.height ?? 0) &&
      left.page_number === right.page_number &&
      Number(left.page_width ?? 0) === Number(right.page_width ?? 0) &&
      Number(left.page_height ?? 0) === Number(right.page_height ?? 0);
    rows.push({
      key,
      field_key: left?.fields?.field_key ?? right?.fields?.field_key ?? null,
      field_label: left?.fields?.field_label ?? right?.fields?.field_label ?? null,
      field_id: left?.field_id ?? right?.field_id ?? null,
      mapping_id_dev: left?.id ?? null,
      mapping_id_prod: right?.id ?? null,
      page_dev: left?.page_number ?? null,
      page_prod: right?.page_number ?? null,
      coords_dev: left
        ? {
            x: left.x,
            y: left.y,
            w: left.width,
            h: left.height,
            page_width: left.page_width,
            page_height: left.page_height,
            update_date: left.update_date,
          }
        : null,
      coords_prod: right
        ? {
            x: right.x,
            y: right.y,
            w: right.width,
            h: right.height,
            page_width: right.page_width,
            page_height: right.page_height,
            update_date: right.update_date,
          }
        : null,
      sameCoords: Boolean(sameCoords),
      onlyIn: !left ? "prod" : !right ? "dev" : "both",
    });
  }
  const mismatched = rows.filter((r) => r.onlyIn === "both" && !r.sameCoords);
  const onlyDev = rows.filter((r) => r.onlyIn === "dev");
  const onlyProd = rows.filter((r) => r.onlyIn === "prod");
  return {
    totalKeys: rows.length,
    matching: rows.filter((r) => r.sameCoords).length,
    mismatchedCount: mismatched.length,
    onlyDevCount: onlyDev.length,
    onlyProdCount: onlyProd.length,
    mismatched: mismatched.slice(0, 50),
    onlyDev: onlyDev.slice(0, 50),
    onlyProd: onlyProd.slice(0, 50),
    allRows: rows,
  };
}

async function main() {
  const sourceUrl =
    process.env.SOURCE_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sourceKey =
    process.env.SOURCE_SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const targetUrl = requireEnv("TARGET_SUPABASE_URL");
  const targetKey = requireEnv("TARGET_SUPABASE_SECRET_KEY");
  if (!sourceUrl || !sourceKey) {
    throw new Error("Need SOURCE/dev Supabase URL and secret key");
  }
  assertRef(sourceUrl, DEV_REF, "development");
  assertRef(targetUrl, PROD_REF, "production");

  const dev = client(sourceUrl, sourceKey);
  const prod = client(targetUrl, targetKey);

  console.log("READ-ONLY forensic dump starting (no writes)...");
  const [devDump, prodDump] = await Promise.all([
    dumpEnv("development", dev),
    dumpEnv("production", prod),
  ]);
  const comparison = compareEnvs(devDump, prodDump);

  const outDir = join(process.cwd(), "_audit_tmp");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `form1-placement-forensic-${stamp}.json`);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY",
    formId: FORM_ID,
    development: {
      form: devDump.form,
      mappingFingerprint: devDump.mappingFingerprint,
      anomalies: devDump.anomalies,
      pdf: devDump.pdf,
      packet: {
        packetForms: devDump.packet.packetForms,
        overrideCount: devDump.packet.overrides.length,
        overrides: devDump.packet.overrides,
      },
      mappingCount: devDump.mappingCount,
      mappings: devDump.mappings,
      allFormFingerprints: devDump.allFormFingerprints,
    },
    production: {
      form: prodDump.form,
      mappingFingerprint: prodDump.mappingFingerprint,
      anomalies: prodDump.anomalies,
      pdf: prodDump.pdf,
      packet: {
        packetForms: prodDump.packet.packetForms,
        overrideCount: prodDump.packet.overrides.length,
        overrides: prodDump.packet.overrides,
      },
      mappingCount: prodDump.mappingCount,
      mappings: prodDump.mappings,
      allFormFingerprints: prodDump.allFormFingerprints,
    },
    comparison,
    pdfMatch:
      typeof devDump.pdf === "object" &&
      devDump.pdf &&
      "sha256" in devDump.pdf &&
      typeof prodDump.pdf === "object" &&
      prodDump.pdf &&
      "sha256" in prodDump.pdf
        ? (devDump.pdf as { sha256: string }).sha256 ===
          (prodDump.pdf as { sha256: string }).sha256
        : null,
    mappingFingerprintMatch:
      devDump.mappingFingerprint === prodDump.mappingFingerprint,
  };

  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        outPath,
        formDev: devDump.form,
        formProd: prodDump.form,
        mappingFingerprintDev: devDump.mappingFingerprint,
        mappingFingerprintProd: prodDump.mappingFingerprint,
        mappingFingerprintMatch: report.mappingFingerprintMatch,
        pdfMatch: report.pdfMatch,
        pdfDev: devDump.pdf,
        pdfProd: prodDump.pdf,
        anomaliesDev: devDump.anomalies,
        anomaliesProd: prodDump.anomalies,
        comparisonSummary: {
          totalKeys: comparison.totalKeys,
          matching: comparison.matching,
          mismatchedCount: comparison.mismatchedCount,
          onlyDevCount: comparison.onlyDevCount,
          onlyProdCount: comparison.onlyProdCount,
        },
        packetOverridesDev: devDump.packet.overrides.length,
        packetOverridesProd: prodDump.packet.overrides.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
