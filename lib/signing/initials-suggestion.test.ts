import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestTypedInitialsFromDisplayName } from "./adopted-marks.ts";

describe("suggestTypedInitialsFromDisplayName", () => {
  it("derives initials from multi-part names with middle names", () => {
    assert.equal(
      suggestTypedInitialsFromDisplayName("John Michael David Smith"),
      "JMDS",
    );
    assert.equal(
      suggestTypedInitialsFromDisplayName("Mary Anne Louise Carter"),
      "MALC",
    );
    assert.equal(
      suggestTypedInitialsFromDisplayName("Kenneth Lee Michael Harbaugh"),
      "KLMH",
    );
  });

  it("splits hyphenated tokens into separate initials", () => {
    assert.equal(suggestTypedInitialsFromDisplayName("Mary-Jane Smith"), "MJS");
    assert.equal(suggestTypedInitialsFromDisplayName("Lee Harbaugh"), "LH");
  });

  it("skips honorific prefixes and generational suffixes for suggestion only", () => {
    assert.equal(suggestTypedInitialsFromDisplayName("Dr Jane Q Public"), "JQP");
    assert.equal(suggestTypedInitialsFromDisplayName("John Smith Jr."), "JS");
    assert.equal(suggestTypedInitialsFromDisplayName("Mary Carter III"), "MC");
  });

  it("uses the first Unicode letter of apostrophe names", () => {
    assert.equal(suggestTypedInitialsFromDisplayName("Patrick O'Brien"), "PO");
  });

  it("collapses whitespace and returns empty when no letters", () => {
    assert.equal(suggestTypedInitialsFromDisplayName("  lee   harbaugh "), "LH");
    assert.equal(suggestTypedInitialsFromDisplayName(""), "");
    assert.equal(suggestTypedInitialsFromDisplayName("   "), "");
  });

  it("never throws on unusual input", () => {
    assert.doesNotThrow(() =>
      suggestTypedInitialsFromDisplayName("🙂 \u0000 \t\n"),
    );
  });
});
