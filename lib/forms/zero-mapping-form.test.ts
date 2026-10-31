import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { fillPacketFormPdfBytes } from "@/lib/fill-packet-form-pdf";
import { buildPacketFormFieldViews } from "@/lib/types/packet-form-editor";

async function informationalPdf(pages: number) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Informational notice page ${i + 1}`, { x: 72, y: 700, size: 12, font });
  }
  return doc.save();
}

async function pageText(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: Uint8Array.from(bytes), verbosity: 0 }).promise;
  const out: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    out.push((content.items as { str?: string }[]).map((i) => i.str ?? "").join(""));
  }
  return out;
}

describe("zero-mapping forms in packets (Fill Form and Download PDF)", () => {
  it("a zero-mapping form produces no field views and no error", () => {
    assert.deepEqual(buildPacketFormFieldViews({ mappings: [], instances: [], placementOverrides: [] }), []);
  });

  it("Download PDF of a zero-field packet copy keeps every page and its content", async () => {
    const source = await informationalPdf(2);
    const filled = await fillPacketFormPdfBytes(source, [], { annotations: [] });
    const reloaded = await PDFDocument.load(filled);
    assert.equal(reloaded.getPageCount(), 2);
    assert.deepEqual(reloaded.getPages().map((p) => [p.getWidth(), p.getHeight()]), [[612, 792], [612, 792]]);
    assert.deepEqual(await pageText(filled), await pageText(source));
  });
});
