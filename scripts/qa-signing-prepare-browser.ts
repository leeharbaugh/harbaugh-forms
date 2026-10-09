/**
 * Browser QA: Draft Signing preparation (PR #46 QA pass 5).
 *
 * Disposable development fixtures only (own user, Packet, contacts, Signing);
 * cleaned up in `finally`. Proves in a real browser that selecting a Packet
 * populates participants, the Prepare Documents workspace is full-height, and
 * place / drag / resize / reassign / remove persist without a page reload,
 * PDF remount, or scroll reset.
 *
 * Draft-prep model tranche: Quick Fields are gone; ad hoc participants choose
 * a role (editable, survives reload); a Packet contact added after Signing
 * creation shows a notice and "Add from Packet" adds only it; Include me /
 * Include broker add real participants once; paste is click-to-anchor (Esc,
 * tool change cancel; no extra field); Date Signed links to chosen Initials;
 * Printed Name renders the current name; Checkmark has no participant; and
 * prepared content adds no participant requirement.
 *
 *   NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-signing-prepare-browser.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  DATE_SIGNED_DEFAULT_SIZE,
  defaultDraftFieldSize,
  defaultPreparedContentSize,
} from "../lib/signing/draft-field-sizing.ts";
import { createRuntimeNoiseGuard } from "./qa-runtime-noise.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const OUT_DIR = path.join("_audit_tmp", "signing-prepare-qa");
const GENERATED_DOCUMENTS_BUCKET = "generated-documents";
const SIGNING_ARTIFACTS_BUCKET = "signing-artifacts";
const LONG_NAME = "Lisa Ann Ellison Hernandez";
/** Buyer Rep-style printed lines on page 1 (PDF points, y from top). */
const PRINTED = {
  initials: { x: 470, width: 36, top: 740 },
  signatureA: { x: 110, width: 216, top: 560 },
  signatureB: { x: 110, width: 216, top: 640 },
  checkbox: { x: 72, top: 200, size: 12 },
  printedName: { x: 140, top: 260 },
};

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
  await page.screenshot({ path: file });
  ok(`screenshot ${file}`);
}

async function makePdf(label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 1; index <= 2; index += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${label} — page ${index}`, { x: 72, y: 720, size: 18, font });
    if (index !== 1) continue;
    const line = (x: number, width: number, top: number) =>
      page.drawLine({
        start: { x, y: 792 - top },
        end: { x: x + width, y: 792 - top },
        thickness: 0.75,
        color: rgb(0, 0, 0),
      });
    const text = (value: string, x: number, top: number) =>
      page.drawText(value, { x, y: 792 - top + 2, size: 9, font });
    for (const block of [PRINTED.signatureA, PRINTED.signatureB]) {
      text("Buyer", 72, block.top);
      line(block.x, block.width, block.top);
      text("Date", 340, block.top);
      line(368, 72, block.top);
    }
    text("Buyer Initials", 405, PRINTED.initials.top);
    line(PRINTED.initials.x, PRINTED.initials.width, PRINTED.initials.top);
    page.drawRectangle({
      x: PRINTED.checkbox.x,
      y: 792 - PRINTED.checkbox.top - PRINTED.checkbox.size,
      width: PRINTED.checkbox.size,
      height: PRINTED.checkbox.size,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.75,
    });
    text("Buyer elects this option", PRINTED.checkbox.x + 18, PRINTED.checkbox.top + 10);
    text("Printed name", 72, PRINTED.printedName.top);
    line(PRINTED.printedName.x, 200, PRINTED.printedName.top);
  }
  return doc.save();
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url.includes(EXPECTED_REF)) fail(`Refusing outside development: ${url}`);
  const admin: SupabaseClient = createClient(
    url,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const stamp = Date.now();
  const email = `prepare-qa-${stamp}@example.com`;
  let userId = "";
  let organizationId = "";
  let packetId = 0;
  let agreementId = 0;
  const formIds: number[] = [];
  const contactIds: number[] = [];
  const generatedPaths: string[] = [];
  let signingId = "";
  let brokerageSettingsId = 0;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const noise = createRuntimeNoiseGuard();
  noise.watch(page, "manager");

  async function draftFields() {
    const { data, error } = await admin
      .from("signing_draft_fields")
      .select("id, field_type, x, y, width, height, signing_participant_id, linked_signature_draft_field_id")
      .eq("signing_id", signingId);
    if (error) fail(error.message);
    return data ?? [];
  }

  async function preparedContent() {
    const { data, error } = await admin
      .from("signing_draft_prepared_content")
      .select("id, content_type, x, y, width, height, signing_participant_id")
      .eq("signing_id", signingId);
    if (error) fail(error.message);
    return data ?? [];
  }

  async function participantsInDb() {
    const { data, error } = await admin
      .from("signing_participants")
      .select("id, full_name, role_code, optional_role, linked_user_id, linked_contact_id, linked_brokerage_settings_id")
      .eq("signing_id", signingId);
    if (error) fail(error.message);
    return data ?? [];
  }

  /** Participant options carry the role ("Name — Role"); pick by name. */
  async function selectParticipant(selectId: string, name: string) {
    const select = page.locator(selectId);
    const value = await select.evaluate(
      (element, wanted) =>
        Array.from((element as HTMLSelectElement).options).find(
          (option) => option.text === wanted || option.text.startsWith(`${wanted} — `),
        )?.value ?? null,
      name,
    );
    if (!value) fail(`${selectId} has no option for ${name}`);
    await select.selectOption(value);
    return value;
  }

  async function waitSaved() {
    await page.waitForTimeout(300);
    await page.getByText("Saved", { exact: true }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
  }

  async function assertStable(label: string) {
    const state = await page.evaluate(() => ({
      noReload: (window as unknown as { __qaNoReload?: boolean }).__qaNoReload === true,
      canvasKept: document.querySelector('canvas[data-qa-stable="1"]') !== null,
    }));
    if (!state.noReload) fail(`${label}: page reloaded`);
    if (!state.canvasKept) fail(`${label}: PDF page remounted`);
    ok(`${label}: no reload, no PDF remount`);
  }

  try {
    const { data: org } = await admin
      .from("organizations")
      .insert({ name: `Prepare QA ${stamp}`, status: "ACTIVE" })
      .select("id")
      .single();
    organizationId = org!.id as string;
    const { data: brokerProfile, error: brokerError } = await admin
      .from("brokerage_settings")
      .insert({
        organization_id: organizationId,
        status: "ACTIVE",
        brokerage_name: `Prepare QA Realty ${stamp}`,
        broker_first_name: "Bob",
        broker_last_name: "Broker",
        broker_email: `broker-${stamp}@example.com`,
      })
      .select("id")
      .single();
    if (brokerError || !brokerProfile) fail(brokerError?.message ?? "broker profile");
    brokerageSettingsId = brokerProfile.id as number;
    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email,
      password: `PrepareQa-${randomUUID()}!aA1`,
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
      display_name: "Prepare QA Agent",
      first_name: "Prepare",
      last_name: "QA",
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
      .insert({
        owner_user_id: userId,
        label: `QA Packet ${stamp}`,
        status: "ACTIVE",
        packet_type: "custom",
      })
      .select("id")
      .single();
    packetId = packet!.id as number;
    for (let index = 1; index <= 2; index += 1) {
      const { data: form } = await admin
        .from("packet_forms")
        .insert({
          packet_id: packetId,
          form_id: null,
          status: "ACTIVE",
          document_state: "DRAFT",
          availability_state: "AVAILABLE",
          document_name: `QA Contract ${index}`,
          document_type: "PDF",
          origin: "external_upload",
          sort_order: index,
          is_required: false,
          field_data: {},
          owner_user_id: userId,
        })
        .select("id")
        .single();
      const formId = form!.id as number;
      formIds.push(formId);
      const storagePath = `users/${userId}/packets/${packetId}/${formId}-prepare-qa.pdf`;
      await admin.storage
        .from(GENERATED_DOCUMENTS_BUCKET)
        .upload(storagePath, await makePdf(`QA Contract ${index}`), {
          contentType: "application/pdf",
        });
      generatedPaths.push(storagePath);
      await admin.from("packet_forms").update({ storage_path: storagePath }).eq("id", formId);
    }
    // Same shape as the manager's failing Packet: a Buyer Rep Packet whose
    // parties live on its representation agreement, with no packet_contacts.
    const { data: agreement, error: agreementError } = await admin
      .from("representation_agreements")
      .insert({ agreement_type: "BUYER_REP", effective_date: "2026-06-09", owner_user_id: userId })
      .select("id")
      .single();
    if (agreementError || !agreement) fail(agreementError?.message ?? "agreement");
    agreementId = agreement.id as number;
    for (const [first, last, withEmail, sort] of [
      ["Lee", "Harbaugh", true, 0],
      ["Cal", "Cobuyer", false, 1],
    ] as const) {
      const { data: contact } = await admin
        .from("contacts")
        .insert({
          owner_user_id: userId,
          contact_type: "INDIVIDUAL",
          first_name: first,
          last_name: last,
          email: withEmail ? `lee-${stamp}@example.com` : null,
          status: "ACTIVE",
        })
        .select("id")
        .single();
      contactIds.push(contact!.id as number);
      await admin.from("representation_agreement_clients").insert({
        representation_agreement_id: agreementId,
        contact_id: contact!.id,
        sort_order: sort,
      });
    }
    await admin.from("packets").update({ representation_agreement_id: agreementId }).eq("id", packetId);

    // Sign in via one-time magic link and create a blank Signing in the UI.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !link.properties?.hashed_token) fail("generateLink failed");
    await page.goto(
      `${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(
        link.properties.hashed_token,
      )}&type=magiclink&next=${encodeURIComponent("/signings")}`,
      { waitUntil: "networkidle" },
    );
    if (page.url().includes("/auth/")) fail(`auth failed: ${page.url()}`);
    ok("signed in as disposable QA agent");

    const createButton = page.getByRole("button", { name: "Create Signing" }).first();
    await createButton.waitFor({ timeout: 60000 });
    await page.locator("#signing-title").fill(`Prepare QA ${stamp}`);
    await createButton.click();
    await page.waitForURL(/\/signings\/[0-9a-f-]{36}/, { timeout: 60000 });
    signingId = page.url().split("/signings/")[1].split(/[?#/]/)[0];
    ok(`blank Signing created ${signingId}`);

    // An ad hoc participant first; it must survive Packet selection.
    await page.getByRole("button", { name: "Use this Packet" }).waitFor({ timeout: 60000 });
    const participantList = page.locator('[data-testid="draft-participant-list"]');
    if ((await page.getByText("Add default fields").count()) !== 0 || (await page.getByText(/quick fields/i).count()) !== 0) {
      fail("Quick Fields / Add default fields must be gone");
    }
    ok("Quick Fields / Add default fields are gone");
    await page.locator("#participant-name").fill(LONG_NAME);
    const addParticipantButton = page.getByRole("button", { name: "Add participant", exact: true });
    if (await addParticipantButton.isEnabled()) fail("Add participant must require a role");
    await page.locator("#participant-role").selectOption("BUYER");
    await page.locator("#participant-role-label").fill("Co-buyer");
    await addParticipantButton.click();
    await participantList.getByText(LONG_NAME).waitFor({ timeout: 30000 });
    await participantList.getByText("Buyer · Co-buyer").waitFor({ timeout: 10000 });
    ok("ad hoc participant added before choosing a Packet, with role Buyer · Co-buyer");

    // Select the Packet: its parties appear under Participants immediately.
    await page.locator("#source-packet").selectOption(String(packetId));
    await page.getByRole("button", { name: "Use this Packet" }).click();
    await page.getByText(/Packet selected\. Added 2 participants/).waitFor({ timeout: 30000 });
    const listText = await participantList.innerText();
    for (const name of [LONG_NAME, "Lee Harbaugh", "Cal Cobuyer"]) {
      const count = listText.split(name).length - 1;
      if (count !== 1) fail(`${name} appears ${count} times under Participants: ${listText}`);
    }
    if (!listText.includes("No email")) fail("party without email must show No email");
    if ((await participantList.getByRole("button", { name: "Remove participant" }).count()) !== 3) {
      fail("each participant must keep Remove participant");
    }
    const sectionOrder = await page.evaluate(() => {
      const heading = document.getElementById("draft-participants-heading");
      const section = heading?.closest("section");
      const list = document.querySelector('[data-testid="draft-participant-list"]');
      const add = Array.from(section?.querySelectorAll("p") ?? []).find(
        (el) => el.textContent === "Add participant",
      );
      return Boolean(
        section && list && add && section.contains(list) &&
          add.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    if (!sectionOrder) fail("participant list must sit directly below Add participant in one section");
    const participantCards = await page.getByText("Participants", { exact: true }).count();
    if (participantCards !== 1) fail(`expected one Participants section, found ${participantCards}`);
    await page
      .locator("#source-packet")
      .waitFor({ state: "detached", timeout: 10000 })
      .catch(() => fail("Packet selector must not stay active once Packet parties exist"));
    await page.getByText(`#${packetId} · QA Packet ${stamp}`).waitFor();
    if ((await page.getByRole("button", { name: "Change Packet" }).count()) !== 0) {
      fail("Change Packet must be hidden once Packet parties exist");
    }
    await participantList.scrollIntoViewIfNeeded();
    await shot(page, "00-participants-after-packet");
    ok("Packet parties appeared immediately under Participants (no duplicates, ad hoc kept); selector locked");
    const { data: dbParticipants } = await admin
      .from("signing_participants")
      .select("full_name")
      .eq("signing_id", signingId);
    if ((dbParticipants ?? []).length !== 3) fail("database must hold exactly 3 participants");
    const packetRoles = (await participantsInDb()).filter((row) => row.linked_contact_id !== null);
    if (packetRoles.some((row) => !row.role_code)) {
      fail(`Packet participants must import a role: ${JSON.stringify(packetRoles)}`);
    }
    ok(`Packet participants imported with roles ${packetRoles.map((row) => `${row.full_name}=${row.role_code}`).join(", ")}`);

    // Buyer 3 joins the Packet after the Signing exists: explicit additive refresh.
    const beforeRefreshIds = (await participantsInDb()).map((row) => row.id).sort();
    const { data: buyer3 } = await admin
      .from("contacts")
      .insert({
        owner_user_id: userId,
        contact_type: "INDIVIDUAL",
        first_name: "Bea",
        last_name: "Buyerthree",
        email: `bea3-${stamp}@example.com`,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    contactIds.push(buyer3!.id as number);
    await admin.from("representation_agreement_clients").insert({
      representation_agreement_id: agreementId,
      contact_id: buyer3!.id,
      sort_order: 2,
    });
    await page.reload({ waitUntil: "networkidle" });
    const refreshNotice = page.locator('[data-testid="packet-new-participants"]');
    await refreshNotice.getByText("The source Packet has 1 new participant").waitFor({ timeout: 30000 });
    await refreshNotice.getByText(/Bea Buyerthree/).waitFor();
    if ((await participantsInDb()).length !== 3) fail("the refresh notice must not write participants");
    await shot(page, "00b-packet-refresh-notice");
    await refreshNotice.getByRole("button", { name: "Add from Packet" }).click();
    await participantList.getByText("Bea Buyerthree").waitFor({ timeout: 30000 });
    await refreshNotice.waitFor({ state: "detached", timeout: 10000 });
    const afterRefresh = await participantsInDb();
    if (
      afterRefresh.length !== 4 ||
      !beforeRefreshIds.every((id) => afterRefresh.some((row) => row.id === id))
    ) {
      fail(`refresh must add only Bea Buyerthree: ${JSON.stringify(afterRefresh)}`);
    }
    const adHocAfter = afterRefresh.find((row) => row.full_name === LONG_NAME);
    if (adHocAfter?.role_code !== "BUYER" || adHocAfter.optional_role !== "Co-buyer") {
      fail("refresh changed the ad hoc participant's role");
    }
    ok("Add from Packet added Buyer 3 only; ad hoc and existing participants untouched");

    // Quick include agent / broker.
    const signers = page.locator('[data-testid="internal-signers"]');
    await signers.getByRole("button", { name: "Include me as a signer" }).click();
    await signers.getByRole("button", { name: "You are a signer" }).waitFor({ timeout: 30000 });
    await signers.getByRole("button", { name: "Include broker as a signer (Bob Broker)" }).click();
    await signers.getByRole("button", { name: "Broker Bob Broker is a signer" }).waitFor({ timeout: 30000 });
    if (
      !(await signers.getByRole("button", { name: "You are a signer" }).isDisabled()) ||
      !(await signers.getByRole("button", { name: "Broker Bob Broker is a signer" }).isDisabled())
    ) {
      fail("included agent/broker buttons must disable to prevent duplicates");
    }
    const withInternal = await participantsInDb();
    const agentRows = withInternal.filter((row) => row.linked_user_id === userId);
    const brokerRows = withInternal.filter((row) => row.linked_brokerage_settings_id === brokerageSettingsId);
    if (
      agentRows.length !== 1 ||
      agentRows[0].role_code !== "AGENT" ||
      agentRows[0].full_name !== "Prepare QA Agent" ||
      brokerRows.length !== 1 ||
      brokerRows[0].role_code !== "BROKER" ||
      brokerRows[0].full_name !== "Bob Broker"
    ) {
      fail(`agent/broker quick-add: ${JSON.stringify(withInternal)}`);
    }
    await participantList.getByText("Prepare QA Agent").waitFor();
    await participantList.getByText("Bob Broker").waitFor();
    await shot(page, "00c-agent-broker-included");
    ok("Include me / Include broker added real participants once (roles Agent / Broker)");

    // Role edit persists across reload.
    await page.getByLabel(`Role for ${LONG_NAME}`).selectOption("TENANT");
    await participantList.getByText("Tenant · Co-buyer").waitFor({ timeout: 30000 });
    await page.reload({ waitUntil: "networkidle" });
    await participantList.getByText("Tenant · Co-buyer").waitFor({ timeout: 30000 });
    if ((await page.getByLabel(`Role for ${LONG_NAME}`).inputValue()) !== "TENANT") {
      fail("role edit did not survive reload");
    }
    if ((await participantsInDb()).find((row) => row.full_name === LONG_NAME)?.role_code !== "TENANT") {
      fail("role edit did not persist");
    }
    ok("ad hoc role edit (Buyer -> Tenant) persists across reload; label kept");

    await page.getByRole("button", { name: "Add all remaining packet documents" }).click();
    await page.getByText(/Added 2 documents from the Packet/).waitFor({ timeout: 60000 });
    await shot(page, "01-dashboard-after-packet");

    // Open the Prepare Documents workspace. pdf.js (which sets
    // globalThis.pdfjsLib when evaluated) must not load with the dashboard.
    const viewerLoaded = () =>
      page.evaluate(() => typeof (globalThis as { pdfjsLib?: unknown }).pdfjsLib !== "undefined");
    if (await viewerLoaded()) fail("pdf.js loaded with the dashboard, before Prepare Documents opened");
    await page.getByRole("button", { name: "Prepare Documents", exact: true }).click();
    await page.getByRole("heading", { name: "Prepare Documents" }).waitFor();
    await page.locator(".react-pdf__Page canvas").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    if (!(await viewerLoaded())) fail("pdf.js did not load when Prepare Documents opened");
    await page.evaluate(() => {
      const scope = globalThis as { pdfjsLib?: unknown; __qaFirstPdfjs?: unknown };
      scope.__qaFirstPdfjs = scope.pdfjsLib;
    });
    ok("pdf.js is not loaded by the dashboard; it loads when Prepare Documents opens");
    const dialogBox = await page.getByRole("dialog").boundingBox();
    if (!dialogBox || dialogBox.width < 1400 || dialogBox.height < 880) {
      fail(`workspace is not full viewport: ${JSON.stringify(dialogBox)}`);
    }
    const pageBox = await page.locator(".react-pdf__Page").first().boundingBox();
    if (!pageBox || pageBox.width < 600) fail(`PDF page too small: ${pageBox?.width}`);
    ok(`workspace ${dialogBox.width}x${dialogBox.height}; PDF page width ${Math.round(pageBox.width)}px`);
    if ((await page.getByRole("button", { name: "Signature", exact: true }).count()) > 0) {
      fail("dead Signature toolbar control is still present");
    }
    await page
      .getByText("Place signing fields for each participant. Participants adopt their signatures and initials when they sign.")
      .waitFor();
    ok("dead toolbar controls absent; concise adoption copy shown");
    await shot(page, "02-prepare-workspace");

    await page.evaluate(() => {
      (window as unknown as { __qaNoReload?: boolean }).__qaNoReload = true;
      document.querySelectorAll(".react-pdf__Page canvas").forEach((canvas) => {
        (canvas as HTMLCanvasElement).dataset.qaStable = "1";
      });
    });

    // Scroll to page 2 so a scroll reset would be visible.
    const workspace = page.locator("div.isolate.overflow-auto");
    await page.locator(".react-pdf__Page").nth(1).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const scrollBefore = await workspace.evaluate((el) => el.scrollTop);
    if (scrollBefore <= 0) fail("expected the workspace to be scrolled to page 2");

    // Place a Signature on page 2 (auto Date Signed).
    await selectParticipant("#prepare-participant", "Lee Harbaugh");
    await page.locator("#prepare-field-type").selectOption("SIGNATURE");
    const page2 = page.locator(".react-pdf__Page").nth(1);
    await page2.click({ position: { x: 200, y: 300 } });
    await page.locator(".signing-field-overlay").nth(1).waitFor({ timeout: 10000 });
    await waitSaved();
    let rows = await draftFields();
    const signature = rows.find((row) => row.field_type === "SIGNATURE");
    const pairedDate = rows.find((row) => row.field_type === "DATE_SIGNED");
    if (!signature || !pairedDate || pairedDate.linked_signature_draft_field_id !== signature.id) {
      fail(`placement did not persist a linked pair: ${JSON.stringify(rows)}`);
    }
    await assertStable("place");
    const scrollAfterPlace = await workspace.evaluate((el) => el.scrollTop);
    if (Math.abs(scrollAfterPlace - scrollBefore) > 2) {
      fail(`scroll reset after place: ${scrollBefore} -> ${scrollAfterPlace}`);
    }
    ok("Signature + linked Date Signed placed on page 2; scroll preserved");
    const scale = pageBox.width / 612;
    const leeSig = defaultDraftFieldSize("SIGNATURE", { fullName: "Lee Harbaugh" });
    const dateSize = DATE_SIGNED_DEFAULT_SIZE;
    const sizeText = (row: { width: number; height: number }) => `${row.width}x${row.height}`;
    if (sizeText(signature) !== sizeText(leeSig) || sizeText(pairedDate) !== sizeText(dateSize)) {
      fail(`defaults: Signature ${sizeText(signature)} (want ${sizeText(leeSig)}), Date ${sizeText(pairedDate)} (want ${sizeText(dateSize)})`);
    }
    if (Math.abs(pairedDate.y + pairedDate.height - (signature.y + signature.height)) > 0.5) {
      fail("linked Date Signed must share the Signature's baseline");
    }
    if (Math.abs(pairedDate.x - (signature.x + signature.width + 12)) > 0.5) {
      fail("linked Date Signed must sit to the right of its Signature when it fits");
    }
    const overlayBox = async (type: string) =>
      (await page.locator(`.signing-field-overlay:has([data-field-type="${type}"])`).first().boundingBox())!;
    const expectOverlay = (label: string, box: { width: number; height: number }, pt: { width: number; height: number }) => {
      if (Math.abs(box.width - pt.width * scale) > 1.5 || Math.abs(box.height - pt.height * scale) > 1.5) {
        fail(`${label} overlay ${box.width}x${box.height} px does not match ${sizeText(pt)} pt at scale ${scale}`);
      }
    };
    const sigBox = await overlayBox("SIGNATURE");
    const dateBox = await overlayBox("DATE_SIGNED");
    expectOverlay("Signature", sigBox, leeSig);
    expectOverlay("Date", dateBox, dateSize);
    const sigLabel = await page.locator('[data-field-type="SIGNATURE"]').first().getAttribute("data-field-label");
    const dateLabel = await page.locator('[data-field-type="DATE_SIGNED"]').first().getAttribute("data-field-label");
    if (sigLabel !== "Lee Harbaugh" || dateLabel !== "Date") fail(`labels: ${sigLabel} / ${dateLabel}`);
    ok(`content-sized Signature ${sizeText(leeSig)} pt and linked Date ${sizeText(dateSize)} pt on its baseline, to the right; labels "${sigLabel}" / "${dateLabel}"`);
    await page.screenshot({
      path: path.join(OUT_DIR, "03b-signature-date-closeup.png"),
      clip: { x: sigBox.x - 20, y: sigBox.y - 30, width: sigBox.width + dateBox.width + 60, height: sigBox.height + 60 },
    });    await shot(page, "03-placed");

    // Drag the Signature.
    const sigOverlay = page.locator('.signing-field-overlay:has([data-field-type="SIGNATURE"])').first();
    const box = (await sigOverlay.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 80, box.y + box.height / 2 + 40, { steps: 10 });
    await page.mouse.up();
    await waitSaved();
    rows = await draftFields();
    const moved = rows.find((row) => row.id === signature.id)!;
    if (Math.abs(moved.x - signature.x) < 10 || Math.abs(moved.y - signature.y) < 10) {
      fail(`drag did not persist: ${signature.x},${signature.y} -> ${moved.x},${moved.y}`);
    }
    if (rows.length !== 2) fail("drag must not create or remove fields");
    await assertStable("drag");
    ok(`drag persisted (${signature.x},${signature.y}) -> (${moved.x},${moved.y})`);

    // Resize via the bottom-right handle.
    const resizeBox = (await sigOverlay.boundingBox())!;
    await page.mouse.move(resizeBox.x + resizeBox.width - 2, resizeBox.y + resizeBox.height - 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox.x + resizeBox.width + 40, resizeBox.y + resizeBox.height + 15, {
      steps: 8,
    });
    await page.mouse.up();
    await waitSaved();
    rows = await draftFields();
    const resized = rows.find((row) => row.id === signature.id)!;
    if (resized.width <= moved.width) {
      fail(`resize did not persist: ${moved.width} -> ${resized.width}`);
    }
    await assertStable("resize");
    ok(`resize persisted width ${moved.width} -> ${resized.width}`);

    // Clicking a field (no movement) selects it without saving anything.
    await sigOverlay.click();
    await page.waitForTimeout(800);
    if ((await draftFields()).length !== 2) fail("click-select changed fields");
    await assertStable("select");

    // Reassign the Signature: its Date Signed follows.
    const calId = await page
      .locator("#reassign-participant option", { hasText: "Cal Cobuyer" })
      .getAttribute("value");
    await page.locator("#reassign-participant").selectOption(calId!);
    await waitSaved();
    rows = await draftFields();
    if (
      rows.find((row) => row.id === signature.id)?.signing_participant_id !== calId ||
      rows.find((row) => row.id === pairedDate.id)?.signing_participant_id !== calId
    ) {
      fail("reassigned Signature's Date Signed did not follow");
    }
    await assertStable("reassign");
    ok("reassign moved the Signature and its Date Signed to Cal Cobuyer");

    // Initials: place and remove independently. With a placement selected, the
    // first click on empty page area only clears the selection.
    await selectParticipant("#prepare-participant", "Lee Harbaugh");
    await page.locator("#prepare-field-type").selectOption("INITIALS");
    const selectionStatus = page.locator('[data-testid="prepare-selection"]');
    await page2.click({ position: { x: 450, y: 650 } });
    await selectionStatus.getByText("No placements selected").waitFor({ timeout: 5000 });
    await page.waitForTimeout(500);
    if ((await draftFields()).length !== 2) fail("a clearing click must not place a field");
    ok("clicking empty canvas with a selection clears it without placing");
    await page2.click({ position: { x: 450, y: 650 } });
    await waitSaved();
    const withInitials = await draftFields();
    if (withInitials.length !== 3) fail("Initials were not placed");
    const initialsRow = withInitials.find((row) => row.field_type === "INITIALS")!;
    const leeInitials = defaultDraftFieldSize("INITIALS", { fullName: "Lee Harbaugh" });
    if (sizeText(initialsRow) !== sizeText(leeInitials)) {
      fail(`Initials default ${sizeText(initialsRow)} (want ${sizeText(leeInitials)})`);
    }
    const initialsOverlay = page.locator('.signing-field-overlay:has([data-field-type="INITIALS"])').first();
    const initialsBox = (await initialsOverlay.boundingBox())!;
    expectOverlay("Initials", initialsBox, leeInitials);
    const initialsText = (await initialsOverlay.locator('[data-field-type="INITIALS"]').innerText()).trim();
    const initialsAria = await initialsOverlay.locator('[data-field-type="INITIALS"]').getAttribute("aria-label");
    if (initialsText !== "LH") fail(`Initials label must be LH, got "${initialsText}"`);
    if (initialsAria !== "Initials for Lee Harbaugh") fail(`Initials aria-label: ${initialsAria}`);
    ok(`Initials ${sizeText(leeInitials)} pt (${Math.round(initialsBox.width)}x${Math.round(initialsBox.height)} px) labelled "LH"; aria "${initialsAria}"`);
    await page.screenshot({
      path: path.join(OUT_DIR, "03c-initials-closeup.png"),
      clip: { x: initialsBox.x - 30, y: initialsBox.y - 30, width: initialsBox.width + 60, height: initialsBox.height + 60 },
    });
    await initialsOverlay.click();
    await initialsOverlay.locator(".signing-field-remove").click();
    await waitSaved();
    rows = await draftFields();
    if (rows.length !== 2 || rows.some((row) => row.field_type === "INITIALS")) {
      fail("Initials remove did not persist independently");
    }
    await assertStable("remove initials");
    ok("Initials removed independently");

    // Remove the Signature from its overlay: paired Date Signed goes too.
    await sigOverlay.click();
    await sigOverlay.locator(".signing-field-remove").click();
    await waitSaved();
    rows = await draftFields();
    if (rows.length !== 0) fail(`Signature remove left rows: ${JSON.stringify(rows)}`);
    if ((await page.locator(".signing-field-overlay").count()) !== 0) {
      fail("overlays still visible after remove");
    }
    await assertStable("remove signature");
    const scrollAfterRemove = await workspace.evaluate((el) => el.scrollTop);
    if (Math.abs(scrollAfterRemove - scrollBefore) > 2) {
      fail(`scroll reset after remove: ${scrollBefore} -> ${scrollAfterRemove}`);
    }
    ok("Remove deleted the Signature and its Date Signed; no refresh, scroll kept");

    // Buyer Rep-style printed lines on page 1: LH initials, short and long signatures.
    const firstPage = page.locator(".react-pdf__Page").first();
    await firstPage.scrollIntoViewIfNeeded();
    const placeOnLine = async (
      participant: string,
      type: "SIGNATURE" | "INITIALS",
      line: { x: number; top: number },
      size: { width: number; height: number },
    ) => {
      await selectParticipant("#prepare-participant", participant);
      await page.locator("#prepare-field-type").selectOption(type);
      await firstPage.click({
        position: {
          x: (line.x + size.width / 2) * scale,
          y: (line.top - size.height / 2) * scale,
        },
      });
      await waitSaved();
    };
    const calSig = defaultDraftFieldSize("SIGNATURE", { fullName: "Cal Cobuyer" });
    const lisaSig = defaultDraftFieldSize("SIGNATURE", { fullName: LONG_NAME });
    await placeOnLine("Lee Harbaugh", "INITIALS", PRINTED.initials, leeInitials);
    await placeOnLine("Cal Cobuyer", "SIGNATURE", PRINTED.signatureA, calSig);
    await placeOnLine(LONG_NAME, "SIGNATURE", PRINTED.signatureB, lisaSig);
    rows = await draftFields();
    const onPage1 = rows.filter((row) => row.y > 400);
    const ini = onPage1.find((row) => row.field_type === "INITIALS");
    const sigs = onPage1.filter((row) => row.field_type === "SIGNATURE").sort((a, b) => a.width - b.width);
    const dates = onPage1.filter((row) => row.field_type === "DATE_SIGNED");
    if (!ini || sigs.length !== 2 || dates.length !== 2) fail(`page-1 placements: ${JSON.stringify(onPage1)}`);
    if (sizeText(ini) !== sizeText(leeInitials)) fail(`LH initials ${sizeText(ini)}`);
    if (ini.width >= PRINTED.initials.width) fail(`LH initials ${ini.width}pt wider than the ${PRINTED.initials.width}pt printed line`);
    if (Math.abs(ini.y + ini.height - PRINTED.initials.top) > 1.5) fail("LH initials must sit on the printed line");
    if (sizeText(sigs[0]) !== sizeText(calSig) || sizeText(sigs[1]) !== sizeText(lisaSig)) {
      fail(`signature widths ${sizeText(sigs[0])} / ${sizeText(sigs[1])}, want ${sizeText(calSig)} / ${sizeText(lisaSig)}`);
    }
    if (!(sigs[0].width < sigs[1].width)) fail("a short name must be narrower than a long name");
    for (const date of dates) {
      if (sizeText(date) !== sizeText(dateSize)) fail(`Date ${sizeText(date)} is not compact`);
    }
    ok(`printed initials line ${PRINTED.initials.width}pt vs LH box ${sizeText(ini)}; Cal Cobuyer ${sizeText(sigs[0])} vs ${LONG_NAME} ${sizeText(sigs[1])} on ${PRINTED.signatureA.width}pt lines; Dates ${sizeText(dateSize)}`);
    const pageRect = (await firstPage.boundingBox())!;
    await page.screenshot({
      path: path.join(OUT_DIR, "04a-buyer-rep-signature-block.png"),
      clip: { x: pageRect.x + 60 * scale, y: pageRect.y + 520 * scale, width: 400 * scale, height: 140 * scale },
    });
    await page.screenshot({
      path: path.join(OUT_DIR, "04b-buyer-rep-initials.png"),
      clip: { x: pageRect.x + 395 * scale, y: pageRect.y + 715 * scale, width: 130 * scale, height: 40 * scale },
    });
    ok("screenshots of the printed Buyer Rep block captured");

    const overlayRects = async () => {
      const origin = (await firstPage.boundingBox())!;
      return page.$$eval(
        "[data-field-type]",
        (nodes, origin) =>
          nodes
            .map((node) => {
              const box = (node.closest(".signing-field-overlay, .pointer-events-none") ?? node).getBoundingClientRect();
              return {
                type: node.getAttribute("data-field-type"),
                x: Math.round(box.x - origin.x),
                y: Math.round(box.y - origin.y),
                w: Math.round(box.width),
                h: Math.round(box.height),
              };
            })
            .filter((rect) => rect.y >= 0 && rect.y < origin.height)
            .sort((a, b) => String(a.type).localeCompare(String(b.type)) || a.y - b.y),
        { x: origin.x, y: origin.y, height: origin.height },
      );
    };
    const prepareRects = await overlayRects();
    if (prepareRects.length !== 5) fail(`expected 5 page-1 fields, got ${JSON.stringify(prepareRects)}`);
    await shot(page, "04-before-close");

    // Close: no standalone Preview Signing; Send and Prepare Documents remain.
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("heading", { name: "Prepare Documents" }).waitFor({ state: "detached" });
    if ((await page.getByRole("button", { name: /Preview Signing/ }).count()) !== 0) {
      fail("standalone Preview Signing button is still on the Draft page");
    }
    if ((await page.getByText(/previewed/i).count()) !== 0) fail("no preview acknowledgment may appear");
    await page.getByRole("button", { name: "Send", exact: true }).waitFor();
    await page.getByRole("button", { name: "Begin In-Person Signing" }).waitFor();
    const sendEnabled = await page.getByRole("button", { name: "Send", exact: true }).isEnabled();
    if (sendEnabled) {
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await page.getByText("Send this Signing?").waitFor();
      await page
        .getByText("This freezes all the documents and emails each participant a signing link.")
        .waitFor();
      await page.getByRole("button", { name: "Cancel" }).click();
      ok("Send confirmation copy unchanged (cancelled, not sent)");
    } else {
      ok("Send remains (disabled by derived readiness, not by any preview step)");
    }
    await shot(page, "05-draft-page-no-preview");
    ok("Draft page has no Preview Signing button; Send and Begin In-Person remain");

    // Reopen Prepare Documents: the same Draft source and geometry render.
    await page.getByRole("button", { name: "Prepare Documents", exact: true }).first().click();
    await page.getByRole("heading", { name: "Prepare Documents" }).waitFor();
    await page.locator(".react-pdf__Page canvas").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    const reopenedRects = await overlayRects();
    const same = reopenedRects.length === prepareRects.length && reopenedRects.every((rect, index) => {
      const other = prepareRects[index];
      return rect.type === other.type && (["x", "y", "w", "h"] as const).every(
        (key) => Math.abs(rect[key] - other[key]) <= 2,
      );
    });
    if (!same) fail(`reopened geometry differs: ${JSON.stringify(prepareRects)} vs ${JSON.stringify(reopenedRects)}`);
    ok(`reopened Prepare Documents renders the same geometry: ${JSON.stringify(reopenedRects)}`);
    const sameViewerModule = await page.evaluate(() => {
      const scope = globalThis as { pdfjsLib?: unknown; __qaFirstPdfjs?: unknown };
      return scope.pdfjsLib !== undefined && scope.pdfjsLib === scope.__qaFirstPdfjs;
    });
    if (!sameViewerModule) fail("reopening Prepare Documents re-evaluated pdf.js");
    ok("reopen reuses the already-loaded viewer module (pdf.js not re-evaluated)");
    await shot(page, "06-prepare-reopened");

    // Multi-select, group drag, copy/paste, multi-delete (page 1).
    await page.evaluate(() => {
      document.querySelectorAll(".react-pdf__Page canvas").forEach((canvas) => {
        (canvas as HTMLCanvasElement).dataset.qaStable = "1";
      });
    });
    const { data: participantRows } = await admin
      .from("signing_participants")
      .select("id, full_name")
      .eq("signing_id", signingId);
    const pid = (name: string) =>
      (participantRows ?? []).find((row) => row.full_name === name)!.id as string;
    const overlayFor = (description: string, index = 0) =>
      page.locator(`.signing-field-overlay:has([aria-label="${description}"])`).nth(index);
    const expectSelected = (count: number) =>
      selectionStatus
        .getByText(count === 0 ? "No placements selected" : `${count} placement${count === 1 ? "" : "s"} selected`)
        .waitFor({ timeout: 5000 });
    const byParticipant = (all: Awaited<ReturnType<typeof draftFields>>, type: string, name: string) =>
      all.filter((row) => row.field_type === type && row.signing_participant_id === pid(name));

    const before = await draftFields();
    const lhBefore = byParticipant(before, "INITIALS", "Lee Harbaugh")[0];
    const calSigBefore = byParticipant(before, "SIGNATURE", "Cal Cobuyer")[0];
    const calDateBefore = byParticipant(before, "DATE_SIGNED", "Cal Cobuyer")[0];

    await overlayFor("Initials for Lee Harbaugh").click({ modifiers: ["Control"] });
    await overlayFor("Signature for Cal Cobuyer").click({ modifiers: ["Control"] });
    await expectSelected(2);
    const selectedCount = await page.locator('.signing-field-overlay[data-selected="true"]').count();
    if (selectedCount !== 2) fail(`expected 2 highlighted overlays, got ${selectedCount}`);
    await overlayFor("Initials for Lee Harbaugh").click({ modifiers: ["Control"] });
    await expectSelected(1);
    await overlayFor("Initials for Lee Harbaugh").click({ modifiers: ["Control"] });
    await expectSelected(2);
    if ((await draftFields()).length !== before.length) fail("selecting changed fields");
    await shot(page, "07-multi-select");
    ok("Ctrl-click toggles placements; count and highlight shown; nothing saved");

    const calBox = (await overlayFor("Signature for Cal Cobuyer").boundingBox())!;
    await page.mouse.move(calBox.x + 15, calBox.y + calBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(calBox.x + 55, calBox.y + calBox.height / 2 - 30, { steps: 10 });
    await page.mouse.up();
    await waitSaved();
    await page.waitForTimeout(800);
    let after = await draftFields();
    const lhMoved = after.find((row) => row.id === lhBefore.id)!;
    const calMoved = after.find((row) => row.id === calSigBefore.id)!;
    const dx = calMoved.x - calSigBefore.x;
    const dy = calMoved.y - calSigBefore.y;
    if (Math.abs(dx) < 10 || Math.abs(dy) < 10) fail(`group drag did not move: ${dx},${dy}`);
    if (Math.abs(lhMoved.x - lhBefore.x - dx) > 0.5 || Math.abs(lhMoved.y - lhBefore.y - dy) > 0.5) {
      fail(`group drag distorted offsets: sig ${dx},${dy} vs initials ${lhMoved.x - lhBefore.x},${lhMoved.y - lhBefore.y}`);
    }
    const calDateAfter = after.find((row) => row.id === calDateBefore.id)!;
    if (calDateAfter.x !== calDateBefore.x || calDateAfter.y !== calDateBefore.y) {
      fail("an unselected Date moved with the group");
    }
    await expectSelected(2);
    await assertStable("group drag");
    ok(`group drag moved both selected placements by (${dx.toFixed(1)}, ${dy.toFixed(1)}) pt and kept the selection`);

    const pasteLayer = page.locator('[data-testid="paste-placement-layer"]').first();
    /** In paste mode the capture layer (page-sized) receives the click. */
    const clickPagePt = async (pt: { x: number; y: number }) => {
      await pasteLayer.click({ position: { x: pt.x * scale, y: pt.y * scale } });
    };
    await page.keyboard.press("Control+c");
    await page.getByText("Copied 2 placements.").waitFor({ timeout: 5000 });

    // Escape and a tool change both cancel paste mode without creating anything.
    await page.keyboard.press("Control+v");
    await pasteLayer.waitFor({ timeout: 5000 });
    await page.getByText("Click the page where the pasted placements should go.", { exact: false }).waitFor();
    await page.keyboard.press("Escape");
    await pasteLayer.waitFor({ state: "detached", timeout: 5000 });
    await page.getByRole("button", { name: "Paste", exact: true }).click();
    await pasteLayer.waitFor({ timeout: 5000 });
    await page.locator("#prepare-field-type").selectOption("SIGNATURE");
    await pasteLayer.waitFor({ state: "detached", timeout: 5000 });
    await page.locator("#prepare-field-type").selectOption("INITIALS");
    if ((await draftFields()).length !== before.length) fail("cancelled paste created fields");
    ok("Escape, Paste button parity, and a tool change: paste mode arms and cancels with nothing created");

    // Ctrl+V, hover shows a ghost preview, the click anchors the group there.
    await page.keyboard.press("Control+v");
    await pasteLayer.waitFor({ timeout: 5000 });
    const anchorPt = { x: 300, y: 400 };
    await pasteLayer.hover({ position: { x: anchorPt.x * scale - 6, y: anchorPt.y * scale - 6 } });
    await pasteLayer.hover({ position: { x: anchorPt.x * scale, y: anchorPt.y * scale } });
    await page.waitForTimeout(300);
    const ghostCount = await page.locator("[data-paste-preview]").count();
    if (ghostCount < 2) fail(`expected a paste preview of the group, got ${ghostCount} ghosts`);
    await shot(page, "08a-paste-preview");
    await clickPagePt(anchorPt);
    await page.getByText("Pasted 3 placements.").waitFor({ timeout: 5000 });
    await pasteLayer.waitFor({ state: "detached", timeout: 5000 });
    await expectSelected(3);
    await waitSaved();
    await page.waitForTimeout(1000);
    after = await draftFields();
    if (after.length !== before.length + 3) {
      fail(`anchored paste created ${after.length - before.length} rows (an extra field means the click also placed one)`);
    }
    const pastedLh = byParticipant(after, "INITIALS", "Lee Harbaugh").find((row) => row.id !== lhBefore.id)!;
    const pastedCal = byParticipant(after, "SIGNATURE", "Cal Cobuyer").find((row) => row.id !== calSigBefore.id)!;
    const pastedCalDate = byParticipant(after, "DATE_SIGNED", "Cal Cobuyer").find((row) => row.id !== calDateBefore.id)!;
    if (!pastedLh || !pastedCal || !pastedCalDate) fail(`paste rows: ${JSON.stringify(after)}`);
    if (
      Math.abs(pastedLh.x - pastedCal.x - (lhMoved.x - calMoved.x)) > 0.5 ||
      Math.abs(pastedLh.y - pastedCal.y - (lhMoved.y - calMoved.y)) > 0.5
    ) {
      fail("anchored paste lost the group's relative geometry");
    }
    for (const [label, pasted, source] of [
      ["Initials", pastedLh, lhMoved],
      ["Signature", pastedCal, calMoved],
    ] as const) {
      if (pasted.width !== source.width || pasted.height !== source.height) fail(`${label} paste size changed`);
    }
    const contains = (row: { x: number; y: number; width: number; height: number }) =>
      anchorPt.x >= row.x - 0.5 && anchorPt.x <= row.x + row.width + 0.5 &&
      anchorPt.y >= row.y - 0.5 && anchorPt.y <= row.y + row.height + 0.5;
    if (!contains(pastedLh) && !contains(pastedCal)) {
      fail(`the clicked point (${anchorPt.x},${anchorPt.y}) is not on the pasted group`);
    }
    if (pastedCalDate.linked_signature_draft_field_id !== pastedCal.id) {
      fail("pasted Signature's Date Signed is not linked to the new Signature");
    }
    await assertStable("paste");
    await shot(page, "08-pasted");
    ok("Ctrl+V then click: group anchored at the click (relative geometry, participants, linked Date kept); no extra field");

    // Delete is ignored while a form control has focus.
    await page.locator("#prepare-participant").focus();
    await page.keyboard.press("Delete");
    await page.waitForTimeout(800);
    if ((await draftFields()).length !== after.length) fail("Delete in a form control removed placements");
    await expectSelected(3);
    ok("Delete is ignored while a form control has focus");

    await overlayFor("Initials for Lee Harbaugh", 1).click({ modifiers: ["Control"] });
    await overlayFor("Initials for Lee Harbaugh", 1).click({ modifiers: ["Control"] });
    await expectSelected(3);
    await page.keyboard.press("Delete");
    await expectSelected(0);
    await waitSaved();
    await page.waitForTimeout(1000);
    after = await draftFields();
    if (after.length !== before.length || after.some((row) => [pastedLh.id, pastedCal.id, pastedCalDate.id].includes(row.id))) {
      fail(`multi-delete left rows: ${JSON.stringify(after)}`);
    }
    await assertStable("multi-delete");
    ok("Delete removed the 3 selected placements through trusted actions; no refresh");

    // A Signature + Date pair pastes as a new linked pair.
    const lisaSigRow = byParticipant(after, "SIGNATURE", LONG_NAME)[0];
    const lisaDateRow = byParticipant(after, "DATE_SIGNED", LONG_NAME)[0];
    await overlayFor(`Signature for ${LONG_NAME}`).click();
    await overlayFor(`Date Signed for ${LONG_NAME}`).click({ modifiers: ["Control"] });
    await expectSelected(2);
    await page.keyboard.press("Control+c");
    await page.getByRole("button", { name: "Paste", exact: true }).click();
    await pasteLayer.waitFor({ timeout: 5000 });
    await clickPagePt({ x: 300, y: 330 });
    await page.getByText("Pasted 2 placements.").waitFor({ timeout: 5000 });
    await waitSaved();
    await page.waitForTimeout(1000);
    after = await draftFields();
    const newLisaSig = byParticipant(after, "SIGNATURE", LONG_NAME).find((row) => row.id !== lisaSigRow.id)!;
    const newLisaDate = byParticipant(after, "DATE_SIGNED", LONG_NAME).find((row) => row.id !== lisaDateRow.id)!;
    if (!newLisaSig || !newLisaDate || newLisaDate.linked_signature_draft_field_id !== newLisaSig.id) {
      fail(`pasted pair not linked: ${JSON.stringify(after)}`);
    }
    if (Math.abs(newLisaDate.x - newLisaSig.x - (lisaDateRow.x - lisaSigRow.x)) > 0.5) {
      fail("pasted pair lost its relative geometry");
    }
    ok("copied Signature + Date pasted as a new linked pair with the same relative geometry");

    // A Date whose Signature no longer exists (and no undated one) is rejected.
    await overlayFor(`Date Signed for ${LONG_NAME}`, 0).click({ position: { x: 12, y: 8 } });
    await expectSelected(1);
    await page.keyboard.press("Control+c");
    await page.getByText("Copied 1 placement.").waitFor({ timeout: 5000 });
    const orphanSource = (await draftFields()).find((row) => row.field_type === "DATE_SIGNED" && row.signing_participant_id === pid(LONG_NAME) && row.id === lisaDateRow.id);
    if (!orphanSource) fail("expected to copy the original Lisa Date");
    await overlayFor(`Signature for ${LONG_NAME}`, 0).click({ position: { x: 4, y: 4 } });
    await expectSelected(1);
    await page.keyboard.press("Delete");
    await waitSaved();
    await page.waitForTimeout(1000);
    const beforeOrphan = await draftFields();
    if (beforeOrphan.some((row) => row.id === lisaSigRow.id || row.id === lisaDateRow.id)) {
      fail("deleting the original Signature must remove its Date");
    }
    await page.keyboard.press("Control+v");
    await pasteLayer.waitFor({ timeout: 5000 });
    await clickPagePt({ x: 300, y: 330 });
    await page.getByText(`Date Signed needs a Signature or Initials for ${LONG_NAME}.`, { exact: false }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(800);
    if ((await draftFields()).length !== beforeOrphan.length) fail("an orphan Date was pasted");
    await shot(page, "09-orphan-date-rejected");
    await page.keyboard.press("Escape");
    await pasteLayer.waitFor({ state: "detached", timeout: 5000 });
    ok("orphan Date Signed paste rejected with clear feedback; nothing placed");

    // Empty canvas click clears the selection without placing.
    await overlayFor(`Signature for ${LONG_NAME}`, 0).click();
    await expectSelected(1);
    await firstPage.click({ position: { x: 40, y: 40 } });
    await expectSelected(0);
    await page.waitForTimeout(500);
    if ((await draftFields()).length !== beforeOrphan.length) fail("clearing click placed a field");

    const finalRects = await overlayRects();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("heading", { name: "Prepare Documents" }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Prepare Documents", exact: true }).first().click();
    await page.getByRole("heading", { name: "Prepare Documents" }).waitFor();
    await page.locator(".react-pdf__Page canvas").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    const reopenedAgain = await overlayRects();
    const sameAgain = reopenedAgain.length === finalRects.length && reopenedAgain.every((rect, index) => {
      const other = finalRects[index];
      return rect.type === other.type && (["x", "y", "w", "h"] as const).every(
        (key) => Math.abs(rect[key] - other[key]) <= 2,
      );
    });
    if (!sameAgain) fail(`geometry after edits differs on reopen: ${JSON.stringify(finalRects)} vs ${JSON.stringify(reopenedAgain)}`);
    await shot(page, "10-reopened-after-multi-edit");
    ok(`geometry after group drag / paste / delete survives close and reopen (${finalRects.length} fields)`);

    const pagePt = async (pt: { x: number; y: number }) => {
      const reopenedPage = page.locator(".react-pdf__Page").first();
      await reopenedPage.click({ position: { x: pt.x * scale, y: pt.y * scale } });
    };
    /** A click with a selection only clears it; place with a second click. */
    const placeAtPt = async (pt: { x: number; y: number }) => {
      if (!(await selectionStatus.getByText("No placements selected").isVisible())) {
        await pagePt({ x: 20, y: 20 });
        await expectSelected(0);
      }
      await pagePt(pt);
      await waitSaved();
      await page.waitForTimeout(500);
    };
    const center = (row: { x: number; y: number; width: number; height: number }) => ({
      x: row.x + row.width / 2,
      y: row.y + row.height / 2,
    });

    // Copy a single Initials -> Paste -> click: it lands exactly there, nothing else.
    await page.locator('.signing-field-overlay:has([aria-label="Initials for Lee Harbaugh"])').first().click();
    await expectSelected(1);
    await page.keyboard.press("Control+c");
    await page.getByText("Copied 1 placement.").waitFor({ timeout: 5000 });
    const beforeSingle = await draftFields();
    await page.getByRole("button", { name: "Paste", exact: true }).click();
    const singleLayer = page.locator('[data-testid="paste-placement-layer"]').first();
    await singleLayer.waitFor({ timeout: 5000 });
    const singleAnchor = { x: 430, y: 330 };
    await singleLayer.click({ position: { x: singleAnchor.x * scale, y: singleAnchor.y * scale } });
    await page.getByText("Pasted 1 placement.").waitFor({ timeout: 5000 });
    await waitSaved();
    await page.waitForTimeout(800);
    const afterSingle = await draftFields();
    const single = afterSingle.find((row) => !beforeSingle.some((prior) => prior.id === row.id));
    if (afterSingle.length !== beforeSingle.length + 1 || !single) {
      fail(`single Initials paste created ${afterSingle.length - beforeSingle.length} rows`);
    }
    const singleCenter = center(single);
    if (
      single.field_type !== "INITIALS" ||
      single.signing_participant_id !== pid("Lee Harbaugh") ||
      Math.abs(singleCenter.x - singleAnchor.x) > 0.6 ||
      Math.abs(singleCenter.y - singleAnchor.y) > 0.6
    ) {
      fail(`single Initials paste landed at ${JSON.stringify(singleCenter)}, wanted ${JSON.stringify(singleAnchor)}`);
    }
    await shot(page, "11-single-initials-pasted");
    ok("copied Initials -> Paste -> click: appears centred on the click; exactly one new field");

    // Date Signed deliberately linked to that Initials.
    await selectParticipant("#prepare-participant", "Lee Harbaugh");
    await page.locator("#prepare-field-type").selectOption("DATE_SIGNED");
    const linkOptions = await page.locator("#prepare-date-link option").allTextContents();
    if (!linkOptions.some((text) => text.startsWith("Initials"))) {
      fail(`Link to must offer Initials: ${JSON.stringify(linkOptions)}`);
    }
    await page.locator("#prepare-date-link").selectOption(single.id);
    const beforeIniDate = await draftFields();
    await placeAtPt({ x: 500, y: 330 });
    const iniDate = (await draftFields()).find(
      (row) => row.field_type === "DATE_SIGNED" && !beforeIniDate.some((prior) => prior.id === row.id),
    );
    if (
      !iniDate ||
      iniDate.linked_signature_draft_field_id !== single.id ||
      iniDate.signing_participant_id !== pid("Lee Harbaugh")
    ) {
      fail(`Date Signed was not linked to the chosen Initials: ${JSON.stringify(iniDate)}`);
    }
    await page
      .locator('.signing-field-overlay:has([aria-label="Date Signed for Lee Harbaugh"])')
      .first()
      .click({ position: { x: 6, y: 6 } });
    await expectSelected(1);
    if ((await page.locator("#relink-date").inputValue()) !== single.id) {
      fail("the selected Date must show its Initials link");
    }
    await shot(page, "12-initials-linked-date");
    ok("Date Signed linked to Initials (manager choice); Linked to shows the Initials");

    // Printed Name for Bea Buyerthree on the printed-name line.
    await page.locator("#prepare-field-type").selectOption("PRINTED_NAME");
    await selectParticipant("#prepare-participant", "Bea Buyerthree");
    const printedSize = defaultPreparedContentSize("PRINTED_NAME", "Bea Buyerthree");
    await placeAtPt({
      x: PRINTED.printedName.x + printedSize.width / 2,
      y: PRINTED.printedName.top - printedSize.height / 2,
    });
    let prepared = await preparedContent();
    const printedRow = prepared.find((row) => row.content_type === "PRINTED_NAME");
    if (!printedRow || printedRow.signing_participant_id !== pid("Bea Buyerthree")) {
      fail(`Printed Name did not persist for Bea: ${JSON.stringify(prepared)}`);
    }
    if ((await draftFields()).some((row) => !["SIGNATURE", "INITIALS", "DATE_SIGNED"].includes(row.field_type))) {
      fail("prepared content must never be stored as a signing field");
    }
    const printedOverlay = page.locator('[data-field-type="PRINTED_NAME"]').first();
    if (!(await printedOverlay.innerText()).includes("Bea Buyerthree")) {
      fail("Printed Name overlay must render the participant's name");
    }
    ok("Printed Name placed on the line; renders Bea Buyerthree; stored as prepared content");

    // Checkmark over the printed box: no participant.
    await page.locator("#prepare-field-type").selectOption("CHECKMARK");
    if (!(await page.locator("#prepare-participant").isDisabled())) {
      fail("participant choice must be disabled for a Checkmark");
    }
    await placeAtPt({
      x: PRINTED.checkbox.x + PRINTED.checkbox.size / 2,
      y: PRINTED.checkbox.top + PRINTED.checkbox.size / 2,
    });
    prepared = await preparedContent();
    const checkRow = prepared.find((row) => row.content_type === "CHECKMARK");
    if (
      !checkRow ||
      checkRow.signing_participant_id !== null ||
      Math.abs(checkRow.x - PRINTED.checkbox.x) > 0.6 ||
      Math.abs(checkRow.y - PRINTED.checkbox.top) > 0.6
    ) {
      fail(`Checkmark must sit on the box with no participant: ${JSON.stringify(checkRow)}`);
    }
    if ((await page.locator('[data-field-type="CHECKMARK"]').count()) !== 1) fail("Checkmark overlay missing");
    const markPage = (await page.locator(".react-pdf__Page").first().boundingBox())!;
    await page.screenshot({
      path: path.join(OUT_DIR, "13-printed-name-and-checkmark.png"),
      clip: { x: markPage.x + 60 * scale, y: markPage.y + 185 * scale, width: 320 * scale, height: 95 * scale },
    });
    ok("Checkmark placed over the box as participant-free prepared content");

    // Prepared content adds no requirement: Bea still needs a signing field.
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("heading", { name: "Prepare Documents" }).waitFor({ state: "detached" });
    const beaRow = participantList.locator("div.rounded-lg", { hasText: "Bea Buyerthree" }).first();
    await beaRow.getByText("Needs at least one Signature or Initials field.").waitFor({ timeout: 10000 });
    ok("a Printed Name does not satisfy (or add) a participant requirement");

    // Draft rendering follows a Draft name change.
    await admin
      .from("signing_participants")
      .update({ full_name: "Beatrice Buyerthree" })
      .eq("id", pid("Bea Buyerthree"));
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Prepare Documents", exact: true }).first().click();
    await page.getByRole("heading", { name: "Prepare Documents" }).waitFor();
    await page.locator(".react-pdf__Page canvas").first().waitFor({ timeout: 60000 });
    await page.locator('[data-field-type="PRINTED_NAME"]', { hasText: "Beatrice Buyerthree" }).waitFor({ timeout: 20000 });
    await shot(page, "14-printed-name-after-rename");
    ok("Draft Printed Name re-renders the participant's current name");
    const issues = noise.issues();
    if (issues.length > 0) fail(`unexpected runtime errors/warnings:\n${issues.join("\n")}`);
    ok("no browser console errors/warnings, page errors, or dev server errors/warnings");
    console.log("\nPrepare Documents browser QA: all checks passed.");
  } finally {
    await browser.close();
    if (signingId) {
      const { data: snaps } = await admin
        .from("signing_draft_source_snapshots")
        .select("source_pdf_object_key")
        .eq("signing_id", signingId);
      const keys = (snaps ?? [])
        .map((row) => row.source_pdf_object_key as string | null)
        .filter((key): key is string => Boolean(key));
      if (keys.length > 0) await admin.storage.from(SIGNING_ARTIFACTS_BUCKET).remove(keys);
      await admin
        .from("signing_draft_fields")
        .update({ linked_signature_draft_field_id: null })
        .eq("signing_id", signingId);
      await admin.from("signing_draft_fields").delete().eq("signing_id", signingId);
      await admin.from("signing_draft_prepared_content").delete().eq("signing_id", signingId);
      await admin
        .from("signing_documents")
        .update({ selected_draft_source_snapshot_id: null })
        .eq("signing_id", signingId);
      await admin.from("signing_draft_source_snapshots").delete().eq("signing_id", signingId);
      await admin.from("signing_documents").delete().eq("signing_id", signingId);
      await admin.from("signing_participants").delete().eq("signing_id", signingId);
      await admin.from("signing_events").delete().eq("signing_id", signingId);
      await admin.from("signing_event_chain_state").delete().eq("signing_id", signingId);
      await admin
        .from("signings")
        .update({ current_primary_agent_association_id: null })
        .eq("id", signingId);
      await admin.from("signing_operator_associations").delete().eq("signing_id", signingId);
      await admin.from("signing_agent_associations").delete().eq("signing_id", signingId);
      const { error: signingDeleteError } = await admin.from("signings").delete().eq("id", signingId);
      if (signingDeleteError) console.error(`Cleanup: Signing ${signingId}: ${signingDeleteError.message}`);
    }
    if (brokerageSettingsId) {
      await admin.from("brokerage_settings").delete().eq("id", brokerageSettingsId);
    }
    if (generatedPaths.length > 0) {
      await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).remove(generatedPaths);
    }
    if (agreementId) {
      await admin.from("packets").update({ representation_agreement_id: null }).eq("id", packetId);
      await admin
        .from("representation_agreement_clients")
        .delete()
        .eq("representation_agreement_id", agreementId);
      await admin.from("representation_agreements").delete().eq("id", agreementId);
    }
    if (contactIds.length > 0) await admin.from("contacts").delete().in("id", contactIds);
    if (formIds.length > 0) {
      await admin.from("packet_forms").update({ status: "DELETED" }).in("id", formIds);
    }
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
  console.error(error instanceof QaFailure ? `FAIL: ${error.message}` : error);
  process.exit(1);
});
