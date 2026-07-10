import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferAcroformCatalogTypes,
  isCurrencyAmountField,
  looksLikeCurrencyAmountFieldName,
  normalizeFieldNameKey,
  TREC_40_11_CURRENCY_PDF_FIELD_NAMES,
} from "./acroform-field-type-inference.ts";

describe("normalizeFieldNameKey", () => {
  it("normalizes spacing and punctuation", () => {
    assert.equal(
      normalizeFieldNameKey("  Sales Price Cash  "),
      "sales_price_cash",
    );
  });
});

describe("looksLikeCurrencyAmountFieldName", () => {
  it("recognizes TREC 40-11 dollar blanks by native PDF name", () => {
    for (const name of TREC_40_11_CURRENCY_PDF_FIELD_NAMES) {
      assert.equal(
        looksLikeCurrencyAmountFieldName(name),
        true,
        `expected currency: ${name}`,
      );
    }
  });

  it("recognizes form-prefixed keys for those blanks", () => {
    assert.equal(
      looksLikeCurrencyAmountFieldName("txr_1901_excluding"),
      true,
    );
    assert.equal(
      looksLikeCurrencyAmountFieldName(
        "txr_1901_for_a_period_in_the_total_amount_of",
      ),
      true,
    );
  });

  it("recognizes semantic amount names", () => {
    assert.equal(looksLikeCurrencyAmountFieldName("loan_amount"), true);
    assert.equal(looksLikeCurrencyAmountFieldName("Sales Price"), true);
    assert.equal(looksLikeCurrencyAmountFieldName("down_payment"), true);
    assert.equal(looksLikeCurrencyAmountFieldName("appraised_value"), true);
    assert.equal(
      looksLikeCurrencyAmountFieldName("financing_conventional_principal_amount"),
      true,
    );
  });

  it("rejects percentages, terms, phones, and IDs", () => {
    assert.equal(looksLikeCurrencyAmountFieldName("interest_rate"), false);
    assert.equal(looksLikeCurrencyAmountFieldName("loan_term_years"), false);
    assert.equal(looksLikeCurrencyAmountFieldName("approval_days"), false);
    assert.equal(looksLikeCurrencyAmountFieldName("origination_percent"), false);
    assert.equal(looksLikeCurrencyAmountFieldName("buyer_phone"), false);
    assert.equal(looksLikeCurrencyAmountFieldName("property_zip"), false);
    assert.equal(looksLikeCurrencyAmountFieldName("license_number"), false);
    assert.equal(looksLikeCurrencyAmountFieldName("mls_number"), false);
    assert.equal(looksLikeCurrencyAmountFieldName("Street Address and City"), false);
    assert.equal(
      looksLikeCurrencyAmountFieldName("any financed PMI premium due in full in 1"),
      false,
    );
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
  });

  it("rejects non-amount types", () => {
    assert.equal(isCurrencyAmountField({ field_data_type: "number" }), false);
    assert.equal(isCurrencyAmountField(null), false);
  });
});

describe("inferAcroformCatalogTypes", () => {
  it("marks TREC amount blanks as currency/text", () => {
    const types = inferAcroformCatalogTypes({
      pdfFieldType: "Tx",
      pdfFieldName: "excluding",
    });
    assert.deepEqual(types, {
      fieldWidgetType: "text",
      fieldDataType: "currency",
    });
  });

  it("keeps checkboxes boolean", () => {
    const types = inferAcroformCatalogTypes({
      pdfFieldType: "Btn",
      checkBox: true,
      pdfFieldName: "1 Conventional Financing",
    });
    assert.deepEqual(types, {
      fieldWidgetType: "checkbox",
      fieldDataType: "boolean",
    });
  });

  it("keeps ordinary text as text", () => {
    const types = inferAcroformCatalogTypes({
      pdfFieldType: "Tx",
      pdfFieldName: "Street Address and City",
    });
    assert.deepEqual(types, {
      fieldWidgetType: "text",
      fieldDataType: "text",
    });
  });
});
