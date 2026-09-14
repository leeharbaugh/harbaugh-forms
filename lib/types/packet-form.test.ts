import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePacketFormDocumentName } from "./packet-form.ts";

describe("validatePacketFormDocumentName", () => {
  it("requires a nonblank packet-specific document name", () => {
    assert.equal(validatePacketFormDocumentName("  "), "Document name is required.");
  });

  it("allows a distinct amendment label", () => {
    assert.equal(
      validatePacketFormDocumentName("Amendment to Contract - price change to $400k"),
      null,
    );
  });

  it("rejects names beyond the database limit", () => {
    assert.equal(
      validatePacketFormDocumentName("a".repeat(256)),
      "Document name must be 255 characters or fewer.",
    );
  });
});
