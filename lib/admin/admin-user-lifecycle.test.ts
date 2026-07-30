import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { generateTemporaryPassword } from "./generate-temporary-password.ts";
import { validateInviteUserInput } from "./invite-validation.ts";
import {
  assertAdminActionRateLimit,
  resetAdminActionRateLimitsForTests,
} from "./rate-limit.ts";
import {
  canProceedWithTestUserDeletion,
  classifyOwnedLibraryRow,
  summarizeBlockingReasons,
} from "./test-user-deletion-policy.ts";
import { MANDATORY_AUDIT_ACTIONS } from "../audit/constants.ts";
import { sanitizeAuditMetadata } from "../audit/sanitize.ts";
import { validateNewPassword } from "../auth/password-policy.ts";
import { AUTH_CHANGE_PASSWORD_PATH } from "../auth/email-otp.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("manual create validation module", () => {
  it("requires temporary password policy and ACTIVE onboarding with must_change_password", () => {
    const source = readRepo("lib/admin/manual-create-validation.ts");
    assert.equal(source.includes("mustChangePassword: true"), true);
    assert.equal(source.includes('onboardingStatus: accountStatus === "ACTIVE" ? "ACTIVE"'), true);
    assert.equal(source.includes("validateNewPassword"), true);
    assert.equal(source.includes('appRole !== "USER" && appRole !== "ADMIN"'), true);
  });

  it("does not change invitation-based validation defaults", () => {
    const invite = validateInviteUserInput({
      loginEmail: "invite@example.com",
      firstName: "Inv",
      lastName: "Itee",
      primaryOrganizationId: "11111111-1111-1111-1111-111111111111",
    });
    assert.equal(invite.ok, true);
    if (!invite.ok) return;
    assert.equal(invite.value.onboardingStatus, "INVITED");
    assert.equal(invite.value.appRole, "USER");
  });
});

describe("temporary password generation", () => {
  it("meets policy and is not a fixed value", () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    assert.notEqual(a, b);
    assert.equal(
      validateNewPassword({ password: a, confirmPassword: a }).ok,
      true,
    );
  });
});

describe("test-user deletion policy", () => {
  it("classifies private library as safe and shared as blocking", () => {
    assert.equal(classifyOwnedLibraryRow("PRIVATE"), "safe_to_delete");
    assert.equal(classifyOwnedLibraryRow("GLOBAL"), "blocking");
    assert.equal(classifyOwnedLibraryRow("ORGANIZATION"), "blocking");
  });

  it("blocks self-deletion, non-test users, and final admin", () => {
    assert.equal(
      canProceedWithTestUserDeletion({
        isTestUser: true,
        isSelf: true,
        isFinalActiveAdmin: false,
        blockingReasons: [],
      }).ok,
      false,
    );
    assert.equal(
      canProceedWithTestUserDeletion({
        isTestUser: false,
        isSelf: false,
        isFinalActiveAdmin: false,
        blockingReasons: [],
      }).ok,
      false,
    );
    assert.equal(
      canProceedWithTestUserDeletion({
        isTestUser: true,
        isSelf: false,
        isFinalActiveAdmin: true,
        blockingReasons: [],
      }).ok,
      false,
    );
    assert.equal(
      canProceedWithTestUserDeletion({
        isTestUser: true,
        isSelf: false,
        isFinalActiveAdmin: false,
        blockingReasons: [],
      }).ok,
      true,
    );
  });

  it("surfaces shared-record blocking reasons", () => {
    const reasons = summarizeBlockingReasons(
      [
        {
          key: "shared_forms",
          label: "Global forms",
          classification: "blocking",
          count: 2,
        },
      ],
      [],
    );
    assert.equal(reasons.length, 1);
    assert.match(reasons[0]!, /Global forms/);
  });
});

describe("admin action rate limit", () => {
  it("blocks rapid duplicate submissions", () => {
    resetAdminActionRateLimitsForTests();
    const first = assertAdminActionRateLimit({
      actorUserId: "actor-1",
      action: "delete_test_user",
      minIntervalMs: 5_000,
    });
    assert.equal(first.ok, true);
    const second = assertAdminActionRateLimit({
      actorUserId: "actor-1",
      action: "delete_test_user",
      minIntervalMs: 5_000,
    });
    assert.equal(second.ok, false);
  });
});

describe("password / secret handling", () => {
  it("redacts password keys from audit metadata", () => {
    const sanitized = sanitizeAuditMetadata({
      temporaryPassword: "TempPass12",
      password: "TempPass12",
      isTestUser: true,
    });
    assert.equal(sanitized.temporaryPassword, "[redacted]");
    assert.equal(sanitized.password, "[redacted]");
    assert.equal(sanitized.isTestUser, true);
  });

  it("never persists temporary password in create-manual-user audit path", () => {
    const source = readRepo("lib/admin/create-manual-user.ts");
    assert.equal(source.includes("createUser({"), true);
    assert.equal(source.includes("email_confirm: true"), true);
    const auditBlock = source.slice(
      source.indexOf("await recordAuditEvent"),
      source.indexOf("return {", source.indexOf("await recordAuditEvent")),
    );
    assert.equal(auditBlock.includes("temporaryPassword"), false);
    assert.equal(auditBlock.includes("password"), false);
    assert.equal(auditBlock.includes("mustChangePassword: true"), true);
  });
});

describe("server authorization and hard-delete wiring", () => {
  it("requires Global Admin on create/delete/preview/test-flag actions", () => {
    const actions = readRepo("app/admin/actions.ts");
    for (const name of [
      "createManualUserAction",
      "permanentlyDeleteTestUserAction",
      "previewTestUserDeletionAction",
      "setUserTestFlagAction",
    ]) {
      assert.match(actions, new RegExp(`export async function ${name}`));
    }
    assert.equal(actions.includes("requireAppAdmin()"), true);
    assert.equal(actions.includes("assertAdminActionRateLimit"), true);
    assert.equal(
      actions.includes('action: "create_manual_user"') ||
        actions.includes('action: "delete_test_user"'),
      true,
    );
  });

  it("hard-deletes Auth with shouldSoftDelete=false for email reuse", () => {
    const del = readRepo("lib/admin/delete-test-user.ts");
    assert.equal(del.includes("deleteUser("), true);
    assert.match(del, /deleteUser\(\s*userId,\s*false\s*,?\s*\)/s);
    assert.equal(del.includes("is_test_user"), true);
    assert.equal(del.includes("deleted_user_snapshots"), true);
  });

  it("uses service-role admin client only on the server", () => {
    const create = readRepo("lib/admin/create-manual-user.ts");
    const del = readRepo("lib/admin/delete-test-user.ts");
    assert.equal(create.includes('import "server-only"'), true);
    assert.equal(del.includes('import "server-only"'), true);
    assert.equal(create.includes("createAdminClient"), true);
    assert.equal(del.includes("createAdminClient"), true);
  });
});

describe("must_change_password gate", () => {
  it("defines dedicated change-password route and proxy redirect", () => {
    assert.equal(AUTH_CHANGE_PASSWORD_PATH, "/auth/change-password");
    const page = readRepo("app/auth/change-password/page.tsx");
    assert.equal(page.includes('mode="forced"'), true);
    const proxy = readRepo("lib/supabase/proxy.ts");
    assert.equal(proxy.includes("must_change_password"), true);
    assert.equal(proxy.includes("/auth/change-password"), true);
    const authActions = readRepo("app/auth/actions.ts");
    assert.equal(authActions.includes("must_change_password"), true);
    assert.equal(
      authActions.includes("must_change_password: false"),
      true,
    );
  });
});

describe("schema migration and UI exposure", () => {
  it("adds is_test_user and must_change_password with protections", () => {
    const migration = readRepo(
      "supabase/migrations/20260730120000_admin_test_user_manual_create.sql",
    );
    assert.equal(migration.includes("is_test_user boolean not null default false"), true);
    assert.equal(
      migration.includes("must_change_password boolean not null default false"),
      true,
    );
    assert.equal(migration.includes("deleted_user_snapshots"), true);
    assert.equal(migration.includes("profiles_protect_admin_user_flags"), true);
    assert.equal(
      migration.includes("on delete set null"),
      true,
    );
  });

  it("exposes Test user badge and separate creation options", () => {
    const usersPage = readRepo("components/admin/admin-users-page.tsx");
    assert.equal(usersPage.includes("TestUserBadge"), true);
    assert.equal(usersPage.includes("ManualCreateUserCard"), true);
    assert.equal(usersPage.includes("Invite user (send email)"), true);
    assert.equal(usersPage.includes("TestUserDeletionControls"), true);
    const controls = readRepo(
      "components/admin/admin-manual-user-controls.tsx",
    );
    assert.equal(controls.includes("Create user manually (no email)"), true);
    assert.equal(
      controls.includes("Delete test user permanently"),
      true,
    );
    assert.equal(
      controls.includes("shown once") ||
        controls.includes("cannot be retrieved later"),
      true,
    );
  });

  it("treats test-user deletion as mandatory audit", () => {
    assert.ok(MANDATORY_AUDIT_ACTIONS.has("test_user_permanently_deleted"));
    assert.ok(MANDATORY_AUDIT_ACTIONS.has("test_user_deletion_failed"));
  });
});

describe("invitation workflow remains available", () => {
  it("keeps inviteUserAction and inviteAndProvisionUser", () => {
    const actions = readRepo("app/admin/actions.ts");
    assert.equal(actions.includes("inviteUserAction"), true);
    assert.equal(actions.includes("inviteAndProvisionUser"), true);
    const invite = readRepo("lib/admin/invite-user.ts");
    assert.equal(invite.includes("inviteUserByEmail"), true);
  });
});
