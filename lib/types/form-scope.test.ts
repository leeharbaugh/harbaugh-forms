import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyFormInput,
  validateFormInput,
} from "./form.ts";

describe("form create scope validation", () => {
  it("defaults to Private in emptyFormInput", () => {
    assert.equal(emptyFormInput().scope, "PRIVATE");
  });

  it("blocks Global create when allowGlobalScope is false", () => {
    const input = { ...emptyFormInput(), form_name: "Test", scope: "GLOBAL" as const };
    const pdf = { name: "x.pdf", type: "application/pdf" } as File;
    assert.match(
      validateFormInput(input, {
        mode: "create",
        pdfFile: pdf,
        replacePdf: false,
        existingStoragePath: null,
        allowGlobalScope: false,
      }) ?? "",
      /admin/i,
    );
  });

  it("allows Global create when allowGlobalScope is true", () => {
    const input = { ...emptyFormInput(), form_name: "Test", scope: "GLOBAL" as const };
    const pdf = { name: "x.pdf", type: "application/pdf" } as File;
    assert.equal(
      validateFormInput(input, {
        mode: "create",
        pdfFile: pdf,
        replacePdf: false,
        existingStoragePath: null,
        allowGlobalScope: true,
      }),
      null,
    );
  });
});
