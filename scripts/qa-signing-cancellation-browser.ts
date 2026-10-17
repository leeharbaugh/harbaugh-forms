/**
 * Browser QA: cancellation emails.
 *
 * Disposable development fixtures only; cleaned up unless QA_KEEP_FIXTURES=1.
 * Email never leaves the machine: the dev server and this script both run with
 * SIGNING_EMAIL_SANDBOX=true, and the provider-failure step removes the sandbox
 * only inside this process with no provider key. Each email is rendered from
 * its stored instruction exactly as the worker sends it and saved next to the
 * screenshots.
 *
 * Covers: Cancel dialog (labels, help text, reason required, Keep Signing);
 * cancel with a participant message (frozen recipient identity after a later
 * participant edit, internal reason never in the email, old link refused);
 * cancel without a message; finished participant still emailed; archived
 * In Progress then Cancel (stays archived, no access restored); Draft cancel
 * (no emails); provider failure shown then retried; duplicate Cancel from a
 * stale second tab and a double click (one email per participant).
 *
 *   NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-signing-cancellation-browser.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { activateSigningWithActor } from "../lib/signing/activation.ts";
import { adoptCeremonyMark } from "../lib/signing/adopted-marks.ts";
import { buildParticipantInviteUrl } from "../lib/signing/bearer-transport.ts";
import { requireCeremonyBrowserSession } from "../lib/signing/browser-sessions.ts";
import { cancelSigningWithActor } from "../lib/signing/cancel.ts";
import {
  loadCancellationNoticeMessage,
  processNextCancellationNoticeWorkItem,
} from "../lib/signing/cancellation-notices.ts";
import { affirmIdentityFromEntrySession } from "../lib/signing/ceremony-affirmation.ts";
import { requireCeremonyWriteContext } from "../lib/signing/ceremony-context.ts";
import { finishParticipantSigning } from "../lib/signing/ceremony-finish.ts";
import { acceptConsent, loadCurrentConsentDisclosure } from "../lib/signing/consent-disclosure.ts";
import { loadRawParticipantCredentialToken, validateParticipantCredential } from "../lib/signing/credentials.ts";
import { addDraftSigningDocumentWithActor } from "../lib/signing/draft-documents.ts";
import { upsertDraftSigningFieldWithActor } from "../lib/signing/draft-fields.ts";
import { addDraftSigningParticipantWithActor } from "../lib/signing/draft-participants.ts";
import { createSigningEntrySession } from "../lib/signing/entry-sessions.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import { acceptFieldPlacement } from "../lib/signing/placements.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";
import { createRuntimeNoiseGuard } from "./qa-runtime-noise.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const OUT_DIR = path.join("_audit_tmp", "signing-cancellation-qa");
const GENERATED_DOCUMENTS_BUCKET = "generated-documents";
const SIGNING_ARTIFACTS_BUCKET = "signing-artifacts";
const SANDBOX_LABEL = "Cancellation email accepted by the development email sandbox (not sent)";
const LEGAL_OVERCLAIMS = [/contract (is |has been )?cancel/i, /agreement (is |has been )?cancel/i, /\bvoid\b/i, /transaction (is |has been )?cancel/i];

class QaFailure extends Error {}
function fail(message: string): never {
  throw new QaFailure(message);
}
function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url.includes(EXPECTED_REF)) fail(`Refusing outside development: ${url}`);
  if (process.env.SIGNING_EMAIL_SANDBOX?.trim() !== "true") fail("SIGNING_EMAIL_SANDBOX=true is required");
  if (process.env.RESEND_API_KEY?.trim()) fail("RESEND_API_KEY must not be set for cancellation QA");
  const admin: SupabaseClient = createClient(url, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  mkdirSync(OUT_DIR, { recursive: true });

  const stamp = Date.now();
  const email = `cancel-qa-${stamp}@example.com`;
  const brokerage = `Cancel QA Brokerage ${stamp}`;
  let userId = "";
  let organizationId = "";
  let packetId = 0;
  let packetFormId = 0;
  let generatedPath = "";
  const signingIds: string[] = [];

  const browser = await chromium.launch({ headless: true });
  const managerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  managerContext.setDefaultNavigationTimeout(180000);
  const noise = createRuntimeNoiseGuard();
  const page = await managerContext.newPage();
  noise.watch(page, "manager");

  async function shot(target: Page, name: string) {
    await target.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
    ok(`screenshot ${path.join(OUT_DIR, `${name}.png`)}`);
  }

  try {
    // ---------- fixtures ----------
    const { data: org } = await admin.from("organizations").insert({ name: brokerage, status: "ACTIVE" }).select("id").single();
    organizationId = org!.id as string;
    const { data: created, error: userError } = await admin.auth.admin.createUser({ email, password: `CancelQa-${randomUUID()}!aA1`, email_confirm: true });
    if (userError || !created.user) fail(userError?.message ?? "user");
    userId = created.user.id;
    await admin.from("profiles").upsert({
      id: userId, email, status: "ACTIVE", app_role: "USER", onboarding_status: "ACTIVE",
      display_name: "Casey Agent", first_name: "Casey", last_name: "Agent",
      primary_organization_id: organizationId, must_change_password: false,
    });
    await admin.from("organization_members").insert({ organization_id: organizationId, user_id: userId, membership_role: "MEMBER", status: "ACTIVE" });
    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    const actor: SigningActor = {
      userId, email, displayName: "Casey Agent", profile: profile as Profile,
      memberships: [{ organizationId, membershipRole: "MEMBER", membershipStatus: "ACTIVE", organizationStatus: "ACTIVE" }],
    };
    const { data: packet } = await admin.from("packets").insert({ owner_user_id: userId, label: `Cancel QA Packet ${stamp}`, status: "ACTIVE", packet_type: "custom" }).select("id").single();
    packetId = packet!.id as number;
    const { data: form, error: formError } = await admin.from("packet_forms").insert({
      packet_id: packetId, form_id: null, status: "ACTIVE", document_state: "DRAFT", availability_state: "AVAILABLE",
      document_name: "Cancel QA Contract", document_type: "PDF", origin: "external_upload", sort_order: 1,
      is_required: false, field_data: {}, owner_user_id: userId,
    }).select("id").single();
    if (formError || !form) fail(formError?.message ?? "packet form");
    packetFormId = form.id as number;
    {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      pdf.addPage([612, 792]).drawText("Cancel QA Contract", { x: 72, y: 720, size: 18, font });
      generatedPath = `users/${userId}/packets/${packetId}/${packetFormId}-cancel-qa.pdf`;
      const { error } = await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).upload(generatedPath, await pdf.save(), { contentType: "application/pdf" });
      if (error) fail(error.message);
      await admin.from("packet_forms").update({ storage_path: generatedPath }).eq("id", packetFormId);
    }

    const participantEmail = (name: string) => `${name.split(" ")[0].toLowerCase()}-${stamp}@example.com`;
    async function buildDraft(title: string, names: string[]) {
      const draft = await createDraftSigningWithActor(actor, { title }, admin);
      signingIds.push(draft.id);
      const document = await addDraftSigningDocumentWithActor(actor, { signingId: draft.id, sourcePacketFormId: packetFormId }, admin);
      const participants: { id: string; name: string }[] = [];
      for (const [index, name] of names.entries()) {
        const participant = await addDraftSigningParticipantWithActor(actor, { signingId: draft.id, fullName: name, email: participantEmail(name) }, admin);
        await upsertDraftSigningFieldWithActor(actor, {
          signingId: draft.id, signingDocumentId: document.id, signingParticipantId: participant.id,
          fieldType: "SIGNATURE", pageNumber: 1, x: 72, y: 560 - index * 80, width: 200, height: 36, isRequired: true,
        }, admin);
        participants.push({ id: participant.id as string, name });
      }
      return { signingId: draft.id, title, participants };
    }
    async function activate(signingId: string) {
      await activateSigningWithActor(actor, { signingId, mode: "REMOTE_SEND", clientRequestId: randomUUID() }, admin);
    }
    async function inviteLink(signingId: string, participantId: string) {
      const { data } = await admin.from("signing_participant_credentials").select("id")
        .eq("signing_id", signingId).eq("signing_participant_id", participantId)
        .eq("is_current", true).is("revoked_at", null).single();
      const credentialId = data!.id as string;
      const raw = await loadRawParticipantCredentialToken({ admin, signingId, credentialId });
      const built = new URL(buildParticipantInviteUrl(credentialId, raw!));
      return { link: `${APP_ORIGIN}${built.pathname}${built.hash}`, raw: raw! };
    }
    async function finishParticipant(signingId: string, participant: { id: string; name: string }) {
      const { raw } = await inviteLink(signingId, participant.id);
      const resolved = await validateParticipantCredential(admin, raw);
      const entry = await createSigningEntrySession({ admin, credential: resolved! });
      const affirmed = await affirmIdentityFromEntrySession({ admin, rawEntrySessionToken: entry.rawSessionToken });
      const session = await requireCeremonyBrowserSession(admin, affirmed.cookie.value);
      const ceremony = await requireCeremonyWriteContext({ admin, session });
      await acceptConsent({ admin, context: ceremony, disclosureVersionId: (await loadCurrentConsentDisclosure(admin)).id });
      await adoptCeremonyMark({ admin, context: ceremony, markKind: "SIGNATURE", representationType: "TYPED", typedText: participant.name });
      const { data: field } = await admin.from("signing_fields").select("id")
        .eq("signing_id", signingId).eq("package_revision_id", ceremony.packageRevisionId)
        .eq("package_revision_participant_id", ceremony.revisionParticipantId).eq("field_type", "SIGNATURE").single();
      await acceptFieldPlacement({ admin, context: ceremony, signingFieldId: field!.id as string, clientRequestId: randomUUID() });
      await finishParticipantSigning({ admin, session });
    }
    async function signingRow(signingId: string) {
      const { data } = await admin.from("signings")
        .select("lifecycle_state, archived_at, cancellation_reason, cancellation_participant_message")
        .eq("id", signingId).single();
      return data!;
    }
    async function notices(signingId: string) {
      const { data } = await admin.from("signing_delivery_instructions")
        .select("id, signing_participant_id, recipient_email_snapshot, recipient_name_snapshot, delivery_state")
        .eq("signing_id", signingId).eq("purpose", "CANCELLATION");
      return data ?? [];
    }
    async function acceptedAttempts(signingId: string) {
      const ids = (await notices(signingId)).map((notice) => notice.id as string);
      if (!ids.length) return 0;
      const { count } = await admin.from("signing_delivery_attempts").select("id", { count: "exact", head: true })
        .in("delivery_instruction_id", ids).eq("outcome", "ACCEPTED");
      return count ?? 0;
    }
    /** Render and save each email exactly as the worker sends it; returns them by recipient. */
    async function renderEmails(signingId: string, label: string) {
      const rendered = new Map<string, { subject: string; textBody: string }>();
      for (const notice of await notices(signingId)) {
        const message = await loadCancellationNoticeMessage(admin, signingId, notice.id as string);
        if (!message) fail(`${label}: could not render email`);
        rendered.set(message.to, message);
        const file = path.join(OUT_DIR, `${label}-${message.to.split("@")[0]}.txt`);
        writeFileSync(file, `To: ${message.to}\nSubject: ${message.subject}\n\n${message.textBody}\n`);
        const preview = await managerContext.newPage();
        await preview.setContent(`<pre style="font:15px/1.5 system-ui;padding:24px;max-width:720px;white-space:pre-wrap">To: ${message.to}\nSubject: ${message.subject}\n\n${message.textBody.replace(/</g, "&lt;")}</pre>`);
        await shot(preview, `${label}-${message.to.split("@")[0]}-email`);
        await preview.close();
      }
      return rendered;
    }
    function checkEmail(message: { subject: string; textBody: string }, title: string, reason: string) {
      if (message.subject !== `Signing cancelled: ${title}`) fail(`subject: ${message.subject}`);
      if (message.textBody.includes(reason)) fail("internal reason appears in the email");
      if (/https?:\/\/|\/sign\//.test(message.textBody)) fail("email contains a link");
      if (!message.textBody.includes("Your previous signing link can no longer be used")) fail("email does not say the old link is dead");
      if (!message.textBody.includes(`Casey Agent at ${brokerage}`)) fail("email lacks agent and brokerage");
      for (const pattern of LEGAL_OVERCLAIMS) if (pattern.test(message.textBody)) fail(`legal overclaim in email: ${pattern}`);
    }
    const dialog = () => page.getByRole("alertdialog");
    async function openDashboard(signingId: string) {
      await page.goto(`${APP_ORIGIN}/signings/${signingId}`, { waitUntil: "networkidle" });
      await page.getByRole("heading").first().waitFor({ timeout: 60000 });
    }
    async function cancelFromDashboard(reason: string, message?: string) {
      await page.getByRole("button", { name: "Cancel Signing", exact: true }).click();
      await dialog().getByLabel("Internal cancellation reason").fill(reason);
      if (message) await dialog().getByLabel("Message to participants").fill(message);
      await dialog().getByRole("button", { name: "Cancel Signing", exact: true }).click();
      await page.getByText("CANCELLED", { exact: true }).first().waitFor({ timeout: 60000 });
      await page.getByTestId("signing-cancellation-details").waitFor({ timeout: 30000 });
    }
    function participantBadge(name: string) {
      return page.locator("div", { has: page.getByText(name, { exact: true }) })
        .filter({ has: page.getByTestId("participant-cancellation-email") }).last()
        .getByTestId("participant-cancellation-email");
    }

    // ---------- manager sign-in ----------
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    await page.goto(`${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(link!.properties!.hashed_token)}&type=magiclink&next=${encodeURIComponent("/signings")}`, { waitUntil: "networkidle" });
    if (page.url().includes("/auth/")) fail("manager sign-in failed");

    // ---------- 1. Basic cancel with a participant message ----------
    {
      const title = `Cancel QA Basic ${stamp}`;
      const reason = "Buyer entity is wrong on page 3 (internal note)";
      const message = "We will send a corrected signing request later today.";
      const signing = await buildDraft(title, ["Avery Buyer", "Blake Seller"]);
      await activate(signing.signingId);
      const [avery, blake] = signing.participants;
      const averyLink = await inviteLink(signing.signingId, avery.id);
      // Participant record edited after Send; the frozen identity must be used.
      const { error: editError } = await admin.from("signing_participants")
        .update({ full_name: "Avery Renamed Later", email: `avery-later-${stamp}@example.com` }).eq("id", avery.id);
      ok(editError ? `participant identity edit after Send refused by the database (${editError.message.slice(0, 80)})` : "participant record edited after Send (name and email)");
      await openDashboard(signing.signingId);
      await page.getByRole("button", { name: "Cancel Signing", exact: true }).click();
      await dialog().getByText("Cancel this Signing?", { exact: true }).waitFor();
      await dialog().getByText("Required. Saved in Signing history and not sent to participants.").waitFor();
      await dialog().getByText("Optional. Included in the cancellation email.").waitFor();
      await dialog().getByText(/Each invited participant is emailed that this signing request was cancelled\./).waitFor();
      if (!(await dialog().getByRole("button", { name: "Cancel Signing", exact: true }).isDisabled())) fail("confirm enabled without a reason");
      await dialog().getByLabel("Internal cancellation reason").fill("   ");
      if (!(await dialog().getByRole("button", { name: "Cancel Signing", exact: true }).isDisabled())) fail("confirm enabled with a blank reason");
      await shot(page, "01-cancel-dialog-empty");
      await dialog().getByRole("button", { name: "Keep Signing", exact: true }).click();
      await dialog().waitFor({ state: "detached" });
      if ((await signingRow(signing.signingId)).lifecycle_state !== "IN_PROGRESS") fail("Keep Signing cancelled");
      ok("Cancel dialog: both labels and help texts, email sentence, confirm disabled until a reason is entered; Keep Signing changes nothing");

      await page.getByRole("button", { name: "Cancel Signing", exact: true }).click();
      await dialog().getByLabel("Internal cancellation reason").fill(reason);
      await dialog().getByLabel("Message to participants").fill(message);
      await shot(page, "02-cancel-dialog-filled");
      await dialog().getByRole("button", { name: "Cancel Signing", exact: true }).click();
      await page.getByText("Signing cancelled. Create a new Signing to send corrected documents. Each invited participant is emailed that this signing request was cancelled.").waitFor({ timeout: 60000 });
      await page.getByTestId("signing-cancellation-details").getByText(reason).waitFor();
      await page.getByTestId("signing-cancellation-details").getByText("Not sent to participants.").waitFor();
      await page.getByTestId("signing-cancellation-details").getByText(message).waitFor();
      await page.reload({ waitUntil: "networkidle" });
      const badges = await page.getByTestId("participant-cancellation-email").allInnerTexts();
      if (badges.length !== 2 || badges.some((text) => text !== SANDBOX_LABEL)) fail(`cancellation email badges: ${JSON.stringify(badges)}`);
      if ((await participantBadge(blake.name).innerText()) !== SANDBOX_LABEL) fail("Blake badge");
      await shot(page, "03-cancelled-with-message");
      const row = await signingRow(signing.signingId);
      if (row.lifecycle_state !== "CANCELLED" || row.cancellation_reason !== reason || row.cancellation_participant_message !== message) fail("Cancel DB state");
      ok("cancelled: notice, Cancellation card (reason marked not sent, participant message), both participants show the sandbox-accepted badge after reload");

      const emails = await renderEmails(signing.signingId, "04-basic");
      const averyEmail = emails.get(participantEmail("Avery Buyer"));
      if (!averyEmail) fail("Avery's email did not go to the frozen address");
      if (!averyEmail.textBody.startsWith("Hello Avery Buyer,")) fail("Avery's email does not use the frozen name");
      for (const message_ of emails.values()) {
        checkEmail(message_, title, reason);
        if (!message_.textBody.includes(`Message from Casey Agent:\n"${message}"`)) fail("participant message missing");
      }
      if (emails.size !== 2) fail("expected two emails");
      ok("emails: frozen name/address from Send; subject, message section, contact line; no reason, link or legal claim");

      const { context, participant } = await (async () => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        return { context: ctx, participant: await ctx.newPage() };
      })();
      const exchange = participant.waitForResponse((response) => response.url().endsWith("/api/sign/entry-exchange"));
      await participant.goto(averyLink.link, { waitUntil: "domcontentloaded" });
      if ((await exchange).status() === 200) fail("old link exchanged after Cancel");
      await participant.getByText(/unavailable|no longer/i).first().waitFor({ timeout: 30000 });
      if (await participant.getByRole("button", { name: /^I am / }).count()) fail("identity affirmation offered after Cancel");
      await shot(participant, "05-old-link-after-cancel");
      await context.close();
      ok("old signing link refused after Cancel (no session, no identity step)");
    }

    // ---------- 2. No message, with a finished participant ----------
    {
      const title = `Cancel QA Finished ${stamp}`;
      const reason = "Seller withdrew (internal)";
      const signing = await buildDraft(title, ["Finley Done", "Gray Waiting"]);
      await activate(signing.signingId);
      await finishParticipant(signing.signingId, signing.participants[0]);
      await openDashboard(signing.signingId);
      await cancelFromDashboard(reason);
      await page.getByTestId("signing-cancellation-details").getByText("None", { exact: true }).waitFor();
      await page.reload({ waitUntil: "networkidle" });
      if ((await participantBadge("Finley Done").innerText()) !== SANDBOX_LABEL) fail("finished participant badge");
      if ((await participantBadge("Gray Waiting").innerText()) !== SANDBOX_LABEL) fail("waiting participant badge");
      await shot(page, "10-cancelled-no-message-finished");
      const emails = await renderEmails(signing.signingId, "11-no-message");
      if (emails.size !== 2) fail("finished participant was not emailed");
      for (const message of emails.values()) {
        checkEmail(message, title, reason);
        if (/Message from/.test(message.textBody)) fail("empty message produced a message section");
      }
      ok("no message: Cancellation card shows None, emails have no message section; the finished participant is emailed too");

      // The dev server's own sandbox send (manual UI path) left one inspectable copy per notice.
      const sandboxDir = path.join("_audit_tmp", "signing-email-sandbox");
      const sandboxFiles = existsSync(sandboxDir) ? readdirSync(sandboxDir) : [];
      for (const notice of await notices(signing.signingId)) {
        const matches = sandboxFiles.filter((name) => name.includes(notice.id as string));
        if (matches.length !== 1) fail(`expected one sandbox copy for a notice, found ${matches.length}`);
        const text = readFileSync(path.join(sandboxDir, matches[0]), "utf8");
        const rendered = emails.get(notice.recipient_email_snapshot as string)!;
        if (!text.endsWith(`Subject: ${rendered.subject}\n\n${rendered.textBody}\n`)) fail("sandbox copy differs from the email");
        if (text.includes(reason) || /Message from/.test(text) || /https?:\/\/|\/sign\/|#[A-Za-z0-9_-]{20,}/.test(text)) {
          fail("sandbox copy contains the reason, an empty message section, a link or a token");
        }
        ok(`manual UI cancel left ${path.join(sandboxDir, matches[0])}`);
      }
      ok("sandbox copies from the dev server: one per notice, exact subject/body, no message section, no reason, no link or token");
    }

    // ---------- 3. Archived In Progress, then Cancel ----------
    {
      const title = `Cancel QA Archived ${stamp}`;
      const signing = await buildDraft(title, ["Harper Archived"]);
      await activate(signing.signingId);
      await openDashboard(signing.signingId);
      await page.getByRole("button", { name: "Archive Signing", exact: true }).click();
      await dialog().getByRole("button", { name: "Archive Signing", exact: true }).click();
      await page.getByTestId("signing-archived-notice").waitFor({ timeout: 30000 });
      await dialog().waitFor({ state: "detached" });
      const archivedAt = (await signingRow(signing.signingId)).archived_at;
      await cancelFromDashboard("Archived and abandoned (internal)", "This request is closed.");
      await page.getByTestId("signing-archived-badge").waitFor();
      await page.reload({ waitUntil: "networkidle" });
      if ((await participantBadge("Harper Archived").innerText()) !== SANDBOX_LABEL) fail("archived Cancel badge");
      await shot(page, "20-archived-then-cancelled");
      const row = await signingRow(signing.signingId);
      if (row.lifecycle_state !== "CANCELLED" || row.archived_at !== archivedAt) fail("archived Cancel state");
      const { count } = await admin.from("signing_participant_credentials").select("id", { count: "exact", head: true })
        .eq("signing_id", signing.signingId).is("revoked_at", null);
      if ((count ?? 0) !== 0) fail("Cancel restored a link on an archived Signing");
      const emails = await renderEmails(signing.signingId, "21-archived");
      if (emails.size !== 1) fail("archived participant not emailed");
      ok("archived In Progress then Cancel: email sent, Signing stays Archived, no link restored");
    }

    // ---------- 4. Draft ----------
    {
      const signing = await buildDraft(`Cancel QA Draft ${stamp}`, ["Indy Draft"]);
      await openDashboard(signing.signingId);
      const draftCancelButtons = await page.getByRole("button", { name: "Cancel Signing", exact: true }).count();
      await cancelSigningWithActor(actor, { signingId: signing.signingId, reason: "Draft no longer needed (internal)" }, admin);
      await openDashboard(signing.signingId);
      await page.getByTestId("signing-cancellation-details").waitFor();
      if ((await page.getByTestId("participant-cancellation-email").count()) !== 0) fail("Draft participant shows a cancellation email");
      if ((await notices(signing.signingId)).length !== 0) fail("Draft Cancel queued an email");
      await shot(page, "30-draft-cancelled");
      ok(`Draft: ${draftCancelButtons === 0 ? "no Cancel button on Drafts (unchanged); cancelled through the server action" : "cancelled"}; no email queued, no badge`);
    }

    // ---------- 5. Provider failure, then retry ----------
    {
      const title = `Cancel QA Failure ${stamp}`;
      const signing = await buildDraft(title, ["Jordan Failure"]);
      await activate(signing.signingId);
      const sandbox = process.env.SIGNING_EMAIL_SANDBOX;
      delete process.env.SIGNING_EMAIL_SANDBOX;
      try {
        await cancelSigningWithActor(actor, { signingId: signing.signingId, reason: "Provider failure QA (internal)" }, admin);
      } finally {
        process.env.SIGNING_EMAIL_SANDBOX = sandbox;
      }
      if ((await signingRow(signing.signingId)).lifecycle_state !== "CANCELLED") fail("provider failure blocked Cancel");
      await openDashboard(signing.signingId);
      if ((await participantBadge("Jordan Failure").innerText()) !== "Cancellation email failed") fail("failure badge");
      await page.getByText("Signing email provider is not configured; message was not sent.").waitFor();
      await shot(page, "40-provider-failure");
      ok("provider failure: Signing still CANCELLED; participant shows Cancellation email failed with the safe reason");

      await admin.from("signing_work_items").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
        .eq("signing_id", signing.signingId).eq("work_type", "PARTICIPANT_CANCELLATION_EMAIL");
      const retried = await processNextCancellationNoticeWorkItem({ admin, signingId: signing.signingId });
      if (retried.outcome !== "ACCEPTED") fail(`retry outcome ${retried.outcome}`);
      await openDashboard(signing.signingId);
      if ((await participantBadge("Jordan Failure").innerText()) !== SANDBOX_LABEL) fail("retry badge");
      await shot(page, "41-provider-retry-accepted");
      if ((await acceptedAttempts(signing.signingId)) !== 1) fail("retry sent more than once");
      ok("retry through the Signing worker: accepted by the sandbox; badge updated; one accepted attempt");
    }

    // ---------- 6. Duplicate Cancel: stale second tab and double click ----------
    {
      const title = `Cancel QA Duplicate ${stamp}`;
      const signing = await buildDraft(title, ["Kai Duplicate", "Lee Duplicate"]);
      await activate(signing.signingId);
      const staleTab = await managerContext.newPage();
      noise.watch(staleTab, "stale-tab");
      await staleTab.goto(`${APP_ORIGIN}/signings/${signing.signingId}`, { waitUntil: "networkidle" });
      await staleTab.getByRole("button", { name: "Cancel Signing", exact: true }).click();
      await staleTab.getByRole("alertdialog").getByLabel("Internal cancellation reason").fill("Second tab (internal)");

      await openDashboard(signing.signingId);
      await page.getByRole("button", { name: "Cancel Signing", exact: true }).click();
      await dialog().getByLabel("Internal cancellation reason").fill("First tab (internal)");
      await dialog().getByRole("button", { name: "Cancel Signing", exact: true }).dblclick().catch(() => undefined);
      await page.getByTestId("signing-cancellation-details").waitFor({ timeout: 60000 });

      const staleConfirm = staleTab.getByRole("alertdialog").getByRole("button", { name: "Cancel Signing", exact: true });
      let staleOutcome = "stale dialog closed by live refresh";
      if (await staleConfirm.isVisible().catch(() => false)) {
        await staleConfirm.click();
        await staleTab.getByText("CANCELLED", { exact: true }).first().waitFor({ timeout: 60000 });
        staleOutcome = "stale tab confirmed and was shown the cancelled Signing";
      }
      await shot(staleTab, "50-duplicate-stale-tab");
      await staleTab.close();
      const row = await signingRow(signing.signingId);
      if (row.cancellation_reason !== "First tab (internal)") fail("the second Cancel overwrote the first reason");
      if ((await notices(signing.signingId)).length !== 2) fail("duplicate Cancel queued extra notices");
      if ((await acceptedAttempts(signing.signingId)) !== 2) fail("duplicate Cancel sent extra emails");
      const { count: cancelEvents } = await admin.from("signing_events").select("id", { count: "exact", head: true })
        .eq("signing_id", signing.signingId).eq("event_type", "SIGNING_CANCELLED");
      if (cancelEvents !== 1) fail("duplicate SIGNING_CANCELLED events");
      await page.reload({ waitUntil: "networkidle" });
      await shot(page, "51-duplicate-result");
      ok(`duplicate Cancel (double click + ${staleOutcome}): first reason kept, one event, one email per participant`);
    }

    const issues = noise.issues();
    if (issues.length) fail(`unexpected runtime errors/warnings:\n${issues.join("\n")}`);
    ok("no browser console errors/warnings, page errors, or dev server errors/warnings");
    console.log("\nCancellation email browser QA: all checks passed.");
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
    await admin.from("signings").update({ archived_at: null }).eq("id", signingId);
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
