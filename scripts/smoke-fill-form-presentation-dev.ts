/**
 * Development smoke: zoom font math + Caveat embedding on a real DRAFT packet PDF.
 * Does not mutate DB rows or historical generated documents; writes a temp local PDF.
 *
 *   npx --yes node --experimental-strip-types --env-file=.env.local scripts/smoke-fill-form-presentation-dev.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  resolveFieldFontSize,
  typedSignatureFontSize,
  fitTypedSignatureFontSize,
} from "../lib/pdf-text-layout.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const BUCKET = "generated-documents";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) {
    fail(`Refusing: URL must target ${EXPECTED_REF}`);
  }
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) fail("Need service role key");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const zoomResults: Array<{
    scale: number;
    single: number;
    multiline: number;
  }> = [];
  for (const scale of [0.75, 1, 1.5, 1.95, 2.5]) {
    const single = resolveFieldFontSize({
      configuredFontSize: 10,
      boxHeightPdf: 14,
      isMultiline: false,
      scale,
    });
    const multiline = resolveFieldFontSize({
      configuredFontSize: null,
      boxHeightPdf: 48,
      isMultiline: true,
      scale,
    });
    if (Math.abs(single - 10 * scale) > 0.001) {
      fail(
        `single-line font at scale ${scale} expected ${10 * scale}, got ${single}`,
      );
    }
    zoomResults.push({ scale, single, multiline });
    ok(
      `zoom ${Math.round(scale * 100)}%: single=${single.toFixed(2)}px multiline=${multiline.toFixed(2)}px (padding scales with same factor)`,
    );
  }

  const { data: draft, error } = await admin
    .from("packet_forms")
    .select(
      "id, packet_id, form_id, document_name, storage_path, document_state, status",
    )
    .eq("document_state", "DRAFT")
    .eq("status", "ACTIVE")
    .not("storage_path", "is", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !draft?.storage_path) {
    fail(`No DRAFT packet_form with storage_path: ${error?.message ?? "none"}`);
  }

  ok(`using DRAFT packet_form ${draft.id} (${draft.document_name})`);

  const { data: pdfData, error: dlError } = await admin.storage
    .from(BUCKET)
    .download(draft.storage_path);
  if (dlError || !pdfData) {
    fail(`storage download failed: ${dlError?.message ?? "no data"}`);
  }

  const sourcePdf = new Uint8Array(await pdfData.arrayBuffer());
  const caveat = new Uint8Array(
    readFileSync(
      path.join(process.cwd(), "public", "fonts", "Caveat-Regular.ttf"),
    ),
  );

  const pdfDoc = await PDFDocument.load(sourcePdf);
  pdfDoc.registerFontkit(fontkit);
  const pages = pdfDoc.getPages();
  if (pages.length < 1) {
    fail("packet PDF has no pages");
  }

  const font = await pdfDoc.embedFont(caveat, {
    subset: true,
    customName: "HarbaughCaveat",
  });
  const page1 = pages[0]!;
  const height = 36;
  const width = 160;
  const size = fitTypedSignatureFontSize({
    text: "Lee Harbaugh",
    boxWidth: width,
    boxHeight: height,
    measureWidth: (text) => font.widthOfTextAtSize(text, typedSignatureFontSize(height)),
  });
  page1.drawText("Lee Harbaugh", {
    x: 72,
    y: page1.getHeight() - 72 - size,
    size,
    font,
  });

  if (pages.length > 1) {
    const page2 = pages[1]!;
    page2.drawText("Lee Harbaugh", {
      x: 72,
      y: page2.getHeight() - 100 - size,
      size,
      font,
    });
    ok(`placed Caveat signature on pages 1 and 2 (page count=${pages.length})`);
  } else {
    ok("placed Caveat signature on page 1 (single-page form)");
  }

  const filled = await pdfDoc.save({ useObjectStreams: false });
  const outDir = path.join(process.cwd(), "_audit_tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `fill-form-presentation-smoke-${draft.id}.pdf`,
  );
  writeFileSync(outPath, filled);
  ok(`wrote smoke PDF ${outPath}`);

  const filledText = Buffer.from(filled).toString("latin1");
  if (!/HarbaughCaveat/i.test(filledText) || !/FontFile2/.test(filledText)) {
    fail("HarbaughCaveat / FontFile2 not found in filled DRAFT packet-form PDF");
  }
  ok("Caveat embedded as HarbaughCaveat + FontFile2 in filled DRAFT packet-form PDF");
  ok(`pdf-lib font.name: ${font.name}`);

  console.log("\nZoom summary:");
  for (const row of zoomResults) {
    console.log(
      `  ${Math.round(row.scale * 100)}% → single ${row.single.toFixed(2)} / multiline ${row.multiline.toFixed(2)}`,
    );
  }
  console.log("\nFill Form presentation smoke passed.");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
