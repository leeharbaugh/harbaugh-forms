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

describe("privileged admin readers", () => {
  it("authorizes every exported service-role reader before it reads data", () => {
    const readers = [
      ["lib/admin/list-users.ts", "listAdminUsers"],
      ["lib/admin/manage-organizations.ts", "listAdminOrganizations"],
      ["lib/admin/manage-organizations.ts", "getAdminOrganization"],
      ["lib/admin/manage-memberships.ts", "listOrganizationMemberships"],
      ["lib/admin/manage-user-detail.ts", "getAdminUserDetail"],
      ["lib/admin/manage-user-detail.ts", "listDirectoryUsersForMembershipPicker"],
      ["lib/audit/record.ts", "getAuditSettings"],
      ["lib/audit/record.ts", "listAuditEvents"],
    ];

    for (const [path, functionName] of readers) {
      const source = readRepo(path);
      assert.match(
        source,
        new RegExp(
          `export async function ${functionName}[\\s\\S]*?await requireAppAdmin\\(\\)[\\s\\S]*?createAdminClient\\(`,
        ),
        `${path}:${functionName} must authorize before using the service-role client`,
      );
    }
  });

  it("authorizes each admin page before rendering privileged data", () => {
    for (const path of [
      "app/admin/users/page.tsx",
      "app/admin/users/[id]/page.tsx",
      "app/admin/organizations/page.tsx",
      "app/admin/organizations/[id]/page.tsx",
      "app/admin/audit/page.tsx",
    ]) {
      const source = readRepo(path);
      assert.match(source, /requireAppAdminPage/);
      assert.match(source, /await requireAppAdminPage\(\)/);
    }
  });

  it("keeps ordinary audit logging independent from the admin-console reader", () => {
    const source = readRepo("lib/audit/record.ts");
    assert.match(source, /async function loadAuditSettings/);
    assert.match(
      source,
      /isOrdinaryAuditLoggingEnabled[\s\S]*?loadAuditSettings\(\)/,
    );
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

describe("atomic audit logging changes", () => {
  it("uses the trusted database operation instead of separate writes", () => {
    const source = readRepo("lib/audit/record.ts");
    const migration = readRepo(
      "supabase/migrations/20260913140000_make_audit_logging_changes_atomic.sql",
    );
    assert.match(source, /rpc\("set_ordinary_audit_logging_enabled"/);
    assert.doesNotMatch(source, /setOrdinaryAuditLoggingEnabled[\s\S]*?\.from\("audit_settings"\)/);
    assert.match(migration, /revoke insert, update, delete on table public\.audit_settings from authenticated/);
    assert.match(migration, /insert into public\.audit_events/);
    assert.match(migration, /grant execute on function public\.set_ordinary_audit_logging_enabled[\s\S]*?to service_role/);
  });
});

describe("trusted audit-setting database guard", () => {
  it("rejects authenticated writes at the table boundary", () => {
    const migration = readRepo(
      "supabase/migrations/20260913150000_enforce_trusted_audit_setting_writes.sql",
    );
    assert.match(migration, /audit_settings_trusted_write_guard/);
    assert.match(migration, /if auth\.uid\(\) is not null then/);
  });
});

describe("audit-setting caller-role guard", () => {
  it("distinguishes trusted database roles from browser roles", () => {
    const migration = readRepo(
      "supabase/migrations/20260913160000_fix_audit_setting_guard_role.sql",
    );
    assert.match(migration, /security invoker/);
    assert.match(migration, /current_user not in \('service_role', 'postgres', 'supabase_admin'\)/);
  });
});

describe("audit-setting request-role guard", () => {
  it("uses Supabase's request role inside the trigger", () => {
    const migration = readRepo(
      "supabase/migrations/20260913170000_use_request_role_for_audit_setting_guard.sql",
    );
    assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  });
});

describe("audit-setting transaction capability", () => {
  it("requires a capability set only inside the trusted operation", () => {
    const migration = readRepo(
      "supabase/migrations/20260913180000_capability_guard_audit_setting_writes.sql",
    );
    assert.match(migration, /current_setting\('app\.audit_settings_trusted_write', true\)/);
    assert.match(migration, /set_config\('app\.audit_settings_trusted_write', 'enabled', true\)/);
  });
});

describe("audit-setting browser RLS boundary", () => {
  it("denies every authenticated table operation", () => {
    const migration = readRepo(
      "supabase/migrations/20260913190000_block_browser_audit_setting_access.sql",
    );
    assert.match(migration, /as restrictive/);
    assert.match(migration, /for all[\s\S]*?to authenticated[\s\S]*?using \(false\)[\s\S]*?with check \(false\)/);
  });
});
