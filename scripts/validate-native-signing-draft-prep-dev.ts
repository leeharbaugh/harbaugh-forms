/**
 * Development-only R12 validator for Draft preparation (PR #46 QA pass 5).
 *
 * Proves one source Packet per Signing: selecting a Packet binds
 * `source_packet_id`, imports its transaction parties (dedupe by contact id,
 * missing email allowed, ad hoc participants preserved), Packet document adds
 * are scoped to that Packet, a second Packet cannot be mixed in, switching is
 * allowed only before Packet-derived state exists, ad hoc PDFs remain allowed,
 * and another User's Packet or Signing is denied.
 *
 * Also proves trusted Draft field rules: removing a Signature removes its
 * paired Date Signed, Initials and Date Signed remove independently, and
 * reassigning a Signature moves its paired Date Signed to the same participant.
 *
 * Never targets production. Refuses to run unless the URL is the development
 * project.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { addAdHocDraftSigningDocumentWithActor } from "../lib/signing/ad-hoc-documents.ts";
import {
  addDraftSigningDocumentWithActor,
  addRemainingPacketDocumentsWithActor,
} from "../lib/signing/draft-documents.ts";
import {
  removeDraftSigningFieldWithActor,
  upsertDraftSigningFieldWithActor,
} from "../lib/signing/draft-fields.ts";
import { addDraftSigningParticipantWithActor } from "../lib/signing/draft-participants.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import {
  loadDraftSourcePacketStateWithActor,
  selectDraftSourcePacketWithActor,
} from "../lib/signing/source-packet.ts";
import { SIGNING_ARTIFACTS_BUCKET } from "../lib/signing/stage1-schema.ts";
import { GENERATED_DOCUMENTS_BUCKET } from "../lib/packet-form-storage.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";

class ValidationFailure extends Error {}

function fail(message: string): never {
  throw new ValidationFailure(message);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function expectSigningError(
  label: string,
  codes: string[],
  action: () => Promise<unknown>,
) {
  try {
    await action();
  } catch (error) {
    if (error instanceof SigningError && codes.includes(error.code)) {
      ok(`${label} rejected (${error.code})`);
      return;
    }
    fail(
      `${label} threw unexpected error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  fail(`${label} unexpectedly succeeded`);
}

function buildActor(options: {
  userId: string;
  email: string;
  displayName: string;
  organizationId: string;
}): SigningActor {
  const profile = {
    id: options.userId,
    create_date: new Date().toISOString(),
    update_date: new Date().toISOString(),
    status: "ACTIVE",
    app_role: "USER",
    onboarding_status: "ACTIVE",
    invited_at: null,
    activated_at: null,
    invited_by_user_id: null,
    first_name: "Draft",
    middle_name: null,
    last_name: "Prep",
    preferred_name: null,
    display_name: options.displayName,
    email: options.email,
    phone: null,
    trec_license_number: null,
    brokerage_name: null,
    notes: null,
    primary_organization_id: options.organizationId,
    must_change_password: false,
  } as Profile;
  return {
    userId: options.userId,
    email: options.email,
    displayName: options.displayName,
    profile,
    memberships: [
      {
        organizationId: options.organizationId,
        membershipRole: "MEMBER",
        membershipStatus: "ACTIVE",
        organizationStatus: "ACTIVE",
      },
    ],
  };
}

async function makeFixturePdf(label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 72, y: 720, size: 18, font });
  return doc.save();
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) fail("Missing Supabase service key");

  const admin: SupabaseClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const previousGate = process.env.NATIVE_SIGNING_ENABLED;
  process.env.NATIVE_SIGNING_ENABLED = "true";

  const stamp = Date.now();
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const packetIds: number[] = [];
  const packetFormIds: number[] = [];
  const contactIds: number[] = [];
  const packetContactIds: number[] = [];
  const generatedPaths: string[] = [];
  const signingIds: string[] = [];

  async function createUser(label: string) {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: `Draft Prep ${label} ${stamp}`, status: "ACTIVE" })
      .select("id")
      .single();
    if (orgError || !org) fail(orgError?.message ?? "org create failed");
    organizationIds.push(org.id as string);

    const email = `draft-prep-${label}-${stamp}@example.com`;
    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email,
      password: `DraftPrep-${randomUUID()}!aA1`,
      email_confirm: true,
    });
    if (userError || !created.user) fail(userError?.message ?? "user create failed");
    const userId = created.user.id;
    userIds.push(userId);

    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      email,
      status: "ACTIVE",
      app_role: "USER",
      onboarding_status: "ACTIVE",
      display_name: `Draft Prep ${label}`,
      first_name: "Draft",
      last_name: label,
      primary_organization_id: org.id,
      must_change_password: false,
    });
    if (profileError) fail(profileError.message);
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: org.id,
      user_id: userId,
      membership_role: "MEMBER",
      status: "ACTIVE",
    });
    if (memberError) fail(memberError.message);

    return buildActor({
      userId,
      email,
      displayName: `Draft Prep ${label}`,
      organizationId: org.id as string,
    });
  }

  async function createPacket(ownerId: string, label: string, formCount: number) {
    const { data: packet, error } = await admin
      .from("packets")
      .insert({
        owner_user_id: ownerId,
        label: `${label} ${stamp}`,
        status: "ACTIVE",
        packet_type: "custom",
      })
      .select("id")
      .single();
    if (error || !packet) fail(error?.message ?? "packet create failed");
    const packetId = packet.id as number;
    packetIds.push(packetId);

    const formIds: number[] = [];
    for (let index = 0; index < formCount; index += 1) {
      const { data: form, error: formError } = await admin
        .from("packet_forms")
        .insert({
          packet_id: packetId,
          form_id: null,
          status: "ACTIVE",
          document_state: "DRAFT",
          availability_state: "AVAILABLE",
          document_name: `${label} form ${index + 1}`,
          document_type: "PDF",
          origin: "external_upload",
          sort_order: index + 1,
          is_required: false,
          field_data: {},
          owner_user_id: ownerId,
        })
        .select("id")
        .single();
      if (formError || !form) fail(formError?.message ?? "form create failed");
      const formId = form.id as number;
      packetFormIds.push(formId);
      const storagePath = `users/${ownerId}/packets/${packetId}/${formId}-draft-prep-${stamp}.pdf`;
      const { error: uploadError } = await admin.storage
        .from(GENERATED_DOCUMENTS_BUCKET)
        .upload(storagePath, await makeFixturePdf(`${label} ${index + 1}`), {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) fail(uploadError.message);
      generatedPaths.push(storagePath);
      const { error: pathError } = await admin
        .from("packet_forms")
        .update({ storage_path: storagePath })
        .eq("id", formId);
      if (pathError) fail(pathError.message);
      formIds.push(formId);
    }
    return { packetId, formIds };
  }

  async function createContact(
    ownerId: string,
    firstName: string,
    lastName: string,
    email: string | null,
  ) {
    const { data, error } = await admin
      .from("contacts")
      .insert({
        owner_user_id: ownerId,
        contact_type: "INDIVIDUAL",
        first_name: firstName,
        last_name: lastName,
        email,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (error || !data) fail(error?.message ?? "contact create failed");
    contactIds.push(data.id as number);
    return data.id as number;
  }

  async function linkContact(
    packetId: number,
    contactId: number,
    role: string,
    sortOrder: number,
  ) {
    const { data, error } = await admin
      .from("packet_contacts")
      .insert({
        packet_id: packetId,
        contact_id: contactId,
        packet_role: role,
        sort_order: sortOrder,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (error || !data) fail(error?.message ?? "packet contact create failed");
    packetContactIds.push(data.id as number);
  }

  async function createSigning(actor: SigningActor, title: string) {
    const signing = await createDraftSigningWithActor(
      actor,
      { title: `${title} ${stamp}` },
      admin,
    );
    signingIds.push(signing.id);
    return signing.id;
  }

  async function participantsOf(signingId: string) {
    const { data, error } = await admin
      .from("signing_participants")
      .select("id, full_name, email, linked_contact_id")
      .eq("signing_id", signingId);
    if (error) fail(error.message);
    return data ?? [];
  }

  async function sourcePacketOf(signingId: string) {
    const { data, error } = await admin
      .from("signings")
      .select("source_packet_id")
      .eq("id", signingId)
      .single();
    if (error || !data) fail(error?.message ?? "signing missing");
    return data.source_packet_id as number | null;
  }

  async function fieldsOf(signingId: string) {
    const { data, error } = await admin
      .from("signing_draft_fields")
      .select("id, field_type, signing_participant_id, linked_signature_draft_field_id")
      .eq("signing_id", signingId);
    if (error) fail(error.message);
    return data ?? [];
  }

  try {
    const agent = await createUser("agent");
    const outsider = await createUser("outsider");

    const packetA = await createPacket(agent.userId, "Packet A", 2);
    const packetB = await createPacket(agent.userId, "Packet B", 1);
    const outsiderPacket = await createPacket(outsider.userId, "Outsider", 1);
    ok("created disposable Packets and forms");

    const buyer = await createContact(agent.userId, "Bea", "Buyer", "bea@example.com");
    const coBuyer = await createContact(agent.userId, "Cal", "Buyer", null);
    await linkContact(packetA.packetId, buyer, "BUYER", 0);
    await linkContact(packetA.packetId, coBuyer, "CO_CLIENT", 1);
    const packetBParty = await createContact(agent.userId, "Pat", "Seller", "pat@example.com");
    await linkContact(packetB.packetId, packetBParty, "SELLER", 0);
    ok("linked Packet parties (one without email)");

    // --- Blank Signing: ad hoc first, then select Packet A --------------------
    const signingId = await createSigning(agent, "Draft prep binding");
    await addDraftSigningParticipantWithActor(
      agent,
      { signingId, fullName: "Ad Hoc Witness" },
      admin,
    );
    // Already linked to the buyer contact: the Packet import must not duplicate it.
    await addDraftSigningParticipantWithActor(
      agent,
      { signingId, fullName: "Bea Buyer", linkedContactId: buyer },
      admin,
    );
    await addAdHocDraftSigningDocumentWithActor(
      agent,
      {
        signingId,
        filename: "ad-hoc.pdf",
        pdfBytes: await makeFixturePdf("Ad hoc before Packet"),
      },
      admin,
    );
    ok("ad hoc participant and PDF allowed before a Packet is selected");

    const blankState = await loadDraftSourcePacketStateWithActor(
      agent,
      { signingId },
      admin,
    );
    if (blankState.sourcePacket !== null || !blankState.canChangeSourcePacket) {
      fail("blank Signing should have no source Packet and allow selection");
    }
    const selectableIds = blankState.selectablePackets.map((row) => row.id);
    if (
      !selectableIds.includes(packetA.packetId) ||
      !selectableIds.includes(packetB.packetId) ||
      selectableIds.includes(outsiderPacket.packetId)
    ) {
      fail("selectable Packets must be the actor's own Packets only");
    }
    ok("Packet chooser lists only the actor's own Packets");

    await expectSigningError(
      "selecting another User's Packet",
      ["INVALID_PACKET"],
      () =>
        selectDraftSourcePacketWithActor(
          agent,
          { signingId, packetId: outsiderPacket.packetId },
          admin,
        ),
    );
    if ((await sourcePacketOf(signingId)) !== null) {
      fail("unauthorized Packet selection must not bind");
    }

    const selected = await selectDraftSourcePacketWithActor(
      agent,
      { signingId, packetId: packetA.packetId },
      admin,
    );
    if ((await sourcePacketOf(signingId)) !== packetA.packetId) {
      fail("selecting Packet A must set source_packet_id");
    }
    if (
      selected.addedParticipantCount !== 1 ||
      selected.skippedExistingParticipantCount !== 1
    ) {
      fail(
        `expected 1 imported + 1 skipped, got ${selected.addedParticipantCount}/${selected.skippedExistingParticipantCount}`,
      );
    }
    const afterSelect = await participantsOf(signingId);
    if (afterSelect.length !== 3) {
      fail(`expected ad hoc + 2 Packet participants, got ${afterSelect.length}`);
    }
    if (!afterSelect.some((row) => row.full_name === "Ad Hoc Witness")) {
      fail("ad hoc participant must be preserved");
    }
    const buyerRows = afterSelect.filter((row) => row.linked_contact_id === buyer);
    if (buyerRows.length !== 1) fail("an already-linked contact must not import twice");
    const coBuyerRow = afterSelect.find((row) => row.linked_contact_id === coBuyer);
    if (!coBuyerRow || coBuyerRow.email !== "") {
      fail("Packet party without email must import with empty Draft email");
    }
    ok("selecting Packet A binds source_packet_id and imports parties (deduped, missing email OK, ad hoc kept)");

    const reselect = await selectDraftSourcePacketWithActor(
      agent,
      { signingId, packetId: packetA.packetId },
      admin,
    );
    if (
      reselect.addedParticipantCount !== 0 ||
      (await participantsOf(signingId)).length !== 3
    ) {
      fail("re-selecting the same Packet must not duplicate participants");
    }
    ok("re-selecting the source Packet creates no duplicate participants");

    const stateWithParties = await loadDraftSourcePacketStateWithActor(
      agent,
      { signingId },
      admin,
    );
    if (stateWithParties.canChangeSourcePacket) {
      fail("Packet-linked participants must block switching Packets");
    }
    await expectSigningError(
      "switching to Packet B after Packet parties were imported",
      ["INVALID_PACKET"],
      () =>
        selectDraftSourcePacketWithActor(
          agent,
          { signingId, packetId: packetB.packetId },
          admin,
        ),
    );

    await expectSigningError(
      "adding a Packet B document to a Packet A Signing",
      ["INVALID_PACKET"],
      () =>
        addDraftSigningDocumentWithActor(
          agent,
          { signingId, sourcePacketFormId: packetB.formIds[0] },
          admin,
        ),
    );
    await expectSigningError(
      "Add all from Packet B on a Packet A Signing",
      ["INVALID_PACKET"],
      () =>
        addRemainingPacketDocumentsWithActor(
          agent,
          { signingId, packetId: packetB.packetId },
          admin,
        ),
    );

    const added = await addRemainingPacketDocumentsWithActor(
      agent,
      { signingId },
      admin,
    );
    if (added.addedCount !== 2) fail(`expected 2 Packet A documents, got ${added.addedCount}`);
    await addAdHocDraftSigningDocumentWithActor(
      agent,
      {
        signingId,
        filename: "ad-hoc-2.pdf",
        pdfBytes: await makeFixturePdf("Ad hoc after Packet"),
      },
      admin,
    );
    if ((await sourcePacketOf(signingId)) !== packetA.packetId) {
      fail("source Packet must stay Packet A");
    }
    ok("Add all scopes to Packet A; ad hoc PDF still allowed alongside it");

    await expectSigningError(
      "another User selecting a Packet on this Signing",
      ["NOT_FOUND", "FORBIDDEN"],
      () =>
        selectDraftSourcePacketWithActor(
          outsider,
          { signingId, packetId: outsiderPacket.packetId },
          admin,
        ),
    );
    await expectSigningError(
      "another User reading this Signing's Packet state",
      ["NOT_FOUND", "FORBIDDEN"],
      () => loadDraftSourcePacketStateWithActor(outsider, { signingId }, admin),
    );

    // --- Switching allowed only before Packet-derived state -------------------
    const switchSigningId = await createSigning(agent, "Draft prep switch");
    const { data: emptyPacket, error: emptyPacketError } = await admin
      .from("packets")
      .insert({
        owner_user_id: agent.userId,
        label: `Empty packet ${stamp}`,
        status: "ACTIVE",
        packet_type: "custom",
      })
      .select("id")
      .single();
    if (emptyPacketError || !emptyPacket) fail(emptyPacketError?.message ?? "packet");
    packetIds.push(emptyPacket.id as number);
    await selectDraftSourcePacketWithActor(
      agent,
      { signingId: switchSigningId, packetId: emptyPacket.id },
      admin,
    );
    const switchable = await loadDraftSourcePacketStateWithActor(
      agent,
      { signingId: switchSigningId },
      admin,
    );
    if (!switchable.canChangeSourcePacket) {
      fail("a Signing with no Packet-derived state should allow switching");
    }
    await selectDraftSourcePacketWithActor(
      agent,
      { signingId: switchSigningId, packetId: packetB.packetId },
      admin,
    );
    if ((await sourcePacketOf(switchSigningId)) !== packetB.packetId) {
      fail("safe switch should bind Packet B");
    }
    ok("switching is allowed only while no Packet-derived state exists");

    // --- Standalone add binds on first Packet document ------------------------
    const standaloneId = await createSigning(agent, "Draft prep standalone");
    await addDraftSigningDocumentWithActor(
      agent,
      { signingId: standaloneId, sourcePacketFormId: packetA.formIds[0] },
      admin,
    );
    if ((await sourcePacketOf(standaloneId)) !== packetA.packetId) {
      fail("first Packet document must bind the source Packet");
    }
    await expectSigningError(
      "mixing Packet B into a Signing bound by its first document",
      ["INVALID_PACKET"],
      () =>
        addDraftSigningDocumentWithActor(
          agent,
          { signingId: standaloneId, sourcePacketFormId: packetB.formIds[0] },
          admin,
        ),
    );
    ok("first Packet document binds the Signing; a second Packet cannot be mixed in");

    // --- Draft field rules -----------------------------------------------------
    const { data: docs, error: docsError } = await admin
      .from("signing_documents")
      .select("id")
      .eq("signing_id", signingId)
      .eq("included_in_draft", true)
      .not("source_packet_form_id", "is", null)
      .limit(1);
    if (docsError || !docs?.[0]) fail(docsError?.message ?? "no document");
    const documentId = docs[0].id as string;
    const buyerParticipant = buyerRows[0].id as string;
    const coBuyerParticipant = coBuyerRow.id as string;

    const geometry = { pageNumber: 1, width: 160, height: 40 };
    const signature = await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId,
        signingDocumentId: documentId,
        signingParticipantId: buyerParticipant,
        fieldType: "SIGNATURE",
        x: 72,
        y: 600,
        ...geometry,
      },
      admin,
    );
    const pairedDate = await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId,
        signingDocumentId: documentId,
        signingParticipantId: buyerParticipant,
        fieldType: "DATE_SIGNED",
        linkedSignatureDraftFieldId: signature.id,
        x: 250,
        y: 600,
        pageNumber: 1,
        width: 100,
        height: 24,
      },
      admin,
    );

    await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId,
        fieldId: signature.id,
        signingDocumentId: documentId,
        signingParticipantId: coBuyerParticipant,
        fieldType: "SIGNATURE",
        x: 80,
        y: 610,
        ...geometry,
      },
      admin,
    );
    const afterReassign = await fieldsOf(signingId);
    const movedDate = afterReassign.find((row) => row.id === pairedDate.id);
    if (movedDate?.signing_participant_id !== coBuyerParticipant) {
      fail("reassigning a Signature must move its paired Date Signed");
    }
    ok("reassigning a Signature moves its paired Date Signed to the same participant");

    const initials = await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId,
        signingDocumentId: documentId,
        signingParticipantId: buyerParticipant,
        fieldType: "INITIALS",
        x: 400,
        y: 100,
        pageNumber: 1,
        width: 80,
        height: 40,
      },
      admin,
    );
    const removedInitials = await removeDraftSigningFieldWithActor(
      agent,
      { signingId, fieldId: initials.id },
      admin,
    );
    if (
      removedInitials.removedFieldIds.length !== 1 ||
      (await fieldsOf(signingId)).length !== 2
    ) {
      fail("removing Initials must remove only the Initials field");
    }
    ok("Initials remove independently");

    const removedSignature = await removeDraftSigningFieldWithActor(
      agent,
      { signingId, fieldId: signature.id },
      admin,
    );
    const remaining = await fieldsOf(signingId);
    if (
      removedSignature.removedFieldIds.length !== 2 ||
      remaining.some((row) => row.field_type === "DATE_SIGNED")
    ) {
      fail("removing a Signature must remove its paired Date Signed (no orphan)");
    }
    ok("removing a Signature removes its paired Date Signed");

    const signature2 = await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId,
        signingDocumentId: documentId,
        signingParticipantId: buyerParticipant,
        fieldType: "SIGNATURE",
        x: 72,
        y: 500,
        ...geometry,
      },
      admin,
    );
    const date2 = await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId,
        signingDocumentId: documentId,
        signingParticipantId: buyerParticipant,
        fieldType: "DATE_SIGNED",
        linkedSignatureDraftFieldId: signature2.id,
        x: 250,
        y: 500,
        pageNumber: 1,
        width: 100,
        height: 24,
      },
      admin,
    );
    await removeDraftSigningFieldWithActor(agent, { signingId, fieldId: date2.id }, admin);
    const afterDateRemove = await fieldsOf(signingId);
    if (
      afterDateRemove.length !== 1 ||
      afterDateRemove[0].id !== signature2.id
    ) {
      fail("removing a Date Signed must keep its Signature");
    }
    ok("Date Signed removes independently of its Signature");

    await expectSigningError(
      "another User removing a Draft field",
      ["NOT_FOUND", "FORBIDDEN"],
      () =>
        removeDraftSigningFieldWithActor(
          outsider,
          { signingId, fieldId: signature2.id },
          admin,
        ),
    );

    console.log("\nDraft preparation validator: all checks passed.");
  } finally {
    process.env.NATIVE_SIGNING_ENABLED = previousGate;

    const snapshotKeys: string[] = [];
    for (const id of signingIds) {
      const { data } = await admin
        .from("signing_draft_source_snapshots")
        .select("source_pdf_object_key")
        .eq("signing_id", id);
      for (const row of data ?? []) {
        if (row.source_pdf_object_key) snapshotKeys.push(row.source_pdf_object_key as string);
      }
    }
    if (snapshotKeys.length > 0) {
      await admin.storage.from(SIGNING_ARTIFACTS_BUCKET).remove(snapshotKeys);
    }
    if (generatedPaths.length > 0) {
      await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).remove(generatedPaths);
    }

    for (const id of signingIds) {
      await admin
        .from("signing_draft_fields")
        .update({ linked_signature_draft_field_id: null })
        .eq("signing_id", id);
      await admin.from("signing_draft_fields").delete().eq("signing_id", id);
      await admin
        .from("signing_documents")
        .update({ selected_draft_source_snapshot_id: null })
        .eq("signing_id", id);
      await admin.from("signing_draft_source_snapshots").delete().eq("signing_id", id);
      await admin.from("signing_documents").delete().eq("signing_id", id);
      await admin.from("signing_participants").delete().eq("signing_id", id);
      await admin.from("signing_events").delete().eq("signing_id", id);
      await admin
        .from("signings")
        .update({ current_primary_agent_association_id: null })
        .eq("id", id);
      await admin.from("signing_agent_associations").delete().eq("signing_id", id);
      await admin.from("signings").delete().eq("id", id);
    }
    if (packetContactIds.length > 0) {
      await admin.from("packet_contacts").delete().in("id", packetContactIds);
    }
    if (contactIds.length > 0) {
      await admin.from("contacts").delete().in("id", contactIds);
    }
    if (packetFormIds.length > 0) {
      await admin.from("packet_forms").update({ status: "DELETED" }).in("id", packetFormIds);
    }
    if (packetIds.length > 0) {
      await admin.from("packets").update({ status: "DELETED" }).in("id", packetIds);
    }
    for (const userId of userIds) {
      await admin.from("organization_members").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    for (const orgId of organizationIds) {
      await admin.from("organizations").delete().eq("id", orgId);
    }

    const { count: leftover } = await admin
      .from("signings")
      .select("id", { count: "exact", head: true })
      .in("id", signingIds.length > 0 ? signingIds : [randomUUID()]);
    console.log(`Cleanup: ${leftover ?? 0} fixture Signing(s) remaining.`);
  }
}

main().catch((error) => {
  if (error instanceof ValidationFailure) {
    console.error(`FAIL: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
