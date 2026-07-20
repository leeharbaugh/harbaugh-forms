import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canOfferCopyToGlobalLibrary,
  presentFormOwnership,
  resolveFormOwnerDisplayName,
} from "./form-owner-display.ts";
import { isActiveAppAdmin } from "./library-permissions.ts";

describe("resolveFormOwnerDisplayName", () => {
  it("prefers display_name", () => {
    assert.equal(
      resolveFormOwnerDisplayName({
        display_name: "Jane Smith",
        preferred_name: "Janey",
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@example.com",
      }),
      "Jane Smith",
    );
  });

  it("uses preferred + last when display_name blank", () => {
    assert.equal(
      resolveFormOwnerDisplayName({
        display_name: null,
        preferred_name: "Janey",
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@example.com",
      }),
      "Janey Smith",
    );
  });

  it("falls back to auth email then Owner unavailable", () => {
    assert.equal(
      resolveFormOwnerDisplayName(null, { authEmail: "user@example.com" }),
      "user@example.com",
    );
    assert.equal(resolveFormOwnerDisplayName(null), "Owner unavailable");
  });

  it("marks inactive owners", () => {
    assert.equal(
      resolveFormOwnerDisplayName({
        display_name: "Jane Smith",
        preferred_name: null,
        first_name: null,
        last_name: null,
        email: null,
        status: "INACTIVE",
      }),
      "Jane Smith (inactive)",
    );
  });
});

describe("presentFormOwnership", () => {
  it("labels Global forms as Global", () => {
    const result = presentFormOwnership({
      scope: "GLOBAL",
      ownerUserId: null,
      viewerUserId: "admin",
      isActiveAdmin: true,
      ownerDisplayName: null,
    });
    assert.equal(result.primaryLabel, "Global");
    assert.equal(result.isOtherUserPrivate, false);
  });

  it("labels own private forms as Private", () => {
    const result = presentFormOwnership({
      scope: "PRIVATE",
      ownerUserId: "user-a",
      viewerUserId: "user-a",
      isActiveAdmin: false,
      ownerDisplayName: "Alice",
    });
    assert.equal(result.primaryLabel, "Private");
  });

  it("shows Owned by for admin viewing another user's private form", () => {
    const result = presentFormOwnership({
      scope: "PRIVATE",
      ownerUserId: "user-b",
      viewerUserId: "admin",
      isActiveAdmin: true,
      ownerDisplayName: "Jane Smith",
    });
    assert.equal(result.primaryLabel, "Owned by Jane Smith");
    assert.equal(result.isOtherUserPrivate, true);
    assert.match(result.detailLine ?? "", /Owned by Jane Smith/);
  });
});

describe("canOfferCopyToGlobalLibrary", () => {
  it("allows active admin on active private forms with PDF", () => {
    assert.equal(
      canOfferCopyToGlobalLibrary({
        isActiveAdmin: true,
        scope: "PRIVATE",
        status: "ACTIVE",
        ownerUserId: "owner",
        sourceStoragePath: "users/owner/forms/1/a.pdf",
      }),
      true,
    );
  });

  it("denies Copy to Global for ORG_ADMIN with application role USER", () => {
    // Organization membership role and application role are distinct axes.
    // An Org Admin who is not an application Admin must not get Copy to Global.
    const orgAdminWithoutAppAdmin = {
      membershipRole: "ORG_ADMIN" as const,
      app_role: "USER" as const,
      status: "ACTIVE" as const,
      onboarding_status: "ACTIVE" as const,
    };

    assert.equal(orgAdminWithoutAppAdmin.membershipRole, "ORG_ADMIN");
    assert.equal(orgAdminWithoutAppAdmin.app_role, "USER");
    assert.equal(isActiveAppAdmin(orgAdminWithoutAppAdmin), false);

    // Production UI derives isActiveAdmin from isActiveAppAdmin(profile) only;
    // membershipRole is never consulted for Copy to Global. Server action
    // copyFormToGlobalLibrary → requireAppAdmin() likewise requires
    // profiles.app_role === "ADMIN".
    assert.equal(
      canOfferCopyToGlobalLibrary({
        isActiveAdmin: isActiveAppAdmin(orgAdminWithoutAppAdmin),
        scope: "PRIVATE",
        status: "ACTIVE",
        ownerUserId: "owner",
        sourceStoragePath: "users/owner/forms/1/a.pdf",
      }),
      false,
    );
  });

  it("denies standard users, global forms, and missing PDF", () => {
    assert.equal(
      canOfferCopyToGlobalLibrary({
        isActiveAdmin: false,
        scope: "PRIVATE",
        status: "ACTIVE",
        ownerUserId: "owner",
        sourceStoragePath: "users/owner/forms/1/a.pdf",
      }),
      false,
    );
    assert.equal(
      canOfferCopyToGlobalLibrary({
        isActiveAdmin: true,
        scope: "GLOBAL",
        status: "ACTIVE",
        ownerUserId: null,
        sourceStoragePath: "global/forms/1/a.pdf",
      }),
      false,
    );
    assert.equal(
      canOfferCopyToGlobalLibrary({
        isActiveAdmin: true,
        scope: "PRIVATE",
        status: "ACTIVE",
        ownerUserId: "owner",
        sourceStoragePath: null,
      }),
      false,
    );
  });
});
