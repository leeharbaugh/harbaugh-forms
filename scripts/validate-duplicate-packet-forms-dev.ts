/**
 * Development-only validation that a packet may hold multiple independent
 * ACTIVE instances of the same form. Drives the real packet-form creation,
 * field-instance, and soft-delete paths with an authenticated (RLS) session
 * against harbaugh-forms-dev, using a disposable packet.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isDeepStrictEqual } from "node:util";
import {
  ensureFieldInstancesForPacket,
  ensureFieldInstancesForPacketForm,
} from "@/lib/field-instances";
import {
  addInternalFormToPacket,
  createAdditionalInternalPacketForms,
  findDuplicatePacketFormSelections,
  getNextPacketFormSortOrder,
  softDeletePacketForm,
} from "@/lib/types/packet-form";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";
const LABEL_PREFIX = "DUPPF packet ";

type PacketFormRow = {
  id: number;
  packet_id: number;
  form_id: number | null;
  status: string;
  document_state: string;
  availability_state: string;
  storage_path: string | null;
  document_name: string;
  sort_order: number;
  update_date: string;
};

type InstanceRow = {
  id: string;
  packet_form_id: number;
  field_id: string;
  value: string | null;
  is_override: boolean;
  status: string;
  update_date: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

class ValidationFailure extends Error {}

function fail(message: string): never {
  throw new ValidationFailure(message);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function loadPacketForms(
  client: SupabaseClient,
  packetId: number,
): Promise<PacketFormRow[]> {
  const { data, error } = await client
    .from("packet_forms")
    .select(
      "id, packet_id, form_id, status, document_state, availability_state, storage_path, document_name, sort_order, update_date",
    )
    .eq("packet_id", packetId)
    .order("id", { ascending: true });
  if (error) fail(`Could not load packet forms: ${error.message}`);
  return (data ?? []) as PacketFormRow[];
}

async function loadInstances(
  client: SupabaseClient,
  packetFormId: number,
): Promise<InstanceRow[]> {
  const { data, error } = await client
    .from("field_instances")
    .select("id, packet_form_id, field_id, value, is_override, status, update_date")
    .eq("packet_form_id", packetFormId)
    .order("id", { ascending: true });
  if (error) fail(`Could not load field instances: ${error.message}`);
  return (data ?? []) as InstanceRow[];
}

function activeFormIds(rows: PacketFormRow[]): Array<number | null> {
  return rows.filter((row) => row.status === "ACTIVE").map((row) => row.form_id);
}

function activeCount(rows: PacketFormRow[], formId: number): number {
  return rows.filter((row) => row.status === "ACTIVE" && row.form_id === formId).length;
}

async function pickMappedPublishedForms(
  admin: SupabaseClient,
): Promise<{ formA: { id: number; form_name: string }; formB: { id: number; form_name: string } }> {
  const { data, error } = await admin
    .from("forms")
    .select("id, form_name, source_storage_path")
    .eq("status", "ACTIVE")
    .eq("publication_state", "PUBLISHED")
    .eq("scope", "GLOBAL")
    .not("source_storage_path", "is", null)
    .order("id", { ascending: true });
  if (error) fail(`Could not list published forms: ${error.message}`);

  const mapped: Array<{ id: number; form_name: string }> = [];
  for (const form of data ?? []) {
    const { count } = await admin
      .from("form_field_mappings")
      .select("id", { count: "exact", head: true })
      .eq("form_id", form.id)
      .eq("status", "ACTIVE");
    if ((count ?? 0) > 0) {
      mapped.push({ id: form.id as number, form_name: form.form_name as string });
    }
  }

  const formA =
    mapped.find((form) => /amendment/i.test(form.form_name)) ?? mapped[0];
  const formB = mapped.find((form) => form.id !== formA?.id);
  if (!formA || !formB) fail("Need two published GLOBAL forms with active mappings");
  return { formA, formB };
}

async function cleanupPacket(admin: SupabaseClient, packetId: number) {
  const { data: rows } = await admin
    .from("packet_forms")
    .select("id, storage_path")
    .eq("packet_id", packetId);
  for (const row of rows ?? []) {
    await admin
      .from("field_instances")
      .update({ status: "DELETED" })
      .eq("packet_form_id", row.id)
      .eq("status", "ACTIVE");
    await admin.from("packet_forms").update({ status: "DELETED" }).eq("id", row.id);
    if (row.storage_path) {
      await admin.storage.from("generated-documents").remove([row.storage_path]);
    }
  }
  await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
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
  let packetId: number | null = null;

  try {
    const { data: stalePackets } = await admin
      .from("packets")
      .select("id")
      .like("label", `${LABEL_PREFIX}%`)
      .neq("status", "DELETED");
    for (const stale of stalePackets ?? []) {
      await cleanupPacket(admin, stale.id as number);
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

    const { formA, formB } = await pickMappedPublishedForms(admin);
    ok(`Form A #${formA.id} "${formA.form_name}"; Form B #${formB.id} "${formB.form_name}"`);

    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({
        label: `${LABEL_PREFIX}${stamp}`,
        status: "ACTIVE",
        owner_user_id: LEE_USER_ID,
        generated_by_user_id: LEE_USER_ID,
        packet_type: "custom",
      })
      .select("id")
      .single();
    if (packetError || !packet) fail(`Could not create disposable packet: ${packetError?.message}`);
    packetId = packet.id as number;

    // Normal (non-duplicate) add: no confirmation needed.
    let rows = await loadPacketForms(browser, packetId);
    if (findDuplicatePacketFormSelections([formA], activeFormIds(rows)).length !== 0) {
      fail("First add of Form A should not need duplicate confirmation");
    }
    const firstId = await addInternalFormToPacket(
      browser,
      packetId,
      formA.id,
      getNextPacketFormSortOrder(rows),
    );
    const firstInstances = await ensureFieldInstancesForPacketForm(browser, firstId);
    if (firstInstances.length === 0) fail("Form A produced no field instances");
    ok(`normal add created packet form #${firstId} with ${firstInstances.length} field instances`);

    const marker = `DUPPF original value ${stamp}`;
    const markedInstanceId = firstInstances[0].id;
    const { error: markError } = await browser
      .from("field_instances")
      .update({ value: marker, is_override: true, source: "manual_override" })
      .eq("id", markedInstanceId);
    if (markError) fail(`Could not set a transaction value on the original: ${markError.message}`);

    rows = await loadPacketForms(browser, packetId);
    const originalRow = rows.find((row) => row.id === firstId)!;
    const originalInstances = await loadInstances(browser, firstId);

    const assertOriginalUnchanged = async (stage: string) => {
      const currentRows = await loadPacketForms(browser, packetId!);
      const currentRow = currentRows.find((row) => row.id === firstId);
      if (!isDeepStrictEqual(currentRow, originalRow)) {
        fail(`${stage}: original packet form row changed`);
      }
      const currentInstances = await loadInstances(browser, firstId);
      if (!isDeepStrictEqual(currentInstances, originalInstances)) {
        fail(`${stage}: original field instances changed`);
      }
      ok(`${stage}: original packet form #${firstId} and its field instances are unchanged`);
    };

    // Duplicate detected; cancelling creates nothing.
    const duplicates = findDuplicatePacketFormSelections([formA], activeFormIds(rows));
    if (duplicates.length !== 1 || duplicates[0].existingCount !== 1) {
      fail("Form A should be flagged as already in the packet (for confirmation only)");
    }
    const rowsAfterCancel = await loadPacketForms(browser, packetId);
    if (rowsAfterCancel.length !== rows.length) fail("Cancelled duplicate created a row");
    ok("duplicate is flagged for confirmation; cancelling creates nothing");

    // Confirmed duplicate: a second, distinct ACTIVE packet form.
    let secondId: number;
    try {
      secondId = await addInternalFormToPacket(
        browser,
        packetId,
        formA.id,
        getNextPacketFormSortOrder(rows),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/packet_forms_packet_form_internal_active_uidx|duplicate key/i.test(message)) {
        fail(
          `database still blocks duplicate packet forms (${message}). Apply 20260930120000_packet_forms_allow_duplicate_forms.sql`,
        );
      }
      throw error;
    }
    rows = await loadPacketForms(browser, packetId);
    const secondRow = rows.find((row) => row.id === secondId);
    if (!secondRow || secondId === firstId) fail("Duplicate did not create a distinct packet form");
    if (secondRow.status !== "ACTIVE" || secondRow.form_id !== formA.id) {
      fail("Duplicate packet form is not an ACTIVE instance of Form A");
    }
    if (activeCount(rows, formA.id) !== 2) fail("Expected two ACTIVE packet forms for Form A");
    if (!secondRow.storage_path || secondRow.storage_path === originalRow.storage_path) {
      fail("Duplicate must have its own stored PDF");
    }
    ok(`confirmed duplicate created ACTIVE packet form #${secondId} (distinct id and PDF)`);

    const secondInstances = await ensureFieldInstancesForPacketForm(browser, secondId);
    const firstIds = new Set(originalInstances.map((instance) => instance.id));
    if (secondInstances.length !== originalInstances.length) {
      fail("Duplicate should receive a full fresh set of field instances");
    }
    if (secondInstances.some((instance) => firstIds.has(instance.id))) {
      fail("Duplicate shares field instance rows with the original");
    }
    if (secondInstances.some((instance) => instance.packet_form_id !== secondId)) {
      fail("Duplicate field instances are not attached to the duplicate");
    }
    if (secondInstances.some((instance) => instance.value === marker)) {
      fail("Duplicate cloned the original's transaction-specific value");
    }
    ok(`duplicate has its own ${secondInstances.length} field instances; no values cloned`);
    await assertOriginalUnchanged("after duplicate");

    // Mixed selection: Form A duplicate + Form B new.
    const mixed = findDuplicatePacketFormSelections([formA, formB], activeFormIds(rows));
    if (mixed.length !== 1 || mixed[0].formId !== formA.id) {
      fail("Mixed selection should flag only Form A");
    }
    const beforeMixedIds = new Set(rows.map((row) => row.id));
    await createAdditionalInternalPacketForms(
      browser,
      packetId,
      [formA.id, formB.id],
      getNextPacketFormSortOrder(rows),
      LEE_USER_ID,
    );
    rows = await loadPacketForms(browser, packetId);
    const mixedNew = rows.filter((row) => !beforeMixedIds.has(row.id));
    if (mixedNew.length !== 2) fail("Mixed add should create exactly two packet forms");
    if (activeCount(rows, formA.id) !== 3 || activeCount(rows, formB.id) !== 1) {
      fail("Mixed add should yield three Form A copies and one Form B");
    }
    for (const row of mixedNew) {
      const instances = await ensureFieldInstancesForPacketForm(browser, row.id);
      if (instances.length === 0) fail(`Packet form #${row.id} has no field instances`);
    }
    ok("mixed add (Form A duplicate + Form B new) created both as separate packet forms");
    await assertOriginalUnchanged("after mixed add");

    // Packet-level ensure with repeated forms.
    await ensureFieldInstancesForPacket(browser, packetId);
    await assertOriginalUnchanged("after packet-level field-instance ensure");

    // Deleting one duplicate does not affect the others.
    const secondInstancesBeforeDelete = await loadInstances(browser, secondId);
    await softDeletePacketForm(browser, secondId);
    rows = await loadPacketForms(browser, packetId);
    if (rows.find((row) => row.id === secondId)?.status !== "DELETED") {
      fail("Deleted duplicate is not soft-deleted");
    }
    if (activeCount(rows, formA.id) !== 2) fail("Other Form A copies should remain ACTIVE");
    const secondInstancesAfterDelete = await loadInstances(browser, secondId);
    if (!isDeepStrictEqual(secondInstancesAfterDelete, secondInstancesBeforeDelete)) {
      fail("Soft delete should preserve the deleted copy's field-instance history");
    }
    ok(`soft-deleting #${secondId} left the other Form A copies ACTIVE and kept its history`);
    await assertOriginalUnchanged("after deleting a duplicate");
  } finally {
    await browser.auth.signOut();
    if (packetId) await cleanupPacket(admin, packetId);
  }

  console.log("\nAll duplicate packet-form development checks passed.");
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
