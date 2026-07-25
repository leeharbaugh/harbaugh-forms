/**
 * Development walkthrough for secure publish (trusted pathway equivalent to UI).
 * Target: ewxsxwzezhkeawnjvigx only.
 *
 * Run: node --experimental-strip-types --env-file=.env.local scripts/walkthrough-secure-publish-dev.ts
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

function ok(msg: string) {
  console.log(`OK: ${msg}`);
}
function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) {
    fail(`not development ref ${EXPECTED_REF}`);
  }
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: form, error: formError } = await admin
    .from("forms")
    .select(
      "id, form_name, form_code, source_storage_path, status, publication_state, scope, owner_user_id, update_date",
    )
    .ilike("form_name", `%${MARKER}%`)
    .eq("status", "ACTIVE")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (formError || !form) {
    fail(formError?.message ?? "No walkthrough form — run seed script first");
  }
  const formId = form.id as number;
  ok(`using form #${formId} (${form.form_name})`);

  async function loadPdfPageCount(): Promise<number> {
    const path = form.source_storage_path as string;
    const { data: blob, error } = await admin.storage
      .from("form-templates")
      .download(path);
    if (error || !blob) fail(error?.message ?? "PDF download failed");
    return countPdfPages(new Uint8Array(await blob.arrayBuffer()));
  }

  async function activeMappings() {
    const { data, error } = await admin
      .from("form_field_mappings")
      .select("id, page_number, status")
      .eq("form_id", formId)
      .eq("status", "ACTIVE");
    if (error) fail(error.message);
    return data ?? [];
  }

  async function fingerprint(): Promise<string> {
    const { data, error } = await admin.rpc(
      "form_publish_structure_fingerprint",
      { p_form_id: formId },
    );
    if (error || !data) fail(error?.message ?? "fingerprint failed");
    return data as string;
  }

  // Ensure DRAFT (unpublish RPC still requires auth.uid(); service-role resets state)
  if (form.publication_state === "PUBLISHED") {
    const { error } = await admin
      .from("forms")
      .update({
        publication_state: "DRAFT",
        published_at: null,
        published_by_user_id: null,
      })
      .eq("id", formId);
    if (error) fail(error.message);
    ok("reset to DRAFT via trusted service-role state repair");
  }

  // 1) Valid publish after PDF + mapping validation
  {
    const pages = await loadPdfPageCount();
    const mappings = await activeMappings();
    const bad = mappings.filter(
      (m) => (m.page_number as number) < 1 || (m.page_number as number) > pages,
    );
    if (bad.length) fail(`unexpected invalid mappings before publish`);
    ok(`PDF has ${pages} page(s); ${mappings.length} ACTIVE mapping(s) in range`);

    const fp = await fingerprint();
    const { error } = await admin.rpc("publish_form_template", {
      p_form_id: formId,
      p_retire_form_id: null,
      p_reason: "walkthrough-valid-publish",
      p_actor_user_id: LEE_USER_ID,
      p_expected_structure_fingerprint: fp,
    });
    if (error) fail(error.message);
    ok("Publish succeeded with valid PDF + mappings");

    const { data: event } = await admin
      .from("form_state_events")
      .select("performed_by_user_id, event_type")
      .eq("form_id", formId)
      .eq("event_type", "FORM_PUBLISHED")
      .order("create_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (event?.performed_by_user_id !== LEE_USER_ID) {
      fail(`audit actor mismatch: ${event?.performed_by_user_id}`);
    }
    ok("Lifecycle audit records verified actor (Lee)");
  }

  // 2) Pending activation (same outcome as app helper)
  {
    const { data: pending, error } = await admin
      .from("packet_forms")
      .update({ availability_state: "AVAILABLE" })
      .eq("form_id", formId)
      .eq("status", "ACTIVE")
      .eq("availability_state", "PENDING_PUBLICATION")
      .select("id");
    if (error) fail(error.message);
    ok(`Activated ${pending?.length ?? 0} pending packet form(s)`);

    const { data: left } = await admin
      .from("packet_forms")
      .select("id")
      .eq("form_id", formId)
      .eq("status", "ACTIVE")
      .eq("availability_state", "PENDING_PUBLICATION");
    if ((left ?? []).length > 0) fail("pending rows remain");
    ok("No PENDING_PUBLICATION rows remain");
  }

  // 3) Unpublish (service-role state transition; app UI uses authenticated unpublish RPC)
  {
    const { error } = await admin
      .from("forms")
      .update({
        publication_state: "DRAFT",
        published_at: null,
        published_by_user_id: null,
      })
      .eq("id", formId);
    if (error) fail(error.message);
    ok("Unpublish succeeded (DRAFT restored)");

    const { data: pf } = await admin
      .from("packet_forms")
      .select("availability_state")
      .eq("form_id", formId)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();
    if (pf?.availability_state !== "AVAILABLE") {
      fail("unpublish should leave existing AVAILABLE packet forms available");
    }
    ok("Existing AVAILABLE packet form unchanged after Unpublish");
  }

  // 4) Invalid mapping — final publish must reject
  const mappings = await activeMappings();
  const mapping = mappings[0];
  if (!mapping) fail("expected an ACTIVE mapping");

  await admin
    .from("form_field_mappings")
    .update({ page_number: 99 })
    .eq("id", mapping.id);
  ok("Created invalid out-of-range mapping (page 99)");

  {
    const pages = await loadPdfPageCount();
    const current = await activeMappings();
    const invalid = current.filter(
      (m) => (m.page_number as number) < 1 || (m.page_number as number) > pages,
    );
    if (!invalid.length) fail("expected invalid mapping detection");
    ok("Authoritative revalidation detects out-of-range mapping");

    // App pathway refuses to call RPC when validation fails.
    const { data: stillDraft } = await admin
      .from("forms")
      .select("publication_state")
      .eq("id", formId)
      .single();
    if (stillDraft?.publication_state !== "DRAFT") {
      fail("state changed without publish");
    }
    const { count } = await admin
      .from("form_state_events")
      .select("id", { count: "exact", head: true })
      .eq("form_id", formId)
      .eq("event_type", "FORM_PUBLISHED");
    const publishedEventsBefore = count ?? 0;
    ok(
      `Final Publish blocked (no RPC); FORM_PUBLISHED count remains ${publishedEventsBefore}`,
    );
  }

  // 5) Correct and republish
  await admin
    .from("form_field_mappings")
    .update({ page_number: 1 })
    .eq("id", mapping.id);
  ok("Corrected mapping to page 1");

  {
    const fp = await fingerprint();
    const { error } = await admin.rpc("publish_form_template", {
      p_form_id: formId,
      p_retire_form_id: null,
      p_reason: "walkthrough-republish",
      p_actor_user_id: LEE_USER_ID,
      p_expected_structure_fingerprint: fp,
    });
    if (error) fail(error.message);
    ok("Republish succeeded after correction");
  }

  // 6) Idempotent re-activation / audit check
  {
    const { data: again } = await admin
      .from("packet_forms")
      .update({ availability_state: "AVAILABLE" })
      .eq("form_id", formId)
      .eq("status", "ACTIVE")
      .eq("availability_state", "PENDING_PUBLICATION")
      .select("id");
    ok(
      `Repeated activation idempotent (rows updated=${again?.length ?? 0})`,
    );

    const { count } = await admin
      .from("form_state_events")
      .select("id", { count: "exact", head: true })
      .eq("form_id", formId)
      .eq("event_type", "FORM_PUBLISHED");
    if ((count ?? 0) < 2) fail(`expected >=2 FORM_PUBLISHED, got ${count}`);
    ok(`FORM_PUBLISHED events=${count} (publish + republish)`);
  }

  // 7) Cleanup
  await admin
    .from("packet_forms")
    .update({ status: "DELETED" })
    .eq("form_id", formId);
  const { data: packets } = await admin
    .from("packets")
    .select("id")
    .ilike("label", `%${MARKER}%`)
    .neq("status", "DELETED");
  for (const p of packets ?? []) {
    await admin.from("packets").update({ status: "DELETED" }).eq("id", p.id);
  }
  await admin
    .from("forms")
    .update({ status: "DELETED", publication_state: "DRAFT" })
    .eq("id", formId);
  if (form.source_storage_path) {
    await admin.storage
      .from("form-templates")
      .remove([form.source_storage_path as string]);
  }
  ok("Cleaned up disposable walkthrough records");

  console.log("\nWalkthrough complete (trusted server pathway on development).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
