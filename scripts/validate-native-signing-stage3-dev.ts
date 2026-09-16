/**
 * Development-only R12 Stage 3 Native Signing validator.
 * Proves mutable Draft preparation creates no versions/revisions, and that
 * internal promotion can create/reuse SHA-256 fingerprinted document versions
 * and complete package revisions without exposing Send / Begin In-Person.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { SigningActor } from "../lib/signing/types.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import {
  addDraftSigningDocumentWithActor,
  removeDraftSigningDocumentWithActor,
  reorderDraftSigningDocumentsWithActor,
} from "../lib/signing/draft-documents.ts";
import {
  addDraftSigningParticipantWithActor,
} from "../lib/signing/draft-participants.ts";
import {
  upsertDraftSigningFieldWithActor,
} from "../lib/signing/draft-fields.ts";
import { promotePackageRevisionFromDraftWithActor } from "../lib/signing/package-promotion.ts";
import { updateDraftSourceToLatestWithActor } from "../lib/signing/source-drift.ts";
import { verifyPreparedDocumentVersionIntegrity } from "../lib/signing/integrity.ts";
import { ensurePreparedDocumentVersion } from "../lib/signing/document-versions.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { NativeSigningDisabledError } from "../lib/signing/feature-gate.ts";
import {
  NATIVE_SIGNING_STAGE1_TABLES,
  NATIVE_SIGNING_STAGE3_DRAFT_TABLES,
  SIGNING_ARTIFACTS_BUCKET,
} from "../lib/signing/stage1-schema.ts";
import { GENERATED_DOCUMENTS_BUCKET } from "../lib/packet-form-storage.ts";
import type { Profile } from "../lib/types/profile.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";

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

async function expectSigningError(
  label: string,
  code: string,
  action: () => Promise<unknown>,
) {
  try {
    await action();
    fail(`${label} unexpectedly succeeded`);
  } catch (error) {
    if (error instanceof SigningError && error.code === code) {
      ok(`${label} rejected (${error.code})`);
      return;
    }
    if (
      error instanceof NativeSigningDisabledError &&
      code === "NATIVE_SIGNING_DISABLED"
    ) {
      ok(`${label} rejected (${error.code})`);
      return;
    }
    fail(
      `${label} threw unexpected error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
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
    first_name: "Stage",
    middle_name: null,
    last_name: "Three",
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

async function countRows(
  admin: ReturnType<typeof createClient>,
  table: string,
  signingId: string,
) {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("signing_id", signingId);
  if (error) throw new Error(error.message);
  return count ?? 0;
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

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) {
    fail("Missing Supabase anon/service keys");
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const browser = createClient(url, anonKey);

  const previousGate = process.env.NATIVE_SIGNING_ENABLED;
  process.env.NATIVE_SIGNING_ENABLED = "true";

  const stamp = Date.now();
  const password = `Stage3-${randomUUID()}!aA1`;
  const agentEmail = `stage3-agent-${stamp}@example.com`;
  let agentUserId = "";
  let organizationId = "";
  let packetId = 0;
  let packetFormA = 0;
  let packetFormB = 0;
  let packetFormC = 0;
  const createdSigningIds: string[] = [];
  const storageKeysToRemove: string[] = [];
  const generatedPathsToRemove: string[] = [];

  try {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: `Stage 3 Org ${stamp}`,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (orgError || !org) fail(orgError?.message ?? "org create failed");
    organizationId = org.id as string;

    const { data: createdUser, error: createUserError } =
      await admin.auth.admin.createUser({
        email: agentEmail,
        password,
        email_confirm: true,
      });
    if (createUserError || !createdUser.user) {
      fail(createUserError?.message ?? "user create failed");
    }
    agentUserId = createdUser.user.id;

    const { error: profileError } = await admin.from("profiles").upsert({
      id: agentUserId,
      email: agentEmail,
      status: "ACTIVE",
      app_role: "USER",
      onboarding_status: "ACTIVE",
      display_name: "Stage Three Agent",
      first_name: "Stage",
      last_name: "Three",
      primary_organization_id: organizationId,
      must_change_password: false,
    });
    if (profileError) fail(profileError.message);

    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: agentUserId,
      membership_role: "MEMBER",
      status: "ACTIVE",
    });
    if (memberError) fail(memberError.message);

    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({
        owner_user_id: agentUserId,
        label: `Stage 3 packet ${stamp}`,
        status: "ACTIVE",
        packet_type: "custom",
      })
      .select("id")
      .single();
    if (packetError || !packet) fail(packetError?.message ?? "packet create failed");
    packetId = packet.id as number;

    async function createFixturePacketForm(label: string, sortOrder: number) {
      const pdfBytes = await makeFixturePdf(`${label} ${stamp}`);
      const { data: inserted, error: insertError } = await admin
        .from("packet_forms")
        .insert({
          packet_id: packetId,
          form_id: null,
          status: "ACTIVE",
          document_state: "DRAFT",
          availability_state: "AVAILABLE",
          document_name: label,
          document_type: "PDF",
          origin: "external_upload",
          sort_order: sortOrder,
          is_required: false,
          field_data: {},
          owner_user_id: agentUserId,
        })
        .select("id")
        .single();
      if (insertError || !inserted) {
        fail(insertError?.message ?? `failed to create ${label}`);
      }
      const formId = inserted.id as number;
      const storagePath = `users/${agentUserId}/packets/${packetId}/${formId}-stage3-${stamp}.pdf`;
      const { error: uploadError } = await admin.storage
        .from(GENERATED_DOCUMENTS_BUCKET)
        .upload(storagePath, pdfBytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) fail(`fixture PDF upload failed: ${uploadError.message}`);
      generatedPathsToRemove.push(storagePath);

      const { error: pathError } = await admin
        .from("packet_forms")
        .update({ storage_path: storagePath })
        .eq("id", formId);
      if (pathError) fail(pathError.message);
      return formId;
    }

    packetFormA = await createFixturePacketForm(`Stage3 Contract ${stamp}`, 1);
    packetFormB = await createFixturePacketForm(`Stage3 Financing ${stamp}`, 2);
    packetFormC = await createFixturePacketForm(`Stage3 HOA ${stamp}`, 3);
    ok("created disposable Stage 3 packet forms with distinct PDFs");

    const agent = buildActor({
      userId: agentUserId,
      email: agentEmail,
      displayName: "Stage Three Agent",
      organizationId,
    });

    const created = await createDraftSigningWithActor(
      agent,
      { title: `Stage 3 Draft ${stamp}`, sourcePacketId: packetId },
      admin,
    );
    createdSigningIds.push(created.id);
    ok("created Draft Signing");

    if (
      (await countRows(admin, "signing_document_versions", created.id)) !== 0 ||
      (await countRows(admin, "signing_package_revisions", created.id)) !== 0
    ) {
      fail("Create Signing unexpectedly created versions or revisions");
    }
    ok("Create Signing created no versions/revisions");

    const docA = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: created.id, sourcePacketFormId: packetFormA },
      admin,
    );
    const docB = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: created.id, sourcePacketFormId: packetFormB },
      admin,
    );
    const docC = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: created.id, sourcePacketFormId: packetFormC },
      admin,
    );
    if (
      (await countRows(admin, "signing_document_versions", created.id)) !== 0 ||
      (await countRows(admin, "signing_package_revisions", created.id)) !== 0
    ) {
      fail("Adding Draft documents created versions/revisions");
    }
    ok("Draft document add creates no versions/revisions");

    await reorderDraftSigningDocumentsWithActor(
      agent,
      {
        signingId: created.id,
        orderedDocumentIds: [docB.id, docA.id, docC.id],
      },
      admin,
    );
    ok("Draft document reorder succeeded without versions/revisions");

    const participant = await addDraftSigningParticipantWithActor(
      agent,
      {
        signingId: created.id,
        fullName: "Pat Participant",
        email: `pat-${stamp}@example.com`,
        optionalRole: "Buyer",
      },
      admin,
    );
    if ((await countRows(admin, "signing_document_versions", created.id)) !== 0) {
      fail("Adding participant created document versions");
    }
    ok("Draft participant add creates no versions");

    const signatureField = await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId: created.id,
        signingDocumentId: docA.id,
        signingParticipantId: participant.id,
        fieldType: "SIGNATURE",
        pageNumber: 1,
        x: 72,
        y: 720,
        width: 160,
        height: 40,
      },
      admin,
    );
    await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId: created.id,
        signingDocumentId: docA.id,
        signingParticipantId: participant.id,
        fieldType: "DATE_SIGNED",
        pageNumber: 1,
        x: 250,
        y: 720,
        width: 100,
        height: 24,
        linkedSignatureDraftFieldId: signatureField.id,
      },
      admin,
    );
    if (
      (await countRows(admin, "signing_document_versions", created.id)) !== 0 ||
      (await countRows(admin, "signing_package_revisions", created.id)) !== 0 ||
      (await countRows(admin, "signing_fields", created.id)) !== 0
    ) {
      fail("Draft field prep created versions/revisions/evidence fields");
    }
    ok("Draft signer-field prep creates no versions/revisions/evidence fields");

    // Internal promotion to Revision 1.
    const promoted1 = await promotePackageRevisionFromDraftWithActor(
      agent,
      { signingId: created.id, promotionReason: "INITIAL" },
      admin,
    );
    if (promoted1.revisionNumber !== 1) {
      fail(`expected revision 1, got ${promoted1.revisionNumber}`);
    }
    ok("internal promotion created Package Revision 1");

    const { data: versionsAfter1, error: versionsError } = await admin
      .from("signing_document_versions")
      .select("*")
      .eq("signing_id", created.id);
    if (versionsError) fail(versionsError.message);
    for (const version of versionsAfter1 ?? []) {
      if (version.storage_object_key) {
        storageKeysToRemove.push(version.storage_object_key as string);
      }
      const integrity = await verifyPreparedDocumentVersionIntegrity(
        admin,
        version.id,
      );
      if (!integrity.trusted) {
        fail(`version ${version.id} failed integrity after promotion`);
      }
    }
    ok("Revision 1 prepared versions verify by SHA-256");

    // Unchanged re-promotion should reuse versions.
    const promoted2 = await promotePackageRevisionFromDraftWithActor(
      agent,
      {
        signingId: created.id,
        promotionReason: "AMENDMENT",
        amendmentNote: "No document content change",
      },
      admin,
    );
    if (promoted2.revisionNumber !== 2) fail("expected revision 2");
    if (promoted2.createdVersionIds.length !== 0) {
      fail("unchanged amendment unexpectedly created versions");
    }
    if (promoted2.reusedVersionIds.length < 1) {
      fail("unchanged amendment did not reuse versions");
    }
    ok("unchanged documents reused across Revision 2");

    // Changed-document: mutate Contract PDF bytes, then promote Amendment.
    const { data: contractForm, error: contractFormError } = await admin
      .from("packet_forms")
      .select("storage_path")
      .eq("id", packetFormA)
      .single();
    if (contractFormError || !contractForm?.storage_path) {
      fail(contractFormError?.message ?? "missing contract storage path");
    }
    const changedPdf = await makeFixturePdf(`Stage3 Contract CHANGED ${stamp}`);
    const { error: overwriteError } = await admin.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .upload(contractForm.storage_path as string, changedPdf, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (overwriteError) fail(`contract overwrite failed: ${overwriteError.message}`);

    // Stage 4 promotes from the selected Draft source snapshot, so overwriting
    // live bytes is drift rather than a content change: the agent must accept it
    // explicitly before it can reach a revision. Update to Latest captures the
    // new bytes into a new snapshot, which is what makes this a changed document.
    await updateDraftSourceToLatestWithActor(
      agent,
      { signingId: created.id, signingDocumentId: docA.id },
      admin,
    );

    const promotedChanged = await promotePackageRevisionFromDraftWithActor(
      agent,
      {
        signingId: created.id,
        promotionReason: "AMENDMENT",
        amendmentNote: "Contract content changed",
      },
      admin,
    );
    if (promotedChanged.revisionNumber !== 3) {
      fail(`expected revision 3 after change, got ${promotedChanged.revisionNumber}`);
    }
    if (promotedChanged.createdVersionIds.length !== 1) {
      fail(
        `expected exactly one new version for changed contract, got ${promotedChanged.createdVersionIds.length}`,
      );
    }
    if (promotedChanged.reusedVersionIds.length < 1) {
      fail("unchanged Financing/HOA versions were not reused after contract change");
    }
    for (const versionId of promotedChanged.createdVersionIds) {
      const { data: version } = await admin
        .from("signing_document_versions")
        .select("storage_object_key")
        .eq("id", versionId)
        .single();
      if (version?.storage_object_key) {
        storageKeysToRemove.push(version.storage_object_key as string);
      }
    }
    ok("changed document produced new version; unchanged documents reused");

    // Soft-exclude HOA (docC) after versions exist; promote without it.
    await removeDraftSigningDocumentWithActor(
      agent,
      { signingId: created.id, signingDocumentId: docC.id },
      admin,
    );
    const { data: excludedRow } = await admin
      .from("signing_documents")
      .select("included_in_draft")
      .eq("id", docC.id)
      .single();
    if (excludedRow?.included_in_draft !== false) {
      fail("remove after versions should soft-exclude, not hard-delete");
    }

    // Re-add signature field on remaining docs if needed (docC fields cleared).
    const { count: remainingFields } = await admin
      .from("signing_draft_fields")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", created.id);
    if ((remainingFields ?? 0) === 0) {
      await upsertDraftSigningFieldWithActor(
        agent,
        {
          signingId: created.id,
          signingDocumentId: docA.id,
          signingParticipantId: participant.id,
          fieldType: "SIGNATURE",
          pageNumber: 1,
          x: 72,
          y: 720,
          width: 160,
          height: 40,
        },
        admin,
      );
    }

    const promotedRemoved = await promotePackageRevisionFromDraftWithActor(
      agent,
      {
        signingId: created.id,
        promotionReason: "AMENDMENT",
        amendmentNote: "Removed HOA addendum",
      },
      admin,
    );
    const { count: rev1Docs } = await admin
      .from("signing_package_revision_documents")
      .select("id", { count: "exact", head: true })
      .eq("package_revision_id", promoted1.packageRevisionId);
    const { count: revRemovedDocs } = await admin
      .from("signing_package_revision_documents")
      .select("id", { count: "exact", head: true })
      .eq("package_revision_id", promotedRemoved.packageRevisionId);
    if (rev1Docs !== 3 || revRemovedDocs !== 2) {
      fail(
        `remove-document revisions unexpected (rev1=${rev1Docs}, later=${revRemovedDocs})`,
      );
    }
    const { data: stillExists } = await admin
      .from("signing_package_revision_documents")
      .select("id")
      .eq("package_revision_id", promoted1.packageRevisionId)
      .eq("signing_document_id", docC.id)
      .maybeSingle();
    if (!stillExists) {
      fail("Revision 1 lost historically removed document composition");
    }
    ok("removed document absent from later revision but retained historically");

    // Fresh remove-before-first-promotion case.
    const created3 = await createDraftSigningWithActor(
      agent,
      { title: `Stage 3 Pre-Promote Remove ${stamp}`, sourcePacketId: packetId },
      admin,
    );
    createdSigningIds.push(created3.id);
    const e1 = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: created3.id, sourcePacketFormId: packetFormA },
      admin,
    );
    await addDraftSigningDocumentWithActor(
      agent,
      { signingId: created3.id, sourcePacketFormId: packetFormB },
      admin,
    );
    const e3 = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: created3.id, sourcePacketFormId: packetFormC },
      admin,
    );
    await removeDraftSigningDocumentWithActor(
      agent,
      { signingId: created3.id, signingDocumentId: e3.id },
      admin,
    );
    const p3 = await addDraftSigningParticipantWithActor(
      agent,
      {
        signingId: created3.id,
        fullName: "Riley Recipient",
        email: `riley-${stamp}@example.com`,
      },
      admin,
    );
    await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId: created3.id,
        signingDocumentId: e1.id,
        signingParticipantId: p3.id,
        fieldType: "INITIALS",
        pageNumber: 1,
        x: 90,
        y: 680,
        width: 80,
        height: 30,
      },
      admin,
    );
    const revPre = await promotePackageRevisionFromDraftWithActor(
      agent,
      { signingId: created3.id, promotionReason: "INITIAL" },
      admin,
    );
    const { count: preDocs } = await admin
      .from("signing_package_revision_documents")
      .select("id", { count: "exact", head: true })
      .eq("package_revision_id", revPre.packageRevisionId);
    if (preDocs !== 2) fail(`expected 2 docs after pre-promote remove, got ${preDocs}`);
    const { data: preVersions } = await admin
      .from("signing_document_versions")
      .select("storage_object_key")
      .eq("signing_id", created3.id);
    for (const version of preVersions ?? []) {
      if (version.storage_object_key) {
        storageKeysToRemove.push(version.storage_object_key as string);
      }
    }
    ok("pre-activation document removal works; promotion freezes remaining docs");

    // Integrity mismatch fail-closed: tamper storage object for a version.
    const victim = (versionsAfter1 ?? [])[0];
    if (victim?.storage_object_key && victim?.id) {
      const expected = victim.content_sha256 as string;
      await admin.storage.from(SIGNING_ARTIFACTS_BUCKET).upload(
        victim.storage_object_key as string,
        new TextEncoder().encode("tampered-bytes"),
        { contentType: "application/pdf", upsert: true },
      );
      const mismatch = await verifyPreparedDocumentVersionIntegrity(
        admin,
        victim.id,
      );
      if (mismatch.trusted || mismatch.expectedSha256 !== expected) {
        fail("integrity mismatch did not preserve expected hash / fail closed");
      }
      ok("integrity mismatch preserves expected hash and is untrusted");

      // Re-prepare must not reuse the corrupted object; it creates a new version.
      const repaired = await ensurePreparedDocumentVersion({
        actor: agent,
        admin,
        signingId: created.id,
        signingDocumentId: victim.signing_document_id as string,
        creationReason: "REPREPARE",
      });
      if (repaired.reused || repaired.version.id === victim.id) {
        fail("corrupted version was incorrectly reused");
      }
      if (repaired.version.storage_object_key) {
        storageKeysToRemove.push(repaired.version.storage_object_key);
      }
      ok("corrupted prior version is not reused; new version created");
    }

    // Cross-Signing denial of draft ops.
    const other = await createDraftSigningWithActor(
      agent,
      { title: `Stage 3 Other ${stamp}` },
      admin,
    );
    createdSigningIds.push(other.id);
    await expectSigningError(
      "cross-signing document add using foreign signing id semantics",
      "NOT_FOUND",
      () =>
        addDraftSigningDocumentWithActor(
          {
            ...agent,
            userId: randomUUID(),
            memberships: [
              {
                organizationId: randomUUID(),
                membershipRole: "MEMBER",
                membershipStatus: "ACTIVE",
                organizationStatus: "ACTIVE",
              },
            ],
          },
          { signingId: created.id, sourcePacketFormId: packetFormA },
          admin,
        ),
    );

    // Browser deny for Stage 1 + Stage 3 draft table.
    const { data: browserSession, error: signInError } =
      await browser.auth.signInWithPassword({
        email: agentEmail,
        password,
      });
    if (signInError || !browserSession.user) {
      fail(`browser sign-in failed: ${signInError?.message}`);
    }
    for (const table of [
      ...NATIVE_SIGNING_STAGE1_TABLES.slice(0, 3),
      ...NATIVE_SIGNING_STAGE3_DRAFT_TABLES,
    ]) {
      const { error: selectError } = await browser.from(table).select("id").limit(1);
      if (!selectError) fail(`authenticated SELECT ${table} unexpectedly succeeded`);
      ok(`authenticated SELECT ${table} rejected`);
    }

    const probeKey = storageKeysToRemove[0];
    if (probeKey) {
      const { error: downloadError } = await browser.storage
        .from(SIGNING_ARTIFACTS_BUCKET)
        .download(probeKey);
      if (!downloadError) {
        fail("authenticated storage download unexpectedly succeeded");
      }
      ok("authenticated signing-artifacts download rejected");
    }

    ok("Stage 3 Native Signing development checks passed");
  } finally {
    if (previousGate === undefined) {
      delete process.env.NATIVE_SIGNING_ENABLED;
    } else {
      process.env.NATIVE_SIGNING_ENABLED = previousGate;
    }

    // Stage 4 captures a Draft source snapshot per included document, so Stage 3
    // fixtures now own snapshot rows and Storage objects too.
    for (const id of createdSigningIds) {
      const { data: snapshots } = await admin
        .from("signing_draft_source_snapshots")
        .select("source_pdf_object_key")
        .eq("signing_id", id);
      for (const row of snapshots ?? []) {
        const key = row.source_pdf_object_key as string;
        if (key && !storageKeysToRemove.includes(key)) {
          storageKeysToRemove.push(key);
        }
      }
    }

    if (storageKeysToRemove.length > 0) {
      await admin.storage
        .from(SIGNING_ARTIFACTS_BUCKET)
        .remove(storageKeysToRemove);
    }
    if (generatedPathsToRemove.length > 0) {
      await admin.storage
        .from(GENERATED_DOCUMENTS_BUCKET)
        .remove(generatedPathsToRemove);
    }

    for (const id of createdSigningIds) {
      await admin.from("signing_events").delete().eq("signing_id", id);
      await admin.from("signing_fields").delete().eq("signing_id", id);
      await admin
        .from("signing_package_revision_documents")
        .delete()
        .eq("signing_id", id);
      await admin
        .from("signing_package_revision_participants")
        .delete()
        .eq("signing_id", id);
      await admin
        .from("signings")
        .update({
          current_package_revision_id: null,
          frozen_package_revision_id: null,
        })
        .eq("id", id);
      await admin
        .from("signing_document_versions")
        .update({ introduced_by_package_revision_id: null })
        .eq("signing_id", id);
      await admin.from("signing_document_versions").delete().eq("signing_id", id);
      await admin.from("signing_package_revisions").delete().eq("signing_id", id);
      await admin.from("signing_draft_fields").delete().eq("signing_id", id);
      // The selection pointer is a RESTRICT FK: clear it before snapshot rows.
      await admin
        .from("signing_documents")
        .update({
          selected_draft_source_snapshot_id: null,
          acknowledged_live_content_fingerprint: null,
        })
        .eq("signing_id", id);
      await admin
        .from("signing_draft_source_snapshots")
        .delete()
        .eq("signing_id", id);
      await admin.from("signing_documents").delete().eq("signing_id", id);
      await admin.from("signing_participants").delete().eq("signing_id", id);
      await admin
        .from("signings")
        .update({ current_primary_agent_association_id: null })
        .eq("id", id);
      await admin.from("signing_agent_associations").delete().eq("signing_id", id);
      await admin.from("signings").delete().eq("id", id);
    }

    for (const formId of [packetFormA, packetFormB, packetFormC]) {
      if (formId) {
        await admin.from("packet_forms").update({ status: "DELETED" }).eq("id", formId);
      }
    }
    if (packetId) {
      await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    }
    if (agentUserId) {
      await admin.from("organization_members").delete().eq("user_id", agentUserId);
      await admin.from("profiles").delete().eq("id", agentUserId);
      await admin.auth.admin.deleteUser(agentUserId);
    }
    if (organizationId) {
      await admin.from("organizations").delete().eq("id", organizationId);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
