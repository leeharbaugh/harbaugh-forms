import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveDisplayName,
  isUsableApplicationAccount,
  normalizeEmail,
  validateInviteUserInput,
  wouldRemoveFinalActiveAdmin,
} from "./invite-validation.ts";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    assert.equal(normalizeEmail("  Admin@Example.COM "), "admin@example.com");
  });
});

describe("deriveDisplayName", () => {
  it("prefers explicit display name, then preferred, then legal", () => {
    assert.equal(
      deriveDisplayName({
        displayName: "Display",
        preferredName: "Preferred",
        firstName: "First",
        lastName: "Last",
      }),
      "Display",
    );
    assert.equal(
      deriveDisplayName({
        preferredName: "Preferred",
        firstName: "First",
        lastName: "Last",
      }),
      "Preferred",
    );
    assert.equal(
      deriveDisplayName({
        firstName: "First",
        middleName: "M",
        lastName: "Last",
      }),
      "First M Last",
    );
  });
});

describe("validateInviteUserInput", () => {
  const base = {
    loginEmail: "agent@example.com",
    firstName: "Ada",
    lastName: "Agent",
    primaryOrganizationId: "11111111-1111-1111-1111-111111111111",
  };

  it("defaults to USER and INVITED onboarding", () => {
    const result = validateInviteUserInput(base);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.appRole, "USER");
    assert.equal(result.value.onboardingStatus, "INVITED");
    assert.equal(result.value.memberships.length, 1);
  });

  it("rejects inviting ADMIN in beta", () => {
    const result = validateInviteUserInput({
      ...base,
      appRole: "ADMIN",
    });
    assert.equal(result.ok, false);
  });

  it("allows agent email distinct from login email", () => {
    const result = validateInviteUserInput({
      ...base,
      agentEmail: "business@example.com",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.loginEmail, "agent@example.com");
    assert.equal(result.value.agentEmail, "business@example.com");
  });

  it("rejects invalid organization role", () => {
    const result = validateInviteUserInput({
      ...base,
      additionalMemberships: [
        {
          organizationId: "22222222-2222-2222-2222-222222222222",
          // @ts-expect-error intentional invalid role
          membershipRole: "OWNER",
        },
      ],
    });
    assert.equal(result.ok, false);
  });

  it("requires primary organization", () => {
    const result = validateInviteUserInput({
      ...base,
      primaryOrganizationId: "",
    });
    assert.equal(result.ok, false);
  });
});

describe("wouldRemoveFinalActiveAdmin", () => {
  it("blocks demoting the last active admin", () => {
    assert.equal(
      wouldRemoveFinalActiveAdmin({
        activeAdminCount: 1,
        currentlyActiveAdmin: true,
        nextIsActiveAdmin: false,
      }),
      true,
    );
  });

  it("allows demoting when another admin remains", () => {
    assert.equal(
      wouldRemoveFinalActiveAdmin({
        activeAdminCount: 2,
        currentlyActiveAdmin: true,
        nextIsActiveAdmin: false,
      }),
      false,
    );
  });
});

describe("isUsableApplicationAccount", () => {
  it("allows ACTIVE + INVITED/ACTIVE only", () => {
    assert.equal(
      isUsableApplicationAccount({
        status: "ACTIVE",
        onboarding_status: "INVITED",
      }),
      true,
    );
    assert.equal(
      isUsableApplicationAccount({
        status: "ACTIVE",
        onboarding_status: "DISABLED",
      }),
      false,
    );
    assert.equal(
      isUsableApplicationAccount({
        status: "INACTIVE",
        onboarding_status: "ACTIVE",
      }),
      false,
    );
  });
});

describe("admin client import surface", () => {
  it("keeps admin client behind server-only module path", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../supabase/admin.ts", import.meta.url), "utf8"),
    );
    assert.match(source, /import "server-only"/);
    assert.match(source, /SUPABASE_SECRET_KEY/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_SECRET/);
  });
});
