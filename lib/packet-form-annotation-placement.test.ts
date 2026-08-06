import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  buildAnnotationInputFromPlacementClick,
  defaultFontIdForAnnotationType,
  defaultSizeForAnnotationType,
} from "@/lib/packet-form-annotation-placement";
import { defaultDateSignedSize } from "@/lib/date-signed-annotation";
import {
  defaultTypedSignatureSize,
  validatePacketFormAnnotationInput,
  type PacketFormAnnotationType,
} from "@/lib/types/packet-form-annotation";
import type { PageMetrics } from "@/lib/types/template-pdf-field";

const PAGE: PageMetrics = {
  originalWidth: 612,
  originalHeight: 792,
  renderedWidth: 612,
  renderedHeight: 792,
};

const PAGE_ONE: PageMetrics = {
  originalWidth: 612,
  originalHeight: 792,
  renderedWidth: 306,
  renderedHeight: 396,
};

describe("Fill Form interactive annotation placement factory", () => {
  it("places typed_signature with Caveat defaults and finite clamped coords", () => {
    const input = buildAnnotationInputFromPlacementClick(
      { annotation_type: "typed_signature", text_value: "Lee Harbaugh" },
      {
        pageNumber: 11,
        metrics: PAGE,
        overlayX: 200,
        overlayY: 400,
      },
    );

    assert.equal(input.annotation_type, "typed_signature");
    assert.equal(input.font_id, "caveat");
    assert.equal(input.text_value, "Lee Harbaugh");
    assert.equal(input.page_number, 11);
    assert.equal(validatePacketFormAnnotationInput(input), null);
    assert.ok(Number.isFinite(input.x) && Number.isFinite(input.y));
    assert.ok(input.width > 0 && input.height > 0);
    assert.equal(input.height, defaultTypedSignatureSize("Lee Harbaugh").height);
    assert.ok(input.x >= 0 && input.x + input.width <= PAGE.originalWidth);
    assert.ok(input.y >= 0 && input.y + input.height <= PAGE.originalHeight);
  });

  it("places date_signed with Helvetica defaults (not Caveat sizing)", () => {
    const text = "08/06/2026";
    const input = buildAnnotationInputFromPlacementClick(
      { annotation_type: "date_signed", text_value: text },
      {
        pageNumber: 11,
        metrics: PAGE,
        overlayX: 180,
        overlayY: 520,
      },
    );

    assert.equal(input.annotation_type, "date_signed");
    assert.equal(input.font_id, "helvetica");
    assert.equal(input.text_value, text);
    assert.equal(input.page_number, 11);
    assert.equal(validatePacketFormAnnotationInput(input), null);
    assert.deepEqual(
      { width: input.width, height: input.height },
      defaultDateSignedSize(text),
    );
    assert.notEqual(input.height, defaultTypedSignatureSize(text).height);
    assert.ok(Number.isFinite(input.x) && Number.isFinite(input.y));
    assert.ok(input.x >= 0 && input.x + input.width <= PAGE.originalWidth);
    assert.ok(input.y >= 0 && input.y + input.height <= PAGE.originalHeight);
  });

  it("rejects unknown annotation types before persistence", () => {
    assert.throws(
      () =>
        buildAnnotationInputFromPlacementClick(
          {
            // Runtime unknown; cast only to satisfy the PendingAnnotationPlace shape.
            annotation_type: "highlight" as PacketFormAnnotationType,
            text_value: "nope",
          },
          {
            pageNumber: 1,
            metrics: PAGE_ONE,
            overlayX: 10,
            overlayY: 10,
          },
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message === "Unsupported annotation type.",
    );
    assert.match(
      validatePacketFormAnnotationInput({
        page_number: 1,
        annotation_type: "free_text" as never,
        text_value: "nope",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      }) ?? "",
      /Unsupported annotation type/,
    );
  });

  it("scales click coords from overlay space and clamps to page bounds", () => {
    const input = buildAnnotationInputFromPlacementClick(
      { annotation_type: "date_signed", text_value: "08/06/2026" },
      {
        pageNumber: 1,
        metrics: PAGE_ONE,
        // Far outside the rendered page — must clamp into PDF page space.
        overlayX: 10_000,
        overlayY: 10_000,
      },
    );

    assert.equal(input.page_number, 1);
    assert.equal(input.annotation_type, "date_signed");
    assert.ok(input.x + input.width <= PAGE_ONE.originalWidth + 1e-9);
    assert.ok(input.y + input.height <= PAGE_ONE.originalHeight + 1e-9);
    assert.ok(input.x >= 0 && input.y >= 0);
  });

  it("keeps default font helpers aligned with supported types only", () => {
    assert.equal(defaultFontIdForAnnotationType("date_signed"), "helvetica");
    assert.equal(defaultFontIdForAnnotationType("typed_signature"), "caveat");
    assert.equal(
      defaultSizeForAnnotationType("date_signed", "08/06/2026").height,
      18,
    );
    assert.equal(
      defaultSizeForAnnotationType("typed_signature", "Lee").height,
      36,
    );
  });

  it("wires the editor click path through the placement factory", () => {
    const editor = readFileSync(
      "components/packets/packet-form-editor.tsx",
      "utf8",
    );
    assert.match(editor, /buildAnnotationInputFromPlacementClick/);
    assert.match(editor, /createPacketFormAnnotation/);
    assert.doesNotMatch(
      editor,
      /defaultDateSignedSize|defaultTypedSignatureSize/,
    );
  });
});
