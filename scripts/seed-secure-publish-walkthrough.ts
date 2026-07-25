/**
 * Seed a disposable ACTIVE+DRAFT Global form (+ optional pending packet form)
 * for secure-publish browser walkthrough on development only.
 *
 * Run: npx --yes node --experimental-strip-types --env-file=.env.local scripts/seed-secure-publish-walkthrough.ts
 * Cleanup: same with CLEANUP=1
 */
import { createClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";
const MARKER = "SECURE-PUBLISH-WALKTHROUGH";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function makePdfBytes(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    doc.addPage();
  }
  return doc.save();
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) {
    throw new Error(`Refusing: not development (${EXPECTED_REF})`);
  }
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Missing service key");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (process.env.CLEANUP === "1") {
    const { data: forms } = await admin
      .from("forms")
      .select("id, source_storage_path")
      .ilike("form_name", `%${MARKER}%`)
      .neq("status", "DELETED");
    for (const form of forms ?? []) {
      await admin
        .from("packet_forms")
        .update({ status: "DELETED" })
        .eq("form_id", form.id);
      await admin
        .from("forms")
        .update({ status: "DELETED", publication_state: "DRAFT" })
        .eq("id", form.id);
      if (form.source_storage_path) {
        await admin.storage
          .from("form-templates")
          .remove([form.source_storage_path as string]);
      }
    }
    const { data: packets } = await admin
      .from("packets")
      .select("id")
      .ilike("label", `%${MARKER}%`)
      .neq("status", "DELETED");
    for (const packet of packets ?? []) {
      await admin
        .from("packets")
        .update({ status: "DELETED" })
        .eq("id", packet.id);
    }
    console.log("Cleanup complete.");
    return;
  }

  const stamp = Date.now();
  const formCode = `SEC-WT-${stamp}`;
  const storagePath = `global/forms/secure-walkthrough-${stamp}/blank.pdf`;
  const pdfBytes = await makePdfBytes(2);

  const { error: uploadError } = await admin.storage
    .from("form-templates")
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  // Reuse an existing ACTIVE Global field for a valid mapping
  const { data: field, error: fieldError } = await admin
    .from("fields")
    .select("id, field_key")
    .eq("scope", "GLOBAL")
    .eq("status", "ACTIVE")
    .limit(1)
    .maybeSingle();
  if (fieldError || !field) {
    throw new Error(fieldError?.message ?? "No Global field available");
  }

  const { data: form, error: formError } = await admin
    .from("forms")
    .insert({
      form_code: formCode,
      form_name: `${MARKER} ${stamp}`,
      form_category: "OTHER",
      state_code: "TX",
      version_label: "walkthrough",
      source_storage_path: storagePath,
      scope: "GLOBAL",
      status: "ACTIVE",
      publication_state: "DRAFT",
      form_family_key: formCode,
    })
    .select("id")
    .single();
  if (formError || !form) throw new Error(formError?.message);

  const { data: mapping, error: mappingError } = await admin
    .from("form_field_mappings")
    .insert({
      form_id: form.id,
      field_id: field.id,
      page_number: 1,
      status: "ACTIVE",
      pdf_field_name: "WalkthroughField",
      occurrence_index: 0,
      mapping_name: "Walkthrough mapping",
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.03,
    })
    .select("id")
    .single();
  if (mappingError || !mapping) throw new Error(mappingError?.message);

  const { data: packet, error: packetError } = await admin
    .from("packets")
    .insert({
      label: `${MARKER} Packet ${stamp}`,
      status: "ACTIVE",
      owner_user_id: LEE_USER_ID,
      packet_type: "custom",
    })
    .select("id")
    .single();
  if (packetError || !packet) throw new Error(packetError?.message);

  const { data: pending, error: pfError } = await admin
    .from("packet_forms")
    .insert({
      packet_id: packet.id,
      form_id: form.id,
      status: "ACTIVE",
      document_state: "DRAFT",
      availability_state: "PENDING_PUBLICATION",
      document_name: `${MARKER} Pending`,
      document_type: "PDF",
      origin: "collection",
      sort_order: 1,
      is_required: false,
      field_data: {},
      owner_user_id: LEE_USER_ID,
    })
    .select("id")
    .single();
  if (pfError || !pending) throw new Error(pfError?.message);

  console.log(
    JSON.stringify(
      {
        formId: form.id,
        mappingId: mapping.id,
        fieldId: field.id,
        packetId: packet.id,
        packetFormId: pending.id,
        formName: `${MARKER} ${stamp}`,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
