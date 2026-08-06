import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksLikeSfntFont } from "./signature-font.ts";

describe("looksLikeSfntFont", () => {
  it("accepts classic TrueType version tag 0x00010000", () => {
    assert.equal(looksLikeSfntFont(new Uint8Array([0, 1, 0, 0, 0, 0])), true);
  });

  it("accepts OTTO and true tags", () => {
    assert.equal(
      looksLikeSfntFont(
        Uint8Array.from("OTTO".split("").map((c) => c.charCodeAt(0))),
      ),
      true,
    );
    assert.equal(
      looksLikeSfntFont(
        Uint8Array.from("true".split("").map((c) => c.charCodeAt(0))),
      ),
      true,
    );
  });

  it("rejects HTML login payloads", () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><html>");
    assert.equal(looksLikeSfntFont(html), false);
  });

  it("rejects empty buffers", () => {
    assert.equal(looksLikeSfntFont(new Uint8Array()), false);
  });
});
