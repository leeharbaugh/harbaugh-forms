/**
 * Browser QA: manager-recorded participant consent withdrawal.
 *
 * A. In Progress, two participants. The manager records Ava's withdrawal from
 *    the Signing page (Ben never consented, so he is not offered it). Ava's
 *    ceremony shows only the "consent withdrawn" notice and refuses signing;
 *    a queued invitation to Ava is SUPPRESSED while Ben's resend is sent; on
 *    Cancel, Ava's cancellation email is SUPPRESSED while Ben's is sent. The
 *    dashboard shows each suppression as "not sent: consent withdrawn".
 * B. Withdrawal after Cara finishes and before Complete: the completed-package
 *    fan-out records Cara's email as SUPPRESSED and delivers Dan's; the
 *    completed-package panel shows Cara as withdrawn with only Revoke Link.
 * C. Withdrawal after Complete: Eve's previously issued completed-documents
 *    link still opens and downloads the documents.
 *
 * Participants sign through the server ceremony functions except where the
 * participant browser is the subject; the manager is a real browser. Email is
 * the development sandbox. Disposable development fixtures only; cleaned up
 * unless QA_KEEP_FIXTURES=1.
 *
 *   NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-signing-consent-withdrawal-browser.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { activateSigningWithActor } from "../lib/signing/activation.ts";
import { adoptCeremonyMark } from "../lib/signing/adopted-marks.ts";
import { buildCompletedPackageUrl, buildParticipantInviteUrl } from "../lib/signing/bearer-transport.ts";
import { requireCeremonyBrowserSession } from "../lib/signing/browser-sessions.ts";
import { cancelSigningWithActor } from "../lib/signing/cancel.ts";
import { affirmIdentityFromEntrySession } from "../lib/signing/ceremony-affirmation.ts";
import { requireCeremonyWriteContext } from "../lib/signing/ceremony-context.ts";
import { finishParticipantSigning } from "../lib/signing/ceremony-finish.ts";
import { loadRawCompletedPackageToken } from "../lib/signing/completed-package-credentials.ts";
import { acceptConsent, loadCurrentConsentDisclosure } from "../lib/signing/consent-disclosure.ts";
import { loadRawParticipantCredentialToken, validateParticipantCredential } from "../lib/signing/credentials.ts";
import { PARTICIPANT_INVITATION_WORK_TYPE } from "../lib/signing/delivery.ts";
import { addDraftSigningDocumentWithActor } from "../lib/signing/draft-documents.ts";
import { upsertDraftSigningFieldWithActor } from "../lib/signing/draft-fields.ts";
import { addDraftSigningParticipantWithActor } from "../lib/signing/draft-participants.ts";
import { createSigningEntrySession } from "../lib/signing/entry-sessions.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import { acceptFieldPlacement } from "../lib/signing/placements.ts";
import { processSigningWorkBatch } from "../lib/signing/signing-worker-dispatch.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";
import { createRuntimeNoiseGuard } from "./qa-runtime-noise.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const OUT_DIR = path.join("_audit_tmp", "signing-consent-withdrawal-qa");
const GENERATED_DOCUMENTS_BUCKET = "generated-documents";
const SIGNING_ARTIFACTS_BUCKET = "signing-artifacts";

class QaFailure extends Error {}
function fail(message: string): never {
  throw new QaFailure(message);
}
function ok(message: string) {
  console.log(`OK: ${message}`);
}
const sha256 = (bytes: Uint8Array | Buffer) => createHash("sha256").update(bytes).digest("hex");
const localUrl = (url: string) => url.replace(/^https?:\/\/[^/]+/, APP_ORIGIN);

type Fixture = { signingId: string; participants: Array<{ id: string; name: string }> };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url.includes(EXPECTED_REF)) fail(`Refusing outside development: ${url}`);
  if (process.env.SIGNING_EMAIL_SANDBOX?.trim() !== "true") fail("SIGNING_EMAIL_SANDBOX=true is required");
  if (!process.env.SIGNING_EVENT_CHAIN_KEY?.trim()) fail("SIGNING_EVENT_CHAIN_KEY is required for finalization");
  const admin: SupabaseClient = createClient(url, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  mkdirSync(OUT_DIR, { recursive: true });

  const stamp = Date.now();
  const email = `withdrawal-qa-${stamp}@example.com`;
  let userId = "";
  let organizationId = "";
  let packetId = 0;
  let packetFormId = 0;
  let generatedPath = "";
  const signingIds: string[] = [];
  const secrets: string[] = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultNavigationTimeout(180000);
  const noise = createRuntimeNoiseGuard();

  try {
    // ---------- fixtures ----------
    const { data: org } = await admin.from("organizations").insert({ name: `Withdrawal QA Brokerage ${stamp}`, status: "ACTIVE" }).select("id").single();
    organizationId = org!.id as string;
    const { data: created, error: userError } = await admin.auth.admin.createUser({ email, password: `WithdrawalQa-${randomUUID()}!aA1`, email_confirm: true });
    if (userError || !created.user) fail(userError?.message ?? "user");
    userId = created.user.id;
    await admin.from("profiles").upsert({
      id: userId, email, status: "ACTIVE", app_role: "USER", onboarding_status: "ACTIVE",
      display_name: "Withdrawal QA Agent", first_name: "Withdrawal", last_name: "Agent",
      primary_organization_id: organizationId, must_change_password: false,
    });
    await admin.from("organization_members").insert({ organization_id: organizationId, user_id: userId, membership_role: "MEMBER", status: "ACTIVE" });
    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    const actor: SigningActor = {
      userId, email, displayName: "Withdrawal QA Agent", profile: profile as Profile,
      memberships: [{ organizationId, membershipRole: "MEMBER", membershipStatus: "ACTIVE", organizationStatus: "ACTIVE" }],
    };
    const { data: packet } = await admin.from("packets").insert({ owner_user_id: userId, label: `Withdrawal QA Packet ${stamp}`, status: "ACTIVE", packet_type: "custom" }).select("id").single();
    packetId = packet!.id as number;
    const { data: form, error: formError } = await admin.from("packet_forms").insert({
      packet_id: packetId, form_id: null, status: "ACTIVE", document_state: "DRAFT", availability_state: "AVAILABLE",
      document_name: "Withdrawal QA Contract", document_type: "PDF", origin: "external_upload", sort_order: 1,
      is_required: false, field_data: {}, owner_user_id: userId,
    }).select("id").single();
    if (formError || !form) fail(formError?.message ?? "packet form");
    packetFormId = form.id as number;
    {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      pdf.addPage([612, 792]).drawText("Withdrawal QA Contract", { x: 72, y: 720, size: 18, font });
      generatedPath = `users/${userId}/packets/${packetId}/${packetFormId}-withdrawal-qa.pdf`;
      const { error } = await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).upload(generatedPath, await pdf.save(), { contentType: "application/pdf" });
      if (error) fail(error.message);
      await admin.from("packet_forms").update({ storage_path: generatedPath }).eq("id", packetFormId);
    }

    async function buildActivatedSigning(title: string, names: string[]): Promise<Fixture> {
      const draft = await createDraftSigningWithActor(actor, { title }, admin);
      signingIds.push(draft.id);
      const document = await addDraftSigningDocumentWithActor(actor, { signingId: draft.id, sourcePacketFormId: packetFormId }, admin);
      const participants: Fixture["participants"] = [];
      for (const [index, name] of names.entries()) {
        const participant = await addDraftSigningParticipantWithActor(
          actor,
          { signingId: draft.id, fullName: name, email: `${name.split(" ")[0].toLowerCase()}-${stamp}@example.com` },
          admin,
        );
        await upsertDraftSigningFieldWithActor(actor, {
          signingId: draft.id, signingDocumentId: document.id, signingParticipantId: participant.id,
          fieldType: "SIGNATURE", pageNumber: 1, x: 72, y: 560 - index * 80, width: 200, height: 36, isRequired: true,
        }, admin);
        participants.push({ id: participant.id as string, name });
      }
      await activateSigningWithActor(actor, { signingId: draft.id, mode: "REMOTE_SEND", clientRequestId: randomUUID() }, admin);
      return { signingId: draft.id, participants };
    }

    async function inviteLink(signingId: string, participantId: string) {
      const { data: credential } = await admin.from("signing_participant_credentials").select("id")
        .eq("signing_id", signingId).eq("signing_participant_id", participantId)
        .eq("is_current", true).is("revoked_at", null).single();
      const rawToken = await loadRawParticipantCredentialToken({ admin, signingId, credentialId: credential!.id as string });
      if (!rawToken) fail("invitation token unavailable");
      secrets.push(rawToken);
      return { credentialId: credential!.id as string, rawToken, url: localUrl(buildParticipantInviteUrl(credential!.id as string, rawToken)) };
    }

    /** Server-side ceremony for one participant; `finish` signs and finishes. */
    async function ceremony(signingId: string, participant: { id: string; name: string }, finish: boolean) {
      const link = await inviteLink(signingId, participant.id);
      const resolved = await validateParticipantCredential(admin, link.rawToken);
      const entry = await createSigningEntrySession({ admin, credential: resolved! });
      const affirmed = await affirmIdentityFromEntrySession({ admin, rawEntrySessionToken: entry.rawSessionToken });
      const session = await requireCeremonyBrowserSession(admin, affirmed.cookie.value);
      const writeContext = await requireCeremonyWriteContext({ admin, session });
      const disclosure = await loadCurrentConsentDisclosure(admin);
      await acceptConsent({ admin, context: writeContext, disclosureVersionId: disclosure.id });
      if (!finish) return { session, writeContext };
      await adoptCeremonyMark({ admin, context: writeContext, markKind: "SIGNATURE", representationType: "TYPED", typedText: participant.name });
      const { data: field } = await admin.from("signing_fields").select("id")
        .eq("signing_id", signingId).eq("field_type", "SIGNATURE")
        .eq("package_revision_participant_id", writeContext.revisionParticipantId).single();
      await acceptFieldPlacement({ admin, context: writeContext, signingFieldId: field!.id as string, clientRequestId: randomUUID() });
      await finishParticipantSigning({ admin, session });
      return { session, writeContext };
    }

    const participantCard = (page: Page, participantId: string) =>
      page.locator(`[data-testid="participant-row"][data-participant-id="${participantId}"]`);
    const accessCard = (page: Page, participantId: string) =>
      page.locator(`[data-testid="participant-access-row"][data-participant-id="${participantId}"]`);
    const deliveryRow = (page: Page, participantId: string) =>
      page.locator(`[data-testid="completed-delivery-row"][data-recipient-id="${participantId}"]`);

    /** Records the withdrawal through the manager UI and returns the stored time. */
    async function recordWithdrawalInUi(page: Page, signingId: string, participant: { id: string; name: string }, label: string) {
      await page.goto(`${APP_ORIGIN}/signings/${signingId}`, { waitUntil: "networkidle" });
      const button = page.getByTestId("record-consent-withdrawal");
      if ((await button.count()) !== 1) fail(`${label}: expected exactly one Record consent withdrawal control, found ${await button.count()}`);
      if ((await participantCard(page, participant.id).getByTestId("record-consent-withdrawal").count()) !== 1) {
        fail(`${label}: the control is not on ${participant.name}'s row`);
      }
      await button.click();
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor();
      const dialogText = await dialog.innerText();
      if (!dialogText.includes(participant.name) || !/cannot be undone in this Signing/.test(dialogText) || !/completed-document links are kept/.test(dialogText)) {
        fail(`${label}: confirmation text: ${dialogText}`);
      }
      await dialog.getByRole("button", { name: "Record withdrawal" }).click();
      await participantCard(page, participant.id).getByTestId("participant-withdrawal-status").getByText(/Consent withdrawal recorded/).waitFor({ timeout: 30000 });
      await participantCard(page, participant.id).getByTestId("participant-consent-withdrawn").waitFor({ timeout: 30000 });
      if ((await page.getByTestId("record-consent-withdrawal").count()) !== 0) fail(`${label}: the control is still offered after recording`);
      const { data: row } = await admin.from("signing_participants").select("consent_withdrawn_at, consent_accepted_at, participant_status").eq("id", participant.id).single();
      if (!row?.consent_withdrawn_at || !row.consent_accepted_at) fail(`${label}: withdrawal not stored`);
      const { data: events } = await admin.from("signing_events").select("actor_type, actor_user_id, details_json")
        .eq("signing_id", signingId).eq("event_type", "CONSENT_WITHDRAWN");
      if ((events ?? []).length !== 1 || events![0].actor_user_id !== userId || events![0].actor_type !== "PRIMARY_AGENT"
        || (events![0].details_json as Record<string, unknown>).signingParticipantId !== participant.id) {
        fail(`${label}: expected one CONSENT_WITHDRAWN event attributed to the manager`);
      }
      return row;
    }

    async function instructionsFor(signingId: string, participantId: string, purpose: string) {
      const { data } = await admin.from("signing_delivery_instructions").select("id, delivery_state, create_date")
        .eq("signing_id", signingId).eq("signing_participant_id", participantId).eq("purpose", purpose)
        .order("create_date", { ascending: true });
      return (data ?? []) as Array<{ id: string; delivery_state: string }>;
    }
    async function attemptOutcomes(instructionId: string) {
      const { data } = await admin.from("signing_delivery_attempts").select("outcome, provider_reference")
        .eq("delivery_instruction_id", instructionId).order("attempt_number", { ascending: true });
      return (data ?? []) as Array<{ outcome: string; provider_reference: string | null }>;
    }

    // ---------- manager sign-in ----------
    const manager = await context.newPage();
    noise.watch(manager, "manager");
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    await manager.goto(`${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(link!.properties!.hashed_token)}&type=magiclink&next=${encodeURIComponent("/signings")}`, { waitUntil: "networkidle" });
    if (manager.url().includes("/auth/")) fail("manager sign-in failed");

    // ---------- A: In Progress ----------
    {
      const a = await buildActivatedSigning(`Withdrawal QA In Progress ${stamp}`, ["Ava Withdrawn", "Ben Continues"]);
      const [ava, ben] = a.participants;
      await ceremony(a.signingId, ava, false);
      const { data: avaBefore } = await admin.from("signing_participants")
        .select("consent_accepted_at, consent_disclosure_version_id, consent_content_sha256, participant_status")
        .eq("id", ava.id).single();

      await manager.goto(`${APP_ORIGIN}/signings/${a.signingId}`, { waitUntil: "networkidle" });
      if ((await participantCard(manager, ben.id).count()) !== 1) fail("A: Ben's participant row not found");
      if ((await participantCard(manager, ben.id).getByTestId("record-consent-withdrawal").count()) !== 0) {
        fail("A: offered for a participant who never consented");
      }
      await recordWithdrawalInUi(manager, a.signingId, ava, "A");
      const { data: avaAfter } = await admin.from("signing_participants")
        .select("consent_accepted_at, consent_disclosure_version_id, consent_content_sha256, participant_status")
        .eq("id", ava.id).single();
      if (JSON.stringify(avaAfter) !== JSON.stringify(avaBefore)) fail("A: withdrawal changed Ava's recorded consent or status");
      await manager.screenshot({ path: path.join(OUT_DIR, "a01-recorded.png"), fullPage: true });
      const avaAccess = accessCard(manager, ava.id);
      if ((await avaAccess.count()) !== 1) fail("A: Ava's link-access row not found");
      if ((await avaAccess.getByRole("button", { name: "Resend signing link" }).count()) !== 0
        || (await avaAccess.getByRole("button", { name: "Replace signing link" }).count()) !== 0) {
        fail("A: Resend / Replace still offered for the withdrawn participant");
      }
      if ((await avaAccess.getByRole("button", { name: "Revoke signing link" }).count()) !== 1) fail("A: Revoke must stay available");
      ok("A: Record consent withdrawal is offered only after consent, confirms with the consequences, records one manager-attributed event, leaves consent evidence unchanged, and hides Resend / Replace (Revoke stays)");

      // Ava's ceremony: notice only, no consent card, no signing.
      {
        const avaLink = await inviteLink(a.signingId, ava.id);
        const participantContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await participantContext.newPage();
        noise.watch(page, "ava");
        await page.goto(avaLink.url, { waitUntil: "domcontentloaded" });
        await page.waitForURL(/\/sign\/continue/, { timeout: 60000 });
        await page.getByRole("button", { name: `I am ${ava.name}` }).click();
        await page.waitForURL(/\/sign\/ceremony/, { timeout: 60000 });
        await page.waitForLoadState("networkidle");
        await page.getByTestId("consent-withdrawn").waitFor({ timeout: 30000 });
        const notice = await page.getByTestId("consent-withdrawn").innerText();
        if (!/Electronic consent withdrawn/.test(notice) || !/contact the sender/i.test(notice)) fail(`A: ceremony notice: ${notice}`);
        if ((await page.getByTestId("consent-acknowledge").count()) !== 0) fail("A: a consent checkbox is offered after withdrawal");
        if ((await page.getByRole("button", { name: /Start signing/i }).count()) !== 0) fail("A: Start signing offered after withdrawal");
        if ((await page.getByRole("button", { name: /withdraw/i }).count()) !== 0) fail("A: a participant-facing withdrawal control exists");
        await page.screenshot({ path: path.join(OUT_DIR, "a02-ceremony-notice.png"), fullPage: true });
        await participantContext.close();
        const { writeContext } = await (async () => {
          const resolved = await validateParticipantCredential(admin, avaLink.rawToken);
          const entry = await createSigningEntrySession({ admin, credential: resolved! });
          const affirmed = await affirmIdentityFromEntrySession({ admin, rawEntrySessionToken: entry.rawSessionToken });
          const session = await requireCeremonyBrowserSession(admin, affirmed.cookie.value);
          return { writeContext: await requireCeremonyWriteContext({ admin, session }) };
        })();
        const refused = await adoptCeremonyMark({ admin, context: writeContext, markKind: "SIGNATURE", representationType: "TYPED", typedText: ava.name })
          .then(() => null, (error: unknown) => error);
        if (!(refused instanceof SigningError) || refused.code !== "CONSENT_REQUIRED") fail("A: the server allowed signing after withdrawal");
        const { count: avaPlacements } = await admin.from("signing_field_placements").select("id", { count: "exact", head: true })
          .eq("signing_id", a.signingId).eq("signing_participant_id", ava.id);
        if (avaPlacements) fail("A: a placement was recorded after withdrawal");
        ok("A: Ava's ceremony shows only \"Electronic consent withdrawn … contact the sender\" (no consent checkbox, no Start signing, no withdrawal control) and the server refuses her signature");
      }

      // Invitations: Ava's queued retry is suppressed; Ben's resend is sent.
      {
        const avaCredential = (await inviteLink(a.signingId, ava.id)).credentialId;
        const { data: queued } = await admin.from("signing_delivery_instructions").insert({
          signing_id: a.signingId, signing_participant_id: ava.id, purpose: "INVITATION",
          recipient_email_snapshot: `ava-${stamp}@example.com`, recipient_name_snapshot: ava.name,
          signing_participant_credential_id: avaCredential, delivery_state: "QUEUED", initiated_by_user_id: userId,
        }).select("id").single();
        await admin.from("signing_work_items").insert({
          signing_id: a.signingId, work_type: PARTICIPANT_INVITATION_WORK_TYPE, idempotency_key: `qa-withdrawal:${queued!.id}`,
          reference_json: { deliveryInstructionId: queued!.id, signingParticipantId: ava.id, signingParticipantCredentialId: avaCredential },
          processing_state: "PENDING", next_attempt_at: new Date().toISOString(),
        });
        const batch = await processSigningWorkBatch({ admin, secretOk: true, signingId: a.signingId, limit: 10 });
        if (batch.status !== "OK") fail(`A: batch ${batch.status}`);
        const avaOutcomes = await attemptOutcomes(queued!.id as string);
        const { data: avaInstruction } = await admin.from("signing_delivery_instructions").select("delivery_state").eq("id", queued!.id).single();
        if (avaInstruction?.delivery_state !== "SUPPRESSED" || avaOutcomes.map((row) => row.outcome).join(",") !== "SUPPRESSED") {
          fail(`A: Ava's queued invitation was not suppressed (${avaInstruction?.delivery_state} / ${avaOutcomes.map((row) => row.outcome).join(",")})`);
        }

        await manager.goto(`${APP_ORIGIN}/signings/${a.signingId}`, { waitUntil: "networkidle" });
        const benAccess = accessCard(manager, ben.id);
        const benBefore = (await instructionsFor(a.signingId, ben.id, "INVITATION")).length;
        await benAccess.getByRole("button", { name: "Resend signing link" }).click();
        await benAccess.getByTestId("participant-link-status").getByText("Signing link resent.").waitFor({ timeout: 30000 });
        const benInstructions = await instructionsFor(a.signingId, ben.id, "INVITATION");
        const benLatest = benInstructions.at(-1)!;
        if (benInstructions.length !== benBefore + 1 || benLatest.delivery_state !== "ACCEPTED") fail("A: Ben's resend was not sent");
        await manager.reload({ waitUntil: "networkidle" });
        const avaAccess = accessCard(manager, ava.id);
        if ((await avaAccess.getByText("Invitation not sent: consent withdrawn").count()) !== 1) fail("A: the dashboard does not show Ava's suppressed invitation");
        await manager.screenshot({ path: path.join(OUT_DIR, "a03-invitation-suppressed.png"), fullPage: true });
        ok("A: a queued invitation retry for Ava is SUPPRESSED (instruction and attempt) and shown as \"Invitation not sent: consent withdrawn\", while Ben's Resend signing link is sent (sandbox ACCEPTED)");
      }

      // Cancellation: Ava's email suppressed, Ben's sent.
      {
        await cancelSigningWithActor(actor, { signingId: a.signingId, reason: "Withdrawal QA cancellation" }, admin);
        const batch = await processSigningWorkBatch({ admin, secretOk: true, signingId: a.signingId, limit: 10 });
        if (batch.status !== "OK") fail(`A: cancellation batch ${batch.status}`);
        const [avaCancel] = await instructionsFor(a.signingId, ava.id, "CANCELLATION");
        const [benCancel] = await instructionsFor(a.signingId, ben.id, "CANCELLATION");
        if (avaCancel?.delivery_state !== "SUPPRESSED" || (await attemptOutcomes(avaCancel.id)).map((row) => row.outcome).join(",") !== "SUPPRESSED") {
          fail("A: Ava's cancellation email was not suppressed");
        }
        if (benCancel?.delivery_state !== "ACCEPTED") fail("A: Ben's cancellation email was not sent");
        await manager.goto(`${APP_ORIGIN}/signings/${a.signingId}`, { waitUntil: "networkidle" });
        await manager.getByText("CANCELLED").first().waitFor({ timeout: 60000 });
        if ((await participantCard(manager, ava.id).getByText("Cancellation email not sent: consent withdrawn").count()) !== 1) {
          fail("A: the dashboard does not show Ava's suppressed cancellation email");
        }
        if ((await participantCard(manager, ben.id).getByText(/Cancellation email accepted/).count()) !== 1) fail("A: Ben's cancellation email status missing");
        if ((await manager.getByTestId("record-consent-withdrawal").count()) !== 0) fail("A: the control is offered on a Cancelled Signing");
        await manager.screenshot({ path: path.join(OUT_DIR, "a04-cancellation.png"), fullPage: true });
        ok("A: on Cancel, Ava's cancellation email is SUPPRESSED and shown as \"not sent: consent withdrawn\", Ben's is sent; the control is gone once Cancelled");
      }
    }

    // ---------- B: withdrawal after Finish, before Complete ----------
    {
      const b = await buildActivatedSigning(`Withdrawal QA After Finish ${stamp}`, ["Cara Finished", "Dan Delivered"]);
      const [cara, dan] = b.participants;
      await ceremony(b.signingId, cara, true);
      await recordWithdrawalInUi(manager, b.signingId, cara, "B");
      await ceremony(b.signingId, dan, true);
      for (let pass = 0; pass < 3; pass += 1) {
        await processSigningWorkBatch({ admin, secretOk: true, signingId: b.signingId, limit: 10 });
      }
      const { data: signing } = await admin.from("signings").select("lifecycle_state").eq("id", b.signingId).single();
      if (signing?.lifecycle_state !== "COMPLETE") fail(`B: Signing did not complete (${signing?.lifecycle_state})`);
      const { count: caraPlacements } = await admin.from("signing_field_placements").select("id", { count: "exact", head: true })
        .eq("signing_id", b.signingId).eq("signing_participant_id", cara.id).eq("disposition", "ACCEPTED");
      if (caraPlacements !== 1) fail("B: Cara's signature did not survive withdrawal into the completed Signing");
      const caraPackage = await instructionsFor(b.signingId, cara.id, "COMPLETED_PACKAGE");
      const danPackage = await instructionsFor(b.signingId, dan.id, "COMPLETED_PACKAGE");
      if (caraPackage.length !== 1 || caraPackage[0].delivery_state !== "SUPPRESSED") fail(`B: Cara's completed package was not suppressed (${JSON.stringify(caraPackage)})`);
      if (danPackage.at(-1)?.delivery_state !== "ACCEPTED") fail(`B: Dan's completed package was not sent (${JSON.stringify(danPackage)})`);

      await manager.goto(`${APP_ORIGIN}/signings/${b.signingId}`, { waitUntil: "networkidle" });
      await manager.getByText("Completed package delivery").waitFor({ timeout: 60000 });
      const caraOps = deliveryRow(manager, cara.id);
      const danOps = deliveryRow(manager, dan.id);
      await caraOps.waitFor({ timeout: 30000 });
      if ((await caraOps.getByRole("button", { name: "Revoke Link" }).count()) !== 1) fail("B: Revoke Link must stay available for Cara");
      if ((await caraOps.getByText("Not sent: consent withdrawn").count()) !== 1) fail("B: Cara's completed-package row does not show Not sent: consent withdrawn");
      if ((await caraOps.getByText("Consent withdrawn", { exact: true }).count()) !== 1) fail("B: Cara's completed-package row lacks the withdrawn badge");
      if ((await caraOps.getByRole("button", { name: "Resend Package" }).count()) !== 0 || (await caraOps.getByRole("button", { name: "Replace Link" }).count()) !== 0) {
        fail("B: Resend / Replace offered for the withdrawn participant's package");
      }
      if ((await danOps.getByText("Provider Accepted").count()) !== 1 || (await danOps.getByRole("button", { name: "Resend Package" }).count()) !== 1) {
        fail("B: Dan's completed-package row is not delivered / manageable");
      }
      if ((await manager.getByTestId("completed-documents").count()) !== 1) fail("B: completed documents are not shown to the manager");
      await manager.screenshot({ path: path.join(OUT_DIR, "b01-completed-ops.png"), fullPage: true });
      ok("B: withdrawal recorded after Cara finished; the Signing still completed with her signature; her completed-package email is SUPPRESSED and shown as not sent with only Revoke Link, while Dan's is sent and manageable");
    }

    // ---------- C: withdrawal after Complete keeps the delivered link ----------
    {
      const c = await buildActivatedSigning(`Withdrawal QA After Complete ${stamp}`, ["Eve Kept"]);
      const [eve] = c.participants;
      await ceremony(c.signingId, eve, true);
      for (let pass = 0; pass < 3; pass += 1) {
        await processSigningWorkBatch({ admin, secretOk: true, signingId: c.signingId, limit: 10 });
      }
      const eveDelivered = await instructionsFor(c.signingId, eve.id, "COMPLETED_PACKAGE");
      if (eveDelivered.at(-1)?.delivery_state !== "ACCEPTED") fail("C: Eve's completed package was not delivered before withdrawal");
      const { data: credential } = await admin.from("signing_completed_package_credentials").select("id")
        .eq("signing_id", c.signingId).eq("signing_participant_id", eve.id).eq("is_current", true).is("revoked_at", null).single();
      const packageToken = await loadRawCompletedPackageToken({ admin, signingId: c.signingId, credentialId: credential!.id as string });
      if (!packageToken) fail("C: completed-package token unavailable");
      secrets.push(packageToken);
      const { data: artifacts } = await admin.from("signing_artifacts").select("id, artifact_category, content_sha256").eq("signing_id", c.signingId);
      const artifactsBefore = JSON.stringify((artifacts ?? []).map((row) => [row.id, row.content_sha256]).sort());

      await manager.goto(`${APP_ORIGIN}/signings/${c.signingId}`, { waitUntil: "networkidle" });
      await manager.getByText("COMPLETE", { exact: true }).first().waitFor({ timeout: 60000 });
      await recordWithdrawalInUi(manager, c.signingId, eve, "C");

      const participantContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await participantContext.newPage();
      noise.watch(page, "eve-package");
      await page.goto(localUrl(buildCompletedPackageUrl(credential!.id as string, packageToken)), { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/sign\/package/, { timeout: 60000 });
      await page.getByText("Completed documents", { exact: true }).waitFor({ timeout: 30000 });
      const documentLink = page.locator("a", { hasText: "Completed document" }).first();
      const href = await documentLink.getAttribute("href");
      const response = await participantContext.request.get(`${APP_ORIGIN}${href}`);
      const completedHashes = new Set((artifacts ?? []).filter((row) => row.artifact_category === "COMPLETED_DOCUMENT").map((row) => row.content_sha256 as string));
      if (response.status() !== 200 || !completedHashes.has(sha256(await response.body()))) fail(`C: the previously issued link no longer downloads (${response.status()})`);
      await page.screenshot({ path: path.join(OUT_DIR, "c01-package-after-withdrawal.png"), fullPage: true });
      await participantContext.close();

      const { data: artifactsAfterRows } = await admin.from("signing_artifacts").select("id, content_sha256").eq("signing_id", c.signingId);
      if (JSON.stringify((artifactsAfterRows ?? []).map((row) => [row.id, row.content_sha256]).sort()) !== artifactsBefore) fail("C: withdrawal changed completed artifacts");
      const { data: signing } = await admin.from("signings").select("lifecycle_state").eq("id", c.signingId).single();
      if (signing?.lifecycle_state !== "COMPLETE") fail("C: withdrawal changed lifecycle");
      ok("C: withdrawal recorded on a Complete Signing; Eve's previously issued completed-documents link still opens the package and downloads bytes matching the recorded SHA-256; artifacts and lifecycle unchanged");
    }

    const issues = noise.issues();
    if (issues.length) fail(`unexpected runtime errors/warnings:\n${issues.join("\n")}`);
    ok("no browser console errors/warnings, page errors, or dev server errors/warnings");
    console.log("\nConsent withdrawal browser QA: all checks passed.");
  } finally {
    await browser.close();
    if (process.env.QA_KEEP_FIXTURES === "1") {
      console.log("Fixtures kept (QA_KEEP_FIXTURES=1).");
    } else {
      await cleanup(admin, { signingIds, generatedPath, packetFormId, packetId, userId, organizationId });
    }
  }
}

async function cleanup(
  admin: SupabaseClient,
  fixture: { signingIds: string[]; generatedPath: string; packetFormId: number; packetId: number; userId: string; organizationId: string },
) {
  for (const signingId of fixture.signingIds) {
    const keys: string[] = [];
    for (const [table, column] of [
      ["signing_draft_source_snapshots", "source_pdf_object_key"],
      ["signing_document_versions", "storage_object_key"],
      ["signing_artifacts", "storage_object_key"],
    ] as const) {
      const { data } = await admin.from(table).select(column).eq("signing_id", signingId);
      for (const entry of (data ?? []) as unknown as Record<string, string | null>[]) {
        if (entry[column]) keys.push(entry[column]!);
      }
    }
    if (keys.length > 0) await admin.storage.from(SIGNING_ARTIFACTS_BUCKET).remove(keys);
    await admin.from("signing_participant_credentials").update({ replaced_by_credential_id: null }).eq("signing_id", signingId);
    await admin.from("signing_completed_package_credentials").update({ replaced_by_credential_id: null }).eq("signing_id", signingId).then(() => undefined, () => undefined);
    await admin.from("signing_field_placements").update({ replaced_by_placement_id: null }).eq("signing_id", signingId);
    await admin.from("signings").update({ current_package_revision_id: null, frozen_package_revision_id: null, current_primary_agent_association_id: null }).eq("id", signingId);
    await admin.from("signing_document_versions").update({ introduced_by_package_revision_id: null }).eq("signing_id", signingId);
    await admin.from("signing_draft_fields").update({ linked_signature_draft_field_id: null }).eq("signing_id", signingId);
    await admin.from("signing_documents").update({ selected_draft_source_snapshot_id: null, acknowledged_live_content_fingerprint: null }).eq("signing_id", signingId);
    const tables = [
      "signing_completed_package_access_log", "signing_completed_package_sessions", "signing_completed_package_credentials",
      "signing_delivery_attempts", "signing_delivery_instructions", "signing_work_items", "signing_entry_sessions",
      "signing_participant_presence_leases", "signing_browser_sessions", "signing_device_handoff_locks",
      "signing_in_person_handoffs", "signing_amendment_locks", "signing_participant_credentials",
      "signing_operation_idempotency", "signing_artifacts", "signing_events", "signing_event_chain_state",
      "signing_field_placements", "signing_adopted_marks", "signing_fields", "signing_package_revision_documents",
      "signing_package_revision_participants", "signing_document_versions", "signing_package_revisions",
      "signing_draft_fields", "signing_draft_prepared_content", "signing_draft_source_snapshots", "signing_documents",
      "signing_copy_recipients", "signing_participants", "signing_operator_associations", "signing_agent_associations",
    ];
    for (let pass = 0; pass < 3; pass += 1) {
      for (const table of tables) await admin.from(table).delete().eq("signing_id", signingId);
    }
    const { error } = await admin.from("signings").delete().eq("id", signingId);
    if (error) console.log(`NOTE: Signing ${signingId} cleanup incomplete: ${error.message}`);
  }
  if (fixture.generatedPath) await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).remove([fixture.generatedPath]);
  if (fixture.packetFormId) await admin.from("packet_forms").update({ status: "DELETED" }).eq("id", fixture.packetFormId);
  if (fixture.packetId) await admin.from("packets").update({ status: "DELETED" }).eq("id", fixture.packetId);
  if (fixture.userId) {
    await admin.from("organization_members").delete().eq("user_id", fixture.userId);
    await admin.from("profiles").delete().eq("id", fixture.userId);
    await admin.auth.admin.deleteUser(fixture.userId);
  }
  if (fixture.organizationId) await admin.from("organizations").delete().eq("id", fixture.organizationId);
  console.log("Cleanup complete.");
}

main().catch((error) => {
  const text = error instanceof QaFailure ? `FAIL: ${error.message}` : String(error?.stack ?? error);
  console.error(text.replace(/#[A-Za-z0-9_-]{43}/g, "#<redacted>"));
  process.exit(1);
});
