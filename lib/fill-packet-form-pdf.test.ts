import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

describe("fillPacketFormPdfBytes source contracts", () => {
  const source = readFileSync("lib/fill-packet-form-pdf.ts", "utf8");

  it("draws mask_background before text", () => {
    assert.match(source, /function drawMaskIfNeeded/);
    assert.match(source, /drawMaskIfNeeded\(page, placement\)/);
    const maskIdx = source.indexOf("drawMaskIfNeeded(page, placement)");
    const drawTextIdx = source.indexOf("page.drawText(line");
    assert.ok(maskIdx > 0 && drawTextIdx > maskIdx);
  });

  it("uses shared multiline layout helper", () => {
    assert.match(source, /layoutTextInBox/);
    assert.match(source, /isMultiline: placement\.isMultiline/);
  });

  it("forces overlay path when mask or multiline is set on AcroForm fields", () => {
    assert.match(source, /mask_background === true/);
    assert.match(source, /is_multiline === true/);
    assert.match(source, /return false/);
  });

  it("renders typed signature annotations separately from field instances", () => {
    assert.match(source, /drawTypedSignatureAnnotation/);
    assert.match(source, /options\?\.annotations/);
    assert.doesNotMatch(source, /field_instances/);
  });

  it("registers fontkit before embedding custom signature fonts", () => {
    assert.match(source, /registerFontkit\(/);
    assert.match(source, /@pdf-lib\/fontkit/);
  });

  it("disables object streams when saving so Caveat FontFile2 persists", () => {
    assert.match(source, /save\(\{\s*useObjectStreams:\s*false\s*\}\)/);
  });
});

describe("Fill Form overlay font scaling source contracts", () => {
  const overlay = readFileSync(
    "components/packets/packet-form-field-overlay.tsx",
    "utf8",
  );

  it("scales font size with rendered/original page metrics", () => {
    assert.match(overlay, /resolveFieldFontSize/);
    assert.match(overlay, /metrics\.renderedHeight \/ originalHeight/);
    assert.doesNotMatch(overlay, /text-\[10px\]/);
  });

  it("supports multiline display and textarea editing", () => {
    assert.match(overlay, /is_multiline/);
    assert.match(overlay, /textarea/);
    assert.match(overlay, /whitespace-pre-wrap/);
  });

  it("applies opaque background only when mask_background is set", () => {
    assert.match(overlay, /mask_background/);
    assert.match(overlay, /opaqueMask/);
  });
});
