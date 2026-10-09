/**
 * Browser QA: participant ceremony end to end (PR #46 participant-ceremony QA).
 *
 * Disposable development fixtures only (own user, organization, Packet, two
 * Signings sent from the Draft page with the development email sandbox);
 * cleaned up in `finally` unless QA_KEEP_FIXTURES=1.
 *
 * Signing A (two participants + one copy recipient; a two-page contract and a
 * one-page addendum): link entry without workspace login, identity
 * affirmation, consent, read-only typed Signature / editable Initials
 * adoption, the prepared PDFs rendered in the ceremony (every document, free
 * scrolling, zoom, document switching), Sign / Initial here targets drawn at
 * their stored coordinates and clicked on the page, linked Date Signed,
 * Remove / Replace before Finish, package freeze on first accepted mark,
 * Finish, participant isolation, document-route authorization, narrow and
 * tablet viewports, finalization through Complete, artifact + event-chain
 * integrity, completed PDF marks, completed-package access, manager view.
 *
 * Signing B: Resend / Replace / Revoke spot-check (sessions derived from the
 * replaced / revoked links lose document access), then an explicit Decline.
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
import { upsertDraftPreparedContentWithActor } from "../lib/signing/draft-prepared-content.ts";
import { SIGNING_ENTRY_COOKIE_NAME } from "../lib/signing/entry-sessions.ts";
import { verifySigningEventChain } from "../lib/signing/event-chain.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import { acceptFieldPlacement } from "../lib/signing/placements.ts";
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
    return required ? base.filter({ hasText: "required" }) : base.filter({ hasNotText: "required" });
  };
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

  /** Typed Signature is pre-populated with the exact Signing name and cannot be edited. */
  async function expectReadOnlySignature(page: Page, name: string, label: string) {
    const input = page.locator("#typed-signature");
    await input.waitFor({ timeout: 30000 });
    if ((await input.inputValue()) !== name) fail(`${label}: typed Signature is not pre-populated with "${name}"`);
    if ((await input.getAttribute("readonly")) === null || (await input.isEditable())) fail(`${label}: typed Signature is editable`);
    await input.focus();
    await page.keyboard.type("x");
    await page.keyboard.press("Backspace");
    if ((await input.inputValue()) !== name) fail(`${label}: typing changed the read-only typed Signature`);
  }

  async function adoptSignature(page: Page, name: string, label: string) {
    await expectReadOnlySignature(page, name, label);
    await page.getByRole("button", { name: "Adopt signature" }).click();
    await page.getByText("Signature adopted.").waitFor({ timeout: 30000 });
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

  async function waitIdle(page: Page) {
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
  }

  async function expectedDate(signingId: string) {
    const tz = (await signingRow(signingId)).sender_timezone ?? "America/Chicago";
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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
    await addField(a.signingId, a.documentId, p1.id, "DATE_SIGNED", { x: 230, y: 566, width: 72, height: 18 }, { linkedSignatureDraftFieldId: p1Sig.id });
    await addField(a.signingId, a.documentId, p1.id, "INITIALS", { x: 72, y: 660, width: 40, height: 20 });
    await addField(a.signingId, a.documentId, p1.id, "INITIALS", { x: 140, y: 300, width: 40, height: 20 }, { isRequired: false, pageNumber: 2 });
    const p2Sig = await addField(a.signingId, a.documentId, p2.id, "SIGNATURE", { x: 330, y: 560, width: 150, height: 28 });
    await addField(a.signingId, a.documentId, p2.id, "DATE_SIGNED", { x: 488, y: 566, width: 72, height: 18 }, { linkedSignatureDraftFieldId: p2Sig.id });
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
      .order("published_at", { ascending: false })
      .limit(1)
      .single();
    await s1.getByText(disclosure!.title as string).waitFor({ timeout: 30000 });
    const consentText = await s1.locator("body").innerText();
    if (!consentText.includes((disclosure!.body_text as string).slice(0, 60))) fail("disclosure body not shown");
    if (!disclosure!.is_production_ready && !consentText.includes("Development disclosure copy")) fail("dev disclosure badge missing");
    if ((await s1.getByRole("button", { name: /Sign here|Initial here|Adopt signature/ }).count()) !== 0) fail("marks offered before consent");
    if (!(await s1.getByRole("button", { name: "Finish signing" }).isDisabled())) fail("Finish enabled before consent");
    await s1.reload({ waitUntil: "networkidle" });
    await s1.getByRole("button", { name: "I agree to use electronic records and signatures" }).waitFor();
    if ((await participantRow(a.signingId, P1)).consent_accepted_at) fail("consent recorded without acceptance");
    await shot(s1, "p1-02-consent");
    await s1.getByRole("button", { name: "I agree to use electronic records and signatures" }).click();
    await s1.getByText("Disclosure accepted.").waitFor({ timeout: 30000 });
    p1Row = await participantRow(a.signingId, P1);
    if (p1Row.consent_disclosure_version_id !== disclosure!.id || p1Row.consent_content_sha256 !== disclosure!.content_sha256) {
      fail("consent evidence does not reference the shown disclosure version/fingerprint");
    }
    if (sha256(Buffer.from(disclosure!.body_text as string, "utf8")) !== disclosure!.content_sha256) fail("disclosure fingerprint mismatch");
    await s1.reload({ waitUntil: "networkidle" });
    if ((await s1.getByRole("button", { name: "I agree to use electronic records and signatures" }).count()) !== 0) fail("consent re-prompted after reload");
    ok(`consent: "${disclosure!.title}" (version ${disclosure!.version_key}, sha256 ${String(disclosure!.content_sha256).slice(0, 12)}…, dev copy badge) shown; no marks/Finish before acceptance; reload keeps it unaccepted; acceptance records version id + fingerprint; reload does not re-prompt`);

    // ---------- Signature adoption ----------
    await expectReadOnlySignature(s1, P1, "P1");
    {
      const probe = await ceremonyContextFor(c1);
      if (!probe.ok) fail(`P1 session probe failed: ${probe.code}`);
      for (const wrong of [P2, P1.toLowerCase(), `${P1} `.repeat(2).trim()]) {
        let code = "";
        try {
          await adoptCeremonyMark({ admin, context: probe.write, markKind: "SIGNATURE", representationType: "TYPED", typedText: wrong });
        } catch (error) {
          code = (error as { code?: string }).code ?? "";
        }
        if (code !== "VALIDATION_FAILED") fail(`server accepted typed Signature "${wrong}" (${code || "no error"})`);
      }
    }
    if ((await marks(a.signingId, p1.id)).signature) fail("a mismatched signature was adopted");
    await shot(s1, "p1-02b-read-only-signature");
    await s1.getByRole("button", { name: "Adopt signature" }).click();
    await s1.getByText("Signature adopted.").waitFor({ timeout: 30000 });
    let m1 = await marks(a.signingId, p1.id);
    if (m1.signature?.typed_text !== P1 || m1.signature.locked_at) fail("signature adoption state wrong");
    ok(`Typed Signature: pre-populated with "${P1}", read-only (typing does not change it); server still rejects "${P2}", the lowercase name and a doubled name with VALIDATION_FAILED; Adopt signature records typed_text exactly "${P1}" (not yet locked)`);

    // ---------- Initials adoption ----------
    const initialsInput = s1.locator("#typed-initials");
    const suggested = await initialsInput.inputValue();
    if (suggested !== "AJS") fail(`suggested initials "${suggested}", expected "AJS"`);
    await initialsInput.fill("AJX");
    await s1.getByRole("button", { name: "Adopt initials" }).click();
    await s1.getByText("Initials adopted.").waitFor({ timeout: 30000 });
    m1 = await marks(a.signingId, p1.id);
    if (m1.initials?.typed_text !== "AJX" || m1.initials.locked_at) fail("edited initials not adopted as typed");
    {
      const probe = await ceremonyContextFor(c1);
      if (!probe.ok) fail(`P1 session probe failed: ${probe.code}`);
      await adoptCeremonyMark({ admin, context: probe.write, markKind: "INITIALS", representationType: "TYPED", typedText: "AJS" });
    }
    m1 = await marks(a.signingId, p1.id);
    if (m1.initials?.typed_text !== "AJS" || m1.initials.locked_at) fail("server did not allow re-adopting initials before first use");
    await s1.reload({ waitUntil: "networkidle" });
    await s1.getByText("Your fields", { exact: true }).waitFor({ timeout: 60000 });
    const uiReEdit = (await s1.locator("#typed-initials").count()) > 0;
    await shot(s1, "p1-03-adopted");
    ok(`Initials: suggestion "AJS" prefilled; edited to "AJX" and adopted; server accepted a re-adoption to "AJS" before first use (UI re-edit control after adoption: ${uiReEdit ? "present" : "absent"})`);

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
    const fitDrift = await expectTargetAligned(s1, f.p1Sig, target(s1, f.p1Sig.id, false), "P1 Signature (fit)");
    await s1.getByRole("button", { name: "Zoom in" }).click();
    await s1.getByText("125%").waitFor();
    await s1.waitForTimeout(500);
    const zoomDrift = await expectTargetAligned(s1, f.p1Sig, target(s1, f.p1Sig.id, false), "P1 Signature (125%)");
    await expectTargetAligned(s1, f.p1InitReq, target(s1, f.p1InitReq.id, false), "P1 required Initials (125%)");
    await expectTargetAligned(s1, f.p1InitOpt, target(s1, f.p1InitOpt.id, false), "P1 optional Initials page 2 (125%)");
    await s1.getByRole("button", { name: "Zoom out" }).click();
    await s1.getByText("Fit", { exact: true }).waitFor();
    await s1.waitForTimeout(500);
    ok(`coordinate fidelity: Signature / Initials overlays match stored PDF-point geometry on the rendered page within ${Math.max(fitDrift, zoomDrift).toFixed(2)}px at Fit and 125% (page 1 and page 2)`);

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
    await target(s1, f.p1Sig.id, false).click();
    await target(s1, f.p1Sig.id, true).waitFor({ timeout: 30000 });
    await dateOnPage(s1, f.p1Date.id).getByText(today).waitFor({ timeout: 30000 });
    await row(s1, "Signature", true).getByText(`Applied · dated ${today}`).waitFor({ timeout: 30000 });
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
    if (!(await s1.getByRole("button", { name: "Finish signing" }).isDisabled())) fail("Finish enabled with a required Initials outstanding");
    await s1.getByText("One required field still needs you.").waitFor();
    ok("Finish disabled while a required Initials field is outstanding");

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
    await s1.keyboard.press("Enter");
    await target(s1, f.p1InitReq.id, true).waitFor({ timeout: 30000 });
    await row(s1, "Initials", true).getByText("Applied").waitFor({ timeout: 30000 });
    if ((await target(s1, f.p1InitReq.id, true).innerText()).trim() !== "AJS") fail("applied Initials do not show the adopted initials on the page");
    ok(`auto-advance + keyboard: after Sign here, focus moved to the required Initials target (accessible name "${focusedName}", visible focus ring); Enter applies it`);
    await s1.mouse.move(400, 500);
    await s1.mouse.wheel(0, -20000);
    await s1.waitForTimeout(300);
    await s1.getByRole("button", { name: "Go to next field" }).click();
    await s1.waitForFunction((id) => document.activeElement?.getAttribute("data-ceremony-target") === id, String(f.p1InitOpt.id), { timeout: 30000 });
    if ((await pageCanvas(s1, 2).boundingBox())!.y > 900) fail("Go to next field did not scroll page 2 into view");
    ok("Go to next field scrolls to and focuses the optional Initials target on page 2");
    m1 = await marks(a.signingId, p1.id);
    if (!m1.initials?.locked_at) fail("initials not locked after first use");
    {
      const probe = await ceremonyContextFor(c1);
      if (!probe.ok) fail(`P1 session probe failed: ${probe.code}`);
      let code = "";
      try {
        await adoptCeremonyMark({ admin, context: probe.write, markKind: "INITIALS", representationType: "TYPED", typedText: "ZZ" });
      } catch (error) {
        code = (error as { code?: string }).code ?? "";
      }
      if (code !== "MARK_LOCKED") fail(`re-adopting used initials returned "${code}", expected MARK_LOCKED`);
    }
    await s1.getByText("Every required field is complete.").waitFor();
    if (await s1.getByRole("button", { name: "Finish signing" }).isDisabled()) fail("Finish disabled with all required fields complete");
    ok("Initial here: Initials ACCEPTED and locked on first use; re-adoption now MARK_LOCKED; required complete → Finish enabled (optional Initials still empty)");

    // ---------- remove / replace before Finish ----------
    await row(s1, "Initials", false).getByRole("button", { name: /Show initials field on page 2/ }).click();
    await target(s1, f.p1InitOpt.id, false).click();
    await target(s1, f.p1InitOpt.id, true).waitFor({ timeout: 30000 });
    await row(s1, "Initials", false).getByText("Applied").waitFor({ timeout: 30000 });
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
    ok("optional Initials (page 2): Show on page → click the target → Remove from the list (REMOVED; after reload the page shows the open target again while page-1 marks stay applied) → reapply on the page (new ACCEPTED placement)");

    const sigBefore = acceptedFor(await placements(a.signingId), f.p1Sig.id as string)[0];
    const dateBefore = acceptedFor(await placements(a.signingId), f.p1Date.id as string)[0];
    await row(s1, "Signature", true).getByRole("button", { name: "Replace" }).click();
    for (let i = 0; i < 40; i += 1) {
      const current = acceptedFor(await placements(a.signingId), f.p1Sig.id as string)[0];
      if (current && current.id !== sigBefore.id) break;
      await s1.waitForTimeout(500);
    }
    await waitIdle(s1);
    await row(s1, "Signature", true).getByText(`Applied · dated ${today}`).waitFor({ timeout: 30000 });
    pl = await placements(a.signingId);
    const sigAfter = acceptedFor(pl, f.p1Sig.id as string);
    const dateAfter = acceptedFor(pl, f.p1Date.id as string);
    const oldSig = pl.find((p) => p.id === sigBefore.id)!;
    const oldDate = pl.find((p) => p.id === dateBefore.id)!;
    if (sigAfter.length !== 1 || sigAfter[0].id === sigBefore.id || oldSig.disposition !== "REPLACED" || oldSig.replaced_by_placement_id !== sigAfter[0].id) fail("Signature Replace wrong");
    if (dateAfter.length !== 1 || dateAfter[0].id === dateBefore.id || oldDate.disposition === "ACCEPTED") fail("linked Date Signed did not follow Replace");
    if (!(new Date(dateAfter[0].accepted_at!) > new Date(dateBefore.accepted_at!))) fail("replacement date not fresh");
    ok(`Signature Replace: old REPLACED → new ACCEPTED; old Date Signed ${oldDate.disposition}, new Date Signed ACCEPTED with fresh acceptance time`);

    await row(s1, "Signature", true).getByRole("button", { name: "Remove" }).click();
    await target(s1, f.p1Sig.id, false).waitFor({ timeout: 30000 });
    pl = await placements(a.signingId);
    if (acceptedFor(pl, f.p1Sig.id as string).length || acceptedFor(pl, f.p1Date.id as string).length) fail("Remove left an effective Signature/Date");
    await s1.reload({ waitUntil: "networkidle" });
    await s1.getByText("One required field still needs you.").waitFor();
    await target(s1, f.p1Sig.id, false).waitFor({ timeout: 60000 });
    if ((await dateOnPage(s1, f.p1Date.id).count()) !== 0) fail("Date Signed still shown after the Signature was removed");
    if (!(await s1.getByRole("button", { name: "Finish signing" }).isDisabled())) fail("Finish enabled after removing the required Signature");
    {
      // Double-click: the placement action is idempotent per field, so one ACCEPTED placement results.
      const button = target(s1, f.p1Sig.id, false);
      await button.dblclick();
    }
    await target(s1, f.p1Sig.id, true).waitFor({ timeout: 30000 });
    await dateOnPage(s1, f.p1Date.id).getByText(today).waitFor({ timeout: 30000 });
    await row(s1, "Signature", true).getByText(`Applied · dated ${today}`).waitFor({ timeout: 30000 });
    await waitIdle(s1);
    pl = await placements(a.signingId);
    for (const fieldId of [f.p1Sig.id, f.p1Date.id, f.p1InitReq.id, f.p1InitOpt.id] as string[]) {
      if (acceptedFor(pl, fieldId).length !== 1) fail("a P1 field does not have exactly one ACCEPTED placement");
    }
    await s1.reload({ waitUntil: "networkidle" });
    await s1.getByText("Every required field is complete.").waitFor();
    await target(s1, f.p1Sig.id, true).waitFor({ timeout: 60000 });
    await dateOnPage(s1, f.p1Date.id).getByText(today).waitFor();
    await shot(s1, "p1-04-ready-to-finish");
    ok("Signature Remove: Signature + linked Date leave the page and are no longer effective, Finish disabled (persists after reload); double-clicking Sign here → exactly one ACCEPTED placement per P1 field; reload shows the signed page");

    // ---------- narrow (phone) and tablet viewports ----------
    for (const [label, viewport] of [["phone", { width: 390, height: 844 }], ["tablet", { width: 820, height: 1180 }]] as const) {
      await s1.setViewportSize(viewport);
      await s1.waitForTimeout(600);
      const overflow = await s1.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) fail(`${label}: page scrolls horizontally by ${overflow}px`);
      const canvasBox = await pageCanvas(s1, 1).boundingBox();
      if (!canvasBox || canvasBox.width < 250 || canvasBox.width > viewport.width) fail(`${label}: page 1 renders ${canvasBox?.width}px wide`);
      await expectTargetAligned(s1, f.p1Sig, target(s1, f.p1Sig.id, true), `P1 Signature (${label})`);
      await shot(s1, `p1-04-${label}`);
    }
    await s1.setViewportSize({ width: 1280, height: 900 });
    await s1.waitForTimeout(400);
    ok("phone 390px and tablet 820px: the page fits the viewport without page-level horizontal scroll and overlays stay aligned");

    // ---------- Finish P1 ----------
    const p1CookieBeforeFinish = await ceremonyCookieValue(c1);
    await s1.getByRole("button", { name: "Finish signing" }).click();
    await s1.waitForURL(/\/sign\/done\?outcome=finished$/, { timeout: 30000 });
    await s1.getByText("You finished signing").waitFor({ timeout: 30000 });
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
    await s2.getByRole("button", { name: "I agree to use electronic records and signatures" }).click();
    await s2.getByText("Disclosure accepted.").waitFor({ timeout: 30000 });
    await adoptSignature(s2, P2, "P2");
    if ((await s2.locator("#typed-initials").inputValue()) !== "BR") fail("P2 suggested initials not BR");
    await s2.getByRole("button", { name: "Adopt initials" }).click();
    await s2.getByText("Initials adopted.").waitFor({ timeout: 30000 });
    await pageCanvas(s2, 1).waitFor({ timeout: 60000 });
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

    // ---------- Exit and resume (P2) ----------
    const p2CookieBeforeExit = await ceremonyCookieValue(c2);
    await s2.getByRole("button", { name: "Exit signing" }).click();
    await s2.waitForURL(/\/sign\/done\?outcome=exited$/, { timeout: 30000 });
    await s2.getByText("You left the signing session").waitFor({ timeout: 30000 });
    if ((await c2.cookies()).some((cookie) => cookie.name === SIGNING_CEREMONY_COOKIE_NAME)) fail("ceremony cookie survived Exit");
    if ((await documentStatusWith(p2CookieBeforeExit, addendumDoc.id)) !== 404) fail("P2's pre-Exit ceremony cookie still reads document bytes");
    {
      const { data: p2Sessions } = await admin
        .from("signing_browser_sessions")
        .select("status")
        .eq("signing_id", a.signingId)
        .eq("signing_participant_id", p2.id);
      if ((p2Sessions ?? []).some((session) => session.status === "ACTIVE")) fail("P2 session still ACTIVE after Exit");
      if ((await participantRow(a.signingId, P2)).participant_status === "FINISHED") fail("Exit finished P2");
    }
    await shot(s2, "p2-00-exited");
    await c2.close();
    ({ context: c2, page: s2 } = await enter(linkP2, P2, "p2-resume"));
    await affirm(s2, P2);
    await s2.getByText("Your fields", { exact: true }).waitFor({ timeout: 60000 });
    if ((await s2.getByRole("button", { name: "I agree to use electronic records and signatures" }).count()) !== 0) fail("P2 re-prompted for consent after Exit");
    if ((await s2.locator("#typed-signature").count()) !== 0) fail("P2 adopted signature lost after Exit");
    ok(`P2 Exit: lands on "You left the signing session" (/sign/done?outcome=exited), ceremony cookie cleared, session no longer ACTIVE, participant not finished; reopening the same link + "I am ${P2}" resumes with consent and marks kept`);

    await target(s2, f.p2Sig.id, false).click();
    await row(s2, "Signature", true).getByText(`Applied · dated ${today}`).waitFor({ timeout: 30000 });
    // Auto-advance after a placement switches to the addendum and its Initials target.
    await s2.getByText("Document 2 of 2 · 1 page").waitFor({ timeout: 60000 });
    await target(s2, f.p2Init.id, false).waitFor({ timeout: 60000 });
    await expectTargetAligned(s2, f.p2Init, target(s2, f.p2Init.id, false), "P2 addendum Initials");
    await target(s2, f.p2Init.id, false).click();
    await target(s2, f.p2Init.id, true).waitFor({ timeout: 30000 });
    await row(s2, "Initials", true).getByText(`Applied · dated ${today}`).waitFor({ timeout: 30000 });
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
    const iniDateSecond = acceptedFor(await placements(a.signingId), f.p2IniDate!.id as string);
    if (iniDateSecond.length !== 1 || iniDateSecond[0].id === iniDateFirst[0].id) {
      fail("reapplying the Initials did not apply a fresh linked Date");
    }
    ok(`P2 addendum: Initials apply their linked Date (${today}); Remove takes the Date off the page and out of effect; reapply gives a fresh Date placement`);
    await s2.getByText("Every required field is complete.").waitFor();
    await s2.locator(`[data-ceremony-document="${contractDoc.id}"]`).click();
    await target(s2, f.p2Sig.id, true).waitFor({ timeout: 60000 });
    await dateOnPage(s2, f.p2Date.id).getByText(today).waitFor({ timeout: 30000 });
    const p1Unchanged = (await placements(a.signingId)).filter((p) => p.signing_participant_id === p1.id);
    if (JSON.stringify(p1Unchanged) !== JSON.stringify(p1Final)) fail("P1 placements changed during P2 ceremony");
    await shot(s2, "p2-01-ready-to-finish");
    ok(`P2: entry, "I am ${P2}", consent, read-only "${P2}" adopted, initials "BR"; Sign here on the contract (Date ${today}) auto-advances to the addendum, where Initial here is applied at its stored position; sees only own 2 fields and none of P1's marks; P1 placements unchanged`);
    await s2.getByRole("button", { name: "Finish signing" }).click();
    await s2.waitForURL(/\/sign\/done\?outcome=finished$/, { timeout: 30000 });
    await s2.getByText("You finished signing").waitFor({ timeout: 30000 });
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
    type TextItem = { str: string; transform: number[] };
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
        return item.str.trim() === text && x >= fb.x - 1 && x <= fb.x + fb.width && y >= top - fb.height - 1 && y <= top + 1;
      });
      if (!inside) fail(`completed ${docKeyOf(field)} page ${fb.page}: "${text}" not inside the ${label} box`);
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
    if (creds.some((cred) => new Date(cred.create_date) < new Date(complete.completed_at!))) fail("completed-package credential issued before Complete");
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
    await s3.getByRole("button", { name: "I agree to use electronic records and signatures" }).click();
    await s3.getByText("Disclosure accepted.").waitFor({ timeout: 30000 });
    await adoptSignature(s3, P3, "P3");
    await pageCanvas(s3, 1).waitFor({ timeout: 60000 });
    const p3SigField = (await revisionFields(b.signingId)).find((field) => field.signing_participant_id === p3.id && field.field_type === "SIGNATURE")!;
    await expectTargetAligned(s3, p3SigField, target(s3, p3SigField.id, false), "P3 Signature");
    await firstOpenTarget(s3, "SIGNATURE").click();
    await target(s3, p3SigField.id, true).waitFor({ timeout: 30000 });
    await row(s3, "Signature", true).getByText("Applied").waitFor({ timeout: 30000 });
    const p3CookieBeforeDecline = await ceremonyCookieValue(c3);
    await s3.getByRole("button", { name: "Decline to sign" }).click();
    await s3.getByText("Declining ends this Signing for everyone. Your agent will be notified.").waitFor();
    await shot(s3, "b01-decline-confirm");
    if ((await signingRow(b.signingId)).lifecycle_state !== "IN_PROGRESS") fail("opening Decline changed state");
    await s3.locator("#decline-reason").fill("QA decline: terms not acceptable");
    await s3.getByRole("button", { name: "Confirm decline" }).click();
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
    await c3.close();
    await expectRefused(l2, "P3 link after Decline");
    await manager.goto(`${APP_ORIGIN}/signings/${b.signingId}`, { waitUntil: "networkidle" });
    await manager.getByText("DECLINED").first().waitFor({ timeout: 60000 });
    const managerDeclined = await manager.locator("body").innerText();
    if (managerDeclined.includes("Signing operations")) fail("completed-ops panel shown for a Declined Signing");
    await shot(manager, "b03-manager-declined");
    ok("manager sees DECLINED; no completed-package operations for the Declined Signing");

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
    await manager.getByRole("button", { name: "Cancel Signing", exact: true }).click();
    await manager.getByRole("alertdialog").getByRole("button", { name: "Cancel Signing", exact: true }).click();
    await manager.getByText("Signing cancelled. Create a new Signing to send corrected documents.").waitFor({ timeout: 60000 });
    if ((await signingRow(d.signingId)).lifecycle_state !== "CANCELLED") fail("Cancel Signing did not cancel");
    await shot(manager, "d01-cancelled");
    ok("Cancel Signing: confirmation (Keep Signing keeps it); confirm → CANCELLED with the corrected-documents guidance");

    // ---------- Signing C: in-person Finish keeps the device lock ----------
    const formC = await createPacketDocument("Ceremony QA In-Person Contract");
    const titleC = `Ceremony QA In-Person ${stamp}`;
    const c = await createDraft(titleC, formC);
    const p5 = await addDraftSigningParticipantWithActor(actor, { signingId: c.signingId, fullName: P5, email: `erin-${stamp}@example.com` }, admin);
    const p5Sig = await addField(c.signingId, c.documentId, p5.id, "SIGNATURE", { x: 72, y: 560, width: 150, height: 28 });
    await addField(c.signingId, c.documentId, p5.id, "DATE_SIGNED", { x: 230, y: 566, width: 72, height: 18 }, { linkedSignatureDraftFieldId: p5Sig.id });
    await manager.goto(`${APP_ORIGIN}/signings/${c.signingId}`, { waitUntil: "networkidle" });
    await manager.getByRole("button", { name: "Begin In-Person Signing" }).click();
    await manager.getByRole("alertdialog").getByRole("button", { name: "Begin In-Person Signing" }).click();
    const handoffButton = panel(P5).getByRole("button", { name: "Hand device to this participant" });
    await handoffButton.waitFor({ timeout: 90000 });
    await handoffButton.click();
    await manager.waitForURL(/\/sign\/continue/, { timeout: 60000 });
    if (!(await managerContext.cookies()).some((cookie) => cookie.name === DEVICE_HANDOFF_LOCK_COOKIE_NAME)) fail("device-handoff lock not set at handoff");
    await affirm(manager, P5);
    await manager.getByRole("button", { name: "I agree to use electronic records and signatures" }).click();
    await manager.getByText("Disclosure accepted.").waitFor({ timeout: 30000 });
    await adoptSignature(manager, P5, "P5 in person");
    await pageCanvas(manager, 1).waitFor({ timeout: 60000 });
    await firstOpenTarget(manager, "SIGNATURE").click();
    await row(manager, "Signature", true).getByText("Applied").waitFor({ timeout: 30000 });
    await manager.locator('[data-ceremony-date-field][data-placed="true"]').first().waitFor({ timeout: 30000 });
    await shot(manager, "c00-in-person-document");
    await manager.getByRole("button", { name: "Finish signing" }).click();
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
    const issues = noise.issues();
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
      await cleanup(admin, { signingIds, contactIds, generatedPaths, packetFormIds, packetId, userId, organizationId });
    }
  }
}

async function cleanup(
  admin: SupabaseClient,
  fixture: { signingIds: string[]; contactIds: number[]; generatedPaths: string[]; packetFormIds: number[]; packetId: number; userId: string; organizationId: string },
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
