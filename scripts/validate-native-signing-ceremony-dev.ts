/**
 * Development-only R12 Stage 5 Native Signing participant ceremony validator.
 *
 * Proves, against the linked development project only, that:
 * - "I am [Name]" is what creates authority: the ceremony browser session
 *   replaces the Stage 4 entry session, which stops working immediately.
 * - Consent is required before any mark, is recorded as version + fingerprint,
 *   and re-accepting is idempotent.
 * - Typed Signatures must equal the displayed name; Initials may override the
 *   suggestion. Signature and Initials adopt independently; marks lock on use.
 * - The first accepted mark freezes the package revision, a linked Date Signed
 *   follows its Signature in the sender's timezone, and accept/remove/replace
 *   are idempotent on their client request id.
 * - An agent amendment lock fails ceremony writes closed.
 * - Re-entry supersedes the prior session, inactivity expires it server-side
 *   and releases presence, and completed work survives both.
 * - Only prepared version bytes are served, and altered bytes fail closed.
 * - Finish is idempotent, requires every required field, and the last
 *   participant moves finalization to READY without completing the Signing.
 * - Decline requires confirmation and ends every session and lease.
 * - Every new ceremony table is deny-by-default for an authenticated browser.
 */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { activateSigningWithActor } from "../lib/signing/activation.ts";
import {
  adoptCeremonyMark,
  suggestTypedInitialsFromDisplayName,
} from "../lib/signing/adopted-marks.ts";
import {
  hashCeremonySessionToken,
  requireCeremonyBrowserSession,
  resolveCeremonyBrowserSession,
  SIGNING_CEREMONY_COOKIE_NAME,
  type ValidatedCeremonySession,
} from "../lib/signing/browser-sessions.ts";
import {
  affirmIdentityFromEntrySession,
  affirmIdentityFromInPersonHandoff,
} from "../lib/signing/ceremony-affirmation.ts";
import {
  loadCeremonyOverview,
  loadPreAffirmationContext,
  requireCeremonyWriteContext,
} from "../lib/signing/ceremony-context.ts";
import { declineSigning } from "../lib/signing/ceremony-decline.ts";
import { loadCeremonyDocumentBytes } from "../lib/signing/ceremony-documents.ts";
import {
  FINALIZE_SIGNING_WORK_TYPE,
  finishParticipantSigning,
} from "../lib/signing/ceremony-finish.ts";
import {
  acceptConsent,
  checkConsentSatisfied,
  loadCurrentConsentDisclosure,
} from "../lib/signing/consent-disclosure.ts";
import {
  loadRawParticipantCredentialToken,
  resolveCredentialWrapKeyring,
  SigningCredentialWrapConfigError,
  validateParticipantCredential,
  WRAP_KEY_ENV,
  WRAP_KEY_ID_ENV,
} from "../lib/signing/credentials.ts";
import { addDraftSigningDocumentWithActor } from "../lib/signing/draft-documents.ts";
import { upsertDraftSigningFieldWithActor } from "../lib/signing/draft-fields.ts";
import { addDraftSigningParticipantWithActor } from "../lib/signing/draft-participants.ts";
import {
  createSigningEntrySession,
  validateSigningEntrySession,
} from "../lib/signing/entry-sessions.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { NativeSigningDisabledError } from "../lib/signing/feature-gate.ts";
import { validateDeviceHandoffLock } from "../lib/signing/device-handoff-lock.ts";
import { createInPersonHandoffWithActor } from "../lib/signing/in-person-handoff.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import {
  acceptFieldPlacement,
  removeFieldPlacement,
  replaceFieldPlacement,
  senderLocalDate,
} from "../lib/signing/placements.ts";
import { hasActivePresenceForSigning } from "../lib/signing/presence.ts";
import {
  NATIVE_SIGNING_CEREMONY_TABLES,
  SIGNING_ARTIFACTS_BUCKET,
} from "../lib/signing/stage1-schema.ts";
import { GENERATED_DOCUMENTS_BUCKET } from "../lib/packet-form-storage.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PRODUCTION_REF = "eetonalyyyssvkyfdoxh";

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
    last_name: "Five",
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
  if (url.includes(PRODUCTION_REF)) {
    fail("Refusing to run against production");
  }
  if (!url.includes(EXPECTED_REF)) {
    fail(`Refusing to run outside the linked development project (${url})`);
  }

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) {
    fail("Missing Supabase anon/service keys");
  }

  // Activation issues wrapped credentials, so the ceremony fixtures cannot be
  // built without a configured wrap key.
  try {
    resolveCredentialWrapKeyring();
  } catch (error) {
    if (error instanceof SigningCredentialWrapConfigError) {
      fail(
        `${error.message} Add ${WRAP_KEY_ID_ENV} and ${WRAP_KEY_ENV} to .env.local.`,
      );
    }
    throw error;
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as SupabaseClient;
  const browser = createClient(url, anonKey);

  const previousGate = process.env.NATIVE_SIGNING_ENABLED;
  process.env.NATIVE_SIGNING_ENABLED = "true";

  const stamp = Date.now();
  const password = `Stage5-${randomUUID()}!aA1`;
  const agentEmail = `stage5-agent-${stamp}@example.com`;
  let agentUserId = "";
  let organizationId = "";
  let packetId = 0;
  let packetFormId = 0;
  const createdSigningIds: string[] = [];
  const storageKeysToRemove: string[] = [];
  const generatedPathsToRemove: string[] = [];

  async function countRows(table: string, signingId: string) {
    const { count, error } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("signing_id", signingId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  /** Entry session for an activated participant, as `/sign/{token}` does. */
  async function mintEntrySession(
    signingId: string,
    signingParticipantId: string,
  ) {
    const { data: credential } = await admin
      .from("signing_participant_credentials")
      .select("id")
      .eq("signing_id", signingId)
      .eq("signing_participant_id", signingParticipantId)
      .eq("is_current", true)
      .is("revoked_at", null)
      .maybeSingle();
    if (!credential) fail("no current credential for participant");
    const rawToken = await loadRawParticipantCredentialToken({
      admin,
      signingId,
      credentialId: credential.id as string,
    });
    if (!rawToken) fail("could not unwrap the participant bearer");
    const resolved = await validateParticipantCredential(admin, rawToken);
    if (!resolved) fail("participant credential did not validate");
    return createSigningEntrySession({ admin, credential: resolved });
  }

  async function buildActivatedSigning(options: {
    agent: SigningActor;
    title: string;
    participants: {
      fullName: string;
      email: string;
      withInitials: boolean;
    }[];
  }) {
    const signing = await createDraftSigningWithActor(
      options.agent,
      { title: options.title, sourcePacketId: packetId },
      admin,
    );
    createdSigningIds.push(signing.id);

    const document = await addDraftSigningDocumentWithActor(
      options.agent,
      { signingId: signing.id, sourcePacketFormId: packetFormId },
      admin,
    );
    const { data: snapshots } = await admin
      .from("signing_draft_source_snapshots")
      .select("source_pdf_object_key")
      .eq("signing_id", signing.id);
    for (const row of snapshots ?? []) {
      storageKeysToRemove.push(row.source_pdf_object_key as string);
    }

    const participantIds: string[] = [];
    let y = 700;
    for (const participant of options.participants) {
      const created = await addDraftSigningParticipantWithActor(
        options.agent,
        {
          signingId: signing.id,
          fullName: participant.fullName,
          email: participant.email,
        },
        admin,
      );
      participantIds.push(created.id);

      const signatureField = await upsertDraftSigningFieldWithActor(
        options.agent,
        {
          signingId: signing.id,
          signingDocumentId: document.id,
          signingParticipantId: created.id,
          fieldType: "SIGNATURE",
          pageNumber: 1,
          x: 72,
          y,
          width: 160,
          height: 40,
        },
        admin,
      );
      await upsertDraftSigningFieldWithActor(
        options.agent,
        {
          signingId: signing.id,
          signingDocumentId: document.id,
          signingParticipantId: created.id,
          fieldType: "DATE_SIGNED",
          pageNumber: 1,
          x: 260,
          y,
          width: 100,
          height: 24,
          linkedSignatureDraftFieldId: signatureField.id,
        },
        admin,
      );
      if (participant.withInitials) {
        await upsertDraftSigningFieldWithActor(
          options.agent,
          {
            signingId: signing.id,
            signingDocumentId: document.id,
            signingParticipantId: created.id,
            fieldType: "INITIALS",
            pageNumber: 1,
            x: 420,
            y,
            width: 80,
            height: 30,
          },
          admin,
        );
      }
      y -= 80;
    }

    // IN_PERSON keeps the fixture off the mail path entirely.
    await activateSigningWithActor(
      options.agent,
      {
        signingId: signing.id,
        mode: "IN_PERSON",
        clientRequestId: randomUUID(),
      },
      admin,
    );

    const { data: versions } = await admin
      .from("signing_document_versions")
      .select("storage_object_key")
      .eq("signing_id", signing.id);
    for (const version of versions ?? []) {
      if (version.storage_object_key) {
        storageKeysToRemove.push(version.storage_object_key as string);
      }
    }

    return { signingId: signing.id, participantIds };
  }

  /** Fields are assigned to the revision participant snapshot, not the row. */
  async function loadFields(signingId: string, signingParticipantId: string) {
    const { data: revisionParticipant, error: revisionParticipantError } =
      await admin
        .from("signing_package_revision_participants")
        .select("id")
        .eq("signing_id", signingId)
        .eq("signing_participant_id", signingParticipantId)
        .maybeSingle();
    if (revisionParticipantError) {
      throw new Error(revisionParticipantError.message);
    }
    if (!revisionParticipant) fail("participant has no revision snapshot");

    const { data, error } = await admin
      .from("signing_fields")
      .select("id, field_type, linked_signature_field_id")
      .eq("signing_id", signingId)
      .eq("package_revision_participant_id", revisionParticipant.id as string);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const signature = rows.find((row) => row.field_type === "SIGNATURE");
    const initials = rows.find((row) => row.field_type === "INITIALS");
    const dateSigned = rows.find((row) => row.field_type === "DATE_SIGNED");
    if (!signature) fail("activated revision has no SIGNATURE field");
    return {
      signatureFieldId: signature.id as string,
      initialsFieldId: (initials?.id as string | undefined) ?? null,
      dateSignedFieldId: (dateSigned?.id as string | undefined) ?? null,
    };
  }

  async function writeContext(session: ValidatedCeremonySession) {
    return requireCeremonyWriteContext({ admin, session });
  }

  try {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: `Stage 5 Org ${stamp}`, status: "ACTIVE" })
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
      display_name: "Stage Five Agent",
      first_name: "Stage",
      last_name: "Five",
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
        label: `Stage 5 packet ${stamp}`,
        status: "ACTIVE",
        packet_type: "custom",
      })
      .select("id")
      .single();
    if (packetError || !packet) {
      fail(packetError?.message ?? "packet create failed");
    }
    packetId = packet.id as number;

    const pdfBytes = await makeFixturePdf(`Stage5 Agreement ${stamp}`);
    const { data: insertedForm, error: formError } = await admin
      .from("packet_forms")
      .insert({
        packet_id: packetId,
        form_id: null,
        status: "ACTIVE",
        document_state: "DRAFT",
        availability_state: "AVAILABLE",
        document_name: `Stage5 Agreement ${stamp}`,
        document_type: "PDF",
        origin: "external_upload",
        sort_order: 1,
        is_required: false,
        field_data: {},
        owner_user_id: agentUserId,
      })
      .select("id")
      .single();
    if (formError || !insertedForm) {
      fail(formError?.message ?? "packet form create failed");
    }
    packetFormId = insertedForm.id as number;
    const storagePath = `users/${agentUserId}/packets/${packetId}/${packetFormId}-stage5-${stamp}.pdf`;
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
      .eq("id", packetFormId);
    if (pathError) fail(pathError.message);
    ok("created disposable Stage 5 fixtures");

    const agent = buildActor({
      userId: agentUserId,
      email: agentEmail,
      displayName: "Stage Five Agent",
      organizationId,
    });

    const disclosure = await loadCurrentConsentDisclosure(admin);
    if (disclosure.isProductionReady) {
      fail("the development disclosure is marked production ready");
    }
    ok(`current consent disclosure loaded and verified (${disclosure.versionKey})`);

    // ---------------------------------------------------------------------
    // Signing A: the full participant ceremony.
    // ---------------------------------------------------------------------
    const signingA = await buildActivatedSigning({
      agent,
      title: `Stage 5 Ceremony ${stamp}`,
      participants: [
        {
          fullName: "Jane Q Public",
          email: `jane-${stamp}@example.com`,
          withInitials: true,
        },
        {
          fullName: "Sam Second",
          email: `sam-${stamp}@example.com`,
          withInitials: false,
        },
      ],
    });
    const janeId = signingA.participantIds[0] as string;
    const samId = signingA.participantIds[1] as string;

    // 1. Pre-affirmation disclosure is identity + official business only.
    const preAffirmation = await loadPreAffirmationContext({
      admin,
      signingId: signingA.signingId,
      signingParticipantId: janeId,
      mode: "REMOTE",
    });
    if (!preAffirmation) fail("pre-affirmation context was unavailable");
    if (
      preAffirmation.participantFullName !== "Jane Q Public" ||
      preAffirmation.senderDisplayName !== "Stage Five Agent" ||
      !preAffirmation.brokerageName.includes("Stage 5 Org")
    ) {
      fail("pre-affirmation context omitted identity or official business");
    }
    if (JSON.stringify(preAffirmation).includes("@example.com")) {
      fail("pre-affirmation context disclosed an email address");
    }
    ok("pre-affirmation context shows identity, sender, and brokerage only");

    // 2. "I am [Name]" creates ceremony authority and retires the entry session.
    const janeEntry = await mintEntrySession(signingA.signingId, janeId);
    const affirmed = await affirmIdentityFromEntrySession({
      admin,
      rawEntrySessionToken: janeEntry.rawSessionToken,
    });
    if (affirmed.nextStep !== "CONSENT") {
      fail(`expected CONSENT after affirmation, got ${affirmed.nextStep}`);
    }
    if (
      affirmed.cookie.name !== SIGNING_CEREMONY_COOKIE_NAME ||
      affirmed.cookie.httpOnly !== true ||
      affirmed.cookie.secure !== true ||
      affirmed.cookie.sameSite !== "lax" ||
      affirmed.cookie.path !== "/sign"
    ) {
      fail("ceremony cookie is not HttpOnly/Secure/SameSite=Lax scoped to /sign");
    }
    const janeSessionToken = affirmed.cookie.value;

    const { data: sessionRow } = await admin
      .from("signing_browser_sessions")
      .select("*")
      .eq("id", affirmed.sessionId)
      .single();
    if (!sessionRow) fail("ceremony session row was not created");
    if (
      sessionRow.session_token_hash !== hashCeremonySessionToken(janeSessionToken)
    ) {
      fail("ceremony session row does not store the session token hash");
    }
    if (JSON.stringify(sessionRow).includes(janeSessionToken)) {
      fail("ceremony session row exposes the raw session token");
    }
    if (await validateSigningEntrySession(admin, janeEntry.rawSessionToken)) {
      fail("the Stage 4 entry session still validated after affirmation");
    }
    const { data: affirmedParticipant } = await admin
      .from("signing_participants")
      .select("identity_confirmed_at, participant_status")
      .eq("id", janeId)
      .single();
    if (
      !affirmedParticipant?.identity_confirmed_at ||
      affirmedParticipant.participant_status !== "STARTED"
    ) {
      fail("affirmation did not record identity confirmation");
    }
    if (!(await hasActivePresenceForSigning(admin, signingA.signingId))) {
      fail("affirmation did not begin presence");
    }
    ok("affirmation mints ceremony authority, retires the entry session, and starts presence");

    let janeSession = await requireCeremonyBrowserSession(
      admin,
      janeSessionToken,
    );
    const janeFields = await loadFields(signingA.signingId, janeId);

    // 3. No mark before consent.
    await expectSigningError(
      "placing a signature before consent",
      "CONSENT_REQUIRED",
      async () => {
        const context = await writeContext(janeSession);
        const consent = await checkConsentSatisfied({
          admin,
          signingId: context.session.signingId,
          signingParticipantId: context.session.signingParticipantId,
        });
        if (!consent.satisfied) {
          throw new SigningError("CONSENT_REQUIRED", "consent required");
        }
        return acceptFieldPlacement({
          admin,
          context,
          signingFieldId: janeFields.signatureFieldId,
          clientRequestId: randomUUID(),
        });
      },
    );

    // 4. Consent records version + fingerprint and is idempotent.
    const consentContext = await writeContext(janeSession);
    const accepted = await acceptConsent({
      admin,
      context: consentContext,
      disclosureVersionId: disclosure.id,
    });
    if (accepted.replayed) fail("first consent acceptance reported a replay");
    const replayedConsent = await acceptConsent({
      admin,
      context: consentContext,
      disclosureVersionId: disclosure.id,
    });
    if (!replayedConsent.replayed || replayedConsent.acceptedAt !== accepted.acceptedAt) {
      fail("re-accepting the same disclosure rewrote the acceptance");
    }
    await expectSigningError(
      "accepting a stale disclosure version",
      "CONFLICT",
      () =>
        acceptConsent({
          admin,
          context: consentContext,
          disclosureVersionId: randomUUID(),
        }),
    );
    const consentState = await checkConsentSatisfied({
      admin,
      signingId: signingA.signingId,
      signingParticipantId: janeId,
    });
    if (
      !consentState.satisfied ||
      consentState.acceptedDisclosureVersionId !== disclosure.id ||
      consentState.acceptedContentSha256 !== disclosure.contentSha256
    ) {
      fail("consent was not recorded as version + fingerprint");
    }
    ok("consent records version + fingerprint and is idempotent");

    // 5. Typed marks are exact-match, and adopt independently.
    await expectSigningError(
      "typed signature that does not match the displayed name",
      "VALIDATION_FAILED",
      () =>
        adoptCeremonyMark({
          admin,
          context: consentContext,
          markKind: "SIGNATURE",
          representationType: "TYPED",
          typedText: "J. Public",
        }),
    );
    const overriddenInitials = await adoptCeremonyMark({
      admin,
      context: consentContext,
      markKind: "INITIALS",
      representationType: "TYPED",
      typedText: "JP",
    });
    if (overriddenInitials.mark.typedText !== "JP") {
      fail("typed initials override was not accepted");
    }
    const signatureMark = await adoptCeremonyMark({
      admin,
      context: consentContext,
      markKind: "SIGNATURE",
      representationType: "TYPED",
      typedText: "Jane Q Public",
    });
    if (signatureMark.updated || signatureMark.mark.lockedAt) {
      fail("adopting an unused signature reported an update or a lock");
    }
    // Re-adopting an unused mark is allowed; using it is what locks it.
    const readopted = await adoptCeremonyMark({
      admin,
      context: consentContext,
      markKind: "SIGNATURE",
      representationType: "TYPED",
      typedText: "Jane Q Public",
    });
    if (!readopted.updated) fail("re-adopting an unused mark was not an update");
    ok(
      `typed signature exact-match; initials override allowed (suggestion ${suggestTypedInitialsFromDisplayName(
        "Jane Q Public",
      )})`,
    );

    // 6. First accepted mark freezes the package and applies Date Signed.
    const { data: beforeFreeze } = await admin
      .from("signings")
      .select("frozen_package_revision_id")
      .eq("id", signingA.signingId)
      .single();
    if (beforeFreeze?.frozen_package_revision_id) {
      fail("the package was frozen before any mark was accepted");
    }
    const placementRequestId = randomUUID();
    const signaturePlacement = await acceptFieldPlacement({
      admin,
      context: consentContext,
      signingFieldId: janeFields.signatureFieldId,
      clientRequestId: placementRequestId,
    });
    if (!signaturePlacement.packageFrozen) {
      fail("the first accepted mark did not freeze the package revision");
    }
    const { data: afterFreeze } = await admin
      .from("signings")
      .select("frozen_package_revision_id, current_package_revision_id")
      .eq("id", signingA.signingId)
      .single();
    if (
      afterFreeze?.frozen_package_revision_id !==
      afterFreeze?.current_package_revision_id
    ) {
      fail("freeze did not point at the current package revision");
    }
    if (signaturePlacement.linkedDatePlacementIds.length !== 1) {
      fail("the linked Date Signed field was not applied with the Signature");
    }
    const { data: signingRow } = await admin
      .from("signings")
      .select("sender_timezone")
      .eq("id", signingA.signingId)
      .single();
    const { data: datePlacement } = await admin
      .from("signing_field_placements")
      .select("signing_field_id, rendered_sender_local_date, disposition")
      .eq("id", signaturePlacement.linkedDatePlacementIds[0] as string)
      .single();
    if (datePlacement?.signing_field_id !== janeFields.dateSignedFieldId) {
      fail("the linked date placement is not the linked Date Signed field");
    }
    if (
      datePlacement?.rendered_sender_local_date !==
      senderLocalDate((signingRow?.sender_timezone as string) ?? "America/Chicago")
    ) {
      fail("Date Signed was not rendered in the sending agent's timezone");
    }
    // Retrying the same client request converges.
    const replayedPlacement = await acceptFieldPlacement({
      admin,
      context: consentContext,
      signingFieldId: janeFields.signatureFieldId,
      clientRequestId: placementRequestId,
    });
    if (
      !replayedPlacement.replayed ||
      replayedPlacement.placement.placementId !==
        signaturePlacement.placement.placementId
    ) {
      fail("retrying a placement created a second placement");
    }
    if ((await countRows("signing_field_placements", signingA.signingId)) !== 2) {
      fail("placement retry did not converge on one Signature + one Date");
    }
    ok("the first mark freezes the package, applies Date Signed, and is idempotent");

    // 7. A used mark locks; the other mark type stays adoptable.
    await expectSigningError(
      "changing a signature that has been used",
      "MARK_LOCKED",
      () =>
        adoptCeremonyMark({
          admin,
          context: consentContext,
          markKind: "SIGNATURE",
          representationType: "TYPED",
          typedText: "Jane Q Public",
        }),
    );
    const initialsMark = await adoptCeremonyMark({
      admin,
      context: consentContext,
      markKind: "INITIALS",
      representationType: "TYPED",
      typedText: suggestTypedInitialsFromDisplayName("Jane Q Public"),
    });
    if (initialsMark.mark.lockedAt) {
      fail("adopting initials arrived pre-locked");
    }
    ok("using a Signature locks only the Signature, not the unused Initials");

    // 8. A DATE_SIGNED field is never placed directly.
    await expectSigningError(
      "placing a Date Signed field directly",
      "INVALID_INPUT",
      () =>
        acceptFieldPlacement({
          admin,
          context: consentContext,
          signingFieldId: janeFields.dateSignedFieldId as string,
          clientRequestId: randomUUID(),
        }),
    );
    // Another participant's field is indistinguishable from one that is absent.
    const samFields = await loadFields(signingA.signingId, samId);
    await expectSigningError(
      "placing a mark in another participant's field",
      "CEREMONY_FORBIDDEN",
      () =>
        acceptFieldPlacement({
          admin,
          context: consentContext,
          signingFieldId: samFields.signatureFieldId,
          clientRequestId: randomUUID(),
        }),
    );

    // 9. Replace and remove keep the linked date consistent.
    const replaced = await replaceFieldPlacement({
      admin,
      context: consentContext,
      signingFieldId: janeFields.signatureFieldId,
      clientRequestId: randomUUID(),
    });
    if (
      replaced.placement.placementId === signaturePlacement.placement.placementId
    ) {
      fail("replace reused the retired placement row");
    }
    if (replaced.linkedDatePlacementIds.length !== 1) {
      fail("replace did not apply a fresh Date Signed");
    }
    const { data: retiredRow } = await admin
      .from("signing_field_placements")
      .select("disposition, replaced_by_placement_id")
      .eq("id", signaturePlacement.placement.placementId)
      .single();
    if (
      retiredRow?.disposition !== "REPLACED" ||
      retiredRow?.replaced_by_placement_id !== replaced.placement.placementId
    ) {
      fail("the replaced placement does not point at its successor");
    }
    const removed = await removeFieldPlacement({
      admin,
      context: consentContext,
      signingFieldId: janeFields.signatureFieldId,
      clientRequestId: randomUUID(),
    });
    if (removed.removedPlacementId !== replaced.placement.placementId) {
      fail("remove did not retire the accepted placement");
    }
    if (removed.removedLinkedDatePlacementIds.length !== 1) {
      fail("remove left the linked Date Signed effective");
    }
    const removedAgain = await removeFieldPlacement({
      admin,
      context: consentContext,
      signingFieldId: janeFields.signatureFieldId,
      clientRequestId: randomUUID(),
    });
    if (!removedAgain.replayed || removedAgain.removedPlacementId !== null) {
      fail("removing an already-removed placement was not idempotent");
    }
    ok("replace and remove carry the linked Date Signed and converge on retry");

    // 10. An agent amendment lock fails ceremony writes closed.
    const { data: association } = await admin
      .from("signings")
      .select("current_primary_agent_association_id, current_package_revision_id")
      .eq("id", signingA.signingId)
      .single();
    const { data: lock, error: lockError } = await admin
      .from("signing_amendment_locks")
      .insert({
        signing_id: signingA.signingId,
        held_by_agent_association_id:
          association?.current_primary_agent_association_id as string,
        expected_package_revision_id:
          association?.current_package_revision_id as string,
        expires_at: new Date(Date.now() + 120_000).toISOString(),
      })
      .select("id")
      .single();
    if (lockError || !lock) fail(lockError?.message ?? "lock insert failed");
    await expectSigningError(
      "a ceremony write while an amendment lock is held",
      "AMENDMENT_LOCKED",
      () => writeContext(janeSession),
    );
    const { error: releaseError } = await admin
      .from("signing_amendment_locks")
      .update({
        released_at: new Date().toISOString(),
        release_reason: "VALIDATOR_RELEASE",
      })
      .eq("id", lock.id as string);
    if (releaseError) fail(releaseError.message);
    await writeContext(janeSession);
    ok("an amendment lock fails ceremony writes closed and releasing restores them");

    // 11. Only prepared version bytes are served, and altered bytes fail closed.
    const { data: revisionDocument } = await admin
      .from("signing_package_revision_documents")
      .select("id, signing_document_version_id")
      .eq("signing_id", signingA.signingId)
      .single();
    const served = await loadCeremonyDocumentBytes({
      admin,
      session: janeSession,
      revisionDocumentId: revisionDocument?.id as string,
    });
    if (served.bytes.byteLength === 0) fail("no document bytes were served");
    const { data: versionRow } = await admin
      .from("signing_document_versions")
      .select("storage_object_key")
      .eq("id", revisionDocument?.signing_document_version_id as string)
      .single();
    const versionKey = versionRow?.storage_object_key as string;
    if (!versionKey.includes("/versions/")) {
      fail("the served document is not a prepared version object");
    }
    const { error: corruptError } = await admin.storage
      .from(SIGNING_ARTIFACTS_BUCKET)
      .upload(versionKey, await makeFixturePdf(`Corrupted ${stamp}`), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (corruptError) fail(`corruption upload failed: ${corruptError.message}`);
    await expectSigningError(
      "serving a document whose bytes no longer match their fingerprint",
      "INTEGRITY_MISMATCH",
      () =>
        loadCeremonyDocumentBytes({
          admin,
          session: janeSession,
          revisionDocumentId: revisionDocument?.id as string,
        }),
    );
    const { error: restoreError } = await admin.storage
      .from(SIGNING_ARTIFACTS_BUCKET)
      .upload(versionKey, served.bytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (restoreError) fail(`byte restore failed: ${restoreError.message}`);
    ok("prepared version bytes are served and altered bytes fail closed");

    // 12. Re-entry supersedes the prior session; accepted work survives.
    const handoff = await createInPersonHandoffWithActor(
      agent,
      { signingId: signingA.signingId, signingParticipantId: janeId },
      admin,
    );
    const { data: openDeviceLock } = await admin
      .from("signing_device_handoff_locks")
      .select("id, signing_in_person_handoff_id, agent_user_id, released_at")
      .eq("signing_id", signingA.signingId)
      .is("released_at", null)
      .maybeSingle();
    if (
      !openDeviceLock ||
      openDeviceLock.signing_in_person_handoff_id !== handoff.handoffId ||
      openDeviceLock.agent_user_id !== agent.userId
    ) {
      fail("in-person handoff did not create an open device workspace lock");
    }
    if (
      !handoff.rawDeviceLockToken ||
      !(await validateDeviceHandoffLock(admin, handoff.rawDeviceLockToken))
    ) {
      fail("device lock token did not validate");
    }
    const reaffirmed = await affirmIdentityFromInPersonHandoff({
      admin,
      rawHandoffToken: handoff.rawHandoffToken,
    });
    if (!reaffirmed.clearHandoffCookie) {
      fail("in-person affirmation did not clear the handoff cookie");
    }
    const supersededResolution = await resolveCeremonyBrowserSession(
      admin,
      janeSessionToken,
    );
    if (supersededResolution.ok || supersededResolution.code !== "SESSION_SUPERSEDED") {
      fail("the prior ceremony session was not reported as superseded");
    }
    const { data: consumedHandoff } = await admin
      .from("signing_in_person_handoffs")
      .select("consumed_at")
      .eq("id", handoff.handoffId)
      .single();
    if (!consumedHandoff?.consumed_at) {
      fail("the in-person handoff was not consumed at affirmation");
    }
    if (
      await affirmIdentityFromInPersonHandoff({
        admin,
        rawHandoffToken: handoff.rawHandoffToken,
      }).then(
        () => true,
        (error: unknown) =>
          !(error instanceof SigningError && error.code === "CEREMONY_FORBIDDEN"),
      )
    ) {
      fail("a consumed handoff token was reusable");
    }
    janeSession = await requireCeremonyBrowserSession(
      admin,
      reaffirmed.cookie.value,
    );
    const overviewAfterReentry = await loadCeremonyOverview({
      admin,
      session: janeSession,
    });
    if (!overviewAfterReentry.consent.satisfied) {
      fail("re-entry re-required consent for an unchanged disclosure");
    }
    if (!overviewAfterReentry.marks.signature?.lockedAt) {
      fail("re-entry lost the locked adopted signature");
    }
    ok("re-entry supersedes the prior session and preserves accepted work");

    // 13. Finish requires every required field, then is idempotent.
    await expectSigningError(
      "finishing with required fields outstanding",
      "NOT_READY",
      () => finishParticipantSigning({ admin, session: janeSession }),
    );
    const finishContext = await writeContext(janeSession);
    await acceptFieldPlacement({
      admin,
      context: finishContext,
      signingFieldId: janeFields.signatureFieldId,
      clientRequestId: randomUUID(),
    });
    await acceptFieldPlacement({
      admin,
      context: finishContext,
      signingFieldId: janeFields.initialsFieldId as string,
      clientRequestId: randomUUID(),
    });
    const janeFinish = await finishParticipantSigning({
      admin,
      session: janeSession,
    });
    if (janeFinish.replayed || janeFinish.allParticipantsFinished) {
      fail("finishing one of two participants reported completion");
    }
    if (janeFinish.finalizationCondition !== "NOT_STARTED") {
      fail("finalization moved before every participant finished");
    }
    const { data: janeRow } = await admin
      .from("signing_participants")
      .select("participant_status, finished_at")
      .eq("id", janeId)
      .single();
    if (
      janeRow?.participant_status !== "FINISHED" ||
      !janeRow?.finished_at
    ) {
      fail("Finish did not record FINISHED with a timestamp");
    }
    const { data: endedSession } = await admin
      .from("signing_browser_sessions")
      .select("status")
      .eq("id", janeSession.sessionId)
      .single();
    if (endedSession?.status !== "ENDED") {
      fail("Finish left the ceremony session ACTIVE");
    }
    if (await hasActivePresenceForSigning(admin, signingA.signingId)) {
      fail("Finish did not release presence");
    }
    const replayedFinish = await finishParticipantSigning({
      admin,
      session: janeSession,
    });
    if (!replayedFinish.replayed) fail("re-finishing was not idempotent");
    ok("Finish is idempotent, ends the session, and releases presence");

    // 14. The last participant readies finalization without completing.
    const samEntry = await mintEntrySession(signingA.signingId, samId);
    const samAffirmed = await affirmIdentityFromEntrySession({
      admin,
      rawEntrySessionToken: samEntry.rawSessionToken,
    });
    const samSession = await requireCeremonyBrowserSession(
      admin,
      samAffirmed.cookie.value,
    );
    const samContext = await writeContext(samSession);
    await acceptConsent({
      admin,
      context: samContext,
      disclosureVersionId: disclosure.id,
    });
    await adoptCeremonyMark({
      admin,
      context: samContext,
      markKind: "SIGNATURE",
      representationType: "DRAWN",
      drawnPath: [
        { x: 0, y: 0 },
        { x: 10, y: 4 },
      ],
    });
    await acceptFieldPlacement({
      admin,
      context: samContext,
      signingFieldId: samFields.signatureFieldId,
      clientRequestId: randomUUID(),
    });
    const samFinish = await finishParticipantSigning({
      admin,
      session: samSession,
    });
    if (!samFinish.allParticipantsFinished) {
      fail("the last participant finishing was not detected");
    }
    if (samFinish.finalizationCondition !== "READY") {
      fail(
        `expected finalization READY, got ${samFinish.finalizationCondition}`,
      );
    }
    const { data: finalSigning } = await admin
      .from("signings")
      .select("lifecycle_state, finalization_condition")
      .eq("id", signingA.signingId)
      .single();
    if (finalSigning?.lifecycle_state !== "IN_PROGRESS") {
      fail("finishing advanced the Signing lifecycle past In Progress");
    }
    if (finalSigning?.finalization_condition !== "READY") {
      fail("finalization condition was not READY after the last Finish");
    }
    const { data: workItems } = await admin
      .from("signing_work_items")
      .select("work_type, processing_state")
      .eq("signing_id", signingA.signingId);
    if (
      (workItems ?? []).filter(
        (item) => item.work_type === FINALIZE_SIGNING_WORK_TYPE,
      ).length !== 1
    ) {
      fail("the last Finish did not enqueue exactly one FINALIZE_SIGNING item");
    }
    ok("the last Finish readies finalization and never completes the Signing");

    // ---------------------------------------------------------------------
    // Signing B: inactivity expiry and Decline.
    // ---------------------------------------------------------------------
    const signingB = await buildActivatedSigning({
      agent,
      title: `Stage 5 Decline ${stamp}`,
      participants: [
        {
          fullName: "Dana Decliner",
          email: `dana-${stamp}@example.com`,
          withInitials: false,
        },
      ],
    });
    const danaId = signingB.participantIds[0] as string;

    const danaEntry = await mintEntrySession(signingB.signingId, danaId);
    const danaAffirmed = await affirmIdentityFromEntrySession({
      admin,
      rawEntrySessionToken: danaEntry.rawSessionToken,
    });
    const danaToken = danaAffirmed.cookie.value;

    // 15. Server inactivity expiry ends the session and releases presence.
    // Move create/activity timestamps with the expiry so the row still
    // satisfies `inactivity_expires_at > create_date` while appearing idle.
    const idleCreatedAt = new Date(Date.now() - 120 * 60_000).toISOString();
    const { error: backdateError } = await admin
      .from("signing_browser_sessions")
      .update({
        create_date: idleCreatedAt,
        identity_affirmed_at: idleCreatedAt,
        last_meaningful_activity_at: idleCreatedAt,
        inactivity_expires_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .eq("id", danaAffirmed.sessionId);
    if (backdateError) fail(backdateError.message);
    const expired = await resolveCeremonyBrowserSession(admin, danaToken);
    if (expired.ok || expired.code !== "SESSION_EXPIRED") {
      fail("an inactive ceremony session was not expired");
    }
    const { data: expiredRow } = await admin
      .from("signing_browser_sessions")
      .select("status, ended_reason")
      .eq("id", danaAffirmed.sessionId)
      .single();
    if (
      expiredRow?.status !== "EXPIRED" ||
      expiredRow?.ended_reason !== "INACTIVITY_TIMEOUT"
    ) {
      fail("inactivity expiry was not recorded on the session");
    }
    if (await hasActivePresenceForSigning(admin, signingB.signingId)) {
      fail("inactivity expiry did not release presence");
    }
    ok("inactivity expiry is server-authoritative and releases presence");

    // 16. Decline requires confirmation and ends everything.
    const danaEntryAgain = await mintEntrySession(signingB.signingId, danaId);
    const danaReaffirmed = await affirmIdentityFromEntrySession({
      admin,
      rawEntrySessionToken: danaEntryAgain.rawSessionToken,
    });
    const danaSession = await requireCeremonyBrowserSession(
      admin,
      danaReaffirmed.cookie.value,
    );
    await expectSigningError(
      "declining without explicit confirmation",
      "INVALID_INPUT",
      () =>
        declineSigning({
          admin,
          session: danaSession,
          confirmed: false,
        }),
    );
    const declined = await declineSigning({
      admin,
      session: danaSession,
      confirmed: true,
      reason: "Validator decline",
    });
    if (declined.lifecycleState !== "DECLINED" || declined.replayed) {
      fail("Decline did not move the Signing to DECLINED");
    }
    const { data: declinedSigning } = await admin
      .from("signings")
      .select("lifecycle_state")
      .eq("id", signingB.signingId)
      .single();
    const { data: declinedParticipant } = await admin
      .from("signing_participants")
      .select("participant_status, declined_at")
      .eq("id", danaId)
      .single();
    if (
      declinedSigning?.lifecycle_state !== "DECLINED" ||
      declinedParticipant?.participant_status !== "DECLINED" ||
      !declinedParticipant?.declined_at
    ) {
      fail("Decline did not record participant and Signing state");
    }
    const { data: remainingSessions } = await admin
      .from("signing_browser_sessions")
      .select("id")
      .eq("signing_id", signingB.signingId)
      .eq("status", "ACTIVE");
    if ((remainingSessions ?? []).length > 0) {
      fail("Decline left an ACTIVE ceremony session");
    }
    if (await hasActivePresenceForSigning(admin, signingB.signingId)) {
      fail("Decline did not release presence");
    }
    ok("Decline requires confirmation and ends every session and lease");

    // 17. Every ceremony act is in the append-only event log.
    const { data: events } = await admin
      .from("signing_events")
      .select("event_type")
      .eq("signing_id", signingA.signingId);
    const eventTypes = new Set(
      (events ?? []).map((row) => row.event_type as string),
    );
    for (const expected of [
      "IDENTITY_AFFIRMED",
      "CONSENT_ACCEPTED",
      "SIGNATURE_ADOPTED",
      "INITIALS_ADOPTED",
      "PACKAGE_FROZEN",
      "FIELD_PLACEMENT_ACCEPTED",
      "FIELD_PLACEMENT_REMOVED",
      "FIELD_PLACEMENT_REPLACED",
      "PARTICIPANT_FINISHED",
      "IN_PERSON_HANDOFF_ISSUED",
    ]) {
      if (!eventTypes.has(expected)) {
        fail(`ceremony event ${expected} was not recorded`);
      }
    }
    const { data: declineEvents } = await admin
      .from("signing_events")
      .select("event_type")
      .eq("signing_id", signingB.signingId);
    const declineTypes = new Set(
      (declineEvents ?? []).map((row) => row.event_type as string),
    );
    for (const expected of ["PARTICIPANT_DECLINED", "SIGNING_DECLINED"]) {
      if (!declineTypes.has(expected)) {
        fail(`decline event ${expected} was not recorded`);
      }
    }
    ok("every ceremony act is recorded in signing_events");

    // 18. Browser deny-by-default for every new ceremony table.
    const { data: browserSession, error: signInError } =
      await browser.auth.signInWithPassword({ email: agentEmail, password });
    if (signInError || !browserSession.user) {
      fail(`browser sign-in failed: ${signInError?.message}`);
    }
    for (const table of NATIVE_SIGNING_CEREMONY_TABLES) {
      const { error: selectError } = await browser
        .from(table)
        .select("id")
        .limit(1);
      if (!selectError) {
        fail(`authenticated SELECT ${table} unexpectedly succeeded`);
      }
      ok(`authenticated SELECT ${table} rejected`);
    }

    ok("Stage 5 Native Signing ceremony development checks passed");
  } finally {
    if (previousGate === undefined) {
      delete process.env.NATIVE_SIGNING_ENABLED;
    } else {
      process.env.NATIVE_SIGNING_ENABLED = previousGate;
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
      // Ceremony rows first: everything below them is ON DELETE RESTRICT.
      await admin
        .from("signing_field_placements")
        .update({ replaced_by_placement_id: null })
        .eq("signing_id", id);
      await admin.from("signing_field_placements").delete().eq("signing_id", id);
      await admin.from("signing_adopted_marks").delete().eq("signing_id", id);
      await admin
        .from("signing_participant_presence_leases")
        .delete()
        .eq("signing_id", id);
      await admin.from("signing_amendment_locks").delete().eq("signing_id", id);
      await admin
        .from("signing_browser_sessions")
        .update({ superseded_by_session_id: null })
        .eq("signing_id", id);
      await admin.from("signing_browser_sessions").delete().eq("signing_id", id);
      await admin
        .from("signing_in_person_handoffs")
        .delete()
        .eq("signing_id", id);
      await admin
        .from("signing_participants")
        .update({
          consent_disclosure_version_id: null,
          consent_content_sha256: null,
        })
        .eq("signing_id", id);

      await admin.from("signing_delivery_attempts").delete().eq("signing_id", id);
      await admin
        .from("signing_delivery_instructions")
        .delete()
        .eq("signing_id", id);
      await admin.from("signing_work_items").delete().eq("signing_id", id);
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
      await admin
        .from("signing_agent_associations")
        .delete()
        .eq("signing_id", id);
      await admin.from("signings").delete().eq("id", id);
    }

    if (packetFormId) {
      await admin
        .from("packet_forms")
        .update({ status: "DELETED" })
        .eq("id", packetFormId);
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
