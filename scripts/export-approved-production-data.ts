/**
 * Export approved production rows from the source project using the manifest.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types scripts/export-approved-production-data.ts --dry-run
 *   node --env-file=.env.local --experimental-strip-types scripts/export-approved-production-data.ts --execute --out exports/approved.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadManifest } from "../lib/selective-production/manifest.ts";
import {
  filterRowsForTable,
  getInsertionOrder,
} from "../lib/selective-production/public-data.ts";
import {
  assertRequiredCredentials,
  parseArgs,
  redactSecrets,
  SelectiveMigrationSafetyError,
} from "../lib/selective-production/safety.ts";

async function fetchAll(
  client: ReturnType<typeof createClient>,
  table: string,
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: Record<string, unknown>[] = [];
  for (;;) {
    const { data, error } = await client.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new SelectiveMigrationSafetyError(`${table}: ${error.message}`);
    rows.push(...((data as Record<string, unknown>[]) || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifestPath);
  const outIdx = process.argv.indexOf("--out");
  const outPath =
    outIdx >= 0 && process.argv[outIdx + 1]
      ? process.argv[outIdx + 1]
      : "exports/approved-production-data.json";

  const sourceUrl = process.env.SOURCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sourceKey =
    process.env.SOURCE_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  assertRequiredCredentials({
    sourceUrl,
    sourceKey,
    requireTarget: false,
  });

  if (args.dryRun && !args.execute) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          tables: getInsertionOrder(),
          manifestChecksum: manifest.meta.checksum,
          counts: manifest.meta.counts,
        },
        null,
        2,
      ),
    );
    return;
  }

  const client = createClient(sourceUrl!, sourceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const payload: Record<string, unknown> = {
    meta: {
      exportedAt: new Date().toISOString(),
      manifestChecksum: manifest.meta.checksum,
      dryRun: false,
    },
    tables: {} as Record<string, Record<string, unknown>[]>,
  };

  for (const table of getInsertionOrder()) {
    // Skip auth — handled by migrate-approved-auth
    if (table.startsWith("auth.")) continue;
    try {
      const raw = await fetchAll(client, table);
      const filtered = filterRowsForTable(table, raw, manifest);
      (payload.tables as Record<string, unknown[]>)[table] = filtered;
    } catch (e) {
      // Some catalog tables may be empty or unavailable; record and continue for dry tooling
      if (e instanceof SelectiveMigrationSafetyError) throw e;
      (payload.tables as Record<string, unknown[]>)[table] = [];
      console.warn(`skip/empty ${table}:`, e instanceof Error ? e.message : e);
    }
  }

  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(
    JSON.stringify(
      redactSecrets({
        wrote: outPath,
        tableCounts: Object.fromEntries(
          Object.entries(payload.tables as Record<string, unknown[]>).map(([k, v]) => [
            k,
            v.length,
          ]),
        ),
      }),
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
