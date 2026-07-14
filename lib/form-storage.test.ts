import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFormStoragePath,
  buildGlobalFormStoragePath,
  buildPrivateFormStoragePath,
  isLegacyFormStoragePath,
  isNewFormStoragePath,
  sanitizePdfFileName,
} from "./form-storage.ts";

const OWNER = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";

describe("sanitizePdfFileName", () => {
  it("strips unsafe characters and preserves pdf", () => {
    assert.equal(
      sanitizePdfFileName("Buyer Rep Agreement?.pdf"),
      "Buyer-Rep-Agreement.pdf",
    );
  });

  it("uses only the final path segment from hostile names", () => {
    assert.equal(
      sanitizePdfFileName("Buyer Rep ../Agreement?.pdf"),
      "Agreement.pdf",
    );
  });

  it("ignores directory components in uploaded names", () => {
    assert.equal(
      sanitizePdfFileName("..\\folder\\wire fraud.pdf"),
      "wire-fraud.pdf",
    );
  });
});

describe("form storage paths", () => {
  it("builds global form paths", () => {
    assert.equal(
      buildGlobalFormStoragePath(1, "BuyerRepAgreement_202601.pdf"),
      "global/forms/1/BuyerRepAgreement_202601.pdf",
    );
  });

  it("builds private form paths from owner id", () => {
    assert.equal(
      buildPrivateFormStoragePath(OWNER, 25, "custom-form.pdf"),
      `users/${OWNER}/forms/25/custom-form.pdf`,
    );
  });

  it("routes buildFormStoragePath by scope", () => {
    assert.equal(
      buildFormStoragePath({
        scope: "GLOBAL",
        formId: 3,
        fileName: "IABS.pdf",
      }),
      "global/forms/3/IABS.pdf",
    );
    assert.equal(
      buildFormStoragePath({
        scope: "PRIVATE",
        formId: 9,
        fileName: "mine.pdf",
        ownerUserId: OWNER,
      }),
      `users/${OWNER}/forms/9/mine.pdf`,
    );
  });

  it("requires owner for private forms", () => {
    assert.throws(() =>
      buildFormStoragePath({
        scope: "PRIVATE",
        formId: 1,
        fileName: "x.pdf",
      }),
    );
  });

  it("rejects missing ids and unsafe owners", () => {
    assert.throws(() => buildGlobalFormStoragePath(0, "a.pdf"));
    assert.throws(() =>
      buildPrivateFormStoragePath("not-a-uuid", 1, "a.pdf"),
    );
  });

  it("detects legacy vs new form paths", () => {
    assert.equal(isLegacyFormStoragePath("TXR-1501/BuyerRep.pdf"), true);
    assert.equal(isNewFormStoragePath("global/forms/1/BuyerRep.pdf"), true);
    assert.equal(isLegacyFormStoragePath("global/forms/1/BuyerRep.pdf"), false);
  });
});

describe("approved packet path convention", () => {
  it("documents owner-scoped packet path shape", () => {
    const path = `users/${OWNER}/packets/15/52-listing-agreement.pdf`;
    assert.match(path, /^users\/[0-9a-f-]{36}\/packets\/\d+\/\d+-.+\.pdf$/i);
    assert.equal(path.includes("@"), false);
  });
});
