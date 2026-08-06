/**
 * Development QA: date_signed annotations on packet_form 53 + Acrobat artifact.
 *
 *   npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/manual-qa-date-signed-53.ts
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fillPacketFormPdfBytes } from "../lib/fill-packet-form-pdf.ts";
import { loadPacketFormEditorData } from "../lib/packet-form-editor.ts";
import { loadCaveatSignatureFontBytesServer } from "../lib/signature-font-server.ts";
import {
  formatDateSigned,
  DEFAULT_DATE_SIGNED_FORMAT,
} from "../lib/date-signed-annotation.ts";
import type { PacketFormAnnotation } from "../lib/types/packet-form-annotation.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PACKET_FORM_ID = 53;
const ISO = "2026-08-06";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!url.includes(EXPECTED_REF)) {
  throw new Error(`Refusing outside development: ${url}`);
}

const admin = createClient(
  url,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function ok(m: string) {
  console.log(`OK: ${m}`);
}
function fail(m: string): never {
  console.error(`FAIL: ${m}`);
  process.exit(1);
}

async function main() {
  const editor = await loadPacketFormEditorData(admin, PACKET_FORM_ID);
  if (!editor.packetForm.storage_path) fail("no storage_path");
  const { data: blob, error } = await admin.storage
    .from("generated-documents")
    .download(editor.packetForm.storage_path);
  if (error || !blob) fail(error?.message ?? "download failed");

  const source = new Uint8Array(await blob.arrayBuffer());
  const fontBytes = await loadCaveatSignatureFontBytesServer();
  if (!fontBytes?.length) fail("no Caveat bytes");

  const formats = [
    formatDateSigned(ISO, "MM/DD/YYYY"),
    formatDateSigned(ISO, "M/D/YYYY"),
    formatDateSigned(ISO, "Month D, YYYY"),
  ] as const;
  assertFormats(formats);

  const pageCount = Math.max(
    ...editor.fields.map((f) => f.placement.page_number),
    2,
  );
  const annotations: PacketFormAnnotation[] = [
    {
      id: "d1111111-1111-4111-8111-111111111111",
      packet_id: editor.packetForm.packet_id,
      packet_form_id: PACKET_FORM_ID,
      page_number: 1,
      annotation_type: "date_signed",
      text_value: formats[0],
      font_id: "helvetica",
      x: 72,
      y: 700,
      width: 90,
      height: 18,
      rotation: 0,
      created_by_user_id: "00000000-0000-4000-8000-000000000001",
      create_date: new Date().toISOString(),
      update_date: new Date().toISOString(),
      status: "ACTIVE",
    },
    {
      id: "d2222222-2222-4222-8222-222222222222",
      packet_id: editor.packetForm.packet_id,
      packet_form_id: PACKET_FORM_ID,
      page_number: Math.min(pageCount, 3),
      annotation_type: "date_signed",
      text_value: formats[2],
      font_id: "helvetica",
      x: 72,
      y: 120,
      width: 140,
      height: 18,
      rotation: 0,
      created_by_user_id: "00000000-0000-4000-8000-000000000001",
      create_date: new Date().toISOString(),
      update_date: new Date().toISOString(),
      status: "ACTIVE",
    },
    {
      id: "s3333333-3333-4333-8333-333333333333",
      packet_id: editor.packetForm.packet_id,
      packet_form_id: PACKET_FORM_ID,
      page_number: 1,
      annotation_type: "typed_signature",
      text_value: "Kenneth Lee Harbaugh",
      font_id: "caveat",
      x: 300,
      y: 690,
      width: 200,
      height: 36,
      rotation: 0,
      created_by_user_id: "00000000-0000-4000-8000-000000000001",
      create_date: new Date().toISOString(),
      update_date: new Date().toISOString(),
      status: "ACTIVE",
    },
    {
      id: "d4444444-4444-4444-8444-444444444444",
      packet_id: editor.packetForm.packet_id,
      packet_form_id: PACKET_FORM_ID,
      page_number: 1,
      annotation_type: "date_signed",
      text_value: "SHOULD_NOT_RENDER",
      font_id: "helvetica",
      x: 72,
      y: 650,
      width: 90,
      height: 18,
      rotation: 0,
      created_by_user_id: "00000000-0000-4000-8000-000000000001",
      create_date: new Date().toISOString(),
      update_date: new Date().toISOString(),
      status: "DELETED",
    },
  ];

  const filled = Uint8Array.from(
    await fillPacketFormPdfBytes(source, editor.fields, {
      annotations,
      signatureFontBytes: fontBytes,
    }),
  );
  const outDir = path.join(process.cwd(), "_audit_tmp", "pdf-regression");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "manual-qa-pf53-date-signed.pdf");
  writeFileSync(outPath, filled);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const parsed = await pdfjs.getDocument({
    data: Uint8Array.from(filled),
    useSystemFonts: true,
  }).promise;
  const page1 = await (await parsed.getPage(1)).getTextContent();
  const text = page1.items.map((i: { str?: string }) => i.str ?? "").join("");
  if (!text.includes(formats[0])) fail(`missing ${formats[0]}`);
  if (!text.includes("Kenneth Lee Harbaugh")) fail("signature missing");
  if (text.includes("SHOULD_NOT_RENDER")) fail("deleted date leaked");
  ok(`default format ${DEFAULT_DATE_SIGNED_FORMAT} → ${formats[0]}`);
  ok(`wrote ${outPath}`);
  ok("Open in Adobe Acrobat: Helvetica dates + intact Caveat signature");
}

function assertFormats(formats: readonly string[]) {
  if (formats[0] !== "08/06/2026") fail(`MM/DD got ${formats[0]}`);
  if (formats[1] !== "8/6/2026") fail(`M/D got ${formats[1]}`);
  if (formats[2] !== "August 6, 2026") fail(`Month D got ${formats[2]}`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
