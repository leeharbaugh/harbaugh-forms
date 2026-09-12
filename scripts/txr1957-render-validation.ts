/**
 * Draw placement rectangles onto the local TXR-1957 PDF copy and rasterize pages.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  TXR_1957_PAGE_HEIGHT,
  TXR_1957_PLACEMENTS,
} from "../lib/txr-1957-inventory.ts";

const require = createRequire(import.meta.url);

async function main() {
  const src = readFileSync("_audit_tmp/txr-1957-form-53.pdf");
  const pdf = await PDFDocument.load(src, { ignoreEncryption: true, updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();

  for (const p of TXR_1957_PLACEMENTS) {
    const page = pages[p.page_number - 1];
    const pdfY = TXR_1957_PAGE_HEIGHT - p.y - p.height;
    const color = p.is_multiline ? rgb(0.1, 0.45, 0.15) : rgb(0.15, 0.35, 0.75);
    page.drawRectangle({
      x: p.x,
      y: pdfY,
      width: p.width,
      height: p.height,
      borderColor: color,
      borderWidth: 0.8,
      color: rgb(1, 1, 1),
      opacity: 0.08,
      borderOpacity: 0.95,
    });
    const label = p.field_key.replace(/^txr_1957_/, "").slice(0, 28);
    page.drawText(label, {
      x: p.x + 1,
      y: pdfY + Math.max(2, p.height - 8),
      size: 6,
      font,
      color,
    });
  }

  mkdirSync("_audit_tmp/txr1957", { recursive: true });
  const outPdf = "_audit_tmp/txr1957/txr1957_annotated.pdf";
  writeFileSync(outPdf, await pdf.save({ useObjectStreams: false }));
  console.log("wrote", outPdf);

  const pdfjs = await import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);
  let createCanvas: (w: number, h: number) => {
    getContext: (t: string) => unknown;
    toBuffer: (t: string) => Buffer;
  };
  try {
    ({ createCanvas } = require("@napi-rs/canvas"));
  } catch {
    ({ createCanvas } = require("pdfjs-dist/node_modules/@napi-rs/canvas"));
  }

  const annotated = new Uint8Array(readFileSync(outPdf));
  const doc = await pdfjs.getDocument({ data: annotated, useSystemFonts: true }).promise;
  const scale = 2;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx as never, viewport }).promise;
    const out = `_audit_tmp/txr1957/annotated-page-${i}.png`;
    writeFileSync(out, canvas.toBuffer("image/png"));
    console.log("wrote", out);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
