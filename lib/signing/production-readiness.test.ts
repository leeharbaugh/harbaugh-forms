import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
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
} from "./production-readiness";
import {
  assertNativeSigningMigrationInventoryMatchesDisk,
  NATIVE_SIGNING_ALL_MIGRATIONS,
} from "./native-signing-migrations";
import {
  NATIVE_SIGNING_DEV_PROJECT_REF,
  NATIVE_SIGNING_PROD_PROJECT_REF,
  NATIVE_SIGNING_PRODUCTION_SITE_URL,
} from "./production-refs";
import { BEARER_PATH_LOGGING_PRODUCTION_BLOCKER } from "./bearer-path-logging";

describe("production readiness helpers", () => {
  it("guards project refs for explicit targets", () => {
    assert.equal(
      evaluateProjectRefGuard({
        target: "prod",
        observedRef: NATIVE_SIGNING_PROD_PROJECT_REF,
      }).severity,
      "READY",
    );
    assert.equal(
      evaluateProjectRefGuard({
        target: "prod",
        observedRef: NATIVE_SIGNING_DEV_PROJECT_REF,
      }).severity,
      "UNSAFE",
    );
    assert.equal(
      evaluateProjectRefGuard({
        target: "dev",
        observedRef: NATIVE_SIGNING_PROD_PROJECT_REF,
      }).severity,
      "UNSAFE",
    );
  });

  it("classifies pre-migration missing controls as NOT_INSTALLED", () => {
    const checks = evaluateSystemControls({
      present: false,
      workSuspended: null,
      accessSuspended: null,
      accessEpoch: null,
      phase: "PRE_MIGRATION",
    });
    assert.equal(checks[0]?.severity, "NOT_INSTALLED");
  });

  it("requires suspended work/access and epoch after migration rollout", () => {
    const unsafe = evaluateSystemControls({
      present: true,
      workSuspended: false,
      accessSuspended: false,
      accessEpoch: null,
      phase: "POST_MIGRATION_ROLLOUT",
    });
    assert.ok(unsafe.some((c) => c.id === "work_suspended" && c.severity === "UNSAFE"));
    assert.ok(unsafe.some((c) => c.id === "access_suspended" && c.severity === "UNSAFE"));
    assert.ok(unsafe.some((c) => c.id === "access_epoch" && c.severity === "BLOCKED"));

    const safe = evaluateSystemControls({
      present: true,
      workSuspended: true,
      accessSuspended: true,
      accessEpoch: "epoch-1",
      phase: "POST_MIGRATION_ROLLOUT",
    });
    assert.ok(safe.every((c) => c.severity === "READY"));
  });

  it("rejects production sandbox, bad site URL, and missing disclosure", () => {
    assert.equal(
      evaluateEmailSandbox({ target: "prod", sandbox: "true" }).severity,
      "UNSAFE",
    );
    assert.equal(
      evaluateSiteUrl({
        target: "prod",
        siteUrl: "https://harbaugh-forms.vercel.app",
      }).severity,
      "UNSAFE",
    );
    assert.equal(
      evaluateSiteUrl({
        target: "prod",
        siteUrl: NATIVE_SIGNING_PRODUCTION_SITE_URL,
      }).severity,
      "READY",
    );
    assert.equal(
      evaluateSiteUrl({
        target: "prod",
        siteUrl: `${NATIVE_SIGNING_PRODUCTION_SITE_URL}/`,
      }).severity,
      "READY",
    );
    assert.match(
      evaluateDisclosure({
        target: "prod",
        schemaPresent: true,
        productionReadyCount: 0,
        fingerprintValid: null,
      }).message,
      /PRODUCTION_DISCLOSURE_NOT_READY/,
    );
  });

  it("flags feature unexpectedly ON during rollout", () => {
    assert.equal(
      evaluateFeatureFlag({
        target: "prod",
        enabledRaw: "true",
        phase: "POST_MIGRATION_ROLLOUT",
      }).severity,
      "UNSAFE",
    );
  });

  it("redacts secrets in env presence rows", () => {
    const rows = evaluateEnvPresence(
      {
        SIGNING_WORKER_SECRET: "super-secret-value",
        SIGNING_EVENT_CHAIN_KEY: "x".repeat(32),
        NEXT_PUBLIC_SITE_URL: NATIVE_SIGNING_PRODUCTION_SITE_URL,
      } as NodeJS.ProcessEnv,
      "prod",
    );
    const worker = rows.find((row) => row.name === "SIGNING_WORKER_SECRET");
    assert.equal(worker?.present, true);
    assert.equal(worker?.publicValue, undefined);
  });

  it("matches migration inventory on disk (20 Native Signing migrations)", () => {
    const inventory = assertNativeSigningMigrationInventoryMatchesDisk();
    assert.equal(inventory.ok, true);
    assert.equal(NATIVE_SIGNING_ALL_MIGRATIONS.length, 20);
  });

  it("detects Cron route, vercel.json, and worker feature-off posture", () => {
    const cronRoute = readFileSync(
      join(process.cwd(), "app/api/internal/cron/signing-worker/route.ts"),
      "utf8",
    );
    const vercelJson = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    const worker = readFileSync(
      join(process.cwd(), "lib/signing/signing-worker-dispatch.ts"),
      "utf8",
    );
    assert.match(cronRoute, /verifyCronAuthorization/);
    assert.match(cronRoute, /processSigningWorkBatch/);
    assert.doesNotMatch(cronRoute, /signingId/);
    assert.match(vercelJson, /\/api\/internal\/cron\/signing-worker/);
    assert.match(vercelJson, /\*\/2 \* \* \* \*/);
    assert.match(worker, /FEATURE_DISABLED/);
    const checks = evaluateCronCodePosture({
      cronRouteExists: true,
      vercelCronDeclared: true,
      workerFeatureOffGuarded: true,
    });
    assert.ok(checks.every((c) => c.severity === "READY"));
  });

  it("records bearer-path logging as resolved for emailed links", () => {
    assert.match(BEARER_PATH_LOGGING_PRODUCTION_BLOCKER, /fragment/);
    assert.match(BEARER_PATH_LOGGING_PRODUCTION_BLOCKER, /in-person/);
  });

  it("summarizes overall severity", () => {
    assert.equal(
      summarizeReadiness([
        { id: "a", severity: "READY", message: "ok" },
        { id: "b", severity: "NOT_INSTALLED", message: "missing" },
      ]).overall,
      "NOT_INSTALLED",
    );
  });
});
