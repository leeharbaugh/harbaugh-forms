import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAmountInput,
  formatWholeNumberAmount,
  normalizeAmountDigits,
} from "./amount-format.ts";
import { isCurrencyAmountField } from "./acroform-field-type-inference.ts";

describe("normalizeAmountDigits", () => {
  it("strips non-digits", () => {
    assert.equal(normalizeAmountDigits("450,000"), "450000");
    assert.equal(normalizeAmountDigits("$1,250.00"), "125000");
    assert.equal(normalizeAmountDigits("abc"), "");
  });
});

describe("formatWholeNumberAmount", () => {
  it("formats whole numbers with commas", () => {
    assert.equal(formatWholeNumberAmount("450000"), "450,000");
    assert.equal(formatWholeNumberAmount("1000000"), "1,000,000");
    assert.equal(formatWholeNumberAmount("12500"), "12,500");
    assert.equal(formatWholeNumberAmount("0"), "0");
    assert.equal(formatWholeNumberAmount(""), "");
  });

  it("accepts already-formatted and pasted values", () => {
    assert.equal(formatWholeNumberAmount("450,000"), "450,000");
    assert.equal(formatWholeNumberAmount("$450000"), "450,000");
    assert.equal(formatWholeNumberAmount(" 1 250 000 "), "1,250,000");
  });

  it("collapses leading zeros", () => {
    assert.equal(formatWholeNumberAmount("0450000"), "450,000");
    assert.equal(formatWholeNumberAmount("000"), "0");
  });
});

describe("formatAmountInput", () => {
  it("defaults to whole-number formatting", () => {
    assert.equal(formatAmountInput("450000"), "450,000");
  });

  it("preserves up to two decimal places when typed", () => {
    assert.equal(formatAmountInput("450000.5"), "450,000.5");
    assert.equal(formatAmountInput("450000.50"), "450,000.50");
    assert.equal(formatAmountInput("450000."), "450,000.");
    assert.equal(formatAmountInput(".5"), "0.5");
  });
});

describe("isCurrencyAmountField", () => {
  it("detects explicit currency metadata", () => {
    assert.equal(
      isCurrencyAmountField({ field_data_type: "currency" }),
      true,
    );
    assert.equal(
      isCurrencyAmountField({ field_widget_type: "currency" }),
      true,
    );
  });

  it("detects TREC 40-11 amount blanks by pdf field name", () => {
    assert.equal(
      isCurrencyAmountField({
        field_data_type: "text",
        pdf_field_name: "excluding",
      }),
      true,
    );
    assert.equal(
      isCurrencyAmountField({
        field_data_type: "text",
        field_key: "txr_1901_for_a_period_in_the_total_amount_of",
      }),
      true,
    );
  });

  it("rejects non-amount types and names", () => {
    assert.equal(isCurrencyAmountField({ field_data_type: "number" }), false);
    assert.equal(isCurrencyAmountField({ field_data_type: "phone" }), false);
    assert.equal(
      isCurrencyAmountField({
        field_data_type: "text",
        pdf_field_name: "interest_rate",
      }),
      false,
    );
    assert.equal(isCurrencyAmountField(null), false);
  });
});

describe("Third Party Financing Addendum PDF export formatting", () => {
  function exportAmount(
    value: string,
    field: Parameters<typeof isCurrencyAmountField>[0],
  ) {
    const trimmed = value.trim();
    return isCurrencyAmountField(field) ? formatAmountInput(trimmed) : trimmed;
  }

  it("formats dollar blanks with commas and no dollar sign", () => {
    assert.equal(
      exportAmount("450000", {
        field_data_type: "text",
        pdf_field_name: "excluding",
        field_key: "txr_1901_excluding",
      }),
      "450,000",
    );
    assert.equal(
      exportAmount("1000000", {
        field_data_type: "text",
        pdf_field_name: "years with interest not to exceed",
      }),
      "1,000,000",
    );
    assert.equal(
      exportAmount("12500", {
        field_data_type: "text",
        pdf_field_name: "for a period in the total amount of",
      }),
      "12,500",
    );
  });

  it("does not format loan term / rate fields", () => {
    assert.equal(
      exportAmount("30", {
        field_data_type: "text",
        pdf_field_name: "any financed PMI premium due in full in 1",
      }),
      "30",
    );
    assert.equal(
      exportAmount("6.5", {
        field_data_type: "text",
        pdf_field_name: "any financed PMI premium due in full in 2",
      }),
      "6.5",
    );
  });

  it("still formats explicit currency fields from other forms", () => {
    assert.equal(
      exportAmount("450000", {
        field_data_type: "currency",
        field_key: "contract_sales_price_total",
      }),
      "450,000",
    );
  });
});
