import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  EMPTY_MAPPINGS_ISSUE_CODE,
  canConfirmPublish,
  remainingPublishBlockers,
  validateFormForPublish,
  type PublishFieldRow,
  type PublishMappingRow,
} from "./form-publish-validation.ts";

const draft = { status: "ACTIVE", publication_state: "DRAFT", scope: "GLOBAL", source_storage_path: "global/forms/2/blank.pdf" };
const field: PublishFieldRow = { id: "f1", status: "ACTIVE", source_type: "manual_only", resolver_key: null, field_key: "BUYER_NAME", field_label: "Buyer name" };
const fields = new Map([["f1", field]]);
const mapping = (over: Partial<PublishMappingRow> = {}): PublishMappingRow => ({ id: "m1", field_id: "f1", page_number: 1, status: "ACTIVE", ...over });

function previewOf(result: ReturnType<typeof validateFormForPublish>, hasConflict = false) {
  return { requiresEmptyMappingsConfirmation: result.requiresEmptyMappingsConfirmation, hasConflict, issues: result.issues };
}

describe("zero-mapping publish: server validation", () => {
  it("a zero-mapping form needs only the explicit confirmation", () => {
    const preview = validateFormForPublish({ form: draft, mappings: [], fieldsById: new Map(), pdfPageCount: 1, allowEmptyMappings: false });
    assert.equal(preview.requiresEmptyMappingsConfirmation, true);
    assert.deepEqual(preview.issues.map((i) => i.code), [EMPTY_MAPPINGS_ISSUE_CODE]);
    const confirmed = validateFormForPublish({ form: draft, mappings: [], fieldsById: new Map(), pdfPageCount: 1, allowEmptyMappings: true });
    assert.equal(confirmed.ok, true);
    assert.deepEqual(confirmed.issues, []);
    assert.equal(confirmed.mappingCount, 0);
  });

  it("inactive or deleted mappings do not count as mappings", () => {
    const result = validateFormForPublish({ form: draft, mappings: [mapping({ status: "DELETED" })], fieldsById: fields, pdfPageCount: 1, allowEmptyMappings: true });
    assert.equal(result.ok, true);
    assert.equal(result.mappingCount, 0);
  });

  it("republishing after Unpublish behaves the same (form back in Draft, still zero mappings)", () => {
    const unpublished = { ...draft, publication_state: "DRAFT" };
    const result = validateFormForPublish({ form: unpublished, mappings: [], fieldsById: new Map(), pdfPageCount: 2, allowEmptyMappings: true });
    assert.equal(result.ok, true);
  });

  it("confirmation never bypasses other safeguards", () => {
    const cases = [
      validateFormForPublish({ form: { ...draft, publication_state: "PUBLISHED" }, mappings: [], fieldsById: new Map(), pdfPageCount: 1, allowEmptyMappings: true }),
      validateFormForPublish({ form: draft, mappings: [], fieldsById: new Map(), pdfPageCount: null, pdfLoadError: "missing", allowEmptyMappings: true }),
      validateFormForPublish({ form: draft, mappings: [], fieldsById: new Map(), pdfPageCount: 0, allowEmptyMappings: true }),
      validateFormForPublish({ form: { ...draft, scope: "PRIVATE", owner_user_id: null }, mappings: [], fieldsById: new Map(), pdfPageCount: 1, allowEmptyMappings: true }),
    ];
    assert.deepEqual(cases.map((c) => c.ok), [false, false, false, false]);
    assert.deepEqual(cases.map((c) => c.issues[0]!.code), ["not_draft", "pdf_unreadable", "pdf_page_count_unknown", "private_owner"]);
  });
});

describe("forms with mappings keep every existing check", () => {
  it("valid mappings publish without any confirmation", () => {
    const result = validateFormForPublish({ form: draft, mappings: [mapping(), mapping({ id: "m2", page_number: 2, occurrence_index: 1 })], fieldsById: fields, pdfPageCount: 2, allowEmptyMappings: false });
    assert.equal(result.ok, true);
    assert.equal(result.requiresEmptyMappingsConfirmation, false);
  });

  it("duplicate, out-of-range, unlinked and inactive-field mappings still block (with or without confirmation)", () => {
    for (const allowEmptyMappings of [false, true]) {
      const dup = validateFormForPublish({ form: draft, mappings: [mapping(), mapping({ id: "m2" })], fieldsById: fields, pdfPageCount: 1, allowEmptyMappings });
      const page = validateFormForPublish({ form: draft, mappings: [mapping({ page_number: 3 })], fieldsById: fields, pdfPageCount: 1, allowEmptyMappings });
      const unlinked = validateFormForPublish({ form: draft, mappings: [mapping({ field_id: null })], fieldsById: fields, pdfPageCount: 1, allowEmptyMappings });
      const inactive = validateFormForPublish({ form: draft, mappings: [mapping()], fieldsById: new Map([["f1", { ...field, status: "DELETED" }]]), pdfPageCount: 1, allowEmptyMappings });
      assert.deepEqual([dup, page, unlinked, inactive].map((r) => r.ok), [false, false, false, false]);
      assert.deepEqual([dup, page, unlinked, inactive].map((r) => r.issues.find((i) => i.blocking)!.code), ["duplicate_mapping", "invalid_page", "mapping_unlinked", "inactive_field"]);
    }
  });
});

describe("Publish dialog decision (canConfirmPublish / remainingPublishBlockers)", () => {
  const zero = validateFormForPublish({ form: draft, mappings: [], fieldsById: new Map(), pdfPageCount: 1, allowEmptyMappings: false });

  it("zero mappings: disabled until the confirmation is checked, then enabled", () => {
    assert.equal(canConfirmPublish({ isPreviewLoading: false, preview: previewOf(zero), allowEmptyMappings: false, retirePreviousConfirmed: false }), false);
    assert.equal(canConfirmPublish({ isPreviewLoading: false, preview: previewOf(zero), allowEmptyMappings: true, retirePreviousConfirmed: false }), true);
    assert.deepEqual(remainingPublishBlockers(zero.issues, true), []);
    assert.equal(remainingPublishBlockers(zero.issues, false).length, 1);
  });

  it("the confirmation does not clear other blocking issues", () => {
    const broken = validateFormForPublish({ form: draft, mappings: [], fieldsById: new Map(), pdfPageCount: null, allowEmptyMappings: false });
    assert.equal(canConfirmPublish({ isPreviewLoading: false, preview: previewOf(broken), allowEmptyMappings: true, retirePreviousConfirmed: false }), false);
    assert.deepEqual(remainingPublishBlockers(broken.issues, true).map((i) => i.code), ["pdf_unreadable"]);
  });

  it("a family conflict still requires the retire-previous choice", () => {
    assert.equal(canConfirmPublish({ isPreviewLoading: false, preview: previewOf(zero, true), allowEmptyMappings: true, retirePreviousConfirmed: false }), false);
    assert.equal(canConfirmPublish({ isPreviewLoading: false, preview: previewOf(zero, true), allowEmptyMappings: true, retirePreviousConfirmed: true }), true);
  });

  it("nothing can be confirmed while the preview is loading or missing", () => {
    assert.equal(canConfirmPublish({ isPreviewLoading: true, preview: previewOf(zero), allowEmptyMappings: true, retirePreviousConfirmed: false }), false);
    assert.equal(canConfirmPublish({ isPreviewLoading: false, preview: null, allowEmptyMappings: true, retirePreviousConfirmed: false }), false);
  });

  it("forms with valid mappings need no checkbox", () => {
    const ok = validateFormForPublish({ form: draft, mappings: [mapping()], fieldsById: fields, pdfPageCount: 1, allowEmptyMappings: false });
    assert.equal(canConfirmPublish({ isPreviewLoading: false, preview: previewOf(ok), allowEmptyMappings: false, retirePreviousConfirmed: false }), true);
  });
});

describe("zero-mapping source contracts", () => {
  const page = readFileSync("components/forms/forms-page.tsx", "utf8");

  it("the Forms page uses the shared code and helpers, not a hard-coded issue code", () => {
    assert.doesNotMatch(page, /["']EMPTY_MAPPINGS["']/);
    assert.match(page, /canConfirmPublish\(/);
    assert.match(page, /remainingPublishBlockers\(/);
    assert.match(page, /Publish anyway with no field mappings/);
  });

  it("the server forwards the explicit confirmation and revalidates on Publish", () => {
    const actions = readFileSync("lib/forms/form-lifecycle-actions.ts", "utf8");
    assert.match(actions, /evaluatePublishReadiness\(supabase, form, \{\s*allowEmptyMappings: input\.allowEmptyMappings,/);
    assert.match(actions, /const blocking = readiness\.issues\.filter\(\(issue\) => issue\.blocking\)/);
  });

  it("the database publish function has no mapping-count requirement", () => {
    const sql = readFileSync("supabase/migrations/20260725180000_secure_publish_form_template.sql", "utf8");
    const body = sql.slice(sql.indexOf("create or replace function public.publish_form_template"));
    assert.doesNotMatch(body, /count\(\*\)[\s\S]{0,80}form_field_mappings/i);
  });

  it("adding a form to a packet requires only a published form, not mappings", () => {
    const packetForm = readFileSync("lib/types/packet-form.ts", "utf8");
    const add = packetForm.slice(packetForm.indexOf("export async function addInternalFormToPacket"), packetForm.indexOf("export async function addExternalFormToPacket"));
    assert.match(add, /\.eq\("publication_state", "PUBLISHED"\)/);
    assert.doesNotMatch(add, /form_field_mappings/);
  });
});
