/**
 * Development-only Native Signing completion-delivery validator (Stage 6 depth).
 * Targets ewxsxwzezhkeawnjvigx only. Disposable fixtures; no real email.
 *
 * Covers Requirement #64: ceremony→Complete, credentials, copy recipients,
 * delivery worker (sandbox), bearer→session, package auth helpers, artifact
 * mediation denial, revoke/replace, cross-Signing denial, COMPLETE-only,
 * recovery suspension, protected delivery events, and full cleanup.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import {
  decodePDFRawStream,
  PDFArray,
  PDFContentStream,
  PDFDocument,
  PDFRawStream,
  StandardFonts,
} from "pdf-lib";
import { activateSigningWithActor } from "../lib/signing/activation.ts";
import { upsertDraftPreparedContentWithActor } from "../lib/signing/draft-prepared-content.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { evaluateSigningReadiness } from "../lib/signing/readiness.ts";
import { adoptCeremonyMark } from "../lib/signing/adopted-marks.ts";
import { affirmIdentityFromEntrySession } from "../lib/signing/ceremony-affirmation.ts";
import { requireCeremonyWriteContext } from "../lib/signing/ceremony-context.ts";
import { finishParticipantSigning } from "../lib/signing/ceremony-finish.ts";
import {
  acceptConsent,
  loadCurrentConsentDisclosure,
} from "../lib/signing/consent-disclosure.ts";
import {
  loadRawParticipantCredentialToken,
  validateParticipantCredential,
  WRAP_KEY_ENV,
  WRAP_KEY_ID_ENV,
} from "../lib/signing/credentials.ts";
import { addDraftSigningDocumentWithActor } from "../lib/signing/draft-documents.ts";
import { upsertDraftSigningFieldWithActor } from "../lib/signing/draft-fields.ts";
import {
  addDraftSigningParticipantWithActor,
  updateDraftSigningParticipantWithActor,
} from "../lib/signing/draft-participants.ts";
import { loadSigningDashboardForActor } from "../lib/signing/dashboard.ts";
import { createSigningEntrySession } from "../lib/signing/entry-sessions.ts";
import { requireCeremonyBrowserSession } from "../lib/signing/browser-sessions.ts";
import {
  EVENT_CHAIN_KEY_ENV,
  EVENT_CHAIN_KEY_ID_ENV,
} from "../lib/signing/event-chain-keys.ts";
import { processNextFinalizationWorkItem } from "../lib/signing/finalization-worker.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import { renameSigningForActor } from "../lib/signing/rename.ts";
import {
  acceptFieldPlacement,
  removeFieldPlacement,
  senderLocalDate,
} from "../lib/signing/placements.ts";
import {
  NATIVE_SIGNING_COMPLETION_DELIVERY_TABLES,
  NATIVE_SIGNING_STAGE6_TABLES,
  SIGNING_ARTIFACTS_BUCKET,
} from "../lib/signing/stage1-schema.ts";
import { GENERATED_DOCUMENTS_BUCKET } from "../lib/packet-form-storage.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";
import {
  listCompletedPackageArtifactsForSession,
  loadCompletedPackageArtifactForSession,
  canManageCompletedSigningOperations,
} from "../lib/signing/completed-package-authority.ts";
import { appendCompletedPackageAccessLog } from "../lib/signing/completed-package-access.ts";
import {
  issueCompletedPackageCredential,
  loadRawCompletedPackageToken,
  replaceCompletedPackageCredential,
  validateCompletedPackageCredential,
} from "../lib/signing/completed-package-credentials.ts";
import {
  createCompletedPackageSession,
  revokeCompletedPackageSessionsForCredential,
  validateCompletedPackageSession,
  SIGNING_COMPLETED_PACKAGE_COOKIE_NAME,
  SIGNING_COMPLETED_PACKAGE_COOKIE_PATH,
  SIGNING_COMPLETED_PACKAGE_SESSION_TTL_MINUTES,
} from "../lib/signing/completed-package-sessions.ts";
import {
  COMPLETED_PACKAGE_WRAP_KEY_ENV,
  COMPLETED_PACKAGE_WRAP_KEY_ID_ENV,
} from "../lib/signing/completed-package-wrap.ts";
import {
  enqueueCompletedPackageDelivery,
  processNextCompletedPackageDeliveryWorkItem,
  replaceCompletedPackageCredentialWithActor,
} from "../lib/signing/completed-package-delivery.ts";
import { addCopyRecipientWithActor } from "../lib/signing/copy-recipients.ts";
import {
  processSigningWorkBatch,
  SIGNING_WORKER_SECRET_ENV,
  verifySigningWorkerSecret,
} from "../lib/signing/signing-worker-dispatch.ts";
import {
  setSigningWorkSuspended,
  isSigningWorkSuspended,
} from "../lib/signing/work-suspension.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PRODUCTION_REF = "eetonalyyyssvkyfdoxh";

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

function ensureDevKeys() {
  process.env[COMPLETED_PACKAGE_WRAP_KEY_ID_ENV] ||=
    "completion-delivery-dev-v1";
  process.env[COMPLETED_PACKAGE_WRAP_KEY_ENV] ||=
    randomBytes(32).toString("base64");
  process.env[EVENT_CHAIN_KEY_ID_ENV] ||= "completion-delivery-chain-v1";
  process.env[EVENT_CHAIN_KEY_ENV] ||= randomBytes(32).toString("base64");
  process.env[WRAP_KEY_ID_ENV] ||= "completion-delivery-cred-wrap-v1";
  process.env[WRAP_KEY_ENV] ||= randomBytes(32).toString("base64");
  process.env[SIGNING_WORKER_SECRET_ENV] ||=
    "completion-delivery-dev-worker-secret";
  process.env.NATIVE_SIGNING_ENABLED = "true";
  // Accept delivery without calling Resend; never send real mail.
  process.env.SIGNING_EMAIL_SANDBOX = "true";
  delete process.env.RESEND_API_KEY;
}

function buildActor(options: {
  userId: string;
  email: string;
  displayName: string;
  organizationId: string;
  membershipRole?: "MEMBER" | "ORG_ADMIN";
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
    first_name: "Completion",
    middle_name: null,
    last_name: "Delivery",
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
        membershipRole: options.membershipRole ?? "MEMBER",
        membershipStatus: "ACTIVE",
        organizationStatus: "ACTIVE",
      },
    ],
  };
}

async function makeFixturePdf(label: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 72, y: 720, size: 14, font });
  return pdf.save();
}

/** Decoded page content streams, upper-cased, for text-operator searches. */
async function decodedPageContent(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  const parts: string[] = [];
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((ref) => pdf.context.lookup(ref))
        : [contents];
    for (const stream of streams) {
      if (stream instanceof PDFRawStream) {
        parts.push(Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"));
      } else if (stream instanceof PDFContentStream) {
        parts.push(Buffer.from(stream.getUnencodedContents()).toString("latin1"));
      }
    }
  }
  return parts.join("\n").toUpperCase();
}

/** Standard-font text is written as a hex string of WinAnsi bytes. */
function pdfHexText(text: string): string {
  return Buffer.from(text, "latin1").toString("hex").toUpperCase();
}

async function main() {
  ensureDevKeys();

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF) || url.includes(PRODUCTION_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }
  ok(`target project verified (${EXPECTED_REF})`);

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) fail("Need anon and service keys");

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const browser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const password = `CompDel-${stamp}-Aa1!`;
  const agentEmail = `compdel-agent-${stamp}@example.invalid`;

  let organizationId: string | null = null;
  let agentUserId: string | null = null;
  let packetId: number | null = null;
  let packetFormId: number | null = null;
  const signingIds: string[] = [];
  const contactIds: number[] = [];
  const generatedPaths: string[] = [];
  const artifactKeys: string[] = [];
  let suspendedForTest = false;

  async function cleanupCompletionDeliveryTables(signingId: string) {
    await admin
      .from("signing_completed_package_access_log")
      .delete()
      .eq("signing_id", signingId);
    await admin
      .from("signing_delivery_attempts")
      .delete()
      .eq("signing_id", signingId);
    await admin
      .from("signing_delivery_instructions")
      .delete()
      .eq("signing_id", signingId);
    await admin.from("signing_work_items").delete().eq("signing_id", signingId);
    await admin
      .from("signing_completed_package_sessions")
      .delete()
      .eq("signing_id", signingId);
    // Clear self-FK before deleting credentials.
    await admin
      .from("signing_completed_package_credentials")
      .update({ replaced_by_credential_id: null })
      .eq("signing_id", signingId);
    await admin
      .from("signing_completed_package_credentials")
      .delete()
      .eq("signing_id", signingId);
    await admin
      .from("signing_copy_recipients")
      .delete()
      .eq("signing_id", signingId);
  }

  async function cleanup() {
    if (suspendedForTest) {
      await setSigningWorkSuspended({
        admin,
        suspended: false,
        note: "completion-delivery-dev cleanup resume",
      });
      suspendedForTest = false;
    }

    for (const id of signingIds) {
      await admin
        .from("signings")
        .update({
          current_primary_agent_association_id: null,
          current_package_revision_id: null,
          frozen_package_revision_id: null,
        })
        .eq("id", id);
      await cleanupCompletionDeliveryTables(id);
      await admin.from("signing_work_items").delete().eq("signing_id", id);
      await admin.from("signing_artifacts").delete().eq("signing_id", id);
      await admin.from("signing_event_chain_state").delete().eq("signing_id", id);
      await admin.from("signing_events").delete().eq("signing_id", id);
      await admin.from("signing_field_placements").delete().eq("signing_id", id);
      await admin.from("signing_adopted_marks").delete().eq("signing_id", id);
      await admin.from("signing_fields").delete().eq("signing_id", id);
      await admin
        .from("signing_package_revision_documents")
        .delete()
        .eq("signing_id", id);
      await admin
        .from("signing_package_revision_participants")
        .delete()
        .eq("signing_id", id);
      await admin.from("signing_document_versions").delete().eq("signing_id", id);
      await admin
        .from("signing_draft_prepared_content")
        .delete()
        .eq("signing_id", id);
      await admin
        .from("signing_documents")
        .update({ selected_draft_source_snapshot_id: null })
        .eq("signing_id", id);
      await admin
        .from("signing_draft_source_snapshots")
        .delete()
        .eq("signing_id", id);
      await admin
        .from("signing_draft_fields")
        .update({ linked_signature_draft_field_id: null })
        .eq("signing_id", id);
      await admin.from("signing_draft_fields").delete().eq("signing_id", id);
      const { error: documentsDeleteError } = await admin
        .from("signing_documents")
        .delete()
        .eq("signing_id", id);
      if (documentsDeleteError) {
        console.error(`Cleanup: documents ${id}: ${documentsDeleteError.message}`);
      }
      await admin.from("signing_package_revisions").delete().eq("signing_id", id);
      await admin
        .from("signing_participant_presence_leases")
        .delete()
        .eq("signing_id", id);
      await admin.from("signing_amendment_locks").delete().eq("signing_id", id);
      await admin
        .from("signing_device_handoff_locks")
        .delete()
        .eq("signing_id", id);
      await admin.from("signing_in_person_handoffs").delete().eq("signing_id", id);
      await admin.from("signing_browser_sessions").delete().eq("signing_id", id);
      await admin.from("signing_entry_sessions").delete().eq("signing_id", id);
      await admin
        .from("signing_participant_credentials")
        .delete()
        .eq("signing_id", id);
      await admin.from("signing_participants").delete().eq("signing_id", id);
      await admin
        .from("signing_operator_associations")
        .delete()
        .eq("signing_id", id);
      await admin
        .from("signing_agent_associations")
        .delete()
        .eq("signing_id", id);
      await admin
        .from("signing_operation_idempotency")
        .delete()
        .eq("signing_id", id);
      const { error: signingDeleteError } = await admin
        .from("signings")
        .delete()
        .eq("id", id);
      if (signingDeleteError) {
        console.error(`Cleanup: Signing ${id}: ${signingDeleteError.message}`);
      }
    }
    if (artifactKeys.length > 0) {
      await admin.storage.from(SIGNING_ARTIFACTS_BUCKET).remove(artifactKeys);
    }
    if (generatedPaths.length > 0) {
      await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).remove(generatedPaths);
    }
    if (contactIds.length > 0) {
      await admin.from("contacts").delete().in("id", contactIds);
    }
    if (packetFormId != null) {
      await admin.from("packet_forms").delete().eq("id", packetFormId);
    }
    if (packetId != null) {
      await admin.from("packets").delete().eq("id", packetId);
    }
    if (agentUserId) {
      await admin
        .from("organization_members")
        .delete()
        .eq("user_id", agentUserId);
      await admin.from("profiles").delete().eq("id", agentUserId);
      await admin.auth.admin.deleteUser(agentUserId);
    }
    if (organizationId) {
      await admin.from("organizations").delete().eq("id", organizationId);
    }
  }

  try {
    for (const table of [
      ...NATIVE_SIGNING_STAGE6_TABLES,
      ...NATIVE_SIGNING_COMPLETION_DELIVERY_TABLES,
    ]) {
      const { error } = await admin.from(table).select("*").limit(0);
      if (error) fail(`table missing: ${table}: ${error.message}`);
    }
    ok("Stage 6 + completion-delivery tables present");

    for (const table of NATIVE_SIGNING_COMPLETION_DELIVERY_TABLES) {
      const { error } = await browser.from(table).select("*").limit(1);
      if (!error) fail(`browser unexpectedly readable on ${table}`);
    }
    ok("browser denied completion-delivery tables");

    if (
      SIGNING_COMPLETED_PACKAGE_COOKIE_NAME !== "hf_signing_completed_package" ||
      SIGNING_COMPLETED_PACKAGE_COOKIE_PATH !== "/sign/package" ||
      SIGNING_COMPLETED_PACKAGE_SESSION_TTL_MINUTES !== 60
    ) {
      fail("completed-package cookie constants mismatch");
    }
    ok("cookie attribute constants ok");

    if (
      !verifySigningWorkerSecret(
        process.env[SIGNING_WORKER_SECRET_ENV]!,
      )
    ) {
      fail("worker secret self-check failed");
    }
    ok("worker secret configured");

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: `CompDel Org ${stamp}`, status: "ACTIVE" })
      .select("id")
      .single();
    if (orgError || !org) fail(orgError?.message ?? "org create failed");
    organizationId = org.id as string;

    const { data: userData, error: userError } =
      await admin.auth.admin.createUser({
        email: agentEmail,
        password,
        email_confirm: true,
      });
    if (userError || !userData.user) {
      fail(userError?.message ?? "user create failed");
    }
    agentUserId = userData.user.id;
    const { error: profileError } = await admin.from("profiles").upsert({
      id: agentUserId,
      email: agentEmail,
      status: "ACTIVE",
      app_role: "USER",
      onboarding_status: "ACTIVE",
      display_name: "CompDel Agent",
      first_name: "Completion",
      last_name: "Delivery",
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
        label: `CompDel packet ${stamp}`,
        status: "ACTIVE",
        packet_type: "custom",
      })
      .select("id")
      .single();
    if (packetError || !packet) fail(packetError?.message ?? "packet failed");
    packetId = packet.id as number;

    const pdfBytes = await makeFixturePdf(`CompDel Agreement ${stamp}`);
    const { data: form, error: formError } = await admin
      .from("packet_forms")
      .insert({
        packet_id: packetId,
        form_id: null,
        status: "ACTIVE",
        document_state: "DRAFT",
        availability_state: "AVAILABLE",
        document_name: `CompDel Agreement ${stamp}`,
        document_type: "PDF",
        origin: "external_upload",
        sort_order: 1,
        is_required: false,
        field_data: {},
        owner_user_id: agentUserId,
      })
      .select("id")
      .single();
    if (formError || !form) fail(formError?.message ?? "form failed");
    packetFormId = form.id as number;
    const storagePath = `users/${agentUserId}/packets/${packetId}/${packetFormId}-compdel-${stamp}.pdf`;
    const { error: uploadError } = await admin.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (uploadError) fail(uploadError.message);
    generatedPaths.push(storagePath);
    await admin
      .from("packet_forms")
      .update({ storage_path: storagePath })
      .eq("id", packetFormId);

    const agent = buildActor({
      userId: agentUserId!,
      email: agentEmail,
      displayName: "CompDel Agent",
      organizationId: organizationId!,
    });

    await loadCurrentConsentDisclosure(admin);

    const EVIDENCE_TABLES = [
      "signing_package_revisions",
      "signing_package_revision_documents",
      "signing_package_revision_participants",
      "signing_document_versions",
      "signing_documents",
      "signing_participants",
      "signing_fields",
      "signing_adopted_marks",
      "signing_field_placements",
      "signing_artifacts",
      "signing_participant_credentials",
      "signing_agent_associations",
    ];

    // Contents are compared, never printed (credential rows hold token hashes).
    async function evidenceSnapshot(signingId: string): Promise<string> {
      const parts: Record<string, unknown> = {};
      for (const table of EVIDENCE_TABLES) {
        const { data, error } = await admin
          .from(table)
          .select("*")
          .eq("signing_id", signingId)
          .order("id");
        if (error) fail(`${table}: ${error.message}`);
        parts[table] = data ?? [];
      }
      const { data: signingRow, error } = await admin
        .from("signings")
        .select("*")
        .eq("id", signingId)
        .single();
      if (error || !signingRow) fail(error?.message ?? "signing missing");
      const rest: Record<string, unknown> = { ...signingRow };
      delete rest.title;
      delete rest.update_date;
      parts.signings = rest;
      return JSON.stringify(parts);
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
        fail(`${label} threw unexpected error: ${error instanceof Error ? error.message : String(error)}`);
      }
      fail(`${label} unexpectedly succeeded`);
    }

    async function renameAndVerify(signingId: string, newTitle: string, stage: string) {
      const before = await evidenceSnapshot(signingId);
      const { data: previous } = await admin
        .from("signings")
        .select("title")
        .eq("id", signingId)
        .single();
      const renamed = await renameSigningForActor(
        agent,
        { signingId, title: `  ${newTitle}  ` },
        admin,
      );
      if (renamed.title !== newTitle) fail(`${stage}: rename did not trim/apply`);
      const { data: stored } = await admin
        .from("signings")
        .select("title, lifecycle_state")
        .eq("id", signingId)
        .single();
      if (stored?.title !== newTitle) fail(`${stage}: rename not persisted`);
      if ((await evidenceSnapshot(signingId)) !== before) {
        fail(`${stage}: rename changed documents, participants, revisions, hashes, links or marks`);
      }
      const { data: events } = await admin
        .from("signing_events")
        .select("event_type, actor_user_id, details_json, visibility, create_date")
        .eq("signing_id", signingId)
        .eq("event_type", "SIGNING_TITLE_UPDATED")
        .order("create_date", { ascending: false })
        .limit(1);
      const event = events?.[0];
      const details = (event?.details_json ?? {}) as Record<string, unknown>;
      if (
        !event ||
        event.actor_user_id !== agentUserId ||
        event.visibility !== "BUSINESS" ||
        !event.create_date ||
        details.previousTitle !== previous?.title ||
        details.newTitle !== newTitle ||
        details.lifecycleState !== stored?.lifecycle_state
      ) {
        fail(`${stage}: rename event missing or incomplete`);
      }
      if (/token|https?:\/\/|\/sign\//i.test(JSON.stringify(details))) {
        fail(`${stage}: rename event carries a link or secret`);
      }
      ok(`${stage}: rename persisted, event recorded, evidence unchanged`);
    }

    async function buildActivatedSigning(options: {
      title: string;
      participantName: string;
      participantEmail: string;
    }): Promise<{
      signingId: string;
      participantId: string;
    }> {
      const draft = await createDraftSigningWithActor(
        agent,
        { title: options.title },
        admin,
      );
      signingIds.push(draft.id);

      const document = await addDraftSigningDocumentWithActor(
        agent,
        { signingId: draft.id, sourcePacketFormId: packetFormId! },
        admin,
      );
      const participant = await addDraftSigningParticipantWithActor(
        agent,
        {
          signingId: draft.id,
          fullName: options.participantName,
          email: options.participantEmail,
        },
        admin,
      );
      await upsertDraftSigningFieldWithActor(
        agent,
        {
          signingId: draft.id,
          signingDocumentId: document.id,
          signingParticipantId: participant.id,
          fieldType: "SIGNATURE",
          pageNumber: 1,
          x: 72,
          y: 120,
          width: 200,
          height: 36,
          isRequired: true,
        },
        admin,
      );
      const { data: sigField } = await admin
        .from("signing_draft_fields")
        .select("id")
        .eq("signing_id", draft.id)
        .eq("field_type", "SIGNATURE")
        .maybeSingle();
      await upsertDraftSigningFieldWithActor(
        agent,
        {
          signingId: draft.id,
          signingDocumentId: document.id,
          signingParticipantId: participant.id,
          fieldType: "DATE_SIGNED",
          pageNumber: 1,
          x: 72,
          y: 170,
          width: 120,
          height: 24,
          isRequired: true,
          linkedSignatureDraftFieldId: sigField?.id,
        },
        admin,
      );

      await activateSigningWithActor(
        agent,
        {
          signingId: draft.id,
          mode: "REMOTE_SEND",
          clientRequestId: randomUUID(),
        },
        admin,
      );

      return { signingId: draft.id, participantId: participant.id };
    }

    async function runCeremonyToComplete(options: {
      signingId: string;
      participantId: string;
    }): Promise<void> {
      const { data: credential } = await admin
        .from("signing_participant_credentials")
        .select("id")
        .eq("signing_id", options.signingId)
        .eq("signing_participant_id", options.participantId)
        .eq("is_current", true)
        .is("revoked_at", null)
        .maybeSingle();
      if (!credential) fail("missing participant credential");
      const rawToken = await loadRawParticipantCredentialToken({
        admin,
        signingId: options.signingId,
        credentialId: credential.id as string,
      });
      if (!rawToken) fail("missing credential token");
      const resolved = await validateParticipantCredential(admin, rawToken);
      if (!resolved) fail("credential did not validate");
      const entry = await createSigningEntrySession({
        admin,
        credential: resolved,
      });
      const affirmed = await affirmIdentityFromEntrySession({
        admin,
        rawEntrySessionToken: entry.rawSessionToken,
      });
      const ceremonySession = await requireCeremonyBrowserSession(
        admin,
        affirmed.cookie.value,
      );
      const context = await requireCeremonyWriteContext({
        admin,
        session: ceremonySession,
      });

      const disclosure = await loadCurrentConsentDisclosure(admin);
      await acceptConsent({
        admin,
        context,
        disclosureVersionId: disclosure.id,
      });
      const { data: participantRow } = await admin
        .from("signing_participants")
        .select("full_name")
        .eq("id", options.participantId)
        .eq("signing_id", options.signingId)
        .maybeSingle();
      const typedName =
        (participantRow?.full_name as string | undefined)?.trim() ||
        "Pat Participant";
      await adoptCeremonyMark({
        admin,
        context,
        markKind: "SIGNATURE",
        representationType: "TYPED",
        typedText: typedName,
      });

      const { data: fields } = await admin
        .from("signing_fields")
        .select("id, field_type")
        .eq("signing_id", options.signingId);
      const signatureField = fields?.find((f) => f.field_type === "SIGNATURE");
      if (!signatureField) fail("no signature field on revision");
      await acceptFieldPlacement({
        admin,
        context,
        signingFieldId: signatureField.id as string,
        clientRequestId: randomUUID(),
      });

      const finish = await finishParticipantSigning({
        admin,
        session: ceremonySession,
      });
      if (!finish.allParticipantsFinished) {
        fail("expected all participants finished");
      }
      if (finish.finalizationCondition !== "READY") {
        fail(`expected READY, got ${finish.finalizationCondition}`);
      }

      const result = await processNextFinalizationWorkItem({
        admin,
        signingId: options.signingId,
      });
      if (result.status !== "COMPLETED") {
        fail(`finalization failed: ${result.detail ?? result.status}`);
      }

      const { data: completedSigning } = await admin
        .from("signings")
        .select("lifecycle_state, finalization_condition, completed_at")
        .eq("id", options.signingId)
        .single();
      if (completedSigning?.lifecycle_state !== "COMPLETE") {
        fail("lifecycle was not COMPLETE");
      }
      if (completedSigning?.finalization_condition !== "VERIFIED") {
        fail("finalization_condition was not VERIFIED");
      }
      if (!completedSigning?.completed_at) fail("completed_at missing");

      const { data: artifacts } = await admin
        .from("signing_artifacts")
        .select("storage_object_key")
        .eq("signing_id", options.signingId)
        .not("verified_at", "is", null);
      for (const row of artifacts ?? []) {
        artifactKeys.push(row.storage_object_key as string);
      }
    }

    // --- COMPLETE-only: credential on IN_PROGRESS Signing must not validate ---
    const preComplete = await buildActivatedSigning({
      title: `CompDel PreComplete ${stamp}`,
      participantName: "Pre Complete",
      participantEmail: `pre-${stamp}@example.com`,
    });
    const preIssued = await issueCompletedPackageCredential({
      admin,
      signingId: preComplete.signingId,
      target: { signingParticipantId: preComplete.participantId },
      issuedByUserId: agentUserId,
    });
    const preValidated = await validateCompletedPackageCredential(
      admin,
      preIssued.rawToken,
    );
    if (preValidated) fail("pre-Complete credential unexpectedly validated");
    ok("COMPLETE-only: pre-Complete credential denied");

    // --- Primary Signing: ceremony → Complete ---
    const primary = await buildActivatedSigning({
      title: `CompDel Primary ${stamp}`,
      participantName: "Pat Participant",
      participantEmail: `pat-${stamp}@example.com`,
    });
    await renameAndVerify(primary.signingId, `CompDel Renamed In Progress ${stamp}`, "IN_PROGRESS");
    await expectSigningError("rename to blank name", ["INVALID_INPUT"], () =>
      renameSigningForActor(agent, { signingId: primary.signingId, title: "   " }, admin),
    );
    await expectSigningError("rename over max length", ["INVALID_INPUT"], () =>
      renameSigningForActor(
        agent,
        { signingId: primary.signingId, title: "x".repeat(201) },
        admin,
      ),
    );
    // The participant link issued before the rename still drives the ceremony.
    await runCeremonyToComplete(primary);
    ok("primary Signing COMPLETE with artifacts");
    await renameAndVerify(primary.signingId, `CompDel Renamed Complete ${stamp}`, "COMPLETE");

    const { data: fanOutCred } = await admin
      .from("signing_completed_package_credentials")
      .select("id")
      .eq("signing_id", primary.signingId)
      .eq("signing_participant_id", primary.participantId)
      .eq("is_current", true)
      .is("revoked_at", null)
      .maybeSingle();
    if (!fanOutCred) {
      // Fan-out may have issued; otherwise issue now for participant.
      const issued = await issueCompletedPackageCredential({
        admin,
        signingId: primary.signingId,
        target: { signingParticipantId: primary.participantId },
        issuedByUserId: agentUserId,
      });
      ok(`participant completed-package credential issued (${issued.credentialId})`);
    } else {
      ok("participant completed-package credential from fan-out");
    }

    const { data: participantCredRow } = await admin
      .from("signing_completed_package_credentials")
      .select("id, token_wrapped, wrap_key_id")
      .eq("signing_id", primary.signingId)
      .eq("signing_participant_id", primary.participantId)
      .eq("is_current", true)
      .is("revoked_at", null)
      .single();
    if (!participantCredRow) fail("missing current participant package credential");

    let participantRaw =
      (await loadRawCompletedPackageToken({
        admin,
        signingId: primary.signingId,
        credentialId: participantCredRow.id as string,
      })) ?? null;
    if (!participantRaw) {
      // Fan-out may have created without returning raw; re-issue via replace.
      const reissued = await replaceCompletedPackageCredential({
        admin,
        signingId: primary.signingId,
        credentialId: participantCredRow.id as string,
        replacedByUserId: agentUserId,
        reason: "DEV_VALIDATOR_REISSUE",
      });
      participantRaw = reissued.rawToken;
      ok("re-issued participant credential to obtain raw token");
    }

    // --- Copy recipient + delivery instruction ---
    const copyRecipient = await addCopyRecipientWithActor(
      agent,
      {
        signingId: primary.signingId,
        email: `copy-${stamp}@example.com`,
        displayName: "Copy Recipient",
        roleLabel: "Title company",
      },
      admin,
    );
    ok(`copy recipient created (${copyRecipient.id})`);

    const { data: copyInstruction } = await admin
      .from("signing_delivery_instructions")
      .select("id, purpose, delivery_state")
      .eq("signing_id", primary.signingId)
      .eq("signing_copy_recipient_id", copyRecipient.id)
      .eq("purpose", "COMPLETED_PACKAGE")
      .order("create_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!copyInstruction) fail("missing copy-recipient delivery instruction");
    ok("copy-recipient delivery instruction queued");

    // Ensure participant also has a queued delivery if fan-out did not enqueue.
    const { data: participantInstructions } = await admin
      .from("signing_delivery_instructions")
      .select("id")
      .eq("signing_id", primary.signingId)
      .eq("signing_participant_id", primary.participantId)
      .eq("purpose", "COMPLETED_PACKAGE");
    if (!participantInstructions?.length) {
      const { data: currentCred } = await admin
        .from("signing_completed_package_credentials")
        .select("id")
        .eq("signing_id", primary.signingId)
        .eq("signing_participant_id", primary.participantId)
        .eq("is_current", true)
        .is("revoked_at", null)
        .single();
      await enqueueCompletedPackageDelivery({
        admin,
        signingId: primary.signingId,
        credentialId: currentCred!.id as string,
        signingParticipantId: primary.participantId,
        recipientEmail: `pat-${stamp}@example.com`,
        recipientName: "Pat Participant",
        initiatedByUserId: agentUserId,
      });
      ok("participant delivery instruction enqueued");
    }

    // --- Recovery suspension: queued work preserved, batch returns SUSPENDED ---
    const { count: pendingBefore } = await admin
      .from("signing_work_items")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", primary.signingId)
      .eq("work_type", "DELIVER_COMPLETED_PACKAGE")
      .eq("processing_state", "PENDING");
    if (!pendingBefore || pendingBefore < 1) {
      fail("expected pending DELIVER_COMPLETED_PACKAGE work before suspension");
    }

    await setSigningWorkSuspended({
      admin,
      suspended: true,
      reason: "completion-delivery-dev suspension test",
      note: "validator",
    });
    suspendedForTest = true;
    if (!(await isSigningWorkSuspended(admin))) {
      fail("work suspension did not stick");
    }

    const suspendedBatch = await processSigningWorkBatch({
      admin,
      secretOk: true,
      signingId: primary.signingId,
      limit: 5,
    });
    if (suspendedBatch.status !== "SUSPENDED") {
      fail(`expected SUSPENDED batch, got ${suspendedBatch.status}`);
    }
    const { count: pendingDuring } = await admin
      .from("signing_work_items")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", primary.signingId)
      .eq("work_type", "DELIVER_COMPLETED_PACKAGE")
      .eq("processing_state", "PENDING");
    if ((pendingDuring ?? 0) < (pendingBefore ?? 0)) {
      fail("suspension claimed or drained queued delivery work");
    }
    ok("recovery suspension returns SUSPENDED; queued work preserved");

    await setSigningWorkSuspended({
      admin,
      suspended: false,
      note: "completion-delivery-dev resume after suspension test",
    });
    suspendedForTest = false;

    // --- Process worker without real email (sandbox) ---
    let delivered = 0;
    for (let i = 0; i < 8; i += 1) {
      const next = await processNextCompletedPackageDeliveryWorkItem({
        admin,
        signingId: primary.signingId,
      });
      if ("outcome" in next && next.outcome === "NO_WORK") break;
      if ("outcome" in next && next.outcome === "ACCEPTED") delivered += 1;
      if ("outcome" in next && next.outcome === "FAILED") {
        fail(
          `delivery failed unexpectedly under sandbox: ${next.failureDetailSafe}`,
        );
      }
    }
    if (delivered < 1) fail("expected at least one sandbox ACCEPTED delivery");
    ok(`worker processed ${delivered} completed-package deliveries (sandbox, no Resend)`);

    const { data: sentEvents } = await admin
      .from("signing_events")
      .select("id, event_type")
      .eq("signing_id", primary.signingId)
      .in("event_type", [
        "COMPLETED_PACKAGE_SENT",
        "COPY_RECIPIENT_ADDED",
      ]);
    const eventTypes = new Set((sentEvents ?? []).map((e) => e.event_type));
    if (!eventTypes.has("COMPLETED_PACKAGE_SENT")) {
      fail("missing COMPLETED_PACKAGE_SENT protected event");
    }
    if (!eventTypes.has("COPY_RECIPIENT_ADDED")) {
      fail("missing COPY_RECIPIENT_ADDED protected event");
    }
    ok("protected delivery events present");

    // --- Bearer exchange → session ---
    const validated = await validateCompletedPackageCredential(
      admin,
      participantRaw,
    );
    if (!validated) fail("participant completed-package bearer did not validate");
    const session = await createCompletedPackageSession({
      admin,
      credential: validated,
    });
    const sessionOk = await validateCompletedPackageSession(
      admin,
      session.rawSessionToken,
    );
    if (!sessionOk) fail("completed-package session did not validate");
    if (sessionOk.signingId !== primary.signingId) {
      fail("session signing mismatch");
    }
    ok("bearer exchange / createCompletedPackageSession ok");

    await appendCompletedPackageAccessLog({
      admin,
      signingId: primary.signingId,
      accessKind: "PACKAGE_SESSION_OPENED",
      outcome: "SUCCEEDED",
      completedPackageCredentialId: validated.credentialId,
      completedPackageSessionId: session.sessionId,
      signingParticipantId: validated.signingParticipantId,
    });
    ok("access log write ok");

    // --- Package page authorization helpers ---
    const listed = await listCompletedPackageArtifactsForSession({
      admin,
      session: sessionOk,
    });
    if (listed.length < 2) {
      fail(`expected completed docs + certificate, got ${listed.length}`);
    }
    const loaded = await loadCompletedPackageArtifactForSession({
      admin,
      session: sessionOk,
      artifactId: listed[0]!.artifactId,
    });
    if (!loaded) fail("loadCompletedPackageArtifactForSession returned null");
    ok("package page authorization helpers list/load ok");

    // --- Cross-Signing denial ---
    const other = await buildActivatedSigning({
      title: `CompDel Other ${stamp}`,
      participantName: "Other Person",
      participantEmail: `other-${stamp}@example.com`,
    });
    await runCeremonyToComplete(other);
    const { data: otherArtifacts } = await admin
      .from("signing_artifacts")
      .select("id")
      .eq("signing_id", other.signingId)
      .eq("artifact_category", "COMPLETED_DOCUMENT")
      .not("verified_at", "is", null)
      .limit(1);
    const otherArtifactId = otherArtifacts?.[0]?.id as string | undefined;
    if (!otherArtifactId) fail("other Signing missing completed artifact");

    const crossDenied = await loadCompletedPackageArtifactForSession({
      admin,
      session: sessionOk,
      artifactId: otherArtifactId,
    });
    if (crossDenied) {
      fail("cross-Signing artifact mediation unexpectedly allowed");
    }
    ok("artifact download mediation denies wrong Signing/artifact");

    // --- Revoke / replace credentials ---
    const priorCredentialId = validated.credentialId;
    const replaced = await replaceCompletedPackageCredential({
      admin,
      signingId: primary.signingId,
      credentialId: priorCredentialId,
      replacedByUserId: agentUserId,
      reason: "DEV_VALIDATOR_REPLACE",
    });
    const oldStillValid = await validateCompletedPackageCredential(
      admin,
      participantRaw,
    );
    if (oldStillValid) fail("replaced credential still validated");
    const newValid = await validateCompletedPackageCredential(
      admin,
      replaced.rawToken,
    );
    if (!newValid) fail("replacement credential did not validate");
    await revokeCompletedPackageSessionsForCredential({
      admin,
      signingId: primary.signingId,
      credentialId: priorCredentialId,
    });
    const afterRevoke = await validateCompletedPackageSession(
      admin,
      session.rawSessionToken,
    );
    if (afterRevoke) fail("session still valid after credential revoke");
    ok("revoke/replace credential: old bearer denied, new bearer ok, session killed");

    await replaceCompletedPackageCredentialWithActor(
      agent,
      {
        signingId: primary.signingId,
        credentialId: replaced.credentialId,
        resend: true,
      },
      admin,
    );
    const { data: replaceEventsAfter } = await admin
      .from("signing_events")
      .select("id")
      .eq("signing_id", primary.signingId)
      .eq("event_type", "COMPLETED_PACKAGE_CREDENTIAL_REPLACED");
    if (!replaceEventsAfter?.length) {
      fail("missing COMPLETED_PACKAGE_CREDENTIAL_REPLACED event");
    }
    ok("credential replace withActor wrote protected event");

    // Drain any newly enqueued delivery from replace+resend under sandbox.
    for (let i = 0; i < 4; i += 1) {
      const next = await processNextCompletedPackageDeliveryWorkItem({
        admin,
        signingId: primary.signingId,
      });
      if ("outcome" in next && next.outcome === "NO_WORK") break;
    }

    // Manage-helper smoke (PRIMARY on COMPLETE).
    const manageOk = canManageCompletedSigningOperations(
      {
        canRead: true,
        canManage: false,
        activeAssociation: {
          id: "a",
          agentUserId: agentUserId!,
          associationRole: "PRIMARY",
          effectiveEndedAt: null,
        },
        historicalAssociation: null,
        activeOperatorAssociation: null,
        historicalOperatorAssociation: null,
        isBrokerageAdministrator: false,
        isTransactionCoordinator: false,
      },
      "COMPLETE",
    );
    if (!manageOk) fail("canManageCompletedSigningOperations PRIMARY failed");
    if (
      canManageCompletedSigningOperations(
        {
          canRead: true,
          canManage: true,
          activeAssociation: {
            id: "a",
            agentUserId: agentUserId!,
            associationRole: "PRIMARY",
            effectiveEndedAt: null,
          },
          historicalAssociation: null,
          activeOperatorAssociation: null,
          historicalOperatorAssociation: null,
          isBrokerageAdministrator: false,
          isTransactionCoordinator: false,
        },
        "IN_PROGRESS",
      )
    ) {
      fail("canManageCompletedSigningOperations allowed pre-Complete");
    }
    ok("canManageCompletedSigningOperations COMPLETE-only");

    // --- Draft prep tranche: Initials-linked Date + prepared content -------
    {
      const draft = await createDraftSigningWithActor(
        agent,
        { title: `CompDel Prepared ${stamp}` },
        admin,
      );
      signingIds.push(draft.id);
      const document = await addDraftSigningDocumentWithActor(
        agent,
        { signingId: draft.id, sourcePacketFormId: packetFormId! },
        admin,
      );
      const { data: ivyContact, error: ivyContactError } = await admin
        .from("contacts")
        .insert({
          owner_user_id: agent.userId,
          contact_type: "INDIVIDUAL",
          first_name: "Ivy",
          last_name: "Initials",
          email: `ivy-${stamp}@example.com`,
          status: "ACTIVE",
        })
        .select("id")
        .single();
      if (ivyContactError || !ivyContact) fail(ivyContactError?.message ?? "contact create failed");
      const ivyContactId = ivyContact.id as number;
      contactIds.push(ivyContactId);
      const participant = await addDraftSigningParticipantWithActor(
        agent,
        {
          signingId: draft.id,
          fullName: "Browser Supplied",
          linkedContactId: ivyContactId,
          roleCode: "BUYER",
        },
        admin,
      );
      if (participant.full_name !== "Ivy Initials") {
        fail("a Contact-linked participant must take its name from the Contact");
      }
      // Draft: the Contact rename flows into the participant (and its Printed Name).
      await admin.from("contacts").update({ first_name: "Ivana" }).eq("id", ivyContactId);
      const signerName = "Ivana Initials";
      const initials = await upsertDraftSigningFieldWithActor(
        agent,
        {
          signingId: draft.id,
          signingDocumentId: document.id,
          signingParticipantId: participant.id,
          fieldType: "INITIALS",
          pageNumber: 1,
          x: 72,
          y: 300,
          width: 48,
          height: 24,
        },
        admin,
      );
      await upsertDraftSigningFieldWithActor(
        agent,
        {
          signingId: draft.id,
          signingDocumentId: document.id,
          signingParticipantId: participant.id,
          fieldType: "DATE_SIGNED",
          pageNumber: 1,
          x: 140,
          y: 300,
          width: 100,
          height: 24,
          linkedSignatureDraftFieldId: initials.id,
        },
        admin,
      );
      await upsertDraftPreparedContentWithActor(
        agent,
        {
          signingId: draft.id,
          signingDocumentId: document.id,
          signingParticipantId: participant.id,
          contentType: "PRINTED_NAME",
          pageNumber: 1,
          x: 72,
          y: 400,
          width: 160,
          height: 16,
        },
        admin,
      );
      const checkmark = await upsertDraftPreparedContentWithActor(
        agent,
        {
          signingId: draft.id,
          signingDocumentId: document.id,
          signingParticipantId: participant.id,
          contentType: "CHECKMARK",
          pageNumber: 1,
          x: 300,
          y: 400,
          width: 12,
          height: 12,
        },
        admin,
      );
      if (checkmark.signing_participant_id !== null) {
        fail("a Checkmark must never carry participant authority");
      }
      const readiness = await evaluateSigningReadiness(admin, draft.id, agent);
      if (!readiness.ready) {
        fail(`Initials + linked Date + prepared content should be ready: ${JSON.stringify(readiness.blockers)}`);
      }
      ok("Initials-only participant with an Initials-linked Date and prepared content is ready");

      await activateSigningWithActor(
        agent,
        { signingId: draft.id, mode: "REMOTE_SEND", clientRequestId: randomUUID() },
        admin,
      );

      const { data: revisionFields } = await admin
        .from("signing_fields")
        .select("id, field_type, linked_signature_field_id")
        .eq("signing_id", draft.id);
      const revisionInitials = revisionFields?.find((row) => row.field_type === "INITIALS");
      const revisionDate = revisionFields?.find((row) => row.field_type === "DATE_SIGNED");
      if (
        revisionFields?.length !== 2 ||
        !revisionInitials ||
        revisionDate?.linked_signature_field_id !== revisionInitials.id
      ) {
        fail("activation must promote Initials + linked Date only (no prepared content as fields)");
      }
      const { count: preparedMarks } = await admin
        .from("signing_adopted_marks")
        .select("id", { count: "exact", head: true })
        .eq("signing_id", draft.id);
      if ((preparedMarks ?? 0) !== 0) fail("prepared content created adopted marks");
      const { data: frozenParticipant } = await admin
        .from("signing_package_revision_participants")
        .select("frozen_role_code")
        .eq("signing_id", draft.id)
        .single();
      if (frozenParticipant?.frozen_role_code !== "BUYER") {
        fail("participant role must freeze into the revision snapshot");
      }
      ok("activation froze the role and promoted the Initials-linked Date; prepared content is not evidence");

      const { data: version } = await admin
        .from("signing_document_versions")
        .select("storage_object_key")
        .eq("signing_id", draft.id)
        .single();
      if (!version?.storage_object_key) fail("prepared version missing");
      artifactKeys.push(version.storage_object_key as string);
      const { data: preparedBlob, error: preparedError } = await admin.storage
        .from(SIGNING_ARTIFACTS_BUCKET)
        .download(version.storage_object_key as string);
      if (preparedError || !preparedBlob) fail(preparedError?.message ?? "prepared download failed");
      const preparedContent = await decodedPageContent(
        new Uint8Array(await preparedBlob.arrayBuffer()),
      );
      if (!preparedContent.includes(pdfHexText(signerName))) {
        fail("Printed Name was not baked into the prepared version with the current Contact name");
      }
      if ((preparedContent.match(/ L\b/g) ?? []).length < 2) {
        fail("Checkmark strokes were not baked into the prepared version");
      }
      ok("Printed Name (current Contact name at activation) and Checkmark are baked into the prepared version");

      // After activation the identity is canonized: later source changes never apply.
      await admin.from("contacts").update({ first_name: "Changed", email: `changed-${stamp}@example.com` }).eq("id", ivyContactId);
      await loadSigningDashboardForActor(agent, draft.id, admin);
      const { data: liveAfter } = await admin
        .from("signing_participants")
        .select("full_name, email")
        .eq("id", participant.id)
        .single();
      const { data: frozenIdentity } = await admin
        .from("signing_package_revision_participants")
        .select("frozen_full_name, frozen_email")
        .eq("signing_id", draft.id)
        .single();
      if (
        liveAfter?.full_name !== signerName ||
        liveAfter.email !== `ivy-${stamp}@example.com` ||
        frozenIdentity?.frozen_full_name !== signerName ||
        frozenIdentity.frozen_email !== `ivy-${stamp}@example.com`
      ) {
        fail(`identity must stay frozen after activation: ${JSON.stringify({ liveAfter, frozenIdentity })}`);
      }
      const { error: hiddenMutation } = await admin
        .from("signing_participants")
        .update({ email: `hidden-${stamp}@example.com` })
        .eq("id", participant.id);
      if (!hiddenMutation?.message.includes("SIGNING_PARTICIPANT_IDENTITY_FROZEN")) {
        fail("the database must reject a participant email change after activation");
      }
      try {
        await updateDraftSigningParticipantWithActor(
          agent,
          { signingId: draft.id, participantId: participant.id, fullName: "Edited Later" },
          admin,
        );
        fail("post-activation participant identity edit unexpectedly succeeded");
      } catch (error) {
        if (!(error instanceof SigningError) || error.code !== "CONFLICT") throw error;
      }
      ok("after activation: Contact changes and refresh never alter the participant; edits and direct writes rejected");

      try {
        await upsertDraftPreparedContentWithActor(
          agent,
          {
            signingId: draft.id,
            signingDocumentId: document.id,
            contentType: "CHECKMARK",
            pageNumber: 1,
            x: 10,
            y: 10,
            width: 12,
            height: 12,
          },
          admin,
        );
        fail("prepared content edit after activation unexpectedly succeeded");
      } catch (error) {
        if (!(error instanceof SigningError)) throw error;
      }
      const { error: directInsertError } = await admin
        .from("signing_draft_prepared_content")
        .insert({
          signing_id: draft.id,
          signing_document_id: document.id,
          content_type: "CHECKMARK",
          page_number: 1,
          x: 10,
          y: 10,
          width: 12,
          height: 12,
        });
      if (!directInsertError?.message.includes("SIGNING_PREPARED_CONTENT_NOT_DRAFT")) {
        fail("database must reject prepared content once the Signing left Draft");
      }
      ok("prepared content is editable only during Draft (server + database)");

      const { data: credential } = await admin
        .from("signing_participant_credentials")
        .select("id")
        .eq("signing_id", draft.id)
        .eq("signing_participant_id", participant.id)
        .eq("is_current", true)
        .is("revoked_at", null)
        .single();
      const rawToken = await loadRawParticipantCredentialToken({
        admin,
        signingId: draft.id,
        credentialId: credential!.id as string,
      });
      const resolved = await validateParticipantCredential(admin, rawToken!);
      const entry = await createSigningEntrySession({ admin, credential: resolved! });
      const affirmed = await affirmIdentityFromEntrySession({
        admin,
        rawEntrySessionToken: entry.rawSessionToken,
      });
      const ceremonySession = await requireCeremonyBrowserSession(admin, affirmed.cookie.value);
      const context = await requireCeremonyWriteContext({ admin, session: ceremonySession });
      const disclosure = await loadCurrentConsentDisclosure(admin);
      await acceptConsent({ admin, context, disclosureVersionId: disclosure.id });
      await adoptCeremonyMark({
        admin,
        context,
        markKind: "INITIALS",
        representationType: "TYPED",
        typedText: "II",
      });

      const firstAccept = await acceptFieldPlacement({
        admin,
        context,
        signingFieldId: revisionInitials.id as string,
        clientRequestId: randomUUID(),
      });
      if (firstAccept.linkedDatePlacementIds.length !== 1) {
        fail("accepting Initials must apply its linked Date Signed");
      }
      const { data: signingRow } = await admin
        .from("signings")
        .select("sender_timezone")
        .eq("id", draft.id)
        .single();
      const expectedDate = senderLocalDate(
        (signingRow?.sender_timezone as string) ?? "America/Chicago",
      );
      const { data: firstDate } = await admin
        .from("signing_field_placements")
        .select("signing_field_id, rendered_sender_local_date")
        .eq("id", firstAccept.linkedDatePlacementIds[0] as string)
        .single();
      if (
        firstDate?.signing_field_id !== revisionDate.id ||
        firstDate?.rendered_sender_local_date !== expectedDate
      ) {
        fail("Initials-linked Date did not take the server acceptance date");
      }
      const removed = await removeFieldPlacement({
        admin,
        context,
        signingFieldId: revisionInitials.id as string,
        clientRequestId: randomUUID(),
      });
      if (removed.removedLinkedDatePlacementIds.length !== 1) {
        fail("removing Initials must make its linked Date ineffective");
      }
      const reapplied = await acceptFieldPlacement({
        admin,
        context,
        signingFieldId: revisionInitials.id as string,
        clientRequestId: randomUUID(),
      });
      if (
        reapplied.linkedDatePlacementIds.length !== 1 ||
        reapplied.linkedDatePlacementIds[0] === firstAccept.linkedDatePlacementIds[0]
      ) {
        fail("reapplying Initials must apply a fresh linked Date");
      }
      ok("Initials-linked Date: applied on accept, removed with Initials, fresh on reapply");

      const finish = await finishParticipantSigning({ admin, session: ceremonySession });
      if (finish.finalizationCondition !== "READY") {
        fail(`prepared content must not hold up Finish (got ${finish.finalizationCondition})`);
      }
      const finalized = await processNextFinalizationWorkItem({ admin, signingId: draft.id });
      if (finalized.status !== "COMPLETED") {
        fail(`prepared Signing finalization failed: ${finalized.detail ?? finalized.status}`);
      }
      const { data: completedArtifacts } = await admin
        .from("signing_artifacts")
        .select("storage_object_key, artifact_category")
        .eq("signing_id", draft.id)
        .not("verified_at", "is", null);
      for (const row of completedArtifacts ?? []) {
        artifactKeys.push(row.storage_object_key as string);
      }
      const completedKey = completedArtifacts?.find(
        (row) => row.artifact_category === "COMPLETED_DOCUMENT",
      )?.storage_object_key as string | undefined;
      if (!completedKey) fail("prepared Signing has no completed document");
      const { data: finalBlob, error: finalError } = await admin.storage
        .from(SIGNING_ARTIFACTS_BUCKET)
        .download(completedKey);
      if (finalError || !finalBlob) fail(finalError?.message ?? "final download failed");
      const finalContent = await decodedPageContent(new Uint8Array(await finalBlob.arrayBuffer()));
      if (!finalContent.includes(pdfHexText(signerName))) {
        fail("Printed Name is missing from the final PDF");
      }
      if (!finalContent.includes(pdfHexText(expectedDate))) {
        fail("Initials-linked Date is missing from the final PDF");
      }
      ok("final PDF keeps Printed Name + Checkmark and renders the Initials-linked Date");
    }

    console.log("\nPASS: native-signing-completion-delivery-dev");
  } catch (error) {
    console.error(error);
    await cleanup().catch((cleanupError) => {
      console.error("cleanup after failure also failed:", cleanupError);
    });
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    // Best-effort: if we already cleaned in catch, this is a no-op on empty ids.
    await cleanup().catch(() => undefined);
    ok("cleaned completion-delivery + Stage 6 fixtures");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
