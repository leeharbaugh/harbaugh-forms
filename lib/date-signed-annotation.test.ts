import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  DATE_SIGNED_FORMATS,
  DEFAULT_DATE_SIGNED_FORMAT,
  defaultDateSignedSize,
  formatDateSigned,
  isValidCalendarDateIso,
  localCalendarDateIso,
} from "./date-signed-annotation.ts";
import {
  validatePacketFormAnnotationInput,
  PACKET_FORM_ANNOTATION_TYPES,
} from "./types/packet-form-annotation.ts";

const FIXED_NOW = new Date(2026, 7, 6, 15, 30, 0); // Aug 6, 2026 local

describe("date signed formatting", () => {
  it("defaults local calendar date from a fixed Date (not UTC timestamp)", () => {
    assert.equal(localCalendarDateIso(FIXED_NOW), "2026-08-06");
  });

  it("formats supported options for a fixed ISO date", () => {
    assert.equal(DEFAULT_DATE_SIGNED_FORMAT, "MM/DD/YYYY");
    assert.deepEqual([...DATE_SIGNED_FORMATS], [
      "MM/DD/YYYY",
      "M/D/YYYY",
      "Month D, YYYY",
    ]);
    assert.equal(formatDateSigned("2026-08-06", "MM/DD/YYYY"), "08/06/2026");
    assert.equal(formatDateSigned("2026-08-06", "M/D/YYYY"), "8/6/2026");
    assert.equal(
      formatDateSigned("2026-08-06", "Month D, YYYY"),
      "August 6, 2026",
    );
  });

  it("rejects invalid calendar dates", () => {
    assert.equal(isValidCalendarDateIso("2026-02-30"), false);
    assert.equal(isValidCalendarDateIso("2026-13-01"), false);
    assert.throws(() => formatDateSigned("not-a-date", "MM/DD/YYYY"));
  });

  it("sizes date boxes from formatted text length", () => {
    const short = defaultDateSignedSize("8/6/2026");
    const long = defaultDateSignedSize("August 6, 2026");
    assert.ok(long.width >= short.width);
    assert.equal(short.height, 18);
  });
});

describe("date_signed annotation contracts", () => {
  it("allows date_signed in the type union and validator", () => {
    assert.ok(PACKET_FORM_ANNOTATION_TYPES.includes("date_signed"));
    assert.equal(
      validatePacketFormAnnotationInput({
        page_number: 1,
        annotation_type: "date_signed",
        text_value: "08/06/2026",
        x: 10,
        y: 20,
        width: 90,
        height: 18,
      }),
      null,
    );
    assert.match(
      validatePacketFormAnnotationInput({
        page_number: 1,
        annotation_type: "date_signed",
        text_value: "   ",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      }) ?? "",
      /date/i,
    );
  });

  it("adds a forward migration widening the annotation_type check", () => {
    const migration = readFileSync(
      "supabase/migrations/20260806150000_packet_form_annotations_date_signed.sql",
      "utf8",
    );
    assert.match(migration, /date_signed/);
    assert.match(migration, /typed_signature/);
    assert.match(migration, /packet_form_annotations_annotation_type_check/);
  });

  it("keeps create helpers and Helvetica date rendering in app code", () => {
    const crud = readFileSync("lib/packet-form-annotations.ts", "utf8");
    const fill = readFileSync("lib/fill-packet-form-pdf.ts", "utf8");
    const overlay = readFileSync(
      "components/packets/packet-form-annotation-overlay.tsx",
      "utf8",
    );
    assert.match(crud, /createDateSignedAnnotation/);
    assert.match(crud, /createPacketFormAnnotation/);
    assert.match(fill, /date_signed/);
    assert.match(fill, /isDate \? font : signatureFont/);
    assert.match(overlay, /date_signed/);
    assert.match(overlay, /Helvetica/);
  });

  it("does not auto-pair signature and date placement", () => {
    const editor = readFileSync(
      "components/packets/packet-form-editor.tsx",
      "utf8",
    );
    assert.match(editor, /Date Signed/);
    assert.match(editor, /buildAnnotationInputFromPlacementClick/);
    assert.match(editor, /createPacketFormAnnotation/);
    assert.doesNotMatch(editor, /auto.*date.*signature|pair.*signature.*date/i);
  });
});
