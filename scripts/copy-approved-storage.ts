/**
 * Copy allowlisted storage objects from source → target.
 *
 * Usage:
 *   npm run copy:approved-storage -- --dry-run
 *   npm run copy:approved-storage -- --execute
 *
 * Never performs bucket-wide copies. Excludes forms 21/22/23 PDFs.
 * Never prints secrets, signed URLs, or connection strings.
 */

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  EXCLUDED_FORM_PDF_PATH_MARKERS,
  FORM_TEMPLATES_BUCKET,
  GENERATED_DOCUMENTS_BUCKET,
  YAHOO_AUTH_UUID,
} from "../lib/selective-production/constants.ts";
import { loadManifest } from "../lib/selective-production/manifest.ts";
import {
  assertAllowlistExactShape,
  assertStoragePathAllowed,
  buildStorageAllowlist,
  EXPECTED_FORM_TEMPLATE_COUNT,
  EXPECTED_GENERATED_DOCUMENT_COUNT,
  EXPECTED_STORAGE_OBJECT_COUNT,
  normalizeStorageChecksum,
  parseStorageSize,
  planStorageCopy,
  storageCopyPlan,
  type StorageAllowlistEntry,
  type StorageObjectMeta,
} from "../lib/selective-production/storage-copy.ts";
import {
  assertDistinctProjects,
  assertProductionTargetRef,
  assertRequiredCredentials,
  parseArgs,
  SelectiveMigrationSafetyError,
} from "../lib/selective-production/safety.ts";
import {
  buildSourcePoolerDbUrl,
  runSourceSqlJson,
  runTargetSqlJson,
} from "../lib/selective-production/target-db.ts";

type ServiceClient = SupabaseClient;

function md5Hex(bytes: ArrayBuffer | Uint8Array): string {
  const buf = Buffer.from(bytes instanceof ArrayBuffer ? bytes : bytes);
  return createHash("md5").update(buf).digest("hex");
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function storageObjectMetaSql(
  entries: StorageAllowlistEntry[],
): string {
  if (entries.length === 0) {
    return `select null::text as name, null::text as bucket_id, null::text as size, null::text as etag, null::text as mime where false`;
  }
  const predicates = entries
    .map(
      (e) =>
        `(bucket_id = ${sqlLiteral(e.bucket)} and name = ${sqlLiteral(e.path)})`,
    )
    .join("\n    or ");
  return `
select
  name,
  bucket_id,
  metadata->>'size' as size,
  metadata->>'eTag' as etag,
  metadata->>'mimetype' as mime
from storage.objects
where ${predicates}
`.trim();
}

function rowsToObjectMeta(
  rows: Record<string, unknown>[],
): StorageObjectMeta[] {
  return rows
    .filter((r) => r.name != null && r.bucket_id != null)
    .map((r) => ({
      bucket: String(r.bucket_id),
      path: String(r.name),
      size: parseStorageSize(r.size),
      checksum: normalizeStorageChecksum(
        r.etag == null ? null : String(r.etag),
      ),
    }));
}

async function downloadBytes(
  client: ServiceClient,
  bucket: string,
  path: string,
): Promise<{ bytes: ArrayBuffer; contentType: string | null }> {
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) {
    throw new SelectiveMigrationSafetyError(
      `Download failed for ${bucket}/${path}: ${error?.message || "missing data"}`,
    );
  }
  const bytes = await data.arrayBuffer();
  return { bytes, contentType: data.type || null };
}

async function verifyObjectAgainstManifest(
  client: ServiceClient,
  entry: StorageAllowlistEntry,
  label: string,
): Promise<{ size: number; checksum: string; contentType: string | null }> {
  assertStoragePathAllowed(entry.bucket, entry.path, [entry]);
  const { bytes, contentType } = await downloadBytes(
    client,
    entry.bucket,
    entry.path,
  );
  const size = bytes.byteLength;
  const checksum = md5Hex(bytes);
  const expectedSize = parseStorageSize(entry.size);
  const expectedChecksum = normalizeStorageChecksum(entry.checksum);

  if (expectedSize != null && size !== expectedSize) {
    throw new SelectiveMigrationSafetyError(
      `${label} size mismatch for ${entry.bucket}/${entry.path}: expected ${expectedSize} got ${size}`,
    );
  }
  if (!expectedChecksum) {
    throw new SelectiveMigrationSafetyError(
      `Manifest missing checksum for ${entry.bucket}/${entry.path}`,
    );
  }
  if (checksum !== expectedChecksum) {
    throw new SelectiveMigrationSafetyError(
      `${label} checksum mismatch for ${entry.bucket}/${entry.path}: expected ${expectedChecksum} got ${checksum}`,
    );
  }
  return { size, checksum, contentType };
}

function fetchObjectMetaViaSql(
  kind: "source" | "target",
  entries: StorageAllowlistEntry[],
): StorageObjectMeta[] | null {
  if (kind === "source") {
    if (!process.env.SOURCE_DB_PASSWORD?.trim()) return null;
    // Touch builder so missing URL fails clearly when password is set
    buildSourcePoolerDbUrl();
    return rowsToObjectMeta(runSourceSqlJson(storageObjectMetaSql(entries)));
  }
  if (!process.env.TARGET_DB_PASSWORD?.trim()) return null;
  return rowsToObjectMeta(runTargetSqlJson(storageObjectMetaSql(entries)));
}

async function fetchTargetMetaViaDownload(
  client: ServiceClient,
  entries: StorageAllowlistEntry[],
): Promise<StorageObjectMeta[]> {
  const out: StorageObjectMeta[] = [];
  for (const entry of entries) {
    const { data, error } = await client.storage
      .from(entry.bucket)
      .download(entry.path);
    if (error || !data) continue;
    const bytes = await data.arrayBuffer();
    out.push({
      bucket: entry.bucket,
      path: entry.path,
      size: bytes.byteLength,
      checksum: md5Hex(bytes),
    });
  }
  return out;
}

async function resolveTargetObjects(
  target: ServiceClient,
  allowlist: StorageAllowlistEntry[],
): Promise<{ objects: StorageObjectMeta[]; via: "sql" | "download" }> {
  const viaSql = fetchObjectMetaViaSql("target", allowlist);
  if (viaSql) return { objects: viaSql, via: "sql" };
  return {
    objects: await fetchTargetMetaViaDownload(target, allowlist),
    via: "download",
  };
}

async function resolveSourceVerified(
  source: ServiceClient,
  allowlist: StorageAllowlistEntry[],
): Promise<{
  objects: StorageObjectMeta[];
  via: "sql+download" | "download";
}> {
  const sqlMeta = fetchObjectMetaViaSql("source", allowlist);
  const objects: StorageObjectMeta[] = [];

  for (const entry of allowlist) {
    const sqlRow = sqlMeta?.find(
      (o) => o.bucket === entry.bucket && o.path === entry.path,
    );
    // Always download to verify bytes against manifest (and for upload body)
    const verified = await verifyObjectAgainstManifest(
      source,
      entry,
      "Source",
    );
    if (sqlRow) {
      const sqlSize = sqlRow.size;
      const sqlChecksum = sqlRow.checksum;
      if (sqlSize != null && sqlSize !== verified.size) {
        throw new SelectiveMigrationSafetyError(
          `Source SQL size disagrees with download for ${entry.path}: sql=${sqlSize} download=${verified.size}`,
        );
      }
      if (
        sqlChecksum &&
        normalizeStorageChecksum(sqlChecksum) !== verified.checksum
      ) {
        throw new SelectiveMigrationSafetyError(
          `Source SQL checksum disagrees with download for ${entry.path}`,
        );
      }
    }
    objects.push({
      bucket: entry.bucket,
      path: entry.path,
      size: verified.size,
      checksum: verified.checksum,
    });
  }

  return {
    objects,
    via: sqlMeta ? "sql+download" : "download",
  };
}

function countByBucket(objects: { bucket: string }[]): {
  formTemplates: number;
  generatedDocuments: number;
  total: number;
} {
  const formTemplates = objects.filter(
    (o) => o.bucket === FORM_TEMPLATES_BUCKET,
  ).length;
  const generatedDocuments = objects.filter(
    (o) => o.bucket === GENERATED_DOCUMENTS_BUCKET,
  ).length;
  return {
    formTemplates,
    generatedDocuments,
    total: objects.length,
  };
}

async function assertFinalTargetCounts(
  target: ServiceClient,
  allowlist: StorageAllowlistEntry[],
): Promise<{ formTemplates: number; generatedDocuments: number; total: number }> {
  const { objects } = await resolveTargetObjects(target, allowlist);
  const counts = countByBucket(objects);
  if (counts.total !== EXPECTED_STORAGE_OBJECT_COUNT) {
    throw new SelectiveMigrationSafetyError(
      `Target storage count must be ${EXPECTED_STORAGE_OBJECT_COUNT} (got ${counts.total}).`,
    );
  }
  if (counts.formTemplates !== EXPECTED_FORM_TEMPLATE_COUNT) {
    throw new SelectiveMigrationSafetyError(
      `Target form-templates count must be ${EXPECTED_FORM_TEMPLATE_COUNT} (got ${counts.formTemplates}).`,
    );
  }
  if (counts.generatedDocuments !== EXPECTED_GENERATED_DOCUMENT_COUNT) {
    throw new SelectiveMigrationSafetyError(
      `Target generated-documents count must be ${EXPECTED_GENERATED_DOCUMENT_COUNT} (got ${counts.generatedDocuments}).`,
    );
  }

  for (const entry of allowlist) {
    const found = objects.find(
      (o) => o.bucket === entry.bucket && o.path === entry.path,
    );
    if (!found) {
      throw new SelectiveMigrationSafetyError(
        `Target missing allowlist path: ${entry.bucket}/${entry.path}`,
      );
    }
    const expectedChecksum = normalizeStorageChecksum(entry.checksum);
    if (
      expectedChecksum &&
      found.checksum &&
      found.checksum !== expectedChecksum
    ) {
      throw new SelectiveMigrationSafetyError(
        `Target checksum mismatch after copy: ${entry.path}`,
      );
    }
  }
  return counts;
}

async function verifyAccessControls(
  targetUrl: string,
  serviceClient: ServiceClient,
  allowlist: StorageAllowlistEntry[],
): Promise<Record<string, unknown>> {
  const sample = allowlist[0];
  if (!sample) {
    return { skipped: true, reason: "empty allowlist" };
  }

  // Service role can download
  await downloadBytes(serviceClient, sample.bucket, sample.path);
  let serviceOk = 0;
  for (const entry of allowlist) {
    await downloadBytes(serviceClient, entry.bucket, entry.path);
    serviceOk += 1;
  }

  const anonKey =
    process.env.TARGET_SUPABASE_ANON_KEY?.trim() ||
    process.env.TARGET_NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.TARGET_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.TARGET_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!anonKey) {
    return {
      serviceRoleDownloads: serviceOk,
      anonProbe: "skipped",
      limitation:
        "No TARGET_SUPABASE_ANON_KEY / TARGET_SUPABASE_PUBLISHABLE_KEY — anon access not probed.",
    };
  }

  const anon = createClient(targetUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let anonDenied = 0;
  let anonUnexpectedOk = 0;
  for (const entry of allowlist) {
    const { data, error } = await anon.storage
      .from(entry.bucket)
      .download(entry.path);
    if (error || !data) {
      anonDenied += 1;
    } else {
      anonUnexpectedOk += 1;
    }
  }

  return {
    serviceRoleDownloads: serviceOk,
    anonDenied,
    anonUnexpectedOk,
    anonPrivateOk: anonUnexpectedOk === 0,
  };
}

async function uploadOne(
  source: ServiceClient,
  target: ServiceClient,
  entry: StorageAllowlistEntry,
  allowlist: StorageAllowlistEntry[],
): Promise<{ size: number; checksum: string }> {
  assertStoragePathAllowed(entry.bucket, entry.path, allowlist);
  const { bytes, contentType: detectedType } = await downloadBytes(
    source,
    entry.bucket,
    entry.path,
  );
  const size = bytes.byteLength;
  const checksum = md5Hex(bytes);
  const expectedSize = parseStorageSize(entry.size);
  const expectedChecksum = normalizeStorageChecksum(entry.checksum);
  if (expectedSize != null && size !== expectedSize) {
    throw new SelectiveMigrationSafetyError(
      `Source size mismatch for ${entry.path}: expected ${expectedSize} got ${size}`,
    );
  }
  if (!expectedChecksum || checksum !== expectedChecksum) {
    throw new SelectiveMigrationSafetyError(
      `Source checksum mismatch for ${entry.path}: expected ${expectedChecksum} got ${checksum}`,
    );
  }

  const body = Buffer.from(bytes);
  const contentType =
    detectedType && detectedType.length > 0 ? detectedType : "application/pdf";

  const { error } = await target.storage.from(entry.bucket).upload(entry.path, body, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new SelectiveMigrationSafetyError(
      `Upload failed for ${entry.bucket}/${entry.path}: ${error.message}`,
    );
  }

  const after = await verifyObjectAgainstManifest(target, entry, "Target");
  return { size: after.size, checksum: after.checksum };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(args.manifestPath);
  const allowlist = buildStorageAllowlist(manifest);
  const shape = assertAllowlistExactShape(allowlist);
  const planCounts = storageCopyPlan(allowlist);

  const sourceUrl =
    process.env.SOURCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
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

  const source = createClient(sourceUrl!, sourceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const target = createClient(targetUrl!, targetKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sourceVerified = await resolveSourceVerified(source, allowlist);
  const targetResolved = await resolveTargetObjects(target, allowlist);

  const copyPlan = planStorageCopy({
    allowlist,
    targetObjects: targetResolved.objects,
    sourceObjects: sourceVerified.objects,
  });

  if (copyPlan.missingSourceExpected.length > 0) {
    throw new SelectiveMigrationSafetyError(
      `Missing ${copyPlan.missingSourceExpected.length} source object(s) expected by allowlist.`,
    );
  }
  if (copyPlan.conflictDifferentChecksum.length > 0) {
    const sample = copyPlan.conflictDifferentChecksum
      .slice(0, 5)
      .map((c) => c.entry.path);
    throw new SelectiveMigrationSafetyError(
      `Target has ${copyPlan.conflictDifferentChecksum.length} object(s) with different checksum: ${sample.join(", ")}`,
    );
  }

  const reportBase = {
    sourceRef: refs.sourceRef,
    targetRef: refs.targetRef,
    allowlistCount: allowlist.length,
    shape,
    planCounts,
    excludedMarkersChecked: [
      ...EXCLUDED_FORM_PDF_PATH_MARKERS,
      `users/${YAHOO_AUTH_UUID}/`,
    ],
    proofs: shape.proofs,
    sourceVerifyVia: sourceVerified.via,
    targetMetaVia: targetResolved.via,
    plan: {
      upload: copyPlan.upload.length,
      skipIdentical: copyPlan.skipIdentical.length,
      conflictDifferentChecksum: copyPlan.conflictDifferentChecksum.length,
      missingSourceExpected: copyPlan.missingSourceExpected.length,
    },
    uploads: copyPlan.upload.map((e) => ({
      bucket: e.bucket,
      path: e.path,
      size: parseStorageSize(e.size),
      checksum: normalizeStorageChecksum(e.checksum),
    })),
    skips: copyPlan.skipIdentical.map((e) => ({
      bucket: e.bucket,
      path: e.path,
    })),
    conflicts: copyPlan.conflictDifferentChecksum.map((c) => ({
      bucket: c.entry.bucket,
      path: c.entry.path,
      manifestChecksum: normalizeStorageChecksum(c.entry.checksum),
      targetChecksum: c.target.checksum,
    })),
  };

  if (args.dryRun && !args.execute) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          ...reportBase,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!args.execute) {
    throw new SelectiveMigrationSafetyError(
      "Pass --execute to copy, or --dry-run to plan only.",
    );
  }

  let uploaded = 0;
  let skipped = copyPlan.skipIdentical.length;
  let verified = 0;

  for (const entry of copyPlan.upload) {
    await uploadOne(source, target, entry, allowlist);
    uploaded += 1;
    verified += 1;
  }

  // Re-verify skips still match
  for (const entry of copyPlan.skipIdentical) {
    await verifyObjectAgainstManifest(target, entry, "Target");
    verified += 1;
  }

  const finalCounts = await assertFinalTargetCounts(target, allowlist);
  const access = await verifyAccessControls(targetUrl!, target, allowlist);

  console.log(
    JSON.stringify(
      {
        mode: "execute",
        sourceRef: refs.sourceRef,
        targetRef: refs.targetRef,
        uploaded,
        skipped,
        verified,
        finalCounts,
        access,
        ok:
          finalCounts.total === EXPECTED_STORAGE_OBJECT_COUNT &&
          finalCounts.formTemplates === EXPECTED_FORM_TEMPLATE_COUNT &&
          finalCounts.generatedDocuments === EXPECTED_GENERATED_DOCUMENT_COUNT,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
