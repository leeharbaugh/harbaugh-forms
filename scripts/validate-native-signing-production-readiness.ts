/**
 * Read-only Native Signing production-readiness validator.
 *
 * Usage:
 *   npx tsx ... scripts/validate-native-signing-production-readiness.ts --target=dev
 *   npx tsx ... scripts/validate-native-signing-production-readiness.ts --target=prod
 *
 * Never mutates. Never prints secret values.
 * Does not infer production solely from currently linked Supabase CLI project —
 * requires explicit --target and verifies observed project ref against it.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractSupabaseProjectRef } from "../lib/supabase/project-guard.ts";
import {
  assertNativeSigningMigrationInventoryMatchesDisk,
  NATIVE_SIGNING_ALL_MIGRATIONS,
} from "../lib/signing/native-signing-migrations.ts";
import {
  evaluateCronCodePosture,
  evaluateDisclosure,
  evaluateEmailSandbox,
  evaluateEnvPresence,
  evaluateFeatureFlag,
  evaluateProjectRefGuard,
  evaluateSiteUrl,
  evaluateSystemControls,
  summarizeReadiness,
  type ReadinessCheck,
} from "../lib/signing/production-readiness.ts";
import {
  expectedProjectRefForTarget,
  parseNativeSigningReadinessTarget,
  type NativeSigningReadinessTarget,
} from "../lib/signing/production-refs.ts";
import { NATIVE_SIGNING_ENV_FLAG } from "../lib/signing/feature-gate.ts";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  target: NativeSigningReadinessTarget;
} {
  const targetArg = argv.find((arg) => arg.startsWith("--target="));
  const raw = targetArg?.slice("--target=".length);
  const target = parseNativeSigningReadinessTarget(raw);
  if (!target) {
    fail("Required: --target=dev or --target=prod");
  }
  return { target };
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function main() {
  const { target } = parseArgs(process.argv.slice(2));
  const expectedRef = expectedProjectRefForTarget(target);
  console.log(`Native Signing production-readiness (read-only)`);
  console.log(`target=${target} expectedRef=${expectedRef}`);

  const inventory = assertNativeSigningMigrationInventoryMatchesDisk();
  if (!inventory.ok) {
    console.log(
      `CHECK NOT_INSTALLED/UNSAFE migration_inventory missing=${inventory.missing.join(",") || "(none)"} unexpected=${inventory.unexpected.join(",") || "(none)"}`,
    );
  } else {
    console.log(
      `CHECK READY migration_inventory count=${NATIVE_SIGNING_ALL_MIGRATIONS.length}`,
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  const observedRef = extractSupabaseProjectRef(url);
  const refCheck = evaluateProjectRefGuard({ target, observedRef });
  console.log(`CHECK ${refCheck.severity} ${refCheck.id}: ${refCheck.message}`);
  if (refCheck.severity === "UNSAFE" || refCheck.severity === "BLOCKED") {
    fail(refCheck.message);
  }

  if (!serviceKey) {
    fail(
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required for schema inspection (not printed).",
    );
  }

  const checks: ReadinessCheck[] = [refCheck];

  checks.push(
    evaluateSiteUrl({
      target,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    }),
  );
  checks.push(
    evaluateEmailSandbox({
      target,
      sandbox: process.env.SIGNING_EMAIL_SANDBOX,
    }),
  );

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Detect schema presence via signing_system_controls.
  const { data: controls, error: controlsError } = await admin
    .from("signing_system_controls")
    .select("id, work_suspended, access_suspended, access_epoch")
    .eq("id", "default")
    .maybeSingle();

  const schemaMissing =
    Boolean(controlsError?.message?.match(/does not exist|Could not find/i)) ||
    (!controls && !controlsError);

  const phase =
    target === "prod"
      ? schemaMissing || !controls
        ? "PRE_MIGRATION"
        : "POST_MIGRATION_ROLLOUT"
      : "ENABLED";

  console.log(`phase=${phase}`);

  checks.push(
    evaluateFeatureFlag({
      target,
      enabledRaw: process.env[NATIVE_SIGNING_ENV_FLAG],
      phase: target === "prod" ? phase : "POST_MIGRATION_ROLLOUT",
    }),
  );

  if (schemaMissing || !controls) {
    checks.push(
      ...evaluateSystemControls({
        present: false,
        workSuspended: null,
        accessSuspended: null,
        accessEpoch: null,
        phase: target === "prod" ? phase : "PRE_MIGRATION",
      }),
    );
    checks.push(
      evaluateDisclosure({
        target,
        schemaPresent: false,
        productionReadyCount: null,
        fingerprintValid: null,
      }),
    );
    if (phase === "PRE_MIGRATION") {
      checks.push({
        id: "schema",
        severity: "NOT_INSTALLED",
        message:
          "Native Signing schema not installed (expected for production pre-migration).",
      });
    }
  } else {
    if (target === "prod") {
      checks.push(
        ...evaluateSystemControls({
          present: true,
          workSuspended: Boolean(controls.work_suspended),
          accessSuspended: Boolean(controls.access_suspended),
          accessEpoch: (controls.access_epoch as string | null) ?? null,
          phase: "POST_MIGRATION_ROLLOUT",
        }),
      );
    } else {
      checks.push({
        id: "system_controls",
        severity: "READY",
        message:
          "signing_system_controls present (dev target does not require rollout suspension).",
      });
    }

    const { count: workCount } = await admin
      .from("signing_work_items")
      .select("id", { count: "exact", head: true });
    if (target === "prod" && phase === "POST_MIGRATION_ROLLOUT") {
      checks.push({
        id: "queued_work",
        severity: (workCount ?? 0) === 0 ? "READY" : "UNSAFE",
        message:
          (workCount ?? 0) === 0
            ? "No queued Signing work before smoke testing."
            : `Unexpected queued Signing work count=${workCount}.`,
      });
    }

    const { data: disclosures, error: disclosureError } = await admin
      .from("signing_consent_disclosure_versions")
      .select("id, body_text, content_sha256, is_production_ready")
      .eq("is_production_ready", true);
    if (disclosureError) {
      checks.push({
        id: "disclosure",
        severity: "BLOCKED",
        message: `Disclosure query failed: ${disclosureError.message}`,
      });
    } else {
      const rows = disclosures ?? [];
      const fingerprintValid =
        rows.length === 0
          ? null
          : rows.every(
              (row) =>
                typeof row.body_text === "string" &&
                typeof row.content_sha256 === "string" &&
                sha256Hex(row.body_text) === row.content_sha256,
            );
      checks.push(
        evaluateDisclosure({
          target,
          schemaPresent: true,
          productionReadyCount: rows.length,
          fingerprintValid,
        }),
      );
    }

    const { data: bucket } = await admin
      .storage
      .getBucket("signing-artifacts");
    checks.push({
      id: "storage_bucket",
      severity: bucket?.public === false ? "READY" : "BLOCKED",
      message:
        bucket?.public === false
          ? "signing-artifacts bucket is private."
          : bucket
            ? "signing-artifacts bucket is not private."
            : "signing-artifacts bucket missing.",
    });
  }

  const cronRouteExists = existsSync(
    join(
      process.cwd(),
      "app",
      "api",
      "internal",
      "cron",
      "signing-worker",
      "route.ts",
    ),
  );
  let vercelCronDeclared = false;
  try {
    const vercelJson = JSON.parse(
      readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path?: string }> };
    vercelCronDeclared = Boolean(
      vercelJson.crons?.some(
        (cron) => cron.path === "/api/internal/cron/signing-worker",
      ),
    );
  } catch {
    vercelCronDeclared = false;
  }
  const workerSource = readFileSync(
    join(process.cwd(), "lib", "signing", "signing-worker-dispatch.ts"),
    "utf8",
  );
  checks.push(
    ...evaluateCronCodePosture({
      cronRouteExists,
      vercelCronDeclared,
      workerFeatureOffGuarded: workerSource.includes("FEATURE_DISABLED"),
    }),
  );

  for (const check of checks) {
    console.log(`CHECK ${check.severity} ${check.id}: ${check.message}`);
  }

  console.log("--- env presence/format (secrets redacted) ---");
  for (const row of evaluateEnvPresence(process.env, target)) {
    const format =
      row.formatOk === null ? "n/a" : row.formatOk ? "ok" : "bad";
    const value =
      row.publicValue !== undefined
        ? ` value=${row.publicValue}`
        : row.present
          ? " present=yes"
          : " present=no";
    console.log(
      `ENV ${row.name}: present=${row.present ? "yes" : "no"} format=${format}${value}`,
    );
  }

  const summary = summarizeReadiness(checks);
  console.log(`OVERALL ${summary.overall}`);
  // Production post-migration / enablement postures may exit non-zero when blocked.
  // Dev target always completes with PASS after inspection (informational overall).
  if (target === "prod" && summary.blocked && phase !== "PRE_MIGRATION") {
    process.exit(2);
  }
  if (refCheck.severity !== "READY") {
    process.exit(1);
  }
  console.log("PASS: read-only readiness inspection completed.");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
