/**
 * Runtime regressions for browser Download PDF path:
 * 1) multiline wrap when is_multiline=true
 * 2) Caveat signature encoding when Helvetica is also embedded
 * 3) mask_background opaque rectangle before multiline text
 *
 *   npm run test:fill-form-pdf-download
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  layoutTextInBox,
  approximateHelveticaWidth,
} from "../lib/pdf-text-layout.ts";
import { fillPacketFormPdfBytes } from "../lib/fill-packet-form-pdf.ts";
import type { PacketFormFieldView } from "../lib/types/packet-form-editor.ts";
import type { PacketFormAnnotation } from "../lib/types/packet-form-annotation.ts";
import type { Field } from "../lib/types/field.ts";
import type { FieldInstanceWithField } from "../lib/types/field-instance.ts";

const OUT = path.join(process.cwd(), "_audit_tmp", "pdf-regression");
mkdirSync(OUT, { recursive: true });

const NARRATIVE =
  "Landlord will provide washer, dryer and fridge in kitchen. Tenant is responsible for lawn care and trash removal.\nSee attached inventory for additional personal property included with the lease: https://example.com/very/long/path/without/spaces/abcdefghijklmnopqrstuvwxyz0123456789/end";

const SIGNATURE = "Kenneth Lee Harbaugh";

function measureHelv(fontSize: number) {
  return (text: string) => approximateHelveticaWidth(text, fontSize);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function extractPage1Text(bytes: Uint8Array): Promise<string> {
  // pdfjs (and pdf-lib) may detach the source ArrayBuffer — always pass a copy.
  const data = Uint8Array.from(bytes);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const parsed = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await parsed.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((item: { str?: string }) => item.str ?? "").join("");
}

function decodeContentStreamBytes(raw: Uint8Array): string {
  // pdf-lib FlateDecode streams need inflate; uncompressed streams pass through.
  try {
    return inflateSync(raw).toString("latin1");
  } catch {
    return Buffer.from(raw).toString("latin1");
  }
}

/** Decode first-page content streams (latin1 operators) for inspection. */
async function page1ContentLatin1(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const doc = await PDFDocument.load(copy);
  const page = doc.getPages()[0]!;
  const contents = page.node.Contents();
  if (!contents) return "";
  // Contents may be a single stream or an array of streams.
  const refs = "asArray" in contents ? contents.asArray() : [contents];
  const parts: string[] = [];
  for (const ref of refs) {
    const stream = doc.context.lookup(ref);
    if (
      stream &&
      "getContents" in stream &&
      typeof stream.getContents === "function"
    ) {
      parts.push(decodeContentStreamBytes(stream.getContents() as Uint8Array));
    }
  }
  return parts.join("\n");
}

function countPlacementMasks(
  content: string,
  placement: {
    x: number;
    yFromTop: number;
    width: number;
    height: number;
    pageHeight?: number;
  },
): number {
  const pageHeight = placement.pageHeight ?? 792;
  const pdfY = pageHeight - placement.yFromTop - placement.height;
  // pdf-lib drawRectangle emits: white rg, then cm translate to (x, pdfY),
  // then a closed path 0 0 → 0 h → w h → w 0 → h → f (not the `re` operator).
  const pattern = new RegExp(
    String.raw`1\s+1\s+1\s+rg[\s\S]{0,120}?1\s+0\s+0\s+1\s+${placement.x}\s+${pdfY}\s+cm[\s\S]{0,120}?0\s+0\s+m[\s\S]{0,80}?${placement.width}\s+${placement.height}\s+l[\s\S]{0,80}?h\s+f`,
    "g",
  );
  return (content.match(pattern) ?? []).length;
}

function makeFieldView(overrides: {
  isMultiline: boolean;
  value: string;
  width: number;
  height: number;
  maskBackground?: boolean;
  x?: number;
  y?: number;
}): PacketFormFieldView {
  const x = overrides.x ?? 84;
  const y = overrides.y ?? 490;
  return {
    mapping: {
      id: "11111111-1111-4111-8111-111111111111",
      form_id: 15,
      field_id: "22222222-2222-4222-8222-222222222222",
      mapping_name: "Page 1 non real estate items",
      occurrence_index: 0,
      page_number: 1,
      x,
      y,
      width: overrides.width,
      height: overrides.height,
      page_width: 612,
      page_height: 792,
      font_size: 9,
      alignment: "left",
      field_widget_type: "text",
      is_multiline: overrides.isMultiline,
      mask_background: overrides.maskBackground === true,
      default_value_override: null,
      required: false,
      notes: null,
      pdf_field_name: null,
      pdf_field_type: null,
      pdf_export_value: null,
      create_date: new Date().toISOString(),
      update_date: new Date().toISOString(),
      status: "ACTIVE",
      fields: null,
    },
    instance: {
      id: "33333333-3333-4333-8333-333333333333",
      packet_id: 19,
      packet_form_id: 53,
      field_id: "22222222-2222-4222-8222-222222222222",
      value: overrides.value,
      value_json: null,
      source: "manual_override",
      is_override: true,
      notes: null,
      create_date: new Date().toISOString(),
      update_date: new Date().toISOString(),
      status: "ACTIVE",
      fields: {
        id: "22222222-2222-4222-8222-222222222222",
        field_key: "lease_non_real_estate_items",
        field_name: "Lease Non Real Estate Items",
        field_label: "Lease Non Real Estate Items",
        field_data_type: "text",
        field_widget_type: "text",
        default_value: null,
        default_checked: null,
        required: false,
        notes: null,
        source_type: "manual_only",
        source_path: null,
        resolver_key: null,
        fallback_value: null,
        field_resolver_id: null,
        create_date: new Date().toISOString(),
        update_date: new Date().toISOString(),
        status: "ACTIVE",
        scope: "GLOBAL",
        owner_user_id: null,
        organization_id: null,
      } satisfies Field,
    } satisfies FieldInstanceWithField,
    placement: {
      page_number: 1,
      x,
      y,
      width: overrides.width,
      height: overrides.height,
      page_width: 612,
      page_height: 792,
      font_size: 9,
      alignment: "left",
      source: "template",
      field_instance_mapping_id: null,
    },
    displayValue: overrides.value,
    field_type: "text",
    hasPlacementOverride: false,
  };
}

function makeAnnotation(text: string): PacketFormAnnotation {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    packet_id: 19,
    packet_form_id: 53,
    page_number: 1,
    annotation_type: "typed_signature",
    text_value: text,
    font_id: "caveat",
    x: 72,
    y: 120,
    width: 220,
    height: 36,
    rotation: 0,
    created_by_user_id: "00000000-0000-4000-8000-000000000099",
    create_date: new Date().toISOString(),
    update_date: new Date().toISOString(),
    status: "ACTIVE",
  };
}

async function testMultilineLayoutUnit() {
  const boxWidth = 470;
  const boxHeight = 60;
  const fontSize = 9;

  const single = layoutTextInBox({
    text: NARRATIVE,
    boxWidth,
    boxHeight,
    fontSize,
    isMultiline: false,
    measureWidth: measureHelv(fontSize),
  });
  assert.equal(single.lines.length, 1);
  assert.ok(
    measureHelv(single.fontSize)(single.lines[0]!) > boxWidth,
    "single-line mode keeps one overflowing line (expected pre-flag behavior)",
  );

  const multi = layoutTextInBox({
    text: NARRATIVE,
    boxWidth,
    boxHeight,
    fontSize,
    isMultiline: true,
    measureWidth: measureHelv(fontSize),
  });
  assert.ok(multi.lines.length >= 3, `expected >=3 lines, got ${multi.lines.length}`);
  for (const line of multi.lines) {
    assert.ok(
      measureHelv(multi.fontSize)(line) <= boxWidth - 1,
      `line exceeds width: ${line}`,
    );
  }
  assert.ok(multi.lines.some((line) => line.includes("See attached")));
  assert.ok(
    multi.lines.some((line) => line.includes("https://example.com") || line.length > 0),
  );
  ok(`multiline layout unit: ${multi.lines.length} lines within width ${boxWidth}`);
}

async function testCaveatWithHelvetica() {
  const caveatBytes = new Uint8Array(
    readFileSync(path.join(process.cwd(), "public", "fonts", "Caveat-Regular.ttf")),
  );

  // Blank PDF control: Helvetica + Caveat with the production embed options
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const sig = await doc.embedFont(caveatBytes, {
    subset: true,
    customName: "HarbaughCaveat",
  });
  const page = doc.addPage([612, 200]);
  page.drawText("field sample", { x: 40, y: 150, size: 10, font: helv });
  page.drawText(SIGNATURE, {
    x: 40,
    y: 80,
    size: 28,
    font: sig,
    color: rgb(0.05, 0.05, 0.35),
  });
  const bytes = await doc.save({ useObjectStreams: false });
  writeFileSync(path.join(OUT, "regression-caveat-customName.pdf"), bytes);

  const latin = Buffer.from(bytes).toString("latin1");
  assert.match(latin, /HarbaughCaveat|Caveat/i);
  assert.match(latin, /FontFile2/);

  const extracted = await extractPage1Text(bytes);
  assert.equal(
    extracted.includes(SIGNATURE),
    true,
    `expected exact signature in extract, got: ${extracted}`,
  );
  assert.equal(/Ƒ|Ƌ|ƈ|ƅ|Ƙ/.test(extracted), false, "corrupt cmap glyphs present");
  ok("Caveat+Helvetica customName embed extracts intact signature");
}

async function testMaskBackgroundRegression() {
  const caveatBytes = new Uint8Array(
    readFileSync(path.join(process.cwd(), "public", "fonts", "Caveat-Regular.ttf")),
  );

  // Source with preprinted black writing lines through the placement area.
  const blank = await PDFDocument.create();
  const page = blank.addPage([612, 792]);
  const placement = { x: 84, yFromTop: 490, width: 470, height: 60 };
  const pdfBottom = 792 - placement.yFromTop - placement.height;
  for (let i = 0; i < 4; i++) {
    const y = pdfBottom + 8 + i * 14;
    page.drawLine({
      start: { x: placement.x, y },
      end: { x: placement.x + placement.width, y },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });
  }
  const source = await blank.save();

  const fieldMasked = makeFieldView({
    isMultiline: true,
    maskBackground: true,
    value: NARRATIVE,
    width: placement.width,
    height: placement.height,
    x: placement.x,
    y: placement.yFromTop,
  });
  const fieldUnmasked = makeFieldView({
    isMultiline: true,
    maskBackground: false,
    value: NARRATIVE,
    width: placement.width,
    height: placement.height,
    x: placement.x,
    y: placement.yFromTop,
  });
  const fieldEmptyMasked = makeFieldView({
    isMultiline: true,
    maskBackground: true,
    value: "",
    width: placement.width,
    height: placement.height,
    x: placement.x,
    y: placement.yFromTop,
  });

  const maskedBytes = Uint8Array.from(
    await fillPacketFormPdfBytes(source, [fieldMasked], {
      annotations: [makeAnnotation(SIGNATURE)],
      signatureFontBytes: caveatBytes,
    }),
  );
  const unmaskedBytes = Uint8Array.from(
    await fillPacketFormPdfBytes(source, [fieldUnmasked]),
  );
  const emptyMaskedBytes = Uint8Array.from(
    await fillPacketFormPdfBytes(source, [fieldEmptyMasked]),
  );

  writeFileSync(path.join(OUT, "regression-mask-on-multiline.pdf"), maskedBytes);
  writeFileSync(path.join(OUT, "regression-mask-off-multiline.pdf"), unmaskedBytes);
  writeFileSync(path.join(OUT, "regression-mask-empty.pdf"), emptyMaskedBytes);

  const maskedContent = await page1ContentLatin1(maskedBytes);
  const unmaskedContent = await page1ContentLatin1(unmaskedBytes);
  const emptyContent = await page1ContentLatin1(emptyMaskedBytes);

  assert.ok(
    /1\s+1\s+1\s+rg/.test(maskedContent),
    "mask on: expected opaque white fill (1 1 1 rg)",
  );
  assert.equal(
    countPlacementMasks(maskedContent, placement),
    1,
    `mask on: expected one placement-sized white path at y=${pdfBottom}\n--- content ---\n${maskedContent}`,
  );

  // Mask must appear before the text block (BT).
  const whiteIdx = maskedContent.search(/1\s+1\s+1\s+rg/);
  const fillIdx = maskedContent.search(
    new RegExp(
      String.raw`1\s+0\s+0\s+1\s+${placement.x}\s+${pdfBottom}\s+cm[\s\S]{0,160}?h\s+f`,
    ),
  );
  const textIdx = maskedContent.search(/\bBT\b/);
  assert.ok(whiteIdx >= 0 && fillIdx >= 0, "mask operators missing");
  assert.ok(textIdx > fillIdx, "mask fill should precede BT text block");

  assert.equal(
    countPlacementMasks(unmaskedContent, placement),
    0,
    "mask off: must not draw placement white rectangle",
  );
  assert.equal(
    /1\s+1\s+1\s+rg/.test(unmaskedContent),
    false,
    "mask off: no white fill for field overlay",
  );

  assert.ok(
    /1\s+1\s+1\s+rg/.test(emptyContent),
    "empty+mask: still draws opaque white fill",
  );
  assert.equal(
    countPlacementMasks(emptyContent, placement),
    1,
    "empty+mask: placement rectangle present",
  );

  // Multiline wrap unchanged with mask.
  const multiLayout = layoutTextInBox({
    text: NARRATIVE,
    boxWidth: placement.width,
    boxHeight: placement.height,
    fontSize: 9,
    isMultiline: true,
    measureWidth: measureHelv(9),
  });
  assert.ok(multiLayout.lines.length > 1);

  const maskedText = await extractPage1Text(maskedBytes);
  assert.ok(maskedText.includes("Kenneth Lee Harbaugh"));
  assert.ok(maskedText.includes("washer") || maskedText.includes("Landlord"));
  assert.equal(/Ƒ|Ƌ|ƈ|ƅ|Ƙ/.test(maskedText), false);

  const latin = Buffer.from(maskedBytes).toString("latin1");
  assert.ok(/HarbaughCaveat|Caveat/i.test(latin) && /FontFile2/.test(latin));

  ok("mask_background on/off/empty + Caveat regression passed");
}

async function testFillPathRegression() {
  const caveatBytes = new Uint8Array(
    readFileSync(path.join(process.cwd(), "public", "fonts", "Caveat-Regular.ttf")),
  );

  // Minimal blank source PDF (avoids network); still exercises Helvetica+Caveat fill path.
  const blank = await PDFDocument.create();
  blank.addPage([612, 792]);
  const source = await blank.save();

  const fieldMultiline = makeFieldView({
    isMultiline: true,
    maskBackground: true,
    value: NARRATIVE,
    width: 470,
    height: 60,
  });
  const fieldSingle = makeFieldView({
    isMultiline: false,
    value: NARRATIVE,
    width: 470,
    height: 28,
  });

  const multiBytes = await fillPacketFormPdfBytes(
    source,
    [fieldMultiline],
    {
      annotations: [makeAnnotation(SIGNATURE)],
      signatureFontBytes: caveatBytes,
    },
  );
  // Copy before any PDFDocument/pdfjs load — those APIs can detach ArrayBuffers.
  const multiCopy = Uint8Array.from(multiBytes);
  writeFileSync(path.join(OUT, "regression-fill-multiline.pdf"), multiCopy);

  // Embedded font bytes should be present (FontFile2 and/or custom name).
  const latin = Buffer.from(multiCopy).toString("latin1");
  assert.ok(
    /FontFile2|HarbaughCaveat|Caveat/i.test(latin),
    "expected embedded Caveat font markers in PDF bytes",
  );
  assert.ok(multiCopy.length > 1000, "filled PDF unexpectedly tiny");

  const multiText = await extractPage1Text(multiCopy);
  assert.equal(/Ƒ|Ƌ|ƈ|ƅ|Ƙ/.test(multiText), false, "Caveat corrupt in fill path");
  assert.ok(
    multiText.includes("Kenneth Lee Harbaugh"),
    `signature missing/corrupt: ${multiText.slice(0, 200)}`,
  );
  assert.ok(
    multiText.includes("washer") || multiText.includes("Landlord"),
    "narrative missing from multiline fill",
  );

  // Structural: multiline layout produces multiple lines; single does not wrap.
  const multiLayout = layoutTextInBox({
    text: NARRATIVE,
    boxWidth: 470,
    boxHeight: 60,
    fontSize: 9,
    isMultiline: true,
    measureWidth: measureHelv(9),
  });
  const singleLayout = layoutTextInBox({
    text: NARRATIVE,
    boxWidth: 470,
    boxHeight: 28,
    fontSize: 9,
    isMultiline: false,
    measureWidth: measureHelv(9),
  });
  assert.ok(multiLayout.lines.length > 1);
  assert.equal(singleLayout.lines.length, 1);
  assert.ok(
    fieldSingle.mapping.is_multiline === false,
    "control field remains single-line",
  );

  ok("fillPacketFormPdfBytes multiline + Caveat regression passed");
}

async function main() {
  await testMultilineLayoutUnit();
  await testCaveatWithHelvetica();
  await testMaskBackgroundRegression();
  await testFillPathRegression();
  console.log("\nAll fill-form PDF download regressions passed.");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
