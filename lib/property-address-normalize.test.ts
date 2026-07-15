import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizePropertyCity,
  normalizePropertyState,
  normalizePropertyStreet,
  normalizePropertyUnit,
  normalizePropertyZip5,
  propertyAddressIdentityKey,
} from "./property-address-normalize.ts";

describe("property address normalization", () => {
  it("normalizes street casing, spacing, and trailing punctuation", () => {
    assert.equal(normalizePropertyStreet("5801 Chatsworth Ct"), "5801 chatsworth ct");
    assert.equal(normalizePropertyStreet("5801 CHATSWORTH CT"), "5801 chatsworth ct");
    assert.equal(
      normalizePropertyStreet("  5801   Chatsworth Ct  "),
      "5801 chatsworth ct",
    );
    assert.equal(normalizePropertyStreet("5801 Chatsworth Ct."), "5801 chatsworth ct");
  });

  it("maps common street suffixes when present", () => {
    assert.equal(
      normalizePropertyStreet("5801 Chatsworth Court"),
      "5801 chatsworth ct",
    );
    assert.equal(
      propertyAddressIdentityKey({
        street_address: "5801 Chatsworth Court",
        city: "Arlington",
        state: "TX",
        zip: "76017",
      }),
      propertyAddressIdentityKey({
        street_address: "5801 Chatsworth Ct.",
        city: "Arlington",
        state: "Texas",
        zip: "76017-1234",
      }),
    );
  });

  it("normalizes city, state, zip, and unit", () => {
    assert.equal(normalizePropertyCity("  Arlington  "), "arlington");
    assert.equal(normalizePropertyState("Texas"), "TX");
    assert.equal(normalizePropertyState("tx"), "TX");
    assert.equal(normalizePropertyZip5("76017-1234"), "76017");
    assert.equal(normalizePropertyUnit(null), "");
    assert.equal(normalizePropertyUnit("  2B  "), "2b");
  });

  it("keeps distinct units distinct", () => {
    assert.notEqual(
      propertyAddressIdentityKey({
        street_address: "100 Main St",
        unit: "A",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
      propertyAddressIdentityKey({
        street_address: "100 Main St",
        unit: "B",
        city: "Austin",
        state: "TX",
        zip: "78701",
      }),
    );
  });
});
