/**
 * Copy allowlisted storage objects from source → target.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types scripts/copy-approved-storage.ts --dry-run
 *
 * Never performs bucket-wide copies. Excludes forms 21/22/23 PDFs.
 */

import { loadManifest } from "../lib/selective-production/manifest.ts";
import {
  buildStorageAllowlist,
  isExcludedStoragePath,
  storageCopyPlan,
} from "../lib/selective-production/storage-copy.ts";
import {
  assertDistinctProjects,
  assertRequiredCredentials,
  parseArgs,
  SelectiveMigrationSafetyError,
} from "../lib/selective-production/safety.ts";

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifestPath);
  const allowlist = buildStorageAllowlist(manifest);
  const plan = storageCopyPlan(allowlist);

  // Sanity: no excluded paths on allowlist
  for (const entry of allowlist) {
    if (isExcludedStoragePath(entry.path)) {
      throw new SelectiveMigrationSafetyError(
        `Allowlist contains excluded path: ${entry.path}`,
      );
    }
  }

  if (args.dryRun && !args.execute) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          plan,
          allowlistCount: allowlist.length,
          sample: allowlist.slice(0, 3).map((e) => ({
            bucket: e.bucket,
            path: e.path,
            checksum: e.checksum,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

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
  assertDistinctProjects({
    sourceUrl: sourceUrl!,
    targetUrl: targetUrl!,
    allowDevAsSource: true,
  });

  throw new SelectiveMigrationSafetyError(
    "Storage copy execute mode is gated until production exists. Use --dry-run.",
  );
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
