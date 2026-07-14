/**
 * Phase B Storage path migration script.
 *
 * Server-only operational tool. Do not import this file from client components.
 *
 * Usage:
 *   node --env-file=.env.local --experimental-strip-types scripts/migrate-storage-paths.ts --dry-run
 *   node --env-file=.env.local --experimental-strip-types scripts/migrate-storage-paths.ts --execute
 *   node --env-file=.env.local --experimental-strip-types scripts/migrate-storage-paths.ts --verify-only
 *   node --env-file=.env.local --experimental-strip-types scripts/migrate-storage-paths.ts --rollback
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 */

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  FORM_TEMPLATES_BUCKET,
  buildGlobalFormStoragePath,
  extractPdfFileNameFromStoragePath,
  isLegacyFormStoragePath,
  isNewFormStoragePath,
  sanitizePdfFileName,
} from "../lib/form-storage.ts";

const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

function buildPacketFormStoragePath(options: {
  ownerUserId: string;
  packetId: number;
  packetFormId: number;
  documentName: string;
}): string {
  const ownerId = options.ownerUserId.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      ownerId,
    )
  ) {
    throw new Error("A valid owner user ID is required for Storage paths.");
  }
  if (!Number.isInteger(options.packetId) || options.packetId <= 0) {
    throw new Error("A valid packet ID is required for Storage paths.");
  }
  if (!Number.isInteger(options.packetFormId) || options.packetFormId <= 0) {
    throw new Error("A valid packet form ID is required for Storage paths.");
  }
  const safeFileName = sanitizePdfFileName(options.documentName).replace(
    /\.pdf$/i,
    "",
  );
  return `users/${ownerId}/packets/${options.packetId}/${options.packetFormId}-${safeFileName}.pdf`;
}

function isNewPacketStoragePath(path: string): boolean {
  return /^users\/[0-9a-f-]{36}\/packets\//i.test(path.trim());
}

function isLegacyPacketStoragePath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  return !isNewPacketStoragePath(trimmed);
}

type Mode = "dry-run" | "execute" | "verify-only" | "rollback";

type CliOptions = {
  mode: Mode;
  formsOnly: boolean;
  packetFormsOnly: boolean;
  entityId: number | null;
};

type FormRow = {
  id: number;
  form_code: string;
  scope: string;
  owner_user_id: string | null;
  source_storage_path: string;
  status: string;
};

type PacketFormRow = {
  id: number;
  packet_id: number;
  form_id: number | null;
  owner_user_id: string | null;
  storage_path: string | null;
  document_name: string;
  status: string;
};

type LedgerRow = {
  id: number;
  bucket_name: string;
  entity_type: "FORM" | "PACKET_FORM";
  entity_id: number;
  old_path: string;
  new_path: string;
  migration_state: string;
  source_size: number | null;
  destination_size: number | null;
  source_checksum: string | null;
  destination_checksum: string | null;
};

type PlannedOp = {
  bucket: string;
  entityType: "FORM" | "PACKET_FORM";
  entityId: number;
  oldPath: string;
  newPath: string;
  label: string;
};

function parseArgs(argv: string[]): CliOptions {
  const modes = argv.filter((arg) =>
    ["--dry-run", "--execute", "--verify-only", "--rollback"].includes(arg),
  );
  if (modes.length !== 1) {
    throw new Error(
      "Specify exactly one mode: --dry-run | --execute | --verify-only | --rollback",
    );
  }

  const mode = modes[0].slice(2) as Mode;
  const entityIdFlag = argv.find((arg) => arg.startsWith("--entity-id="));
  const entityId = entityIdFlag
    ? Number(entityIdFlag.split("=")[1])
    : null;

  return {
    mode,
    formsOnly: argv.includes("--forms-only"),
    packetFormsOnly: argv.includes("--packet-forms-only"),
    entityId: Number.isFinite(entityId) && entityId! > 0 ? entityId : null,
  };
}

function createServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function sha256Hex(bytes: ArrayBuffer | Uint8Array): string {
  const buffer =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return createHash("sha256").update(buffer).digest("hex");
}

async function downloadObject(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<{ bytes: Uint8Array; size: number; checksum: string }> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message ?? `Failed to download ${bucket}/${path}`);
  }
  const buffer = await data.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return { bytes, size: bytes.byteLength, checksum: sha256Hex(bytes) };
}

async function objectExists(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<boolean> {
  const trimmed = path.trim();
  const parent = trimmed.includes("/")
    ? trimmed.slice(0, trimmed.lastIndexOf("/"))
    : "";
  const name = trimmed.includes("/")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1)
    : trimmed;

  const { data, error } = await supabase.storage.from(bucket).list(parent, {
    search: name,
    limit: 100,
  });
  if (error) {
    throw new Error(`list failed for ${bucket}/${parent}: ${error.message}`);
  }
  return (data ?? []).some((entry) => entry.name === name);
}

async function copyObject(
  supabase: SupabaseClient,
  bucket: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).copy(fromPath, toPath);
  if (error) {
    throw new Error(
      `copy failed ${bucket}: ${fromPath} -> ${toPath}: ${error.message}`,
    );
  }
}

async function findActiveLedger(
  supabase: SupabaseClient,
  op: PlannedOp,
): Promise<LedgerRow | null> {
  const { data, error } = await supabase
    .from("storage_path_migrations")
    .select(
      "id, bucket_name, entity_type, entity_id, old_path, new_path, migration_state, source_size, destination_size, source_checksum, destination_checksum",
    )
    .eq("bucket_name", op.bucket)
    .eq("entity_type", op.entityType)
    .eq("entity_id", op.entityId)
    .eq("old_path", op.oldPath)
    .eq("new_path", op.newPath)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return (data as LedgerRow | null) ?? null;
}

async function upsertPendingLedger(
  supabase: SupabaseClient,
  op: PlannedOp,
): Promise<LedgerRow> {
  const existing = await findActiveLedger(supabase, op);
  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("storage_path_migrations")
    .insert({
      bucket_name: op.bucket,
      entity_type: op.entityType,
      entity_id: op.entityId,
      old_path: op.oldPath,
      new_path: op.newPath,
      migration_state: "PENDING",
      status: "ACTIVE",
      metadata: { label: op.label },
    })
    .select(
      "id, bucket_name, entity_type, entity_id, old_path, new_path, migration_state, source_size, destination_size, source_checksum, destination_checksum",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to insert ledger row");
  }
  return data as LedgerRow;
}

async function updateLedger(
  supabase: SupabaseClient,
  id: number,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("storage_path_migrations")
    .update(patch)
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

async function planForms(
  supabase: SupabaseClient,
  options: CliOptions,
): Promise<PlannedOp[]> {
  let query = supabase
    .from("forms")
    .select("id, form_code, scope, owner_user_id, source_storage_path, status")
    .not("source_storage_path", "is", null)
    .order("id", { ascending: true });

  if (options.entityId != null) {
    query = query.eq("id", options.entityId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const ops: PlannedOp[] = [];
  for (const row of (data as FormRow[]) ?? []) {
    const current = row.source_storage_path?.trim();
    if (!current) continue;

    const fileName = extractPdfFileNameFromStoragePath(current);

    if (isLegacyFormStoragePath(current)) {
      ops.push({
        bucket: FORM_TEMPLATES_BUCKET,
        entityType: "FORM",
        entityId: row.id,
        oldPath: current,
        newPath: buildGlobalFormStoragePath(row.id, fileName),
        label: `form ${row.id} ${row.form_code}`,
      });
      continue;
    }

    if (isNewFormStoragePath(current)) {
      const { data: ledgerRows } = await supabase
        .from("storage_path_migrations")
        .select("old_path")
        .eq("bucket_name", FORM_TEMPLATES_BUCKET)
        .eq("entity_type", "FORM")
        .eq("entity_id", row.id)
        .eq("new_path", current)
        .eq("status", "ACTIVE")
        .order("id", { ascending: false })
        .limit(1);

      const oldPath = ledgerRows?.[0]?.old_path?.trim() || current;
      ops.push({
        bucket: FORM_TEMPLATES_BUCKET,
        entityType: "FORM",
        entityId: row.id,
        oldPath,
        newPath: current,
        label: `form ${row.id} ${row.form_code}`,
      });
    }
  }
  return ops;
}

async function planPacketForms(
  supabase: SupabaseClient,
  options: CliOptions,
): Promise<PlannedOp[]> {
  let query = supabase
    .from("packet_forms")
    .select(
      "id, packet_id, form_id, owner_user_id, storage_path, document_name, status",
    )
    .not("storage_path", "is", null)
    .order("id", { ascending: true });

  if (options.entityId != null) {
    query = query.eq("id", options.entityId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const ops: PlannedOp[] = [];
  for (const row of (data as PacketFormRow[]) ?? []) {
    const current = row.storage_path?.trim();
    if (!current) continue;
    if (!row.owner_user_id) {
      throw new Error(`packet_form ${row.id} missing owner_user_id`);
    }

    const newPath = isNewPacketStoragePath(current)
      ? current
      : buildPacketFormStoragePath({
          ownerUserId: row.owner_user_id,
          packetId: row.packet_id,
          packetFormId: row.id,
          documentName: row.document_name || extractPdfFileNameFromStoragePath(current),
        });

    let oldPath = isLegacyPacketStoragePath(current) ? current : current;
    if (isNewPacketStoragePath(current)) {
      const { data: ledgerRows } = await supabase
        .from("storage_path_migrations")
        .select("old_path")
        .eq("bucket_name", GENERATED_DOCUMENTS_BUCKET)
        .eq("entity_type", "PACKET_FORM")
        .eq("entity_id", row.id)
        .eq("new_path", current)
        .eq("status", "ACTIVE")
        .limit(1);
      oldPath = ledgerRows?.[0]?.old_path ?? current;
    }

    ops.push({
      bucket: GENERATED_DOCUMENTS_BUCKET,
      entityType: "PACKET_FORM",
      entityId: row.id,
      oldPath,
      newPath,
      label: `packet_form ${row.id} packet ${row.packet_id}`,
    });
  }
  return ops;
}

async function dryRun(
  supabase: SupabaseClient,
  ops: PlannedOp[],
): Promise<void> {
  let ready = 0;
  let alreadyMigrated = 0;
  let missingSource = 0;
  let collisions = 0;

  for (const op of ops) {
    const sourceExists = await objectExists(supabase, op.bucket, op.oldPath);
    const destExists = await objectExists(supabase, op.bucket, op.newPath);
    const ledger = await findActiveLedger(supabase, op);

    if (!sourceExists && !(destExists && op.oldPath === op.newPath)) {
      // When already on new path, source check uses ledger old_path.
      if (op.oldPath !== op.newPath && !sourceExists) {
        missingSource += 1;
        console.log(`MISSING_SOURCE ${op.label} ${op.bucket}/${op.oldPath}`);
        continue;
      }
    }

    if (op.oldPath === op.newPath || (destExists && ledger?.migration_state === "DB_UPDATED")) {
      alreadyMigrated += 1;
      console.log(`ALREADY ${op.label} -> ${op.newPath}`);
      continue;
    }

    if (destExists) {
      const source = await downloadObject(supabase, op.bucket, op.oldPath);
      const dest = await downloadObject(supabase, op.bucket, op.newPath);
      if (source.checksum !== dest.checksum || source.size !== dest.size) {
        collisions += 1;
        console.log(
          `COLLISION ${op.label} destination exists with different content`,
        );
        continue;
      }
    }

    if (!sourceExists) {
      missingSource += 1;
      console.log(`MISSING_SOURCE ${op.label} ${op.bucket}/${op.oldPath}`);
      continue;
    }

    ready += 1;
    console.log(`PLAN ${op.label}: ${op.oldPath} -> ${op.newPath}`);
  }

  console.log(
    `Dry-run summary: ready=${ready} already=${alreadyMigrated} missingSource=${missingSource} collisions=${collisions} total=${ops.length}`,
  );
  if (missingSource > 0 || collisions > 0) {
    process.exitCode = 1;
  }
}

async function executeOne(
  supabase: SupabaseClient,
  op: PlannedOp,
): Promise<"ok" | "skipped" | "failed"> {
  if (op.oldPath === op.newPath) {
    console.log(`SKIP identical paths ${op.label}`);
    return "skipped";
  }

  const ledger = await upsertPendingLedger(supabase, op);

  try {
    if (!(await objectExists(supabase, op.bucket, op.oldPath))) {
      throw new Error(`Source missing: ${op.bucket}/${op.oldPath}`);
    }

    const source = await downloadObject(supabase, op.bucket, op.oldPath);
    const destExists = await objectExists(supabase, op.bucket, op.newPath);

    if (destExists) {
      const dest = await downloadObject(supabase, op.bucket, op.newPath);
      if (dest.checksum !== source.checksum || dest.size !== source.size) {
        throw new Error("Destination exists with different content");
      }
    } else {
      await copyObject(supabase, op.bucket, op.oldPath, op.newPath);
    }

    await updateLedger(supabase, ledger.id, {
      migration_state: "COPIED",
      copied_at: new Date().toISOString(),
      source_size: source.size,
      source_checksum: source.checksum,
      error_message: null,
    });

    const dest = await downloadObject(supabase, op.bucket, op.newPath);
    if (dest.size !== source.size || dest.checksum !== source.checksum) {
      throw new Error(
        `Verify mismatch size/checksum src=${source.size}/${source.checksum} dest=${dest.size}/${dest.checksum}`,
      );
    }

    await updateLedger(supabase, ledger.id, {
      migration_state: "VERIFIED",
      verified_at: new Date().toISOString(),
      destination_size: dest.size,
      destination_checksum: dest.checksum,
      error_message: null,
    });

    if (op.entityType === "FORM") {
      const { error } = await supabase
        .from("forms")
        .update({ source_storage_path: op.newPath })
        .eq("id", op.entityId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("packet_forms")
        .update({ storage_path: op.newPath })
        .eq("id", op.entityId);
      if (error) throw new Error(error.message);
    }

    await updateLedger(supabase, ledger.id, {
      migration_state: "DB_UPDATED",
      database_updated_at: new Date().toISOString(),
      error_message: null,
    });

    console.log(`OK ${op.label}`);
    return "ok";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateLedger(supabase, ledger.id, {
      migration_state: "FAILED",
      error_message: message.slice(0, 1000),
    }).catch(() => undefined);
    console.error(`FAILED ${op.label}: ${message}`);
    return "failed";
  }
}

async function verifyOnly(
  supabase: SupabaseClient,
  ops: PlannedOp[],
): Promise<void> {
  let ok = 0;
  let failed = 0;

  for (const op of ops) {
    try {
      const { data: entity } =
        op.entityType === "FORM"
          ? await supabase
              .from("forms")
              .select("source_storage_path")
              .eq("id", op.entityId)
              .single()
          : await supabase
              .from("packet_forms")
              .select("storage_path")
              .eq("id", op.entityId)
              .single();

      const dbPath =
        op.entityType === "FORM"
          ? (entity as { source_storage_path?: string } | null)
              ?.source_storage_path
          : (entity as { storage_path?: string } | null)?.storage_path;

      if (dbPath !== op.newPath) {
        throw new Error(`DB path is ${dbPath}, expected ${op.newPath}`);
      }

      if (!(await objectExists(supabase, op.bucket, op.newPath))) {
        throw new Error(`Missing destination ${op.bucket}/${op.newPath}`);
      }

      if (op.oldPath !== op.newPath) {
        if (!(await objectExists(supabase, op.bucket, op.oldPath))) {
          throw new Error(`Missing retained legacy object ${op.bucket}/${op.oldPath}`);
        }
        const source = await downloadObject(supabase, op.bucket, op.oldPath);
        const dest = await downloadObject(supabase, op.bucket, op.newPath);
        if (source.checksum !== dest.checksum || source.size !== dest.size) {
          throw new Error("Size/checksum mismatch between legacy and new objects");
        }
      }

      ok += 1;
      console.log(`VERIFIED ${op.label}`);
    } catch (error) {
      failed += 1;
      console.error(
        `VERIFY_FAILED ${op.label}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  console.log(`Verify summary: ok=${ok} failed=${failed} total=${ops.length}`);
  if (failed > 0) process.exitCode = 1;
}

async function rollback(
  supabase: SupabaseClient,
  ops: PlannedOp[],
): Promise<void> {
  let ok = 0;
  let failed = 0;

  for (const op of ops) {
    try {
      const ledger = await findActiveLedger(supabase, op);
      if (!ledger) {
        throw new Error("No active ledger row");
      }
      if (!(await objectExists(supabase, op.bucket, op.oldPath))) {
        throw new Error(`Legacy object missing: ${op.bucket}/${op.oldPath}`);
      }

      if (op.entityType === "FORM") {
        const { error } = await supabase
          .from("forms")
          .update({ source_storage_path: op.oldPath })
          .eq("id", op.entityId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("packet_forms")
          .update({ storage_path: op.oldPath })
          .eq("id", op.entityId);
        if (error) throw new Error(error.message);
      }

      await updateLedger(supabase, ledger.id, {
        migration_state: "ROLLED_BACK",
        rollback_at: new Date().toISOString(),
        error_message: null,
      });
      ok += 1;
      console.log(`ROLLED_BACK ${op.label}`);
    } catch (error) {
      failed += 1;
      console.error(
        `ROLLBACK_FAILED ${op.label}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  console.log(`Rollback summary: ok=${ok} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabase = createServiceClient();

  const includeForms = !options.packetFormsOnly;
  const includePacketForms = !options.formsOnly;

  const ops: PlannedOp[] = [];
  if (includeForms) {
    ops.push(...(await planForms(supabase, options)));
  }
  if (includePacketForms) {
    ops.push(...(await planPacketForms(supabase, options)));
  }

  console.log(`Planned operations: ${ops.length} (mode=${options.mode})`);

  if (options.mode === "dry-run") {
    await dryRun(supabase, ops);
    return;
  }
  if (options.mode === "verify-only") {
    await verifyOnly(supabase, ops);
    return;
  }
  if (options.mode === "rollback") {
    await rollback(supabase, ops);
    return;
  }

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const op of ops) {
    // Skip no-op when paths identical and DB already updated.
    if (op.oldPath === op.newPath) {
      skipped += 1;
      continue;
    }
    const result = await executeOne(supabase, op);
    if (result === "ok") ok += 1;
    else if (result === "skipped") skipped += 1;
    else failed += 1;
  }

  console.log(`Execute summary: ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
