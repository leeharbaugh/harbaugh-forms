import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sha256Hex } from "./prepare-pdf";

describe("prepared document integrity helpers", () => {
  it("detects byte-level mismatch without rewriting expected digests", () => {
    const expected = sha256Hex(new TextEncoder().encode("prepared-v1"));
    const actual = sha256Hex(new TextEncoder().encode("tampered-v1"));
    assert.notEqual(expected, actual);
    // The expected fingerprint remains the recorded value; callers must not
    // replace it with `actual` when mismatch occurs.
    const recorded = expected;
    assert.equal(recorded, expected);
    assert.notEqual(recorded, actual);
  });
});
