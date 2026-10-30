import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  StandardFonts,
  decodePDFRawStream,
  degrees,
} from "pdf-lib";
import {
  decodeStringOperand,
  extractedTextMatches,
  findPatternOccurrences,
  findTextBlocks,
  redactTemplatePersonalization,
  tokenizeContentStream,
} from "./template-personalization-redaction";
import { fillPacketFormPdfBytes } from "../fill-packet-form-pdf";
import { buildPacketFormFieldViews, type PacketFormFieldView } from "../types/packet-form-editor";
import type { Field } from "../types/field";
import type { FieldInstanceWithField } from "../types/field-instance";
import type { FormFieldMapping } from "../types/form-field-mapping";

// Fictional personalization only.
const FOOTER = "Example Realty, 100 Main St | (555) 010-0100";
const NAME = "Jordan Example";
const PATTERNS = [/Jordan\s+Example/i, /555\)\s*010-0100/];

/** Template-like PDF: imported form pages (Form XObjects) + a top-level personalized overlay. */
async function buildTemplate(options: { personalInsideForm?: boolean; personalTitle?: boolean; rotateSecond?: boolean } = {}) {
  const source = await PDFDocument.create();
  const sFont = await source.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 2; n++) {
    const p = source.addPage([612, 792]);
    p.drawText(`(TXR-0000) 01-01-26   Page ${n} of 2`, { x: 36, y: 48, size: 9, font: sFont });
    p.drawText("Initialed for Identification by Broker/Associate", { x: 144, y: 60, size: 9, font: sFont });
    if (options.personalInsideForm && n === 1) p.drawText(`Agent: ${NAME}`, { x: 36, y: 700, size: 9, font: sFont });
  }
  const doc = await PDFDocument.create();
  if (options.personalTitle) doc.setTitle(`Prepared for ${NAME}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const embedded = await doc.embedPdf(await source.save(), [0, 1]);
  embedded.forEach((form, i) => {
    const page = doc.addPage([612, 792]);
    page.drawPage(form);
    page.drawText(FOOTER, { x: 34, y: 25.9, size: 7, font });
    page.drawText(NAME, { x: 34, y: 17.4, size: 7, font });
    if (i === 1 && options.rotateSecond) page.setRotation(degrees(90));
    if (i === 0) {
      const link = doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [2, 1, 19, 2], Border: [0, 0, 0] });
      page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(link)]));
    }
  });
  return doc.save({ useObjectStreams: false });
}

async function texts(bytes: Uint8Array): Promise<string[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const d = await pdfjs.getDocument({ data: Uint8Array.from(bytes), verbosity: 0 }).promise;
  const out: string[][] = [];
  for (let n = 1; n <= d.numPages; n++) {
    out.push(((await (await d.getPage(n)).getTextContent()).items as { str?: string; transform?: number[] }[])
      .filter((i) => i.str?.trim())
      .map((i) => `${i.str}@${i.transform![4].toFixed(2)},${i.transform![5].toFixed(2)}`));
  }
  return out;
}

function xobjectBytes(doc: PDFDocument): string[] {
  const out: string[] = [];
  for (const page of doc.getPages()) {
    const xo = (page.node.lookup(PDFName.of("Resources")) as PDFDict).lookup(PDFName.of("XObject")) as PDFDict;
    for (const key of xo.keys()) out.push(Buffer.from(decodePDFRawStream(doc.context.lookup(xo.get(key)) as PDFRawStream).decode()).toString("hex"));
  }
  return out;
}

function geometry(doc: PDFDocument) {
  return doc.getPages().map((p) => ({
    size: `${p.getWidth()}x${p.getHeight()}`,
    rotate: p.getRotation().angle,
    boxes: ["MediaBox", "CropBox", "TrimBox", "BleedBox", "ArtBox"].map((b) => p.node.lookup(PDFName.of(b))?.toString() ?? "-").join("|"),
    annots: (p.node.lookup(PDFName.of("Annots")) as PDFArray | undefined)?.asArray().map((a) => String((doc.context.lookup(a as PDFRef) as PDFDict).lookup(PDFName.of("Rect")))).join(";") ?? "none",
  }));
}

describe("content-stream lexer and string decoding", () => {
  it("decodes escapes, octal, line continuations and nested parentheses", () => {
    assert.equal(decodeStringOperand(String.raw`(a \(b\) c\\ \101\102 (nested) \t)`), "a (b) c\\ AB (nested) \t");
    assert.equal(decodeStringOperand("(line one\\\nline two)"), "line oneline two");
    assert.equal(decodeStringOperand("<4A6F7264616E>"), "Jordan");
  });

  it("finds BT…ET blocks and their shown text, including TJ arrays and hex strings", () => {
    const src = "q /TPL1 Do Q\nBT /F2 7 Tf 34 25 Td [(Jordan ) -250 <4578616D706C65>] TJ ET\nBT 3 Tr (x) Tj ET";
    const blocks = findTextBlocks(src);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].text, "Jordan Example");
    assert.equal(src.slice(blocks[0].start, blocks[0].end).startsWith("BT"), true);
    assert.ok(tokenizeContentStream("(a (b) c) Tj").some((t) => t.kind === "op" && t.value === "Tj"));
  });

  it("refuses streams with inline images", () => {
    assert.throws(() => findTextBlocks("BI /W 1 /H 1 ID \x00 EI"), /inline image/);
  });
});

describe("redactTemplatePersonalization", () => {
  it("removes the personalized overlay text from the underlying PDF, not just visually", async () => {
    const original = await buildTemplate({ rotateSecond: true });
    assert.ok((await extractedTextMatches(original, PATTERNS)).length > 0, "fixture contains the personalization");

    const { bytes, report } = await redactTemplatePersonalization(original, { patterns: PATTERNS, apply: true });
    assert.ok(bytes, "redacted bytes returned");
    assert.equal(report.removedBlocks.length, 4);
    assert.deepEqual(report.blockedMatches, []);
    assert.deepEqual(report.unsupported, []);

    assert.deepEqual(await extractedTextMatches(bytes!, PATTERNS), [], "not found by text extraction");
    const reloaded = await PDFDocument.load(bytes!);
    assert.deepEqual(findPatternOccurrences(reloaded, PATTERNS), [], "not present in any decoded object or string");
    const raw = Buffer.from(bytes!).toString("latin1");
    assert.equal(raw.includes("Jordan"), false);

    // The edited stream keeps its object number and now carries a white fill in the footer box.
    const before = await PDFDocument.load(original);
    const ref = before.getPage(0).node.get(PDFName.of("Contents"));
    const refs = ref instanceof PDFArray ? ref.asArray() : [ref];
    const edited = refs.map((r) => Buffer.from(decodePDFRawStream(reloaded.context.lookup(r as PDFRef) as PDFRawStream).decode()).toString("latin1")).join("\n");
    assert.match(edited, /q 1 1 1 rg [\d.]+ [\d.]+ [\d.]+ [\d.]+ re f Q/);
    assert.ok(reloaded.context.enumerateIndirectObjects().length <= before.context.enumerateIndirectObjects().length, "no orphaned copy added");
  });

  it("preserves page count, geometry, rotation, boxes, annotations and the imported form content", async () => {
    const original = await buildTemplate({ rotateSecond: true });
    const { bytes } = await redactTemplatePersonalization(original, { patterns: PATTERNS, apply: true });
    const a = await PDFDocument.load(original);
    const b = await PDFDocument.load(bytes!);
    assert.equal(b.getPageCount(), a.getPageCount());
    assert.deepEqual(geometry(b), geometry(a));
    assert.equal(b.getPage(1).getRotation().angle, 90);
    assert.deepEqual(xobjectBytes(b), xobjectBytes(a), "Form XObjects byte-identical");

    const ta = await texts(original);
    const tb = await texts(bytes!);
    ta.forEach((page, i) => {
      const kept = page.filter((t) => !/Jordan|555\)/.test(t));
      assert.deepEqual(tb[i], kept, `page ${i + 1}: all legitimate text kept at the same positions`);
      assert.ok(tb[i].some((t) => t.startsWith("(TXR-0000) 01-01-26")), "revision identifier kept");
    });
  });

  it("refuses, without writing, when personalization is inside the imported form content", async () => {
    const original = await buildTemplate({ personalInsideForm: true });
    const { bytes, report } = await redactTemplatePersonalization(original, { patterns: PATTERNS, apply: true });
    assert.equal(bytes, null);
    assert.ok(report.blockedMatches.length > 0);
  });

  it("refuses, without writing, when personalization is in document metadata", async () => {
    const original = await buildTemplate({ personalTitle: true });
    const { bytes, report } = await redactTemplatePersonalization(original, { patterns: PATTERNS, apply: true });
    assert.equal(bytes, null);
    assert.ok(report.blockedMatches.length > 0);
  });

  it("dry run reports blocks but writes nothing; global-flag patterns behave the same", async () => {
    const original = await buildTemplate();
    const dry = await redactTemplatePersonalization(original, { patterns: [/Jordan\s+Example/gi, /555\)\s*010-0100/g], apply: false });
    assert.equal(dry.bytes, null);
    assert.equal(dry.report.removedBlocks.length, 4);
    await assert.rejects(redactTemplatePersonalization(original, { patterns: [] }), /pattern/);
  });

  it("keeps Fill Form placement identical on the redacted template", async () => {
    const original = await buildTemplate();
    const { bytes } = await redactTemplatePersonalization(original, { patterns: PATTERNS, apply: true });
    const field = { id: "f", field_key: "AGENT_NAME", field_name: null, field_label: null, field_data_type: "text", field_widget_type: "text", default_value: null, default_checked: null, required: false, notes: null, source_type: "settings_agent", source_path: "agent_full_name", resolver_key: null, fallback_value: null, field_resolver_id: null, create_date: "", update_date: "", status: "ACTIVE", scope: "GLOBAL", owner_user_id: null, organization_id: null } as Field;
    const mapping = { id: "m", form_id: 1, field_id: "f", mapping_name: null, occurrence_index: 0, page_number: 1, x: 72, y: 300, width: 200, height: 14, page_width: 612, page_height: 792, font_size: 10, alignment: "left", field_widget_type: "text", is_multiline: false, mask_background: false, default_value_override: null, required: false, notes: null, pdf_field_name: null, pdf_field_type: null, pdf_export_value: null, create_date: "", update_date: "", status: "ACTIVE", fields: field } as FormFieldMapping;
    const instance = { id: "i", packet_id: 1, packet_form_id: 1, field_id: "f", value: "Agent Value", value_json: null, source: "settings", is_override: false, notes: null, create_date: "", update_date: "", status: "ACTIVE", fields: field } as FieldInstanceWithField;
    const views: PacketFormFieldView[] = buildPacketFormFieldViews({ mappings: [mapping], instances: [instance], placementOverrides: [] });
    const filledA = await texts(await fillPacketFormPdfBytes(original, views));
    const filledB = await texts(await fillPacketFormPdfBytes(bytes!, views));
    const pos = (t: string[][]) => t[0].find((s) => s.startsWith("Agent Value"));
    assert.ok(pos(filledA), "value drawn on the original");
    assert.equal(pos(filledB), pos(filledA), "value drawn at the identical position");
  });
});
