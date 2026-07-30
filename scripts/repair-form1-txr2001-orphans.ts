/**
 * Audited PRODUCTION repair: soft-delete Form #1 ACTIVE mappings that are
 * orphaned TXR-2001 (Residential Lease) placements attached to Buyer Rep.
 *
 * READ-ONLY by default. Mutates only when:
 *   --confirm SOFT_DELETE_FORM1_TXR2001_ORPHANS
 *
 * Scope:
 *   - form_id = 1
 *   - status = ACTIVE
 *   - fields.field_key ILIKE 'txr_2001_%'
 * Does NOT touch form 18, genuine TXR-1501 mappings, packets, or other forms.
 *
 * Run:
 *   npx --yes node --experimental-strip-types --env-file=.env.local --env-file=.env.ops.production scripts/repair-form1-txr2001-orphans.ts
 *   npx --yes node --experimental-strip-types --env-file=.env.local --env-file=.env.ops.production scripts/repair-form1-txr2001-orphans.ts --confirm SOFT_DELETE_FORM1_TXR2001_ORPHANS
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PROD_REF = "eetonalyyyssvkyfdoxh";
const CONFIRM = "SOFT_DELETE_FORM1_TXR2001_ORPHANS";
const FORM_ID = 1;

type FieldRef = {
  id?: number;
  field_key: string | null;
  field_label?: string | null;
  status?: string | null;
};

type MappingRow = {
  id: string;
  form_id: number;
  field_id: number;
  mapping_name?: string | null;
  occurrence_index?: number | null;
  page_number: number;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  page_width?: number | null;
  page_height?: number | null;
  font_size?: number | null;
  alignment?: string | null;
  field_widget_type?: string | null;
  pdf_field_name?: string | null;
  status: string;
  create_date?: string | null;
  update_date?: string | null;
  fields: FieldRef | FieldRef[] | null;
};

type OrphanRow = {
  id: string;
  field_id: number;
  page_number: number;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  status: string;
  fields: FieldRef | FieldRef[] | null;
};

function fieldKeyOf(fields: MappingRow["fields"] | OrphanRow["fields"]): string {
  if (!fields) return "";
  const ref = Array.isArray(fields) ? fields[0] : fields;
  return String(ref?.field_key ?? "");
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parseArgs(argv: string[]) {
  const confirmIdx = argv.indexOf("--confirm");
  const token = confirmIdx >= 0 ? argv[confirmIdx + 1] : null;
  return { apply: token === CONFIRM, token };
}

async function fingerprintNonForm1(sb: ReturnType<typeof createClient>) {
  const rows: Array<Record<string, unknown>> = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("form_field_mappings")
      .select(
        "id, form_id, field_id, occurrence_index, page_number, x, y, width, height, status",
      )
      .eq("status", "ACTIVE")
      .neq("form_id", FORM_ID)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const digest = createHash("sha256")
    .update(
      rows
        .map((r) =>
          [
            r.id,
            r.form_id,
            r.field_id,
            r.occurrence_index ?? 0,
            r.page_number,
            Number(r.x).toFixed(4),
            Number(r.y).toFixed(4),
            r.width ?? "",
            r.height ?? "",
            r.status,
          ].join("|"),
        )
        .join("\n"),
    )
    .digest("hex");
  return { count: rows.length, sha256: digest };
}

async function loadForm1Backup(sb: ReturnType<typeof createClient>) {
  const { data: form, error: formError } = await sb
    .from("forms")
    .select(
      "id, form_code, form_name, version_label, scope, status, publication_state, source_storage_path, update_date",
    )
    .eq("id", FORM_ID)
    .single();
  if (formError) throw new Error(formError.message);

  const { data: mappings, error } = await sb
    .from("form_field_mappings")
    .select(
      "id, form_id, field_id, mapping_name, occurrence_index, page_number, x, y, width, height, page_width, page_height, font_size, alignment, field_widget_type, pdf_field_name, status, create_date, update_date, fields(id, field_key, field_label, status)",
    )
    .eq("form_id", FORM_ID)
    .order("page_number")
    .order("y");
  if (error) throw new Error(error.message);
  return { form, mappings: (mappings ?? []) as MappingRow[] };
}

async function loadOrphans(sb: ReturnType<typeof createClient>) {
  const { data, error } = await sb
    .from("form_field_mappings")
    .select("id, field_id, page_number, x, y, width, height, status, fields!inner(field_key, status)")
    .eq("form_id", FORM_ID)
    .eq("status", "ACTIVE")
    .ilike("fields.field_key", "txr_2001_%");
  if (error) throw new Error(error.message);
  return (data ?? []) as OrphanRow[];
}

async function main() {
  const { apply } = parseArgs(process.argv.slice(2));
  const url = requireEnv("TARGET_SUPABASE_URL");
  const key = requireEnv("TARGET_SUPABASE_SECRET_KEY");
  if (!url.includes(PROD_REF)) {
    throw new Error(`Refusing: TARGET must be production ${PROD_REF}`);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(process.cwd(), "_audit_tmp");
  await mkdir(outDir, { recursive: true });

  const beforeNonForm1 = await fingerprintNonForm1(sb);
  const backup = await loadForm1Backup(sb);
  const orphans = await loadOrphans(sb);
  const genuineActive = backup.mappings.filter(
    (m) =>
      m.status === "ACTIVE" &&
      !fieldKeyOf(m.fields).toLowerCase().startsWith("txr_2001_"),
  );
  const activeBefore = backup.mappings.filter((m) => m.status === "ACTIVE").length;

  const backupPath = join(outDir, `form1-placement-backup-${stamp}.json`);
  await writeFile(
    backupPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        environment: "production",
        projectRef: PROD_REF,
        form: backup.form,
        mappingCount: backup.mappings.length,
        activeCount: activeBefore,
        orphanCount: orphans.length,
        genuineBuyerRepActiveCount: genuineActive.length,
        beforeNonForm1Fingerprint: beforeNonForm1,
        mappings: backup.mappings,
        orphanIds: orphans.map((o) => o.id),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLY" : "DRY_RUN",
        backupPath,
        form: backup.form,
        activeBefore,
        orphanCount: orphans.length,
        genuineBuyerRepActiveCount: genuineActive.length,
        beforeNonForm1Fingerprint: beforeNonForm1,
      },
      null,
      2,
    ),
  );

  if (orphans.length !== 142) {
    throw new Error(
      `Expected exactly 142 orphan ACTIVE txr_2001 mappings on form 1; found ${orphans.length}. Aborting.`,
    );
  }
  if (genuineActive.length !== 55) {
    throw new Error(
      `Expected exactly 55 genuine ACTIVE Buyer Rep mappings; found ${genuineActive.length}. Aborting.`,
    );
  }

  if (!apply) {
    console.log(
      `DRY RUN only. Re-run with --confirm ${CONFIRM} to soft-delete ${orphans.length} orphan mappings.`,
    );
    return;
  }

  const ids = orphans.map((o) => o.id);
  const { data: updated, error: updateError } = await sb
    .from("form_field_mappings")
    .update({ status: "DELETED" })
    .eq("form_id", FORM_ID)
    .eq("status", "ACTIVE")
    .in("id", ids)
    .select("id");

  if (updateError) {
    throw new Error(`Update failed: ${updateError.message}`);
  }

  const updatedCount = updated?.length ?? 0;
  if (updatedCount !== 142) {
    throw new Error(
      `Expected 142 soft-deletes; updated ${updatedCount}. Inspect immediately.`,
    );
  }

  const afterBackup = await loadForm1Backup(sb);
  const afterOrphans = await loadOrphans(sb);
  const afterNonForm1 = await fingerprintNonForm1(sb);
  const afterActive = afterBackup.mappings.filter((m) => m.status === "ACTIVE");
  const afterGenuine = afterActive.filter(
    (m) => !fieldKeyOf(m.fields).toLowerCase().startsWith("txr_2001_"),
  );

  const resultPath = join(outDir, `form1-repair-result-${stamp}.json`);
  const result = {
    generatedAt: new Date().toISOString(),
    applied: true,
    backupPath,
    updatedCount,
    updatedIds: updated?.map((r) => r.id) ?? [],
    after: {
      activeCount: afterActive.length,
      orphanRemaining: afterOrphans.length,
      genuineBuyerRepActiveCount: afterGenuine.length,
      nonForm1Fingerprint: afterNonForm1,
      nonForm1FingerprintUnchanged:
        afterNonForm1.sha256 === beforeNonForm1.sha256 &&
        afterNonForm1.count === beforeNonForm1.count,
      fieldInstanceCountProbe: (
        await sb.from("field_instances").select("id", { count: "exact", head: true })
      ).count,
    },
  };
  await writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({ resultPath, ...result }, null, 2));

  if (afterOrphans.length !== 0) {
    throw new Error("Orphans remain after repair");
  }
  if (afterActive.length !== 55) {
    throw new Error(`Expected 55 ACTIVE mappings after repair; got ${afterActive.length}`);
  }
  if (!result.after.nonForm1FingerprintUnchanged) {
    throw new Error("Non-Form-1 fingerprint changed — unexpected side effect");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
