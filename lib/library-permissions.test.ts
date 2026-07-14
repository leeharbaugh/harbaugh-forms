import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canCloneCollection,
  canDeleteCollection,
  canDeleteForm,
  canEditCollection,
  canEditForm,
  canMapFormFields,
  canViewCollection,
  canViewForm,
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
});

describe("collection library permissions", () => {
  it("allows users to view and clone global collections but not edit them", () => {
    assert.equal(canViewCollection(userA, globalCollection), true);
    assert.equal(canCloneCollection(userA, globalCollection), true);
    assert.equal(canEditCollection(userA, globalCollection), false);
    assert.equal(canDeleteCollection(userA, globalCollection), false);
  });

  it("allows owners to edit private collections and denies others", () => {
    assert.equal(canEditCollection(userA, privateCollectionA), true);
    assert.equal(canDeleteCollection(userA, privateCollectionA), true);
    assert.equal(canEditCollection(userB, privateCollectionA), false);
    assert.equal(canCloneCollection(userA, privateCollectionA), false);
  });

  it("allows admins to edit global collections", () => {
    assert.equal(canEditCollection(admin, globalCollection), true);
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
