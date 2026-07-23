/**
 * Dry-run / execute Auth migration for Lee only (UUID-preserving).
 *
 * Usage:
 *   npm run migrate:approved-auth -- --dry-run
 *   npm run migrate:approved-auth -- --execute
 *
 * Requires SOURCE_* (or .env.local) + TARGET_* (or .env.production.local).
 * Execute uses:
 *   - source: `supabase db query --linked` (CLI must be linked to harbaugh-forms-dev)
 *   - target: pooler URL from TARGET_SUPABASE_URL + TARGET_DB_PASSWORD
 *
 * Never logs password hashes. Never creates a replacement Lee UUID.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authExportLogSummary,
  authIdentityFromExportRow,
  authUserFromExportRow,
  buildAuthMigrationPlan,
  buildLeeAuthImportSql,
  LEE_AUTH_IDENTITY_EXPORT_SQL,
  LEE_AUTH_USER_EXPORT_SQL,
  TARGET_AUTH_VERIFY_SQL,
  validateAuthExportForMigration,
  validateTargetAuthPopulation,
  assertNeverCreatesReplacementUuid,
} from "../lib/selective-production/auth-migrate.ts";
import {
  DEV_PROJECT_REF,
  LEE_AUTH_UUID,
} from "../lib/selective-production/constants.ts";
import {
  assertDistinctProjects,
  assertRequiredCredentials,
  extractProjectRef,
  parseArgs,
  SelectiveMigrationSafetyError,
} from "../lib/selective-production/safety.ts";

const EXPECTED_PROD_REF = "eetonalyyyssvkyfdoxh";

function runCapture(command: string, args: string[], options?: { cwd?: string }) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    cwd: options?.cwd,
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

function parseSupabaseJsonRows(stdout: string): Record<string, unknown>[] {
  const start = stdout.indexOf("{");
  if (start < 0) {
    throw new SelectiveMigrationSafetyError("No JSON object in supabase query output.");
  }
  const parsed = JSON.parse(stdout.slice(start)) as {
    rows?: Record<string, unknown>[];
  };
  return parsed.rows ?? [];
}

function buildTargetDbUrl(): string {
  const password = process.env.TARGET_DB_PASSWORD?.trim();
  const targetUrl = process.env.TARGET_SUPABASE_URL?.trim();
  if (!password || !targetUrl) {
    throw new SelectiveMigrationSafetyError(
      "TARGET_DB_PASSWORD and TARGET_SUPABASE_URL are required for Auth execute.",
    );
  }
  const ref = extractProjectRef(targetUrl);
  if (ref !== EXPECTED_PROD_REF) {
    throw new SelectiveMigrationSafetyError(
      `TARGET_SUPABASE_URL ref must be ${EXPECTED_PROD_REF} (got ${ref}).`,
    );
  }
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres.${ref}:${encoded}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
}

function assertLinkedToDev(): void {
  const linked = readFileSync("supabase/.temp/project-ref", "utf8").trim();
  if (linked !== DEV_PROJECT_REF) {
    throw new SelectiveMigrationSafetyError(
      `CLI must be linked to development (${DEV_PROJECT_REF}) for source Auth export; linked=${linked}`,
    );
  }
}

function exportLeeFromSource(): {
  users: ReturnType<typeof authUserFromExportRow>[];
  identities: ReturnType<typeof authIdentityFromExportRow>[];
} {
  assertLinkedToDev();
  const dir = mkdtempSync(join(tmpdir(), "hf-auth-export-"));
  try {
    const userSql = join(dir, "user.sql");
    const identitySql = join(dir, "identity.sql");
    writeFileSync(userSql, LEE_AUTH_USER_EXPORT_SQL, "utf8");
    writeFileSync(identitySql, LEE_AUTH_IDENTITY_EXPORT_SQL, "utf8");

    const userOut = runCapture("npx", [
      "supabase",
      "db",
      "query",
      "--linked",
      "-o",
      "json",
      "-f",
      userSql,
    ]);
    const identityOut = runCapture("npx", [
      "supabase",
      "db",
      "query",
      "--linked",
      "-o",
      "json",
      "-f",
      identitySql,
    ]);

    const userRows = parseSupabaseJsonRows(userOut);
    const identityRows = parseSupabaseJsonRows(identityOut);
    if (userRows.length !== 1) {
      throw new SelectiveMigrationSafetyError(
        `Expected exactly one Lee Auth user on source (got ${userRows.length}).`,
      );
    }
    if (identityRows.length !== 1) {
      throw new SelectiveMigrationSafetyError(
        `Expected exactly one Lee email identity on source (got ${identityRows.length}).`,
      );
    }
    return {
      users: [authUserFromExportRow(userRows[0])],
      identities: [authIdentityFromExportRow(identityRows[0])],
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function applySqlToTarget(sql: string): void {
  const dbUrl = buildTargetDbUrl();
  const dir = mkdtempSync(join(tmpdir(), "hf-auth-import-"));
  try {
    const sqlPath = join(dir, "import.sql");
    writeFileSync(sqlPath, sql, "utf8");
    runCapture("npx", [
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

function verifyTargetAuth(): void {
  const dbUrl = buildTargetDbUrl();
  const dir = mkdtempSync(join(tmpdir(), "hf-auth-verify-"));
  try {
    const sqlPath = join(dir, "verify.sql");
    writeFileSync(sqlPath, TARGET_AUTH_VERIFY_SQL, "utf8");
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
    const rows = parseSupabaseJsonRows(out);
    if (rows.length !== 1) {
      throw new SelectiveMigrationSafetyError("Target Auth verify returned no rows.");
    }
    const row = rows[0];
    validateTargetAuthPopulation({
      userIds: [String(row.user_id)],
      emails: [String(row.email)],
      identityIds: [String(row.identity_id)],
    });
    if (Number(row.user_count) !== 1 || Number(row.identity_count) !== 1) {
      throw new SelectiveMigrationSafetyError(
        "Target Auth must contain exactly one user and one identity.",
      );
    }
    if (String(row.identity_user_id) !== LEE_AUTH_UUID) {
      throw new SelectiveMigrationSafetyError("Identity user_id mismatch after import.");
    }
    if (String(row.identity_provider) !== "email") {
      throw new SelectiveMigrationSafetyError("Identity provider must be email.");
    }
    if (row.has_password_hash !== true && row.has_password_hash !== "t") {
      throw new SelectiveMigrationSafetyError("Password hash missing on target after import.");
    }
    if (row.email_confirmed !== true && row.email_confirmed !== "t") {
      throw new SelectiveMigrationSafetyError("email_confirmed_at missing on target.");
    }
    console.log(
      JSON.stringify(
        {
          mode: "verify",
          ok: true,
          userId: row.user_id,
          email: row.email,
          identityId: row.identity_id,
          hasPasswordHash: true,
          emailConfirmed: true,
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildAuthMigrationPlan(args.dryRun);
  assertNeverCreatesReplacementUuid(plan.expectedUserId);

  const sourceUrl = process.env.SOURCE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sourceKey =
    process.env.SOURCE_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetUrl = process.env.TARGET_SUPABASE_URL;
  const targetKey = process.env.TARGET_SUPABASE_SECRET_KEY;

  if (!args.execute) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          plan: {
            ...plan,
            note: "Password hashes are never printed",
          },
          leeUuid: LEE_AUTH_UUID,
          sampleValidation: authExportLogSummary([
            {
              id: LEE_AUTH_UUID,
              email: plan.expectedEmail,
              email_confirmed_at: "present",
              encrypted_password_present: true,
            },
          ]),
        },
        null,
        2,
      ),
    );

    validateAuthExportForMigration({
      users: [
        {
          id: LEE_AUTH_UUID,
          email: plan.expectedEmail,
          email_confirmed_at: "2026-06-08T00:00:00Z",
          encrypted_password_present: true,
          encrypted_password: "$2a$placeholder_not_logged",
        },
      ],
      identities: [
        {
          id: plan.expectedIdentityId,
          user_id: LEE_AUTH_UUID,
          provider: "email",
        },
      ],
    });

    console.log("Auth migration dry-run OK — UUID/identity preservation safeguards passed.");
    return;
  }

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
  if (refs.targetRef !== EXPECTED_PROD_REF) {
    throw new SelectiveMigrationSafetyError(
      `Refusing Auth import: target ref ${refs.targetRef} is not ${EXPECTED_PROD_REF}.`,
    );
  }
  if (refs.sourceRef !== DEV_PROJECT_REF) {
    throw new SelectiveMigrationSafetyError(
      `Refusing Auth import: source ref must be development (${DEV_PROJECT_REF}).`,
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: "execute",
        sourceRef: refs.sourceRef,
        targetRef: refs.targetRef,
        expectedUserId: plan.expectedUserId,
        expectedIdentityId: plan.expectedIdentityId,
      },
      null,
      2,
    ),
  );

  const exported = exportLeeFromSource();
  validateAuthExportForMigration(exported);
  console.log(
    JSON.stringify(
      {
        exported: authExportLogSummary(exported.users),
        identityId: exported.identities[0]?.id,
        identityUserId: exported.identities[0]?.user_id,
        identityProvider: exported.identities[0]?.provider,
      },
      null,
      2,
    ),
  );

  const sql = buildLeeAuthImportSql(exported);
  applySqlToTarget(sql);
  verifyTargetAuth();
  console.log("Auth migration execute OK — Lee UUID/identity preserved; hash not logged.");
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
