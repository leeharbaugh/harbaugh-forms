import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approximateHelveticaWidth,
  fitTypedSignatureFontSize,
  layoutTextInBox,
  resolveFieldFontSize,
  typedSignatureFontSize,
  wrapTextToLines,
  PDF_MULTILINE_SHRINK_FLOOR,
  PDF_TEXT_PADDING_X,
} from "./pdf-text-layout.ts";

function measure(fontSize: number) {
  return (text: string) => approximateHelveticaWidth(text, fontSize);
}

describe("wrapTextToLines", () => {
  it("preserves explicit newlines", () => {
    const lines = wrapTextToLines(
      "Line one\nLine two",
      1000,
      measure(10),
    );
    assert.deepEqual(lines, ["Line one", "Line two"]);
  });

  it("wraps long paragraphs within max width", () => {
    const text = "alpha bravo charlie delta echo foxtrot";
    const lines = wrapTextToLines(text, 40, measure(10));
    assert.ok(lines.length > 1);
    for (const line of lines) {
      assert.ok(measure(10)(line) <= 40 + 0.01);
    }
  });

  it("hard-breaks oversized words instead of overflowing", () => {
    const lines = wrapTextToLines("SUPERCALIFRAGILISTIC", 25, measure(10));
    assert.ok(lines.length >= 2);
    for (const line of lines) {
      assert.ok(measure(10)(line) <= 25 + 0.01);
    }
  });
});

describe("layoutTextInBox multiline", () => {
  it("clips vertically to the field box", () => {
    const many = Array.from({ length: 40 }, (_, i) => `row ${i}`).join("\n");
    const layout = layoutTextInBox({
      text: many,
      boxWidth: 200,
      boxHeight: 36,
      fontSize: 10,
      isMultiline: true,
      measureWidth: measure(10),
    });
    assert.ok(layout.lines.length >= 1);
    assert.ok(
      layout.lines.length * layout.lineHeight <=
        36 - 2 + layout.lineHeight,
    );
    assert.equal(layout.clipped, true);
  });

  it("does not shrink below the multiline floor", () => {
    const many = Array.from({ length: 80 }, (_, i) => `row ${i}`).join("\n");
    const layout = layoutTextInBox({
      text: many,
      boxWidth: 120,
      boxHeight: 28,
      fontSize: 12,
      isMultiline: true,
      measureWidth: measure(12),
    });
    assert.ok(layout.fontSize >= PDF_MULTILINE_SHRINK_FLOOR);
  });

  it("single-line does not wrap on spaces into multiple drawn lines", () => {
    const layout = layoutTextInBox({
      text: "one two three four five",
      boxWidth: 40,
      boxHeight: 14,
      fontSize: 10,
      isMultiline: false,
      measureWidth: measure(10),
    });
    assert.equal(layout.lines.length, 1);
  });
});

describe("resolveFieldFontSize", () => {
  it("scales configured size with zoom without post-scale clamp", () => {
    const at100 = resolveFieldFontSize({
      configuredFontSize: 10,
      boxHeightPdf: 14,
      isMultiline: false,
      scale: 1,
    });
    const at195 = resolveFieldFontSize({
      configuredFontSize: 10,
      boxHeightPdf: 14,
      isMultiline: false,
      scale: 1.95,
    });
    const at250 = resolveFieldFontSize({
      configuredFontSize: 10,
      boxHeightPdf: 14,
      isMultiline: false,
      scale: 2.5,
    });
    assert.equal(at100, 10);
    assert.ok(Math.abs(at195 - 19.5) < 0.001);
    assert.ok(Math.abs(at250 - 25) < 0.001);
  });

  it("uses more of the box height for single-line when no config", () => {
    const size = resolveFieldFontSize({
      configuredFontSize: null,
      boxHeightPdf: 16,
      isMultiline: false,
      scale: 1,
    });
    assert.ok(size >= 10);
  });

  it("accounts for horizontal padding constant", () => {
    assert.equal(PDF_TEXT_PADDING_X, 2);
  });
});

describe("typedSignatureFontSize", () => {
  it("derives a readable size from box height", () => {
    const size = typedSignatureFontSize(36);
    assert.ok(size >= 10);
    assert.ok(size <= 36 * 0.85);
    const fitted = fitTypedSignatureFontSize({
      text: "VeryLongSignatureNameWithoutSpaces",
      boxWidth: 40,
      boxHeight: 36,
      measureWidth: (text) => text.length * 10,
    });
    assert.ok(fitted < size);
    assert.ok(fitted >= 6);
  });
});
