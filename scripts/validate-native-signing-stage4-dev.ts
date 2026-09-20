/**
 * Development-only R12 Stage 4 Native Signing validator.
 *
 * Proves that Draft source snapshots are captured on add, that live Packet Form
 * edits surface as drift instead of silently changing preparation state, that
 * Keep Current and Update to Latest behave as specified, and that activation
 * promotes Revision 1 from snapshots, issues hash-only credentials, moves
 * Draft -> In Progress exactly once per client request, and keeps email
 * delivery failures from undoing activation.
 *
 * It also proves the Stage 4 review fixes: credential wrapping requires a
 * dedicated key with a named version and survives rotation, wrapped bearers are
 * bound to their own row by AAD, corrupted snapshot bytes fail closed instead of
 * being promoted, and opening a `/sign` link exchanges the bearer for a
 * short-lived HttpOnly entry session.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { activateSigningWithActor } from "../lib/signing/activation.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import {
  addDraftSigningDocumentWithActor,
  removeDraftSigningDocumentWithActor,
} from "../lib/signing/draft-documents.ts";
import type { SigningDocumentRow } from "../lib/signing/draft-documents.ts";
import { addDraftSigningParticipantWithActor } from "../lib/signing/draft-participants.ts";
import { upsertDraftSigningFieldWithActor } from "../lib/signing/draft-fields.ts";
import {
  buildCredentialWrapKeyring,
  issueParticipantCredentialsForActivation,
  loadRawParticipantCredentialToken,
  resolveCredentialWrapKeyring,
  SigningCredentialWrapConfigError,
  unwrapParticipantCredentialTokenWithKeyring,
  validateParticipantCredential,
  WRAP_KEY_ENV,
  WRAP_KEY_ID_ENV,
} from "../lib/signing/credentials.ts";
import {
  buildSigningEntryCookieAttributes,
  createSigningEntrySession,
  hashSigningEntrySessionToken,
  revokeSigningEntrySessionsForCredential,
  SIGNING_ENTRY_COOKIE_NAME,
  validateSigningEntrySession,
} from "../lib/signing/entry-sessions.ts";
import { evaluateSigningReadiness } from "../lib/signing/readiness.ts";
import {
  getDocumentSourceStatus,
  keepCurrentDraftSourceWithActor,
  updateDraftSourceToLatestWithActor,
} from "../lib/signing/source-drift.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { NativeSigningDisabledError } from "../lib/signing/feature-gate.ts";
import {
  NATIVE_SIGNING_STAGE4_TABLES,
  SIGNING_ARTIFACTS_BUCKET,
} from "../lib/signing/stage1-schema.ts";
import { GENERATED_DOCUMENTS_BUCKET } from "../lib/packet-form-storage.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

class ValidationFailure extends Error {}

/** Throws rather than exiting so fixture cleanup always runs. */
function fail(message: string): never {
  throw new ValidationFailure(message);
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
    last_name: "Four",
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

  // Credential wrapping requires a dedicated key. Fail before touching the
  // database so a misconfigured environment is obvious rather than surfacing
  // later as an activation error.
  let wrapKeyring: ReturnType<typeof resolveCredentialWrapKeyring>;
  try {
    wrapKeyring = resolveCredentialWrapKeyring();
  } catch (error) {
    if (error instanceof SigningCredentialWrapConfigError) {
      fail(
        `${error.message} Add ${WRAP_KEY_ID_ENV} (for example "v1") and ${WRAP_KEY_ENV} (32 random bytes, base64url) to .env.local.`,
      );
    }
    throw error;
  }
  const currentWrapKeyId = wrapKeyring.currentKeyId;
  const currentWrapKeyMaterial = requireEnv(WRAP_KEY_ENV);
  ok(`credential wrap key configured (version "${currentWrapKeyId}")`);

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const browser = createClient(url, anonKey);

  const previousGate = process.env.NATIVE_SIGNING_ENABLED;
  process.env.NATIVE_SIGNING_ENABLED = "true";
  // Activation must survive an unconfigured mail provider.
  const previousResendKey = process.env.RESEND_API_KEY;
  const previousEmailSandbox = process.env.SIGNING_EMAIL_SANDBOX;
  delete process.env.RESEND_API_KEY;
  delete process.env.SIGNING_EMAIL_SANDBOX;

  const stamp = Date.now();
  const password = `Stage4-${randomUUID()}!aA1`;
  const agentEmail = `stage4-agent-${stamp}@example.com`;
  let agentUserId = "";
  let organizationId = "";
  let packetId = 0;
  let packetFormA = 0;
  let packetFormB = 0;
  const createdSigningIds: string[] = [];
  const storageKeysToRemove: string[] = [];
  const generatedPathsToRemove: string[] = [];

  async function loadDocumentRow(documentId: string) {
    const { data, error } = await admin
      .from("signing_documents")
      .select("*")
      .eq("id", documentId)
      .single();
    if (error || !data) fail(error?.message ?? "document row missing");
    return data as unknown as SigningDocumentRow;
  }

  try {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: `Stage 4 Org ${stamp}`, status: "ACTIVE" })
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
      display_name: "Stage Four Agent",
      first_name: "Stage",
      last_name: "Four",
      primary_organization_id: organizationId,
      must_change_password: false,
    });
    if (profileError) fail(profileError.message);

    const { error: memberError } = await admin
      .from("organization_members")
      .insert({
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
        label: `Stage 4 packet ${stamp}`,
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
      const storagePath = `users/${agentUserId}/packets/${packetId}/${formId}-stage4-${stamp}.pdf`;
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

    packetFormA = await createFixturePacketForm(`Stage4 Contract ${stamp}`, 1);
    packetFormB = await createFixturePacketForm(`Stage4 Addendum ${stamp}`, 2);
    ok("created disposable Stage 4 packet forms");

    const agent = buildActor({
      userId: agentUserId,
      email: agentEmail,
      displayName: "Stage Four Agent",
      organizationId,
    });

    const signing = await createDraftSigningWithActor(
      agent,
      { title: `Stage 4 Draft ${stamp}`, sourcePacketId: packetId },
      admin,
    );
    createdSigningIds.push(signing.id);

    // 1. Adding a document captures and selects a Draft source snapshot.
    const docA = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: signing.id, sourcePacketFormId: packetFormA },
      admin,
    );
    if (!docA.selected_draft_source_snapshot_id) {
      fail("adding a document did not capture and select a Draft snapshot");
    }
    if (
      (await countRows(admin, "signing_document_versions", signing.id)) !== 0 ||
      (await countRows(admin, "signing_package_revisions", signing.id)) !== 0
    ) {
      fail("Draft snapshot capture created versions or revisions");
    }
    const { data: snapshotRows } = await admin
      .from("signing_draft_source_snapshots")
      .select("*")
      .eq("signing_id", signing.id);
    for (const row of snapshotRows ?? []) {
      storageKeysToRemove.push(row.source_pdf_object_key as string);
    }
    if ((snapshotRows ?? []).length !== 1) {
      fail(`expected exactly 1 snapshot, got ${(snapshotRows ?? []).length}`);
    }
    ok("adding a document captures a snapshot without versions/revisions");

    const docB = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: signing.id, sourcePacketFormId: packetFormB },
      admin,
    );

    // Status is CURRENT while live content matches the snapshot.
    const statusInitial = await getDocumentSourceStatus(
      admin,
      await loadDocumentRow(docA.id),
      agent.userId,
    );
    if (statusInitial.status !== "CURRENT") {
      fail(`expected CURRENT immediately after capture, got ${statusInitial.status}`);
    }
    ok("freshly captured document reports CURRENT");

    // 2. A live Packet Form change is drift, not a silent snapshot update.
    const { data: liveForm } = await admin
      .from("packet_forms")
      .select("storage_path")
      .eq("id", packetFormA)
      .single();
    const changedPdf = await makeFixturePdf(`Stage4 Contract CHANGED ${stamp}`);
    const { error: overwriteError } = await admin.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .upload(liveForm?.storage_path as string, changedPdf, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (overwriteError) fail(`live overwrite failed: ${overwriteError.message}`);

    const driftedRow = await loadDocumentRow(docA.id);
    if (driftedRow.selected_draft_source_snapshot_id !== docA.selected_draft_source_snapshot_id) {
      fail("live Packet Form change silently changed the selected snapshot");
    }
    const statusChanged = await getDocumentSourceStatus(
      admin,
      driftedRow,
      agent.userId,
    );
    if (statusChanged.status !== "SOURCE_CHANGED") {
      fail(`expected SOURCE_CHANGED after live edit, got ${statusChanged.status}`);
    }
    ok("live Packet Form change surfaces as SOURCE_CHANGED without touching the snapshot");

    const notReady = await evaluateSigningReadiness(admin, signing.id, agent);
    if (notReady.ready) fail("drifted Draft reported ready");
    if (!notReady.blockers.some((b) => b.code === "DOCUMENT_SOURCE_CHANGED")) {
      fail("readiness did not report the drift blocker");
    }
    ok("readiness reports drift and is not ready");

    await expectSigningError(
      "activation while a document source is changed",
      "SOURCE_CHANGED",
      () =>
        activateSigningWithActor(
          agent,
          {
            signingId: signing.id,
            mode: "REMOTE_SEND",
            clientRequestId: randomUUID(),
          },
          admin,
        ),
    );
    if ((await countRows(admin, "signing_package_revisions", signing.id)) !== 0) {
      fail("failed activation left a package revision behind");
    }

    // 3. Keep Current acknowledges the live fingerprint and keeps the snapshot.
    const kept = await keepCurrentDraftSourceWithActor(
      agent,
      { signingId: signing.id, signingDocumentId: docA.id },
      admin,
    );
    if (kept.status !== "CURRENT" || kept.reason !== "ACKNOWLEDGED_LIVE_CHANGE") {
      fail(`Keep Current did not restore CURRENT (${kept.status}/${kept.reason})`);
    }
    const keptRow = await loadDocumentRow(docA.id);
    if (keptRow.selected_draft_source_snapshot_id !== docA.selected_draft_source_snapshot_id) {
      fail("Keep Current changed the selected snapshot");
    }
    ok("Keep Current acknowledges the live change and keeps the snapshot");

    // A further live edit re-raises drift: the acknowledgement was fingerprint-scoped.
    const changedAgain = await makeFixturePdf(`Stage4 Contract AGAIN ${stamp}`);
    await admin.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .upload(liveForm?.storage_path as string, changedAgain, {
        contentType: "application/pdf",
        upsert: true,
      });
    const statusAfterSecondEdit = await getDocumentSourceStatus(
      admin,
      await loadDocumentRow(docA.id),
      agent.userId,
    );
    if (statusAfterSecondEdit.status !== "SOURCE_CHANGED") {
      fail("Keep Current incorrectly suppressed a later live change");
    }
    ok("a later live change re-raises drift after Keep Current");

    // 4. Update to Latest captures a NEW snapshot and creates no evidence.
    const updated = await updateDraftSourceToLatestWithActor(
      agent,
      { signingId: signing.id, signingDocumentId: docA.id },
      admin,
    );
    if (updated.status !== "CURRENT") {
      fail(`Update to Latest did not produce CURRENT (${updated.status})`);
    }
    const updatedRow = await loadDocumentRow(docA.id);
    if (
      updatedRow.selected_draft_source_snapshot_id ===
      docA.selected_draft_source_snapshot_id
    ) {
      fail("Update to Latest did not select a new snapshot");
    }
    if (updatedRow.acknowledged_live_content_fingerprint !== null) {
      fail("Update to Latest left a stale Keep Current acknowledgement");
    }
    const { data: snapshotsAfterUpdate } = await admin
      .from("signing_draft_source_snapshots")
      .select("*")
      .eq("signing_id", signing.id)
      .eq("signing_document_id", docA.id);
    for (const row of snapshotsAfterUpdate ?? []) {
      const key = row.source_pdf_object_key as string;
      if (!storageKeysToRemove.includes(key)) storageKeysToRemove.push(key);
    }
    if ((snapshotsAfterUpdate ?? []).length !== 2) {
      fail(
        `expected 2 snapshot rows after Update to Latest, got ${(snapshotsAfterUpdate ?? []).length}`,
      );
    }
    if (
      (await countRows(admin, "signing_document_versions", signing.id)) !== 0 ||
      (await countRows(admin, "signing_package_revisions", signing.id)) !== 0
    ) {
      fail("Update to Latest created versions or revisions");
    }
    ok("Update to Latest creates a new snapshot with no versions/revisions");

    // Removing a document that has no evidence yet discards its preparation
    // state entirely, so a later add is a genuinely new logical document.
    await removeDraftSigningDocumentWithActor(
      agent,
      { signingId: signing.id, signingDocumentId: docB.id },
      admin,
    );
    if (
      (await countRows(admin, "signing_draft_source_snapshots", signing.id)) !== 2
    ) {
      fail("removing an evidence-free document did not discard its snapshots");
    }
    const readded = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: signing.id, sourcePacketFormId: packetFormB },
      admin,
    );
    if (!readded.selected_draft_source_snapshot_id) {
      fail("re-adding a removed document did not capture a snapshot");
    }
    ok("removing an evidence-free document discards its Draft snapshots");

    // Re-including a soft-excluded document preserves its selected snapshot:
    // inclusion must never silently refresh preparation state.
    const { error: excludeError } = await admin
      .from("signing_documents")
      .update({ included_in_draft: false })
      .eq("id", readded.id);
    if (excludeError) fail(excludeError.message);
    const reincluded = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: signing.id, sourcePacketFormId: packetFormB },
      admin,
    );
    if (reincluded.id !== readded.id) {
      fail("re-include created a new logical document instead of restoring one");
    }
    if (
      reincluded.selected_draft_source_snapshot_id !==
      readded.selected_draft_source_snapshot_id
    ) {
      fail("re-include silently refreshed the Draft source snapshot");
    }
    ok("re-include preserves the previously selected snapshot");

    // 5. Readiness blockers then a ready Draft.
    const participant = await addDraftSigningParticipantWithActor(
      agent,
      {
        signingId: signing.id,
        fullName: "Pat Participant",
        email: `pat-${stamp}@example.com`,
        optionalRole: "Buyer",
      },
      admin,
    );
    const beforeFields = await evaluateSigningReadiness(admin, signing.id, agent);
    if (beforeFields.ready) fail("Draft without signer fields reported ready");
    if (
      !beforeFields.blockers.some(
        (b) => b.code === "PARTICIPANT_MISSING_SIGNATURE_OR_INITIALS",
      )
    ) {
      fail("readiness did not require a Signature/Initials field");
    }

    const signatureField = await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId: signing.id,
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
        signingId: signing.id,
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

    const ready = await evaluateSigningReadiness(admin, signing.id, agent);
    if (!ready.ready) {
      fail(`expected ready Draft, blockers: ${JSON.stringify(ready.blockers)}`);
    }
    const { data: stillDraft } = await admin
      .from("signings")
      .select("lifecycle_state")
      .eq("id", signing.id)
      .single();
    if (stillDraft?.lifecycle_state !== "DRAFT") {
      fail("derived readiness wrote a lifecycle state");
    }
    ok("readiness is derived and writes no lifecycle state");

    // Credentials must not work while the Signing is still Draft.
    const draftCredentials = await issueParticipantCredentialsForActivation({
      admin,
      signingId: signing.id,
      participantIds: [participant.id],
      issuedByUserId: agentUserId,
    });
    const draftToken = draftCredentials.get(participant.id)?.rawToken as string;
    if (await validateParticipantCredential(admin, draftToken)) {
      fail("a credential validated while the Signing was still Draft");
    }
    ok("credentials are unusable while the Signing is Draft");

    // 6. Activation: REMOTE_SEND.
    const clientRequestId = randomUUID();
    const activated = await activateSigningWithActor(
      agent,
      { signingId: signing.id, mode: "REMOTE_SEND", clientRequestId },
      admin,
    );
    if (activated.revisionNumber !== 1) {
      fail(`expected Revision 1, got ${activated.revisionNumber}`);
    }
    if (activated.lifecycleState !== "IN_PROGRESS") {
      fail("activation did not report In Progress");
    }
    const { data: activatedSigning } = await admin
      .from("signings")
      .select("lifecycle_state, activation_mode, activated_at, activated_by_user_id")
      .eq("id", signing.id)
      .single();
    if (
      activatedSigning?.lifecycle_state !== "IN_PROGRESS" ||
      activatedSigning?.activation_mode !== "REMOTE_SEND" ||
      !activatedSigning?.activated_at ||
      activatedSigning?.activated_by_user_id !== agentUserId
    ) {
      fail("activation metadata was not recorded correctly");
    }
    const { data: activatedVersions } = await admin
      .from("signing_document_versions")
      .select("storage_object_key")
      .eq("signing_id", signing.id);
    for (const version of activatedVersions ?? []) {
      if (version.storage_object_key) {
        storageKeysToRemove.push(version.storage_object_key as string);
      }
    }
    ok("REMOTE_SEND activation promoted Revision 1 and moved Draft -> In Progress");

    const { data: credentialRows } = await admin
      .from("signing_participant_credentials")
      .select("*")
      .eq("signing_id", signing.id)
      .eq("is_current", true)
      .is("revoked_at", null);
    if ((credentialRows ?? []).length !== 1) {
      fail(
        `expected exactly one current credential, got ${(credentialRows ?? []).length}`,
      );
    }
    for (const row of credentialRows ?? []) {
      if (!/^[0-9a-f]{64}$/.test(row.token_hash as string)) {
        fail("credential token_hash is not a SHA-256 hex digest");
      }
      if (Object.keys(row).some((column) => /raw|plain|secret/i.test(column))) {
        fail("credential row exposes a raw token column");
      }
    }
    ok("activation issued exactly one hash-only current credential per participant");

    // 6a. Wrapping uses the dedicated key version, and rotation is real.
    const remoteCredential = (credentialRows ?? [])[0] as Record<
      string,
      unknown
    >;
    if (remoteCredential.wrap_key_id !== currentWrapKeyId) {
      fail(
        `credential did not record the current wrap key version (${String(
          remoteCredential.wrap_key_id,
        )} !== ${currentWrapKeyId})`,
      );
    }
    if (typeof remoteCredential.token_wrapped !== "string") {
      fail("credential did not persist a wrapped bearer for invitation retry");
    }
    ok("credential persists wrap_key_id alongside its wrapped bearer");

    const remoteRawToken = await loadRawParticipantCredentialToken({
      admin,
      signingId: signing.id,
      credentialId: remoteCredential.id as string,
    });
    if (!remoteRawToken) {
      fail("invitation retry could not unwrap the current credential");
    }
    const resolvedCredential = await validateParticipantCredential(
      admin,
      remoteRawToken,
    );
    if (resolvedCredential?.credentialId !== remoteCredential.id) {
      fail("unwrapped bearer did not resolve back to its own credential");
    }
    ok("invitation retry recovers the same link through server-only unwrap");

    const wrapContext = {
      credentialId: remoteCredential.id as string,
      signingId: signing.id,
      signingParticipantId: remoteCredential.signing_participant_id as string,
    };
    const wrappedBearer = remoteCredential.token_wrapped as string;

    // A rotated keyring keeps the previous version for decrypt only.
    const rotatedKeyring = buildCredentialWrapKeyring({
      currentKeyId: "vnext",
      currentKeyMaterial: randomUUID() + randomUUID(),
      previousKeys: [
        { keyId: currentWrapKeyId, keyMaterial: currentWrapKeyMaterial },
      ],
    });
    if (
      unwrapParticipantCredentialTokenWithKeyring({
        keyring: rotatedKeyring,
        wrapped: wrappedBearer,
        wrapKeyId: currentWrapKeyId,
        context: wrapContext,
      }) !== remoteRawToken
    ) {
      fail("a rotated keyring could not decrypt with the previous key version");
    }
    // Dropping the previous version fails closed rather than guessing.
    const currentOnlyKeyring = buildCredentialWrapKeyring({
      currentKeyId: "vnext",
      currentKeyMaterial: randomUUID() + randomUUID(),
    });
    if (
      unwrapParticipantCredentialTokenWithKeyring({
        keyring: currentOnlyKeyring,
        wrapped: wrappedBearer,
        wrapKeyId: currentWrapKeyId,
        context: wrapContext,
      }) !== null
    ) {
      fail("unwrap succeeded for a key version that is no longer configured");
    }
    ok("wrap key rotation decrypts with previous versions and fails closed without them");

    // 6b. AAD binds ciphertext to one row: replaying it elsewhere fails closed.
    const { error: tamperKeyIdError } = await admin
      .from("signing_participant_credentials")
      .update({ wrap_key_id: "vtamper" })
      .eq("id", remoteCredential.id as string);
    if (tamperKeyIdError) fail(tamperKeyIdError.message);
    if (
      await loadRawParticipantCredentialToken({
        admin,
        signingId: signing.id,
        credentialId: remoteCredential.id as string,
      })
    ) {
      fail("unwrap succeeded after the recorded wrap key version was altered");
    }
    const { error: restoreKeyIdError } = await admin
      .from("signing_participant_credentials")
      .update({ wrap_key_id: currentWrapKeyId })
      .eq("id", remoteCredential.id as string);
    if (restoreKeyIdError) fail(restoreKeyIdError.message);
    ok("altering the recorded wrap key version fails closed");

    const { data: instructions } = await admin
      .from("signing_delivery_instructions")
      .select("*")
      .eq("signing_id", signing.id);
    const { data: workItems } = await admin
      .from("signing_work_items")
      .select("*")
      .eq("signing_id", signing.id);
    const { data: attempts } = await admin
      .from("signing_delivery_attempts")
      .select("*")
      .eq("signing_id", signing.id);
    if ((instructions ?? []).length !== 1 || (workItems ?? []).length !== 1) {
      fail("REMOTE_SEND did not enqueue exactly one invitation instruction/work item");
    }
    for (const item of workItems ?? []) {
      const reference = JSON.stringify(item.reference_json);
      if (reference.includes(draftToken) || /token"\s*:/.test(reference)) {
        fail("work item reference_json contains a raw token");
      }
    }
    if ((attempts ?? []).length !== 1 || attempts?.[0]?.outcome !== "FAILED") {
      fail("unconfigured mail provider did not record a FAILED delivery attempt");
    }
    const { data: stillInProgress } = await admin
      .from("signings")
      .select("lifecycle_state")
      .eq("id", signing.id)
      .single();
    if (stillInProgress?.lifecycle_state !== "IN_PROGRESS") {
      fail("email failure rolled back activation");
    }
    ok("email failure records a FAILED attempt without undoing activation");

    // 7. Idempotent replay.
    const replayed = await activateSigningWithActor(
      agent,
      { signingId: signing.id, mode: "REMOTE_SEND", clientRequestId },
      admin,
    );
    if (!replayed.replayed || replayed.packageRevisionId !== activated.packageRevisionId) {
      fail("replaying the same client request id did not return the prior result");
    }
    if ((await countRows(admin, "signing_package_revisions", signing.id)) !== 1) {
      fail("replay created a second package revision");
    }
    ok("replaying the same client request id is idempotent");

    await expectSigningError(
      "activating an already In Progress Signing with a new request id",
      "CONFLICT",
      () =>
        activateSigningWithActor(
          agent,
          {
            signingId: signing.id,
            mode: "REMOTE_SEND",
            clientRequestId: randomUUID(),
          },
          admin,
        ),
    );

    // 8. IN_PERSON activation skips invitation delivery.
    const inPerson = await createDraftSigningWithActor(
      agent,
      { title: `Stage 4 In Person ${stamp}`, sourcePacketId: packetId },
      admin,
    );
    createdSigningIds.push(inPerson.id);
    const inPersonDoc = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: inPerson.id, sourcePacketFormId: packetFormB },
      admin,
    );
    const { data: inPersonSnapshots } = await admin
      .from("signing_draft_source_snapshots")
      .select("source_pdf_object_key")
      .eq("signing_id", inPerson.id);
    for (const row of inPersonSnapshots ?? []) {
      storageKeysToRemove.push(row.source_pdf_object_key as string);
    }
    const inPersonParticipant = await addDraftSigningParticipantWithActor(
      agent,
      {
        signingId: inPerson.id,
        fullName: "Riley Recipient",
        email: `riley-${stamp}@example.com`,
      },
      admin,
    );
    await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId: inPerson.id,
        signingDocumentId: inPersonDoc.id,
        signingParticipantId: inPersonParticipant.id,
        fieldType: "INITIALS",
        pageNumber: 1,
        x: 90,
        y: 680,
        width: 80,
        height: 30,
      },
      admin,
    );
    const inPersonResult = await activateSigningWithActor(
      agent,
      {
        signingId: inPerson.id,
        mode: "IN_PERSON",
        clientRequestId: randomUUID(),
      },
      admin,
    );
    if (inPersonResult.invitationsEnqueued !== 0) {
      fail("IN_PERSON activation enqueued invitation email");
    }
    if (
      (await countRows(admin, "signing_delivery_instructions", inPerson.id)) !== 0 ||
      (await countRows(admin, "signing_work_items", inPerson.id)) !== 0
    ) {
      fail("IN_PERSON activation created delivery instructions or work items");
    }
    if (inPersonResult.credentialCount !== 1) {
      fail("IN_PERSON activation did not issue participant credentials");
    }
    const { data: inPersonVersions } = await admin
      .from("signing_document_versions")
      .select("storage_object_key")
      .eq("signing_id", inPerson.id);
    for (const version of inPersonVersions ?? []) {
      if (version.storage_object_key) {
        storageKeysToRemove.push(version.storage_object_key as string);
      }
    }
    ok("IN_PERSON activation issues credentials and skips invitation email");

    // 8a. A wrapped bearer copied onto a different credential row fails closed:
    // the AAD binds ciphertext to its own credential, Signing, and participant.
    const { data: inPersonCredential } = await admin
      .from("signing_participant_credentials")
      .select("id, token_wrapped")
      .eq("signing_id", inPerson.id)
      .eq("is_current", true)
      .is("revoked_at", null)
      .single();
    if (!inPersonCredential) fail("no current in-person credential");
    const inPersonWrapped = inPersonCredential.token_wrapped as string;

    const { error: crossRowError } = await admin
      .from("signing_participant_credentials")
      .update({ token_wrapped: wrappedBearer })
      .eq("id", inPersonCredential.id as string);
    if (crossRowError) fail(crossRowError.message);
    if (
      await loadRawParticipantCredentialToken({
        admin,
        signingId: inPerson.id,
        credentialId: inPersonCredential.id as string,
      })
    ) {
      fail("a wrapped bearer replayed onto another credential row unwrapped");
    }
    const { error: crossRowRestoreError } = await admin
      .from("signing_participant_credentials")
      .update({ token_wrapped: inPersonWrapped })
      .eq("id", inPersonCredential.id as string);
    if (crossRowRestoreError) fail(crossRowRestoreError.message);
    ok("a wrapped bearer replayed onto another credential row fails closed");

    // 9. Activated credentials resolve; a Draft-era credential does not.
    const { data: currentCredential } = await admin
      .from("signing_participant_credentials")
      .select("id")
      .eq("signing_id", signing.id)
      .eq("is_current", true)
      .is("revoked_at", null)
      .maybeSingle();
    if (!currentCredential) fail("no current credential after activation");
    if (await validateParticipantCredential(admin, draftToken)) {
      fail("superseded Draft-era credential still validates");
    }
    ok("superseded credentials do not validate");

    // 9a. Opening a /sign link exchanges the bearer for an entry session.
    // Exercised at the function level: the route handler is a thin wrapper that
    // validates the credential, creates this session, and sets this cookie.
    const entryCredential = await validateParticipantCredential(
      admin,
      remoteRawToken,
    );
    if (!entryCredential) fail("current credential no longer validates");
    const entrySession = await createSigningEntrySession({
      admin,
      credential: entryCredential,
    });
    const entryCookie = buildSigningEntryCookieAttributes({
      rawSessionToken: entrySession.rawSessionToken,
    });
    if (
      entryCookie.name !== SIGNING_ENTRY_COOKIE_NAME ||
      entryCookie.httpOnly !== true ||
      entryCookie.secure !== true ||
      entryCookie.sameSite !== "lax" ||
      entryCookie.path !== "/sign"
    ) {
      fail("entry cookie is not HttpOnly/Secure/SameSite=Lax scoped to /sign");
    }

    const { data: sessionRow } = await admin
      .from("signing_entry_sessions")
      .select("*")
      .eq("id", entrySession.sessionId)
      .single();
    if (!sessionRow) fail("entry session row was not created");
    if (
      sessionRow.session_token_hash !==
      hashSigningEntrySessionToken(entrySession.rawSessionToken)
    ) {
      fail("entry session row does not store the session token hash");
    }
    if (JSON.stringify(sessionRow).includes(entrySession.rawSessionToken)) {
      fail("entry session row exposes the raw session token");
    }
    if (JSON.stringify(sessionRow).includes(remoteRawToken)) {
      fail("entry session row exposes the credential bearer");
    }

    const validatedSession = await validateSigningEntrySession(
      admin,
      entrySession.rawSessionToken,
    );
    if (
      validatedSession?.signingParticipantId !==
        entryCredential.signingParticipantId ||
      validatedSession.credentialId !== entryCredential.credentialId
    ) {
      fail("entry session did not resolve back to its participant");
    }
    if (await validateSigningEntrySession(admin, "not-a-session-token")) {
      fail("a malformed session token validated");
    }
    ok("/sign entry exchange mints a hash-only, cookie-scoped entry session");

    // An expired session is refused (backdated row: the raw token is unchanged).
    const expiredSessionToken = entrySession.rawSessionToken.replace(
      /.$/,
      (last) => (last === "A" ? "B" : "A"),
    );
    const { data: expiredRow, error: expiredInsertError } = await admin
      .from("signing_entry_sessions")
      .insert({
        signing_id: entryCredential.signingId,
        signing_participant_id: entryCredential.signingParticipantId,
        signing_participant_credential_id: entryCredential.credentialId,
        session_token_hash: hashSigningEntrySessionToken(expiredSessionToken),
        create_date: new Date(Date.now() - 7_200_000).toISOString(),
        expires_at: new Date(Date.now() - 3_600_000).toISOString(),
      })
      .select("id")
      .single();
    if (expiredInsertError || !expiredRow) {
      fail(expiredInsertError?.message ?? "failed to create expired session");
    }
    if (await validateSigningEntrySession(admin, expiredSessionToken)) {
      fail("an expired entry session validated");
    }
    ok("expired entry sessions are refused");

    // Revoking sessions for a credential invalidates them immediately.
    await revokeSigningEntrySessionsForCredential({
      admin,
      signingId: entryCredential.signingId,
      credentialId: entryCredential.credentialId,
      reason: "VALIDATOR_REVOKE",
    });
    if (await validateSigningEntrySession(admin, entrySession.rawSessionToken)) {
      fail("a revoked entry session still validated");
    }
    ok("revoking a credential's entry sessions invalidates them");

    // 9b. Corrupted snapshot bytes must never reach a package revision.
    const corrupted = await createDraftSigningWithActor(
      agent,
      { title: `Stage 4 Corrupt ${stamp}`, sourcePacketId: packetId },
      admin,
    );
    createdSigningIds.push(corrupted.id);
    const corruptedDoc = await addDraftSigningDocumentWithActor(
      agent,
      { signingId: corrupted.id, sourcePacketFormId: packetFormA },
      admin,
    );
    const corruptedParticipant = await addDraftSigningParticipantWithActor(
      agent,
      {
        signingId: corrupted.id,
        fullName: "Casey Corrupt",
        email: `casey-${stamp}@example.com`,
      },
      admin,
    );
    await upsertDraftSigningFieldWithActor(
      agent,
      {
        signingId: corrupted.id,
        signingDocumentId: corruptedDoc.id,
        signingParticipantId: corruptedParticipant.id,
        fieldType: "SIGNATURE",
        pageNumber: 1,
        x: 72,
        y: 640,
        width: 160,
        height: 40,
      },
      admin,
    );
    const { data: corruptedSnapshot } = await admin
      .from("signing_draft_source_snapshots")
      .select("id, source_pdf_object_key")
      .eq("signing_id", corrupted.id)
      .single();
    if (!corruptedSnapshot) fail("corruption fixture captured no snapshot");
    const corruptedKey = corruptedSnapshot.source_pdf_object_key as string;
    storageKeysToRemove.push(corruptedKey);

    const readyBeforeCorruption = await evaluateSigningReadiness(
      admin,
      corrupted.id,
      agent,
    );
    if (!readyBeforeCorruption.ready) {
      fail(
        `corruption fixture was not ready: ${JSON.stringify(
          readyBeforeCorruption.blockers,
        )}`,
      );
    }

    // Replace the stored snapshot bytes without touching the recorded hash.
    const { error: corruptUploadError } = await admin.storage
      .from(SIGNING_ARTIFACTS_BUCKET)
      .upload(corruptedKey, await makeFixturePdf(`Corrupted ${stamp}`), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (corruptUploadError) {
      fail(`snapshot corruption upload failed: ${corruptUploadError.message}`);
    }

    await expectSigningError(
      "activation with corrupted Draft snapshot bytes",
      "INTEGRITY_MISMATCH",
      () =>
        activateSigningWithActor(
          agent,
          {
            signingId: corrupted.id,
            mode: "REMOTE_SEND",
            clientRequestId: randomUUID(),
          },
          admin,
        ),
    );
    if (
      (await countRows(admin, "signing_package_revisions", corrupted.id)) !== 0
    ) {
      fail("corrupted snapshot activation left a package revision behind");
    }
    const { data: corruptedSigningRow } = await admin
      .from("signings")
      .select("lifecycle_state")
      .eq("id", corrupted.id)
      .single();
    if (corruptedSigningRow?.lifecycle_state !== "DRAFT") {
      fail("corrupted snapshot activation advanced the lifecycle");
    }
    if (
      (await countRows(admin, "signing_participant_credentials", corrupted.id)) >
      0
    ) {
      const { data: leftover } = await admin
        .from("signing_participant_credentials")
        .select("is_current")
        .eq("signing_id", corrupted.id)
        .eq("is_current", true);
      if ((leftover ?? []).length > 0) {
        fail("corrupted snapshot activation left a usable credential");
      }
    }
    ok("corrupted Draft snapshot bytes fail closed and never promote");

    // 10. Browser deny-by-default for every Stage 4 table.
    const { data: browserSession, error: signInError } =
      await browser.auth.signInWithPassword({ email: agentEmail, password });
    if (signInError || !browserSession.user) {
      fail(`browser sign-in failed: ${signInError?.message}`);
    }
    for (const table of NATIVE_SIGNING_STAGE4_TABLES) {
      const { error: selectError } = await browser
        .from(table)
        .select("id")
        .limit(1);
      if (!selectError) fail(`authenticated SELECT ${table} unexpectedly succeeded`);
      ok(`authenticated SELECT ${table} rejected`);
    }

    const probeKey = storageKeysToRemove[0];
    if (probeKey) {
      const { error: downloadError } = await browser.storage
        .from(SIGNING_ARTIFACTS_BUCKET)
        .download(probeKey);
      if (!downloadError) {
        fail("authenticated signing-artifacts download unexpectedly succeeded");
      }
      ok("authenticated signing-artifacts download rejected");
    }

    ok("Stage 4 Native Signing development checks passed");
  } finally {
    if (previousGate === undefined) {
      delete process.env.NATIVE_SIGNING_ENABLED;
    } else {
      process.env.NATIVE_SIGNING_ENABLED = previousGate;
    }
    if (previousResendKey !== undefined) {
      process.env.RESEND_API_KEY = previousResendKey;
    }
    if (previousEmailSandbox !== undefined) {
      process.env.SIGNING_EMAIL_SANDBOX = previousEmailSandbox;
    }

    for (const id of createdSigningIds) {
      const { data: leftoverSnapshots } = await admin
        .from("signing_draft_source_snapshots")
        .select("source_pdf_object_key")
        .eq("signing_id", id);
      for (const row of leftoverSnapshots ?? []) {
        const key = row.source_pdf_object_key as string;
        if (!storageKeysToRemove.includes(key)) storageKeysToRemove.push(key);
      }
      const { data: leftoverVersions } = await admin
        .from("signing_document_versions")
        .select("storage_object_key")
        .eq("signing_id", id);
      for (const row of leftoverVersions ?? []) {
        const key = row.storage_object_key as string | null;
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
      await admin.from("signing_delivery_attempts").delete().eq("signing_id", id);
      await admin
        .from("signing_delivery_instructions")
        .delete()
        .eq("signing_id", id);
      await admin.from("signing_work_items").delete().eq("signing_id", id);
      // Entry sessions reference credentials with ON DELETE RESTRICT.
      await admin.from("signing_entry_sessions").delete().eq("signing_id", id);
      await admin
        .from("signing_participant_credentials")
        .update({ replaced_by_credential_id: null })
        .eq("signing_id", id);
      await admin
        .from("signing_participant_credentials")
        .delete()
        .eq("signing_id", id);
      await admin
        .from("signing_operation_idempotency")
        .delete()
        .eq("signing_id", id);
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

    for (const formId of [packetFormA, packetFormB]) {
      if (formId) {
        await admin
          .from("packet_forms")
          .update({ status: "DELETED" })
          .eq("id", formId);
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
  if (error instanceof ValidationFailure) {
    console.error(`FAIL: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
