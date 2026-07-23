/**
 * Import approved production rows into harbaugh-forms-prod with scaffold reconciliation.
 *
 * Usage:
 *   npm run import:approved-production-data -- --dry-run
 *   npm run import:approved-production-data -- --execute --in exports/approved-production-data.json
 *
 * Requires SOURCE_* + TARGET_* (+ TARGET_DB_PASSWORD for sequence resets).
 * Never prints secrets or password hashes. Does not touch Auth.
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  APPROVED_COLLECTION_IDS,
  APPROVED_CONTACT_IDS,
  APPROVED_FORM_IDS,
  APPROVED_PACKET_IDS,
  EXCLUDED_COLLECTION_IDS,
  EXCLUDED_FORM_IDS,
  PROD_PROJECT_REF,
} from "../lib/selective-production/constants.ts";
import { loadManifest } from "../lib/selective-production/manifest.ts";
import {
  assertRowAllowed,
  getInsertionOrder,
  planSequenceResets,
  sequenceResetSql,
  type ImportRowResult,
} from "../lib/selective-production/public-data.ts";
import {
  planConflictingGlobalFieldSoftDeletes,
  planReconciliation,
  summarizeReconciliationPlan,
  type TargetSnapshots,
} from "../lib/selective-production/reconcile.ts";
import {
  assertDistinctProjects,
  assertProductionTargetRef,
  assertRequiredCredentials,
  parseArgs,
  redactSecrets,
  SelectiveMigrationSafetyError,
} from "../lib/selective-production/safety.ts";
import { runTargetSql } from "../lib/selective-production/target-db.ts";

const UPSERT_BATCH = 200;

/**
 * Tables whose `id` is GENERATED ALWAYS AS IDENTITY — PostgREST cannot insert
 * explicit IDs; use pooler SQL with OVERRIDING SYSTEM VALUE instead.
 */
const IDENTITY_ALWAYS_TABLES = new Set([
  "brokerage_settings",
  "buyer_rep_details",
  "collection_forms",
  "collections",
  "contacts",
  "forms",
  "packet_contacts",
  "packet_forms",
  "packets",
  "properties",
  "representation_agreement_clients",
  "representation_agreements",
]);

/** Primary key / onConflict column per table. */
const TABLE_CONFLICT_COLUMN: Record<string, string> = {
  user_agent_settings: "user_id",
  user_preferences: "user_id",
};

function conflictColumn(table: string): string {
  return TABLE_CONFLICT_COLUMN[table] || "id";
}

function rowPrimaryKey(table: string, row: Record<string, unknown>): string | number {
  const col = conflictColumn(table);
  return row[col] as string | number;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "object") {
    const json = JSON.stringify(value).replace(/\\/g, "\\\\").replace(/'/g, "''");
    return `'${json}'::jsonb`;
  }
  const s = String(value);
  let tag = "lit";
  while (s.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${s}$${tag}$`;
}

function buildIdentityUpsertSql(
  table: string,
  rows: Record<string, unknown>[],
): string {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const values = rows
    .map((row) => `(${columns.map((c) => sqlLiteral(row[c])).join(", ")})`)
    .join(",\n");
  const pk = conflictColumn(table);
  const updates = columns
    .filter((c) => c !== pk)
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");
  return `
INSERT INTO public."${table}" (${colList})
OVERRIDING SYSTEM VALUE
VALUES
${values}
ON CONFLICT ("${pk}") DO UPDATE SET
${updates};
`.trim();
}

function upsertIdentityBatch(table: string, rows: Record<string, unknown>[]): void {
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const sql = buildIdentityUpsertSql(table, chunk);
    try {
      runTargetSql(sql);
    } catch (e) {
      throw new SelectiveMigrationSafetyError(
        `Upsert ${table} (identity SQL) failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}

type ExportPayload = {
  meta?: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
};

type TableCounts = Record<
  string,
  { created: number; updated: number; removed: number }
>;

function emptyCounts(): TableCounts {
  return {};
}

function bump(
  counts: TableCounts,
  table: string,
  field: "created" | "updated" | "removed",
  n = 1,
) {
  if (!counts[table]) counts[table] = { created: 0, updated: 0, removed: 0 };
  counts[table][field] += n;
}

async function fetchAll(
  client: SupabaseClient,
  table: string,
  columns = "*",
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: Record<string, unknown>[] = [];
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) {
      throw new SelectiveMigrationSafetyError(`${table}: ${error.message}`);
    }
    rows.push(...((data as Record<string, unknown>[]) || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function upsertBatch(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (IDENTITY_ALWAYS_TABLES.has(table)) {
    upsertIdentityBatch(table, rows);
    return;
  }
  const onConflict = conflictColumn(table);
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (error) {
      throw new SelectiveMigrationSafetyError(
        `Upsert ${table} failed: ${error.message}`,
      );
    }
  }
}

async function softDeleteByIds(
  client: SupabaseClient,
  table: string,
  ids: Array<string | number>,
): Promise<number> {
  if (!ids.length) return 0;
  const batchSize = 100;
  let total = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const { error, count } = await client
      .from(table)
      .update({ status: "DELETED" }, { count: "exact" })
      .in("id", chunk)
      .neq("status", "DELETED");
    if (error) {
      throw new SelectiveMigrationSafetyError(
        `Soft-delete ${table} failed: ${error.message}`,
      );
    }
    total += count ?? chunk.length;
  }
  return total;
}

async function hardDeleteByIds(
  client: SupabaseClient,
  table: string,
  ids: Array<string | number>,
): Promise<number> {
  if (!ids.length) return 0;
  const batchSize = 100;
  let total = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const { error, count } = await client
      .from(table)
      .delete({ count: "exact" })
      .in("id", chunk);
    if (error) {
      throw new SelectiveMigrationSafetyError(
        `Delete ${table} failed: ${error.message}`,
      );
    }
    total += count ?? chunk.length;
  }
  return total;
}

async function loadTargetSnapshots(client: SupabaseClient): Promise<TargetSnapshots> {
  const [
    fieldDefaults,
    contacts,
    collections,
    packets,
    forms,
    representationAgreementClients,
    fields,
  ] = await Promise.all([
    fetchAll(client, "field_defaults", "id, status"),
    fetchAll(client, "contacts", "id"),
    fetchAll(client, "collections", "id, status"),
    fetchAll(client, "packets", "id, status"),
    fetchAll(client, "forms", "id, status"),
    fetchAll(client, "representation_agreement_clients", "id, contact_id"),
    fetchAll(client, "fields", "id, field_key, scope, status"),
  ]);

  return {
    fieldDefaults: fieldDefaults.map((r) => ({
      id: String(r.id),
      status: String(r.status ?? "ACTIVE"),
    })),
    contacts: contacts.map((r) => ({ id: Number(r.id) })),
    collections: collections.map((r) => ({
      id: Number(r.id),
      status: r.status == null ? undefined : String(r.status),
    })),
    packets: packets.map((r) => ({
      id: Number(r.id),
      status: r.status == null ? undefined : String(r.status),
    })),
    forms: forms.map((r) => ({
      id: Number(r.id),
      status: r.status == null ? undefined : String(r.status),
    })),
    representationAgreementClients: representationAgreementClients.map((r) => ({
      id: Number(r.id),
      contact_id: Number(r.contact_id),
    })),
    fields: fields.map((r) => ({
      id: String(r.id),
      field_key: String(r.field_key ?? ""),
      scope: r.scope == null ? undefined : String(r.scope),
      status: r.status == null ? undefined : String(r.status),
    })),
  };
}

async function softDeleteConflictingGlobalFields(
  client: SupabaseClient,
  incomingFields: Record<string, unknown>[],
  targetSnapshots: TargetSnapshots,
  counts: TableCounts,
): Promise<void> {
  const targetGlobal = (targetSnapshots.fields || [])
    .filter(
      (f) =>
        (f.status ?? "ACTIVE") === "ACTIVE" && (f.scope ?? "GLOBAL") === "GLOBAL",
    )
    .map((f) => ({ id: f.id, field_key: f.field_key }));

  const plan = planConflictingGlobalFieldSoftDeletes(
    incomingFields.map((r) => ({
      id: r.id as string | number,
      field_key: String(r.field_key ?? ""),
      scope: r.scope == null ? "GLOBAL" : String(r.scope),
    })),
    targetGlobal,
  );
  const ids = plan.map((p) => p.id);
  if (!ids.length) return;
  const n = await softDeleteByIds(client, "fields", ids);
  bump(counts, "fields", "removed", n);
}

async function runCleanup(
  client: SupabaseClient,
  manifest: ReturnType<typeof loadManifest>,
  counts: TableCounts,
): Promise<void> {
  const approvedDefaultIds = new Set(manifest.defaults.map((d) => String(d.id)));
  const approvedContacts = new Set(
    (APPROVED_CONTACT_IDS as readonly number[]).map(Number),
  );
  const approvedPackets = new Set(
    (APPROVED_PACKET_IDS as readonly number[]).map(Number),
  );

  // a. Soft-delete ACTIVE field_defaults not in approved set
  const defaults = await fetchAll(client, "field_defaults", "id, status");
  const staleDefaults = defaults
    .filter(
      (r) =>
        String(r.status) === "ACTIVE" && !approvedDefaultIds.has(String(r.id)),
    )
    .map((r) => r.id as string);
  if (staleDefaults.length) {
    bump(
      counts,
      "field_defaults",
      "removed",
      await softDeleteByIds(client, "field_defaults", staleDefaults),
    );
  }

  // b. Soft-delete excluded collections (4,7,9,12,14)
  const collections = await fetchAll(client, "collections", "id, status");
  const excludedColl = collections
    .filter((r) =>
      (EXCLUDED_COLLECTION_IDS as readonly number[]).includes(Number(r.id)),
    )
    .filter((r) => String(r.status) !== "DELETED")
    .map((r) => Number(r.id));
  if (excludedColl.length) {
    bump(
      counts,
      "collections",
      "removed",
      await softDeleteByIds(client, "collections", excludedColl),
    );
  }

  // c. Delete representation_agreement_clients pointing at contact 1
  const rac = await fetchAll(
    client,
    "representation_agreement_clients",
    "id, contact_id",
  );
  const racContact1 = rac
    .filter((r) => Number(r.contact_id) === 1)
    .map((r) => Number(r.id));
  if (racContact1.length) {
    bump(
      counts,
      "representation_agreement_clients",
      "removed",
      await hardDeleteByIds(client, "representation_agreement_clients", racContact1),
    );
  }

  // d. Delete contact 1 if present and not approved
  const contacts = await fetchAll(client, "contacts", "id");
  const removeContacts = contacts
    .map((r) => Number(r.id))
    .filter((id) => !approvedContacts.has(id));
  if (removeContacts.length) {
    bump(
      counts,
      "contacts",
      "removed",
      await hardDeleteByIds(client, "contacts", removeContacts),
    );
  }

  // e. Ensure no packets other than 2,5
  const packets = await fetchAll(client, "packets", "id");
  const extraPackets = packets
    .map((r) => Number(r.id))
    .filter((id) => !approvedPackets.has(id));
  if (extraPackets.length) {
    bump(
      counts,
      "packets",
      "removed",
      await hardDeleteByIds(client, "packets", extraPackets),
    );
  }

  // f. Soft-delete forms 21-23 if present
  const forms = await fetchAll(client, "forms", "id, status");
  const excludedForms = forms
    .filter((r) =>
      (EXCLUDED_FORM_IDS as readonly number[]).includes(Number(r.id)),
    )
    .filter((r) => String(r.status) !== "DELETED")
    .map((r) => Number(r.id));
  if (excludedForms.length) {
    bump(
      counts,
      "forms",
      "removed",
      await softDeleteByIds(client, "forms", excludedForms),
    );
  }
}

function applySequenceResets(maxIds: Record<string, number>): string[] {
  const resets = planSequenceResets(maxIds);
  const applied: string[] = [];
  if (!resets.length) return applied;
  // Prefer a single DO block so supabase db query accepts multi-setval.
  const sql = `do $seq$ begin\n${resets
    .map(
      (r) =>
        `  perform setval('${r.sequence}', greatest(${r.setTo}, 1), true);`,
    )
    .join("\n")}\nend $seq$;`;
  runTargetSql(sql);
  for (const r of resets) {
    applied.push(`${r.table}:${r.sequence}=${r.setTo}`);
  }
  return applied;
}

async function executeImport(
  payload: ExportPayload,
  manifest: ReturnType<typeof loadManifest>,
  targetUrl: string,
  targetKey: string,
): Promise<void> {
  const client = createClient(targetUrl, targetKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results: ImportRowResult[] = [];
  const maxIds: Record<string, number> = {};
  const counts = emptyCounts();

  // Validate all rows first
  for (const table of getInsertionOrder()) {
    const rows = payload.tables?.[table] || [];
    for (const row of rows) {
      assertRowAllowed(table, row, manifest);
      const id = rowPrimaryKey(table, row);
      if (typeof id === "number") {
        maxIds[table] = Math.max(maxIds[table] || 0, id);
      }
      results.push({ table, id: id ?? "?", action: "create" });
    }
  }

  const targetSnapshots = await loadTargetSnapshots(client);
  const plan = planReconciliation(payload.tables || {}, targetSnapshots, manifest);
  const planSummary = summarizeReconciliationPlan(plan);

  // Pre-classify created vs updated from target id sets
  const existingByTable: Record<string, Set<string>> = {
    field_defaults: new Set(targetSnapshots.fieldDefaults.map((d) => String(d.id))),
    contacts: new Set(targetSnapshots.contacts.map((c) => String(c.id))),
    collections: new Set(targetSnapshots.collections.map((c) => String(c.id))),
    packets: new Set((targetSnapshots.packets || []).map((p) => String(p.id))),
    forms: new Set((targetSnapshots.forms || []).map((f) => String(f.id))),
    fields: new Set((targetSnapshots.fields || []).map((f) => String(f.id))),
  };

  // Soft-delete conflicting ACTIVE GLOBAL field_keys before fields upsert
  await softDeleteConflictingGlobalFields(
    client,
    payload.tables.fields || [],
    targetSnapshots,
    counts,
  );

  // Soft-delete conflicting ACTIVE field_resolvers by resolver_key
  {
    const incoming = payload.tables.field_resolvers || [];
    if (incoming.length) {
      const incomingIds = new Set(incoming.map((r) => String(r.id)));
      const incomingKeys = new Set(
        incoming.map((r) => String(r.resolver_key ?? "").trim().toLowerCase()),
      );
      const targetResolvers = await fetchAll(
        client,
        "field_resolvers",
        "id, resolver_key, status",
      );
      const conflictIds = targetResolvers
        .filter(
          (r) =>
            String(r.status) === "ACTIVE" &&
            incomingKeys.has(String(r.resolver_key ?? "").trim().toLowerCase()) &&
            !incomingIds.has(String(r.id)),
        )
        .map((r) => r.id as string);
      if (conflictIds.length) {
        bump(
          counts,
          "field_resolvers",
          "removed",
          await softDeleteByIds(client, "field_resolvers", conflictIds),
        );
      }
    }
  }

  // Soft-delete non-approved ACTIVE defaults before upsert (unique ACTIVE indexes).
  // Post-upsert cleanup repeats this idempotently.
  {
    const approvedDefaultIds = new Set(manifest.defaults.map((d) => String(d.id)));
    const stale = targetSnapshots.fieldDefaults
      .filter((d) => d.status === "ACTIVE" && !approvedDefaultIds.has(String(d.id)))
      .map((d) => d.id);
    if (stale.length) {
      bump(
        counts,
        "field_defaults",
        "removed",
        await softDeleteByIds(client, "field_defaults", stale),
      );
    }
  }

  for (const table of getInsertionOrder()) {
    const rows = payload.tables?.[table] || [];
    if (!rows.length) continue;

    const existing = existingByTable[table] || new Set();
    for (const row of rows) {
      const id = String(rowPrimaryKey(table, row));
      if (existing.has(id)) bump(counts, table, "updated");
      else bump(counts, table, "created");
    }

    console.error(`Importing ${table} (${rows.length} rows)...`);
    if (table === "buyer_rep_details") {
      // Unique ACTIVE row per agreement — retire scaffold rows with other IDs first.
      const agreementIds = [
        ...new Set(
          rows
            .map((r) => Number(r.representation_agreement_id))
            .filter((n) => Number.isFinite(n)),
        ),
      ];
      const keepIds = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
      if (agreementIds.length && keepIds.length) {
        runTargetSql(`
UPDATE public.buyer_rep_details
SET status = 'DELETED', update_date = now()
WHERE status = 'ACTIVE'
  AND representation_agreement_id = ANY(ARRAY[${agreementIds.join(",")}]::bigint[])
  AND id <> ALL(ARRAY[${keepIds.join(",")}]::bigint[]);
`);
      }
    }
    await upsertBatch(client, table, rows);
  }

  await runCleanup(client, manifest, counts);

  let sequenceResets: string[] = [];
  try {
    sequenceResets = applySequenceResets(maxIds);
  } catch (e) {
    throw new SelectiveMigrationSafetyError(
      `Sequence reset failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  console.log(
    JSON.stringify(
      redactSecrets({
        mode: "execute",
        targetRef: PROD_PROJECT_REF,
        planned: planSummary,
        perTable: counts,
        sequenceResets,
        validatedRows: results.length,
      }),
      null,
      2,
    ),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifestPath);
  const inIdx = process.argv.indexOf("--in");
  const inPath =
    inIdx >= 0 && process.argv[inIdx + 1]
      ? process.argv[inIdx + 1]
      : "exports/approved-production-data.json";

  const sourceUrl = process.env.SOURCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sourceKey =
    process.env.SOURCE_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetUrl = process.env.TARGET_SUPABASE_URL;
  const targetKey = process.env.TARGET_SUPABASE_SECRET_KEY;

  assertRequiredCredentials({
    sourceUrl,
    sourceKey,
    targetUrl,
    targetKey,
    requireTarget: true,
  });
  const refs = assertDistinctProjects({
    sourceUrl: sourceUrl!,
    targetUrl: targetUrl!,
    allowDevAsSource: true,
  });
  assertProductionTargetRef(refs.targetRef);

  let payload: ExportPayload;
  try {
    payload = JSON.parse(readFileSync(inPath, "utf8")) as ExportPayload;
  } catch {
    throw new SelectiveMigrationSafetyError(
      `Export file not found: ${inPath}. Run export:approved-production-data --execute first.`,
    );
  }
  if (!payload.tables || typeof payload.tables !== "object") {
    throw new SelectiveMigrationSafetyError("Export JSON missing tables object.");
  }

  // Validate every export row against the manifest before dry-run or execute.
  const exportRowCounts: Record<string, number> = {};
  for (const table of getInsertionOrder()) {
    const rows = payload.tables?.[table] || [];
    exportRowCounts[table] = rows.length;
    for (const row of rows) {
      assertRowAllowed(table, row, manifest);
    }
  }

  const client = createClient(targetUrl!, targetKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const targetSnapshots = await loadTargetSnapshots(client);
  const plan = planReconciliation(payload.tables || {}, targetSnapshots, manifest);
  const planSummary = summarizeReconciliationPlan(plan);

  const proofs = {
    noNewAuthUser: true,
    noOwnershipRemap: true,
    noExcludedFormImport: !(payload.tables.forms || []).some((r) =>
      (EXCLUDED_FORM_IDS as readonly number[]).includes(Number(r.id)),
    ),
    noExcludedCollectionImport: !(payload.tables.collections || []).some((r) =>
      (EXCLUDED_COLLECTION_IDS as readonly number[]).includes(Number(r.id)),
    ),
    noExcludedPacketImport: !(payload.tables.packets || []).some(
      (r) => !(APPROVED_PACKET_IDS as readonly number[]).includes(Number(r.id)),
    ),
    contactsExact: (payload.tables.contacts || [])
      .map((r) => Number(r.id))
      .sort((a, b) => a - b)
      .join(",") === [...APPROVED_CONTACT_IDS].join(","),
    formsExact: (payload.tables.forms || [])
      .map((r) => Number(r.id))
      .sort((a, b) => a - b)
      .join(",") ===
      [...APPROVED_FORM_IDS].join(","),
    collectionsExact: (payload.tables.collections || [])
      .map((r) => Number(r.id))
      .sort((a, b) => a - b)
      .join(",") === [...APPROVED_COLLECTION_IDS].join(","),
    packetsExact: (payload.tables.packets || [])
      .map((r) => Number(r.id))
      .sort((a, b) => a - b)
      .join(",") === [...APPROVED_PACKET_IDS].join(","),
    approvedDefaultsInExport: (payload.tables.field_defaults || []).length,
    expectedActiveDefaults: manifest.defaults.length,
  };

  if (args.dryRun && !args.execute) {
    console.log(
      JSON.stringify(
        redactSecrets({
          mode: "dry-run",
          targetRef: refs.targetRef,
          sourceRef: refs.sourceRef,
          manifestChecksum: manifest.meta.checksum,
          exportRowCounts,
          planned: planSummary,
          proofs,
          scaffoldCleanup: {
            removeContactScaffold: plan.removes.filter((r) => r.table === "contacts"),
            removeExcludedCollections: plan.removes.filter(
              (r) => r.table === "collections",
            ),
            retireUnapprovedDefaults: plan.removes.filter(
              (r) => r.table === "field_defaults",
            ).length,
            fieldKeyConflicts: plan.removes.filter((r) => r.table === "fields").length,
          },
          sequenceResetExample: sequenceResetSql({
            table: "packets",
            sequence: "public.generated_packets_id_seq",
            setTo: 5,
          }),
          note: "No rows written in dry-run",
        }),
        null,
        2,
      ),
    );
    const proofFailed: string[] = [];
    for (const [k, v] of Object.entries(proofs)) {
      if (k === "approvedDefaultsInExport" || k === "expectedActiveDefaults") {
        continue;
      }
      if (v === false) proofFailed.push(k);
    }
    if (proofs.approvedDefaultsInExport !== proofs.expectedActiveDefaults) {
      proofFailed.push(
        `defaultsCountMismatch(${proofs.approvedDefaultsInExport}!=${proofs.expectedActiveDefaults})`,
      );
    }
    if (proofFailed.length) {
      throw new SelectiveMigrationSafetyError(
        `Dry-run proofs failed: ${proofFailed.join(", ")}`,
      );
    }
    return;
  }

  await executeImport(payload, manifest, targetUrl!, targetKey!);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
