import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MANDATORY_AUDIT_ACTIONS,
} from "../audit/constants.ts";
import {
  buildAuditUpdateDiff,
  sanitizeAuditMetadata,
} from "../audit/sanitize.ts";
import { validateInviteUserInput } from "./invite-validation.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("audit metadata sanitizer", () => {
  it("redacts secret-named keys and truncates long strings", () => {
    const sanitized = sanitizeAuditMetadata({
      password: "secret-value",
      access_token: "tok",
      summary: "ok",
      long: "x".repeat(600),
    });
    assert.equal(sanitized.password, "[redacted]");
    assert.equal(sanitized.access_token, "[redacted]");
    assert.equal(sanitized.summary, "ok");
    assert.equal(typeof sanitized.long, "string");
    assert.ok(String(sanitized.long).endsWith("…"));
    assert.ok(String(sanitized.long).length < 600);
  });

  it("builds minimized update diffs without full rows", () => {
    const diff = buildAuditUpdateDiff(
      { name: "A", status: "ACTIVE", notes: "old", ignored_detail: 1 },
      { name: "B", status: "ACTIVE", notes: "new", ignored_detail: 2 },
    );
    assert.ok(diff.changedFields.includes("name"));
    assert.ok(diff.changedFields.includes("notes"));
    assert.ok(diff.changedFields.includes("ignored_detail"));
    assert.equal(diff.safeOldValues.name, "A");
    assert.equal(diff.safeNewValues.name, "B");
    assert.equal(diff.safeOldValues.ignored_detail, undefined);
    assert.equal(diff.safeOldValues.notes, undefined);
  });
});

describe("mandatory audit actions", () => {
  it("includes enable/disable and admin role changes", () => {
    assert.ok(MANDATORY_AUDIT_ACTIONS.has("audit_logging_enabled"));
    assert.ok(MANDATORY_AUDIT_ACTIONS.has("audit_logging_disabled"));
    assert.ok(MANDATORY_AUDIT_ACTIONS.has("global_admin_access_granted"));
    assert.ok(MANDATORY_AUDIT_ACTIONS.has("global_admin_access_removed"));
  });
});

describe("abandoned brokerage office and TREC features removed", () => {
  it("does not expose Brokerages navigation", () => {
    const nav = readRepo("components/admin/admin-section-nav.tsx");
    assert.equal(nav.includes("/admin/brokerages"), false);
    assert.equal(/Brokerages|Brokerage\/Offices/i.test(nav), false);
    assert.ok(nav.includes("/admin/organizations"));
    assert.ok(nav.includes("/admin/audit"));
    assert.ok(nav.includes("/admin/users"));
  });

  it("has no /admin/brokerages page", () => {
    assert.throws(() => readRepo("app/admin/brokerages/page.tsx"));
  });

  it("has no TREC lookup API route or service", () => {
    assert.throws(() => readRepo("app/api/admin/trec-lookup/route.ts"));
    assert.throws(() => readRepo("lib/trec/lookup.ts"));
    assert.throws(() => readRepo("lib/trec/normalize.ts"));
    assert.throws(() => readRepo("lib/admin/manage-brokerage-offices.ts"));
    assert.throws(() => readRepo("components/admin/trec-license-lookup.tsx"));
  });

  it("does not reference TREC env tokens in application docs or package scripts", () => {
    const packageJson = readRepo("package.json");
    assert.equal(packageJson.includes("TREC_SODA"), false);
    assert.equal(packageJson.includes("TEXAS_OPEN_DATA"), false);
    assert.equal(packageJson.includes("test:brokerage-trec-audit"), false);
    assert.ok(packageJson.includes("test:admin-audit"));
  });

  it("keeps manual license number on invites without office or TREC verification", () => {
    const result = validateInviteUserInput({
      loginEmail: "agent@example.com",
      firstName: "Pat",
      lastName: "Lee",
      primaryOrganizationId: "11111111-1111-1111-1111-111111111111",
      trecLicenseNumber: "0712335",
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.value.trecLicenseNumber, "0712335");
    assert.equal(
      "brokerageOfficeId" in (result.value.memberships[0] as object),
      false,
    );
    assert.equal("licenseVerification" in result.value, false);
    assert.equal("primaryBrokerageOfficeId" in result.value, false);
  });

  it("invite validation does not require an office", () => {
    const result = validateInviteUserInput({
      loginEmail: "agent2@example.com",
      firstName: "Sam",
      lastName: "River",
      primaryOrganizationId: "11111111-1111-1111-1111-111111111111",
    });
    assert.equal(result.ok, true);
  });

  it("admin actions no longer export office or TREC handlers", () => {
    const actions = readRepo("app/admin/actions.ts");
    assert.equal(actions.includes("createBrokerageOfficeAction"), false);
    assert.equal(actions.includes("lookupTrecLicensesAction"), false);
    assert.equal(actions.includes("lib/trec"), false);
    assert.ok(actions.includes("setAuditLoggingEnabledAction"));
  });

  it("cleanup migration removes offices and TREC verification without CASCADE", () => {
    const migration = readRepo(
      "supabase/migrations/20260730010000_remove_brokerage_offices_and_trec.sql",
    );
    assert.ok(migration.includes("drop table if exists public.brokerage_offices"));
    assert.ok(migration.includes("drop column if exists brokerage_office_id"));
    assert.ok(migration.includes("trec_license_type"));
    assert.ok(migration.includes("brokerage_office_id"));
    assert.equal(/\bdrop\b[\s\S]{0,80}\bcascade\b/i.test(migration), false);
    assert.equal(/\bon\s+delete\s+cascade\b/i.test(migration), false);
    assert.equal(migration.includes("drop table if exists public.audit_events"), false);
    assert.equal(migration.includes("drop table if exists public.audit_settings"), false);
  });
});
