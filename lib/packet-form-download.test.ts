import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSortablePacketFormFileName,
  sanitizeHumanPdfFileName,
} from "./packet-form-download-names.ts";

describe("sanitizeHumanPdfFileName", () => {
  it("preserves spaces and strips invalid characters", () => {
    assert.equal(
      sanitizeHumanPdfFileName("01 - Buyer Rep - Names?.pdf"),
      "01 - Buyer Rep - Names.pdf",
    );
  });
});

describe("buildSortablePacketFormFileName", () => {
  it("builds sortable filenames with contact names", () => {
    assert.equal(
      buildSortablePacketFormFileName(
        0,
        "Buyer Representation Agreement",
        "Jane Agent & John Client",
      ),
      "01 - Buyer Representation Agreement - Jane Agent & John Client.pdf",
    );
  });

  it("omits contact suffix for unnamed packets", () => {
    assert.equal(
      buildSortablePacketFormFileName(1, "Wire Fraud Warning", "Unnamed packet"),
      "02 - Wire Fraud Warning.pdf",
    );
  });
});
