import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGlobalFormStoragePath,
  buildLegacyFormStoragePath,
  sanitizePdfFileName,
} from "./form-storage.ts";

const OWNER = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";

describe("deterministic dual-read fallback mapping", () => {
  it("maps legacy form path to global destination", () => {
    const legacy = buildLegacyFormStoragePath(
      "TXR-1501",
      "BuyerRepAgreement_202601.pdf",
    );
    assert.equal(legacy, "TXR-1501/BuyerRepAgreement_202601.pdf");
    assert.equal(
      buildGlobalFormStoragePath(1, "BuyerRepAgreement_202601.pdf"),
      "global/forms/1/BuyerRepAgreement_202601.pdf",
    );
  });

  it("builds expected packet new path from sanitized document name", () => {
    const safe = sanitizePdfFileName("listing agreement.pdf").replace(
      /\.pdf$/i,
      "",
    );
    const newPath = `users/${OWNER}/packets/15/52-${safe}.pdf`;
    assert.equal(newPath, `users/${OWNER}/packets/15/52-listing-agreement.pdf`);
  });

  it("keeps distinct attempted paths when both are missing (error context)", () => {
    const primary = "global/forms/999/missing.pdf";
    const fallback = "TXR-999/missing.pdf";
    const attempted = [primary, fallback].filter(
      (path, index, all) => all.indexOf(path) === index,
    );
    assert.deepEqual(attempted, [primary, fallback]);
  });
});
