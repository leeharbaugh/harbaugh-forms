/**
 * Browser QA: In Progress participant access (PR #46 QA pass 8).
 *
 * Disposable development fixtures only (own user, Packet, Draft Signing sent
 * from the Draft page with the development email sandbox); cleaned up in `finally`.
 * Development Copy / Open signing link: the copied URL is the current
 * credential's invitation URL (shape checked, secret never printed), opens the
 * participant flow without workspace login, changes on Replace (old link
 * refused), is unchanged by Resend, and the controls disappear on Revoke.
 * Proves in a real browser that Replace / Revoke ask for confirmation, show
 * inline status next to the participant, update link status without a manual
 * reload, never display credential ids or provider references, and that the
 * database matches (Replace: new credential; Resend: same; Revoke: none).
 *
 *   NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-signing-link-ops-browser.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { addDraftSigningDocumentWithActor } from "../lib/signing/draft-documents.ts";
import { addDraftSigningParticipantWithActor } from "../lib/signing/draft-participants.ts";
import { upsertDraftSigningFieldWithActor } from "../lib/signing/draft-fields.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";
import { createRuntimeNoiseGuard } from "./qa-runtime-noise.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const OUT_DIR = path.join("_audit_tmp", "signing-link-ops-qa");
const GENERATED_DOCUMENTS_BUCKET = "generated-documents";
const SIGNING_ARTIFACTS_BUCKET = "signing-artifacts";

class QaFailure extends Error {}
function fail(message: string): never {
  throw new QaFailure(message);
}
function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function shot(page: Page, name: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  ok(`screenshot ${file}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url.includes(EXPECTED_REF)) fail(`Refusing outside development: ${url}`);
  if (process.env.SIGNING_EMAIL_SANDBOX?.trim() !== "true") {
    fail("SIGNING_EMAIL_SANDBOX=true is required so no real email is sent");
  }
  const admin: SupabaseClient = createClient(
    url,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const stamp = Date.now();
  const email = `link-ops-qa-${stamp}@example.com`;
  let userId = "";
  let organizationId = "";
  let packetId = 0;
  let packetFormId = 0;
  let generatedPath = "";
  let signingId = "";
  let participantId = "";

  const browser = await chromium.launch({ headless: true });
  const managerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await managerContext.newPage();
  const noise = createRuntimeNoiseGuard();
  noise.watch(page, "manager");

  async function credentials() {
    const { data, error } = await admin
      .from("signing_participant_credentials")
      .select("id, is_current, revoked_at, revoked_reason")
      .eq("signing_id", signingId)
      .eq("signing_participant_id", participantId);
    if (error) fail(error.message);
    return data ?? [];
  }
  const currentIds = async () =>
    (await credentials()).filter((row) => row.is_current && !row.revoked_at).map((row) => row.id as string);
  async function instructionCount() {
    const { count } = await admin
      .from("signing_delivery_instructions")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", signingId);
    return count ?? 0;
  }
  async function assertNoSecrets(label: string) {
    const text = await page.locator("body").innerText();
    const html = await page.content();
    for (const row of await credentials()) {
      if (text.includes(row.id as string) || html.includes(row.id as string)) {
        fail(`${label}: page exposes a credential id`);
      }
    }
    if (/sandbox:|token_hash|token_wrapped|\/sign\?|\/sign\//.test(text)) {
      fail(`${label}: page exposes a provider reference or signing link`);
    }
    if (/delivered/i.test(text)) fail(`${label}: page claims delivery`);
  }
  const panel = () =>
    page.locator("div.rounded-lg.border", { has: page.getByText("Pat Participant", { exact: true }) }).first();

  try {
    const { data: org } = await admin
      .from("organizations")
      .insert({ name: `Link Ops QA ${stamp}`, status: "ACTIVE" })
      .select("id")
      .single();
    organizationId = org!.id as string;
    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email,
      password: `LinkOpsQa-${randomUUID()}!aA1`,
      email_confirm: true,
    });
    if (userError || !created.user) fail(userError?.message ?? "user");
    userId = created.user.id;
    await admin.from("profiles").upsert({
      id: userId,
      email,
      status: "ACTIVE",
      app_role: "USER",
      onboarding_status: "ACTIVE",
      display_name: "Link Ops QA Agent",
      first_name: "Link",
      last_name: "Ops",
      primary_organization_id: organizationId,
      must_change_password: false,
    });
    await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: userId,
      membership_role: "MEMBER",
      status: "ACTIVE",
    });
    const { data: packet } = await admin
      .from("packets")
      .insert({ owner_user_id: userId, label: `Link QA Packet ${stamp}`, status: "ACTIVE", packet_type: "custom" })
      .select("id")
      .single();
    packetId = packet!.id as number;
    const { data: form } = await admin
      .from("packet_forms")
      .insert({
        packet_id: packetId,
        form_id: null,
        status: "ACTIVE",
        document_state: "DRAFT",
        availability_state: "AVAILABLE",
        document_name: "Link QA Contract",
        document_type: "PDF",
        origin: "external_upload",
        sort_order: 1,
        is_required: false,
        field_data: {},
        owner_user_id: userId,
      })
      .select("id")
      .single();
    packetFormId = form!.id as number;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([612, 792]).drawText("Link QA Contract", { x: 72, y: 720, size: 18, font });
    generatedPath = `users/${userId}/packets/${packetId}/${packetFormId}-link-qa.pdf`;
    await admin.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .upload(generatedPath, await doc.save(), { contentType: "application/pdf" });
    await admin.from("packet_forms").update({ storage_path: generatedPath }).eq("id", packetFormId);

    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    const actor: SigningActor = {
      userId,
      email,
      displayName: "Link Ops QA Agent",
      profile: profile as Profile,
      memberships: [
        { organizationId, membershipRole: "MEMBER", membershipStatus: "ACTIVE", organizationStatus: "ACTIVE" },
      ],
    };
    const signing = await createDraftSigningWithActor(
      actor,
      { title: `Link Ops QA ${stamp}`, sourcePacketId: packetId },
      admin,
    );
    signingId = signing.id;
    const signingDoc = await addDraftSigningDocumentWithActor(
      actor,
      { signingId, sourcePacketFormId: packetFormId },
      admin,
    );
    const participant = await addDraftSigningParticipantWithActor(
      actor,
      { signingId, fullName: "Pat Participant", email: `pat-${stamp}@example.com` },
      admin,
    );
    participantId = participant.id;
    const signature = await upsertDraftSigningFieldWithActor(
      actor,
      {
        signingId,
        signingDocumentId: signingDoc.id,
        signingParticipantId: participantId,
        fieldType: "SIGNATURE",
        pageNumber: 1,
        x: 72,
        y: 640,
        width: 160,
        height: 40,
      },
      admin,
    );
    await upsertDraftSigningFieldWithActor(
      actor,
      {
        signingId,
        signingDocumentId: signingDoc.id,
        signingParticipantId: participantId,
        fieldType: "DATE_SIGNED",
        pageNumber: 1,
        x: 250,
        y: 656,
        width: 54,
        height: 17,
        linkedSignatureDraftFieldId: signature.id,
      },
      admin,
    );
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link.properties?.hashed_token) fail("generateLink failed");
    await page.goto(
      `${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent("/signings")}`,
      { waitUntil: "networkidle" },
    );
    if (page.url().includes("/auth/")) fail(`auth failed: ${page.url()}`);
    await page.getByText(`Link Ops QA ${stamp}`).first().waitFor({ timeout: 60000 });
    ok("Signings list loaded with the Draft Signing");

    // Send through the real Draft page and confirmation (sandboxed invitation).
    await page.goto(`${APP_ORIGIN}/signings/${signingId}`, { waitUntil: "networkidle" });
    const sendButton = page.getByRole("button", { name: "Send", exact: true });
    await sendButton.waitFor({ timeout: 60000 });
    if (!(await sendButton.isEnabled())) fail("Send is disabled for a ready Draft");
    await sendButton.click();
    const sendDialog = page.getByRole("alertdialog");
    await sendDialog.getByText("Send this Signing?").waitFor();
    await sendDialog.getByRole("button", { name: "Send", exact: true }).click();
    await page.getByText("In Progress — participant access").waitFor({ timeout: 90000 });
    ok("Draft page Send confirmation activated the Signing (REMOTE_SEND, sandboxed invitation)");
    await page.evaluate(() => {
      (window as unknown as { __qaNoReload?: boolean }).__qaNoReload = true;
    });
    const linkState = panel().locator('[data-testid="participant-link-state"]');
    if ((await linkState.innerText()).trim() !== "Active link") fail("initial link state is not Active link");
    await panel().getByText("Invitation accepted by the development email sandbox (not sent)").first().waitFor();
    await page
      .getByText("Email delivery is sandboxed in development. Use Copy signing link to test the participant ceremony.")
      .waitFor();
    await panel().getByRole("button", { name: "Copy signing link" }).waitFor();
    await panel().getByRole("button", { name: "Open signing link" }).waitFor();
    await assertNoSecrets("initial");
    await shot(page, "01-in-progress-access");
    ok("panel shows Active link, honest sandbox status, the sandbox note, and Copy / Open signing link");

    // Copy signing link: the exact current invitation URL, never in the page at rest.
    const status = panel().locator('[data-testid="participant-link-status"]');
    async function copySigningLink(label: string): Promise<string> {
      await page.evaluate(() => navigator.clipboard.writeText(""));
      await panel().getByRole("button", { name: "Copy signing link" }).click();
      await status.getByText("Signing link copied.").waitFor({ timeout: 30000 });
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      const [currentId] = await currentIds();
      const parsed = new URL(copied);
      if (
        parsed.pathname !== `/sign/${currentId}` ||
        !/^#[A-Za-z0-9_-]{43}$/.test(parsed.hash) ||
        parsed.search !== ""
      ) {
        fail(`${label}: copied link is not /sign/{current credential}#<secret>`);
      }
      const html = await page.content();
      if (html.includes(parsed.hash.slice(1)) || html.includes(copied)) {
        fail(`${label}: the copied link is present in the page`);
      }
      ok(`${label}: copied link has shape /sign/{current credential id}#<43-char secret> (secret not printed); not in page HTML`);
      return copied;
    }
    async function openAsParticipant() {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const participant = await context.newPage();
      return { context, participant };
    }
    async function expectEntryWorks(link: string, label: string, affirm: boolean) {
      const { context, participant } = await openAsParticipant();
      noise.watch(participant, "participant");
      await participant.goto(link, { waitUntil: "networkidle" });
      const entryPath = new URL(link).pathname;
      await participant
        .waitForURL((current) => current.pathname !== entryPath, { timeout: 60000 })
        .catch(async () => {
          await shot(participant, `${label}-entry-stuck`);
          fail(`${label}: participant entry stayed on the entry page`);
        });
      await participant.waitForLoadState("networkidle");
      const landed = new URL(participant.url()).pathname;
      if (landed.startsWith("/auth/")) fail(`${label}: participant was sent to workspace login`);
      if (!/^\/sign\/(continue|ceremony)/.test(landed)) fail(`${label}: link landed on ${landed}`);
      await participant.getByRole("button", { name: "I am Pat Participant" }).waitFor({ timeout: 30000 });
      await shot(participant, `${label}-identity`);
      ok(`${label}: link reached ${landed} without workspace login; identity affirmation shown`);
      if (affirm) {
        await participant.getByRole("button", { name: "I am Pat Participant" }).click();
        await participant.waitForURL(/\/sign\/ceremony/, { timeout: 60000 });
        await participant.waitForLoadState("networkidle");
        await participant.waitForTimeout(1500);
        await shot(participant, `${label}-ceremony`);
        ok(`${label}: identity affirmation opened the ceremony`);
      }
      await context.close();
    }

    const firstLink = await copySigningLink("copy");
    await expectEntryWorks(firstLink, "05-first-link", true);

    // Open signing link: requested on click and opened in a new tab.
    const [opened] = await Promise.all([
      managerContext.waitForEvent("page", { timeout: 30000 }),
      panel().getByRole("button", { name: "Open signing link" }).click(),
    ]);
    noise.watch(opened, "opened-tab");
    await status.getByText("Signing link opened in a new tab.").waitFor({ timeout: 30000 });
    await opened.waitForURL((current) => current.pathname.startsWith("/sign/"), { timeout: 60000 });
    await opened.getByRole("button", { name: "I am Pat Participant" }).waitFor({ timeout: 60000 });
    const openerVisible = await opened.evaluate(() => window.opener !== null);
    if (openerVisible) fail("Open signing link tab can reach window.opener");
    await opened.close();
    ok("Open signing link opened the participant link in a new tab (no opener) and reached identity affirmation");

    // Replace: confirmation, then inline status and updated history.
    const [originalId] = await currentIds();
    const instructionsBefore = await instructionCount();
    await panel().getByRole("button", { name: "Replace signing link" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByText("Replace signing link?").waitFor();
    await dialog
      .getByText("The participant\u2019s current link will stop working and a new signing link will be sent.")
      .waitFor();
    await shot(page, "02-replace-confirm");
    if ((await currentIds())[0] !== originalId) fail("opening the confirmation changed the credential");
    await dialog.getByRole("button", { name: "Replace signing link" }).click();
    await status.getByText("Signing link replaced.").waitFor({ timeout: 30000 });
    await status.getByText("The previous link no longer works. A new link has been queued for delivery.").waitFor();
    await status.getByText("Email delivery is sandboxed in development.").waitFor();
    await dialog.waitFor({ state: "detached", timeout: 10000 });
    await panel().getByText(/^Link replaced /).waitFor({ timeout: 10000 });
    if ((await linkState.innerText()).trim() !== "Active link") fail("link state after Replace");
    const afterReplace = await currentIds();
    const oldRow = (await credentials()).find((row) => row.id === originalId)!;
    if (afterReplace.length !== 1 || afterReplace[0] === originalId) fail("Replace did not issue a new current credential");
    if (oldRow.is_current || !oldRow.revoked_at || oldRow.revoked_reason !== "REPLACED_BY_MANAGER") {
      fail("Replace did not revoke the prior credential");
    }
    if ((await instructionCount()) !== instructionsBefore + 1) fail("Replace did not queue an invitation");
    await assertNoSecrets("after replace");
    await shot(page, "03-replaced");
    ok("Replace confirmed, inline success + sandbox note shown, Link replaced time listed; DB: old revoked, new current, invitation queued");

    // After Replace, Copy returns the new link; the old one no longer opens.
    const replacedLink = await copySigningLink("copy after Replace");
    if (replacedLink === firstLink) fail("Copy after Replace returned the replaced link");
    if (new URL(replacedLink).hash === new URL(firstLink).hash) fail("replacement link reuses the old secret");
    ok("link after Replace differs from the old link (compared in memory, not printed)");

    // Negative path: the replaced link must be refused (exchange answers 503 by
    // design, which Chrome reports as a console error), so this tab is checked
    // explicitly instead of through the runtime-noise guard.
    {
      const { context, participant } = await openAsParticipant();
      const exchange = participant.waitForResponse((response) =>
        response.url().endsWith("/api/sign/entry-exchange"),
      );
      await participant.goto(firstLink, { waitUntil: "domcontentloaded" });
      if ((await exchange).status() !== 503) fail("old link exchange was not refused");
      await participant
        .getByText("Signing access is currently unavailable. Please request a new link from the sender.")
        .waitFor({ timeout: 30000 });
      if (new URL(participant.url()).pathname !== new URL(firstLink).pathname) {
        fail("old link left the entry page");
      }
      await shot(participant, "06-old-link-refused");
      await context.close();
      ok("old link after Replace is refused (unavailable message, no session)");
    }
    await expectEntryWorks(replacedLink, "07-new-link", true);

    // Resend keeps the same credential and the same link.
    await panel().getByRole("button", { name: "Resend signing link" }).click();
    await status.getByText("Signing link resent.").waitFor({ timeout: 30000 });
    if ((await currentIds())[0] !== afterReplace[0]) fail("Resend changed the credential");
    if ((await instructionCount()) !== instructionsBefore + 2) fail("Resend did not queue an invitation");
    ok("Resend keeps the current credential and queues another invitation");
    if ((await copySigningLink("copy after Resend")) !== replacedLink) fail("Copy after Resend returned a different link");
    ok("link after Resend is unchanged");

    // Revoke: confirmation, no replacement, Revoked badge.
    await panel().getByRole("button", { name: "Revoke signing link" }).click();
    await dialog.getByText("Revoke signing link?").waitFor();
    await dialog.getByRole("button", { name: "Revoke signing link" }).click();
    await status.getByText("Signing link revoked.").waitFor({ timeout: 30000 });
    await status.getByText("The previous link no longer works. No new link was sent.").waitFor();
    await dialog.waitFor({ state: "detached", timeout: 10000 });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="participant-link-state"]')?.textContent?.trim() === "Revoked",
      undefined,
      { timeout: 10000 },
    );
    await panel().getByText(/^Link revoked /).waitFor();
    if ((await currentIds()).length !== 0) fail("Revoke left a current credential");
    if ((await instructionCount()) !== instructionsBefore + 2) fail("Revoke queued an invitation");
    if (!(await panel().getByRole("button", { name: "Resend signing link" }).isDisabled())) {
      fail("Resend must be disabled without an active link");
    }
    for (const name of ["Copy signing link", "Open signing link"]) {
      if ((await panel().getByRole("button", { name }).count()) !== 0) fail(`${name} still shown after Revoke`);
    }
    ok("Copy / Open signing link controls disappear after Revoke");
    await assertNoSecrets("after revoke");
    const noReload = await page.evaluate(
      () => (window as unknown as { __qaNoReload?: boolean }).__qaNoReload === true,
    );
    if (!noReload) fail("the page reloaded during link operations");
    await shot(page, "04-revoked");
    ok("Revoke confirmed, Revoked badge and time shown without reload; no replacement credential or invitation");
    const issues = noise.issues();
    if (issues.length > 0) fail(`unexpected runtime errors/warnings:\n${issues.join("\n")}`);
    ok("no browser console errors/warnings, page errors, or dev server errors/warnings");
    console.log("\nParticipant access browser QA: all checks passed.");
  } finally {
    await browser.close();
    if (signingId) {
      const keys: string[] = [];
      for (const [table, column] of [
        ["signing_draft_source_snapshots", "source_pdf_object_key"],
        ["signing_document_versions", "storage_object_key"],
      ] as const) {
        const { data } = await admin.from(table).select(column).eq("signing_id", signingId);
        for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
          if (row[column]) keys.push(row[column]!);
        }
      }
      if (keys.length > 0) await admin.storage.from(SIGNING_ARTIFACTS_BUCKET).remove(keys);
      for (const table of [
        "signing_delivery_attempts",
        "signing_delivery_instructions",
        "signing_work_items",
        "signing_entry_sessions",
        "signing_participant_presence_leases",
        "signing_browser_sessions",
      ]) {
        await admin.from(table).delete().eq("signing_id", signingId);
      }
      await admin.from("signing_participant_credentials").update({ replaced_by_credential_id: null }).eq("signing_id", signingId);
      for (const table of [
        "signing_participant_credentials",
        "signing_operation_idempotency",
        "signing_events",
        "signing_fields",
        "signing_package_revision_documents",
        "signing_package_revision_participants",
      ]) {
        await admin.from(table).delete().eq("signing_id", signingId);
      }
      await admin
        .from("signings")
        .update({ current_package_revision_id: null, frozen_package_revision_id: null })
        .eq("id", signingId);
      await admin
        .from("signing_document_versions")
        .update({ introduced_by_package_revision_id: null })
        .eq("signing_id", signingId);
      await admin.from("signing_document_versions").delete().eq("signing_id", signingId);
      await admin.from("signing_package_revisions").delete().eq("signing_id", signingId);
      await admin.from("signing_draft_fields").update({ linked_signature_draft_field_id: null }).eq("signing_id", signingId);
      await admin.from("signing_draft_fields").delete().eq("signing_id", signingId);
      await admin
        .from("signing_documents")
        .update({ selected_draft_source_snapshot_id: null, acknowledged_live_content_fingerprint: null })
        .eq("signing_id", signingId);
      await admin.from("signing_draft_source_snapshots").delete().eq("signing_id", signingId);
      await admin.from("signing_documents").delete().eq("signing_id", signingId);
      await admin.from("signing_participants").delete().eq("signing_id", signingId);
      await admin.from("signings").update({ current_primary_agent_association_id: null }).eq("id", signingId);
      await admin.from("signing_agent_associations").delete().eq("signing_id", signingId);
      const { error: signingDeleteError } = await admin.from("signings").delete().eq("id", signingId);
      if (signingDeleteError) console.log(`NOTE: Signing cleanup incomplete: ${signingDeleteError.message}`);
    }
    if (generatedPath) await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).remove([generatedPath]);
    if (packetFormId) await admin.from("packet_forms").update({ status: "DELETED" }).eq("id", packetFormId);
    if (packetId) await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    if (userId) {
      await admin.from("organization_members").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    console.log("Cleanup complete.");
  }
}

main().catch((error) => {
  const text = error instanceof QaFailure ? `FAIL: ${error.message}` : String(error?.stack ?? error);
  console.error(text.replace(/#[A-Za-z0-9_-]{43}/g, "#<redacted>"));
  process.exit(1);
});
