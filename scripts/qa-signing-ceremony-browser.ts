/**
 * Browser QA: participant ceremony end to end (PR #46 participant-ceremony QA).
 *
 * Disposable development fixtures only (own user, organization, Packet, two
 * Signings sent from the Draft page with the development email sandbox);
 * cleaned up in `finally` unless QA_KEEP_FIXTURES=1.
 *
 * Signing A (two participants + one copy recipient; a two-page contract and a
 * one-page addendum): link entry without workspace login, identity
 * affirmation, consent (enforced on the server too), Start signing with the
 * read-only Signing name and derived Initials, the prepared PDFs rendered in
 * the ceremony (every document, free scrolling, Fit Width / Fit Page / zoom,
 * document switching), guidance to the first required field and to the next
 * one after each accepted mark (cross-page and cross-document; failed saves
 * stay put with a retry), Your fields navigation, Sign / Initial here targets
 * drawn at their stored coordinates and clicked on the page, linked Date
 * Signed, Remove / Replace before Finish, package freeze on first accepted
 * mark, Finish confirmation, Leave for now and resume, participant isolation,
 * document-route authorization, desktop / laptop / tablet / phone viewports,
 * finalization through Complete, artifact + event-chain integrity, completed
 * PDF marks, completed-package access, manager view.
 *
 * Signing B: Resend / Replace / Revoke spot-check (sessions derived from the
 * replaced / revoked links lose document access), then Decline to sign
 * (cancelled once, then confirmed).
 *
 * Signing D: a Contact-linked participant follows the Contact while Draft, is
 * frozen once sent (later Contact edits do not reach it), then Cancel Signing.
 *
 * Signing C (in person, on the manager's own browser): Begin In-Person, hand
 * the device over, sign on the document, Finish → Return to agent with the
 * device lock intact, then unlock with the agent password.
 *
 * Participant links come from the development-only Copy signing link helper;
 * secrets are held in memory only and never printed.
 *
 *   NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-signing-ceremony-browser.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { acquireAmendmentLockWithActor } from "../lib/signing/amendment-locks.ts";
import { adoptCeremonyMark } from "../lib/signing/adopted-marks.ts";
import {
  resolveCeremonyBrowserSession,
  SIGNING_CEREMONY_COOKIE_NAME,
} from "../lib/signing/browser-sessions.ts";
import { buildCompletedPackageUrl } from "../lib/signing/bearer-transport.ts";
import { requireCeremonyWriteContext } from "../lib/signing/ceremony-context.ts";
import { loadRawCompletedPackageToken } from "../lib/signing/completed-package-credentials.ts";
import { addCopyRecipientWithActor } from "../lib/signing/copy-recipients.ts";
import { addDraftSigningDocumentWithActor } from "../lib/signing/draft-documents.ts";
import { addDraftSigningParticipantWithActor } from "../lib/signing/draft-participants.ts";
import { DEVICE_HANDOFF_LOCK_COOKIE_NAME } from "../lib/signing/device-handoff-lock.ts";
import { upsertDraftSigningFieldWithActor } from "../lib/signing/draft-fields.ts";
import { DATE_SIGNED_DEFAULT_SIZE, defaultDraftFieldSize } from "../lib/signing/draft-field-sizing.ts";
import { upsertDraftPreparedContentWithActor } from "../lib/signing/draft-prepared-content.ts";
import { SIGNING_ENTRY_COOKIE_NAME } from "../lib/signing/entry-sessions.ts";
import { verifySigningEventChain } from "../lib/signing/event-chain.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import { acceptFieldPlacement } from "../lib/signing/placements.ts";
import { renameSigningForActor } from "../lib/signing/rename.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";
import { createRuntimeNoiseGuard } from "./qa-runtime-noise.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
/** Manager-prepared content on contract page 1 (PDF points, y from top). */
const PRINTED_NAME_BOX = { pageNumber: 1, x: 330, y: 596, width: 150, height: 16 };
const CHECKMARK_BOX = { pageNumber: 1, x: 72, y: 620, width: 12, height: 12 };
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const OUT_DIR = path.join("_audit_tmp", "signing-ceremony-qa");
const GENERATED_DOCUMENTS_BUCKET = "generated-documents";
const SIGNING_ARTIFACTS_BUCKET = "signing-artifacts";
const DEV_LOG = path.join(".next", "dev", "logs", "next-development.log");

const P1 = "Avery Jordan Stone";
const P2 = "Blake Rivera";
const P3 = "Casey Decliner";
const P4 = "Drew Revoked";
const P5 = "Erin Inperson";
const AGENT = "Ceremony QA Agent";

class QaFailure extends Error {}
function fail(message: string): never {
  throw new QaFailure(message);
}
function ok(message: string) {
  console.log(`OK: ${message}`);
}
function note(message: string) {
  console.log(`NOTE: ${message}`);
}

/**
 * Electronic records consent through the real UI: the checkbox starts
 * unchecked, Continue is disabled until it is checked, then consent is sent.
 */
async function consentInUi(page: Page, label: string) {
  const checkbox = page.getByTestId("consent-acknowledge");
  const proceed = page.getByTestId("consent-continue");
  await checkbox.waitFor({ timeout: 30000 });
  if ((await checkbox.getAttribute("aria-checked")) !== "false") fail(`${label}: consent checkbox is pre-checked`);
  if (!(await proceed.isDisabled())) fail(`${label}: Continue is enabled before consent`);
  if (!(await page.getByTestId("disclosure-version").innerText()).includes("esign-disclosure-")) {
    fail(`${label}: disclosure version not shown`);
  }
  if ((await page.getByTestId("disclosure-download").count()) !== 1 || (await page.getByTestId("disclosure-print").count()) !== 1) {
    fail(`${label}: disclosure download/print missing`);
  }
  await checkbox.click();
  if ((await checkbox.getAttribute("aria-checked")) !== "true" || (await proceed.isDisabled())) {
    fail(`${label}: checking the consent box did not enable Continue`);
  }
  await proceed.click();
  await page.getByText("Disclosure accepted.").waitFor({ timeout: 30000 });
}

async function shot(page: Page, name: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });
}

const sha256 = (bytes: Uint8Array | Buffer) => createHash("sha256").update(bytes).digest("hex");

type FieldBox = { id: string; x: number; y: number; width: number; height: number; page: number };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url.includes(EXPECTED_REF)) fail(`Refusing outside development: ${url}`);
  if (process.env.SIGNING_EMAIL_SANDBOX?.trim() !== "true") {
    fail("SIGNING_EMAIL_SANDBOX=true is required so no real email is sent");
  }
  if (!process.env.SIGNING_EVENT_CHAIN_KEY?.trim()) fail("SIGNING_EVENT_CHAIN_KEY is required for finalization");
  const admin: SupabaseClient = createClient(
    url,
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const stamp = Date.now();
  const email = `ceremony-qa-${stamp}@example.com`;
  const orgName = `Ceremony QA Brokerage ${stamp}`;
  let userId = "";
  let organizationId = "";
  let packetId = 0;
  const packetFormIds: number[] = [];
  const generatedPaths: string[] = [];
  const signingIds: string[] = [];
  const contactIds: number[] = [];
  const extraUserIds: string[] = [];
  const extraOrganizationIds: string[] = [];
  const secrets: string[] = [];
  const devLogStart = existsSync(DEV_LOG) ? readFileSync(DEV_LOG, "utf8").length : 0;
  mkdirSync(OUT_DIR, { recursive: true });

  const browser: Browser = await chromium.launch({ headless: true });
  const managerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  managerContext.setDefaultNavigationTimeout(180000);
  const manager = await managerContext.newPage();
  const noise = createRuntimeNoiseGuard();
  noise.watch(manager, "manager");
  const managerInflight = new Set<unknown>();
  manager.on("request", (request) => managerInflight.add(request));
  manager.on("requestfinished", (request) => managerInflight.delete(request));
  manager.on("requestfailed", (request) => managerInflight.delete(request));
  // Chrome logs one console error per request the failed-save probe aborts.
  let simulatedDisconnects = 0;
  const participantRequestUrls: string[] = [];

  let actor: SigningActor;

  async function createPacketDocument(label: string, pageCount = 1): Promise<number> {
    const { data: form, error } = await admin
      .from("packet_forms")
      .insert({
        packet_id: packetId,
        form_id: null,
        status: "ACTIVE",
        document_state: "DRAFT",
        availability_state: "AVAILABLE",
        document_name: label,
        document_type: "PDF",
        origin: "external_upload",
        sort_order: packetFormIds.length + 1,
        is_required: false,
        field_data: {},
        owner_user_id: userId,
      })
      .select("id")
      .single();
    if (error || !form) fail(error?.message ?? "packet form");
    const packetFormId = form.id as number;
    packetFormIds.push(packetFormId);
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = doc.addPage([612, 792]);
      page.drawText(label, { x: 72, y: 720, size: 18, font });
      page.drawText(`Page ${pageNumber} of ${pageCount}`, { x: 72, y: 700, size: 10, font });
      page.drawText("Signature lines below are for participant ceremony QA.", { x: 72, y: 684, size: 10, font });
      for (let line = 0; line < 8; line += 1) {
        page.drawText(`Clause ${pageNumber}.${line + 1}: the participant may read every page before signing.`, {
          x: 72,
          y: 650 - line * 16,
          size: 10,
          font,
        });
      }
    }
    const generatedPath = `users/${userId}/packets/${packetId}/${packetFormId}-ceremony-qa.pdf`;
    const { error: uploadError } = await admin.storage
      .from(GENERATED_DOCUMENTS_BUCKET)
      .upload(generatedPath, await doc.save(), { contentType: "application/pdf" });
    if (uploadError) fail(uploadError.message);
    generatedPaths.push(generatedPath);
    await admin.from("packet_forms").update({ storage_path: generatedPath }).eq("id", packetFormId);
    return packetFormId;
  }

  async function createDraft(title: string, packetFormId: number) {
    const signing = await createDraftSigningWithActor(actor, { title, sourcePacketId: packetId }, admin);
    signingIds.push(signing.id);
    const document = await addDraftSigningDocumentWithActor(
      actor,
      { signingId: signing.id, sourcePacketFormId: packetFormId },
      admin,
    );
    return { signingId: signing.id, documentId: document.id };
  }

  async function addField(
    signingId: string,
    documentId: string,
    participantId: string,
    fieldType: "SIGNATURE" | "INITIALS" | "DATE_SIGNED",
    box: { x: number; y: number; width: number; height: number },
    extra: { isRequired?: boolean; linkedSignatureDraftFieldId?: string; pageNumber?: number } = {},
  ) {
    return upsertDraftSigningFieldWithActor(
      actor,
      {
        signingId,
        signingDocumentId: documentId,
        signingParticipantId: participantId,
        fieldType,
        pageNumber: 1,
        ...box,
        ...extra,
      },
      admin,
    );
  }

  async function sendFromDraftPage(signingId: string) {
    await manager.goto(`${APP_ORIGIN}/signings/${signingId}`, { waitUntil: "networkidle" });
    const sendButton = manager.getByRole("button", { name: "Send", exact: true });
    await sendButton.waitFor({ timeout: 60000 });
    if (!(await sendButton.isEnabled())) fail("Send is disabled for a ready Draft");
    await sendButton.click();
    const dialog = manager.getByRole("alertdialog");
    await dialog.getByText("Send this Signing?").waitFor();
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await manager.getByText("In Progress — participant access").waitFor({ timeout: 90000 });
    await managerRequestsSettled();
  }

  /** Reloading while the post-Send refresh is still streaming aborts it on the dev server ("Error: aborted"). */
  async function managerRequestsSettled() {
    const deadline = Date.now() + 30000;
    let quietSince = Date.now();
    while (Date.now() < deadline) {
      if (managerInflight.size > 0) quietSince = Date.now();
      else if (Date.now() - quietSince >= 750) return;
      await manager.waitForTimeout(100);
    }
  }

  const panel = (name: string) =>
    manager.locator("div.rounded-lg.border", { has: manager.getByText(name, { exact: true }) }).first();

  async function copySigningLink(name: string, label: string): Promise<string> {
    await manager.evaluate(() => navigator.clipboard.writeText(""));
    await panel(name).getByRole("button", { name: "Copy signing link" }).click();
    await panel(name)
      .locator('[data-testid="participant-link-status"]')
      .getByText("Signing link copied.")
      .waitFor({ timeout: 30000 });
    const link = await manager.evaluate(() => navigator.clipboard.readText());
    const parsed = new URL(link);
    if (!/^\/sign\/[0-9a-f-]{36}$/.test(parsed.pathname) || !/^#[A-Za-z0-9_-]{43}$/.test(parsed.hash) || parsed.search) {
      fail(`${label}: copied link is not /sign/{credential uuid}#<secret>`);
    }
    secrets.push(parsed.hash.slice(1));
    return link;
  }

  async function newParticipantContext(label: string, watch: boolean) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    context.setDefaultNavigationTimeout(180000);
    const page = await context.newPage();
    if (watch) noise.watch(page, label);
    page.on("request", (request) => participantRequestUrls.push(request.url()));
    return { context, page };
  }

  /** Entry exchange: secret in fragment → POST body only; lands on identity affirmation. */
  async function enter(link: string, name: string, label: string) {
    const { context, page } = await newParticipantContext(label, true);
    const exchange = page.waitForRequest((request) => request.url().endsWith("/api/sign/entry-exchange"));
    await page.goto(link, { waitUntil: "domcontentloaded" });
    const request = await exchange;
    if (request.method() !== "POST") fail(`${label}: entry exchange is not POST`);
    const secret = new URL(link).hash.slice(1);
    if (request.url().includes(secret)) fail(`${label}: secret in exchange URL`);
    if (!(request.postData() ?? "").includes(secret)) fail(`${label}: exchange body does not carry the credential`);
    await page.waitForURL(/\/sign\/continue/, { timeout: 60000 });
    await page.waitForLoadState("networkidle");
    if (new URL(page.url()).pathname.startsWith("/auth/")) fail(`${label}: sent to workspace login`);
    await page.getByRole("button", { name: `I am ${name}` }).waitFor({ timeout: 30000 });
    const cookies = await context.cookies();
    const entryCookie = cookies.find((cookie) => cookie.name === SIGNING_ENTRY_COOKIE_NAME);
    if (!entryCookie || !entryCookie.httpOnly) fail(`${label}: entry session cookie missing or not HttpOnly`);
    if (cookies.some((cookie) => cookie.value.includes(secret))) fail(`${label}: a cookie stores the raw secret`);
    return { context, page };
  }

  async function affirm(page: Page, name: string) {
    await page.getByRole("button", { name: `I am ${name}` }).click();
    await page.waitForURL(/\/sign\/ceremony/, { timeout: 60000 });
    await page.waitForLoadState("networkidle");
  }

  async function participantRow(signingId: string, name: string) {
    const { data } = await admin
      .from("signing_participants")
      .select("id, participant_status, identity_confirmed_at, consent_accepted_at, consent_disclosure_version_id, consent_content_sha256, finished_at, declined_at, decline_reason")
      .eq("signing_id", signingId)
      .eq("full_name", name)
      .single();
    return data as Record<string, string | null>;
  }

  async function placements(signingId: string) {
    const { data } = await admin
      .from("signing_field_placements")
      .select("id, signing_field_id, signing_participant_id, disposition, accepted_at, rendered_sender_local_date, replaced_by_placement_id")
      .eq("signing_id", signingId)
      .order("accepted_at");
    return (data ?? []) as Record<string, string | null>[];
  }
  const acceptedFor = (rows: Record<string, string | null>[], fieldId: string) =>
    rows.filter((row) => row.signing_field_id === fieldId && row.disposition === "ACCEPTED");

  async function marks(signingId: string, participantId: string) {
    const { data } = await admin
      .from("signing_adopted_marks")
      .select("mark_kind, typed_text, locked_at")
      .eq("signing_id", signingId)
      .eq("signing_participant_id", participantId);
    const rows = (data ?? []) as Record<string, string | null>[];
    return {
      signature: rows.find((row) => row.mark_kind === "SIGNATURE"),
      initials: rows.find((row) => row.mark_kind === "INITIALS"),
    };
  }

  async function signingRow(signingId: string) {
    const { data } = await admin
      .from("signings")
      .select("lifecycle_state, finalization_condition, current_package_revision_id, frozen_package_revision_id, completed_at, sender_timezone")
      .eq("id", signingId)
      .single();
    return data as Record<string, string | null>;
  }

  async function revisionFields(signingId: string) {
    const { data: revisionParticipants, error: rpError } = await admin
      .from("signing_package_revision_participants")
      .select("id, signing_participant_id")
      .eq("signing_id", signingId);
    if (rpError) fail(rpError.message);
    const participantByRevision = new Map(
      (revisionParticipants ?? []).map((entry) => [entry.id as string, entry.signing_participant_id as string]),
    );
    const { data, error } = await admin
      .from("signing_fields")
      .select("id, field_type, package_revision_participant_id, package_revision_document_id, page_number, x, y, width, height, is_required, linked_signature_field_id")
      .eq("signing_id", signingId);
    if (error) fail(error.message);
    return (data ?? []).map((field) => ({
      ...field,
      signing_participant_id: participantByRevision.get(field.package_revision_participant_id as string) ?? null,
    })) as Record<string, string | number | boolean | null>[];
  }

  async function ceremonyContextFor(context: BrowserContext) {
    const cookie = (await context.cookies()).find((entry) => entry.name === SIGNING_CEREMONY_COOKIE_NAME);
    if (!cookie) fail("ceremony cookie missing");
    const resolved = await resolveCeremonyBrowserSession(admin, cookie.value);
    if (!resolved.ok) return { ok: false as const, code: resolved.code };
    return { ok: true as const, write: await requireCeremonyWriteContext({ admin, session: resolved.session }) };
  }

  const row = (page: Page, type: "Signature" | "Initials", required: boolean) => {
    const base = page.locator("[data-ceremony-field-row]").filter({ hasText: type });
    return required ? base.filter({ hasNotText: "optional" }) : base.filter({ hasText: "optional" });
  };
  const finishButton = (page: Page) => page.getByRole("button", { name: "Finish Signing", exact: true });
  const guidance = (page: Page) => page.getByTestId("ceremony-guidance");
  const readyBanner = (page: Page) => page.getByTestId("ceremony-ready");
  const fieldsHeading = (page: Page) => page.getByRole("heading", { name: "Your fields", exact: true });
  const fieldRows = (page: Page) => page.locator("[data-ceremony-field-row]");
  /** On-document Signature / Initials target for one field, in its current state. */
  const target = (page: Page, fieldId: unknown, placed: boolean) =>
    page.locator(`[data-ceremony-target="${String(fieldId)}"][data-placed="${placed ? "true" : "false"}"]`);
  const dateOnPage = (page: Page, fieldId: unknown) =>
    page.locator(`[data-ceremony-date-field="${String(fieldId)}"][data-placed="true"]`);
  const firstOpenTarget = (page: Page, type: "SIGNATURE" | "INITIALS") =>
    page.locator(`[data-ceremony-target][data-placed="false"][data-field-type="${type}"]`).first();
  const pageCanvas = (page: Page, pageNumber: number) =>
    page.locator(`[data-ceremony-page="${pageNumber}"] canvas`).first();

  /** The Signature / Initials preview shows the Signing identity, with nothing editable. */
  async function expectMarkPreview(page: Page, name: string, initials: string | null, label: string) {
    await page.getByRole("button", { name: "Start signing" }).waitFor({ timeout: 30000 });
    if ((await page.getByTestId("signature-preview").innerText()).trim() !== name) fail(`${label}: Signature preview is not exactly "${name}"`);
    if (initials !== null && (await page.getByTestId("initials-preview").innerText()).trim() !== initials) {
      fail(`${label}: Initials preview is not "${initials}"`);
    }
    if ((await page.locator("input, textarea, [contenteditable=true]").count()) !== 0) fail(`${label}: the mark setup offers an editable control`);
    const text = await page.locator("body").innerText();
    if (/\badopt/i.test(text)) fail(`${label}: setup uses "adopt" wording`);
  }

  /** Start signing records the marks and lands on the first required field with a hint. */
  async function startSigning(page: Page, name: string, initials: string | null, label: string) {
    await expectMarkPreview(page, name, initials, label);
    await page.getByRole("button", { name: "Start signing" }).click();
    await page.getByTestId("ceremony-document-viewer").waitFor({ timeout: 60000 });
  }

  /** Request ceremony document bytes in a fresh context carrying only `cookieValue` (or no cookie). */
  async function documentStatusWith(cookieValue: string | null, revisionDocumentId: string) {
    const context = await browser.newContext();
    if (cookieValue) {
      await context.addCookies([
        { name: SIGNING_CEREMONY_COOKIE_NAME, value: cookieValue, url: APP_ORIGIN, httpOnly: true, sameSite: "Lax" },
      ]);
    }
    const response = await context.request.get(`${APP_ORIGIN}/sign/ceremony/document/${revisionDocumentId}`);
    const status = response.status();
    await context.close();
    return status;
  }
  async function ceremonyCookieValue(context: BrowserContext) {
    const cookie = (await context.cookies()).find((entry) => entry.name === SIGNING_CEREMONY_COOKIE_NAME);
    if (!cookie) fail("ceremony cookie missing");
    return cookie.value;
  }
  async function revisionDocuments(signingId: string) {
    const { data, error } = await admin
      .from("signing_package_revision_documents")
      .select("id, frozen_display_name, signing_document_version_id, display_order")
      .eq("signing_id", signingId)
      .order("display_order");
    if (error) fail(error.message);
    return (data ?? []) as { id: string; frozen_display_name: string; signing_document_version_id: string; display_order: number }[];
  }

  /** Overlay box vs. stored PDF-point geometry scaled to the rendered page canvas. */
  async function expectTargetAligned(page: Page, field: Record<string, unknown>, locator: ReturnType<Page["locator"]>, label: string) {
    await locator.scrollIntoViewIfNeeded();
    const canvasBox = await pageCanvas(page, Number(field.page_number)).boundingBox();
    const targetBox = await locator.boundingBox();
    if (!canvasBox || !targetBox) fail(`${label}: page or target not rendered`);
    const scale = canvasBox.width / 612;
    const expected = {
      x: canvasBox.x + Number(field.x) * scale,
      y: canvasBox.y + Number(field.y) * scale,
      width: Number(field.width) * scale,
      height: Number(field.height) * scale,
    };
    const drift = Math.max(
      Math.abs(targetBox.x - expected.x),
      Math.abs(targetBox.y - expected.y),
      Math.abs(targetBox.width - expected.width),
      Math.abs(targetBox.height - expected.height),
    );
    if (drift > 1.5) {
      fail(`${label}: overlay ${JSON.stringify(targetBox)} drifts ${drift.toFixed(2)}px from ${JSON.stringify(expected)}`);
    }
    return drift;
  }

  /** Every applied mark shows its whole text inside its field box (no ellipsis, no overflow). */
  async function expectAppliedMarksFit(page: Page, expected: string[], label: string) {
    await page.evaluate(() => document.fonts.ready);
    const marks = await page.evaluate(() =>
      Array.from(document.querySelectorAll<SVGSVGElement>("svg[data-applied-mark]")).map((svg) => {
        const text = svg.querySelector("text") as SVGTextElement;
        const box = svg.viewBox.baseVal;
        const glyphs = text.getBBox();
        const host = svg.parentElement!.getBoundingClientRect();
        const rendered = text.getBoundingClientRect();
        return {
          kind: svg.getAttribute("data-applied-mark"),
          text: text.textContent ?? "",
          overflowPt: Math.max(0, glyphs.x + glyphs.width - box.width, -glyphs.x),
          overflowPx: Math.max(0, rendered.right - host.right, host.left - rendered.left),
          scale: host.width / box.width,
          textOverflow: getComputedStyle(svg.parentElement!).textOverflow,
          font: getComputedStyle(text).fontFamily,
        };
      }),
    );
    for (const want of expected) {
      if (!marks.some((mark) => mark.text === want)) fail(`${label}: no applied mark shows the full "${want}" (saw ${marks.map((mark) => JSON.stringify(mark.text)).join(", ")})`);
    }
    for (const mark of marks) {
      if (/…|\.\.\./.test(mark.text) || mark.textOverflow === "ellipsis") fail(`${label}: ${mark.kind} "${mark.text}" is abbreviated`);
      if (mark.overflowPt > 0.75 || mark.overflowPx > 1.5) fail(`${label}: ${mark.kind} "${mark.text}" overflows its box by ${mark.overflowPt.toFixed(2)}pt / ${mark.overflowPx.toFixed(1)}px`);
    }
    const caveatLoaded = await page.evaluate(() => document.fonts.check('12px "HarbaughCaveat"'));
    if (!caveatLoaded) fail(`${label}: HarbaughCaveat is not loaded in the browser`);
    return marks;
  }

  async function waitIdle(page: Page) {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
  }

  async function expectedDate(signingId: string) {
    const tz = (await signingRow(signingId)).sender_timezone ?? "America/Chicago";
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  /** A signed-in workspace user with no association to the QA Signings. */
  async function signedInOutsider(label: string, otherBrokerage: boolean) {
    let outsiderOrganizationId = organizationId;
    if (otherBrokerage) {
      const { data: otherOrg } = await admin.from("organizations").insert({ name: `Ceremony QA Other Brokerage ${stamp}`, status: "ACTIVE" }).select("id").single();
      outsiderOrganizationId = otherOrg!.id as string;
      extraOrganizationIds.push(outsiderOrganizationId);
    }
    const outsiderEmail = `ceremony-qa-${label}-${stamp}@example.com`;
    const { data: createdOutsider, error } = await admin.auth.admin.createUser({
      email: outsiderEmail,
      password: `CeremonyQa-${randomUUID()}!aA1`,
      email_confirm: true,
    });
    if (error || !createdOutsider.user) fail(error?.message ?? `${label} user`);
    extraUserIds.push(createdOutsider.user.id);
    await admin.from("profiles").upsert({
      id: createdOutsider.user.id,
      email: outsiderEmail,
      status: "ACTIVE",
      app_role: "USER",
      onboarding_status: "ACTIVE",
      display_name: `Ceremony QA ${label}`,
      first_name: "Ceremony",
      last_name: label,
      primary_organization_id: outsiderOrganizationId,
      must_change_password: false,
    });
    await admin.from("organization_members").insert({
      organization_id: outsiderOrganizationId,
      user_id: createdOutsider.user.id,
      membership_role: otherBrokerage ? "ORG_ADMIN" : "MEMBER",
      status: "ACTIVE",
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const { data: outsiderLink } = await admin.auth.admin.generateLink({ type: "magiclink", email: outsiderEmail });
    await page.goto(
      `${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(outsiderLink!.properties!.hashed_token)}&type=magiclink&next=${encodeURIComponent("/signings")}`,
      { waitUntil: "networkidle" },
    );
    if (page.url().includes("/auth/")) fail(`${label} sign-in failed`);
    return { context, page };
  }

  async function expectRefused(link: string, label: string) {
    // Expected failure path: the exchange answers 503, which Chrome reports as a
    // console error, so this context is deliberately not runtime-noise watched.
    const { context, page } = await newParticipantContext(label, false);
    const exchange = page.waitForResponse((response) => response.url().endsWith("/api/sign/entry-exchange"));
    await page.goto(link, { waitUntil: "domcontentloaded" });
    const status = (await exchange).status();
    if (status !== 503) fail(`${label}: exchange answered ${status}, expected 503`);
    await page
      .getByText("Signing access is currently unavailable. Please request a new link from the sender.")
      .waitFor({ timeout: 30000 });
    if ((await context.cookies()).some((cookie) => cookie.name === SIGNING_CEREMONY_COOKIE_NAME || cookie.name === SIGNING_ENTRY_COOKIE_NAME)) {
      fail(`${label}: refused link still produced a session cookie`);
    }
    await context.close();
    ok(`${label}: refused (exchange 503, unavailable message, no session) — expected failure path, classified`);
  }

  try {
    // ---------- fixtures ----------
    const { data: org } = await admin.from("organizations").insert({ name: orgName, status: "ACTIVE" }).select("id").single();
    organizationId = org!.id as string;
    const agentPassword = `CeremonyQa-${randomUUID()}!aA1`;
    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email,
      password: agentPassword,
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
      display_name: AGENT,
      first_name: "Ceremony",
      last_name: "Agent",
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
      .insert({ owner_user_id: userId, label: `Ceremony QA Packet ${stamp}`, status: "ACTIVE", packet_type: "custom" })
      .select("id")
      .single();
    packetId = packet!.id as number;
    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    actor = {
      userId,
      email,
      displayName: AGENT,
      profile: profile as Profile,
      memberships: [{ organizationId, membershipRole: "MEMBER", membershipStatus: "ACTIVE", organizationStatus: "ACTIVE" }],
    };

    const formA = await createPacketDocument("Ceremony QA Contract", 2);
    const formA2 = await createPacketDocument("Ceremony QA Addendum");
    const titleA = `Ceremony QA ${stamp}`;
    const a = await createDraft(titleA, formA);
    const a2 = await addDraftSigningDocumentWithActor(actor, { signingId: a.signingId, sourcePacketFormId: formA2 }, admin);
    const p1 = await addDraftSigningParticipantWithActor(actor, { signingId: a.signingId, fullName: P1, email: `avery-${stamp}@example.com` }, admin);
    const p2 = await addDraftSigningParticipantWithActor(actor, { signingId: a.signingId, fullName: P2, email: `blake-${stamp}@example.com` }, admin);
    const p1Sig = await addField(a.signingId, a.documentId, p1.id, "SIGNATURE", { x: 72, y: 560, width: 150, height: 28 });
    // P1's Date Signed and required Initials use the editor's default (tight) sizes and
    // P2's Date Signed is narrower than its text: applied marks must fit, not clip.
    await addField(a.signingId, a.documentId, p1.id, "DATE_SIGNED", { x: 230, y: 566, ...DATE_SIGNED_DEFAULT_SIZE }, { linkedSignatureDraftFieldId: p1Sig.id });
    await addField(a.signingId, a.documentId, p1.id, "INITIALS", { x: 72, y: 660, ...defaultDraftFieldSize("INITIALS", { fullName: P1 }) });
    await addField(a.signingId, a.documentId, p1.id, "INITIALS", { x: 140, y: 300, width: 40, height: 20 }, { isRequired: false, pageNumber: 2 });
    const p2Sig = await addField(a.signingId, a.documentId, p2.id, "SIGNATURE", { x: 330, y: 560, width: 150, height: 28 });
    await addField(a.signingId, a.documentId, p2.id, "DATE_SIGNED", { x: 488, y: 566, width: 44, height: 18 }, { linkedSignatureDraftFieldId: p2Sig.id });
    const p2Ini = await addField(a.signingId, a2.id, p2.id, "INITIALS", { x: 330, y: 660, width: 40, height: 20 });
    await addField(a.signingId, a2.id, p2.id, "DATE_SIGNED", { x: 380, y: 662, width: 72, height: 18 }, { linkedSignatureDraftFieldId: p2Ini.id });
    await upsertDraftPreparedContentWithActor(actor, {
      signingId: a.signingId,
      signingDocumentId: a.documentId,
      signingParticipantId: p2.id,
      contentType: "PRINTED_NAME",
      ...PRINTED_NAME_BOX,
    }, admin);
    await upsertDraftPreparedContentWithActor(actor, {
      signingId: a.signingId,
      signingDocumentId: a.documentId,
      contentType: "CHECKMARK",
      ...CHECKMARK_BOX,
    }, admin);
    await addCopyRecipientWithActor(actor, { signingId: a.signingId, email: `copy-${stamp}@example.com`, displayName: "Copy Recipient QA" }, admin);
    ok(`fixture Signing A ${a.signingId}: 2-page contract + 1-page addendum; ${P1} (contract: Signature + linked Date and required Initials on page 1, optional Initials on page 2; nothing on the addendum), ${P2} (contract Signature + linked Date, addendum Initials + Date linked to those Initials), prepared Printed Name (${P2}) + Checkmark on the contract, 1 copy recipient`);

    // ---------- manager sign-in + Send ----------
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link.properties?.hashed_token) fail("generateLink failed");
    await manager.goto(
      `${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent("/signings")}`,
      { waitUntil: "networkidle" },
    );
    if (manager.url().includes("/auth/")) fail(`manager auth failed: ${manager.url()}`);
    await manager.getByText(titleA).first().waitFor({ timeout: 60000 });
    await sendFromDraftPage(a.signingId);
    const sentA = await signingRow(a.signingId);
    if (sentA.lifecycle_state !== "IN_PROGRESS" || sentA.frozen_package_revision_id) fail("Signing A not In Progress / unexpectedly frozen after Send");
    const { count: preCompleteCreds } = await admin
      .from("signing_completed_package_credentials")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", a.signingId);
    if ((preCompleteCreds ?? 0) !== 0) fail("completed-package credentials exist before Complete");
    await shot(manager, "a01-manager-in-progress");
    ok("Signing A sent from the Draft page (REMOTE_SEND, sandbox); not frozen; no completed-package credentials before Complete");

    const fields = await revisionFields(a.signingId);
    const fieldOf = (participantId: string, type: string, required?: boolean) =>
      fields.filter(
        (field) =>
          field.signing_participant_id === participantId &&
          field.field_type === type &&
          (required === undefined || field.is_required === required),
      );
    const f = {
      p1Sig: fieldOf(p1.id, "SIGNATURE")[0],
      p1Date: fieldOf(p1.id, "DATE_SIGNED")[0],
      p1InitReq: fieldOf(p1.id, "INITIALS", true)[0],
      p1InitOpt: fieldOf(p1.id, "INITIALS", false)[0],
      p2Sig: fieldOf(p2.id, "SIGNATURE")[0],
      p2Date: fieldOf(p2.id, "DATE_SIGNED").find(
        (date) => date.linked_signature_field_id === fieldOf(p2.id, "SIGNATURE")[0]?.id,
      )!,
      p2Init: fieldOf(p2.id, "INITIALS")[0],
      p2IniDate: fieldOf(p2.id, "DATE_SIGNED").find(
        (date) => date.linked_signature_field_id === fieldOf(p2.id, "INITIALS")[0]?.id,
      )!,
    };
    if (fields.some((field) => !["SIGNATURE", "INITIALS", "DATE_SIGNED"].includes(field.field_type as string))) {
      fail("prepared content was promoted as a signing field");
    }
    if (Object.values(f).some((value) => !value)) {
      fail(
        `revision fields did not snapshot as prepared: ${JSON.stringify(
          fields.map((field) => [field.field_type, field.signing_participant_id === p1.id ? "P1" : "P2", field.is_required]),
        )}`,
      );
    }
    const { count: versionsBefore } = await admin
      .from("signing_document_versions")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", a.signingId);

    // ---------- manager routes still require login; ceremony needs affirmation ----------
    {
      const { context, page } = await newParticipantContext("anon", false);
      await page.goto(`${APP_ORIGIN}/signings/${a.signingId}`, { waitUntil: "networkidle" });
      if (!new URL(page.url()).pathname.startsWith("/auth/login")) fail("manager Signing page reachable without login");
      await page.goto(`${APP_ORIGIN}/sign/ceremony`, { waitUntil: "networkidle" });
      if (new URL(page.url()).pathname.startsWith("/sign/ceremony")) fail("ceremony reachable without a ceremony session");
      await context.close();
      ok("manager /signings/{id} redirects to workspace login; /sign/ceremony without affirmation is refused");
    }

    // ---------- Participant 1: entry ----------
    const linkP1 = await copySigningLink(P1, "P1 copy");
    const { context: c1, page: s1 } = await enter(linkP1, P1, "p1");
    const preText = await s1.locator("body").innerText();
    for (const expected of [P1, AGENT, orgName, titleA]) {
      if (!preText.includes(expected)) fail(`pre-affirmation page is missing "${expected}"`);
    }
    for (const hidden of ["Ceremony QA Contract", "Ceremony QA Addendum", `avery-${stamp}@example.com`, P2, "Sign here"]) {
      if (preText.includes(hidden)) fail(`pre-affirmation page discloses "${hidden}"`);
    }
    if ((await s1.getByRole("button", { name: `I am ${P2}` }).count()) !== 0) fail("another participant's affirmation offered");
    await shot(s1, "p1-01-identity");
    ok(`P1 entry: copied link → POST exchange (secret only in body) → /sign/continue without login; HttpOnly entry cookie; shows name/agent/brokerage/title only`);

    // ---------- identity affirmation ----------
    await affirm(s1, P1);
    let p1Row = await participantRow(a.signingId, P1);
    if (!p1Row.identity_confirmed_at) fail("identity affirmation not recorded");
    const { data: sessionsP1 } = await admin
      .from("signing_browser_sessions")
      .select("*")
      .eq("signing_id", a.signingId)
      .eq("signing_participant_id", p1.id);
    const activeP1 = (sessionsP1 ?? []).filter((session) => session.status === "ACTIVE");
    if (activeP1.length !== 1) fail(`expected one active ceremony session, saw ${activeP1.length}`);
    const sessionKeys = Object.keys(activeP1[0]).filter((key) => /inactiv|expires|last_|status/.test(key));
    const sessionSummary = sessionKeys.map((key) => `${key}=${activeP1[0][key]}`).join(", ");
    const { count: leases } = await admin
      .from("signing_participant_presence_leases")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", a.signingId)
      .eq("signing_participant_id", p1.id);
    if (!leases) fail("no presence lease after affirmation");
    if (!(await c1.cookies()).find((cookie) => cookie.name === SIGNING_CEREMONY_COOKIE_NAME)?.httpOnly) fail("ceremony cookie not HttpOnly");
    ok(`P1 "I am ${P1}" → /sign/ceremony; identity_confirmed_at set; 1 active ceremony session (${sessionSummary}); presence lease; HttpOnly ceremony cookie`);

    // ---------- consent ----------
    const { data: disclosure } = await admin
      .from("signing_consent_disclosure_versions")
      .select("id, version_key, title, body_text, content_sha256, is_production_ready, published_at")
      .is("superseded_at", null)
      .single();
    await s1.getByRole("heading", { name: disclosure!.title as string, level: 2 }).waitFor({ timeout: 30000 });
    const consentText = await s1.locator("body").innerText();
    if (!consentText.includes((disclosure!.body_text as string).slice(0, 60))) fail("disclosure body not shown");
    if (!disclosure!.is_production_ready && !consentText.includes("Development disclosure copy")) fail("dev disclosure badge missing");
    if ((await s1.getByRole("button", { name: /Sign here|Initial here|Start signing|Finish Signing/ }).count()) !== 0) fail("marks or Finish offered before consent");
    {
      const probe = await ceremonyContextFor(c1);
      if (!probe.ok) fail(`P1 session probe failed: ${probe.code}`);
      const refusals: string[] = [];
      for (const attempt of [
        () => adoptCeremonyMark({ admin, context: probe.write, markKind: "SIGNATURE", representationType: "TYPED", typedText: P1 }),
        () => acceptFieldPlacement({ admin, context: probe.write, signingFieldId: f.p1Sig.id, clientRequestId: `qa-${randomUUID()}` }),
      ]) {
        try {
          await attempt();
          refusals.push("ACCEPTED");
        } catch (error) {
          refusals.push((error as { code?: string }).code ?? "error");
        }
      }
      if (refusals.some((code) => code !== "CONSENT_REQUIRED")) fail(`server accepted a mark before consent: ${refusals.join(", ")}`);
      if ((await marks(a.signingId, p1.id)).signature) fail("a mark was recorded before consent");
      ok("server refuses a mark and a placement before consent (CONSENT_REQUIRED), not only the UI");
    }
    await s1.reload({ waitUntil: "networkidle" });
    await s1.getByTestId("consent-continue").waitFor();
    if ((await participantRow(a.signingId, P1)).consent_accepted_at) fail("consent recorded without acceptance");
    {
      const headings = await s1.getByTestId("disclosure-body").locator("h3").allInnerTexts();
      for (const section of [
        "Your choice",
        "What your consent covers",
        "Stopping before you finish",
        "Paper copies",
        "Your contact information",
        "What you need",
        "Keeping your records",
      ]) {
        if (!headings.includes(section)) fail(`disclosure section missing: ${section}`);
      }
      if ((await s1.getByRole("button", { name: "Leave for now" }).count()) !== 1 || (await s1.getByRole("button", { name: "Decline to sign" }).count()) !== 1) {
        fail("Leave for now / Decline to sign must be available before consent");
      }
      const bodyText = await s1.getByTestId("disclosure-body").innerText();
      if (/TREC[- ]approved|complies with all|legally binding|notariz/i.test(bodyText)) fail("disclosure makes an unsupported claim");
      await shot(s1, "p1-02-consent");
      const viewport = s1.viewportSize();
      await s1.setViewportSize({ width: 390, height: 844 });
      await s1.waitForTimeout(400);
      const overflow = await s1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) fail(`consent screen scrolls horizontally at 390px (${overflow}px)`);
      await s1.getByTestId("consent-acknowledge").scrollIntoViewIfNeeded();
      if (!(await s1.getByTestId("consent-acknowledge").isVisible())) fail("consent checkbox not reachable at 390px");
      await shot(s1, "p1-02-consent-phone");
      if (viewport) await s1.setViewportSize(viewport);
      ok("disclosure: all seven sections, version shown, download/print offered, Leave for now and Decline available, no unsupported claims; phone width (390px) readable with no horizontal scroll");
    }
    await consentInUi(s1, "P1");
    p1Row = await participantRow(a.signingId, P1);
    if (p1Row.consent_disclosure_version_id !== disclosure!.id || p1Row.consent_content_sha256 !== disclosure!.content_sha256) {
      fail("consent evidence does not reference the shown disclosure version/fingerprint");
    }
    if (sha256(Buffer.from(disclosure!.body_text as string, "utf8")) !== disclosure!.content_sha256) fail("disclosure fingerprint mismatch");
    await s1.reload({ waitUntil: "networkidle" });
    if ((await s1.getByTestId("consent-continue").count()) !== 0) fail("consent re-prompted after reload");
    ok(`consent: "${disclosure!.title}" (version ${disclosure!.version_key}, sha256 ${String(disclosure!.content_sha256).slice(0, 12)}…, dev copy badge) shown; no marks/Finish before acceptance; reload keeps it unaccepted; acceptance records version id + fingerprint; reload does not re-prompt`);

    // ---------- Signature and Initials from the Signing identity ----------
    await expectMarkPreview(s1, P1, "AJS", "P1");
    {
      const probe = await ceremonyContextFor(c1);
      if (!probe.ok) fail(`P1 session probe failed: ${probe.code}`);
      const attempts: Array<["SIGNATURE" | "INITIALS", string]> = [
        ["SIGNATURE", P2],
        ["SIGNATURE", P1.toLowerCase()],
        ["SIGNATURE", `${P1} `.repeat(2).trim()],
        ["INITIALS", "AJX"],
        ["INITIALS", "ajs"],
        ["INITIALS", "AS"],
      ];
      for (const [markKind, wrong] of attempts) {
        let code = "";
        try {
          await adoptCeremonyMark({ admin, context: probe.write, markKind, representationType: "TYPED", typedText: wrong });
        } catch (error) {
          code = (error as { code?: string }).code ?? "";
        }
        if (code !== "VALIDATION_FAILED") fail(`server accepted typed ${markKind} "${wrong}" (${code || "no error"})`);
      }
    }
    {
      const m0 = await marks(a.signingId, p1.id);
      if (m0.signature || m0.initials) fail("a mismatched mark was recorded");
    }
    await shot(s1, "p1-02b-signature-and-initials");
    await s1.getByRole("button", { name: "Start signing" }).click();
    await fieldsHeading(s1).waitFor({ timeout: 60000 });
    let m1 = await marks(a.signingId, p1.id);
    if (m1.signature?.typed_text !== P1 || m1.signature.locked_at) fail("Start signing did not record the exact Signing name");
    if (m1.initials?.typed_text !== "AJS" || m1.initials.locked_at) fail("Start signing did not record the derived initials");
    {
      const { data: markEvents } = await admin
        .from("signing_events")
        .select("event_type, actor_type, actor_display_name, create_date, details_json, package_revision_id")
        .eq("signing_id", a.signingId)
        .eq("actor_participant_id", p1.id)
        .in("event_type", ["SIGNATURE_ADOPTED", "INITIALS_ADOPTED"]);
      const events = markEvents ?? [];
      const sources = events.map((event) => (event.details_json as { textSource?: string } | null)?.textSource).sort();
      if (
        events.length !== 2 ||
        events.some((event) => event.actor_type !== "PARTICIPANT" || event.actor_display_name !== P1 || !event.package_revision_id || !event.create_date) ||
        JSON.stringify(sources) !== JSON.stringify(["DERIVED_FROM_FROZEN_PARTICIPANT_NAME", "FROZEN_PARTICIPANT_NAME"])
      ) {
        fail(`mark evidence missing: ${JSON.stringify(events.map((event) => ({ type: event.event_type, actor: event.actor_type, revision: Boolean(event.package_revision_id), source: (event.details_json as { textSource?: string } | null)?.textSource })))}`);
      }
      if (events.some((event) => JSON.stringify(event.details_json ?? {}).includes("browserSessionId"))) fail("event details carry a session id (blocked by the event-chain sanitizer)");
      ok("Start signing evidence: SIGNATURE_ADOPTED + INITIALS_ADOPTED events by the PARTICIPANT actor (participant id + displayed name), timestamped, bound to the package revision, textSource FROZEN_PARTICIPANT_NAME / DERIVED_FROM_FROZEN_PARTICIPANT_NAME; session ids stay out of event details by design");
    }
    await s1.reload({ waitUntil: "networkidle" });
    await fieldsHeading(s1).waitFor({ timeout: 60000 });
    if ((await s1.getByRole("button", { name: "Start signing" }).count()) !== 0) fail("Start signing offered again after reload");
    await guidance(s1).waitFor({ timeout: 60000 });
    if ((await guidance(s1).getAttribute("data-field-id")) !== f.p1Sig.id || (await guidance(s1).innerText()).trim() !== "Click here to sign") {
      fail("first-field guidance is not on P1's first required Signature");
    }
    await s1.waitForFunction((id) => document.activeElement?.getAttribute("data-ceremony-target") === id, String(f.p1Sig.id), { timeout: 30000 });
    if ((await target(s1, f.p1Sig.id, false).getAttribute("data-highlighted")) !== "true") fail("guided field is not emphasized");
    {
      const hint = (await guidance(s1).boundingBox())!;
      const field = (await target(s1, f.p1Sig.id, false).boundingBox())!;
      const overlaps = hint.x < field.x + field.width && hint.x + hint.width > field.x && hint.y < field.y + field.height && hint.y + hint.height > field.y;
      if (overlaps) fail("the guidance hint covers the field it points at");
    }
    if ((await placements(a.signingId)).length !== 0) fail("guidance applied a mark");
    await shot(s1, "p1-03-started");
    ok(`Signature preview "${P1}" and Initials preview "AJS" are read-only (no input on the page, no "adopt" wording); server rejects "${P2}", the lowercase / doubled name, and initials "AJX" / "ajs" / "AS" (VALIDATION_FAILED); one Start signing click records both exactly (unlocked) with session + package revision evidence; reload does not ask again`);

    // ---------- the actual documents are visible while signing ----------
    const docsA = await revisionDocuments(a.signingId);
    if (docsA.length !== 2) fail(`Signing A has ${docsA.length} revision documents, expected 2`);
    const [contractDoc, addendumDoc] = docsA;
    await s1.getByTestId("ceremony-document-viewer").waitFor({ timeout: 60000 });
    const docButtons = s1.locator("[data-ceremony-document]");
    if ((await docButtons.count()) !== 2) fail(`P1 sees ${await docButtons.count()} documents, expected both (including the addendum without P1 fields)`);
    await pageCanvas(s1, 1).waitFor({ timeout: 60000 });
    await pageCanvas(s1, 2).waitFor({ timeout: 60000 });
    await s1.getByText("Document 1 of 2 · 2 pages").waitFor();
    {
      const pixels = await pageCanvas(s1, 1).evaluate((canvas) => {
        const element = canvas as HTMLCanvasElement;
        const data = element.getContext("2d")!.getImageData(0, 0, element.width, element.height).data;
        let dark = 0;
        for (let index = 0; index < data.length; index += 4) if (data[index] < 128) dark += 1;
        return dark;
      });
      if (pixels < 500) fail("page 1 canvas has no rendered document text");
    }
    const p1DocRequests = participantRequestUrls.filter((requestUrl) => requestUrl.includes("/sign/ceremony/document/"));
    if (!p1DocRequests.some((requestUrl) => requestUrl.endsWith(`/sign/ceremony/document/${contractDoc.id}`))) fail("contract bytes were not requested from the ceremony document route");
    const fieldRowCount = await fieldRows(s1).count();
    if (fieldRowCount !== 3) fail(`P1 sees ${fieldRowCount} actionable fields, expected 3`);
    const p1Html = await s1.content();
    for (const other of [f.p2Sig.id, f.p2Init.id, f.p2Date.id] as string[]) {
      if (p1Html.includes(other)) fail("P1 page references a P2 field");
    }
    if ((await s1.locator("body").innerText()).includes(P2)) fail("P1 ceremony shows another participant");
    if ((await s1.locator("[data-ceremony-target]").count()) !== 3) fail("P1 contract does not show exactly P1's 3 Signature / Initials targets");
    await shot(s1, "p1-03b-document-visible");

    // free scrolling: wheel down to page 2 and back, no forced order
    await s1.mouse.move(400, 500);
    for (let i = 0; i < 12 && !(await pageCanvas(s1, 2).isVisible().then(async () => (await pageCanvas(s1, 2).boundingBox())!.y < 900)); i += 1) {
      await s1.mouse.wheel(0, 600);
      await s1.waitForTimeout(150);
    }
    if ((await pageCanvas(s1, 2).boundingBox())!.y >= 900) fail("could not scroll to page 2");
    await target(s1, f.p1InitOpt.id, false).waitFor();
    await s1.mouse.wheel(0, -20000);
    await s1.waitForTimeout(300);
    if ((await pageCanvas(s1, 1).boundingBox())!.y > 900) fail("could not scroll back to page 1");
    ok("free scrolling: wheel to page 2 (optional Initials target visible there) and back to page 1; no forced order or timers");

    // zoom keeps targets aligned
    const zoomLabel = () => s1.getByTestId("ceremony-zoom").innerText();
    const fitWidthZoom = await zoomLabel();
    {
      const workspace = (await s1.getByTestId("ceremony-workspace").boundingBox())!;
      const canvas = (await pageCanvas(s1, 1).boundingBox())!;
      if (workspace.width < 900 || workspace.height < 650) fail(`document workspace is only ${workspace.width}x${workspace.height} at 1280x900`);
      if (canvas.width < workspace.width - 80) fail(`Fit Width page is ${canvas.width}px in a ${workspace.width}px workspace`);
      console.log(`INFO: 1280x900 workspace ${Math.round(workspace.width)}x${Math.round(workspace.height)}, Fit Width page ${Math.round(canvas.width)}px (${fitWidthZoom})`);
    }
    const fitDrift = await expectTargetAligned(s1, f.p1Sig, target(s1, f.p1Sig.id, false), "P1 Signature (Fit Width)");
    await s1.getByRole("button", { name: "Zoom in" }).click();
    await s1.waitForFunction((previous) => document.querySelector('[data-testid="ceremony-zoom"]')?.textContent !== previous, fitWidthZoom);
    await s1.waitForTimeout(500);
    const zoomedIn = await zoomLabel();
    if (parseInt(zoomedIn, 10) <= parseInt(fitWidthZoom, 10)) fail(`Zoom in went from ${fitWidthZoom} to ${zoomedIn}`);
    const zoomDrift = await expectTargetAligned(s1, f.p1Sig, target(s1, f.p1Sig.id, false), `P1 Signature (${zoomedIn})`);
    await expectTargetAligned(s1, f.p1InitReq, target(s1, f.p1InitReq.id, false), `P1 required Initials (${zoomedIn})`);
    await expectTargetAligned(s1, f.p1InitOpt, target(s1, f.p1InitOpt.id, false), `P1 optional Initials page 2 (${zoomedIn})`);
    await s1.getByRole("button", { name: "Zoom out" }).click();
    await s1.getByRole("button", { name: "Zoom out" }).click();
    await s1.waitForTimeout(500);
    const zoomedOut = await zoomLabel();
    if (parseInt(zoomedOut, 10) >= parseInt(zoomedIn, 10)) fail(`Zoom out went from ${zoomedIn} to ${zoomedOut}`);
    await expectTargetAligned(s1, f.p1Sig, target(s1, f.p1Sig.id, false), `P1 Signature (${zoomedOut})`);
    await s1.getByRole("button", { name: "Fit Page", exact: true }).click();
    await s1.waitForTimeout(500);
    {
      const workspace = (await s1.getByTestId("ceremony-workspace").boundingBox())!;
      const canvas = (await pageCanvas(s1, 1).boundingBox())!;
      if (canvas.height > workspace.height) fail(`Fit Page page is ${canvas.height}px tall in a ${workspace.height}px workspace`);
    }
    await expectTargetAligned(s1, f.p1Sig, target(s1, f.p1Sig.id, false), "P1 Signature (Fit Page)");
    const fitPageZoom = await zoomLabel();
    await s1.getByRole("button", { name: "Fit Width", exact: true }).click();
    await s1.waitForTimeout(500);
    if ((await zoomLabel()) !== fitWidthZoom) fail(`Fit Width returned ${await zoomLabel()}, expected ${fitWidthZoom}`);
    ok(`viewer: Fit Width ${fitWidthZoom} (default), Zoom in ${zoomedIn}, Zoom out ${zoomedOut}, Fit Page ${fitPageZoom} (whole page fits the workspace), Fit Width again ${fitWidthZoom}; overlays match stored PDF-point geometry within ${Math.max(fitDrift, zoomDrift).toFixed(2)}px (page 1 and page 2)`);

    // switch documents: the addendum has no P1 fields but is fully readable
    await s1.locator(`[data-ceremony-document="${addendumDoc.id}"]`).click();
    await s1.getByText("Document 2 of 2 · 1 page").waitFor({ timeout: 60000 });
    await pageCanvas(s1, 1).waitFor({ timeout: 60000 });
    if ((await s1.locator("[data-ceremony-target]").count()) !== 0) fail("P1 sees an actionable target on the addendum (P2-only fields)");
    if ((await s1.content()).includes(f.p2Init.id as string)) fail("addendum view references P2's field");
    await shot(s1, "p1-03c-addendum");
    await s1.locator(`[data-ceremony-document="${contractDoc.id}"]`).click();
    await s1.getByText("Document 1 of 2 · 2 pages").waitFor({ timeout: 60000 });
    await target(s1, f.p1Sig.id, false).waitFor({ timeout: 60000 });
    ok("document navigation: contract → addendum (readable, no P1 targets, P2 field not exposed) → contract");

    // document route authorization (bytes are the frozen prepared version)
    {
      const { data: versionRow } = await admin
        .from("signing_document_versions")
        .select("content_sha256, storage_object_key")
        .eq("id", contractDoc.signing_document_version_id)
        .single();
      if (!String(versionRow?.storage_object_key).includes("/versions/")) fail("contract revision document is not a prepared version");
      const response = await c1.request.get(`${APP_ORIGIN}/sign/ceremony/document/${contractDoc.id}`);
      const headers = response.headers();
      if (response.status() !== 200 || sha256(await response.body()) !== versionRow?.content_sha256) fail("ceremony document bytes differ from the prepared version");
      if (headers["cache-control"] !== "no-store" || headers["referrer-policy"] !== "no-referrer" || !/noindex/.test(headers["x-robots-tag"] ?? "") || headers["content-type"] !== "application/pdf") {
        fail(`ceremony document headers wrong: ${JSON.stringify(headers)}`);
      }
      const p1Cookie = await ceremonyCookieValue(c1);
      const statuses = {
        noCookie: await documentStatusWith(null, contractDoc.id),
        unknownDocument: await documentStatusWith(p1Cookie, randomUUID()),
        notUuid: await documentStatusWith(p1Cookie, "not-a-uuid"),
        forgedCookie: await documentStatusWith(`${p1Cookie.slice(0, -4)}AAAA`, contractDoc.id),
        ownAddendum: await documentStatusWith(p1Cookie, addendumDoc.id),
      };
      if (statuses.noCookie !== 404 || statuses.unknownDocument !== 404 || statuses.notUuid !== 404 || statuses.forgedCookie !== 404 || statuses.ownAddendum !== 200) {
        fail(`document route authorization: ${JSON.stringify(statuses)}`);
      }
      ok(`document route: 200 with the session (bytes = prepared version sha256, no-store / no-referrer / noindex / application/pdf); no cookie 404, forged cookie 404, unknown id 404, non-uuid 404; the addendum (no P1 fields) 200`);
    }

    // ---------- apply marks on the document ----------
    const today = await expectedDate(a.signingId);
    await s1.getByText("2 required fields still need you.").waitFor();
    if ((await dateOnPage(s1, f.p1Date.id).count()) !== 0) fail("Date Signed shown as filled before signing");
    if ((await s1.locator(`[data-ceremony-date-field="${f.p1Date.id}"] button, button[data-ceremony-date-field]`).count()) !== 0) fail("Date Signed offered as a control");
    {
      // A failed save: drop exactly this placement request before it reaches the server.
      let dropped = 0;
      const sigId = String(f.p1Sig.id);
      await s1.route("**/sign/ceremony", (route) => {
        const request = route.request();
        if (!dropped && request.method() === "POST" && request.headers()["next-action"] && (request.postData() ?? "").includes(sigId)) {
          dropped += 1;
          simulatedDisconnects += 1;
          return route.abort("internetdisconnected");
        }
        return route.continue();
      });
      await target(s1, f.p1Sig.id, false).click();
      const banner = s1.getByRole("alert").filter({ hasText: "was not saved" });
      await banner.waitFor({ timeout: 30000 });
      await s1.unroute("**/sign/ceremony");
      if (dropped !== 1) fail("the failed-save probe did not intercept the placement");
      await waitIdle(s1);
      if ((await target(s1, f.p1Sig.id, false).count()) !== 1) fail("a failed save shows the field as completed");
      if ((await placements(a.signingId)).length !== 0) fail("a dropped request produced a placement");
      const activeTarget = await s1.evaluate(() => document.activeElement?.getAttribute("data-ceremony-target") ?? null);
      if (activeTarget === String(f.p1InitReq.id)) fail("navigation advanced after a failed save");
      await shot(s1, "p1-03d-failed-save");
      await banner.getByRole("button", { name: "Try again" }).click();
      ok("failed save: the dropped placement shows an error with Try again, the field stays open, nothing is recorded and guidance does not advance; Try again applies it");
    }
    await target(s1, f.p1Sig.id, true).waitFor({ timeout: 30000 });
    await dateOnPage(s1, f.p1Date.id).getByText(today).waitFor({ timeout: 30000 });
    await row(s1, "Signature", true).getByText(`Dated ${today}`).waitFor({ timeout: 30000 });
    if ((await target(s1, f.p1Sig.id, true).innerText()).trim() !== P1) fail("applied Signature does not show the adopted name on the page");
    let pl = await placements(a.signingId);
    const sig1 = acceptedFor(pl, f.p1Sig.id as string);
    const date1 = acceptedFor(pl, f.p1Date.id as string);
    if (sig1.length !== 1 || date1.length !== 1 || date1[0].rendered_sender_local_date !== today) fail("signature/linked date placement wrong");
    const frozen = await signingRow(a.signingId);
    if (!frozen.frozen_package_revision_id || frozen.frozen_package_revision_id !== frozen.current_package_revision_id) fail("package not frozen on first accepted mark");
    m1 = await marks(a.signingId, p1.id);
    if (!m1.signature?.locked_at || m1.initials?.locked_at) fail("mark locking not per mark type");
    ok(`Sign here: Signature ACCEPTED + linked Date Signed ACCEPTED (${today}, sender timezone ${frozen.sender_timezone}); package revision frozen; Signature locked, Initials still unlocked`);
    if (!(await finishButton(s1).isDisabled())) fail("Finish enabled with a required Initials outstanding");
    if ((await readyBanner(s1).count()) !== 0) fail("ready wording shown with a required field outstanding");
    await s1.getByText("One required field still needs you.").waitFor();
    await s1.getByTestId("ceremony-progress").getByText("1 of 2 required").waitFor();
    ok("Finish disabled (no ready wording) while a required Initials field is outstanding; progress reads 1 of 2 required");

    // ---------- first-mark freeze: manager cannot mutate ----------
    for (const [label, attempt] of [
      ["Draft field write", () => addField(a.signingId, a.documentId, p1.id, "INITIALS", { x: 200, y: 660, width: 40, height: 20 })],
      ["amendment lock", () => acquireAmendmentLockWithActor(actor, { signingId: a.signingId }, admin)],
    ] as const) {
      let refused = "";
      try {
        await attempt();
      } catch (error) {
        refused = (error as { code?: string }).code ?? (error as Error).message;
      }
      if (!refused) fail(`manager ${label} succeeded after freeze`);
      ok(`after first mark, manager ${label} refused (${refused})`);
    }
    const { count: versionsAfter } = await admin
      .from("signing_document_versions")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", a.signingId);
    if (versionsAfter !== versionsBefore) fail("document versions changed after freeze");
    await manager.goto(`${APP_ORIGIN}/signings/${a.signingId}`, { waitUntil: "networkidle" });
    await manager.getByText("In Progress — participant access").waitFor({ timeout: 60000 });
    if ((await manager.getByRole("button", { name: /Prepare Documents|Add documents|Upload PDF/ }).count()) !== 0) fail("prep controls visible after Send");
    ok(`document versions unchanged (${versionsAfter}); manager page offers no preparation controls`);

    // ---------- Initials apply + lock (keyboard: auto-advanced focus → Enter) ----------
    await s1.bringToFront();
    await s1.waitForFunction((id) => document.activeElement?.getAttribute("data-ceremony-target") === id, String(f.p1InitReq.id), { timeout: 30000 });
    const focusedName = await s1.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
    if (!/^Initial here: Initials, page 1 of Ceremony QA Contract, required$/.test(focusedName)) fail(`focused target has accessible name "${focusedName}"`);
    const focusRing = await s1.evaluate(() => getComputedStyle(document.activeElement!).boxShadow);
    if (!focusRing || focusRing === "none") fail("focused target has no visible focus ring");
    if ((await guidance(s1).getAttribute("data-field-id")) !== f.p1InitReq.id || (await guidance(s1).innerText()).trim() !== "Click here to initial") {
      fail("auto-advance did not move the hint to the required Initials");
    }
    if (acceptedFor(await placements(a.signingId), f.p1InitReq.id as string).length !== 0) fail("auto-advance applied the Initials");
    await s1.keyboard.press("Enter");
    await target(s1, f.p1InitReq.id, true).waitFor({ timeout: 30000 });
    await row(s1, "Initials", true).getByText("Completed").waitFor({ timeout: 30000 });
    if ((await target(s1, f.p1InitReq.id, true).textContent())?.trim() !== "AJS") fail("applied Initials do not show the adopted initials on the page");
    ok(`auto-advance + keyboard: after Sign here (server accepted), focus and the "Click here to initial" hint moved to the required Initials target (accessible name "${focusedName}", visible focus ring) without applying it; Enter applies it`);
    await s1.waitForFunction(() => document.activeElement?.textContent?.trim() === "Finish Signing", undefined, { timeout: 30000 });
    if ((await guidance(s1).count()) !== 0) fail("a hint remains after the last required field");
    await readyBanner(s1).waitFor();
    if ((await readyBanner(s1).innerText()).replace(/\s+/g, " ").trim() !== "All required fields are complete. Click Finish Signing when you are done reviewing.") {
      fail(`ready wording: ${await readyBanner(s1).innerText()}`);
    }
    if (/Signing is complete|Signing complete/i.test(await s1.locator("body").innerText())) fail("ready state implies the Signing is complete");
    ok("last required field accepted → focus moves to Finish Signing (optional field skipped by guidance); banner: \"All required fields are complete. Click Finish Signing when you are done reviewing.\"");
    await s1.mouse.move(400, 500);
    await s1.mouse.wheel(0, -20000);
    await s1.waitForTimeout(300);
    {
      const optRow = row(s1, "Initials", false);
      const label = (await optRow.getByRole("button", { name: /^Go to Initials/ }).getAttribute("aria-label")) ?? "";
      if (label !== "Go to Initials, Ceremony QA Contract · Page 2, remaining") fail(`Your fields row label: "${label}"`);
      const rowText = (await optRow.innerText()).replace(/\s+/g, " ");
      if (!/Initials · optional\s*Remaining\s*Ceremony QA Contract · Page 2/.test(rowText) || /[0-9a-f]{8}-[0-9a-f]{4}/.test(rowText)) fail(`Your fields row text: "${rowText}"`);
      await optRow.getByRole("button", { name: /^Go to Initials/ }).click();
    }
    await s1.waitForFunction((id) => document.activeElement?.getAttribute("data-ceremony-target") === id, String(f.p1InitOpt.id), { timeout: 30000 });
    if ((await pageCanvas(s1, 2).boundingBox())!.y > 900) fail("Your fields did not scroll page 2 into view");
    if ((await target(s1, f.p1InitOpt.id, false).getAttribute("data-highlighted")) !== "true") fail("Your fields did not highlight the field");
    await guidance(s1).filter({ hasText: "Click here to initial" }).waitFor();
    await guidance(s1).getByRole("button", { name: "Dismiss hint" }).click();
    if ((await guidance(s1).count()) !== 0) fail("Dismiss hint did not hide the hint");
    ok("Your fields: the optional Initials row reads \"Initials · optional / Remaining / Ceremony QA Contract · Page 2\" (no ids); clicking it scrolls to page 2, focuses and highlights the field and shows the hint; Dismiss hint hides it");
    await row(s1, "Signature", true).getByRole("button", { name: /^Go to Signature/ }).click();
    await s1.waitForFunction((id) => document.activeElement?.getAttribute("data-ceremony-target") === id, String(f.p1Sig.id), { timeout: 30000 });
    if ((await guidance(s1).count()) !== 0) fail("a completed field shows a hint");
    ok("Your fields: a completed row returns to its applied field (focused, highlighted, no hint)");
    m1 = await marks(a.signingId, p1.id);
    if (!m1.initials?.locked_at) fail("initials not locked after first use");
    {
      const probe = await ceremonyContextFor(c1);
      if (!probe.ok) fail(`P1 session probe failed: ${probe.code}`);
      let code = "";
      try {
        await adoptCeremonyMark({ admin, context: probe.write, markKind: "INITIALS", representationType: "TYPED", typedText: "AJS" });
      } catch (error) {
        code = (error as { code?: string }).code ?? "";
      }
      if (code !== "MARK_LOCKED") fail(`re-recording used initials returned "${code}", expected MARK_LOCKED`);
    }
    await readyBanner(s1).waitFor();
    if (await finishButton(s1).isDisabled()) fail("Finish disabled with all required fields complete");
    ok("Initial here: Initials ACCEPTED and locked on first use; re-recording now MARK_LOCKED; required complete → Finish enabled (optional Initials still empty)");

    // ---------- remove / replace before Finish ----------
    await row(s1, "Initials", false).getByRole("button", { name: /^Go to Initials/ }).click();
    await target(s1, f.p1InitOpt.id, false).click();
    await target(s1, f.p1InitOpt.id, true).waitFor({ timeout: 30000 });
    await row(s1, "Initials", false).getByText("Completed").waitFor({ timeout: 30000 });
    const optFirst = acceptedFor(await placements(a.signingId), f.p1InitOpt.id as string)[0];
    await row(s1, "Initials", false).getByRole("button", { name: "Remove" }).click();
    await target(s1, f.p1InitOpt.id, false).waitFor({ timeout: 30000 });
    await s1.reload({ waitUntil: "networkidle" });
    await pageCanvas(s1, 2).waitFor({ timeout: 60000 });
    await target(s1, f.p1InitOpt.id, false).waitFor({ timeout: 60000 });
    await target(s1, f.p1InitReq.id, true).waitFor();
    await target(s1, f.p1Sig.id, true).waitFor();
    pl = await placements(a.signingId);
    if (acceptedFor(pl, f.p1InitOpt.id as string).length !== 0 || pl.find((p) => p.id === optFirst.id)?.disposition !== "REMOVED") fail("Initials Remove did not persist");
    await target(s1, f.p1InitOpt.id, false).click();
    await target(s1, f.p1InitOpt.id, true).waitFor({ timeout: 30000 });
    ok("optional Initials (page 2): Your fields row → click the target → Remove from the list (REMOVED; after reload the page shows the open target again while page-1 marks stay applied) → reapply on the page (new ACCEPTED placement)");

    const sigBefore = acceptedFor(await placements(a.signingId), f.p1Sig.id as string)[0];
    const dateBefore = acceptedFor(await placements(a.signingId), f.p1Date.id as string)[0];
    await row(s1, "Signature", true).getByRole("button", { name: "Replace" }).click();
    for (let i = 0; i < 40; i += 1) {
      const current = acceptedFor(await placements(a.signingId), f.p1Sig.id as string)[0];
      if (current && current.id !== sigBefore.id) break;
      await s1.waitForTimeout(500);
    }
    await waitIdle(s1);
    await row(s1, "Signature", true).getByText(`Dated ${today}`).waitFor({ timeout: 30000 });
    pl = await placements(a.signingId);
    const sigAfter = acceptedFor(pl, f.p1Sig.id as string);
    const dateAfter = acceptedFor(pl, f.p1Date.id as string);
    const oldSig = pl.find((p) => p.id === sigBefore.id)!;
    const oldDate = pl.find((p) => p.id === dateBefore.id)!;
    if (sigAfter.length !== 1 || sigAfter[0].id === sigBefore.id || oldSig.disposition !== "REPLACED" || oldSig.replaced_by_placement_id !== sigAfter[0].id) fail("Signature Replace wrong");
    if (dateAfter.length !== 1 || dateAfter[0].id === dateBefore.id || oldDate.disposition === "ACCEPTED") fail("linked Date Signed did not follow Replace");
    if (!(new Date(dateAfter[0].accepted_at!) > new Date(dateBefore.accepted_at!))) fail("replacement date not fresh");
    ok(`Signature Replace: old REPLACED → new ACCEPTED; old Date Signed ${oldDate.disposition}, new Date Signed ACCEPTED with fresh acceptance time`);

    await s1
      .waitForFunction((id) => document.activeElement?.getAttribute("data-ceremony-target") === id, String(f.p1Sig.id), { timeout: 30000 })
      .catch(() => fail("Replace did not keep the participant on the replaced Signature"));
    await row(s1, "Signature", true).getByRole("button", { name: "Remove" }).click();
    await target(s1, f.p1Sig.id, false).waitFor({ timeout: 30000 });
    await s1.waitForFunction((id) => document.activeElement?.getAttribute("data-ceremony-target") === id, String(f.p1Sig.id), { timeout: 30000 });
    if ((await guidance(s1).count()) !== 0) fail("Remove showed a hint (it should only return to the field)");
    if (!(await finishButton(s1).isDisabled()) || (await readyBanner(s1).count()) !== 0) fail("Finish / ready wording still shown after removing the required Signature");
    ok("Replace keeps focus on the replaced Signature; Remove returns focus to the now-open field (no auto-advance, no hint) and Finish / ready wording go away");
    pl = await placements(a.signingId);
    if (acceptedFor(pl, f.p1Sig.id as string).length || acceptedFor(pl, f.p1Date.id as string).length) fail("Remove left an effective Signature/Date");
    await s1.reload({ waitUntil: "networkidle" });
    await s1.getByText("One required field still needs you.").waitFor();
    await target(s1, f.p1Sig.id, false).waitFor({ timeout: 60000 });
    if ((await dateOnPage(s1, f.p1Date.id).count()) !== 0) fail("Date Signed still shown after the Signature was removed");
    if (!(await finishButton(s1).isDisabled())) fail("Finish enabled after removing the required Signature");
    await guidance(s1).filter({ hasText: "Click here to sign" }).waitFor({ timeout: 60000 });
    if ((await guidance(s1).getAttribute("data-field-id")) !== f.p1Sig.id) fail("on resume the hint is not on the one remaining required field");
    {
      // Double-click: the placement action is idempotent per field, so one ACCEPTED placement results.
      const button = target(s1, f.p1Sig.id, false);
      await button.dblclick();
    }
    await target(s1, f.p1Sig.id, true).waitFor({ timeout: 30000 });
    await dateOnPage(s1, f.p1Date.id).getByText(today).waitFor({ timeout: 30000 });
    await row(s1, "Signature", true).getByText(`Dated ${today}`).waitFor({ timeout: 30000 });
    await waitIdle(s1);
    pl = await placements(a.signingId);
    for (const fieldId of [f.p1Sig.id, f.p1Date.id, f.p1InitReq.id, f.p1InitOpt.id] as string[]) {
      if (acceptedFor(pl, fieldId).length !== 1) fail("a P1 field does not have exactly one ACCEPTED placement");
    }
    await s1.reload({ waitUntil: "networkidle" });
    await readyBanner(s1).waitFor();
    await target(s1, f.p1Sig.id, true).waitFor({ timeout: 60000 });
    await dateOnPage(s1, f.p1Date.id).getByText(today).waitFor();
    await shot(s1, "p1-04-ready-to-finish");
    ok("Signature Remove: Signature + linked Date leave the page and are no longer effective, Finish disabled (persists after reload); double-clicking Sign here → exactly one ACCEPTED placement per P1 field; reload shows the signed page");

    // ---------- applied marks: whole text inside the box at every zoom ----------
    {
      const p1Expected = [P1, "AJS", today];
      const zoomNotes: string[] = [];
      const zoomText = () => s1.getByTestId("ceremony-zoom").innerText();
      const checkAt = async (label: string) => {
        await s1.waitForTimeout(500);
        const marks = await expectAppliedMarksFit(s1, p1Expected, `P1 marks (${label})`);
        zoomNotes.push(`${label} ${await zoomText()} (${marks.length} marks, scale ${marks[0]?.scale.toFixed(2)})`);
      };
      await checkAt("Fit Width");
      await s1.getByRole("button", { name: "Fit Page", exact: true }).click();
      await checkAt("Fit Page");
      for (let i = 0; i < 6 && parseInt(await zoomText(), 10) > 80; i += 1) {
        await s1.getByRole("button", { name: "Zoom out" }).click();
        await s1.waitForTimeout(200);
      }
      while (parseInt(await zoomText(), 10) < 190) {
        await s1.getByRole("button", { name: "Zoom in" }).click();
        await checkAt("custom");
      }
      await s1.getByRole("button", { name: "Fit Width", exact: true }).click();
      await s1.reload({ waitUntil: "networkidle" });
      await target(s1, f.p1Sig.id, true).waitFor({ timeout: 60000 });
      await checkAt("after reload");
      ok(`applied marks (Signature "${P1}", default-size Initials "AJS", default-size Date Signed "${today}"): full text, no ellipsis, inside the stored box at ${zoomNotes.join("; ")}`);
    }

    // ---------- Your fields at every width ----------
    const viewportNotes: string[] = [];
    for (const [label, viewport] of [
      ["1440", { width: 1440, height: 900 }],
      ["1280", { width: 1280, height: 900 }],
      ["1200", { width: 1200, height: 900 }],
      ["1100", { width: 1100, height: 850 }],
      ["1050", { width: 1050, height: 850 }],
      ["1024", { width: 1024, height: 768 }],
      ["1000", { width: 1000, height: 768 }],
      ["960", { width: 960, height: 768 }],
      ["900", { width: 900, height: 800 }],
      ["820", { width: 820, height: 1180 }],
      ["768", { width: 768, height: 1024 }],
      ["600", { width: 600, height: 900 }],
      ["390", { width: 390, height: 844 }],
    ] as const) {
      await s1.setViewportSize(viewport);
      await s1.waitForTimeout(800);
      const overflow = await s1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) fail(`${label}: page scrolls horizontally by ${overflow}px`);
      const workspace = (await s1.getByTestId("ceremony-workspace").boundingBox())!;
      const canvasBox = await pageCanvas(s1, 1).boundingBox();
      if (!canvasBox || canvasBox.width < 250 || canvasBox.width > viewport.width) fail(`${label}: page 1 renders ${canvasBox?.width}px wide`);
      if (canvasBox.width < workspace.width - 80) fail(`${label}: Fit Width page ${canvasBox.width}px in a ${workspace.width}px workspace`);
      const share = (workspace.width * workspace.height) / (viewport.width * viewport.height);
      if (share < 0.55) fail(`${label}: the document workspace is only ${(share * 100).toFixed(0)}% of the screen`);
      if (!(await finishButton(s1).isVisible())) fail(`${label}: Finish Signing is not visible`);
      if (!(await s1.getByRole("button", { name: "Leave for now" }).first().isVisible())) fail(`${label}: Leave for now is not visible`);
      await expectTargetAligned(s1, f.p1Sig, target(s1, f.p1Sig.id, true), `P1 Signature (${label})`);
      const sidebarVisible = await fieldsHeading(s1).isVisible();
      const toggle = s1.getByRole("button", { name: "Your fields", exact: true });
      const mode = await s1.locator("[data-fields-panel-mode]").getAttribute("data-fields-panel-mode");
      const asideInViewport = async () => {
        const rect = (await s1.locator("#ceremony-your-fields").boundingBox())!;
        return rect.x >= -1 && rect.x + rect.width <= viewport.width + 1 && rect.width >= 200;
      };
      if (viewport.width >= 1024) {
        if (mode !== "docked" || !sidebarVisible) fail(`${label}: Your fields should be docked`);
        if ((await toggle.count()) !== 0) fail(`${label}: the drawer button shows while docked`);
        if (!(await asideInViewport())) fail(`${label}: docked Your fields is outside the viewport`);
      } else {
        if (mode !== "drawer" || sidebarVisible) fail(`${label}: Your fields should be behind its button`);
        if (!(await toggle.isVisible())) fail(`${label}: no visible Your fields button`);
        const toggleBox = (await toggle.boundingBox())!;
        if (toggleBox.x < 0 || toggleBox.x + toggleBox.width > viewport.width) fail(`${label}: the Your fields button is off screen`);
        await toggle.focus();
        await s1.keyboard.press("Enter");
        await fieldsHeading(s1).waitFor();
        if (!(await asideInViewport())) fail(`${label}: the open drawer is outside the viewport`);
        if ((await s1.evaluate(() => document.activeElement?.textContent?.trim())) !== "Close") fail(`${label}: opening the drawer did not move focus into it`);
        await s1.keyboard.press("Escape");
        await fieldsHeading(s1).waitFor({ state: "hidden" });
        if ((await s1.evaluate(() => document.activeElement?.textContent?.trim())) !== "Your fields") fail(`${label}: Escape did not return focus to the Your fields button`);
        await toggle.click();
        await fieldsHeading(s1).waitFor();
        await shot(s1, `p1-04-${label}-fields`);
        await row(s1, "Initials", false).getByRole("button", { name: /^Go to Initials/ }).click();
        if (await fieldsHeading(s1).isVisible()) fail(`${label}: Your fields stayed open over the document after navigating`);
        await s1.waitForFunction((id) => document.activeElement?.getAttribute("data-ceremony-target") === id, String(f.p1InitOpt.id), { timeout: 30000 });
      }
      await expectAppliedMarksFit(s1, [P1, "AJS", today], `P1 marks (${label}px)`);
      viewportNotes.push(`${label}: ${mode}, page ${Math.round(canvasBox.width)}px at ${await s1.getByTestId("ceremony-zoom").innerText()}, workspace ${(share * 100).toFixed(0)}%, overflow ${Math.max(0, overflow)}px`);
      await shot(s1, `p1-04-${label}`);
    }
    await s1.setViewportSize({ width: 1280, height: 900 });
    await s1.waitForTimeout(400);
    ok(`viewports (no page-level horizontal scroll, Fit Width fills the workspace, overlays aligned, marks fit, Finish + Leave visible; Your fields docked and on screen at ≥1024px, otherwise a visible button opens an on-screen drawer that takes focus, closes on Escape back to the button, and closes after navigating): ${viewportNotes.join("; ")}`);

    // ---------- Finish P1 ----------
    const p1CookieBeforeFinish = await ceremonyCookieValue(c1);
    await finishButton(s1).click();
    {
      const dialog = s1.getByRole("alertdialog");
      await dialog.getByText("Finish signing?").waitFor();
      const text = (await dialog.innerText()).replace(/\s+/g, " ");
      for (const phrase of [
        "You are finishing your part of this Signing.",
        "After you finish, you cannot change your signature, initials, or any of your fields.",
        "The Signing may still be waiting for other participants or final processing.",
      ]) {
        if (!text.includes(phrase)) fail(`Finish confirmation is missing "${phrase}"`);
      }
      await shot(s1, "p1-05a-finish-confirm");
      await dialog.getByRole("button", { name: "Keep reviewing" }).click();
      await dialog.waitFor({ state: "detached" });
      if ((await participantRow(a.signingId, P1)).participant_status === "FINISHED") fail("cancelling the Finish confirmation finished P1");
      await finishButton(s1).click();
      await s1.getByRole("alertdialog").getByRole("button", { name: "Yes, finish signing" }).click();
    }
    await s1.waitForURL(/\/sign\/done\?outcome=finished$/, { timeout: 30000 });
    await s1.getByText("You have finished signing.").waitFor({ timeout: 30000 });
    {
      const doneText = (await s1.locator("body").innerText()).replace(/\s+/g, " ");
      if (!doneText.includes("You may now close this browser.")) fail("done page lacks the close-browser line");
      if (/email|every participant|completed documents|Signing is complete/i.test(doneText)) fail(`done page over-claims: ${doneText}`);
    }
    ok("Finish: confirmation states finishing your part / cannot change afterward / Signing may still await others or processing; Keep reviewing cancels (still not finished); Yes, finish signing → \"You have finished signing.\" + \"You may now close this browser.\" (no email or all-finished claim)");
    if ((await c1.cookies()).some((cookie) => cookie.name === SIGNING_CEREMONY_COOKIE_NAME)) fail("ceremony cookie survived Finish");
    if ((await documentStatusWith(p1CookieBeforeFinish, contractDoc.id)) !== 404) fail("P1's pre-Finish ceremony cookie still reads document bytes");
    ok("after Finish, replaying P1's old ceremony cookie against the document route returns 404");
    p1Row = await participantRow(a.signingId, P1);
    const afterP1 = await signingRow(a.signingId);
    const { count: finalizeEarly } = await admin
      .from("signing_work_items")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", a.signingId)
      .eq("work_type", "FINALIZE_SIGNING");
    if (p1Row.participant_status !== "FINISHED" || afterP1.lifecycle_state !== "IN_PROGRESS" || afterP1.finalization_condition !== "NOT_STARTED" || finalizeEarly) {
      fail("state after P1 Finish is wrong");
    }
    const p1Final = (await placements(a.signingId)).filter((p) => p.signing_participant_id === p1.id);
    await shot(s1, "p1-05-finished");
    await s1.reload({ waitUntil: "networkidle" });
    const afterReload = await s1.locator("body").innerText();
    if (/Sign here|Initial here|Remove|Replace/.test(afterReload)) fail("finished P1 can still act after reload");
    await c1.close();
    {
      const { context, page } = await enter(linkP1, P1, "p1-return");
      await affirm(page, P1).catch(() => undefined);
      const body = await page.locator("body").innerText();
      if (/Sign here|Initial here|Replace|Remove/.test(body)) fail("finished P1 offered ceremony controls on return");
      await shot(page, "p1-06-return-after-finish");
      const probe = await ceremonyContextFor(context).catch(() => ({ ok: false as const, code: "NO_SESSION" }));
      let blocked = probe.ok ? "" : probe.code;
      if (probe.ok) {
        try {
          await acceptFieldPlacement({ admin, context: probe.write, signingFieldId: f.p1InitOpt.id, clientRequestId: `qa-${randomUUID()}` });
        } catch (error) {
          blocked = (error as { code?: string }).code ?? (error as Error).message;
        }
      }
      if (!blocked) fail("finished P1 could write after Finish");
      ok(`P1 Finish: FINISHED; Signing IN_PROGRESS, finalization NOT_STARTED, no FINALIZE work item; reload shows no controls; returning link shows no controls; server write refused (${blocked})`);
      await context.close();
    }

    // ---------- Participant 2 ----------
    await manager.goto(`${APP_ORIGIN}/signings/${a.signingId}`, { waitUntil: "networkidle" });
    await panel(P1).getByText("FINISHED").waitFor({ timeout: 60000 });
    const linkP2 = await copySigningLink(P2, "P2 copy");
    let { context: c2, page: s2 } = await enter(linkP2, P2, "p2");
    if ((await s2.getByRole("button", { name: `I am ${P1}` }).count()) !== 0) fail("P2 offered P1 affirmation");
    await affirm(s2, P2);
    await consentInUi(s2, "s2");
    await startSigning(s2, P2, "BR", "P2");
    await pageCanvas(s2, 1).waitFor({ timeout: 60000 });
    await guidance(s2).filter({ hasText: "Click here to sign" }).waitFor({ timeout: 60000 });
    if ((await guidance(s2).getAttribute("data-field-id")) !== f.p2Sig.id) fail("P2 Start signing did not guide to P2's Signature");
    if ((await fieldRows(s2).count()) !== 2) fail("P2 does not see exactly its 2 actionable fields");
    if ((await s2.locator("[data-ceremony-document]").count()) !== 2) fail("P2 does not see both documents");
    const p2Html = await s2.content();
    for (const other of [f.p1Sig.id, f.p1InitReq.id, f.p1InitOpt.id, f.p1Date.id] as string[]) {
      if (p2Html.includes(other)) fail("P2 page references a P1 field");
    }
    {
      const p1Signed = await s2.locator('[data-ceremony-target][data-placed="true"]').count();
      const p2Text = await s2.locator("body").innerText();
      if (p1Signed !== 0 || p2Text.includes("AJS")) fail("P2 sees P1's applied marks as overlays");
      if ((await s2.locator("[data-ceremony-target]").count()) !== 1) fail("P2 contract shows other than its own single Signature target");
      await expectTargetAligned(s2, f.p2Sig, target(s2, f.p2Sig.id, false), "P2 Signature");
    }
    {
      const probe = await ceremonyContextFor(c2);
      if (!probe.ok) fail(`P2 probe failed: ${probe.code}`);
      for (const fieldId of [f.p1InitOpt.id, f.p1Sig.id]) {
        let code = "";
        try {
          await acceptFieldPlacement({ admin, context: probe.write, signingFieldId: fieldId, clientRequestId: `qa-${randomUUID()}` });
        } catch (error) {
          code = (error as { code?: string }).code ?? (error as Error).message;
        }
        if (!code) fail("P2 session placed a P1 field");
        ok(`P2 session acting on a P1 field refused (${code})`);
      }
    }

    await target(s2, f.p2Sig.id, false).click();
    await row(s2, "Signature", true).getByText(`Dated ${today}`).waitFor({ timeout: 30000 });
    // Auto-advance after an accepted placement switches to the addendum and its Initials target.
    await s2.getByText("Document 2 of 2 · 1 page").waitFor({ timeout: 60000 });
    await target(s2, f.p2Init.id, false).waitFor({ timeout: 60000 });
    await guidance(s2).filter({ hasText: "Click here to initial" }).waitFor({ timeout: 60000 });
    await s2.waitForFunction((id) => document.activeElement?.getAttribute("data-ceremony-target") === id, String(f.p2Init.id), { timeout: 30000 });
    if (acceptedFor(await placements(a.signingId), f.p2Init.id as string).length !== 0) fail("cross-document auto-advance applied the Initials");
    ok("cross-document auto-advance: after P2's contract Signature is accepted, the addendum opens with focus and the hint on P2's Initials (not applied)");

    // ---------- Leave for now (Exit) and resume (P2) ----------
    const p2SigBeforeExit = acceptedFor(await placements(a.signingId), f.p2Sig.id as string);
    const lastSequenceBeforeExit = Number(
      ((await admin.from("signing_events").select("sequence_number").eq("signing_id", a.signingId).order("sequence_number", { ascending: false }).limit(1)).data ?? [])[0]?.sequence_number ?? 0,
    );
    const p2CookieBeforeExit = await ceremonyCookieValue(c2);
    await s2.getByRole("button", { name: "Leave for now" }).click();
    await s2.waitForURL(/\/sign\/done\?outcome=exited$/, { timeout: 30000 });
    await s2.getByText("You left signing for now").waitFor({ timeout: 30000 });
    await s2.getByText(/You have not declined\./).waitFor();
    if ((await c2.cookies()).some((cookie) => cookie.name === SIGNING_CEREMONY_COOKIE_NAME)) fail("ceremony cookie survived Exit");
    if ((await documentStatusWith(p2CookieBeforeExit, addendumDoc.id)) !== 404) fail("P2's pre-Exit ceremony cookie still reads document bytes");
    {
      const { data: p2Sessions } = await admin
        .from("signing_browser_sessions")
        .select("status, ended_reason")
        .eq("signing_id", a.signingId)
        .eq("signing_participant_id", p2.id);
      if ((p2Sessions ?? []).some((session) => session.status === "ACTIVE")) fail("P2 session still ACTIVE after Exit");
      const p2AfterExit = await participantRow(a.signingId, P2);
      if (p2AfterExit.participant_status === "FINISHED" || p2AfterExit.participant_status === "DECLINED" || p2AfterExit.declined_at) fail(`Exit changed P2 to ${p2AfterExit.participant_status}`);
      if ((await signingRow(a.signingId)).lifecycle_state !== "IN_PROGRESS") fail("Exit changed the Signing lifecycle");
      const p2SigAfterExit = acceptedFor(await placements(a.signingId), f.p2Sig.id as string);
      if (p2SigAfterExit.length !== 1 || p2SigAfterExit[0].id !== p2SigBeforeExit[0]?.id) fail("Exit removed or changed P2's Signature");
      const newEvents = (await admin.from("signing_events").select("event_type").eq("signing_id", a.signingId).gt("sequence_number", lastSequenceBeforeExit).order("sequence_number")).data ?? [];
      if (newEvents.some((event) => /DECLIN|CANCEL|REMOVED/.test(event.event_type as string))) fail(`Exit recorded ${JSON.stringify(newEvents)}`);
      console.log(`INFO: P2 browser sessions after Exit: ${JSON.stringify(p2Sessions)}; new P2 events: ${JSON.stringify(newEvents)}`);
    }
    await shot(s2, "p2-00-exited");
    await manager.goto(`${APP_ORIGIN}/signings/${a.signingId}`, { waitUntil: "networkidle" });
    {
      const managerText = await panel(P2).innerText();
      if (/DECLINED|Cancelled/i.test(managerText)) fail(`manager shows P2 as declined / cancelled after Exit: ${managerText.slice(0, 200)}`);
    }
    await c2.close();
    ({ context: c2, page: s2 } = await enter(linkP2, P2, "p2-resume"));
    if ((await s2.getByRole("button", { name: `I am ${P2}` }).count()) !== 1) fail("resume did not ask P2 to confirm identity again");
    await affirm(s2, P2);
    await fieldsHeading(s2).waitFor({ timeout: 60000 });
    if ((await s2.getByTestId("consent-continue").count()) !== 0) fail("P2 re-prompted for consent after Exit");
    if ((await s2.getByRole("button", { name: "Start signing" }).count()) !== 0) fail("P2 marks lost after Exit");
    await row(s2, "Signature", true).getByText(`Dated ${today}`).waitFor({ timeout: 30000 });
    await s2.getByText("Document 2 of 2 · 1 page").waitFor({ timeout: 60000 });
    await guidance(s2).filter({ hasText: "Click here to initial" }).waitFor({ timeout: 60000 });
    if ((await guidance(s2).getAttribute("data-field-id")) !== f.p2Init.id) fail("resume did not guide to P2's remaining Initials");
    ok(`P2 Leave for now: "You left signing for now … You have not declined." (/sign/done?outcome=exited); ceremony cookie cleared and old cookie gets 404; session no longer ACTIVE; P2 not finished or declined, Signing still IN_PROGRESS, Signature placement unchanged, no decline/cancel event; manager panel not declined; the same link asks "I am ${P2}" again and resumes with consent, marks and the Signature kept, guiding to the remaining Initials on the addendum`);
    await expectTargetAligned(s2, f.p2Init, target(s2, f.p2Init.id, false), "P2 addendum Initials");
    await target(s2, f.p2Init.id, false).click();
    await target(s2, f.p2Init.id, true).waitFor({ timeout: 30000 });
    await row(s2, "Initials", true).getByText(`Dated ${today}`).waitFor({ timeout: 30000 });
    await dateOnPage(s2, f.p2IniDate!.id).getByText(today).waitFor({ timeout: 30000 });
    const iniDateFirst = acceptedFor(await placements(a.signingId), f.p2IniDate!.id as string);
    if (iniDateFirst.length !== 1) fail("Initials-linked Date was not applied with the Initials");
    await shot(s2, "p2-00-initials-linked-date");
    await row(s2, "Initials", true).getByRole("button", { name: "Remove" }).click();
    await target(s2, f.p2Init.id, false).waitFor({ timeout: 30000 });
    if ((await dateOnPage(s2, f.p2IniDate!.id).count()) !== 0) fail("Initials-linked Date still shown after the Initials were removed");
    if (acceptedFor(await placements(a.signingId), f.p2IniDate!.id as string).length !== 0) {
      fail("Initials-linked Date still effective after the Initials were removed");
    }
    await target(s2, f.p2Init.id, false).click();
    await target(s2, f.p2Init.id, true).waitFor({ timeout: 30000 });
    await dateOnPage(s2, f.p2IniDate!.id).getByText(today).waitFor({ timeout: 30000 });
    await expectAppliedMarksFit(s2, ["BR", today], "P2 addendum marks (short Initials)");
    const iniDateSecond = acceptedFor(await placements(a.signingId), f.p2IniDate!.id as string);
    if (iniDateSecond.length !== 1 || iniDateSecond[0].id === iniDateFirst[0].id) {
      fail("reapplying the Initials did not apply a fresh linked Date");
    }
    ok(`P2 addendum: Initials apply their linked Date (${today}); Remove takes the Date off the page and out of effect; reapply gives a fresh Date placement`);
    await readyBanner(s2).waitFor();
    await s2.locator(`[data-ceremony-document="${contractDoc.id}"]`).click();
    await target(s2, f.p2Sig.id, true).waitFor({ timeout: 60000 });
    await dateOnPage(s2, f.p2Date.id).getByText(today).waitFor({ timeout: 30000 });
    await expectAppliedMarksFit(s2, [P2, today], "P2 contract marks (44pt-wide Date Signed)");
    const p1Unchanged = (await placements(a.signingId)).filter((p) => p.signing_participant_id === p1.id);
    if (JSON.stringify(p1Unchanged) !== JSON.stringify(p1Final)) fail("P1 placements changed during P2 ceremony");
    await shot(s2, "p2-01-ready-to-finish");
    ok(`P2: entry, "I am ${P2}", consent, Start signing with read-only "${P2}" / "BR"; Sign here on the contract (Date ${today}) auto-advances to the addendum, where Initial here is applied at its stored position; sees only own 2 fields and none of P1's marks; P1 placements unchanged`);
    if (!manager.url().endsWith(`/signings/${a.signingId}`)) fail(`manager is not on Signing A before P2 finishes (${manager.url()})`);
    await manager.evaluate(() => { (window as unknown as { __qaLive?: string }).__qaLive = "a"; });
    if ((await manager.getByTestId("completed-documents").count()) !== 0) fail("Completed documents shown while In Progress");
    await finishButton(s2).click();
    await s2.getByRole("alertdialog").getByRole("button", { name: "Yes, finish signing" }).click();
    await s2.waitForURL(/\/sign\/done\?outcome=finished$/, { timeout: 30000 });
    await s2.getByText("You have finished signing.").waitFor({ timeout: 30000 });
    const finishedAt = Date.now();
    const afterP2 = await signingRow(a.signingId);
    if ((await participantRow(a.signingId, P2)).participant_status !== "FINISHED") fail("P2 not FINISHED");
    ok(`P2 Finish: FINISHED; finalization_condition immediately after Finish = ${afterP2.finalization_condition}, lifecycle ${afterP2.lifecycle_state}`);
    await c2.close();

    // ---------- finalization ----------
    const { data: workItems } = await admin
      .from("signing_work_items")
      .select("id, work_type, processing_state, attempt_count, last_error_safe")
      .eq("signing_id", a.signingId)
      .eq("work_type", "FINALIZE_SIGNING");
    if ((workItems ?? []).length !== 1) fail(`expected one FINALIZE_SIGNING work item, saw ${(workItems ?? []).length}`);
    ok(`FINALIZE_SIGNING enqueued once (state at check: ${workItems![0].processing_state})`);
    let complete = await signingRow(a.signingId);
    const observed = new Set<string>([String(afterP2.finalization_condition)]);
    while (Date.now() - finishedAt < 180000 && complete.lifecycle_state !== "COMPLETE") {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      complete = await signingRow(a.signingId);
      observed.add(String(complete.finalization_condition));
      if (complete.finalization_condition === "FAILED") break;
    }
    const { data: workAfter } = await admin
      .from("signing_work_items")
      .select("work_type, processing_state, attempt_count, last_error_safe")
      .eq("signing_id", a.signingId);
    if (complete.lifecycle_state !== "COMPLETE" || complete.finalization_condition !== "VERIFIED") {
      fail(`finalization did not complete: lifecycle ${complete.lifecycle_state}, condition ${complete.finalization_condition}; work ${JSON.stringify(workAfter)}`);
    }
    ok(`worker (request-driven kick) finalized in ${Math.round((Date.now() - finishedAt) / 1000)}s; conditions observed: ${[...observed].join(" → ")}; lifecycle COMPLETE; work items: ${(workAfter ?? []).map((w) => `${w.work_type}=${w.processing_state}`).join(", ")}`);
    {
      const completeAt = Date.now();
      await manager.getByText("Finalization VERIFIED").waitFor({ timeout: 45000 })
        .catch(() => fail("the open manager page did not show Complete without a reload"));
      if ((await manager.evaluate(() => (window as unknown as { __qaLive?: string }).__qaLive)) !== "a") fail("the manager page reloaded");
      if ((await manager.getByRole("button", { name: "Copy signing link" }).count()) !== 0) fail("the live manager page still offers Copy signing link after Complete");
      ok(`live refresh (Complete): the manager page left open since before P2 finished showed COMPLETE / Finalization VERIFIED ${((Date.now() - finishedAt) / 1000).toFixed(1)}s after Finish (${((Date.now() - completeAt) / 1000).toFixed(1)}s after the server reached COMPLETE), with no reload`);
      const liveSection = manager.getByTestId("completed-documents");
      await liveSection.waitFor({ timeout: 10000 }).catch(() => fail("the live manager page did not show Completed documents with Complete"));
      const liveRows = await liveSection.locator("li[data-completed-artifact]").evaluateAll((rows) =>
        rows.map((row) => `${row.getAttribute("data-completed-artifact")}:${row.getAttribute("data-artifact-label")}`),
      );
      if (liveRows.filter((row) => row.startsWith("DOCUMENT:")).length !== 2 || !liveRows.includes("CERTIFICATE:Audit certificate")) {
        fail(`live Completed documents rows: ${JSON.stringify(liveRows)}`);
      }
      if ((await manager.evaluate(() => (window as unknown as { __qaLive?: string }).__qaLive)) !== "a") fail("the manager page reloaded");
      if (!liveRows.includes("COMBINED:Combined signed package")) {
        const pending = manager.locator('[data-completed-artifact-pending="COMBINED"]');
        if ((await pending.count()) === 0) fail("Complete without the combined package, but no Preparing row");
        if ((await pending.locator("a, button").count()) !== 0) fail("the Preparing row offers View or Download");
        const pendingSince = Date.now();
        await manager.locator('li[data-completed-artifact="COMBINED"]').waitFor({ timeout: 45000 })
          .catch(() => fail("the open tab never replaced Preparing with the combined package"));
        if ((await pending.count()) !== 0) fail("Preparing row still shown next to the ready package");
        if ((await manager.evaluate(() => (window as unknown as { __qaLive?: string }).__qaLive)) !== "a") fail("the manager page reloaded");
        ok(`live refresh (combined package): the first Complete refresh showed "Combined signed package — Preparing…" (no View / Download); the same tab gained View / Download ${((Date.now() - pendingSince) / 1000).toFixed(1)}s later, no reload`);
      }
      await shot(manager, "a02b-live-completed-documents");
      ok(`live refresh (Completed documents): the same stale tab shows the Completed documents section (${liveRows.length} rows: ${liveRows.join(", ")}) in the watcher refresh that saw COMPLETE, with no reload`);
    }

    const { data: artifacts } = await admin
      .from("signing_artifacts")
      .select("id, artifact_category, storage_object_key, content_sha256, verified_at, page_count, frozen_filename, package_revision_id, package_revision_document_id, generated_at")
      .eq("signing_id", a.signingId);
    const completed = (artifacts ?? []).filter((x) => x.artifact_category === "COMPLETED_DOCUMENT");
    const certificates = (artifacts ?? []).filter((x) => x.artifact_category === "AUDIT_CERTIFICATE");
    if (completed.length !== 2 || certificates.length !== 1) fail(`artifacts: ${completed.length} completed, ${certificates.length} certificates`);
    const completedFile = (revisionDocumentId: string) =>
      revisionDocumentId === contractDoc.id ? "completed_document-contract.pdf" : "completed_document-addendum.pdf";
    if (new Set(completed.map((artifact) => artifact.package_revision_document_id)).size !== 2 || completed.some((artifact) => ![contractDoc.id, addendumDoc.id].includes(artifact.package_revision_document_id as string))) {
      fail("completed documents are not one per revision document");
    }
    for (const artifact of [...completed, ...certificates]) {
      if (!artifact.verified_at || artifact.package_revision_id !== complete.frozen_package_revision_id) fail("artifact unverified or wrong revision");
      if (new Date(artifact.verified_at) > new Date(complete.completed_at!)) fail("Complete recorded before artifact verification");
      const { data: blob, error } = await admin.storage.from(SIGNING_ARTIFACTS_BUCKET).download(artifact.storage_object_key as string);
      if (error || !blob) fail(`artifact download failed: ${error?.message}`);
      const bytes = Buffer.from(await blob.arrayBuffer());
      if (sha256(bytes) !== artifact.content_sha256) fail(`${artifact.artifact_category} sha256 mismatch`);
      const fileName = artifact.artifact_category === "COMPLETED_DOCUMENT"
        ? completedFile(artifact.package_revision_document_id as string)
        : `${artifact.artifact_category.toLowerCase()}.pdf`;
      writeFileSync(path.join(OUT_DIR, fileName), bytes);
    }
    const chain = await verifySigningEventChain(admin, a.signingId);
    if (!chain.ok) fail(`event chain verification failed: ${JSON.stringify(chain).slice(0, 300)}`);
    ok(`artifacts: 2 COMPLETED_DOCUMENT (one per revision document: contract + addendum) + 1 AUDIT_CERTIFICATE, verified, bound to the frozen revision, stored bytes match sha256, verified before completed_at; protected event chain verifies`);

    // ---------- completed PDF content ----------
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const standardFontDataUrl = `${path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts").replace(/\\/g, "/")}/`;
    type TextItem = { str: string; transform: number[]; width: number };
    const pageText = new Map<string, { items: TextItem[]; height: number }>();
    for (const [docKey, fileName, pageCount] of [["contract", "completed_document-contract.pdf", 2], ["addendum", "completed_document-addendum.pdf", 1]] as const) {
      const bytes = readFileSync(path.join(OUT_DIR, fileName));
      const parsedPdf = await PDFDocument.load(bytes);
      const fontNames: string[] = [];
      for (const [, object] of parsedPdf.context.enumerateIndirectObjects()) {
        if (object instanceof PDFDict && object.get(PDFName.of("Type"))?.toString() === "/Font") {
          fontNames.push(String(object.get(PDFName.of("BaseFont"))));
        }
      }
      if (!fontNames.some((name) => name.includes("HarbaughCaveat"))) fail(`completed ${docKey} has no Caveat font (${fontNames.join(", ")})`);
      const loaded = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, standardFontDataUrl }).promise;
      if (loaded.numPages !== pageCount) fail(`completed ${docKey} has ${loaded.numPages} pages, expected ${pageCount}`);
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const pdfPage = await loaded.getPage(pageNumber);
        pageText.set(`${docKey}:${pageNumber}`, {
          items: (await pdfPage.getTextContent()).items as TextItem[],
          height: pdfPage.getViewport({ scale: 1 }).height,
        });
      }
    }
    const box = (field: Record<string, unknown>): FieldBox => ({
      id: field.id as string,
      x: Number(field.x),
      y: Number(field.y),
      width: Number(field.width),
      height: Number(field.height),
      page: Number(field.page_number),
    });
    const docKeyOf = (field: Record<string, unknown>) => (field.package_revision_document_id === contractDoc.id ? "contract" : "addendum");
    function expectTextIn(text: string, field: Record<string, unknown>, label: string) {
      const fb = box(field);
      const pageInfo = pageText.get(`${docKeyOf(field)}:${fb.page}`);
      if (!pageInfo) fail(`${label}: completed ${docKeyOf(field)} page ${fb.page} missing`);
      const top = pageInfo.height - fb.y;
      const inside = pageInfo.items.some((item) => {
        const [x, y] = [item.transform[4], item.transform[5]];
        return item.str.trim() === text && x >= fb.x - 1 && x + item.width <= fb.x + fb.width + 0.75 && y >= top - fb.height - 1 && y <= top + 1;
      });
      if (!inside) fail(`completed ${docKeyOf(field)} page ${fb.page}: the whole "${text}" is not inside the ${label} box`);
    }
    const occurrences = (text: string) =>
      [...pageText.values()].reduce((count, info) => count + info.items.filter((item) => item.str.trim() === text).length, 0);
    expectTextIn(P1, f.p1Sig, "P1 Signature");
    expectTextIn(P2, f.p2Sig, "P2 Signature");
    expectTextIn("BR", f.p2Init, "P2 addendum Initials");
    expectTextIn("AJS", f.p1InitReq, "P1 required Initials");
    expectTextIn("AJS", f.p1InitOpt, "P1 optional Initials (page 2)");
    expectTextIn(today, f.p1Date, "P1 Date Signed");
    expectTextIn(today, f.p2Date, "P2 Date Signed");
    expectTextIn(today, f.p2IniDate, "P2 Initials-linked Date Signed (addendum)");
    if (occurrences("AJS") !== 2 || occurrences(today) !== 3 || occurrences("BR") !== 1) {
      fail(`expected 2× AJS, 3× ${today}, 1× BR; saw ${occurrences("AJS")} / ${occurrences(today)} / ${occurrences("BR")}`);
    }

    // Manager-prepared content: in the prepared version and the completed PDF.
    const printedField = {
      id: "printed-name",
      ...PRINTED_NAME_BOX,
      page_number: PRINTED_NAME_BOX.pageNumber,
      package_revision_document_id: contractDoc.id,
    };
    expectTextIn(P2, printedField, "Printed Name (completed)");
    async function checkmarkPathIn(bytes: Uint8Array, label: string) {
      const loadedPdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: false, standardFontDataUrl }).promise;
      const pdfPage = await loadedPdf.getPage(CHECKMARK_BOX.pageNumber);
      const height = pdfPage.getViewport({ scale: 1 }).height;
      const operators = await pdfPage.getOperatorList();
      const top = height - CHECKMARK_BOX.y;
      const found = operators.fnArray.some((fn: number, index: number) => {
        if (fn !== pdfjs.OPS.constructPath) return false;
        const args = operators.argsArray[index] as unknown[];
        const minMax = Array.from((args[args.length - 1] ?? []) as ArrayLike<number>);
        if (minMax.length !== 4) return false;
        const [minX, minY, maxX, maxY] = minMax;
        return (
          minX >= CHECKMARK_BOX.x - 1 && maxX <= CHECKMARK_BOX.x + CHECKMARK_BOX.width + 1 &&
          minY >= top - CHECKMARK_BOX.height - 1 && maxY <= top + 1
        );
      });
      if (!found) fail(`${label}: no Checkmark strokes inside the checkmark box`);
      const text = (await pdfPage.getTextContent()).items as TextItem[];
      const printedTop = height - PRINTED_NAME_BOX.y;
      if (!text.some((item) => item.str.trim() === P2 && item.transform[4] >= PRINTED_NAME_BOX.x - 1 && item.transform[5] >= printedTop - PRINTED_NAME_BOX.height - 1 && item.transform[5] <= printedTop + 1)) {
        fail(`${label}: Printed Name "${P2}" not inside its box`);
      }
    }
    await checkmarkPathIn(new Uint8Array(readFileSync(path.join(OUT_DIR, "completed_document-contract.pdf"))), "completed contract");
    const { data: contractVersion } = await admin
      .from("signing_package_revision_documents")
      .select("signing_document_version_id")
      .eq("id", contractDoc.id)
      .single();
    const { data: versionRow } = await admin
      .from("signing_document_versions")
      .select("storage_object_key")
      .eq("id", contractVersion!.signing_document_version_id as string)
      .single();
    const { data: preparedBlob } = await admin.storage
      .from(SIGNING_ARTIFACTS_BUCKET)
      .download(versionRow!.storage_object_key as string);
    if (!preparedBlob) fail("prepared contract version download failed");
    await checkmarkPathIn(new Uint8Array(await preparedBlob.arrayBuffer()), "prepared contract version");
    ok(`prepared content: Printed Name "${P2}" and the Checkmark are in the prepared contract version and the completed contract (inside their boxes); they never became fields, marks, or progress (P2 still had exactly 2 actionable fields)`);
    for (const stale of [P1.toLowerCase(), "AJX", "ZZ"]) {
      if ([...pageText.values()].some((info) => info.items.some((item) => item.str.includes(stale)))) fail(`completed PDF contains stale/rejected mark "${stale}"`);
    }
    const certificateItems = (await (await (await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path.join(OUT_DIR, "audit_certificate.pdf"))), standardFontDataUrl }).promise).getPage(1)).getTextContent()).items as { str: string }[];
    const certificateText = certificateItems.map((item) => item.str).join(" ");
    for (const expected of [P1, P2]) {
      if (!certificateText.includes(expected)) fail(`audit certificate page 1 does not name ${expected}`);
    }
    ok(`completed PDFs: Caveat (HarbaughCaveat) embedded in both; contract page 1 has "${P1}", "${P2}", "AJS" and 2× "${today}", contract page 2 has the optional "AJS", the addendum has "BR" — each inside its assigned field box (same coordinates the ceremony overlay used); no stale/rejected marks; audit certificate names both participants`);

    // ---------- completed-package access + copy recipients ----------
    const { data: packageCreds } = await admin
      .from("signing_completed_package_credentials")
      .select("id, signing_participant_id, signing_copy_recipient_id, is_current, revoked_at, create_date")
      .eq("signing_id", a.signingId);
    const creds = packageCreds ?? [];
    const copyCreds = creds.filter((cred) => cred.signing_copy_recipient_id);
    if (creds.filter((cred) => cred.signing_participant_id).length !== 2 || copyCreds.length !== 1) fail(`completed-package credentials: ${JSON.stringify(creds.map((cred) => Boolean(cred.signing_copy_recipient_id)))}`);
    {
      // `completed_at` is stamped by the app server's clock and credential
      // `create_date` by the database's, so allow for clock skew between them.
      // "No credential before Complete" by state is asserted at Send above.
      const CLOCK_SKEW_TOLERANCE_MS = 2_000;
      const completedAtMs = new Date(complete.completed_at!).getTime();
      if (creds.some((cred) => new Date(cred.create_date).getTime() < completedAtMs - CLOCK_SKEW_TOLERANCE_MS)) {
        fail("completed-package credential issued before Complete");
      }
    }
    ok("completed-package credentials issued after Complete for both participants and the copy recipient");
    const p1Cred = creds.find((cred) => cred.signing_participant_id === p1.id)!;
    const packageToken = await loadRawCompletedPackageToken({ admin, signingId: a.signingId, credentialId: p1Cred.id });
    if (!packageToken) fail("completed-package token unavailable");
    secrets.push(packageToken);
    {
      const { context, page } = await newParticipantContext("package", true);
      await page.goto(buildCompletedPackageUrl(p1Cred.id, packageToken).replace(/^https?:\/\/[^/]+/, APP_ORIGIN), { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/sign\/package/, { timeout: 60000 });
      await page.getByText("Completed documents", { exact: true }).waitFor();
      await page.getByText("Audit certificate").waitFor();
      await page.getByText("Completed document", { exact: true }).first().waitFor();
      const documentLinks = page.locator("a", { hasText: "Completed document" });
      if ((await documentLinks.count()) !== 2) fail(`completed package lists ${await documentLinks.count()} completed documents, expected 2`);
      const expectedHashes = new Set(completed.map((artifact) => artifact.content_sha256 as string));
      const seenHashes = new Set<string>();
      for (let index = 0; index < 2; index += 1) {
        const href = await documentLinks.nth(index).getAttribute("href");
        const response = await context.request.get(`${APP_ORIGIN}${href}`);
        const hash = sha256(await response.body());
        if (response.status() !== 200 || !expectedHashes.has(hash)) fail("completed-package download mismatch");
        seenHashes.add(hash);
      }
      if (seenHashes.size !== 2) fail("completed-package downloads did not cover both documents");
      for (const suffix of ["", "?download=1"]) {
        const managerRoute = await context.request.get(`${APP_ORIGIN}/signings/${a.signingId}/completed/${completed[0].id}${suffix}`, { maxRedirects: 0 });
        if (managerRoute.status() === 200 || (await managerRoute.body()).subarray(0, 5).toString("latin1") === "%PDF-") {
          fail(`a completed-package (participant) session reached the manager completed-document route (${managerRoute.status()})`);
        }
      }
      ok("a participant completed-package session cannot use the manager completed-document View / Download route");
      await shot(page, "a02-completed-package");
      await context.close();
      ok("completed-package link (account-free) lists both completed documents + Audit certificate; both downloads are 200 and byte-identical to the verified artifacts");
    }

    // ---------- manager completed view ----------
    await manager.goto(`${APP_ORIGIN}/signings/${a.signingId}`, { waitUntil: "networkidle" });
    await manager.getByText("Signing operations").waitFor({ timeout: 60000 });
    const managerText = await manager.locator("body").innerText();
    for (const expected of ["COMPLETE", "Finalization VERIFIED", "Completed package delivery", "Copy recipient", P1, P2]) {
      if (!managerText.includes(expected)) fail(`manager completed view is missing "${expected}"`);
    }
    if (managerText.includes("In Progress — participant access") || (await manager.getByRole("button", { name: "Copy signing link" }).count()) !== 0) {
      fail("participant link controls still shown after Complete");
    }
    const managerDownloads = await manager.locator('a[href*="artifact"], a[download]').count();
    await shot(manager, "a03-manager-complete");
    ok(`manager view: COMPLETE badge, Finalization VERIFIED, completed-package delivery rows (participants + copy recipient), no participant link controls; completed-document view/download links on manager page: ${managerDownloads}`);

    // ---------- manager completed documents: View / Download ----------
    const completedUrl = (signingId: string, artifactId: string, download = false) =>
      `${APP_ORIGIN}/signings/${signingId}/completed/${artifactId}${download ? "?download=1" : ""}`;
    const fingerprints = new Map<string, string>();
    {
      const section = manager.getByTestId("completed-documents");
      await section.waitFor({ timeout: 30000 });
      const rows = await section.locator("li[data-completed-artifact]").evaluateAll((items) =>
        items.map((item) => ({ kind: item.getAttribute("data-completed-artifact") ?? "", label: item.getAttribute("data-artifact-label") ?? "" })),
      );
      const labels = rows.map((row) => `${row.kind}:${row.label}`);
      if (labels[0] !== "DOCUMENT:Ceremony QA Contract" || labels[1] !== "DOCUMENT:Ceremony QA Addendum" || labels[2] !== "CERTIFICATE:Audit certificate") {
        fail(`Completed documents rows (package order, then certificate): ${JSON.stringify(labels)}`);
      }
      const sectionText = await section.innerText();
      if (/[0-9a-f]{8}-[0-9a-f]{4}-|signings\/|artifacts\/|sha256|revision/i.test(sectionText)) fail("Completed documents shows ids, keys or revision details");
      const sectionTop = (await section.boundingBox())!.y;
      const opsTop = (await manager.getByText("Signing operations").first().boundingBox())!.y;
      if (sectionTop > opsTop) fail("Completed documents is below the operations panel");
      const hrefs = await section.locator("a[download]").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
      if (hrefs.some((href) => !/^\/signings\/[0-9a-f-]{36}\/completed\/[0-9a-f-]{36}\?download=1$/.test(href))) fail(`Download links are not opaque same-origin routes: ${JSON.stringify(hrefs)}`);
      ok(`Completed documents (Complete only): ${labels.join(", ")}; above Signing operations; manager-friendly names, no ids or storage keys; Download links are opaque /signings/{id}/completed/{artifactId} routes`);

      const artifactsByLabel = new Map<string, Record<string, unknown>>([
        ["Ceremony QA Contract", completed.find((artifact) => artifact.package_revision_document_id === contractDoc.id)!],
        ["Ceremony QA Addendum", completed.find((artifact) => artifact.package_revision_document_id === addendumDoc.id)!],
        ["Audit certificate", certificates[0]],
      ]);
      const savedFile: Record<string, string> = {
        "Ceremony QA Contract": "completed_document-contract.pdf",
        "Ceremony QA Addendum": "completed_document-addendum.pdf",
        "Audit certificate": "audit_certificate.pdf",
      };
      if (labels.includes("COMBINED:Combined signed package")) {
        const { data: combined } = await admin
          .from("signing_artifacts")
          .select("id, content_sha256")
          .eq("signing_id", a.signingId)
          .eq("artifact_category", "COMBINED_PACKAGE")
          .not("verified_at", "is", null)
          .single();
        if (!combined) fail("Combined signed package listed without a verified artifact");
        artifactsByLabel.set("Combined signed package", combined);
      }
      for (const [label, artifact] of artifactsByLabel) {
        const view = await managerContext.request.get(completedUrl(a.signingId, artifact.id as string));
        const download = await managerContext.request.get(completedUrl(a.signingId, artifact.id as string, true));
        const viewBytes = await view.body();
        const downloadBytes = await download.body();
        const expectedName = label === "Audit certificate" ? "Audit certificate.pdf" : label === "Combined signed package" ? "Combined signed package.pdf" : `${label} - signed.pdf`;
        if (view.status() !== 200 || download.status() !== 200) fail(`${label}: View ${view.status()} / Download ${download.status()}`);
        if (view.headers()["content-type"] !== "application/pdf" || download.headers()["content-type"] !== "application/pdf") fail(`${label}: not served as application/pdf`);
        if (!view.headers()["content-disposition"]?.startsWith(`inline; filename="${expectedName}"`)) fail(`${label}: View disposition ${view.headers()["content-disposition"]}`);
        if (!download.headers()["content-disposition"]?.startsWith(`attachment; filename="${expectedName}"`)) fail(`${label}: Download disposition ${download.headers()["content-disposition"]}`);
        if (!/no-store/.test(view.headers()["cache-control"] ?? "") || view.headers()["x-content-type-options"] !== "nosniff") fail(`${label}: missing no-store / nosniff`);
        if (sha256(viewBytes) !== artifact.content_sha256 || !viewBytes.equals(downloadBytes) || view.headers()["x-signing-artifact-sha256"] !== artifact.content_sha256) {
          fail(`${label}: View / Download bytes differ from each other or from the recorded SHA-256`);
        }
        if (savedFile[label] && !viewBytes.equals(readFileSync(path.join(OUT_DIR, savedFile[label])))) fail(`${label}: served bytes differ from the verified artifact checked above`);
        fingerprints.set(artifact.id as string, sha256(viewBytes));
      }
      ok(`View (inline) and Download (attachment) of ${[...artifactsByLabel.keys()].join(", ")} return byte-identical`);
      ok("View / Download parity: byte-identical application/pdf bodies equal to the finalization SHA-256 and to the artifacts whose Signature / Initials / Date / Printed Name / Checkmark were verified above; no-store + nosniff; filenames \"Ceremony QA Contract - signed.pdf\", \"Ceremony QA Addendum - signed.pdf\", \"Audit certificate.pdf\"");

      const contractRow = section.locator('li[data-artifact-label="Ceremony QA Contract"]');
      const viewButton = contractRow.getByRole("button", { name: "View Ceremony QA Contract" });
      await viewButton.click();
      const viewer = manager.getByTestId("completed-document-viewer");
      await viewer.waitFor();
      await viewer.locator("[data-completed-page] canvas").nth(1).waitFor({ timeout: 60000 });
      if ((await viewer.locator("[data-completed-page]").count()) !== 2) fail("viewer did not render both contract pages");
      const viewerText = await viewer.innerText();
      if (!viewerText.includes("Ceremony QA Contract") || !/read-only/i.test(viewerText)) fail("viewer header missing the document name / read-only note");
      if ((await viewer.getByRole("button", { name: /Prepare|Add field|Send|Save|Edit/ }).count()) !== 0) fail("viewer offers editing controls");
      const zoom = viewer.getByTestId("completed-viewer-zoom");
      const pageWidth = async () => (await viewer.locator("[data-completed-page] canvas").first().boundingBox())!.width;
      const fitWidth = await pageWidth();
      const zoomBefore = await zoom.innerText();
      await viewer.getByRole("button", { name: "Zoom in" }).click();
      await manager.waitForTimeout(400);
      if ((await zoom.innerText()) === zoomBefore || (await pageWidth()) <= fitWidth) fail("Zoom in did not enlarge the page");
      await viewer.getByRole("button", { name: "Zoom out" }).click();
      await viewer.getByRole("button", { name: "Zoom out" }).click();
      await manager.waitForTimeout(400);
      if ((await pageWidth()) >= fitWidth) fail("Zoom out did not shrink the page");
      await viewer.getByRole("button", { name: "Fit Page" }).click();
      await manager.waitForTimeout(400);
      const fitPageWidth = await pageWidth();
      await viewer.getByRole("button", { name: "Fit Width" }).click();
      await manager.waitForTimeout(400);
      if (Math.abs((await pageWidth()) - fitWidth) > 2 || fitPageWidth >= fitWidth) fail(`Fit Page (${fitPageWidth}) / Fit Width (${await pageWidth()} vs ${fitWidth}) did not behave`);
      await shot(manager, "a04-completed-viewer");
      const [uiDownload] = await Promise.all([
        manager.waitForEvent("download"),
        viewer.getByRole("link", { name: /Download/ }).click(),
      ]);
      if (uiDownload.suggestedFilename() !== "Ceremony QA Contract - signed.pdf") fail(`viewer Download filename: ${uiDownload.suggestedFilename()}`);
      const uiBytes = readFileSync((await uiDownload.path())!);
      if (sha256(uiBytes) !== fingerprints.get(artifactsByLabel.get("Ceremony QA Contract")!.id as string)) fail("viewer Download bytes differ from the viewed artifact");
      await manager.keyboard.press("Escape");
      await viewer.waitFor({ state: "detached" });
      if (!(await viewButton.evaluate((button) => button === document.activeElement))) fail("focus did not return to the View button");
      ok(`View: full-screen read-only viewer for "Ceremony QA Contract" rendered both pages; Zoom in / out, Fit Page and Fit Width work (fit width ${Math.round(fitWidth)}px, fit page ${Math.round(fitPageWidth)}px); no editing controls; the viewer's Download saved "Ceremony QA Contract - signed.pdf" with the same SHA-256; Escape closes and returns focus`);

      const [rowDownload] = await Promise.all([
        manager.waitForEvent("download"),
        section.locator('li[data-artifact-label="Ceremony QA Addendum"]').getByRole("link", { name: "Download Ceremony QA Addendum" }).click(),
      ]);
      if (rowDownload.suggestedFilename() !== "Ceremony QA Addendum - signed.pdf") fail(`row Download filename: ${rowDownload.suggestedFilename()}`);
      if (sha256(readFileSync((await rowDownload.path())!)) !== fingerprints.get(artifactsByLabel.get("Ceremony QA Addendum")!.id as string)) fail("row Download bytes differ");
      ok("multiple documents: the addendum's row Download saves its own artifact (\"Ceremony QA Addendum - signed.pdf\"), distinct from the contract");

      // Post-completion changes never reach the completed artifacts.
      await renameSigningForActor(actor, { signingId: a.signingId, title: `Ceremony QA Renamed After Complete ${stamp}` }, admin);
      await admin.from("packets").update({ label: `Ceremony QA Packet CHANGED ${stamp}` }).eq("id", packetId);
      await admin.from("packet_forms").update({ document_name: "Ceremony QA Contract CHANGED", field_data: { changed: true } }).eq("id", formA);
      {
        const changed = await PDFDocument.create();
        const font = await changed.embedFont(StandardFonts.Helvetica);
        changed.addPage([612, 792]).drawText("CHANGED SOURCE AFTER COMPLETE", { x: 72, y: 720, size: 18, font });
        const { error } = await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).upload(generatedPaths[0], await changed.save(), { contentType: "application/pdf", upsert: true });
        if (error) fail(`source overwrite failed: ${error.message}`);
      }
      await manager.reload({ waitUntil: "networkidle" });
      await manager.getByTestId("completed-documents").waitFor({ timeout: 60000 });
      const rowsAfter = await manager.getByTestId("completed-documents").locator("li[data-completed-artifact]").evaluateAll((items) =>
        items.map((item) => `${item.getAttribute("data-completed-artifact")}:${item.getAttribute("data-artifact-label")}`),
      );
      if (JSON.stringify(rowsAfter) !== JSON.stringify(labels)) fail(`Completed documents changed after source edits: ${JSON.stringify(rowsAfter)}`);
      for (const [artifactId, fingerprint] of fingerprints) {
        const again = await managerContext.request.get(completedUrl(a.signingId, artifactId, true));
        if (again.status() !== 200 || sha256(await again.body()) !== fingerprint) fail("completed bytes changed after rename / Packet / source changes");
      }
      const { data: artifactsAfter } = await admin.from("signing_artifacts").select("id, content_sha256, storage_object_key, frozen_filename").eq("signing_id", a.signingId).in("artifact_category", ["COMPLETED_DOCUMENT", "AUDIT_CERTIFICATE"]);
      for (const row of artifactsAfter ?? []) {
        const before = (artifacts ?? []).find((artifact) => artifact.id === row.id);
        if (!before || before.content_sha256 !== row.content_sha256 || before.storage_object_key !== row.storage_object_key || before.frozen_filename !== row.frozen_filename) fail("artifact metadata changed after source edits");
      }
      await shot(manager, "a05-completed-documents-after-changes");
      ok(`immutable: after renaming the Signing, renaming the Packet, editing the source Packet form (name + field data) and overwriting its source PDF, the Completed documents rows, artifact metadata and all ${fingerprints.size} SHA-256 fingerprints are unchanged (Contact-linked Complete immutability: completion-delivery validator)`);

      // Denials: guessed / malformed ids, logged out, unrelated users.
      for (const [label, artifactId] of [["guessed artifact id", randomUUID()], ["non-UUID id", "not-a-uuid"], ["path-like id", "..%2F..%2Fsignings"]] as const) {
        const response = await managerContext.request.get(completedUrl(a.signingId, artifactId));
        if (response.status() !== 404) fail(`${label}: ${response.status()}`);
      }
      {
        const anon = await browser.newContext();
        for (const download of [false, true]) {
          const response = await anon.request.get(completedUrl(a.signingId, completed[0].id as string, download), { maxRedirects: 0 });
          if (response.status() === 200) fail("logged-out request reached a completed document");
        }
        await anon.close();
      }
      for (const [label, otherBrokerage] of [["outsider", false], ["elsewhere", true]] as const) {
        const { context, page } = await signedInOutsider(label, otherBrokerage);
        await page.goto(`${APP_ORIGIN}/signings/${a.signingId}`, { waitUntil: "networkidle" });
        if ((await page.getByTestId("completed-documents").count()) !== 0) fail(`${label} sees Completed documents`);
        for (const download of [false, true]) {
          const response = await context.request.get(completedUrl(a.signingId, completed[0].id as string, download), { maxRedirects: 0 });
          if (response.status() !== 404) fail(`${label} direct ${download ? "Download" : "View"}: ${response.status()}`);
        }
        await shot(page, `a06-${label}-denied`);
        await context.close();
      }
      ok("denied: guessed / non-UUID / path-like artifact ids (404); logged-out View and Download (no PDF); a same-brokerage user with no association and an other-brokerage admin see no Completed documents and get 404 on direct View and Download");
    }
    await expectRefused(linkP1, "P1 invitation link after Complete");
    {
      const { data: postWork } = await admin
        .from("signing_work_items")
        .select("work_type, processing_state")
        .eq("signing_id", a.signingId)
        .order("create_date");
      console.log(`INFO: Signing A work items at end of completed review: ${(postWork ?? []).map((item) => `${item.work_type}=${item.processing_state}`).join(", ")}`);
    }

    // ---------- Signing B: link ops spot-check + Decline ----------
    const formB = await createPacketDocument("Ceremony QA Decline Contract");
    const titleB = `Ceremony QA Decline ${stamp}`;
    const b = await createDraft(titleB, formB);
    const p3 = await addDraftSigningParticipantWithActor(actor, { signingId: b.signingId, fullName: P3, email: `casey-${stamp}@example.com` }, admin);
    const p4 = await addDraftSigningParticipantWithActor(actor, { signingId: b.signingId, fullName: P4, email: `drew-${stamp}@example.com` }, admin);
    for (const [participant, x] of [[p3, 72], [p4, 330]] as const) {
      const signature = await addField(b.signingId, b.documentId, participant.id, "SIGNATURE", { x, y: 560, width: 150, height: 28 });
      await addField(b.signingId, b.documentId, participant.id, "DATE_SIGNED", { x: x + 158, y: 566, width: 72, height: 18 }, { linkedSignatureDraftFieldId: signature.id });
    }
    await sendFromDraftPage(b.signingId);
    const docB = (await revisionDocuments(b.signingId))[0];
    const l1 = await copySigningLink(P3, "P3 copy");
    const c3Old = await enter(l1, P3, "p3-before-replace");
    await affirm(c3Old.page, P3);
    const p3OldCookie = await ceremonyCookieValue(c3Old.context);
    if ((await documentStatusWith(p3OldCookie, docB.id)) !== 200) fail("P3 session from the original link cannot read Signing B's document");
    await c3Old.context.close();
    await panel(P3).getByRole("button", { name: "Resend signing link" }).click();
    await panel(P3).locator('[data-testid="participant-link-status"]').getByText("Signing link resent.").waitFor({ timeout: 30000 });
    if ((await copySigningLink(P3, "P3 after Resend")) !== l1) fail("Resend changed the link");
    ok("Resend: same link");
    await panel(P3).getByRole("button", { name: "Replace signing link" }).click();
    await manager.getByRole("alertdialog").getByRole("button", { name: "Replace signing link" }).click();
    await panel(P3).locator('[data-testid="participant-link-status"]').getByText("Signing link replaced.").waitFor({ timeout: 30000 });
    const l2 = await copySigningLink(P3, "P3 after Replace");
    if (l2 === l1) fail("Replace kept the link");
    await expectRefused(l1, "replaced P3 link");
    if ((await documentStatusWith(p3OldCookie, docB.id)) !== 404) fail("a session from the replaced link still reads document bytes");
    const d1 = await copySigningLink(P4, "P4 copy");
    const c4 = await enter(d1, P4, "p4-before-revoke");
    await affirm(c4.page, P4);
    const p4Cookie = await ceremonyCookieValue(c4.context);
    if ((await documentStatusWith(p4Cookie, docB.id)) !== 200) fail("P4 session cannot read Signing B's document before Revoke");
    await c4.context.close();
    await panel(P4).getByRole("button", { name: "Revoke signing link" }).click();
    await manager.getByRole("alertdialog").getByRole("button", { name: "Revoke signing link" }).click();
    await panel(P4).locator('[data-testid="participant-link-state"]').getByText("Revoked").waitFor({ timeout: 30000 });
    await expectRefused(d1, "revoked P4 link");
    if ((await documentStatusWith(p4Cookie, docB.id)) !== 404) fail("a session from the revoked link still reads document bytes");
    ok("Replace: old link refused, new link issued, and the ceremony session opened from the old link now gets 404 for document bytes; Revoke: link refused and its open session gets 404");

    const { context: c3, page: s3 } = await enter(l2, P3, "p3");
    ok("Replace: new link reaches identity affirmation");
    await affirm(s3, P3);
    {
      const p3Cookie = await ceremonyCookieValue(c3);
      const crossSigning = await documentStatusWith(p3Cookie, contractDoc.id);
      if (crossSigning !== 404) fail(`P3's Signing B session read Signing A's document (${crossSigning})`);
      ok("cross-Signing: a Signing B ceremony session requesting a Signing A document id gets 404");
    }
    await consentInUi(s3, "s3");
    await startSigning(s3, P3, null, "P3");
    await pageCanvas(s3, 1).waitFor({ timeout: 60000 });
    const p3SigField = (await revisionFields(b.signingId)).find((field) => field.signing_participant_id === p3.id && field.field_type === "SIGNATURE")!;
    await expectTargetAligned(s3, p3SigField, target(s3, p3SigField.id, false), "P3 Signature");
    await firstOpenTarget(s3, "SIGNATURE").click();
    await target(s3, p3SigField.id, true).waitFor({ timeout: 30000 });
    await row(s3, "Signature", true).getByText("Completed").waitFor({ timeout: 30000 });
    const p3CookieBeforeDecline = await ceremonyCookieValue(c3);
    {
      const leave = await s3.getByRole("button", { name: "Leave for now" }).first().boundingBox();
      const decline = await s3.getByRole("button", { name: "Decline to sign" }).boundingBox();
      if (!leave || !decline) fail("Leave for now / Decline to sign not both visible");
      if (Math.abs(leave.x - decline.x) < 60 && Math.abs(leave.y - decline.y) < 60) fail("Leave for now and Decline to sign sit next to each other");
    }
    const declineDialog = s3.getByRole("alertdialog");
    await s3.getByRole("button", { name: "Decline to sign" }).click();
    await declineDialog.getByText("Decline to sign?").waitFor();
    {
      const text = (await declineDialog.innerText()).replace(/\s+/g, " ");
      for (const phrase of ["you refuse to sign", "ends this Signing for everyone", "cannot be undone", "choose Leave for now instead"]) {
        if (!text.includes(phrase)) fail(`Decline confirmation is missing "${phrase}"`);
      }
      const focused = await s3.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
      if (focused !== "Keep signing") fail(`Decline confirmation initial focus is "${focused}", not Keep signing`);
    }
    await shot(s3, "b01-decline-confirm");
    if ((await signingRow(b.signingId)).lifecycle_state !== "IN_PROGRESS") fail("opening Decline changed state");
    await declineDialog.getByRole("button", { name: "Keep signing" }).click();
    await declineDialog.waitFor({ state: "detached" });
    if ((await signingRow(b.signingId)).lifecycle_state !== "IN_PROGRESS" || (await participantRow(b.signingId, P3)).participant_status === "DECLINED") {
      fail("Keep signing declined");
    }
    await target(s3, p3SigField.id, true).waitFor();
    ok("Decline is separate from Leave for now; its confirmation says refuse / ends for everyone / cannot be undone / use Leave for now for a break, focuses Keep signing first, and Keep signing returns to the document with nothing declined");
    await s3.getByRole("button", { name: "Decline to sign" }).click();
    await declineDialog.getByText("Decline to sign?").waitFor();
    await s3.locator("#decline-reason").fill("QA decline: terms not acceptable");
    if (!manager.url().endsWith(`/signings/${b.signingId}`)) fail(`manager is not on Signing B before the Decline (${manager.url()})`);
    await manager.evaluate(() => { (window as unknown as { __qaLive?: string }).__qaLive = "b"; });
    const declineClickedAt = Date.now();
    await declineDialog.getByRole("button", { name: "Yes, decline to sign" }).click();
    await s3.waitForURL(/\/sign\/done\?outcome=declined$/, { timeout: 30000 });
    await s3.getByText("You declined to sign").waitFor({ timeout: 30000 });
    if ((await documentStatusWith(p3CookieBeforeDecline, docB.id)) !== 404) fail("P3's pre-Decline ceremony cookie still reads document bytes");
    const declinedText = await s3.locator("body").innerText();
    if (/Sign here|Initial here|no longer active|unavailable/i.test(declinedText)) fail("Decline landing is misleading");
    await shot(s3, "b02-after-decline");
    const declined = await signingRow(b.signingId);
    const p3Row = await participantRow(b.signingId, P3);
    if (declined.lifecycle_state !== "DECLINED" || p3Row.participant_status !== "DECLINED" || !p3Row.declined_at || p3Row.decline_reason !== "QA decline: terms not acceptable") {
      fail(`decline state wrong: ${declined.lifecycle_state} / ${p3Row.participant_status}`);
    }
    const { count: declineArtifacts } = await admin.from("signing_artifacts").select("id", { count: "exact", head: true }).eq("signing_id", b.signingId);
    const { count: declineFinalize } = await admin
      .from("signing_work_items")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", b.signingId)
      .eq("work_type", "FINALIZE_SIGNING");
    const { data: declineEvents } = await admin
      .from("signing_events")
      .select("event_type, actor_participant_id, sequence_number")
      .eq("signing_id", b.signingId)
      .order("sequence_number");
    const declineEvent = (declineEvents ?? []).find((event) => /DECLIN/.test(event.event_type as string));
    if (declineArtifacts || declineFinalize || !declineEvent || declineEvent.actor_participant_id !== p3.id) fail("decline produced artifacts/finalization or no decline event");
    const chainB = await verifySigningEventChain(admin, b.signingId);
    if (!chainB.ok) fail("Signing B event chain failed verification");
    ok(`Decline: explicit two-step confirmation; Signing DECLINED, ${P3} DECLINED with reason; no artifacts, no FINALIZE work; event ${declineEvent.event_type} by the participant; event chain verifies`);
    console.log(`INFO: participant page after Confirm decline reads: ${JSON.stringify(declinedText.replace(/\s+/g, " ").slice(0, 300))}`);
    {
      await manager.getByTestId("signing-outcome").getByText(`This Signing was declined by ${P3}.`).waitFor({ timeout: 45000 })
        .catch(() => fail("the open manager page did not show the Decline without a reload"));
      const delay = Date.now() - declineClickedAt;
      if ((await manager.evaluate(() => (window as unknown as { __qaLive?: string }).__qaLive)) !== "b") fail("the manager page reloaded");
      await manager.getByText("DECLINED").first().waitFor({ timeout: 10000 });
      const liveText = await manager.locator("body").innerText();
      if (/\bCancell?ed\b/i.test(liveText)) fail("the live manager page calls the Declined Signing Cancelled");
      if (liveText.includes("Signing operations")) fail("the live manager page shows Complete controls for a Declined Signing");
      if ((await manager.getByRole("button", { name: /Cancel Signing|Copy signing link|Revoke signing link|Replace signing link|Begin In-Person/ }).count()) !== 0) {
        fail("the live manager page still offers actions that no longer apply");
      }
      await shot(manager, "b03a-manager-live-declined");
      ok(`live refresh (Decline): the manager page left open on Signing B showed DECLINED and "This Signing was declined by ${P3}." ${(delay / 1000).toFixed(1)}s after the participant confirmed, with no reload; Cancel / link / In-Person actions gone, no Complete controls`);
    }
    await c3.close();
    await expectRefused(l2, "P3 link after Decline");
    await manager.goto(`${APP_ORIGIN}/signings/${b.signingId}`, { waitUntil: "networkidle" });
    await manager.getByText("DECLINED").first().waitFor({ timeout: 60000 });
    const managerDeclined = await manager.locator("body").innerText();
    if (managerDeclined.includes("Signing operations")) fail("completed-ops panel shown for a Declined Signing");
    if (/\bCancell?ed\b/i.test(managerDeclined)) fail("manager presents the Declined Signing as Cancelled");
    await shot(manager, "b03-manager-declined");
    ok("manager sees DECLINED; no completed-package operations for the Declined Signing");
    if ((await manager.getByTestId("completed-documents").count()) !== 0) fail("Completed documents shown for a Declined Signing");
    for (const download of [false, true]) {
      const crossSigning = await managerContext.request.get(completedUrl(b.signingId, completed[0].id as string, download));
      if (crossSigning.status() !== 404) fail(`Signing A's artifact served under Declined Signing B (${crossSigning.status()})`);
    }
    ok("Declined: no Completed documents section; Signing A's artifact id requested under Signing B (cross-Signing) gets 404 for View and Download");

    // ---------- Signing D: identity is live while Draft, frozen once sent; Cancel ----------
    const { data: contactD, error: contactDError } = await admin
      .from("contacts")
      .insert({
        owner_user_id: userId,
        contact_type: "INDIVIDUAL",
        first_name: "Fran",
        last_name: "Frozen",
        email: `fran-${stamp}@example.com`,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (contactDError || !contactD) fail(contactDError?.message ?? "contact D");
    contactIds.push(contactD.id as number);
    const formD = await createPacketDocument("Ceremony QA Identity Contract");
    const d = await createDraft(`Ceremony QA Identity ${stamp}`, formD);
    const pD = await addDraftSigningParticipantWithActor(
      actor,
      { signingId: d.signingId, fullName: "Ignored Browser Name", email: "ignored@example.com", linkedContactId: contactD.id as number },
      admin,
    );
    if (pD.full_name !== "Fran Frozen") fail(`linked participant must take the Contact's name, got ${pD.full_name}`);
    const pDSig = await addField(d.signingId, d.documentId, pD.id, "SIGNATURE", { x: 72, y: 560, width: 150, height: 28 });
    await addField(d.signingId, d.documentId, pD.id, "DATE_SIGNED", { x: 230, y: 566, width: 72, height: 18 }, { linkedSignatureDraftFieldId: pDSig.id });
    await admin.from("contacts").update({ first_name: "Francine" }).eq("id", contactD.id);
    await manager.goto(`${APP_ORIGIN}/signings/${d.signingId}`, { waitUntil: "networkidle" });
    const draftRowD = manager.locator('[data-testid="draft-participant-list"] div.rounded-lg', { hasText: "Francine Frozen" }).first();
    await draftRowD.waitFor({ timeout: 60000 });
    if ((await manager.getByTestId("completed-documents").count()) !== 0) fail("Completed documents shown for a Draft Signing");
    if (!(await draftRowD.locator('[data-testid="participant-identity-source"]').innerText()).trim().startsWith("From Contact")) {
      fail("linked Draft participant must show its identity source");
    }
    if ((await draftRowD.getByRole("button", { name: /Edit details/ }).count()) !== 0) fail("a Contact-linked row must not offer Edit details");
    ok("Draft: Contact rename flows to the participant on load; row labelled From Contact; no name/email edit UI");
    await sendFromDraftPage(d.signingId);
    await admin.from("contacts").update({ first_name: "Frances", email: `frances-${stamp}@example.com` }).eq("id", contactD.id);
    await manager.reload({ waitUntil: "networkidle" });
    await manager.locator('[data-testid="participant-identity-locked"]').waitFor({ timeout: 60000 });
    const sentText = await manager.locator("body").innerText();
    if (sentText.includes("Frances Frozen") || !sentText.includes("Francine Frozen")) fail("a Contact change after Send altered the participant shown");
    if ((await manager.getByRole("button", { name: /Edit details/ }).count()) !== 0) fail("identity edit UI shown after Send");
    const { data: liveD } = await admin.from("signing_participants").select("full_name, email").eq("signing_id", d.signingId).single();
    if (liveD?.full_name !== "Francine Frozen" || liveD.email !== `fran-${stamp}@example.com`) fail(`sent identity changed: ${JSON.stringify(liveD)}`);
    await shot(manager, "d00-identity-locked-after-send");
    ok("after Send: identity locked (note shown, no edit UI); a later Contact change does not reach the participant");
    await manager.getByRole("button", { name: "Cancel Signing", exact: true }).click();
    const cancelDialog = manager.getByRole("alertdialog");
    await cancelDialog.getByText("Cancel this Signing?").waitFor();
    await cancelDialog.getByRole("button", { name: "Keep Signing" }).click();
    await cancelDialog.waitFor({ state: "detached" });
    if ((await signingRow(d.signingId)).lifecycle_state !== "IN_PROGRESS") fail("Keep Signing must not cancel");
    // A second manager tab on the same Signing, hidden while the first tab cancels.
    const watcherTab = await managerContext.newPage();
    await watcherTab.goto(`${APP_ORIGIN}/signings/${d.signingId}`, { waitUntil: "networkidle" });
    await watcherTab.getByRole("button", { name: "Cancel Signing", exact: true }).waitFor({ timeout: 60000 });
    const setVisibility = (state: "hidden" | "visible") =>
      `Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return "${state}"; } }); document.dispatchEvent(new Event("visibilitychange"));`;
    await watcherTab.evaluate(`window.__qaLive = "d"; ${setVisibility("hidden")}`);
    await manager.getByRole("button", { name: "Cancel Signing", exact: true }).click();
    await manager.getByRole("alertdialog").getByLabel("Internal cancellation reason").fill("Ceremony QA: participant identity was wrong");
    await manager.getByRole("alertdialog").getByRole("button", { name: "Cancel Signing", exact: true }).click();
    await manager.getByText("Signing cancelled. Create a new Signing to send corrected documents.").waitFor({ timeout: 60000 });
    if ((await signingRow(d.signingId)).lifecycle_state !== "CANCELLED") fail("Cancel Signing did not cancel");
    await shot(manager, "d01-cancelled");
    if ((await manager.getByTestId("completed-documents").count()) !== 0) fail("Completed documents shown for a Cancelled Signing");
    if ((await managerContext.request.get(completedUrl(d.signingId, completed[0].id as string))).status() !== 404) fail("Signing A's artifact served under Cancelled Signing D");
    ok("lifecycle gating: no Completed documents on Draft (Signing D before Send), In Progress (Signing A before P2 finished), Declined (B) or Cancelled (D); cross-Signing artifact ids get 404");
    ok("Cancel Signing: confirmation (Keep Signing keeps it); confirm → CANCELLED with the corrected-documents guidance");
    {
      await watcherTab.waitForTimeout(1500);
      const staleWhileHidden = (await watcherTab.getByTestId("signing-outcome").count()) === 0;
      const revealedAt = Date.now();
      await watcherTab.evaluate(setVisibility("visible"));
      await watcherTab.getByTestId("signing-outcome").getByText("This Signing was cancelled.").waitFor({ timeout: 10000 })
        .catch(() => fail("the hidden manager tab did not catch up to CANCELLED when it became visible"));
      const catchUp = Date.now() - revealedAt;
      if ((await watcherTab.evaluate(() => (window as unknown as { __qaLive?: string }).__qaLive)) !== "d") fail("the second manager tab reloaded");
      if ((await watcherTab.getByRole("button", { name: "Cancel Signing", exact: true }).count()) !== 0) fail("the second tab still offers Cancel Signing");
      if ((await watcherTab.getByRole("button", { name: /Copy signing link|Begin In-Person/ }).count()) !== 0) fail("the second tab still offers participant-link actions");
      await shot(watcherTab, "d02-second-tab-caught-up");
      await watcherTab.close();
      ok(`live refresh (Cancel + visibility): a second manager tab hidden during the Cancel ${staleWhileHidden ? "stayed as it was while hidden and " : ""}showed "This Signing was cancelled." ${(catchUp / 1000).toFixed(1)}s after becoming visible, without a reload; Cancel Signing and link actions gone`);
    }

    // ---------- Signing C: in-person Finish keeps the device lock ----------
    const formC = await createPacketDocument("Ceremony QA In-Person Contract");
    const titleC = `Ceremony QA In-Person ${stamp}`;
    const c = await createDraft(titleC, formC);
    const p5 = await addDraftSigningParticipantWithActor(actor, { signingId: c.signingId, fullName: P5, email: `erin-${stamp}@example.com` }, admin);
    const p5Sig = await addField(c.signingId, c.documentId, p5.id, "SIGNATURE", { x: 72, y: 560, width: 150, height: 28 });
    await addField(c.signingId, c.documentId, p5.id, "DATE_SIGNED", { x: 230, y: 566, width: 72, height: 18 }, { linkedSignatureDraftFieldId: p5Sig.id });
    await addField(c.signingId, c.documentId, p5.id, "INITIALS", { x: 72, y: 200, width: 40, height: 20 }, { isRequired: false });
    await addField(c.signingId, c.documentId, p5.id, "INITIALS", { x: 72, y: 400, width: 40, height: 20 }, { isRequired: false });
    await manager.goto(`${APP_ORIGIN}/signings/${c.signingId}`, { waitUntil: "networkidle" });
    await manager.getByRole("button", { name: "Begin In-Person Signing" }).click();
    await manager.getByRole("alertdialog").getByRole("button", { name: "Begin In-Person Signing" }).click();
    const handoffButton = panel(P5).getByRole("button", { name: "Hand device to this participant" });
    await handoffButton.waitFor({ timeout: 90000 });
    const streamClosedLines = () => (existsSync(DEV_LOG) ? readFileSync(DEV_LOG, "utf8").split(/\r?\n/).filter((line) => line.includes("destination stream closed early")).length : 0);
    const streamClosedBeforeHandoff = streamClosedLines();
    await handoffButton.click();
    await manager.waitForURL(/\/sign\/continue/, { timeout: 60000 });
    await manager.waitForLoadState("networkidle");
    console.log(`INFO: dev-server "destination stream closed early" lines logged during the in-person handoff navigation: ${streamClosedLines() - streamClosedBeforeHandoff}`);
    if (!(await managerContext.cookies()).some((cookie) => cookie.name === DEVICE_HANDOFF_LOCK_COOKIE_NAME)) fail("device-handoff lock not set at handoff");
    await affirm(manager, P5);
    await consentInUi(manager, "manager");
    await startSigning(manager, P5, "EI", "P5 in person");
    await pageCanvas(manager, 1).waitFor({ timeout: 60000 });
    {
      const labels = await manager.locator("li[data-ceremony-field-row] button[aria-label^='Go to Initials']").evaluateAll((buttons) =>
        buttons.map((button) => button.getAttribute("aria-label") ?? ""),
      );
      if (labels.length !== 2 || !labels[0].includes("1 of 2 on page") || !labels[1].includes("2 of 2 on page") || labels[0] === labels[1]) {
        fail(`repeated Initials on one page are not disambiguated: ${JSON.stringify(labels)}`);
      }
      await manager.locator("li[data-ceremony-field-row] button[aria-label*='2 of 2 on page']").click();
      await guidance(manager).filter({ hasText: "Click here to initial" }).waitFor({ timeout: 30000 });
      const hinted = await guidance(manager).getAttribute("data-field-id");
      const secondInitials = (await revisionFields(c.signingId))
        .filter((field) => field.signing_participant_id === p5.id && field.field_type === "INITIALS")
        .sort((x, y) => Number(x.y) - Number(y.y));
      if (hinted !== secondInitials[1]?.id && hinted !== secondInitials[0]?.id) fail("Your fields row hinted a field that is not P5's Initials");
      if ((await manager.locator(`[data-ceremony-target="${hinted}"][data-highlighted="true"]`).count()) !== 1) fail("the selected Initials is not highlighted");
      ok(`repeated Initials on one page are listed distinctly (${labels.join(" | ")}) and the row navigates to its own field`);
    }
    await firstOpenTarget(manager, "SIGNATURE").click();
    await row(manager, "Signature", true).getByText("Completed").waitFor({ timeout: 30000 });
    await manager.locator('[data-ceremony-date-field][data-placed="true"]').first().waitFor({ timeout: 30000 });
    await shot(manager, "c00-in-person-document");
    await finishButton(manager).click();
    await manager.getByRole("alertdialog").getByRole("button", { name: "Yes, finish signing" }).click();
    await manager.waitForURL(/\/sign\/return-to-agent$/, { timeout: 30000 });
    await manager.getByText("Return to agent workspace", { exact: true }).waitFor({ timeout: 30000 });
    const inPersonCookies = await managerContext.cookies();
    if (!inPersonCookies.some((cookie) => cookie.name === DEVICE_HANDOFF_LOCK_COOKIE_NAME)) fail("device-handoff lock cleared by in-person Finish");
    if (inPersonCookies.some((cookie) => cookie.name === SIGNING_CEREMONY_COOKIE_NAME)) fail("ceremony cookie survived in-person Finish");
    if ((await participantRow(c.signingId, P5)).participant_status !== "FINISHED") fail("in-person participant not FINISHED");
    await shot(manager, "c01-in-person-return-to-agent");
    await manager.goto(`${APP_ORIGIN}/signings`, { waitUntil: "networkidle" });
    if (!/\/sign\/return-to-agent$/.test(manager.url())) fail(`workspace reachable while the device is locked: ${manager.url()}`);
    await manager.locator("#agent-unlock-password").fill(agentPassword);
    await manager.getByRole("button", { name: "Return to Agent Workspace" }).click();
    await manager.waitForURL(new RegExp(`/signings/${c.signingId}$`), { timeout: 60000 });
    if ((await managerContext.cookies()).some((cookie) => cookie.name === DEVICE_HANDOFF_LOCK_COOKIE_NAME)) fail("device-handoff lock survived unlock");
    {
      const deadline = Date.now() + 120000;
      while ((await signingRow(c.signingId)).lifecycle_state !== "COMPLETE" && Date.now() < deadline) await manager.waitForTimeout(2000);
    }
    ok(`in-person: Begin In-Person → hand device → "I am ${P5}" → sign → Finish lands on Return to agent with the device lock intact (ceremony cookie cleared); /signings stays locked; password unlock returns to the Signing (lifecycle ${(await signingRow(c.signingId)).lifecycle_state})`);

    // ---------- secret hygiene + runtime noise ----------
    for (const secret of secrets) {
      if (participantRequestUrls.some((requestUrl) => requestUrl.includes(secret))) fail("a raw secret appeared in a request URL");
    }
    const devLog = existsSync(DEV_LOG) ? readFileSync(DEV_LOG, "utf8").slice(devLogStart) : "";
    if (secrets.some((secret) => devLog.includes(secret))) fail("a raw secret appeared in the dev server log");
    ok(`raw secrets (${secrets.length}) never appeared in ${participantRequestUrls.length} participant request URLs or the dev server log`);
    {
      const supabaseHost = new URL(url).host;
      const direct = participantRequestUrls.filter((requestUrl) => requestUrl.includes(supabaseHost) || requestUrl.includes("/storage/v1/"));
      if (direct.length) fail(`participant browser contacted Supabase directly (${direct.length} requests)`);
      const documentRequests = participantRequestUrls.filter((requestUrl) => requestUrl.includes("/sign/ceremony/document/")).length;
      ok(`participant browsers made 0 requests to Supabase / Storage; all ${documentRequests} document byte requests went through /sign/ceremony/document/{id}`);
    }
    let expectedDisconnects = simulatedDisconnects;
    const issues = noise.issues().filter((issue) => {
      if (expectedDisconnects > 0 && issue === "[p1] console.error: Failed to load resource: net::ERR_INTERNET_DISCONNECTED") {
        expectedDisconnects -= 1;
        return false;
      }
      return true;
    });
    if (issues.length > 0) fail(`unexpected runtime errors/warnings:\n${issues.join("\n")}`);
    ok("no unexpected browser console errors/warnings, page errors, or dev server ERROR/WARN lines");
    console.log("\nParticipant ceremony browser QA: all checks passed.");
  } catch (error) {
    let index = 0;
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        index += 1;
        await shot(page, `fail-${index}`).catch(() => undefined);
        const text = await page.locator("body").innerText().catch(() => "");
        console.log(`FAIL-PAGE ${index} ${new URL(page.url()).pathname}: ${text.replace(/\s+/g, " ").slice(0, 700)}`);
      }
    }
    throw error;
  } finally {
    await browser.close();
    if (process.env.QA_KEEP_FIXTURES === "1") {
      console.log(`Fixtures kept: signings ${signingIds.join(", ")}`);
    } else {
      await cleanup(admin, { signingIds, contactIds, generatedPaths, packetFormIds, packetId, userId, organizationId, extraUserIds, extraOrganizationIds });
    }
  }
}

async function cleanup(
  admin: SupabaseClient,
  fixture: { signingIds: string[]; contactIds: number[]; generatedPaths: string[]; packetFormIds: number[]; packetId: number; userId: string; organizationId: string; extraUserIds: string[]; extraOrganizationIds: string[] },
) {
  for (const extraUserId of fixture.extraUserIds) {
    await admin.from("organization_members").delete().eq("user_id", extraUserId);
    await admin.from("profiles").delete().eq("id", extraUserId);
    await admin.auth.admin.deleteUser(extraUserId);
  }
  for (const extraOrganizationId of fixture.extraOrganizationIds) {
    await admin.from("organizations").delete().eq("id", extraOrganizationId);
  }
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
    await admin
      .from("signings")
      .update({ current_package_revision_id: null, frozen_package_revision_id: null, current_primary_agent_association_id: null })
      .eq("id", signingId);
    await admin.from("signing_document_versions").update({ introduced_by_package_revision_id: null }).eq("signing_id", signingId);
    await admin.from("signing_draft_fields").update({ linked_signature_draft_field_id: null }).eq("signing_id", signingId);
    await admin
      .from("signing_documents")
      .update({ selected_draft_source_snapshot_id: null, acknowledged_live_content_fingerprint: null })
      .eq("signing_id", signingId);
    const tables = [
      "signing_completed_package_access_log",
      "signing_completed_package_sessions",
      "signing_completed_package_credentials",
      "signing_delivery_attempts",
      "signing_delivery_instructions",
      "signing_work_items",
      "signing_entry_sessions",
      "signing_participant_presence_leases",
      "signing_browser_sessions",
      "signing_device_handoff_locks",
      "signing_in_person_handoffs",
      "signing_amendment_locks",
      "signing_participant_credentials",
      "signing_operation_idempotency",
      "signing_artifacts",
      "signing_events",
      "signing_event_chain_state",
      "signing_field_placements",
      "signing_adopted_marks",
      "signing_fields",
      "signing_package_revision_documents",
      "signing_package_revision_participants",
      "signing_document_versions",
      "signing_package_revisions",
      "signing_draft_fields",
      "signing_draft_prepared_content",
      "signing_draft_source_snapshots",
      "signing_documents",
      "signing_copy_recipients",
      "signing_participants",
      "signing_operator_associations",
      "signing_agent_associations",
    ];
    for (let pass = 0; pass < 3; pass += 1) {
      for (const table of tables) await admin.from(table).delete().eq("signing_id", signingId);
    }
    const { error } = await admin.from("signings").delete().eq("id", signingId);
    if (error) note(`Signing ${signingId} cleanup incomplete: ${error.message}`);
  }
  if (fixture.contactIds.length) await admin.from("contacts").delete().in("id", fixture.contactIds);
  if (fixture.generatedPaths.length) await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).remove(fixture.generatedPaths);
  for (const id of fixture.packetFormIds) await admin.from("packet_forms").update({ status: "DELETED" }).eq("id", id);
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
