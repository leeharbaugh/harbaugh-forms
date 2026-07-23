/**
 * Target production DB helpers (pooler URL + supabase db query).
 * Never logs TARGET_DB_PASSWORD or connection strings.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROD_PROJECT_REF } from "./constants.ts";
import { extractProjectRef, SelectiveMigrationSafetyError } from "./safety.ts";

export function buildTargetPoolerDbUrl(): string {
  const password = process.env.TARGET_DB_PASSWORD?.trim();
  const targetUrl = process.env.TARGET_SUPABASE_URL?.trim();
  if (!password || !targetUrl) {
    throw new SelectiveMigrationSafetyError(
      "TARGET_DB_PASSWORD and TARGET_SUPABASE_URL are required for target SQL.",
    );
  }
  const ref = extractProjectRef(targetUrl);
  if (ref !== PROD_PROJECT_REF) {
    throw new SelectiveMigrationSafetyError(
      `TARGET_SUPABASE_URL ref must be ${PROD_PROJECT_REF} (got ${ref}).`,
    );
  }
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres.${ref}:${encoded}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
}

function runCapture(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const err = `${result.stderr || ""}\n${result.stdout || ""}`
      .replace(/\$2[aby]\$[^\s"']+/gi, "[REDACTED_HASH]")
      .replace(/postgresql:\/\/[^\s]+/gi, "[REDACTED_URL]")
      .trim();
    throw new SelectiveMigrationSafetyError(
      `Command failed (${command} ${args[0] ?? ""}): ${err.slice(0, 1200)}`,
    );
  }
  return result.stdout ?? "";
}

export function parseSupabaseJsonRows(stdout: string): Record<string, unknown>[] {
  const start = stdout.indexOf("{");
  if (start < 0) {
    throw new SelectiveMigrationSafetyError("No JSON object in supabase query output.");
  }
  const parsed = JSON.parse(stdout.slice(start)) as {
    rows?: Record<string, unknown>[];
  };
  return parsed.rows ?? [];
}

/** Run SQL against the production pooler via `npx supabase db query --db-url`. */
export function runTargetSql(sql: string): string {
  const dbUrl = buildTargetPoolerDbUrl();
  const dir = mkdtempSync(join(tmpdir(), "hf-target-sql-"));
  try {
    const sqlPath = join(dir, "query.sql");
    writeFileSync(sqlPath, sql, "utf8");
    return runCapture("npx", [
      "supabase",
      "db",
      "query",
      "--db-url",
      dbUrl,
      "-f",
      sqlPath,
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function runTargetSqlJson(sql: string): Record<string, unknown>[] {
  const dbUrl = buildTargetPoolerDbUrl();
  const dir = mkdtempSync(join(tmpdir(), "hf-target-sql-json-"));
  try {
    const sqlPath = join(dir, "query.sql");
    writeFileSync(sqlPath, sql, "utf8");
    const out = runCapture("npx", [
      "supabase",
      "db",
      "query",
      "--db-url",
      dbUrl,
      "-o",
      "json",
      "-f",
      sqlPath,
    ]);
    return parseSupabaseJsonRows(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
