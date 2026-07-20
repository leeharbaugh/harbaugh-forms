import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describePacketValueProvenance,
  formatFilledFromLabel,
  formatPacketValueSourceLabel,
  isRawInternalSourceCode,
  refinePacketValueSourceLabel,
} from "./field-provenance-labels.ts";

describe("formatFilledFromLabel", () => {
  it("returns Not connected for missing or manual-only sources", () => {
    assert.equal(formatFilledFromLabel(null), "Not connected");
    assert.equal(
      formatFilledFromLabel({ source_type: "manual_only" }),
      "Not connected",
    );
    assert.equal(
      formatFilledFromLabel({ source_type: null, source_path: null }),
      "Not connected",
    );
  });

  it("maps property, client, agent, and brokerage paths to readable labels", () => {
    assert.equal(
      formatFilledFromLabel({
        source_type: "packet_property",
        source_path: "property.county",
      }),
      "Property county",
    );
    assert.equal(
      formatFilledFromLabel({
        source_type: "packet_contact",
        source_path: "buyer.full_name",
      }),
      "Client name",
    );
    assert.equal(
      formatFilledFromLabel({
        source_type: "settings_agent",
        source_path: "agent.phone",
      }),
      "Agent phone",
    );
    assert.equal(
      formatFilledFromLabel({
        source_type: "settings_brokerage",
        source_path: "brokerage.name",
      }),
      "Brokerage name",
    );
  });

  it("does not expose raw resolver keys as the primary label", () => {
    const label = formatFilledFromLabel({
      source_type: "custom_resolver",
      resolver_key: "buyer_rep.county",
      source_path: "buyer_rep.county",
    });
    assert.equal(label, "Custom form data");
    assert.equal(isRawInternalSourceCode(label), false);
  });
});

describe("formatPacketValueSourceLabel", () => {
  it("maps every preferred Fill Form source category", () => {
    assert.equal(
      formatPacketValueSourceLabel({ source: "manual_override", isOverride: true }),
      "Entered manually",
    );
    assert.equal(
      formatPacketValueSourceLabel({ source: "property" }),
      "From property",
    );
    assert.equal(
      formatPacketValueSourceLabel({ source: "contact_role" }),
      "From client",
    );
    assert.equal(
      formatPacketValueSourceLabel({ source: "settings" }),
      "From agent profile",
    );
    assert.equal(
      formatPacketValueSourceLabel({ source: "packet" }),
      "From packet",
    );
    assert.equal(
      formatPacketValueSourceLabel({ source: "private_default" }),
      "From your default",
    );
    assert.equal(
      formatPacketValueSourceLabel({ source: "organization_default" }),
      "From organization default",
    );
    assert.equal(
      formatPacketValueSourceLabel({ source: "empty", displayValue: "" }),
      "Blank",
    );
  });

  it("labels legacy generic fallback/default sources as Default without guessing scope", () => {
    assert.equal(
      formatPacketValueSourceLabel({ source: "field_default" }),
      "Default",
    );
    assert.equal(
      formatPacketValueSourceLabel({ source: "field_default_checked" }),
      "Default",
    );
    assert.equal(
      formatPacketValueSourceLabel({ source: "fallback" }),
      "Default",
    );
    assert.notEqual(
      formatPacketValueSourceLabel({ source: "field_default" }),
      "From your default",
    );
    assert.notEqual(
      formatPacketValueSourceLabel({ source: "field_default" }),
      "From organization default",
    );
    assert.notEqual(
      formatPacketValueSourceLabel({ source: "fallback" }),
      "From fallback",
    );
  });

  it("keeps known Personal and Organization defaults distinguishable", () => {
    assert.equal(
      formatPacketValueSourceLabel({ source: "private_default" }),
      "From your default",
    );
    assert.equal(
      formatPacketValueSourceLabel({ source: "organization_default" }),
      "From organization default",
    );
  });

  it("never returns raw internal source codes", () => {
    const labels = [
      formatPacketValueSourceLabel({ source: "manual_override", isOverride: true }),
      formatPacketValueSourceLabel({ source: "private_default" }),
      formatPacketValueSourceLabel({ source: "organization_default" }),
      formatPacketValueSourceLabel({ source: "field_default" }),
      formatPacketValueSourceLabel({ source: "field_default_checked" }),
      formatPacketValueSourceLabel({ source: "fallback" }),
    ];
    for (const label of labels) {
      assert.equal(isRawInternalSourceCode(label), false);
      assert.doesNotMatch(label, /fallback/i);
      assert.doesNotMatch(label, /_/);
    }
    assert.equal(isRawInternalSourceCode("fallback"), true);
    assert.equal(isRawInternalSourceCode("field_default"), true);
  });

  it("formats labels without mutating the input provenance options", () => {
    const options = {
      source: "field_default" as string | null,
      isOverride: false as boolean | null,
      displayValue: "NA" as string | null,
    };
    const before = structuredClone(options);
    const label = formatPacketValueSourceLabel(options);
    assert.equal(label, "Default");
    assert.deepEqual(options, before);
  });

  it("refines settings source using catalog field source_type", () => {
    assert.equal(
      refinePacketValueSourceLabel({
        source: "settings",
        fieldSourceType: "settings_brokerage",
      }),
      "From brokerage",
    );
    assert.equal(
      refinePacketValueSourceLabel({
        source: "settings",
        fieldSourceType: "settings_agent",
      }),
      "From agent profile",
    );
    assert.equal(
      refinePacketValueSourceLabel({
        source: "property",
        fieldSourceType: "settings_brokerage",
      }),
      "From property",
    );
  });

  it("treats dirty/manual override as Entered manually even when source is mapped", () => {
    assert.equal(
      formatPacketValueSourceLabel({
        source: "property",
        isOverride: true,
        displayValue: "Tarrant",
      }),
      "Entered manually",
    );
  });
});

describe("describePacketValueProvenance", () => {
  it("explains manual precedence without exposing raw codes", () => {
    const text = describePacketValueProvenance({
      valueSourceLabel: "Entered manually",
      filledFromLabel: "Property county",
      currentValue: "Tarrant",
    });
    assert.match(text, /entered manually/i);
    assert.match(text, /Property county/);
    assert.match(text, /manual value takes precedence/i);
    assert.doesNotMatch(text, /manual_override/);
  });

  it("explains generic Default without using fallback wording", () => {
    const text = describePacketValueProvenance({
      valueSourceLabel: "Default",
      filledFromLabel: "Not connected",
      currentValue: "NA",
    });
    assert.match(text, /came from a default/i);
    assert.match(text, /Not connected/);
    assert.match(text, /Current value:\nNA/);
    assert.doesNotMatch(text, /fallback/i);
    assert.doesNotMatch(text, /field_default/);
  });

  it("keeps Personal and Organization default disclosures specific", () => {
    const personal = describePacketValueProvenance({
      valueSourceLabel: "From your default",
      filledFromLabel: "Not connected",
      currentValue: "NA",
    });
    assert.match(personal, /Personal default/);
    assert.doesNotMatch(personal, /fallback/i);

    const organization = describePacketValueProvenance({
      valueSourceLabel: "From organization default",
      filledFromLabel: "Not connected",
      currentValue: "0",
    });
    assert.match(organization, /Organization default/);
    assert.doesNotMatch(organization, /fallback/i);
  });
});
