/**
 * Development QA artifact for packet_form 53 (Residential Lease Listing):
 * multiline Non-Real Estate Items + typed Caveat signature Kenneth Lee Harbaugh.
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/manual-qa-fill-form-53-download.ts
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fillPacketFormPdfBytes } from "../lib/fill-packet-form-pdf.ts";
import { loadPacketFormEditorData } from "../lib/packet-form-editor.ts";
import { loadCaveatSignatureFontBytesServer } from "../lib/signature-font-server.ts";
import type { PacketFormAnnotation } from "../lib/types/packet-form-annotation.ts";
import type { PacketFormFieldView } from "../lib/types/packet-form-editor.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PACKET_FORM_ID = 53;
const NON_REAL_MAPPING_ID = "f7f8e678-43f3-4f9a-9cb2-f1c9bb6b9f05";
const SIGNATURE = "Kenneth Lee Harbaugh";
const NARRATIVE =
  "Landlord will provide washer, dryer and fridge in kitchen. Tenant is responsible for lawn care and trash removal.\nSee attached inventory for additional personal property included with the lease: https://example.com/very/long/path/without/spaces/abcdefghijklmnopqrstuvwxyz0123456789/end";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!url.includes(EXPECTED_REF)) {
  throw new Error(`Refusing to run outside development: ${url}`);
}

const admin = createClient(
  url,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function ok(message: string) {
  console.log(`OK: ${message}`);
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  const { data: mapping, error: mapError } = await admin
    .from("form_field_mappings")
    .select("id, mapping_name, is_multiline, width, height")
    .eq("id", NON_REAL_MAPPING_ID)
    .maybeSingle();
  if (mapError || !mapping) {
    fail(`mapping lookup failed: ${mapError?.message ?? "missing"}`);
  }
  if (mapping.is_multiline !== true) {
    fail(
      `mapping ${NON_REAL_MAPPING_ID} is_multiline=${mapping.is_multiline}; enable in Map Fields for this QA`,
    );
  }
  ok(
    `mapping "${mapping.mapping_name}" is_multiline=true (${mapping.width}x${mapping.height})`,
  );

  const editor = await loadPacketFormEditorData(admin, PACKET_FORM_ID);
  const storagePath = editor.packetForm.storage_path;
  if (!storagePath) fail("packet form has no storage_path");

  const { data: blob, error: dlError } = await admin.storage
    .from("generated-documents")
    .download(storagePath);
  if (dlError || !blob) fail(dlError?.message ?? "storage download failed");

  const sourceBytes = new Uint8Array(await blob.arrayBuffer());
  const fontBytes = await loadCaveatSignatureFontBytesServer();
  if (!fontBytes?.length) fail("Caveat font bytes missing");

  const fields: PacketFormFieldView[] = editor.fields.map((field) => {
    if (field.mapping.id !== NON_REAL_MAPPING_ID) return field;
    return {
      ...field,
      displayValue: NARRATIVE,
      instance: {
        ...field.instance,
        value: NARRATIVE,
        is_override: true,
      },
    };
  });

  const nonReal = fields.find((f) => f.mapping.id === NON_REAL_MAPPING_ID);
  if (!nonReal) fail("Non-Real Estate Items field missing from editor data");
  if (nonReal.mapping.is_multiline !== true) {
    fail("is_multiline did not survive editor load");
  }
  ok("is_multiline reached fillPacketFormPdfBytes field view");

  const pageCount = Math.max(
    ...fields.map((f) => f.placement.page_number),
    1,
  );
  const annotations: PacketFormAnnotation[] = [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      packet_id: editor.packetForm.packet_id,
      packet_form_id: PACKET_FORM_ID,
      page_number: 1,
      annotation_type: "typed_signature",
      text_value: SIGNATURE,
      font_id: "caveat",
      x: 72,
      y: 640,
      width: 220,
      height: 36,
      rotation: 0,
      created_by_user_id: "00000000-0000-4000-8000-000000000001",
      create_date: new Date().toISOString(),
      update_date: new Date().toISOString(),
      status: "ACTIVE",
    },
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      packet_id: editor.packetForm.packet_id,
      packet_form_id: PACKET_FORM_ID,
      page_number: Math.min(pageCount, 3),
      annotation_type: "typed_signature",
      text_value: SIGNATURE,
      font_id: "caveat",
      x: 72,
      y: 120,
      width: 220,
      height: 36,
      rotation: 0,
      created_by_user_id: "00000000-0000-4000-8000-000000000001",
      create_date: new Date().toISOString(),
      update_date: new Date().toISOString(),
      status: "ACTIVE",
    },
  ];

  const filled = await fillPacketFormPdfBytes(sourceBytes, fields, {
    annotations,
    signatureFontBytes: fontBytes,
  });
  const copy = Uint8Array.from(filled);
  const outDir = path.join(process.cwd(), "_audit_tmp", "pdf-regression");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "manual-qa-pf53-multiline-caveat.pdf");
  writeFileSync(outPath, copy);

  const latin = Buffer.from(copy).toString("latin1");
  if (!/HarbaughCaveat/i.test(latin) || !/FontFile2/.test(latin)) {
    fail("expected HarbaughCaveat + FontFile2 in filled PDF");
  }
  if (/Ƒ|Ƌ|ƈ|ƅ|Ƙ/.test(latin)) {
    fail("corrupt cmap glyph markers present in PDF bytes");
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const parsed = await pdfjs.getDocument({
    data: Uint8Array.from(copy),
    useSystemFonts: true,
  }).promise;
  const page1 = await parsed.getPage(1);
  const content = await page1.getTextContent();
  const text = content.items
    .map((item: { str?: string }) => item.str ?? "")
    .join("");
  if (!text.includes("Kenneth Lee Harbaugh")) {
    fail(`signature missing/corrupt on page 1: ${text.slice(0, 240)}`);
  }
  if (!/washer|Landlord/i.test(text)) {
    fail("narrative missing from page 1 extract");
  }
  if (/Ƒ|Ƌ|ƈ|ƅ|Ƙ/.test(text)) {
    fail(`corrupt glyphs in page 1 extract: ${text.slice(0, 240)}`);
  }

  ok(`wrote ${outPath} (${copy.length} bytes)`);
  ok("page 1 extract contains intact signature + narrative markers");
  ok("Open this PDF in Adobe Acrobat for visual multiline wrap + Caveat spacing QA");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
