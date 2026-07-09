import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPhoneInput,
  formatUSPhoneNumber,
  normalizePhoneDigits,
} from "./phone-format.ts";

describe("normalizePhoneDigits", () => {
  it("strips non-numeric characters", () => {
    assert.equal(normalizePhoneDigits("(817) 555-0100"), "8175550100");
    assert.equal(normalizePhoneDigits("abc"), "");
  });

  it("drops a leading US country code", () => {
    assert.equal(normalizePhoneDigits("+1 (817) 555-0100"), "8175550100");
    assert.equal(normalizePhoneDigits("18175550100"), "8175550100");
  });

  it("limits values to 10 digits", () => {
    assert.equal(normalizePhoneDigits("81755501001234"), "8175550100");
  });
});

describe("formatUSPhoneNumber", () => {
  it("formats partial numbers while typing", () => {
    assert.equal(formatUSPhoneNumber("8"), "8");
    assert.equal(formatUSPhoneNumber("817"), "817");
    assert.equal(formatUSPhoneNumber("8175"), "817-5");
    assert.equal(formatUSPhoneNumber("817555"), "817-555");
    assert.equal(formatUSPhoneNumber("8175550"), "817-555-0");
    assert.equal(formatUSPhoneNumber("81755501"), "817-555-01");
    assert.equal(formatUSPhoneNumber("8175550100"), "817-555-0100");
  });

  it("handles pasted unformatted numbers", () => {
    assert.equal(formatUSPhoneNumber("8175550100"), "817-555-0100");
    assert.equal(formatUSPhoneNumber("(817) 555-0100"), "817-555-0100");
  });
});

describe("formatPhoneInput", () => {
  it("normalizes and formats input values", () => {
    assert.equal(formatPhoneInput(""), "");
    assert.equal(formatPhoneInput("817-555-"), "817-555");
    assert.equal(formatPhoneInput("8175550100"), "817-555-0100");
    assert.equal(formatPhoneInput("+1 817 555 0100"), "817-555-0100");
  });

  it("is idempotent for already formatted values", () => {
    assert.equal(formatPhoneInput("817-555-0100"), "817-555-0100");
  });
});
