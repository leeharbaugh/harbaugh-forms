/**
 * Development QA artifact for packet_form 53 (Residential Lease Listing):
 * multiline + mask Non-Real Estate Items + typed Caveat signature.
 *
 *   npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/manual-qa-fill-form-53-download.ts
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
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

function decodeStream(raw: Uint8Array): string {
  try {
    return inflateSync(raw).toString("latin1");
  } catch {
    return Buffer.from(raw).toString("latin1");
  }
}

async function page1Operators(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(Uint8Array.from(bytes));
  const contents = doc.getPages()[0]!.node.Contents();
  if (!contents) return "";
  const refs = "asArray" in contents ? contents.asArray() : [contents];
  const parts: string[] = [];
  for (const ref of refs) {
    const stream = doc.context.lookup(ref);
    if (
      stream &&
      "getContents" in stream &&
      typeof stream.getContents === "function"
    ) {
      parts.push(decodeStream(stream.getContents() as Uint8Array));
    }
  }
  return parts.join("\n");
}

async function main() {
  const { data: mapping, error: mapError } = await admin
    .from("form_field_mappings")
    .select(
      "id, mapping_name, is_multiline, mask_background, width, height, x, y",
    )
    .eq("id", NON_REAL_MAPPING_ID)
    .maybeSingle();
  if (mapError || !mapping) {
    fail(`mapping lookup failed: ${mapError?.message ?? "missing"}`);
  }
  if (mapping.is_multiline !== true || mapping.mask_background !== true) {
    fail(
      `mapping ${NON_REAL_MAPPING_ID} is_multiline=${mapping.is_multiline} mask_background=${mapping.mask_background}; both must be true`,
    );
  }
  ok(
    `mapping "${mapping.mapping_name}" is_multiline=true mask_background=true (${mapping.width}x${mapping.height})`,
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

  const withNarrative = (value: string): PacketFormFieldView[] =>
    editor.fields.map((field) => {
      if (field.mapping.id !== NON_REAL_MAPPING_ID) return field;
      return {
        ...field,
        displayValue: value,
        instance: {
          ...field.instance,
          value: value || null,
          is_override: true,
        },
      };
    });

  const nonReal = editor.fields.find((f) => f.mapping.id === NON_REAL_MAPPING_ID);
  if (!nonReal) fail("Non-Real Estate Items field missing from editor data");
  if (
    nonReal.mapping.is_multiline !== true ||
    nonReal.mapping.mask_background !== true
  ) {
    fail("multiline/mask flags did not survive editor load");
  }
  ok("is_multiline + mask_background reached fillPacketFormPdfBytes field view");

  const pageCount = Math.max(
    ...editor.fields.map((f) => f.placement.page_number),
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

  const outDir = path.join(process.cwd(), "_audit_tmp", "pdf-regression");
  mkdirSync(outDir, { recursive: true });

  async function fillAndWrite(
    label: string,
    fields: PacketFormFieldView[],
    fileName: string,
  ) {
    const filled = Uint8Array.from(
      await fillPacketFormPdfBytes(sourceBytes, fields, {
        annotations,
        signatureFontBytes: fontBytes,
      }),
    );
    const outPath = path.join(outDir, fileName);
    writeFileSync(outPath, filled);
    const ops = await page1Operators(filled);
    const hasWhite = /1\s+1\s+1\s+rg/.test(ops);
    const hasTranslate = new RegExp(
      String.raw`1\s+0\s+0\s+1\s+${Number(nonReal!.mapping.x)}\s+[\d.]+\s+cm`,
    ).test(ops);
    if (!hasWhite || !hasTranslate) {
      fail(`${label}: expected white mask path in page operators`);
    }
    const latin = Buffer.from(filled).toString("latin1");
    if (!/HarbaughCaveat/i.test(latin) || !/FontFile2/.test(latin)) {
      fail(`${label}: expected HarbaughCaveat + FontFile2`);
    }
    ok(`${label}: wrote ${outPath} (${filled.length} bytes); mask+Caveat present`);
    return filled;
  }

  await fillAndWrite(
    "populated+mask",
    withNarrative(NARRATIVE),
    "manual-qa-pf53-multiline-mask-caveat.pdf",
  );
  await fillAndWrite(
    "empty+mask",
    withNarrative(""),
    "manual-qa-pf53-empty-mask.pdf",
  );

  // Temporary mask-off control (does not persist DB — in-memory field views only).
  const maskOffFields = withNarrative(NARRATIVE).map((field) => {
    if (field.mapping.id !== NON_REAL_MAPPING_ID) return field;
    return {
      ...field,
      mapping: { ...field.mapping, mask_background: false },
    };
  });
  const maskOffBytes = Uint8Array.from(
    await fillPacketFormPdfBytes(sourceBytes, maskOffFields, {
      annotations,
      signatureFontBytes: fontBytes,
    }),
  );
  writeFileSync(path.join(outDir, "manual-qa-pf53-mask-off-control.pdf"), maskOffBytes);
  const maskOffOps = await page1Operators(maskOffBytes);
  // Template may already contain white fills; require no translate to this placement after white rg near field.
  const placementMask = new RegExp(
    String.raw`1\s+1\s+1\s+rg[\s\S]{0,120}?1\s+0\s+0\s+1\s+${Number(nonReal.mapping.x)}\s+[\d.]+\s+cm[\s\S]{0,120}?${Number(nonReal.mapping.width)}\s+${Number(nonReal.mapping.height)}\s+l`,
  );
  if (placementMask.test(maskOffOps)) {
    fail("mask-off control unexpectedly contains placement-sized white mask");
  }
  ok("mask-off control PDF has no placement white mask (lines would show through)");

  // Confirm retained DB flags unchanged after in-memory toggle.
  const { data: after } = await admin
    .from("form_field_mappings")
    .select("is_multiline, mask_background")
    .eq("id", NON_REAL_MAPPING_ID)
    .single();
  if (after?.is_multiline !== true || after?.mask_background !== true) {
    fail(`DB flags drifted: ${JSON.stringify(after)}`);
  }
  ok("DB retained is_multiline=true mask_background=true");

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const populated = await fillPacketFormPdfBytes(
    sourceBytes,
    withNarrative(NARRATIVE),
    { annotations, signatureFontBytes: fontBytes },
  );
  const parsed = await pdfjs.getDocument({
    data: Uint8Array.from(populated),
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
  ok("page 1 extract contains intact signature + narrative markers");
  ok(
    "Open manual-qa-pf53-multiline-mask-caveat.pdf in Adobe Acrobat for visual line-cover QA",
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
