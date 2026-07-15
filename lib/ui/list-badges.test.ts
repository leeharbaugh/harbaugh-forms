import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appRoleLabel,
  appRoleVariant,
  libraryScopeLabel,
  libraryScopeVariant,
  membershipRoleLabel,
  onboardingStatusLabel,
  recordStatusLabel,
  recordStatusVariant,
} from "./list-badges.ts";

describe("list badge labels", () => {
  it("normalizes library scope labels and variants", () => {
    assert.equal(libraryScopeLabel("GLOBAL"), "Global");
    assert.equal(libraryScopeLabel("PRIVATE"), "Private");
    assert.equal(libraryScopeLabel("ORGANIZATION"), "Organization");
    assert.equal(libraryScopeVariant("GLOBAL"), "outline");
    assert.equal(libraryScopeVariant("PRIVATE"), "secondary");
    assert.equal(libraryScopeVariant("ORGANIZATION"), "info");
  });

  it("normalizes record status labels and variants", () => {
    assert.equal(recordStatusLabel("ACTIVE"), "Active");
    assert.equal(recordStatusLabel("INACTIVE"), "Inactive");
    assert.equal(recordStatusLabel("DELETED"), "Deleted");
    assert.equal(recordStatusVariant("ACTIVE"), "success");
    assert.equal(recordStatusVariant("INACTIVE"), "warning");
    assert.equal(recordStatusVariant("DELETED"), "destructive");
  });

  it("normalizes app roles and onboarding status", () => {
    assert.equal(appRoleLabel("ADMIN"), "Admin");
    assert.equal(appRoleLabel("USER"), "User");
    assert.equal(appRoleVariant("ADMIN"), "info");
    assert.equal(appRoleVariant("USER"), "secondary");
    assert.equal(onboardingStatusLabel("INVITED"), "Invited");
    assert.equal(onboardingStatusLabel("DISABLED"), "Disabled");
  });

  it("normalizes membership role labels", () => {
    assert.equal(membershipRoleLabel("MEMBER"), "Member");
    assert.equal(membershipRoleLabel("ORG_ADMIN"), "Org Admin");
  });
});
