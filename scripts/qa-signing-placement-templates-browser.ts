/**
 * Browser QA: Signing Placement Templates (PR #46).
 *
 * Disposable development fixtures only (organization, two Users, forms, a
 * Packet, one Signing); cleaned up in `finally`. In a real browser against the
 * local dev server it proves:
 *   - a Personal template is created on the Form-level "Signing placements"
 *     page for an exact form version and edited in the Prepare Documents editor
 *     with signer slots (Buyer 1, Seller 1, ...), never real people;
 *   - an organization admin creates an Organization template; a member can
 *     view it but not edit or delete it;
 *   - copying from another version creates an independent template, shows the
 *     review warning, and reports placements skipped on missing pages;
 *   - Prepare Documents offers the template for the exact form version only,
 *     previews slot -> participant mapping and unresolved slots, applies only
 *     on explicit confirmation, never gives extra participants anything, and
 *     produces ordinary editable Draft placements;
 *   - applying again warns about existing placements and adds alongside them;
 *     a double click applies once;
 *   - a Personal template fully replaces the Organization template.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=... NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-signing-placement-templates-browser.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildFormStoragePath, FORM_TEMPLATES_BUCKET } from "../lib/form-storage.ts";
import { COPY_FROM_VERSION_WARNING } from "../lib/signing/placement-template-model.ts";
import { createRuntimeNoiseGuard } from "./qa-runtime-noise.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PRODUCTION_REF = "eetonalyyyssvkyfdoxh";
const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const OUT_DIR = path.join("_audit_tmp", "signing-placement-templates-qa");
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

async function fixturePdf(pages: number, label: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 1; index <= pages; index += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${label} - page ${index}`, { x: 72, y: 720, size: 18, font });
  }
  return doc.save();
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url.includes(EXPECTED_REF) || url.includes(PRODUCTION_REF)) fail(`Refusing outside development: ${url}`);
  const admin: SupabaseClient = createClient(
    url,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const stamp = Date.now();
  const orgName = `Placement QA Realty ${stamp}`;
  let organizationId = "";
  const userIds: string[] = [];
  const formIds: number[] = [];
  const formStoragePaths: string[] = [];
  const generatedPaths: string[] = [];
  let packetId = 0;
  const packetFormIds: number[] = [];
  let signingId = "";

  const browser = await chromium.launch({ headless: true });
  const noise = createRuntimeNoiseGuard();
  const contexts: BrowserContext[] = [];

  /** Every editor PDF response must be the exact form PDF, never a 404 / HTML page. */
  const pdfProblems: string[] = [];
  let pdfOkCount = 0;
  function watchEditorPdf(page: Page, label: string) {
    page.on("response", (response) => {
      if (!/\/forms\/\d+\/signing-placements\/[0-9a-f-]+\/pdf$/.test(new URL(response.url()).pathname)) return;
      const type = response.headers()["content-type"] ?? "";
      if (response.status() === 200 && type.startsWith("application/pdf")) pdfOkCount += 1;
      else pdfProblems.push(`[${label}] ${response.status()} ${type} ${new URL(response.url()).pathname}`);
    });
  }

  async function newUser(
    label: string,
    firstName: string,
    role: "MEMBER" | "ORG_ADMIN",
    appRole: "USER" | "ADMIN" = "USER",
  ) {
    const email = `placement-qa-${label}-${stamp}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: `PlacementQa-${randomUUID()}!aA1`,
      email_confirm: true,
    });
    if (error || !data.user) fail(error?.message ?? "user");
    const id = data.user.id;
    userIds.push(id);
    await admin.from("profiles").upsert({
      id,
      email,
      status: "ACTIVE",
      app_role: appRole,
      onboarding_status: "ACTIVE",
      display_name: `${firstName} Placement`,
      first_name: firstName,
      last_name: "Placement",
      primary_organization_id: organizationId,
      must_change_password: false,
    });
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: id,
      membership_role: role,
      status: "ACTIVE",
    });
    if (memberError) fail(memberError.message);
    return { id, email };
  }

  async function signIn(email: string, label: string, next: string): Promise<Page> {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    const page = await context.newPage();
    noise.watch(page, label);
    watchEditorPdf(page, label);
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link.properties?.hashed_token) fail("generateLink failed");
    await page.goto(
      `${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(next)}`,
      { waitUntil: "networkidle" },
    );
    if (page.url().includes("/auth/")) fail(`auth failed: ${page.url()}`);
    return page;
  }

  async function createForm(options: {
    label: string;
    pages: number;
    scope: "PRIVATE" | "GLOBAL";
    ownerUserId: string | null;
    family: string;
  }): Promise<number> {
    const { data, error } = await admin
      .from("forms")
      .insert({
        form_code: `PQA-${stamp}`,
        form_name: `Placement QA Contract ${options.label} ${stamp}`,
        form_category: "OTHER",
        state_code: "TX",
        version_label: options.label,
        source_storage_path: `pending/placement-qa-${stamp}-${options.label}.pdf`,
        scope: options.scope,
        owner_user_id: options.ownerUserId,
        status: "ACTIVE",
        publication_state: "DRAFT",
        form_family_key: options.family,
      })
      .select("id")
      .single();
    if (error || !data) fail(`form create failed: ${error?.message}`);
    const formId = data.id as number;
    formIds.push(formId);
    const storagePath = buildFormStoragePath({
      scope: options.scope,
      formId,
      fileName: `placement-qa-${options.label}.pdf`,
      ownerUserId: options.ownerUserId,
    });
    const { error: uploadError } = await admin.storage
      .from(FORM_TEMPLATES_BUCKET)
      .upload(storagePath, await fixturePdf(options.pages, `Contract ${options.label}`), {
        contentType: "application/pdf",
      });
    if (uploadError) fail(uploadError.message);
    formStoragePaths.push(storagePath);
    await admin.from("forms").update({ source_storage_path: storagePath }).eq("id", formId);
    return formId;
  }

  async function publish(formId: number, actorUserId: string, retireFormId: number | null = null) {
    const { data: fingerprint, error: fingerprintError } = await admin.rpc("form_publish_structure_fingerprint", {
      p_form_id: formId,
    });
    if (fingerprintError || !fingerprint) fail(`fingerprint failed: ${fingerprintError?.message}`);
    const { error } = await admin.rpc("publish_form_template", {
      p_form_id: formId,
      p_retire_form_id: retireFormId,
      p_reason: "Placement template browser QA",
      p_actor_user_id: actorUserId,
      p_expected_structure_fingerprint: fingerprint,
    });
    if (error) fail(`publish failed: ${error.message}`);
  }

  async function templateFor(formId: number, scope: "PERSONAL" | "ORGANIZATION") {
    const { data } = await admin
      .from("signing_placement_templates")
      .select("id, copied_from_template_id")
      .eq("form_id", formId)
      .eq("scope_type", scope)
      .eq("status", "ACTIVE")
      .maybeSingle();
    return data as { id: string; copied_from_template_id: string | null } | null;
  }

  async function templateFields(templateId: string) {
    const { data, error } = await admin
      .from("signing_placement_template_fields")
      .select("id, field_type, slot_role_code, slot_ordinal, page_number, x, y, linked_template_field_id")
      .eq("template_id", templateId);
    if (error) fail(error.message);
    return data ?? [];
  }

  async function draftFields(documentId?: string) {
    let query = admin
      .from("signing_draft_fields")
      .select("id, signing_document_id, field_type, x, y, signing_participant_id, linked_signature_draft_field_id")
      .eq("signing_id", signingId);
    if (documentId) query = query.eq("signing_document_id", documentId);
    const { data, error } = await query;
    if (error) fail(error.message);
    return data ?? [];
  }

  async function preparedContent(documentId?: string) {
    let query = admin
      .from("signing_draft_prepared_content")
      .select("id, signing_document_id, content_type, signing_participant_id")
      .eq("signing_id", signingId);
    if (documentId) query = query.eq("signing_document_id", documentId);
    const { data, error } = await query;
    if (error) fail(error.message);
    return data ?? [];
  }

  /** Placement editor helpers shared by the template editor and Prepare Documents. */
  function editor(page: Page) {
    const pdfPage = (index: number) => page.locator(".react-pdf__Page").nth(index);
    const tool = (type: string) => page.locator(`[data-testid="placement-tool-${type}"]`);
    return {
      async open() {
        await page.locator(".react-pdf__Page canvas").first().waitFor({ timeout: 60000 });
        await page.waitForTimeout(1200);
      },
      async selectSlot(name: string) {
        const select = page.locator("#prepare-participant");
        const value = await select.evaluate(
          (element, wanted) =>
            Array.from((element as HTMLSelectElement).options).find(
              (option) => option.text === wanted || option.text.startsWith(`${wanted} — `),
            )?.value ?? null,
          name,
        );
        if (!value) fail(`#prepare-participant has no option for ${name}`);
        await select.selectOption(value);
      },
      async place(type: string, pageIndex: number, pt: { x: number; y: number }) {
        const target = pdfPage(pageIndex);
        await target.scrollIntoViewIfNeeded();
        const box = (await target.boundingBox())!;
        const scale = box.width / 612;
        const button = tool(type);
        if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
        await target.hover({ position: { x: pt.x * scale + 4, y: pt.y * scale + 4 } });
        await target.hover({ position: { x: pt.x * scale, y: pt.y * scale } });
        await target.click({ position: { x: pt.x * scale, y: pt.y * scale } });
        await page.waitForTimeout(300);
        await page.getByText("Saved", { exact: true }).waitFor({ timeout: 20000 });
        await page.waitForTimeout(300);
      },
      async close() {
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await page.locator(".react-pdf__Page").first().waitFor({ state: "detached", timeout: 20000 });
      },
    };
  }

  try {
    // ---------------------------------------------------------------------
    // Fixtures
    // ---------------------------------------------------------------------
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: orgName, status: "ACTIVE" })
      .select("id")
      .single();
    if (orgError || !org) fail(orgError?.message ?? "org");
    organizationId = org.id as string;
    const pat = await newUser("pat", "Pat", "MEMBER");
    const robin = await newUser("robin", "Robin", "ORG_ADMIN");

    // Form field mappings (what Fill Form fills) on an existing ACTIVE catalog
    // field, added before publishing because published forms are locked.
    const { data: catalogField, error: catalogError } = await admin
      .from("fields")
      .select("id")
      .eq("status", "ACTIVE")
      .limit(1)
      .single();
    if (catalogError || !catalogField) fail(`no ACTIVE catalog field: ${catalogError?.message}`);
    async function mapField(
      formId: number,
      mappingName: string,
      rect: { page: number; x: number; y: number; width: number; height: number; widget?: string },
    ) {
      const { error } = await admin.from("form_field_mappings").insert({
        form_id: formId,
        field_id: catalogField!.id,
        mapping_name: mappingName,
        page_number: rect.page,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        page_width: 612,
        page_height: 792,
        field_widget_type: rect.widget ?? "text",
        status: "ACTIVE",
      });
      if (error) fail(`mapping insert failed: ${error.message}`);
    }
    const V1_AGENT_NAME = { page: 1, x: 90, y: 492, width: 220, height: 22 };

    const family = `PQA-FAMILY-${stamp}`;
    const formV1 = await createForm({ label: "v1", pages: 3, scope: "PRIVATE", ownerUserId: pat.id, family });
    await mapField(formV1, "Agent Name", V1_AGENT_NAME);
    await publish(formV1, pat.id);
    const formV2 = await createForm({ label: "v2", pages: 2, scope: "PRIVATE", ownerUserId: pat.id, family });
    await mapField(formV2, "Agent Name (v2)", { page: 1, x: 300, y: 420, width: 200, height: 18 });
    await mapField(formV2, "Buyer Signs Here (v2)", { page: 2, x: 72, y: 300, width: 12, height: 12, widget: "checkbox" });
    await publish(formV2, pat.id, formV1);
    const formGlobal = await createForm({
      label: "global",
      pages: 2,
      scope: "GLOBAL",
      ownerUserId: null,
      family: `PQA-GLOBAL-${stamp}`,
    });
    await publish(formGlobal, LEE_USER_ID);
    ok("fixtures: retired v1 (3 pages) and published v2 (2 pages) in one family, a published Global form (2 pages)");

    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({ owner_user_id: pat.id, label: `Placement QA Packet ${stamp}`, status: "ACTIVE", packet_type: "custom" })
      .select("id")
      .single();
    if (packetError || !packet) fail(packetError?.message ?? "packet");
    packetId = packet.id as number;
    for (const [formId, name, pages, order] of [
      [formV2, "Contract v2", 2, 1],
      [formGlobal, "Global Addendum", 2, 2],
    ] as const) {
      const { data: pf, error } = await admin
        .from("packet_forms")
        .insert({
          packet_id: packetId,
          form_id: formId,
          status: "ACTIVE",
          document_state: "DRAFT",
          availability_state: "AVAILABLE",
          document_name: name,
          document_type: "PDF",
          origin: "added_internal",
          sort_order: order,
          is_required: false,
          field_data: {},
          owner_user_id: pat.id,
        })
        .select("id")
        .single();
      if (error || !pf) fail(`packet form: ${error?.message}`);
      packetFormIds.push(pf.id as number);
      const storagePath = `users/${pat.id}/packets/${packetId}/${pf.id}-placement-qa.pdf`;
      const { error: uploadError } = await admin.storage
        .from(GENERATED_DOCUMENTS_BUCKET)
        .upload(storagePath, await fixturePdf(pages, name), { contentType: "application/pdf" });
      if (uploadError) fail(uploadError.message);
      generatedPaths.push(storagePath);
      await admin.from("packet_forms").update({ storage_path: storagePath }).eq("id", pf.id);
    }
    ok("fixture Packet holds the v2 contract and the Global addendum");

    // ---------------------------------------------------------------------
    // 37. Personal template on the exact form version
    // ---------------------------------------------------------------------
    const patPage = await signIn(pat.email, "pat", "/forms");
    ok("signed in as Pat (organization member)");
    // Prefer the Actions menu (no horizontal button strip).
    const actionsButton = patPage.getByTestId("form-row-actions").first();
    await actionsButton.waitFor({ timeout: 60000 });
    await actionsButton.click();
    const placementsItem = patPage.getByTestId("form-row-signing-placements").or(
      patPage.getByRole("menuitem", { name: "Signing placements" }),
    );
    await placementsItem.first().waitFor({ timeout: 10000 });
    ok("Forms list Actions menu offers Signing placements without a horizontal button strip");
    await patPage.keyboard.press("Escape");

    await patPage.goto(`${APP_ORIGIN}/forms/${formV1}/signing-placements`, { waitUntil: "networkidle" });
    const versionLine = patPage.locator('[data-testid="placement-form-version"]');
    await versionLine.waitFor({ timeout: 60000 });
    const v1Display = (await versionLine.innerText()).trim();
    if (!v1Display.includes("Version v1") || !v1Display.includes(`Form #${formV1}`)) {
      fail(`page must show the exact form version: ${v1Display}`);
    }
    await patPage.getByRole("button", { name: "Create Personal template" }).click();
    const patEditor = editor(patPage);
    await patEditor.open();
    await patPage.getByText("Signer slot", { exact: true }).first().waitFor();
    const slotOptions = await patPage.locator("#prepare-participant option").allInnerTexts();
    if (!slotOptions.includes("Buyer 1 — Buyer") || !slotOptions.includes("Seller 2 — Seller")) {
      fail(`slot selector must list signer slots: ${slotOptions.join(", ")}`);
    }
    if (slotOptions.some((option) => option.includes("@") || option.includes("Pat"))) {
      fail("slot selector must not list people");
    }
    await patEditor.selectSlot("Buyer 1");
    await patEditor.place("SIGNATURE", 0, { x: 100, y: 500 });
    await patEditor.selectSlot("Buyer 2");
    await patEditor.place("SIGNATURE", 0, { x: 100, y: 600 });
    await patEditor.selectSlot("Seller 1");
    await patEditor.place("PRINTED_NAME", 0, { x: 100, y: 300 });
    await patEditor.place("CHECKMARK", 0, { x: 80, y: 200 });
    await patEditor.selectSlot("Buyer 1");
    await patEditor.place("INITIALS", 2, { x: 450, y: 700 });
    await shot(patPage, "37-personal-template-editor");
    const personalV1 = await templateFor(formV1, "PERSONAL");
    if (!personalV1) fail("Personal template row missing");
    const v1Fields = await templateFields(personalV1.id);
    const byType = (rows: typeof v1Fields, type: string) => rows.filter((row) => row.field_type === type);
    const check = byType(v1Fields, "CHECKMARK")[0];
    const dates = byType(v1Fields, "DATE_SIGNED");
    if (
      v1Fields.length !== 7 ||
      !check ||
      check.slot_role_code !== null ||
      dates.length !== 2 ||
      dates.some((date) => {
        const source = v1Fields.find((row) => row.id === date.linked_template_field_id);
        return !source || source.slot_role_code !== date.slot_role_code || source.slot_ordinal !== date.slot_ordinal;
      }) ||
      byType(v1Fields, "INITIALS")[0]?.page_number !== 3
    ) {
      fail(`template placements: ${JSON.stringify(v1Fields)}`);
    }
    ok("Personal template placements saved by slot: Buyer 1/Buyer 2 Signatures with same-slot Dates, Seller 1 Printed Name, a slotless Checkmark, Buyer 1 Initials on page 3");

    // Mapped Form fields: context only, on by default, aligned at every zoom.
    const mappedRegions = patPage.locator("[data-mapped-region]");
    const mappedToggle = patPage.getByTestId("show-mapped-fields");
    if ((await mappedRegions.count()) !== 1) fail(`v1 editor must show its 1 mapped region, got ${await mappedRegions.count()}`);
    if ((await mappedToggle.getAttribute("aria-checked")) !== "true") fail("Show mapped fields must default on");
    if ((await mappedRegions.first().innerText()).trim() !== "Agent Name") fail("mapped region must show its label");
    if ((await mappedRegions.first().getAttribute("title")) !== "Agent Name") fail("mapped region must carry its full label");
    async function expectRegionAligned(when: string) {
      await patPage.waitForTimeout(600);
      const pageBox = (await patPage.locator(".react-pdf__Page").first().boundingBox())!;
      const scale = pageBox.width / 612;
      const box = (await mappedRegions.first().boundingBox())!;
      const off = [
        box.x - (pageBox.x + V1_AGENT_NAME.x * scale),
        box.y - (pageBox.y + V1_AGENT_NAME.y * scale),
        box.width - V1_AGENT_NAME.width * scale,
        box.height - V1_AGENT_NAME.height * scale,
      ].map(Math.abs);
      if (off.some((delta) => delta > 1.5)) fail(`mapped region misaligned at ${when}: ${off.join(", ")}`);
      return pageBox.width;
    }
    const fitWidth = await expectRegionAligned("Fit Width");
    await patPage.getByRole("button", { name: "Zoom in" }).click();
    await patPage.getByRole("button", { name: "Zoom in" }).click();
    const zoomed = await expectRegionAligned("zoomed in");
    await patPage.getByRole("button", { name: "Fit Page" }).click();
    const fitPage = await expectRegionAligned("Fit Page");
    await patPage.getByRole("button", { name: "Zoom out" }).click();
    await expectRegionAligned("zoomed out");
    await patPage.getByRole("button", { name: "Fit Width" }).click();
    await expectRegionAligned("Fit Width again");
    if (new Set([Math.round(fitWidth), Math.round(zoomed), Math.round(fitPage)]).size < 2) {
      fail("zoom controls did not change the rendered page size");
    }
    ok("mapped Form field shown by default with its label, aligned within 1.5px at Fit Width, zoomed in, Fit Page and zoomed out");

    const signingOverlays = patPage.locator(".signing-field-overlay");
    const overlaysBefore = await signingOverlays.count();
    await mappedToggle.click();
    if ((await mappedRegions.count()) !== 0) fail("turning Show mapped fields off must hide mapped regions");
    if ((await signingOverlays.count()) !== overlaysBefore) fail("hiding mapped fields must not touch Signing placements");
    await mappedToggle.click();
    if ((await mappedRegions.count()) !== 1) fail("turning Show mapped fields on must show them again");
    ok("Show mapped fields hides and restores only the mapped regions; Signing placements unchanged");

    const pointerEvents = await mappedRegions.first().evaluate((node) => getComputedStyle(node).pointerEvents);
    if (pointerEvents !== "none") fail(`mapped region must not take pointer events (${pointerEvents})`);
    const buyer1Signature = byType(v1Fields, "SIGNATURE").find((row) => row.slot_role_code === "BUYER" && row.slot_ordinal === 1)!;
    const sigY = Number(buyer1Signature.y);
    if (!(sigY < V1_AGENT_NAME.y + V1_AGENT_NAME.height && sigY + 10 > V1_AGENT_NAME.y)) {
      fail(`the Buyer 1 Signature was meant to be placed over the mapped field (y=${sigY})`);
    }
    // Drag Buyer 2's Signature (y≈600) across the mapped field, then resize it there.
    /** The Signing overlay whose top-left sits at this PDF point, scrolled into view. */
    async function overlayAtPdf(x: number, y: number) {
      const firstPage = patPage.locator(".react-pdf__Page").first();
      const box = (await firstPage.boundingBox())!;
      const s = box.width / 612;
      const index = await signingOverlays.evaluateAll(
        (nodes, want) =>
          nodes.findIndex((node) => {
            const rect = node.getBoundingClientRect();
            return Math.abs(rect.left - want.left) < 4 && Math.abs(rect.top - want.top) < 4;
          }),
        { left: box.x + x * s, top: box.y + y * s },
      );
      if (index < 0) fail(`no Signing overlay at (${x}, ${y})`);
      const overlay = signingOverlays.nth(index);
      await overlay.scrollIntoViewIfNeeded();
      await patPage.waitForTimeout(300);
      return { overlay, page: (await firstPage.boundingBox())!, box: (await overlay.boundingBox())! };
    }
    const buyer2 = byType(v1Fields, "SIGNATURE").find((row) => row.slot_role_code === "BUYER" && row.slot_ordinal === 2)!;
    const b2 = { x: Number(buyer2.x), y: Number(buyer2.y) };
    const grabbed = await overlayAtPdf(b2.x, b2.y);
    const pageBox = grabbed.page;
    const scale = pageBox.width / 612;
    const start = { x: grabbed.box.x + 20, y: grabbed.box.y + grabbed.box.height / 2 };
    const target = { x: start.x + 40 * scale, y: start.y - (b2.y - (V1_AGENT_NAME.y - 40)) * scale };
    await patPage.mouse.move(start.x, start.y);
    await patPage.mouse.down();
    await patPage.mouse.move(start.x + 10, (start.y + target.y) / 2, { steps: 8 });
    await patPage.mouse.move(target.x, target.y, { steps: 8 });
    await patPage.mouse.up();
    await patPage.getByText("Saved", { exact: true }).waitFor({ timeout: 20000 });
    await patPage.waitForTimeout(800);
    const moved = (await templateFields(personalV1.id)).find((row) => row.id === buyer2.id)!;
    if (Math.abs(Number(moved.y) - b2.y) < 40) fail(`dragging across a mapped field must move the Signature (${b2.y} -> ${moved.y})`);
    const resizeTarget = await overlayAtPdf(Number(moved.x), Number(moved.y));
    const movedBox = {
      right: resizeTarget.box.x + resizeTarget.box.width,
      bottom: resizeTarget.box.y + resizeTarget.box.height,
    };
    const { data: beforeResize } = await admin
      .from("signing_placement_template_fields")
      .select("width")
      .eq("id", buyer2.id)
      .single();
    const widthBefore = Number(beforeResize?.width);
    if (!(widthBefore > 0)) fail("Buyer 2 Signature width missing");
    await patPage.mouse.move(movedBox.right - 2, movedBox.bottom - 2);
    await patPage.mouse.down();
    await patPage.mouse.move(movedBox.right + 30, movedBox.bottom + 10, { steps: 8 });
    await patPage.mouse.up();
    await patPage.getByText("Saved", { exact: true }).waitFor({ timeout: 20000 });
    await patPage.waitForTimeout(800);
    const { data: resizedRow } = await admin
      .from("signing_placement_template_fields")
      .select("width")
      .eq("id", buyer2.id)
      .single();
    if (!(Number(resizedRow?.width) > widthBefore + 10)) {
      fail(`resizing next to a mapped field must persist (${widthBefore} -> ${resizedRow?.width})`);
    }
    await shot(patPage, "37-mapped-fields-overlap");
    ok("a Signature placed over the mapped field saved; another dragged across it and resized beside it; overlays never take the pointer");

    await patEditor.close();
    await patPage.getByRole("button", { name: "Edit placements" }).first().click();
    await patEditor.open();
    if ((await mappedRegions.count()) !== 1) fail("mapped region must return on reopen");
    if ((await templateFields(personalV1.id)).length !== 7) fail("placements must persist across reopen");
    ok("close/reopen: 7 placements persist; mapped region still comes from the form version");
    await patEditor.close();
    const personalSummary = patPage.locator('[data-testid="placement-personal-summary"]');
    await personalSummary.getByText("Placement template available · Pat Personal · 7 placements").waitFor({ timeout: 20000 });
    ok('Form page reads "Placement template available · Pat Personal · 7 placements"');
    await shot(patPage, "37-personal-template-page");

    // ---------------------------------------------------------------------
    // 46. Copy from another version, with page mismatch
    // ---------------------------------------------------------------------
    await patPage.goto(`${APP_ORIGIN}/forms/${formV2}/signing-placements`, { waitUntil: "networkidle" });
    await versionLine.waitFor({ timeout: 60000 });
    if (!(await versionLine.innerText()).includes(`Form #${formV2}`)) fail("v2 page shows the wrong version");
    await patPage.getByRole("button", { name: "Copy from another version…" }).click();
    const copyDialog = patPage.locator('[data-testid="placement-copy-dialog"]');
    await copyDialog.waitFor();
    const sourceOption = (await copyDialog.locator("#placement-copy-source option").first().innerText()).trim();
    if (!sourceOption.startsWith("Same form family · ") || !sourceOption.includes(`Form #${formV1}`)) {
      fail(`copy source must be the same-family v1 template: ${sourceOption}`);
    }
    if ((await copyDialog.locator('[data-testid="placement-copy-warning"]').innerText()).trim() !== COPY_FROM_VERSION_WARNING) {
      fail("copy dialog must show the review warning");
    }
    await shot(patPage, "46-copy-dialog");
    await copyDialog.locator('[data-testid="placement-copy-confirm"]').click();
    await patEditor.open();
    const reviewBanner = patPage.locator('[data-testid="placement-copy-review-warning"]');
    await reviewBanner.waitFor({ timeout: 20000 });
    if ((await reviewBanner.innerText()).trim() !== COPY_FROM_VERSION_WARNING) fail("editor must show the copy review warning");
    await patPage
      .locator('[data-testid="placement-page-notice"]')
      .getByText("Copied 6 placements. 1 placement on page 3 was not copied because this version has fewer pages.")
      .waitFor({ timeout: 20000 });
    await shot(patPage, "46-copied-template-review");
    const personalV2 = await templateFor(formV2, "PERSONAL");
    if (!personalV2 || personalV2.copied_from_template_id !== personalV1.id) fail("copied template row missing");
    const v2Fields = await templateFields(personalV2.id);
    if (v2Fields.length !== 6 || v2Fields.some((row) => row.page_number > 2)) {
      fail(`copied placements: ${JSON.stringify(v2Fields)}`);
    }
    if ((await templateFields(personalV1.id)).length !== 7) fail("copying changed the source template");
    ok("copy opened the editor with the review warning; 6 placements copied, page 3's 1 skipped and reported; source untouched");
    const v2Labels = (await patPage.locator("[data-mapped-region]").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("title")),
    )).sort();
    if (JSON.stringify(v2Labels) !== JSON.stringify(["Agent Name (v2)", "Buyer Signs Here (v2)"])) {
      fail(`copied template must show the TARGET version's mapped fields only: ${JSON.stringify(v2Labels)}`);
    }
    const copiedSignature = v2Fields.find((row) => row.field_type === "SIGNATURE" && row.page_number === 1)!;
    const copied = await overlayAtPdf(Number(copiedSignature.x), Number(copiedSignature.y));
    const v2Scale = copied.page.width / 612;
    const grab = { x: copied.box.x + 20, y: copied.box.y + copied.box.height / 2 };
    await patPage.mouse.move(grab.x, grab.y);
    await patPage.mouse.down();
    await patPage.mouse.move(grab.x + 60 * v2Scale, grab.y - 30 * v2Scale, { steps: 6 });
    await patPage.mouse.move(grab.x + 120 * v2Scale, grab.y - 60 * v2Scale, { steps: 6 });
    await patPage.mouse.up();
    await patPage.getByText("Saved", { exact: true }).waitFor({ timeout: 20000 });
    await patPage.waitForTimeout(800);
    const repositioned = (await templateFields(personalV2.id)).find((row) => row.id === copiedSignature.id)!;
    if (Math.abs(Number(repositioned.y) - Number(copiedSignature.y)) < 40) {
      fail("a copied placement must stay editable next to the target version's mapped field");
    }
    await shot(patPage, "46-copied-template-target-mappings");
    ok("copied template shows only the v2 mapped fields (not v1's); a copied Signature was dragged next to v2's Agent Name");
    await patEditor.close();
    await personalSummary.getByText("Placement template available · Pat Personal · 6 placements").waitFor({ timeout: 20000 });

    // ---------------------------------------------------------------------
    // 38. Organization template: admin edits, member views
    // ---------------------------------------------------------------------
    const robinPage = await signIn(robin.email, "robin", `/forms/${formGlobal}/signing-placements`);
    ok("signed in as Robin (organization admin)");
    const orgCard = (page: Page) => page.locator('[data-testid="placement-organization-card"]');
    await orgCard(robinPage).waitFor({ timeout: 60000 });
    await orgCard(robinPage).getByRole("button", { name: "Create Organization template" }).click();
    const robinEditor = editor(robinPage);
    await robinEditor.open();
    await robinEditor.selectSlot("Buyer 1");
    await robinEditor.place("SIGNATURE", 0, { x: 100, y: 500 });
    await robinEditor.selectSlot("Seller 1");
    await robinEditor.place("SIGNATURE", 0, { x: 100, y: 600 });
    await robinEditor.close();
    const orgLabel = `${orgName} Organization`;
    await orgCard(robinPage)
      .locator('[data-testid="placement-organization-summary"]')
      .getByText(`Placement template available · ${orgLabel} · 4 placements`)
      .waitFor({ timeout: 20000 });
    await shot(robinPage, "38-organization-template-admin");
    ok(`organization admin created "${orgLabel}" with 4 placements`);

    await patPage.goto(`${APP_ORIGIN}/forms/${formGlobal}/signing-placements`, { waitUntil: "networkidle" });
    await orgCard(patPage).waitFor({ timeout: 60000 });
    await orgCard(patPage).getByText(`Placement template available · ${orgLabel} · 4 placements`).waitFor();
    if ((await orgCard(patPage).getByRole("button", { name: "Delete template" }).count()) !== 0) {
      fail("a member must not be offered Delete template");
    }
    if ((await orgCard(patPage).getByRole("button", { name: "Edit placements" }).count()) !== 0) {
      fail("a member must not be offered Edit placements");
    }
    await orgCard(patPage).getByRole("button", { name: "View placements" }).click();
    await patEditor.open();
    if ((await patPage.locator('[data-testid^="placement-tool-"]').count()) !== 0) {
      fail("the member's view of the Organization template must have no placement tools");
    }
    await patPage.getByText("View only. An organization admin can change this template.", { exact: false }).waitFor();
    await shot(patPage, "38-organization-template-member-view");
    await patEditor.close();
    ok("a member sees the Organization template view-only: no Edit, no Delete, no placement tools");

    // ---------------------------------------------------------------------
    // Signing with one Buyer, one Seller, and an extra Agent
    // ---------------------------------------------------------------------
    await patPage.goto(`${APP_ORIGIN}/signings`, { waitUntil: "networkidle" });
    const createButton = patPage.getByRole("button", { name: "Create Signing" }).first();
    await createButton.waitFor({ timeout: 60000 });
    await patPage.locator("#signing-title").fill(`Placement QA ${stamp}`);
    await createButton.click();
    await patPage.waitForURL(/\/signings\/[0-9a-f-]{36}/, { timeout: 60000 });
    signingId = patPage.url().split("/signings/")[1].split(/[?#/]/)[0];
    const participantList = patPage.locator('[data-testid="draft-participant-list"]');
    for (const [name, role] of [
      ["Bailey Buyer", "BUYER"],
      ["Sloane Seller", "SELLER"],
      ["Avery Agent", "AGENT"],
    ] as const) {
      await patPage.locator("#participant-name").fill(name);
      await patPage.locator("#participant-role").selectOption(role);
      await patPage.getByRole("button", { name: "Add participant", exact: true }).click();
      await participantList.getByText(name).waitFor({ timeout: 30000 });
    }
    await patPage.locator("#source-packet").selectOption(String(packetId));
    await patPage.getByRole("button", { name: "Use this Packet" }).click();
    await patPage.getByText(/Packet selected\./).waitFor({ timeout: 30000 });
    await patPage.getByRole("button", { name: "Add all remaining packet documents" }).click();
    await patPage.getByText(/Added 2 documents from the Packet/).waitFor({ timeout: 60000 });
    const { data: participants } = await admin
      .from("signing_participants")
      .select("id, full_name")
      .eq("signing_id", signingId);
    const pid = (name: string) => (participants ?? []).find((row) => row.full_name === name)?.id as string;
    const { data: documents } = await admin
      .from("signing_documents")
      .select("id, display_order, source_packet_form_id")
      .eq("signing_id", signingId)
      .eq("included_in_draft", true);
    const docV2 = (documents ?? []).find((row) => row.source_packet_form_id === packetFormIds[0])?.id as string;
    const docGlobal = (documents ?? []).find((row) => row.source_packet_form_id === packetFormIds[1])?.id as string;
    if (!docV2 || !docGlobal) fail(`documents: ${JSON.stringify(documents)}`);
    ok("Draft Signing created in the UI with Bailey Buyer, Sloane Seller, Avery Agent and both Packet documents");

    // ---------------------------------------------------------------------
    // 40-44. Exact version, slot mapping, missing slot, extra participant, explicit apply
    // ---------------------------------------------------------------------
    await patPage.getByRole("button", { name: "Prepare Documents", exact: true }).first().click();
    await patPage.getByRole("heading", { name: "Prepare Documents" }).waitFor();
    const prepare = editor(patPage);
    await prepare.open();
    const documentSelect = patPage.locator('select[aria-label="Document"]');
    await documentSelect.selectOption(docV2);
    const panel = patPage.locator('[data-testid="placement-template-panel"]');
    const source = panel.locator('[data-testid="placement-template-source"]');
    await source.getByText("Pat Personal · 6 placements").waitFor({ timeout: 30000 });
    await panel.getByText("Placement template available").waitFor();
    if ((await draftFields()).length !== 0 || (await preparedContent()).length !== 0) {
      fail("opening Prepare Documents must never apply a template automatically");
    }
    ok('v2 document offers "Pat Personal · 6 placements" (the v2 copy, not v1\'s 7); nothing applied automatically');
    await shot(patPage, "40-template-available");

    const applyDialog = patPage.locator('[data-testid="placement-template-apply-dialog"]');
    await panel.locator('[data-testid="placement-template-review"]').click();
    await applyDialog.waitFor();
    const mapping = applyDialog.locator('[data-testid="placement-template-mapping"]');
    await mapping.locator('[data-slot="BUYER:1"]').getByText("Bailey Buyer (2 placements)").waitFor();
    await mapping.locator('[data-slot="SELLER:1"]').getByText("Sloane Seller (1 placement)").waitFor();
    const unresolved = (await mapping.locator('[data-testid="placement-template-unresolved"]').allInnerTexts()).map((text) => text.trim());
    if (unresolved.length !== 1 || unresolved[0] !== "Buyer 2 has no matching participant. 2 placements will not be added.") {
      fail(`unresolved notices: ${JSON.stringify(unresolved)}`);
    }
    if ((await mapping.innerText()).includes("Avery Agent")) fail("an extra participant must not be mapped");
    await applyDialog
      .locator('[data-testid="placement-template-summary"]')
      .getByText("4 placements will be added as ordinary Draft placements.")
      .waitFor();
    const applyButton = applyDialog.locator('[data-testid="placement-template-apply"]');
    if ((await applyButton.innerText()).trim() !== "Apply available placements") fail("button must read Apply available placements");
    await shot(patPage, "41-42-apply-preview");
    await applyDialog.getByRole("button", { name: "Cancel" }).click();
    await applyDialog.waitFor({ state: "detached" });
    await patPage.waitForTimeout(800);
    if ((await draftFields()).length !== 0 || (await preparedContent()).length !== 0) fail("Cancel must apply nothing");
    ok("preview maps Buyer 1 -> Bailey Buyer and Seller 1 -> Sloane Seller, reports the missing Buyer 2 slot, omits the extra Agent; Cancel applies nothing");

    await panel.locator('[data-testid="placement-template-review"]').click();
    await applyDialog.waitFor();
    await applyDialog.locator('[data-testid="placement-template-apply"]').click();
    await applyDialog.waitFor({ state: "detached", timeout: 30000 });
    await panel
      .locator('[data-testid="placement-template-notice"]')
      .getByText(
        "Added 4 placements from Pat Personal. 2 placements were not added because their signer slots have no matching participant. Every placement can now be edited like any other.",
      )
      .waitFor({ timeout: 30000 });
    let fields = await draftFields(docV2);
    let prepared = await preparedContent(docV2);
    const baileySig = fields.find((row) => row.field_type === "SIGNATURE");
    const baileyDate = fields.find((row) => row.field_type === "DATE_SIGNED");
    if (
      fields.length !== 2 ||
      baileySig?.signing_participant_id !== pid("Bailey Buyer") ||
      baileyDate?.signing_participant_id !== pid("Bailey Buyer") ||
      baileyDate.linked_signature_draft_field_id !== baileySig.id ||
      prepared.length !== 2 ||
      prepared.find((row) => row.content_type === "PRINTED_NAME")?.signing_participant_id !== pid("Sloane Seller") ||
      prepared.find((row) => row.content_type === "CHECKMARK")?.signing_participant_id !== null
    ) {
      fail(`applied placements: ${JSON.stringify({ fields, prepared })}`);
    }
    const allParticipantIds = [...fields, ...prepared].map((row) => row.signing_participant_id);
    if (allParticipantIds.includes(pid("Avery Agent"))) fail("the extra participant received a placement");
    await patPage.locator('[data-field-type="SIGNATURE"][data-field-label="Bailey Buyer"]').waitFor({ timeout: 20000 });
    await patPage.locator('[data-field-type="PRINTED_NAME"]', { hasText: "Sloane Seller" }).waitFor();
    await shot(patPage, "43-44-applied");
    ok("explicit apply added 4 placements (Bailey's Signature then its linked Date, Sloane's Printed Name, an unassigned Checkmark); the Agent got nothing; overlays render without a reload");

    // ---------------------------------------------------------------------
    // 45. Applied placements are ordinary, editable, and unlinked
    // ---------------------------------------------------------------------
    const sigOverlay = patPage.locator('.signing-field-overlay:has([aria-label="Signature for Bailey Buyer"])').first();
    await sigOverlay.scrollIntoViewIfNeeded();
    await patPage.waitForTimeout(400);
    const sigBox = (await sigOverlay.boundingBox())!;
    await patPage.mouse.move(sigBox.x + 20, sigBox.y + sigBox.height / 2);
    await patPage.mouse.down();
    await patPage.mouse.move(sigBox.x + 80, sigBox.y + sigBox.height / 2 + 30, { steps: 10 });
    await patPage.mouse.up();
    let movedSig = baileySig;
    for (let attempt = 0; attempt < 40 && Math.abs(movedSig.x - baileySig.x) < 10; attempt += 1) {
      await patPage.waitForTimeout(250);
      movedSig = (await draftFields(docV2)).find((row) => row.id === baileySig.id)!;
    }
    if (Math.abs(movedSig.x - baileySig.x) < 10) fail("dragging an applied placement did not persist");
    await patPage.getByText("Saved", { exact: true }).waitFor({ timeout: 20000 });
    const templateSig = (await templateFields(personalV2.id)).find(
      (row) => row.field_type === "SIGNATURE" && row.slot_role_code === "BUYER" && row.slot_ordinal === 1,
    );
    const originalTemplateSig = v2Fields.find((row) => row.id === templateSig?.id);
    if (!templateSig || templateSig.x !== originalTemplateSig?.x || templateSig.y !== originalTemplateSig?.y) {
      fail("editing an applied placement changed the template");
    }
    ok("an applied Signature drags and saves like any Draft placement; the template is unchanged");

    // ---------------------------------------------------------------------
    // 47. Reapply warns, adds alongside, and a double click applies once
    // ---------------------------------------------------------------------
    await panel.locator('[data-testid="placement-template-review"]').click();
    await applyDialog.waitFor();
    await applyDialog
      .locator('[data-testid="placement-template-existing"]')
      .getByText("This document already has 4 placements.", { exact: false })
      .waitFor();
    await shot(patPage, "47-reapply-warning");
    await applyDialog.locator('[data-testid="placement-template-apply"]').dblclick();
    await applyDialog.waitFor({ state: "detached", timeout: 30000 });
    await panel.locator('[data-testid="placement-template-notice"]').waitFor({ timeout: 30000 });
    await patPage.waitForTimeout(1500);
    fields = await draftFields(docV2);
    prepared = await preparedContent(docV2);
    if (fields.length !== 4 || prepared.length !== 4) {
      fail(`reapply with a double click must add exactly one more set: ${fields.length} fields, ${prepared.length} prepared`);
    }
    if (!fields.some((row) => row.id === baileySig.id && row.x === movedSig.x)) {
      fail("reapplying removed or moved the existing placement");
    }
    const { count: applicationCount } = await admin
      .from("signing_placement_template_applications")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", signingId);
    if (applicationCount !== 2) fail(`expected 2 recorded applications, got ${applicationCount}`);
    ok("reapply warned about the 4 existing placements, then a double click added exactly 4 more alongside them (8 total); the moved placement is untouched");

    // ---------------------------------------------------------------------
    // 39. Organization template, then Personal precedence (no merge)
    // ---------------------------------------------------------------------
    await documentSelect.selectOption(docGlobal);
    await source.getByText(`${orgLabel} · 4 placements`).waitFor({ timeout: 30000 });
    await panel.locator('[data-testid="placement-template-review"]').click();
    await applyDialog.waitFor();
    if ((await applyDialog.locator('[data-testid="placement-template-unresolved"]').count()) !== 0) {
      fail("every Organization slot has a participant");
    }
    if ((await applyDialog.locator('[data-testid="placement-template-apply"]').innerText()).trim() !== "Apply placements") {
      fail("button must read Apply placements when nothing is skipped");
    }
    await applyDialog.getByRole("button", { name: "Cancel" }).click();
    await applyDialog.waitFor({ state: "detached" });
    await shot(patPage, "39-organization-template-offered");
    ok(`the Global document offers "${orgLabel} · 4 placements" to a member with no Personal template`);

    const patForms = await patPage.context().newPage();
    noise.watch(patForms, "pat-forms");
    watchEditorPdf(patForms, "pat-forms");
    await patForms.goto(`${APP_ORIGIN}/forms/${formGlobal}/signing-placements`, { waitUntil: "networkidle" });
    await patForms.getByRole("button", { name: "Create Personal template" }).waitFor({ timeout: 60000 });
    await patForms.getByRole("button", { name: "Create Personal template" }).click();
    const patFormsEditor = editor(patForms);
    await patFormsEditor.open();
    await patForms
      .getByText("No placements yet. Choose a signer slot and a field, then click the page.")
      .waitFor({ timeout: 20000 });
    if ((await patForms.getByTestId("placement-document-load-error").count()) !== 0) {
      fail("a new zero-placement Global Form Personal template must load its form PDF");
    }
    ok("a new zero-placement Global Form Personal template opens with the form PDF rendered");
    await patFormsEditor.selectSlot("Buyer 1");
    await patFormsEditor.place("INITIALS", 1, { x: 450, y: 700 });
    await patFormsEditor.close();
    await patForms
      .locator('[data-testid="placement-personal-summary"]')
      .getByText("Placement template available · Pat Personal · 1 placement")
      .waitFor({ timeout: 20000 });
    await patForms.getByText("Not used for your Signings while you have a Personal template.").waitFor();
    await shot(patForms, "39-personal-wins-page");
    await patForms.close();

    await documentSelect.selectOption(docV2);
    await source.getByText("Pat Personal · 6 placements").waitFor({ timeout: 30000 });
    await documentSelect.selectOption(docGlobal);
    await source.getByText("Pat Personal · 1 placement").waitFor({ timeout: 30000 });
    await panel.locator('[data-testid="placement-template-review"]').click();
    await applyDialog.waitFor();
    await applyDialog.locator('[data-testid="placement-template-apply"]').click();
    await applyDialog.waitFor({ state: "detached", timeout: 30000 });
    await panel.locator('[data-testid="placement-template-notice"]').getByText("Added 1 placement from Pat Personal.", { exact: false }).waitFor({ timeout: 30000 });
    const globalFields = await draftFields(docGlobal);
    if (
      globalFields.length !== 1 ||
      globalFields[0].field_type !== "INITIALS" ||
      globalFields[0].signing_participant_id !== pid("Bailey Buyer") ||
      (await preparedContent(docGlobal)).length !== 0
    ) {
      fail(`Personal must fully replace the Organization template: ${JSON.stringify(globalFields)}`);
    }
    await shot(patPage, "39-personal-wins-applied");
    ok("once Pat has a Personal template it is offered and applied alone (1 Initials); nothing merged from the Organization template's 4");

    // ---------------------------------------------------------------------
    // Global Admin manages Pat's Personal template on Pat's private Form
    // ---------------------------------------------------------------------
    const gale = await newUser("gale", "Gale", "MEMBER", "ADMIN");
    const galePage = await signIn(gale.email, "gale", `/forms/${formV2}/signing-placements`);
    await galePage.getByTestId("placement-admin-on-behalf").waitFor({ timeout: 60000 });
    const banner = (await galePage.getByTestId("placement-admin-on-behalf").innerText()).trim();
    const cardTitle = (await galePage.getByTestId("placement-personal-card-title").innerText()).trim();
    if (!banner.includes("Pat Placement") || !banner.includes("not a Global template")) {
      fail(`on-behalf banner must name the owner and say it is not Global: ${banner}`);
    }
    if (cardTitle !== "Personal placement template for Pat Placement") {
      fail(`on-behalf card title must name the owner: ${cardTitle}`);
    }
    ok(`Global Admin sees "${cardTitle}" with the not-Global banner`);
    const patV2 = await templateFor(formV2, "PERSONAL");
    if (!patV2) fail("Pat's v2 Personal template missing");
    const beforeAdmin = (await templateFields(patV2.id)).length;
    const personalCard = galePage.getByTestId("placement-personal-card");
    await personalCard.getByRole("button", { name: "Edit placements" }).click();
    const galeEditor = editor(galePage);
    await galeEditor.open();
    await galeEditor.place("CHECKMARK", 0, { x: 300, y: 150 });
    await galeEditor.close();
    await personalCard.getByRole("button", { name: "Edit placements" }).click();
    await galeEditor.open();
    if ((await galePage.getByTestId("placement-document-load-error").count()) !== 0) {
      fail("on-behalf editor must reload the form PDF");
    }
    await galeEditor.close();
    const { data: patV2Row } = await admin
      .from("signing_placement_templates")
      .select("owner_user_id, scope_type, updated_by_user_id")
      .eq("id", patV2.id)
      .single();
    if (
      (await templateFields(patV2.id)).length !== beforeAdmin + 1 ||
      patV2Row?.owner_user_id !== pat.id ||
      patV2Row.scope_type !== "PERSONAL" ||
      patV2Row.updated_by_user_id !== gale.id
    ) {
      fail(`on-behalf edit must keep Pat as owner and attribute Gale: ${JSON.stringify(patV2Row)}`);
    }
    await shot(galePage, "40-admin-on-behalf-editor");
    ok("Global Admin opened the editor (PDF rendered), placed a Checkmark, closed and reopened; owner stays Pat, update attributed to Gale");

    if (pdfProblems.length > 0) fail(`editor PDF requests failed:\n${pdfProblems.join("\n")}`);
    ok(`all ${pdfOkCount} editor PDF responses were 200 application/pdf`);

    const issues = noise.issues();
    if (issues.length > 0) fail(`unexpected runtime errors/warnings:\n${issues.join("\n")}`);
    ok("no browser console errors/warnings, page errors, or dev server errors/warnings");
    console.log("\nSigning placement templates browser QA: all checks passed.");
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
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
      await admin.from("signing_placement_template_applications").delete().eq("signing_id", signingId);
      await admin.from("signing_draft_fields").update({ linked_signature_draft_field_id: null }).eq("signing_id", signingId);
      await admin.from("signing_draft_fields").delete().eq("signing_id", signingId);
      await admin.from("signing_draft_prepared_content").delete().eq("signing_id", signingId);
      await admin.from("signing_documents").update({ selected_draft_source_snapshot_id: null }).eq("signing_id", signingId);
      await admin.from("signing_draft_source_snapshots").delete().eq("signing_id", signingId);
      await admin.from("signing_documents").delete().eq("signing_id", signingId);
      await admin.from("signing_participants").delete().eq("signing_id", signingId);
      await admin.from("signing_work_items").delete().eq("signing_id", signingId);
      await admin.from("signing_events").delete().eq("signing_id", signingId);
      await admin.from("signing_event_chain_state").delete().eq("signing_id", signingId);
      await admin.from("signings").update({ current_primary_agent_association_id: null }).eq("id", signingId);
      await admin.from("signing_operator_associations").delete().eq("signing_id", signingId);
      await admin.from("signing_agent_associations").delete().eq("signing_id", signingId);
      const { error } = await admin.from("signings").delete().eq("id", signingId);
      if (error) console.error(`Cleanup: Signing ${signingId}: ${error.message}`);
    }
    if (formIds.length > 0) {
      const { data: templates } = await admin.from("signing_placement_templates").select("id").in("form_id", formIds);
      const templateIds = (templates ?? []).map((row) => row.id as string);
      if (templateIds.length > 0) {
        await admin.from("signing_placement_template_applications").delete().in("template_id", templateIds);
        await admin.from("signing_placement_template_fields").delete().in("template_id", templateIds);
        const { error } = await admin.from("signing_placement_templates").delete().in("id", templateIds);
        if (error) console.error(`Cleanup: templates: ${error.message}`);
      }
    }
    if (generatedPaths.length > 0) await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).remove(generatedPaths);
    if (packetId) {
      await admin.from("packet_forms").update({ status: "DELETED" }).eq("packet_id", packetId);
      await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    }
    for (const id of formIds) {
      await admin.from("forms").update({ status: "DELETED" }).eq("id", id);
    }
    if (formStoragePaths.length > 0) await admin.storage.from(FORM_TEMPLATES_BUCKET).remove(formStoragePaths);
    for (const id of userIds) {
      await admin.from("organization_members").delete().eq("user_id", id);
      await admin.from("profiles").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    }
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    console.log("Cleanup complete.");
  }
}

main().catch((error) => {
  console.error(error instanceof QaFailure ? `FAIL: ${error.message}` : error);
  process.exit(1);
});
