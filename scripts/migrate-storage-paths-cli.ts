/**
 * CLI-backed Phase B Storage migration runner (batched SQL + supabase storage cp).
 *
 * Usage:
 *   node --experimental-strip-types scripts/migrate-storage-paths-cli.ts --dry-run
 *   node --experimental-strip-types scripts/migrate-storage-paths-cli.ts --execute
 *   node --experimental-strip-types scripts/migrate-storage-paths-cli.ts --verify-only
 *   node --experimental-strip-types scripts/migrate-storage-paths-cli.ts --rollback
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FORM_TEMPLATES_BUCKET,
  buildGlobalFormStoragePath,
  extractPdfFileNameFromStoragePath,
  sanitizePdfFileName,
} from "../lib/form-storage.ts";

const GENERATED_DOCUMENTS_BUCKET = "generated-documents";
const OWNER_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Mode = "dry-run" | "execute" | "verify-only" | "rollback";

type PlannedOp = {
  bucket: string;
  entityType: "FORM" | "PACKET_FORM";
  entityId: number;
  oldPath: string;
  newPath: string;
  label: string;
  sourceExists: boolean;
  destExists: boolean;
  sourceSize: number | null;
  destSize: number | null;
};

function parseMode(argv: string[]): Mode {
  const modes = argv.filter((arg) =>
    ["--dry-run", "--execute", "--verify-only", "--rollback"].includes(arg),
  );
  if (modes.length !== 1) {
    throw new Error(
      "Specify exactly one mode: --dry-run | --execute | --verify-only | --rollback",
    );
  }
  return modes[0].slice(2) as Mode;
}

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function runDbQueryJson(sql: string): unknown[] {
  const dir = mkdtempSync(join(tmpdir(), "hf-migrate-"));
  const sqlPath = join(dir, "query.sql");
  try {
    writeFileSync(sqlPath, sql, "utf8");
    const stdout = execFileSync(
      "npx",
      [
        "supabase",
        "db",
        "query",
        "--linked",
        "--output-format",
        "json",
        "-f",
        sqlPath,
      ],
      { encoding: "utf8", shell: true },
    );
    const jsonStart = stdout.indexOf("{");
    if (jsonStart < 0) {
      throw new Error(`Unexpected db query output: ${stdout.slice(0, 200)}`);
    }
    const parsed = JSON.parse(stdout.slice(jsonStart));
    if (!parsed?.rows || !Array.isArray(parsed.rows)) {
      throw new Error("Unexpected db query response");
    }
    return parsed.rows as unknown[];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function storageCp(bucket: string, fromPath: string, toPath: string): void {
  execFileSync(
    "npx",
    [
      "supabase",
      "storage",
      "cp",
      "--experimental",
      "--linked",
      "--content-type",
      "application/pdf",
      `ss:///${bucket}/${fromPath}`,
      `ss:///${bucket}/${toPath}`,
    ],
    { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] },
  );
}

function buildPacketPath(options: {
  ownerUserId: string;
  packetId: number;
  packetFormId: number;
  documentName: string;
}): string {
  const ownerId = options.ownerUserId.trim().toLowerCase();
  if (!OWNER_RE.test(ownerId)) {
    throw new Error(`Invalid owner for packet_form ${options.packetFormId}`);
  }
  const safe = sanitizePdfFileName(options.documentName).replace(/\.pdf$/i, "");
  return `users/${ownerId}/packets/${options.packetId}/${options.packetFormId}-${safe}.pdf`;
}

function enrichOps(ops: PlannedOp[]): PlannedOp[] {
  if (ops.length === 0) return ops;

  const valuesSql = ops
    .map(
      (op, index) =>
        `(${index}, '${sqlEscape(op.bucket)}', '${sqlEscape(op.oldPath)}', '${sqlEscape(op.newPath)}')`,
    )
    .join(",\n");

  const rows = runDbQueryJson(`
    WITH planned(idx, bucket_name, old_path, new_path) AS (
      VALUES
      ${valuesSql}
    )
    SELECT
      p.idx::int AS idx,
      (src.id IS NOT NULL) AS source_exists,
      (dst.id IS NOT NULL) AS dest_exists,
      (src.metadata->>'size')::bigint AS source_size,
      (dst.metadata->>'size')::bigint AS dest_size
    FROM planned p
    LEFT JOIN storage.objects src
      ON src.bucket_id = p.bucket_name AND src.name = p.old_path
    LEFT JOIN storage.objects dst
      ON dst.bucket_id = p.bucket_name AND dst.name = p.new_path
    ORDER BY p.idx;
  `) as Array<{
    idx: number;
    source_exists: boolean;
    dest_exists: boolean;
    source_size: number | string | null;
    dest_size: number | string | null;
  }>;

  return ops.map((op, index) => {
    const row = rows.find((item) => Number(item.idx) === index);
    return {
      ...op,
      sourceExists: Boolean(row?.source_exists),
      destExists: Boolean(row?.dest_exists),
      sourceSize:
        row?.source_size == null ? null : Number(row.source_size),
      destSize: row?.dest_size == null ? null : Number(row.dest_size),
    };
  });
}

function planOps(formsOnly: boolean, packetFormsOnly: boolean): PlannedOp[] {
  const ops: PlannedOp[] = [];

  if (!packetFormsOnly) {
    const forms = runDbQueryJson(`
      SELECT id, form_code, source_storage_path
      FROM public.forms
      WHERE source_storage_path IS NOT NULL
        AND length(trim(source_storage_path)) > 0
      ORDER BY id;
    `) as Array<{ id: number; form_code: string; source_storage_path: string }>;

    for (const row of forms) {
      const current = row.source_storage_path.trim();
      const fileName = extractPdfFileNameFromStoragePath(current);
      const newPath = current.startsWith("global/forms/")
        ? current
        : buildGlobalFormStoragePath(row.id, fileName);
      const oldPath = current.startsWith("global/forms/")
        ? (runDbQueryJson(`
            SELECT old_path
            FROM public.storage_path_migrations
            WHERE bucket_name = '${FORM_TEMPLATES_BUCKET}'
              AND entity_type = 'FORM'
              AND entity_id = ${row.id}
              AND new_path = '${sqlEscape(current)}'
              AND status = 'ACTIVE'
            ORDER BY id DESC LIMIT 1;
          `)[0] as { old_path?: string } | undefined)?.old_path?.trim() ||
          current
        : current;

      ops.push({
        bucket: FORM_TEMPLATES_BUCKET,
        entityType: "FORM",
        entityId: row.id,
        oldPath,
        newPath,
        label: `form ${row.id} ${row.form_code}`,
        sourceExists: false,
        destExists: false,
        sourceSize: null,
        destSize: null,
      });
    }
  }

  if (!formsOnly) {
    const packetForms = runDbQueryJson(`
      SELECT id, packet_id, owner_user_id::text AS owner_user_id, document_name, storage_path
      FROM public.packet_forms
      WHERE storage_path IS NOT NULL
        AND length(trim(storage_path)) > 0
      ORDER BY id;
    `) as Array<{
      id: number;
      packet_id: number;
      owner_user_id: string;
      document_name: string;
      storage_path: string;
    }>;

    for (const row of packetForms) {
      const current = row.storage_path.trim();
      const newPath = buildPacketPath({
        ownerUserId: row.owner_user_id,
        packetId: row.packet_id,
        packetFormId: row.id,
        documentName:
          row.document_name || extractPdfFileNameFromStoragePath(current),
      });
      const oldPath =
        current.startsWith("users/") && current.includes("/packets/")
          ? (runDbQueryJson(`
              SELECT old_path
              FROM public.storage_path_migrations
              WHERE bucket_name = '${GENERATED_DOCUMENTS_BUCKET}'
                AND entity_type = 'PACKET_FORM'
                AND entity_id = ${row.id}
                AND new_path = '${sqlEscape(current)}'
                AND status = 'ACTIVE'
              ORDER BY id DESC LIMIT 1;
            `)[0] as { old_path?: string } | undefined)?.old_path?.trim() ||
            current
          : current;

      ops.push({
        bucket: GENERATED_DOCUMENTS_BUCKET,
        entityType: "PACKET_FORM",
        entityId: row.id,
        oldPath,
        newPath,
        label: `packet_form ${row.id} packet ${row.packet_id}`,
        sourceExists: false,
        destExists: false,
        sourceSize: null,
        destSize: null,
      });
    }
  }

  return enrichOps(ops);
}

function ensurePendingLedger(op: PlannedOp): number {
  const existing = runDbQueryJson(`
    SELECT id
    FROM public.storage_path_migrations
    WHERE bucket_name = '${sqlEscape(op.bucket)}'
      AND entity_type = '${op.entityType}'
      AND entity_id = ${op.entityId}
      AND old_path = '${sqlEscape(op.oldPath)}'
      AND new_path = '${sqlEscape(op.newPath)}'
      AND status = 'ACTIVE'
    LIMIT 1;
  `) as Array<{ id: number }>;
  if (existing[0]?.id) return Number(existing[0].id);

  const inserted = runDbQueryJson(`
    INSERT INTO public.storage_path_migrations (
      bucket_name, entity_type, entity_id, old_path, new_path,
      migration_state, status, metadata
    ) VALUES (
      '${sqlEscape(op.bucket)}',
      '${op.entityType}',
      ${op.entityId},
      '${sqlEscape(op.oldPath)}',
      '${sqlEscape(op.newPath)}',
      'PENDING',
      'ACTIVE',
      jsonb_build_object('label', '${sqlEscape(op.label)}')
    )
    RETURNING id;
  `) as Array<{ id: number }>;
  return Number(inserted[0].id);
}

function updateLedger(id: number, sets: string): void {
  runDbQueryJson(`
    UPDATE public.storage_path_migrations
    SET ${sets}
    WHERE id = ${id}
    RETURNING id;
  `);
}

function dryRun(ops: PlannedOp[]): void {
  let ready = 0;
  let already = 0;
  let missingSource = 0;
  let collisions = 0;

  for (const op of ops) {
    if (op.oldPath === op.newPath) {
      already += 1;
      console.log(`ALREADY ${op.label}`);
      continue;
    }
    if (!op.sourceExists) {
      missingSource += 1;
      console.log(`MISSING_SOURCE ${op.label} ${op.oldPath}`);
      continue;
    }
    if (op.destExists) {
      if (op.sourceSize != null && op.destSize === op.sourceSize) {
        ready += 1;
        console.log(`REUSE ${op.label}: ${op.oldPath} -> ${op.newPath}`);
        continue;
      }
      collisions += 1;
      console.log(`COLLISION ${op.label}`);
      continue;
    }
    ready += 1;
    console.log(`PLAN ${op.label}: ${op.oldPath} -> ${op.newPath}`);
  }

  console.log(
    `Dry-run summary: ready=${ready} already=${already} missingSource=${missingSource} collisions=${collisions} total=${ops.length}`,
  );
  if (missingSource > 0 || collisions > 0) process.exitCode = 1;
}

function execute(ops: PlannedOp[]): void {
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const op of ops) {
    if (op.oldPath === op.newPath) {
      skipped += 1;
      continue;
    }

    let ledgerId: number | null = null;
    try {
      ledgerId = ensurePendingLedger(op);
      if (!op.sourceExists || op.sourceSize == null) {
        throw new Error(`Source missing: ${op.bucket}/${op.oldPath}`);
      }

      if (op.destExists) {
        if (op.destSize !== op.sourceSize) {
          throw new Error("Destination exists with different size");
        }
      } else {
        storageCp(op.bucket, op.oldPath, op.newPath);
      }

      const verified = enrichOps([op])[0];
      if (!verified.destExists || verified.destSize !== op.sourceSize) {
        throw new Error(
          `Size mismatch after copy src=${op.sourceSize} dest=${verified.destSize}`,
        );
      }

      updateLedger(
        ledgerId,
        `migration_state = 'VERIFIED', copied_at = now(), verified_at = now(), source_size = ${op.sourceSize}, destination_size = ${verified.destSize}, error_message = null`,
      );

      if (op.entityType === "FORM") {
        runDbQueryJson(`
          UPDATE public.forms
          SET source_storage_path = '${sqlEscape(op.newPath)}'
          WHERE id = ${op.entityId}
          RETURNING id;
        `);
      } else {
        runDbQueryJson(`
          UPDATE public.packet_forms
          SET storage_path = '${sqlEscape(op.newPath)}'
          WHERE id = ${op.entityId}
          RETURNING id;
        `);
      }

      updateLedger(
        ledgerId,
        `migration_state = 'DB_UPDATED', database_updated_at = now(), error_message = null`,
      );

      ok += 1;
      console.log(`OK ${op.label}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (ledgerId != null) {
        try {
          updateLedger(
            ledgerId,
            `migration_state = 'FAILED', error_message = '${sqlEscape(message.slice(0, 900))}'`,
          );
        } catch {
          // ignore
        }
      }
      console.error(`FAILED ${op.label}: ${message}`);
    }
  }

  console.log(`Execute summary: ok=${ok} skipped=${skipped} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

function verifyOnly(ops: PlannedOp[]): void {
  let ok = 0;
  let failed = 0;
  for (const op of ops) {
    try {
      const rows =
        op.entityType === "FORM"
          ? (runDbQueryJson(`
              SELECT source_storage_path AS path
              FROM public.forms WHERE id = ${op.entityId};
            `) as Array<{ path: string }>)
          : (runDbQueryJson(`
              SELECT storage_path AS path
              FROM public.packet_forms WHERE id = ${op.entityId};
            `) as Array<{ path: string }>);

      if (rows[0]?.path !== op.newPath) {
        throw new Error(`DB path ${rows[0]?.path} != ${op.newPath}`);
      }
      if (!op.destExists && !enrichOps([op])[0].destExists) {
        throw new Error(`Missing destination ${op.newPath}`);
      }
      const fresh = enrichOps([op])[0];
      if (!fresh.destExists) throw new Error(`Missing destination ${op.newPath}`);
      if (op.oldPath !== op.newPath && !fresh.sourceExists) {
        throw new Error(`Missing retained legacy ${op.oldPath}`);
      }
      if (
        op.oldPath !== op.newPath &&
        fresh.sourceSize != null &&
        fresh.destSize !== fresh.sourceSize
      ) {
        throw new Error(`Size mismatch ${fresh.sourceSize} vs ${fresh.destSize}`);
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
  console.log(`Verify summary: ok=${ok} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

function rollback(ops: PlannedOp[]): void {
  let ok = 0;
  let failed = 0;
  for (const op of ops) {
    try {
      if (!op.sourceExists && op.oldPath !== op.newPath) {
        const fresh = enrichOps([op])[0];
        if (!fresh.sourceExists) throw new Error(`Legacy missing ${op.oldPath}`);
      }
      if (op.entityType === "FORM") {
        runDbQueryJson(`
          UPDATE public.forms
          SET source_storage_path = '${sqlEscape(op.oldPath)}'
          WHERE id = ${op.entityId}
          RETURNING id;
        `);
      } else {
        runDbQueryJson(`
          UPDATE public.packet_forms
          SET storage_path = '${sqlEscape(op.oldPath)}'
          WHERE id = ${op.entityId}
          RETURNING id;
        `);
      }
      runDbQueryJson(`
        UPDATE public.storage_path_migrations
        SET migration_state = 'ROLLED_BACK', rollback_at = now(), error_message = null
        WHERE bucket_name = '${sqlEscape(op.bucket)}'
          AND entity_type = '${op.entityType}'
          AND entity_id = ${op.entityId}
          AND old_path = '${sqlEscape(op.oldPath)}'
          AND new_path = '${sqlEscape(op.newPath)}'
          AND status = 'ACTIVE'
        RETURNING id;
      `);
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

function main() {
  const argv = process.argv.slice(2);
  const mode = parseMode(argv);
  const formsOnly = argv.includes("--forms-only");
  const packetFormsOnly = argv.includes("--packet-forms-only");
  console.log(`Planning (${mode})...`);
  const ops = planOps(formsOnly, packetFormsOnly);
  console.log(`Planned operations: ${ops.length} (transport=cli)`);

  if (mode === "dry-run") dryRun(ops);
  else if (mode === "execute") execute(ops);
  else if (mode === "verify-only") verifyOnly(ops);
  else rollback(ops);
}

main();
