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
import { PDFDocument, StandardFonts } from "pdf-lib";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const OUT_DIR = path.join("_audit_tmp", "signing-prepare-qa");
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
  await page.screenshot({ path: file });
  ok(`screenshot ${file}`);
}

async function makePdf(label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 1; index <= 2; index += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${label} — page ${index}`, { x: 72, y: 720, size: 18, font });
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
    for (const [first, last, role, sort] of [
      ["Bea", "Buyer", "BUYER", 0],
      ["Cal", "Cobuyer", "CO_CLIENT", 1],
    ] as const) {
      const { data: contact } = await admin
        .from("contacts")
        .insert({
          owner_user_id: userId,
          contact_type: "INDIVIDUAL",
          first_name: first,
          last_name: last,
          email: role === "BUYER" ? `bea-${stamp}@example.com` : null,
          status: "ACTIVE",
        })
        .select("id")
        .single();
      contactIds.push(contact!.id as number);
      await admin.from("packet_contacts").insert({
        packet_id: packetId,
        contact_id: contact!.id,
        packet_role: role,
        sort_order: sort,
        status: "ACTIVE",
      });
    }

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

    // Select the Packet: participants populate automatically.
    await page.getByRole("button", { name: "Use this Packet" }).waitFor({ timeout: 60000 });
    await page.locator("#source-packet").selectOption(String(packetId));
    await page.getByRole("button", { name: "Use this Packet" }).click();
    await page.getByText(/Packet selected\. Added 2 participants/).waitFor({ timeout: 30000 });
    await page.getByText("Bea Buyer").first().waitFor();
    await page.getByText("Cal Cobuyer").first().waitFor();
    await page
      .locator("#source-packet")
      .waitFor({ state: "detached", timeout: 10000 })
      .catch(() => fail("Packet selector must not stay active once Packet parties exist"));
    await page.getByText(`#${packetId} · QA Packet ${stamp}`).waitFor();
    if ((await page.getByRole("button", { name: "Change Packet" }).count()) !== 0) {
      fail("Change Packet must be hidden once Packet parties exist");
    }
    ok("selecting the Packet populated both parties; selector locked");
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
    await page.locator("#prepare-participant").selectOption({ label: "Bea Buyer" });
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
    await shot(page, "03-placed");

    // Drag the Signature.
    const sigOverlay = page.locator(".signing-field-overlay", { hasText: "Signature" }).first();
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
    await sigOverlay.click({ position: { x: 10, y: 10 } });
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
    await page.locator("#prepare-participant").selectOption({ label: "Bea Buyer" });
    await page.locator("#prepare-field-type").selectOption("INITIALS");
    await page2.click({ position: { x: 450, y: 650 } });
    await waitSaved();
    if ((await draftFields()).length !== 3) fail("Initials were not placed");
    const initialsOverlay = page.locator(".signing-field-overlay", { hasText: "Initials" }).first();
    await initialsOverlay.click({ position: { x: 30, y: 14 } });
    await initialsOverlay.locator(".signing-field-remove").click();
    await waitSaved();
    rows = await draftFields();
    if (rows.length !== 2 || rows.some((row) => row.field_type === "INITIALS")) {
      fail("Initials remove did not persist independently");
    }
    await assertStable("remove initials");
    ok("Initials removed independently");

    // Remove the Signature from its overlay: paired Date Signed goes too.
    await sigOverlay.click({ position: { x: 30, y: 14 } });
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

    // Place one more pair, close, and verify read-only Preview shows it.
    await page.locator("#prepare-field-type").selectOption("SIGNATURE");
    await page.locator(".react-pdf__Page").first().click({ position: { x: 150, y: 500 } });
    await waitSaved();
    await shot(page, "04-before-close");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Preview Signing" }).first().click();
    await page.getByRole("heading", { name: "Preview Signing" }).waitFor();
    await page.locator(".react-pdf__Page canvas").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    const previewOverlays = page.locator(".pointer-events-none.absolute", {
      hasText: "Bea Buyer",
    });
    if ((await previewOverlays.count()) < 2) fail("Preview did not show the persisted pair");
    if ((await page.locator(".signing-field-overlay").count()) !== 0) {
      fail("Preview must be read-only");
    }
    ok("Preview renders the same persisted fields read-only");
    await shot(page, "05-preview");

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
    if (packetId) {
      await admin.from("packet_contacts").delete().eq("packet_id", packetId);
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
