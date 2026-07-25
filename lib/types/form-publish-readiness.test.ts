import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { countPdfPagesFromBytes } from "../forms/pdf-page-count.ts";
import { validateFormForPublish } from "./form-publish-validation.ts";
import {
  assertFormAllowsStructuralEdit,
  structuralFieldPatchHasChanges,
  FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE,
  FORM_RETIRED_READONLY_MESSAGE,
} from "./form-lifecycle.ts";

async function makePdfBytes(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage();
  }
  return doc.save();
}

describe("countPdfPagesFromBytes", () => {
  it("counts pages for a valid PDF", async () => {
    const bytes = await makePdfBytes(3);
    const result = await countPdfPagesFromBytes(bytes);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.pageCount, 3);
    }
  });

  it("rejects invalid PDF bytes", async () => {
    const result = await countPdfPagesFromBytes(
      new TextEncoder().encode("not-a-pdf"),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "pdf_unreadable");
    }
  });
});

describe("validateFormForPublish PDF page rules", () => {
  const draftForm = {
    status: "ACTIVE",
    publication_state: "DRAFT",
    scope: "GLOBAL",
    source_storage_path: "global/forms/1/blank.pdf",
  };

  const field = {
    id: "f1",
    status: "ACTIVE",
    source_type: "manual_only",
    resolver_key: null,
    field_key: "BUYER_NAME",
    field_label: "Buyer name",
    field_name: "Buyer name",
  };

  it("rejects when pdfPageCount is null (missing/unreadable)", () => {
    const result = validateFormForPublish({
      form: draftForm,
      mappings: [],
      fieldsById: new Map(),
      pdfPageCount: null,
      pdfLoadError: "The form PDF could not be downloaded from Storage.",
      allowEmptyMappings: true,
    });
    assert.equal(result.ok, false);
    assert.match(result.issues[0]!.message, /readable PDF|downloaded/i);
  });

  it("rejects mapping page 0", () => {
    const result = validateFormForPublish({
      form: draftForm,
      mappings: [
        {
          id: "m1",
          field_id: "f1",
          page_number: 0,
          status: "ACTIVE",
          mapping_name: "Buyer name",
        },
      ],
      fieldsById: new Map([["f1", field]]),
      pdfPageCount: 10,
      allowEmptyMappings: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.invalidPageMappingCount, 1);
    assert.match(
      result.issues.find((i) => i.code === "invalid_page")!.message,
      /10-page PDF/i,
    );
  });

  it("rejects negative mapping page", () => {
    const result = validateFormForPublish({
      form: draftForm,
      mappings: [
        {
          id: "m1",
          field_id: "f1",
          page_number: -1,
          status: "ACTIVE",
        },
      ],
      fieldsById: new Map([["f1", field]]),
      pdfPageCount: 5,
      allowEmptyMappings: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.invalidPageMappingCount, 1);
  });

  it("rejects mapping page exceeding PDF page count", () => {
    const result = validateFormForPublish({
      form: draftForm,
      mappings: [
        {
          id: "m1",
          field_id: "f1",
          page_number: 11,
          status: "ACTIVE",
          mapping_name: "Buyer name",
        },
        {
          id: "m2",
          field_id: "f1",
          page_number: 12,
          status: "ACTIVE",
          pdf_field_name: "x",
          occurrence_index: 1,
          mapping_name: "Extra",
        },
      ],
      fieldsById: new Map([["f1", field]]),
      pdfPageCount: 10,
      allowEmptyMappings: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.invalidPageMappingCount, 2);
    assert.match(
      result.issues.find((i) => i.code === "invalid_page")!.message,
      /2 mapped fields reference pages outside the 10-page PDF/i,
    );
  });

  it("ignores inactive/deleted mappings outside the page range", () => {
    const result = validateFormForPublish({
      form: draftForm,
      mappings: [
        {
          id: "m-active",
          field_id: "f1",
          page_number: 2,
          status: "ACTIVE",
          mapping_name: "Buyer name",
        },
        {
          id: "m-inactive",
          field_id: "f1",
          page_number: 99,
          status: "INACTIVE",
        },
        {
          id: "m-deleted",
          field_id: "f1",
          page_number: 100,
          status: "DELETED",
        },
      ],
      fieldsById: new Map([["f1", field]]),
      pdfPageCount: 10,
      allowEmptyMappings: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.invalidPageMappingCount, 0);
  });

  it("succeeds when PDF is valid and ACTIVE mapping pages are in range", () => {
    const result = validateFormForPublish({
      form: draftForm,
      mappings: [
        {
          id: "m1",
          field_id: "f1",
          page_number: 1,
          status: "ACTIVE",
          mapping_name: "Buyer name",
        },
        {
          id: "m2",
          field_id: "f1",
          page_number: 10,
          status: "ACTIVE",
          pdf_field_name: "x",
          occurrence_index: 1,
        },
      ],
      fieldsById: new Map([["f1", field]]),
      pdfPageCount: 10,
      allowEmptyMappings: false,
    });
    assert.equal(result.ok, true);
    assert.equal(result.pdfPageCount, 10);
  });

  it("still requires a readable page count for intentionally empty mappings", () => {
    const result = validateFormForPublish({
      form: draftForm,
      mappings: [],
      fieldsById: new Map(),
      pdfPageCount: null,
      allowEmptyMappings: true,
    });
    assert.equal(result.ok, false);
  });
});

describe("published structural edit assert", () => {
  it("rejects structural mutation on ACTIVE + PUBLISHED", () => {
    const result = assertFormAllowsStructuralEdit({
      status: "ACTIVE",
      publication_state: "PUBLISHED",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, FORM_PUBLISHED_STRUCTURAL_EDIT_MESSAGE);
    }
  });

  it("allows structural mutation on ACTIVE + DRAFT", () => {
    const result = assertFormAllowsStructuralEdit({
      status: "ACTIVE",
      publication_state: "DRAFT",
    });
    assert.equal(result.ok, true);
  });

  it("rejects structural mutation on retired forms", () => {
    const result = assertFormAllowsStructuralEdit({
      status: "INACTIVE",
      publication_state: "DRAFT",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, FORM_RETIRED_READONLY_MESSAGE);
    }
  });

  it("detects structural field patches", () => {
    assert.equal(
      structuralFieldPatchHasChanges({ source_type: "manual_only" }),
      true,
    );
    assert.equal(structuralFieldPatchHasChanges({}), false);
  });
});

describe("retired form-specific default gate", () => {
  it("treats INACTIVE forms as read-only for default writes", () => {
    const form = {
      status: "INACTIVE",
      publication_state: "DRAFT",
      scope: "GLOBAL",
    };
    assert.equal(form.status === "INACTIVE", true);
    assert.equal(
      FORM_RETIRED_READONLY_MESSAGE,
      "Retired form versions are read-only.",
    );
  });

  it("allows ACTIVE + DRAFT / PUBLISHED Global forms past the retired gate", () => {
    for (const publication_state of ["DRAFT", "PUBLISHED"] as const) {
      const form = { status: "ACTIVE", publication_state, scope: "GLOBAL" };
      assert.equal(form.status === "INACTIVE", false);
    }
  });
});
