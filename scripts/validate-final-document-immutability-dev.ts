/**
 * Development-only validation for F5 document immutability.
 * Uses an authenticated browser session against harbaugh-forms-dev and proves
 * that DRAFT files/annotations remain editable, FINAL equivalents do not, and
 * reopening restores the intended draft workflow.
 */
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { randomUUID } from "node:crypto";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function makePdfBytes(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage();
  return document.save();
}

async function expectRejected(label: string, action: () => Promise<{ error: { message: string } | null }>) {
  const { error } = await action();
  if (!error) fail(`${label} unexpectedly succeeded`);
  ok(`${label} rejected (${error.message})`);
}

async function expectStorageObjectRetained(
  label: string,
  action: () => Promise<{ error: { message: string } | null }>,
  bucket: "form-templates" | "generated-documents",
  path: string,
  admin: ReturnType<typeof createClient>,
) {
  const { error } = await action();
  const { data: retained, error: retainedError } = await admin.storage.from(bucket).download(path);
  if (retainedError || !retained) fail(`${label} removed the protected object`);
  ok(error ? `${label} rejected (${error.message})` : `${label} made no change`);
}

async function expectAnnotationUnchanged(
  label: string,
  action: () => Promise<{ error: { message: string } | null }>,
  annotationId: string,
  expectedX: number,
  admin: ReturnType<typeof createClient>,
) {
  const { error } = await action();
  const { data, error: readError } = await admin
    .from("packet_form_annotations")
    .select("x")
    .eq("id", annotationId)
    .single();
  if (readError || data?.x !== expectedX) fail(`${label} changed the protected annotation`);
  ok(error ? `${label} rejected (${error.message})` : `${label} made no change`);
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) fail("Need anon/publishable and service/secret keys");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const browser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stamp = Date.now();
  const sourcePath = `global/forms/f5-${stamp}/source.pdf`;
  const pdf = await makePdfBytes();
  let formId: number | null = null;
  let packetId: number | null = null;
  let packetFormId: number | null = null;
  let packetPath: string | null = null;

  try {
    // A prior interrupted development validation can leave only these uniquely
    // named disposable rows. Clear them before creating the next fixture.
    const { data: staleForms } = await admin
      .from("forms")
      .select("id, source_storage_path")
      .like("form_code", "F5-%")
      .neq("status", "DELETED");
    for (const stale of staleForms ?? []) {
      await admin.from("forms").update({ status: "DELETED", publication_state: "DRAFT" }).eq("id", stale.id);
      if (stale.source_storage_path) {
        await admin.storage.from("form-templates").remove([stale.source_storage_path]);
      }
    }
    const { data: stalePackets } = await admin
      .from("packets")
      .select("id")
      .like("label", "F5 packet %")
      .neq("status", "DELETED");
    for (const stale of stalePackets ?? []) {
      const { data: stalePacketForms } = await admin
        .from("packet_forms")
        .select("id, storage_path")
        .eq("packet_id", stale.id)
        .neq("status", "DELETED");
      for (const stalePacketForm of stalePacketForms ?? []) {
        await admin.from("packet_forms").update({ status: "DELETED" }).eq("id", stalePacketForm.id);
        if (stalePacketForm.storage_path) {
          await admin.storage.from("generated-documents").remove([stalePacketForm.storage_path]);
        }
      }
      await admin.from("packets").update({ status: "DELETED" }).eq("id", stale.id);
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: "lee@leeharbaugh.com",
    });
    if (linkError || !link?.properties?.hashed_token) {
      fail(`Could not mint development browser session: ${linkError?.message}`);
    }
    const { error: verifyError } = await browser.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "email",
    });
    if (verifyError) fail(`Could not verify development browser session: ${verifyError.message}`);

    const { data: form, error: formError } = await admin
      .from("forms")
      .insert({
        form_code: `F5-${stamp}`,
        form_name: `F5 disposable ${stamp}`,
        form_category: "OTHER",
        state_code: "TX",
        version_label: "v1",
        source_storage_path: sourcePath,
        scope: "GLOBAL",
        status: "ACTIVE",
        publication_state: "DRAFT",
        form_family_key: `F5-${stamp}`,
      })
      .select("id")
      .single();
    if (formError || !form) fail(`Could not create disposable form: ${formError?.message}`);
    formId = form.id as number;

    const { error: sourceInsertError } = await browser.storage
      .from("form-templates")
      .upload(sourcePath, pdf, { contentType: "application/pdf", upsert: false });
    if (sourceInsertError) fail(`DRAFT template upload failed: ${sourceInsertError.message}`);
    const { error: sourceDraftUpdateError } = await browser.storage
      .from("form-templates")
      .upload(sourcePath, pdf, { contentType: "application/pdf", upsert: true });
    if (sourceDraftUpdateError) fail(`DRAFT template replacement failed: ${sourceDraftUpdateError.message}`);
    ok("DRAFT template may be uploaded and replaced");

    const { data: fingerprint, error: fingerprintError } = await admin.rpc(
      "form_publish_structure_fingerprint",
      { p_form_id: formId },
    );
    if (fingerprintError || !fingerprint) fail(`Could not fingerprint form: ${fingerprintError?.message}`);
    const { error: publishError } = await admin.rpc("publish_form_template", {
      p_form_id: formId,
      p_retire_form_id: null,
      p_reason: "F5 validation",
      p_actor_user_id: LEE_USER_ID,
      p_expected_structure_fingerprint: fingerprint,
    });
    if (publishError) fail(`Could not publish disposable form: ${publishError.message}`);

    await expectRejected("PUBLISHED template replacement", () =>
      browser.storage.from("form-templates").upload(sourcePath, pdf, { contentType: "application/pdf", upsert: true }),
    );
    await expectStorageObjectRetained(
      "PUBLISHED template removal",
      () => browser.storage.from("form-templates").remove([sourcePath]),
      "form-templates",
      sourcePath,
      admin,
    );

    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({ label: `F5 packet ${stamp}`, status: "ACTIVE", owner_user_id: LEE_USER_ID, packet_type: "custom" })
      .select("id")
      .single();
    if (packetError || !packet) fail(`Could not create disposable packet: ${packetError?.message}`);
    packetId = packet.id as number;

    const { data: packetForm, error: packetFormError } = await admin
      .from("packet_forms")
      .insert({
        packet_id: packetId,
        form_id: null,
        status: "ACTIVE",
        document_state: "DRAFT",
        availability_state: "AVAILABLE",
        document_name: `F5 document ${stamp}`,
        document_type: "PDF",
        origin: "external_upload",
        sort_order: 1,
        is_required: false,
        field_data: {},
        owner_user_id: LEE_USER_ID,
      })
      .select("id")
      .single();
    if (packetFormError || !packetForm) fail(`Could not create disposable packet form: ${packetFormError?.message}`);
    packetFormId = packetForm.id as number;
    packetPath = `users/${LEE_USER_ID}/packets/${packetId}/${packetFormId}-f5.pdf`;

    const { error: packetInsertError } = await browser.storage
      .from("generated-documents")
      .upload(packetPath, pdf, { contentType: "application/pdf", upsert: false });
    if (packetInsertError) fail(`DRAFT packet-document upload failed: ${packetInsertError.message}`);
    const { error: pathUpdateError } = await browser
      .from("packet_forms")
      .update({ storage_path: packetPath })
      .eq("id", packetFormId);
    if (pathUpdateError) fail(`Could not finalize packet storage path: ${pathUpdateError.message}`);
    const { error: packetDraftUpdateError } = await browser.storage
      .from("generated-documents")
      .upload(packetPath, pdf, { contentType: "application/pdf", upsert: true });
    if (packetDraftUpdateError) fail(`DRAFT packet-document replacement failed: ${packetDraftUpdateError.message}`);

    const annotationId = randomUUID();
    const { error: annotationInsertError } = await browser.from("packet_form_annotations").insert({
      id: annotationId,
      packet_id: packetId,
      packet_form_id: packetFormId,
      page_number: 1,
      annotation_type: "typed_signature",
      text_value: "F5 draft signature",
      font_id: "caveat",
      x: 20,
      y: 20,
      width: 100,
      height: 30,
      created_by_user_id: LEE_USER_ID,
      status: "ACTIVE",
    });
    if (annotationInsertError) fail(`DRAFT annotation insert failed: ${annotationInsertError.message}`);
    ok("DRAFT packet document and annotation may be changed");

    const { error: finalError } = await browser
      .from("packet_forms")
      .update({ document_state: "FINAL" })
      .eq("id", packetFormId);
    if (finalError) fail(`Could not finalize packet form: ${finalError.message}`);

    await expectAnnotationUnchanged(
      "FINAL annotation edit",
      () => browser.from("packet_form_annotations").update({ x: 30 }).eq("id", annotationId),
      annotationId,
      20,
      admin,
    );
    await expectRejected("FINAL annotation insert", () =>
      browser.from("packet_form_annotations").insert({
        id: randomUUID(), packet_id: packetId, packet_form_id: packetFormId,
        page_number: 1, annotation_type: "typed_signature", text_value: "blocked",
        font_id: "caveat", x: 1, y: 1, width: 80, height: 25,
        created_by_user_id: LEE_USER_ID, status: "ACTIVE",
      }),
    );
    await expectRejected("FINAL generated-PDF replacement", () =>
      browser.storage.from("generated-documents").upload(packetPath!, pdf, { contentType: "application/pdf", upsert: true }),
    );
    await expectStorageObjectRetained(
      "FINAL generated-PDF removal",
      () => browser.storage.from("generated-documents").remove([packetPath!]),
      "generated-documents",
      packetPath,
      admin,
    );

    const { data: survivingPdf, error: survivingPdfError } = await admin.storage
      .from("generated-documents")
      .download(packetPath);
    if (survivingPdfError || !survivingPdf) fail("Blocked FINAL removal deleted the generated PDF");
    ok("FINAL annotations and generated PDF are immutable");

    const { error: reopenError } = await browser
      .from("packet_forms")
      .update({ document_state: "DRAFT" })
      .eq("id", packetFormId);
    if (reopenError) fail(`Could not reopen FINAL packet form: ${reopenError.message}`);
    const { error: reopenedAnnotationError } = await browser
      .from("packet_form_annotations")
      .update({ x: 30 })
      .eq("id", annotationId);
    if (reopenedAnnotationError) fail(`Reopened annotation edit failed: ${reopenedAnnotationError.message}`);
    const { error: reopenedPdfError } = await browser.storage
      .from("generated-documents")
      .upload(packetPath, pdf, { contentType: "application/pdf", upsert: true });
    if (reopenedPdfError) fail(`Reopened generated-PDF replacement failed: ${reopenedPdfError.message}`);
    ok("reopening returns the packet form to the intended editable DRAFT state");
  } finally {
    await browser.auth.signOut();
    if (packetFormId) await admin.from("packet_forms").update({ status: "DELETED" }).eq("id", packetFormId);
    if (packetId) await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    if (formId) await admin.from("forms").update({ status: "DELETED", publication_state: "DRAFT" }).eq("id", formId);
    if (packetPath) await admin.storage.from("generated-documents").remove([packetPath]);
    await admin.storage.from("form-templates").remove([sourcePath]);
  }

  console.log("\nAll F5 final-document immutability development checks passed.");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
