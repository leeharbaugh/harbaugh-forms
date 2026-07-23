/**
 * Import approved production rows into a distinct target project.
 *
 * Usage:
 *   SOURCE_... TARGET_... node --experimental-strip-types scripts/import-approved-production-data.ts --dry-run
 *   ... --execute --in exports/approved-production-data.json
 *
 * Refuses source/target equality and development as target.
 * Aborts if production target does not exist yet when --execute is set without valid target.
 */

import { readFileSync } from "node:fs";
import { loadManifest } from "../lib/selective-production/manifest.ts";
import {
  assertRowAllowed,
  getInsertionOrder,
  planSequenceResets,
  sequenceResetSql,
  summarizeImportResults,
  type ImportRowResult,
} from "../lib/selective-production/public-data.ts";
import {
  assertDistinctProjects,
  assertRequiredCredentials,
  parseArgs,
  redactSecrets,
  SelectiveMigrationSafetyError,
} from "../lib/selective-production/safety.ts";

function main() {
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

  if (args.dryRun && !args.execute) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          insertionOrder: getInsertionOrder(),
          sequenceResetExample: sequenceResetSql({
            table: "packets",
            sequence: "public.generated_packets_id_seq",
            setTo: 5,
          }),
          manifestChecksum: manifest.meta.checksum,
          note: "No rows written in dry-run",
        },
        null,
        2,
      ),
    );
    return;
  }

  assertRequiredCredentials({
    sourceUrl,
    sourceKey,
    targetUrl,
    targetKey,
    requireTarget: true,
  });
  assertDistinctProjects({
    sourceUrl: sourceUrl!,
    targetUrl: targetUrl!,
    allowDevAsSource: true,
  });

  // Execute path: load export and validate each row against manifest rules
  let payload: { tables: Record<string, Record<string, unknown>[]> };
  try {
    payload = JSON.parse(readFileSync(inPath, "utf8"));
  } catch {
    throw new SelectiveMigrationSafetyError(
      `Export file not found: ${inPath}. Run export first; production import is gated until target exists.`,
    );
  }

  const results: ImportRowResult[] = [];
  const maxIds: Record<string, number> = {};

  for (const table of getInsertionOrder()) {
    const rows = payload.tables?.[table] || [];
    for (const row of rows) {
      try {
        assertRowAllowed(table, row, manifest);
        const id = row.id as string | number;
        if (typeof id === "number") {
          maxIds[table] = Math.max(maxIds[table] || 0, id);
        }
        results.push({ table, id, action: "create", reason: "planned" });
      } catch (e) {
        results.push({
          table,
          id: (row.id as string | number) ?? "?",
          action: "fail",
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const failed = results.filter((r) => r.action === "fail");
  if (failed.length) {
    throw new SelectiveMigrationSafetyError(
      `Import aborted: ${failed.length} row(s) failed validation. ${failed[0]?.reason}`,
    );
  }

  // Refuse actual write — production project does not exist in this preparation phase
  throw new SelectiveMigrationSafetyError(
    "Execute mode validated export against manifest, but production target write is not enabled in this preparation task. " +
      `Planned creates=${summarizeImportResults(results).created}; sequenceResets=${planSequenceResets(maxIds).length}.`,
  );
}

try {
  main();
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  // Dry-run success path already returned; execute gated refusal is expected
  if (msg.includes("production target write is not enabled")) {
    console.log(JSON.stringify(redactSecrets({ status: "gated", message: msg }), null, 2));
    process.exit(0);
  }
  console.error(msg);
  process.exit(1);
}
