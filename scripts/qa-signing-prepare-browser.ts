/**
 * Browser QA: Draft Signing preparation (PR #46 QA pass 5).
 *
 * Disposable development fixtures only (own user, Packet, contacts, Signing);
 * cleaned up in `finally`. Proves in a real browser that selecting a Packet
 * populates participants, the Prepare Documents workspace is full-height, and
 * place / drag / resize / reassign / remove persist without a page reload,
 * PDF remount, or scroll reset.
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
} from "../lib/signing/draft-field-sizing.ts";

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

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (error) => console.log(`NOTE: pageerror ${error.message}`));

  async function draftFields() {
    const { data, error } = await admin
      .from("signing_draft_fields")
      .select("id, field_type, x, y, width, height, signing_participant_id, linked_signature_draft_field_id")
      .eq("signing_id", signingId);
    if (error) fail(error.message);
    return data ?? [];
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
    await page.locator("#participant-name").fill(LONG_NAME);
    await page.getByRole("button", { name: "Add participant", exact: true }).click();
    await participantList.getByText(LONG_NAME).waitFor({ timeout: 30000 });
    ok("ad hoc participant added before choosing a Packet");

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
    await page.getByRole("button", { name: "Add all remaining packet documents" }).click();
    await page.getByText(/Added 2 documents from the Packet/).waitFor({ timeout: 60000 });
    await shot(page, "01-dashboard-after-packet");

    // Open the Prepare Documents workspace.
    await page.getByRole("button", { name: "Prepare Documents", exact: true }).click();
    await page.getByRole("heading", { name: "Prepare Documents" }).waitFor();
    await page.locator(".react-pdf__Page canvas").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
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
    await page.locator("#prepare-participant").selectOption({ label: "Lee Harbaugh" });
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

    // Initials: place and remove independently.
    await page.locator("#prepare-participant").selectOption({ label: "Lee Harbaugh" });
    await page.locator("#prepare-field-type").selectOption("INITIALS");
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
      await page.locator("#prepare-participant").selectOption({ label: participant });
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
    await shot(page, "06-prepare-reopened");
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
      await admin
        .from("signing_documents")
        .update({ selected_draft_source_snapshot_id: null })
        .eq("signing_id", signingId);
      await admin.from("signing_draft_source_snapshots").delete().eq("signing_id", signingId);
      await admin.from("signing_documents").delete().eq("signing_id", signingId);
      await admin.from("signing_participants").delete().eq("signing_id", signingId);
      await admin.from("signing_events").delete().eq("signing_id", signingId);
      await admin
        .from("signings")
        .update({ current_primary_agent_association_id: null })
        .eq("id", signingId);
      await admin.from("signing_agent_associations").delete().eq("signing_id", signingId);
      await admin.from("signings").delete().eq("id", signingId);
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
