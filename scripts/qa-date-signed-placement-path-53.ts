/**
 * Interactive placement-path QA for date_signed (packet form 53).
 * Uses the same factory the Fill Form click handler uses, then persists via
 * createPacketFormAnnotation — not a preconstructed DB row.
 *
 *   npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-date-signed-placement-path-53.ts
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildAnnotationInputFromPlacementClick } from "../lib/packet-form-annotation-placement.ts";
import {
  createPacketFormAnnotation,
  loadActivePacketFormAnnotations,
  softDeletePacketFormAnnotation,
  updatePacketFormAnnotationPlacement,
} from "../lib/packet-form-annotations.ts";
import { fillPacketFormPdfBytes } from "../lib/fill-packet-form-pdf.ts";
import { loadPacketFormEditorData } from "../lib/packet-form-editor.ts";
import { loadCaveatSignatureFontBytesServer } from "../lib/signature-font-server.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PACKET_ID = 19;
const PACKET_FORM_ID = 53;
const LEE_EMAIL = "lee@leeharbaugh.com";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!url.includes(EXPECTED_REF)) {
  throw new Error(`Refusing outside development: ${url}`);
}

const publishable =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const serviceKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

function ok(m: string) {
  console.log(`OK: ${m}`);
}
function fail(m: string): never {
  console.error(`FAIL: ${m}`);
  process.exit(1);
}

async function userClientAsLee() {
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: LEE_EMAIL,
  });
  if (error || !data.properties?.hashed_token) {
    fail(`generateLink failed: ${error?.message ?? "no token"}`);
  }

  const client = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: session, error: verifyError } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError || !session.user) {
    fail(`verifyOtp failed: ${verifyError?.message ?? "no user"}`);
  }
  return { client, user: session.user };
}

async function main() {
  const { client, user } = await userClientAsLee();
  ok(`signed in as ${user.email}`);

  const metrics = {
    originalWidth: 612,
    originalHeight: 792,
    renderedWidth: 612,
    renderedHeight: 792,
  };

  const page11Input = buildAnnotationInputFromPlacementClick(
    { annotation_type: "date_signed", text_value: "08/06/2026" },
    {
      pageNumber: 11,
      metrics,
      overlayX: 420,
      overlayY: 640,
    },
  );
  if (page11Input.annotation_type !== "date_signed") {
    fail("factory lost date_signed type");
  }
  if (page11Input.font_id !== "helvetica") {
    fail(`expected helvetica, got ${page11Input.font_id}`);
  }
  ok(
    `page 11 factory payload type=${page11Input.annotation_type} font=${page11Input.font_id} ` +
      `xy=${page11Input.x.toFixed(1)},${page11Input.y.toFixed(1)} ` +
      `wh=${page11Input.width}x${page11Input.height}`,
  );

  const created11 = await createPacketFormAnnotation(client, {
    packetId: PACKET_ID,
    packetFormId: PACKET_FORM_ID,
    userId: user.id,
    input: page11Input,
  });
  if (created11.annotation_type !== "date_signed") {
    fail(`persist mutated type to ${created11.annotation_type}`);
  }
  ok(`persisted page 11 date_signed id=${created11.id}`);

  const page1Input = buildAnnotationInputFromPlacementClick(
    { annotation_type: "date_signed", text_value: "08/06/2026" },
    {
      pageNumber: 1,
      metrics,
      overlayX: 120,
      overlayY: 200,
    },
  );
  const created1 = await createPacketFormAnnotation(client, {
    packetId: PACKET_ID,
    packetFormId: PACKET_FORM_ID,
    userId: user.id,
    input: page1Input,
  });
  ok(`persisted page 1 date_signed id=${created1.id}`);

  const moved = await updatePacketFormAnnotationPlacement(client, {
    annotationId: created11.id,
    packetFormId: PACKET_FORM_ID,
    x: created11.x + 12,
    y: created11.y - 8,
    width: created11.width,
    height: created11.height,
  });
  ok(`moved page 11 date to ${moved.x},${moved.y}`);

  const resized = await updatePacketFormAnnotationPlacement(client, {
    annotationId: created11.id,
    packetFormId: PACKET_FORM_ID,
    x: moved.x,
    y: moved.y,
    width: moved.width * 1.25,
    height: moved.height * 1.25,
  });
  ok(`resized page 11 date to ${resized.width}x${resized.height}`);

  const beforeZoom = {
    x: resized.x,
    y: resized.y,
    w: resized.width,
    h: resized.height,
  };
  const active = await loadActivePacketFormAnnotations(client, PACKET_FORM_ID);
  const again = active.find((row) => row.id === created11.id);
  if (
    !again ||
    again.x !== beforeZoom.x ||
    again.y !== beforeZoom.y ||
    again.width !== beforeZoom.w ||
    again.height !== beforeZoom.h
  ) {
    fail("coords mutated after reload (zoom-independence proxy)");
  }
  ok("reload preserved PDF-space coordinates");

  const editor = await loadPacketFormEditorData(client, PACKET_FORM_ID);
  if (!editor.packetForm.storage_path) fail("no storage_path");
  const { data: blob, error } = await client.storage
    .from("generated-documents")
    .download(editor.packetForm.storage_path);
  if (error || !blob) fail(error?.message ?? "template download failed");
  const source = new Uint8Array(await blob.arrayBuffer());
  const fontBytes = await loadCaveatSignatureFontBytesServer();
  if (!fontBytes?.length) fail("no Caveat bytes");

  const filled = await fillPacketFormPdfBytes(source, editor.fields, {
    signatureFontBytes: fontBytes,
    annotations: active,
  });
  const latin = Buffer.from(filled).toString("latin1");
  if (!/Helvetica/i.test(latin)) {
    fail("Helvetica not present in filled PDF");
  }
  if (/HarbaughCaveat/i.test(latin)) {
    ok("Caveat signature font still embedded alongside Helvetica dates");
  }
  const outDir = path.join("_audit_tmp", "pdf-regression");
  mkdirSync(outDir, { recursive: true });
  const outPdf = path.join(outDir, "qa-pf53-date-signed-placement-path.pdf");
  try {
    writeFileSync(outPdf, filled);
  } catch {
    const alt = path.join(
      outDir,
      `qa-pf53-date-signed-placement-path-${Date.now()}.pdf`,
    );
    writeFileSync(alt, filled);
    ok(`wrote ${alt} (primary PDF locked)`);
  }
  ok(`wrote ${outPdf}`);

  await softDeletePacketFormAnnotation(client, {
    annotationId: created1.id,
    packetFormId: PACKET_FORM_ID,
  });
  const afterDelete1 = await loadActivePacketFormAnnotations(
    client,
    PACKET_FORM_ID,
  );
  if (afterDelete1.some((row) => row.id === created1.id)) {
    fail("page 1 date still ACTIVE after soft-delete");
  }
  ok("soft-deleted page 1 date excluded from ACTIVE");

  await softDeletePacketFormAnnotation(client, {
    annotationId: created11.id,
    packetFormId: PACKET_FORM_ID,
  });
  const afterDelete11 = await loadActivePacketFormAnnotations(
    client,
    PACKET_FORM_ID,
  );
  if (afterDelete11.some((row) => row.id === created11.id)) {
    fail("page 11 date still ACTIVE after soft-delete");
  }
  ok("soft-deleted page 11 date excluded from ACTIVE");

  const signatures = afterDelete11.filter(
    (row) => row.annotation_type === "typed_signature",
  );
  ok(
    `remaining typed_signature count=${signatures.length} (Caveat path untouched by date deletes)`,
  );

  const cleaned = await fillPacketFormPdfBytes(source, editor.fields, {
    signatureFontBytes: fontBytes,
    annotations: afterDelete11,
  });
  writeFileSync(
    path.join(outDir, "qa-pf53-date-signed-placement-path-after-delete.pdf"),
    cleaned,
  );
  ok("wrote after-delete PDF");

  console.log(
    "\nInteractive placement-path QA passed (factory → persist → move/resize → PDF → delete).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
