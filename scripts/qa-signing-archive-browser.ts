/**
 * Browser QA: Archive Signing.
 *
 * Disposable development fixtures only; cleaned up unless QA_KEEP_FIXTURES=1.
 * The manager is a real browser. Participants act through the server ceremony
 * functions, and through their own browser contexts where the participant
 * experience matters (open ceremony page, old link, replacement link).
 *
 * Covers: Draft archive / Show archived / direct URL / unarchive; In Progress
 * with partial signing and an open ceremony session (archive confirmation,
 * Keep Signing Active, revocation, old link refused before and after unarchive,
 * reissue notice, Replace resumes and keeps accepted marks); archive while a
 * participant is mid-ceremony, then Cancel while archived; Complete with
 * View / Download, unchanged hashes and filenames while archived; Declined.
 *
 *   NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-signing-archive-browser.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { activateSigningWithActor } from "../lib/signing/activation.ts";
import { adoptCeremonyMark } from "../lib/signing/adopted-marks.ts";
import { buildParticipantInviteUrl } from "../lib/signing/bearer-transport.ts";
import {
  requireCeremonyBrowserSession,
  SIGNING_CEREMONY_COOKIE_NAME,
  SIGNING_CEREMONY_COOKIE_PATH,
} from "../lib/signing/browser-sessions.ts";
import { affirmIdentityFromEntrySession } from "../lib/signing/ceremony-affirmation.ts";
import { requireCeremonyWriteContext } from "../lib/signing/ceremony-context.ts";
import { declineSigning } from "../lib/signing/ceremony-decline.ts";
import { finishParticipantSigning } from "../lib/signing/ceremony-finish.ts";
import { acceptConsent, loadCurrentConsentDisclosure } from "../lib/signing/consent-disclosure.ts";
import { loadRawParticipantCredentialToken, validateParticipantCredential } from "../lib/signing/credentials.ts";
import { addDraftSigningDocumentWithActor } from "../lib/signing/draft-documents.ts";
import { upsertDraftSigningFieldWithActor } from "../lib/signing/draft-fields.ts";
import { addDraftSigningParticipantWithActor } from "../lib/signing/draft-participants.ts";
import { createSigningEntrySession } from "../lib/signing/entry-sessions.ts";
import {
  processNextCombinedPackageWorkItem,
  processNextFinalizationWorkItem,
} from "../lib/signing/finalization-worker.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import { acceptFieldPlacement } from "../lib/signing/placements.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";
import { createRuntimeNoiseGuard } from "./qa-runtime-noise.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const OUT_DIR = path.join("_audit_tmp", "signing-archive-qa");
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
  const email = `archive-qa-${stamp}@example.com`;
  let userId = "";
  let organizationId = "";
  let packetId = 0;
  let packetFormId = 0;
  let generatedPath = "";
  const signingIds: string[] = [];

  const browser = await chromium.launch({ headless: true });
  const managerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
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
    const { data: org } = await admin.from("organizations").insert({ name: `Archive QA Brokerage ${stamp}`, status: "ACTIVE" }).select("id").single();
    organizationId = org!.id as string;
    const { data: created, error: userError } = await admin.auth.admin.createUser({ email, password: `ArchiveQa-${randomUUID()}!aA1`, email_confirm: true });
    if (userError || !created.user) fail(userError?.message ?? "user");
    userId = created.user.id;
    await admin.from("profiles").upsert({
      id: userId, email, status: "ACTIVE", app_role: "USER", onboarding_status: "ACTIVE",
      display_name: "Archive QA Agent", first_name: "Archive", last_name: "Agent",
      primary_organization_id: organizationId, must_change_password: false,
    });
    await admin.from("organization_members").insert({ organization_id: organizationId, user_id: userId, membership_role: "MEMBER", status: "ACTIVE" });
    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    const actor: SigningActor = {
      userId, email, displayName: "Archive QA Agent", profile: profile as Profile,
      memberships: [{ organizationId, membershipRole: "MEMBER", membershipStatus: "ACTIVE", organizationStatus: "ACTIVE" }],
    };
    const { data: packet } = await admin.from("packets").insert({ owner_user_id: userId, label: `Archive QA Packet ${stamp}`, status: "ACTIVE", packet_type: "custom" }).select("id").single();
    packetId = packet!.id as number;
    const { data: form, error: formError } = await admin.from("packet_forms").insert({
      packet_id: packetId, form_id: null, status: "ACTIVE", document_state: "DRAFT", availability_state: "AVAILABLE",
      document_name: "Archive QA Contract", document_type: "PDF", origin: "external_upload", sort_order: 1,
      is_required: false, field_data: {}, owner_user_id: userId,
    }).select("id").single();
    if (formError || !form) fail(formError?.message ?? "packet form");
    packetFormId = form.id as number;
    {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      pdf.addPage([612, 792]).drawText("Archive QA Contract", { x: 72, y: 720, size: 18, font });
      generatedPath = `users/${userId}/packets/${packetId}/${packetFormId}-archive-qa.pdf`;
      const { error } = await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).upload(generatedPath, await pdf.save(), { contentType: "application/pdf" });
      if (error) fail(error.message);
      await admin.from("packet_forms").update({ storage_path: generatedPath }).eq("id", packetFormId);
    }

    async function buildDraft(title: string, names: string[]) {
      const draft = await createDraftSigningWithActor(actor, { title }, admin);
      signingIds.push(draft.id);
      const document = await addDraftSigningDocumentWithActor(actor, { signingId: draft.id, sourcePacketFormId: packetFormId }, admin);
      const participants: { id: string; name: string }[] = [];
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
      return { signingId: draft.id, title, participants };
    }
    async function activate(signingId: string) {
      await activateSigningWithActor(actor, { signingId, mode: "REMOTE_SEND", clientRequestId: randomUUID() }, admin);
    }
    async function currentCredential(signingId: string, participantId: string) {
      const { data } = await admin.from("signing_participant_credentials").select("id")
        .eq("signing_id", signingId).eq("signing_participant_id", participantId)
        .eq("is_current", true).is("revoked_at", null).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    }
    async function inviteLink(signingId: string, participantId: string) {
      const credentialId = await currentCredential(signingId, participantId);
      if (!credentialId) fail("participant has no current credential");
      const raw = await loadRawParticipantCredentialToken({ admin, signingId, credentialId });
      const built = new URL(buildParticipantInviteUrl(credentialId, raw!));
      return `${APP_ORIGIN}${built.pathname}${built.hash}`;
    }
    /** Server ceremony: affirm identity and accept consent; returns the ceremony cookie value. */
    async function openCeremony(signingId: string, participantId: string) {
      const credentialId = await currentCredential(signingId, participantId);
      const raw = await loadRawParticipantCredentialToken({ admin, signingId, credentialId: credentialId! });
      const resolved = await validateParticipantCredential(admin, raw!);
      const entry = await createSigningEntrySession({ admin, credential: resolved! });
      const affirmed = await affirmIdentityFromEntrySession({ admin, rawEntrySessionToken: entry.rawSessionToken });
      const session = await requireCeremonyBrowserSession(admin, affirmed.cookie.value);
      const ceremony = await requireCeremonyWriteContext({ admin, session });
      const disclosure = await loadCurrentConsentDisclosure(admin);
      await acceptConsent({ admin, context: ceremony, disclosureVersionId: disclosure.id });
      return { cookie: affirmed.cookie.value, session, ceremony };
    }
    async function signatureFieldId(ceremony: Awaited<ReturnType<typeof requireCeremonyWriteContext>>) {
      const { data: field } = await admin.from("signing_fields").select("id")
        .eq("signing_id", ceremony.session.signingId)
        .eq("package_revision_id", ceremony.packageRevisionId)
        .eq("package_revision_participant_id", ceremony.revisionParticipantId)
        .eq("field_type", "SIGNATURE").single();
      if (!field) fail("no signature field for participant");
      return field.id as string;
    }
    async function signField(_signingId: string, participant: { id: string; name: string }, opened: Awaited<ReturnType<typeof openCeremony>>) {
      await adoptCeremonyMark({ admin, context: opened.ceremony, markKind: "SIGNATURE", representationType: "TYPED", typedText: participant.name });
      await acceptFieldPlacement({ admin, context: opened.ceremony, signingFieldId: await signatureFieldId(opened.ceremony), clientRequestId: randomUUID() });
    }
    async function participantContext(cookie?: string): Promise<{ context: BrowserContext; participant: Page }> {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      if (cookie) {
        await context.addCookies([{
          name: SIGNING_CEREMONY_COOKIE_NAME, value: cookie, domain: new URL(APP_ORIGIN).hostname,
          path: SIGNING_CEREMONY_COOKIE_PATH, httpOnly: true, secure: false, sameSite: "Lax",
        }]);
      }
      return { context, participant: await context.newPage() };
    }
    async function expectOldLinkRefused(link: string, label: string) {
      const { context, participant } = await participantContext();
      const exchange = participant.waitForResponse((response) => response.url().endsWith("/api/sign/entry-exchange"));
      await participant.goto(link, { waitUntil: "domcontentloaded" });
      if ((await exchange).status() !== 503) fail(`${label}: old link exchange was not refused`);
      await participant.getByText("Signing access is currently unavailable. Please request a new link from the sender.").waitFor({ timeout: 30000 });
      await shot(participant, label);
      await context.close();
      ok(`${label}: old signing link refused (unavailable message, no session)`);
    }
    async function expectCeremonyGone(target: Page, label: string) {
      await target.goto(`${APP_ORIGIN}/sign/ceremony`, { waitUntil: "networkidle" });
      const redirected = /\/sign\/unavailable/.test(target.url());
      const endedCard = await target.getByText("This signing session is no longer active").isVisible().catch(() => false);
      if (!redirected && !endedCard) fail(`${label}: ceremony still reachable (${target.url()})`);
      if (await target.getByRole("button", { name: /^Finish/ }).count()) fail(`${label}: ceremony controls still rendered`);
      await shot(target, label);
      ok(`${label}: the open ceremony page no longer works (${redirected ? "redirected to /sign/unavailable" : "session-ended message, no ceremony controls"})`);
    }
    async function signingRow(signingId: string) {
      const { data } = await admin.from("signings")
        .select("lifecycle_state, archived_at, frozen_package_revision_id, current_package_revision_id, completed_at, title")
        .eq("id", signingId).single();
      return data!;
    }
    async function activeCredentialCount(signingId: string) {
      const { count } = await admin.from("signing_participant_credentials").select("id", { count: "exact", head: true })
        .eq("signing_id", signingId).eq("is_current", true).is("revoked_at", null);
      return count ?? 0;
    }
    const dialog = () => page.getByRole("alertdialog");
    async function openDashboard(signingId: string) {
      await page.goto(`${APP_ORIGIN}/signings/${signingId}`, { waitUntil: "networkidle" });
      await page.getByRole("heading").first().waitFor({ timeout: 60000 });
    }
    async function archiveFromDashboard(expectTitle: string) {
      await page.getByRole("button", { name: "Archive Signing", exact: true }).click();
      await dialog().getByText(expectTitle, { exact: true }).waitFor();
      await dialog().getByRole("button", { name: "Archive Signing", exact: true }).click();
      await page.getByTestId("signing-archived-notice").waitFor({ timeout: 30000 });
      await dialog().waitFor({ state: "detached", timeout: 10000 });
    }
    async function unarchiveFromDashboard() {
      await page.getByRole("button", { name: "Unarchive Signing", exact: true }).click();
      await page.getByTestId("signing-archived-notice").waitFor({ state: "detached", timeout: 30000 });
      await page.getByRole("button", { name: "Archive Signing", exact: true }).waitFor();
    }
    const listRow = (title: string) => page.locator("a", { hasText: title });
    async function expectListVisibility(title: string, archived: boolean, lifecycleLabel: string) {
      await page.goto(`${APP_ORIGIN}/signings`, { waitUntil: "networkidle" });
      await page.getByRole("checkbox", { name: "Show archived" }).waitFor({ timeout: 60000 });
      if (archived) {
        if ((await listRow(title).count()) !== 0) fail(`${title}: archived Signing shown by default`);
        await page.getByRole("checkbox", { name: "Show archived" }).click();
        await listRow(title).waitFor({ timeout: 10000 });
        if ((await listRow(title).getByTestId("signing-archived-badge").count()) !== 1) fail(`${title}: Archived badge missing`);
      } else {
        await listRow(title).waitFor({ timeout: 10000 });
        if ((await listRow(title).getByTestId("signing-archived-badge").count()) !== 0) fail(`${title}: unarchived row shows Archived`);
      }
      const badgeText = await listRow(title).innerText();
      if (!badgeText.includes(lifecycleLabel)) fail(`${title}: lifecycle badge ${lifecycleLabel} missing (${badgeText})`);
    }

    // ---------- manager sign-in ----------
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    await page.goto(`${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(link!.properties!.hashed_token)}&type=magiclink&next=${encodeURIComponent("/signings")}`, { waitUntil: "networkidle" });
    if (page.url().includes("/auth/")) fail("manager sign-in failed");

    // ---------- 1. Draft ----------
    {
      const draft = await buildDraft(`Archive QA Draft ${stamp}`, ["Dana Draft"]);
      const { count: fieldsBefore } = await admin.from("signing_draft_fields").select("id", { count: "exact", head: true }).eq("signing_id", draft.signingId);
      await openDashboard(draft.signingId);
      await page.getByRole("button", { name: "Archive Signing", exact: true }).click();
      await dialog().getByText("Archive this Signing?", { exact: true }).waitFor();
      await dialog().getByText("It will be hidden from the default Signings list. You can unarchive it later.").waitFor();
      await shot(page, "01-draft-archive-confirm");
      await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog().waitFor({ state: "detached" });
      if ((await signingRow(draft.signingId)).archived_at) fail("closing the dialog archived the Draft");
      await archiveFromDashboard("Archive this Signing?");
      await page.getByText("Unarchive this Signing to send it.").waitFor();
      if (!(await page.getByRole("button", { name: "Send", exact: true }).isDisabled())) fail("Send enabled on an archived Draft");
      await shot(page, "02-draft-archived");
      const archivedRow = await signingRow(draft.signingId);
      if (archivedRow.lifecycle_state !== "DRAFT" || !archivedRow.archived_at) fail("Draft archive DB state");
      ok("Draft: confirmation copy shown; Cancel leaves it unarchived; archive keeps DRAFT, shows Archived and disables Send");

      await expectListVisibility(draft.title, true, "DRAFT");
      await shot(page, "03-list-show-archived");
      ok("Signings list hides the archived Draft by default; Show archived reveals it with Archived + DRAFT badges");

      await openDashboard(draft.signingId);
      await page.getByTestId("signing-archived-badge").waitFor();
      ok("archived Draft stays reachable by direct URL");
      await unarchiveFromDashboard();
      if (await page.getByRole("button", { name: "Send", exact: true }).isDisabled()) fail("Send still disabled after unarchive");
      const { count: fieldsAfter } = await admin.from("signing_draft_fields").select("id", { count: "exact", head: true }).eq("signing_id", draft.signingId);
      if (fieldsAfter !== fieldsBefore) fail("Draft setup changed across archive/unarchive");
      await expectListVisibility(draft.title, false, "DRAFT");
      ok("Draft unarchived: Send enabled again, setup unchanged, back in the default list");
    }

    // ---------- 2. In Progress: partial signing + open ceremony session ----------
    let ipSigningId = "";
    {
      const ip = await buildDraft(`Archive QA In Progress ${stamp}`, ["Pat Partial", "Quinn Waiting"]);
      ipSigningId = ip.signingId;
      const [pat, quinn] = ip.participants;
      await activate(ip.signingId);
      const patCeremony = await openCeremony(ip.signingId, pat.id);
      await signField(ip.signingId, pat, patCeremony);
      const quinnOldLink = await inviteLink(ip.signingId, quinn.id);
      const { data: placementsBefore } = await admin.from("signing_field_placements").select("id, disposition, adopted_mark_id").eq("signing_id", ip.signingId);
      const before = await signingRow(ip.signingId);
      if (!before.frozen_package_revision_id || (placementsBefore ?? []).length !== 1) fail("partial signing fixture");

      const patBrowser = await participantContext(patCeremony.cookie);
      await patBrowser.participant.goto(`${APP_ORIGIN}/sign/ceremony`, { waitUntil: "networkidle" });
      if (!/\/sign\/ceremony/.test(patBrowser.participant.url())) fail("Pat's ceremony page did not open");
      await shot(patBrowser.participant, "10-pat-ceremony-open");
      ok("Pat accepted a Signature (package frozen) and has the ceremony open; Quinn has not started");

      await openDashboard(ip.signingId);
      await page.getByText("In Progress — participant access").waitFor();
      await page.getByRole("button", { name: "Archive Signing", exact: true }).click();
      await dialog().getByText("Archive this In Progress Signing?", { exact: true }).waitFor();
      await dialog().getByText(
        "It will remain In Progress in its history, but all active participant signing links will be revoked. If you later unarchive it, you will need to issue new participant links before signing can resume.",
      ).waitFor();
      await shot(page, "11-in-progress-archive-confirm");
      await dialog().getByRole("button", { name: "Keep Signing Active", exact: true }).click();
      await dialog().waitFor({ state: "detached" });
      if ((await activeCredentialCount(ip.signingId)) !== 2 || (await signingRow(ip.signingId)).archived_at) {
        fail("Keep Signing Active changed something");
      }
      ok("In Progress confirmation shows the agreed copy; Keep Signing Active changes nothing");

      await archiveFromDashboard("Archive this In Progress Signing?");
      await page.getByText("Participant access was revoked when this Signing was archived. Unarchiving does not restore previous signing links.").waitFor();
      if ((await page.getByText("In Progress — participant access").count()) !== 0) fail("link controls still offered while archived");
      await page.getByRole("button", { name: "Cancel Signing", exact: true }).waitFor();
      await page.getByText("IN PROGRESS", { exact: true }).first().waitFor();
      await shot(page, "12-in-progress-archived");
      const archived = await signingRow(ip.signingId);
      const { data: placementsAfter } = await admin.from("signing_field_placements").select("id, disposition, adopted_mark_id").eq("signing_id", ip.signingId);
      const { data: patRow } = await admin.from("signing_participants").select("participant_status").eq("id", pat.id).single();
      if (archived.lifecycle_state !== "IN_PROGRESS" || !archived.archived_at) fail("In Progress archive DB state");
      if ((await activeCredentialCount(ip.signingId)) !== 0) fail("active credential after archive");
      if (archived.frozen_package_revision_id !== before.frozen_package_revision_id) fail("package revision changed");
      if (JSON.stringify(placementsAfter) !== JSON.stringify(placementsBefore)) fail("accepted placement changed");
      if (patRow?.participant_status !== "STARTED") fail("Pat's progress changed");
      ok("archived: lifecycle IN PROGRESS + Archived; warning shown; link controls hidden; Cancel still offered; DB: no active credential, revision, accepted mark and progress unchanged");

      await expectCeremonyGone(patBrowser.participant, "13-pat-session-revoked");
      await patBrowser.context.close();
      await expectOldLinkRefused(quinnOldLink, "14-quinn-old-link-archived");
      await expectListVisibility(ip.title, true, "IN PROGRESS");
      ok("list shows Archived + IN PROGRESS only with Show archived");

      await openDashboard(ip.signingId);
      await unarchiveFromDashboard();
      await page.getByText("Signing unarchived. Previous signing links stay revoked. Issue new participant links before signing can resume.").waitFor();
      await page.getByTestId("signing-reissue-notice").waitFor();
      await page.getByText("In Progress — participant access").waitFor();
      if ((await page.getByText(/^Link revoked when the Signing was archived /).count()) !== 2) fail("link history does not say the links were revoked on archive");
      await shot(page, "15-unarchived-reissue");
      if ((await activeCredentialCount(ip.signingId)) !== 0) fail("unarchive restored a credential");
      await expectOldLinkRefused(quinnOldLink, "16-quinn-old-link-after-unarchive");
      {
        const stale = await participantContext(patCeremony.cookie);
        await expectCeremonyGone(stale.participant, "17-pat-old-session-after-unarchive");
        await stale.context.close();
      }
      ok("unarchive: IN PROGRESS, reissue notice shown, links listed as revoked on archive; old link and old session still refused");

      // Replace Quinn through the UI; the new link works in a real browser.
      const quinnPanel = page.locator("div.rounded-lg.border", { has: page.getByText("Quinn Waiting", { exact: true }) }).first();
      await quinnPanel.getByRole("button", { name: "Replace signing link" }).click();
      await dialog().getByRole("button", { name: "Replace signing link" }).click();
      await quinnPanel.getByTestId("participant-link-status").getByText("Signing link replaced.").waitFor({ timeout: 30000 });
      await quinnPanel.getByRole("button", { name: "Copy signing link" }).click();
      await quinnPanel.getByText("Signing link copied.").waitFor({ timeout: 30000 });
      const quinnNewLink = (await page.evaluate(() => navigator.clipboard.readText())).replace(/^https?:\/\/[^/]+/, APP_ORIGIN);
      if (quinnNewLink === quinnOldLink) fail("Replace returned the old link");
      {
        const { context, participant } = await participantContext();
        noise.watch(participant, "quinn-new-link");
        await participant.goto(quinnNewLink, { waitUntil: "networkidle" });
        await participant.getByRole("button", { name: "I am Quinn Waiting" }).waitFor({ timeout: 60000 });
        await shot(participant, "18-quinn-replacement-link");
        await context.close();
      }
      ok("Replace after unarchive issued a new link that reaches identity affirmation");

      // Replace Pat and finish: the accepted mark from before the archive still counts.
      const patPanel = page.locator("div.rounded-lg.border", { has: page.getByText("Pat Partial", { exact: true }) }).first();
      await patPanel.getByRole("button", { name: "Replace signing link" }).click();
      await dialog().getByRole("button", { name: "Replace signing link" }).click();
      await patPanel.getByTestId("participant-link-status").getByText("Signing link replaced.").waitFor({ timeout: 30000 });
      const patResumed = await openCeremony(ip.signingId, pat.id);
      const finished = await finishParticipantSigning({ admin, session: patResumed.session });
      if (finished.allParticipantsFinished) fail("Signing finished with Quinn outstanding");
      const { data: patFinished } = await admin.from("signing_participants").select("participant_status").eq("id", pat.id).single();
      if (patFinished?.participant_status !== "FINISHED") fail("Pat could not finish after Replace");
      ok("Pat resumed with a replacement link and finished using the Signature accepted before the archive");
    }

    // ---------- 3. Archive while Quinn is mid-ceremony, then Cancel while archived ----------
    {
      const quinnId = (await admin.from("signing_participants").select("id").eq("signing_id", ipSigningId).eq("full_name", "Quinn Waiting").single()).data!.id as string;
      const quinnCeremony = await openCeremony(ipSigningId, quinnId);
      const quinnBrowser = await participantContext(quinnCeremony.cookie);
      await quinnBrowser.participant.goto(`${APP_ORIGIN}/sign/ceremony`, { waitUntil: "networkidle" });
      if (!/\/sign\/ceremony/.test(quinnBrowser.participant.url())) fail("Quinn's ceremony did not open");
      const quinnFieldId = await signatureFieldId(quinnCeremony.ceremony);
      await openDashboard(ipSigningId);
      await archiveFromDashboard("Archive this In Progress Signing?");
      let writeRefused = false;
      try {
        await adoptCeremonyMark({ admin, context: quinnCeremony.ceremony, markKind: "SIGNATURE", representationType: "TYPED", typedText: "Quinn Waiting" });
        await acceptFieldPlacement({ admin, context: quinnCeremony.ceremony, signingFieldId: quinnFieldId, clientRequestId: randomUUID() });
      } catch {
        writeRefused = true;
      }
      if (!writeRefused) fail("a ceremony write landed after archive committed");
      const { count: quinnPlacements } = await admin.from("signing_field_placements").select("id", { count: "exact", head: true })
        .eq("signing_id", ipSigningId).eq("signing_participant_id", quinnId);
      if ((quinnPlacements ?? 0) !== 0) fail("Quinn's placement was accepted after archive");
      await expectCeremonyGone(quinnBrowser.participant, "20-quinn-mid-ceremony-revoked");
      await quinnBrowser.context.close();
      ok("archive while Quinn is mid-ceremony: her next write is refused, nothing lands, and her page stops working");

      const archivedAt = (await signingRow(ipSigningId)).archived_at;
      await page.getByRole("button", { name: "Cancel Signing", exact: true }).click();
      await dialog().getByRole("button", { name: "Cancel Signing", exact: true }).click();
      await page.getByText("CANCELLED", { exact: true }).first().waitFor({ timeout: 30000 });
      await page.getByTestId("signing-archived-badge").waitFor();
      const cancelled = await signingRow(ipSigningId);
      if (cancelled.lifecycle_state !== "CANCELLED" || cancelled.archived_at !== archivedAt) fail("Cancel while archived");
      await shot(page, "21-cancelled-while-archived");
      ok("Cancel reachable while archived: Signing becomes CANCELLED and stays Archived");
      await unarchiveFromDashboard();
      await expectListVisibility(`Archive QA In Progress ${stamp}`, false, "CANCELLED");
      ok("Cancelled: unarchive restores it to the default list as CANCELLED");
    }

    // ---------- 4. Complete: artifacts unchanged and downloadable while archived ----------
    {
      const done = await buildDraft(`Archive QA Complete ${stamp}`, ["Casey Complete"]);
      await activate(done.signingId);
      const opened = await openCeremony(done.signingId, done.participants[0].id);
      await signField(done.signingId, done.participants[0], opened);
      const finished = await finishParticipantSigning({ admin, session: opened.session });
      if (!finished.allParticipantsFinished) fail("Complete fixture did not finish");
      const finalization = await processNextFinalizationWorkItem({ admin, signingId: done.signingId });
      if (finalization.status !== "COMPLETED") fail(`finalization ${finalization.status}`);
      const combined = await processNextCombinedPackageWorkItem({ admin, signingId: done.signingId });
      if (combined.status !== "COMPLETED") fail(`combined ${combined.status}`);
      const artifactsQuery = () => admin.from("signing_artifacts")
        .select("id, artifact_category, content_sha256, storage_object_key, verified_at")
        .eq("signing_id", done.signingId).order("id");
      const { data: artifactsBefore } = await artifactsQuery();
      if ((artifactsBefore ?? []).length < 3) fail("expected document, certificate and combined package");
      const before = await signingRow(done.signingId);

      async function fetchAll(label: string) {
        const results: Record<string, { status: number; disposition: string; hash: string }> = {};
        for (const artifact of artifactsBefore ?? []) {
          for (const download of [false, true]) {
            const response = await managerContext.request.get(
              `${APP_ORIGIN}/signings/${done.signingId}/completed/${artifact.id}${download ? "?download=1" : ""}`,
            );
            const body = await response.body();
            if (response.status() !== 200) fail(`${label}: ${artifact.artifact_category} ${download ? "Download" : "View"} ${response.status()}`);
            if (sha256(body) !== artifact.content_sha256) fail(`${label}: ${artifact.artifact_category} bytes differ from the recorded SHA-256`);
            results[`${artifact.id}:${download}`] = {
              status: response.status(),
              disposition: response.headers()["content-disposition"] ?? "",
              hash: sha256(body),
            };
          }
        }
        return results;
      }
      const servedBefore = await fetchAll("before archive");

      await openDashboard(done.signingId);
      await page.getByTestId("completed-documents").waitFor({ timeout: 60000 });
      await archiveFromDashboard("Archive this Signing?");
      await page.getByTestId("signing-archived-notice").getByText("It is hidden from the default Signings list.").waitFor();
      await page.getByTestId("completed-documents").waitFor();
      const rows = await page.getByTestId("completed-documents").locator("li[data-completed-artifact]").count();
      if (rows !== (artifactsBefore ?? []).length) fail(`completed rows while archived: ${rows}`);
      await shot(page, "30-complete-archived");
      const servedArchived = await fetchAll("while archived");
      if (JSON.stringify(servedArchived) !== JSON.stringify(servedBefore)) fail("View/Download filenames or bytes changed while archived");
      {
        const viewButton = page.getByTestId("completed-documents").getByRole("button", { name: /^View / }).first();
        await viewButton.click();
        const viewer = page.getByTestId("completed-document-viewer");
        await viewer.locator("[data-completed-page] canvas").first().waitFor({ timeout: 60000 });
        await page.keyboard.press("Escape");
        await viewer.waitFor({ state: "detached" });
      }
      const { data: artifactsArchived } = await artifactsQuery();
      const archivedRow = await signingRow(done.signingId);
      if (JSON.stringify(artifactsArchived) !== JSON.stringify(artifactsBefore)) fail("artifact rows changed on archive");
      if (archivedRow.completed_at !== before.completed_at || archivedRow.lifecycle_state !== "COMPLETE") fail("Complete Signing changed on archive");
      ok("Complete archived: all completed documents, certificate and combined package still View/Download in the browser with identical filenames, bytes and SHA-256; artifact rows and completed_at unchanged");

      await expectListVisibility(done.title, true, "COMPLETE");
      await openDashboard(done.signingId);
      await unarchiveFromDashboard();
      const servedAfter = await fetchAll("after unarchive");
      const { data: artifactsAfter } = await artifactsQuery();
      if (JSON.stringify(servedAfter) !== JSON.stringify(servedBefore) || JSON.stringify(artifactsAfter) !== JSON.stringify(artifactsBefore)) {
        fail("artifacts changed after unarchive");
      }
      ok("Complete unarchived: artifacts, hashes and filenames unchanged");
    }

    // ---------- 5. Declined (lighter) ----------
    {
      const declined = await buildDraft(`Archive QA Declined ${stamp}`, ["Drew Decline"]);
      await activate(declined.signingId);
      const opened = await openCeremony(declined.signingId, declined.participants[0].id);
      await declineSigning({ admin, session: opened.session, reason: "QA", confirmed: true });
      if ((await signingRow(declined.signingId)).lifecycle_state !== "DECLINED") fail("Declined fixture");
      await openDashboard(declined.signingId);
      await archiveFromDashboard("Archive this Signing?");
      await page.getByText("DECLINED", { exact: true }).first().waitFor();
      await shot(page, "40-declined-archived");
      if ((await signingRow(declined.signingId)).lifecycle_state !== "DECLINED") fail("Declined lifecycle changed");
      await expectListVisibility(declined.title, true, "DECLINED");
      await openDashboard(declined.signingId);
      await unarchiveFromDashboard();
      ok("Declined: archive and unarchive keep DECLINED; list badge shows Archived + DECLINED while archived");
    }

    const issues = noise.issues();
    if (issues.length) fail(`unexpected runtime errors/warnings:\n${issues.join("\n")}`);
    ok("no browser console errors/warnings, page errors, or dev server errors/warnings");
    console.log("\nArchive Signing browser QA: all checks passed.");
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
    // Archived In Progress rows refuse evidence updates; clear the flag first.
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
