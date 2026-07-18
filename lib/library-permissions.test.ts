import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCloneCollection,
  canCreateOrganizationCollection,
  canDeleteCollection,
  canDeleteForm,
  canEditCollection,
  canEditForm,
  canManageOrganizationDefaults,
  canManageOwnPrivateDefaults,
  canMapFormFields,
  canOpenManageDefaults,
  canViewCollection,
  canViewForm,
  canViewInheritedOrganizationDefaults,
  nextPrivateCloneCollectionName,
  type LibraryActor,
} from "./library-permissions.ts";

const admin: LibraryActor = {
  userId: "admin-id",
  isActiveAdmin: true,
};

const userA: LibraryActor = {
  userId: "user-a",
  isActiveAdmin: false,
  memberOrganizationIds: ["org-1"],
  orgAdminOrganizationIds: [],
};

const orgAdminA: LibraryActor = {
  userId: "org-admin-a",
  isActiveAdmin: false,
  memberOrganizationIds: ["org-1"],
  orgAdminOrganizationIds: ["org-1"],
};

const outsider: LibraryActor = {
  userId: "outsider",
  isActiveAdmin: false,
  memberOrganizationIds: ["org-2"],
  orgAdminOrganizationIds: [],
};

const userB: LibraryActor = {
  userId: "user-b",
  isActiveAdmin: false,
};

const globalForm = {
  scope: "GLOBAL",
  owner_user_id: null,
  status: "ACTIVE",
};

const privateFormA = {
  scope: "PRIVATE",
  owner_user_id: "user-a",
  status: "ACTIVE",
};

const globalCollection = {
  scope: "GLOBAL",
  owner_user_id: null,
  status: "ACTIVE",
};

const orgCollection = {
  scope: "ORGANIZATION",
  owner_user_id: null,
  organization_id: "org-1",
  status: "ACTIVE",
};

const privateCollectionA = {
  scope: "PRIVATE",
  owner_user_id: "user-a",
  status: "ACTIVE",
};

describe("form library permissions", () => {
  it("allows users to view global forms but not edit/map/delete them", () => {
    assert.equal(canViewForm(userA, globalForm), true);
    assert.equal(canEditForm(userA, globalForm), false);
    assert.equal(canMapFormFields(userA, globalForm), false);
    assert.equal(canDeleteForm(userA, globalForm), false);
  });

  it("allows owners to manage private forms", () => {
    assert.equal(canEditForm(userA, privateFormA), true);
    assert.equal(canMapFormFields(userA, privateFormA), true);
    assert.equal(canDeleteForm(userA, privateFormA), true);
    assert.equal(canEditForm(userB, privateFormA), false);
  });

  it("allows admins to manage global forms", () => {
    assert.equal(canEditForm(admin, globalForm), true);
    assert.equal(canMapFormFields(admin, globalForm), true);
    assert.equal(canDeleteForm(admin, globalForm), true);
  });

  it("lets any viewer open Manage Defaults on Global forms without mapping rights", () => {
    assert.equal(canOpenManageDefaults(userA, globalForm), true);
    assert.equal(canMapFormFields(userA, globalForm), false);
    assert.equal(canOpenManageDefaults(userA, privateFormA), false);
    assert.equal(canOpenManageDefaults(admin, globalForm), true);
  });
});

describe("scoped field-defaults permissions", () => {
  it("allows every authenticated user to manage own Private defaults", () => {
    assert.equal(canManageOwnPrivateDefaults(userA), true);
    assert.equal(canManageOwnPrivateDefaults(admin), true);
    assert.equal(canManageOwnPrivateDefaults(null), false);
  });

  it("allows members to view inherited Organization defaults for their primary org", () => {
    assert.equal(canViewInheritedOrganizationDefaults(userA, "org-1"), true);
    assert.equal(canViewInheritedOrganizationDefaults(outsider, "org-1"), false);
    assert.equal(canViewInheritedOrganizationDefaults(userA, null), false);
  });

  it("allows ORG_ADMIN and app admin to manage Organization defaults for that org only", () => {
    assert.equal(canManageOrganizationDefaults(orgAdminA, "org-1"), true);
    assert.equal(canManageOrganizationDefaults(orgAdminA, "org-2"), false);
    assert.equal(canManageOrganizationDefaults(userA, "org-1"), false);
    assert.equal(canManageOrganizationDefaults(admin, "org-1"), true);
    assert.equal(canManageOrganizationDefaults(admin, "org-2"), true);
  });
});

describe("collection library permissions", () => {
  it("allows active org members to view and clone organization collections but not edit", () => {
    assert.equal(canViewCollection(userA, orgCollection), true);
    assert.equal(canCloneCollection(userA, orgCollection), true);
    assert.equal(canEditCollection(userA, orgCollection), false);
    assert.equal(canDeleteCollection(userA, orgCollection), false);
  });

  it("allows ORG_ADMIN to edit organization collections for their org", () => {
    assert.equal(canEditCollection(orgAdminA, orgCollection), true);
    assert.equal(canDeleteCollection(orgAdminA, orgCollection), true);
    assert.equal(
      canCreateOrganizationCollection(orgAdminA, "org-1"),
      true,
    );
    assert.equal(
      canCreateOrganizationCollection(orgAdminA, "org-2"),
      false,
    );
  });

  it("denies outsiders organization collection access", () => {
    assert.equal(canViewCollection(outsider, orgCollection), false);
    assert.equal(canCloneCollection(outsider, orgCollection), false);
    assert.equal(canEditCollection(outsider, orgCollection), false);
  });

  it("allows legacy global collection view/clone for compatibility", () => {
    assert.equal(canViewCollection(userA, globalCollection), true);
    assert.equal(canCloneCollection(userA, globalCollection), true);
    assert.equal(canEditCollection(userA, globalCollection), false);
  });

  it("allows owners to edit private collections and denies others", () => {
    assert.equal(canEditCollection(userA, privateCollectionA), true);
    assert.equal(canDeleteCollection(userA, privateCollectionA), true);
    assert.equal(canEditCollection(userB, privateCollectionA), false);
    assert.equal(canCloneCollection(userA, privateCollectionA), false);
  });

  it("allows admins to manage organization collections", () => {
    assert.equal(canEditCollection(admin, orgCollection), true);
    assert.equal(canCreateOrganizationCollection(admin, "org-1"), true);
  });
});

describe("nextPrivateCloneCollectionName", () => {
  it("uses Copy then Copy N for conflicts", () => {
    assert.equal(
      nextPrivateCloneCollectionName("Buyer Rep Packet", []),
      "Buyer Rep Packet - Copy",
    );
    assert.equal(
      nextPrivateCloneCollectionName("Buyer Rep Packet", [
        "Buyer Rep Packet - Copy",
      ]),
      "Buyer Rep Packet - Copy 2",
    );
    assert.equal(
      nextPrivateCloneCollectionName("Buyer Rep Packet", [
        "Buyer Rep Packet - Copy",
        "Buyer Rep Packet - Copy 2",
      ]),
      "Buyer Rep Packet - Copy 3",
    );
  });
});
