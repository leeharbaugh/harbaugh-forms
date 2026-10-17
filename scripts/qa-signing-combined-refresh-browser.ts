/**
 * Browser QA: an open manager Signing page follows post-Complete artifacts.
 *
 * The combined signed package is generated after Complete. This run leaves a
 * manager dashboard open (no reloads) and checks that it shows Complete, the
 * completed documents and certificate, "Combined signed package — Preparing…"
 * while the package is on its way, then View / Download once it is verified,
 * and that the watcher stops once nothing more can appear. It also checks a
 * hidden tab catching up on reveal, reload parity, and records timings.
 *
 * Participants sign through the server ceremony functions; the manager is a
 * real browser. Scenario A holds the combined work item back (future
 * next_attempt_at, pre-created with the worker's idempotency key so
 * finalization's own enqueue is a no-op) to make the Preparing state
 * observable, then releases it to the real worker function. Scenario C runs
 * the request-driven batch unmodified for natural timing.
 *
 * Disposable development fixtures only; cleaned up unless QA_KEEP_FIXTURES=1.
 *
 *   NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-signing-combined-refresh-browser.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { activateSigningWithActor } from "../lib/signing/activation.ts";
import { adoptCeremonyMark } from "../lib/signing/adopted-marks.ts";
import { requireCeremonyBrowserSession } from "../lib/signing/browser-sessions.ts";
import { affirmIdentityFromEntrySession } from "../lib/signing/ceremony-affirmation.ts";
import { requireCeremonyWriteContext } from "../lib/signing/ceremony-context.ts";
import { finishParticipantSigning } from "../lib/signing/ceremony-finish.ts";
import { acceptConsent, loadCurrentConsentDisclosure } from "../lib/signing/consent-disclosure.ts";
import { loadRawParticipantCredentialToken, validateParticipantCredential } from "../lib/signing/credentials.ts";
import { addDraftSigningDocumentWithActor } from "../lib/signing/draft-documents.ts";
import { upsertDraftSigningFieldWithActor } from "../lib/signing/draft-fields.ts";
import { addDraftSigningParticipantWithActor } from "../lib/signing/draft-participants.ts";
import { createSigningEntrySession } from "../lib/signing/entry-sessions.ts";
import {
  GENERATE_COMBINED_PACKAGE_WORK_TYPE,
  processNextCombinedPackageWorkItem,
  processNextFinalizationWorkItem,
} from "../lib/signing/finalization-worker.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import { acceptFieldPlacement } from "../lib/signing/placements.ts";
import { processSigningWorkBatch } from "../lib/signing/signing-worker-dispatch.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";
import { createRuntimeNoiseGuard } from "./qa-runtime-noise.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const OUT_DIR = path.join("_audit_tmp", "signing-combined-refresh-qa");
const GENERATED_DOCUMENTS_BUCKET = "generated-documents";
const SIGNING_ARTIFACTS_BUCKET = "signing-artifacts";
const POLL_MS = 20_000;

class QaFailure extends Error {}
function fail(message: string): never {
  throw new QaFailure(message);
}
function ok(message: string) {
  console.log(`OK: ${message}`);
}
const sha256 = (bytes: Uint8Array | Buffer) => createHash("sha256").update(bytes).digest("hex");
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const setVisibility = (state: "hidden" | "visible") =>
  `Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return "${state}"; } }); document.dispatchEvent(new Event("visibilitychange"));`;

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
  const email = `combined-qa-${stamp}@example.com`;
  let userId = "";
  let organizationId = "";
  let packetId = 0;
  let packetFormId = 0;
  let generatedPath = "";
  const signingIds: string[] = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  context.setDefaultNavigationTimeout(180000);
  const noise = createRuntimeNoiseGuard();

  /** Server-action POSTs (dashboard refreshes) made by a page. */
  function countRefreshes(page: Page) {
    const counter = { count: 0 };
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) counter.count += 1;
    });
    return counter;
  }

  try {
    // ---------- fixtures ----------
    const { data: org } = await admin.from("organizations").insert({ name: `Combined QA Brokerage ${stamp}`, status: "ACTIVE" }).select("id").single();
    organizationId = org!.id as string;
    const { data: created, error: userError } = await admin.auth.admin.createUser({ email, password: `CombinedQa-${randomUUID()}!aA1`, email_confirm: true });
    if (userError || !created.user) fail(userError?.message ?? "user");
    userId = created.user.id;
    await admin.from("profiles").upsert({
      id: userId, email, status: "ACTIVE", app_role: "USER", onboarding_status: "ACTIVE",
      display_name: "Combined QA Agent", first_name: "Combined", last_name: "Agent",
      primary_organization_id: organizationId, must_change_password: false,
    });
    await admin.from("organization_members").insert({ organization_id: organizationId, user_id: userId, membership_role: "MEMBER", status: "ACTIVE" });
    const { data: profile } = await admin.from("profiles").select("*").eq("id", userId).single();
    const actor: SigningActor = {
      userId, email, displayName: "Combined QA Agent", profile: profile as Profile,
      memberships: [{ organizationId, membershipRole: "MEMBER", membershipStatus: "ACTIVE", organizationStatus: "ACTIVE" }],
    };
    const { data: packet } = await admin.from("packets").insert({ owner_user_id: userId, label: `Combined QA Packet ${stamp}`, status: "ACTIVE", packet_type: "custom" }).select("id").single();
    packetId = packet!.id as number;
    const { data: form, error: formError } = await admin.from("packet_forms").insert({
      packet_id: packetId, form_id: null, status: "ACTIVE", document_state: "DRAFT", availability_state: "AVAILABLE",
      document_name: "Combined QA Contract", document_type: "PDF", origin: "external_upload", sort_order: 1,
      is_required: false, field_data: {}, owner_user_id: userId,
    }).select("id").single();
    if (formError || !form) fail(formError?.message ?? "packet form");
    packetFormId = form.id as number;
    {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      pdf.addPage([612, 792]).drawText("Combined QA Contract", { x: 72, y: 720, size: 18, font });
      generatedPath = `users/${userId}/packets/${packetId}/${packetFormId}-combined-qa.pdf`;
      const { error } = await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).upload(generatedPath, await pdf.save(), { contentType: "application/pdf" });
      if (error) fail(error.message);
      await admin.from("packet_forms").update({ storage_path: generatedPath }).eq("id", packetFormId);
    }

    async function buildActivatedSigning(title: string, participantName: string) {
      const draft = await createDraftSigningWithActor(actor, { title }, admin);
      signingIds.push(draft.id);
      const document = await addDraftSigningDocumentWithActor(actor, { signingId: draft.id, sourcePacketFormId: packetFormId }, admin);
      const participant = await addDraftSigningParticipantWithActor(
        actor,
        { signingId: draft.id, fullName: participantName, email: `${participantName.split(" ")[0].toLowerCase()}-${stamp}@example.com` },
        admin,
      );
      await upsertDraftSigningFieldWithActor(actor, {
        signingId: draft.id, signingDocumentId: document.id, signingParticipantId: participant.id,
        fieldType: "SIGNATURE", pageNumber: 1, x: 72, y: 560, width: 200, height: 36, isRequired: true,
      }, admin);
      await activateSigningWithActor(actor, { signingId: draft.id, mode: "REMOTE_SEND", clientRequestId: randomUUID() }, admin);
      return { signingId: draft.id, participantId: participant.id as string, participantName };
    }

    /** Signs the only field (which freezes the package) and returns Finish. */
    async function signUpToFinish(signing: { signingId: string; participantId: string; participantName: string }) {
      const { data: credential } = await admin.from("signing_participant_credentials").select("id")
        .eq("signing_id", signing.signingId).eq("signing_participant_id", signing.participantId)
        .eq("is_current", true).is("revoked_at", null).single();
      const rawToken = await loadRawParticipantCredentialToken({ admin, signingId: signing.signingId, credentialId: credential!.id as string });
      const resolved = await validateParticipantCredential(admin, rawToken!);
      const entry = await createSigningEntrySession({ admin, credential: resolved! });
      const affirmed = await affirmIdentityFromEntrySession({ admin, rawEntrySessionToken: entry.rawSessionToken });
      const session = await requireCeremonyBrowserSession(admin, affirmed.cookie.value);
      const ceremony = await requireCeremonyWriteContext({ admin, session });
      const disclosure = await loadCurrentConsentDisclosure(admin);
      await acceptConsent({ admin, context: ceremony, disclosureVersionId: disclosure.id });
      await adoptCeremonyMark({ admin, context: ceremony, markKind: "SIGNATURE", representationType: "TYPED", typedText: signing.participantName });
      const { data: field } = await admin.from("signing_fields").select("id").eq("signing_id", signing.signingId).eq("field_type", "SIGNATURE").single();
      await acceptFieldPlacement({ admin, context: ceremony, signingFieldId: field!.id as string, clientRequestId: randomUUID() });
      return async () => {
        const finished = await finishParticipantSigning({ admin, session });
        if (!finished.allParticipantsFinished || finished.finalizationCondition !== "READY") fail("Finish did not make the Signing READY");
        return Date.now();
      };
    }

    async function frozenRevision(signingId: string): Promise<string> {
      const { data } = await admin.from("signings").select("frozen_package_revision_id").eq("id", signingId).single();
      if (!data?.frozen_package_revision_id) fail("package not frozen after the first accepted mark");
      return data.frozen_package_revision_id as string;
    }

    /** Pre-creates the combined work item (worker idempotency key) so it waits. */
    async function holdCombinedWork(signingId: string) {
      const revisionId = await frozenRevision(signingId);
      const { error } = await admin.from("signing_work_items").insert({
        signing_id: signingId,
        work_type: GENERATE_COMBINED_PACKAGE_WORK_TYPE,
        idempotency_key: `${GENERATE_COMBINED_PACKAGE_WORK_TYPE}:${revisionId}`,
        reference_json: { signingId, packageRevisionId: revisionId },
        processing_state: "PENDING",
        next_attempt_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
      if (error) fail(`hold combined work: ${error.message}`);
    }

    async function releaseCombinedWork(signingId: string) {
      await admin.from("signing_work_items").update({ next_attempt_at: new Date().toISOString() })
        .eq("signing_id", signingId).eq("work_type", GENERATE_COMBINED_PACKAGE_WORK_TYPE);
      const result = await processNextCombinedPackageWorkItem({ admin, signingId });
      if (result.status !== "COMPLETED") fail(`combined package: ${result.status} ${result.detail ?? ""}`);
    }

    async function finalize(signingId: string) {
      const result = await processNextFinalizationWorkItem({ admin, signingId });
      if (result.status !== "COMPLETED") fail(`finalization: ${result.status} ${result.detail ?? ""}`);
    }

    async function artifactTimes(signingId: string) {
      const { data: signing } = await admin.from("signings").select("completed_at").eq("id", signingId).single();
      const { data: rows } = await admin.from("signing_artifacts").select("id, artifact_category, verified_at, content_sha256").eq("signing_id", signingId);
      const at = (category: string) =>
        (rows ?? []).filter((row) => row.artifact_category === category).map((row) => Date.parse(row.verified_at as string)).sort().pop() ?? NaN;
      return {
        completedAt: Date.parse(signing!.completed_at as string),
        documents: at("COMPLETED_DOCUMENT"),
        certificate: at("AUDIT_CERTIFICATE"),
        combined: at("COMBINED_PACKAGE"),
        combinedRow: (rows ?? []).find((row) => row.artifact_category === "COMBINED_PACKAGE"),
      };
    }

    const rowsOf = (page: Page) =>
      page.getByTestId("completed-documents").locator("li[data-completed-artifact]").evaluateAll((items) =>
        items.map((item) => item.getAttribute("data-completed-artifact") ?? ""),
      );
    const pendingRow = (page: Page) => page.locator('[data-completed-artifact-pending="COMBINED"]');

    /** Fresh full load of the same Signing in another tab of the same session. */
    async function reloadSnapshot(signingId: string) {
      const page = await context.newPage();
      noise.watch(page, "reload-parity");
      await page.goto(`${APP_ORIGIN}/signings/${signingId}`, { waitUntil: "networkidle" });
      await page.getByTestId("completed-documents").waitFor({ timeout: 60000 });
      const snapshot = { rows: await rowsOf(page), pending: (await pendingRow(page).count()) > 0 };
      await page.close();
      return snapshot;
    }

    // ---------- manager sign-in ----------
    const manager = await context.newPage();
    noise.watch(manager, "manager");
    const refreshes = countRefreshes(manager);
    const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    await manager.goto(`${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(link!.properties!.hashed_token)}&type=magiclink&next=${encodeURIComponent("/signings")}`, { waitUntil: "networkidle" });
    if (manager.url().includes("/auth/")) fail("manager sign-in failed");

    // ---------- A: open tab, combined package held back ----------
    {
      const a = await buildActivatedSigning(`Combined QA Open Tab ${stamp}`, "Avery Open");
      await manager.goto(`${APP_ORIGIN}/signings/${a.signingId}`, { waitUntil: "networkidle" });
      await manager.getByText("IN PROGRESS").first().waitFor({ timeout: 60000 });
      await manager.evaluate(`window.__qaLive = "a"`);
      const finish = await signUpToFinish(a);
      await holdCombinedWork(a.signingId);
      const finishedAt = await finish();
      await finalize(a.signingId);
      const times = await artifactTimes(a.signingId);
      if (Number.isFinite(times.combined)) fail("combined package exists although its work was held");

      await pendingRow(manager).waitFor({ timeout: POLL_MS + 15000 }).catch(() => fail("the open tab never showed the Preparing row"));
      const uiPreparingAt = Date.now();
      const rows = await rowsOf(manager);
      if (rows.join(",") !== "DOCUMENT,CERTIFICATE") fail(`rows while preparing: ${rows.join(",")}`);
      const pendingText = await pendingRow(manager).innerText();
      if (!/Combined signed package/.test(pendingText) || !/Preparing…/.test(pendingText)) fail(`pending row text: ${pendingText}`);
      if ((await pendingRow(manager).locator("a, button").count()) !== 0) fail("the Preparing row offers View or Download");
      if ((await manager.getByText("COMPLETE", { exact: true }).count()) === 0) fail("the open tab does not show COMPLETE");
      await manager.screenshot({ path: path.join(OUT_DIR, "a01-preparing.png"), fullPage: true });
      ok(`open tab: COMPLETE with the contract and audit certificate (View / Download) and "Combined signed package — Preparing…" (no View / Download) ${seconds(uiPreparingAt - times.completedAt)} after Complete, no reload`);

      const parityPreparing = await reloadSnapshot(a.signingId);
      if (!parityPreparing.pending || parityPreparing.rows.join(",") !== rows.join(",")) fail(`reload parity (preparing): ${JSON.stringify(parityPreparing)}`);
      ok("reload parity while preparing: a fresh load shows the same rows and the same Preparing row");

      const refreshesBeforeRelease = refreshes.count;
      await manager.waitForTimeout(POLL_MS + 2000);
      if (refreshes.count <= refreshesBeforeRelease) fail("the watcher stopped while the combined package was still preparing");
      ok(`watcher keeps refreshing while preparing (${refreshes.count - refreshesBeforeRelease} refresh in ${seconds(POLL_MS + 2000)})`);

      await releaseCombinedWork(a.signingId);
      const after = await artifactTimes(a.signingId);
      await manager.locator('li[data-completed-artifact="COMBINED"]').waitFor({ timeout: POLL_MS + 15000 })
        .catch(() => fail("the open tab never replaced Preparing with the combined package"));
      const uiCombinedAt = Date.now();
      if ((await pendingRow(manager).count()) !== 0) fail("Preparing row still shown next to the ready package");
      if ((await manager.evaluate(`window.__qaLive`)) !== "a") fail("the open tab reloaded");
      const combinedRow = manager.locator('li[data-completed-artifact="COMBINED"]');
      await combinedRow.getByRole("button", { name: "View Combined signed package" }).waitFor();
      await manager.screenshot({ path: path.join(OUT_DIR, "a02-combined-ready.png"), fullPage: true });
      ok(`open tab: Preparing became "Combined signed package" with View / Download ${seconds(uiCombinedAt - after.combined)} after the package was verified (watcher, no reload, no navigation)`);

      const parityReady = await reloadSnapshot(a.signingId);
      if (parityReady.pending || parityReady.rows.join(",") !== "DOCUMENT,CERTIFICATE,COMBINED") fail(`reload parity (ready): ${JSON.stringify(parityReady)}`);
      ok("reload parity once ready: a fresh load shows the same three rows and no Preparing row");

      const artifactId = after.combinedRow!.id as string;
      const view = await context.request.get(`${APP_ORIGIN}/signings/${a.signingId}/completed/${artifactId}`);
      const download = await context.request.get(`${APP_ORIGIN}/signings/${a.signingId}/completed/${artifactId}?download=1`);
      const viewBytes = await view.body();
      if (view.status() !== 200 || download.status() !== 200) fail(`combined View ${view.status()} / Download ${download.status()}`);
      if (!view.headers()["content-disposition"]?.startsWith('inline; filename="Combined signed package.pdf"')) fail("combined View disposition");
      if (!download.headers()["content-disposition"]?.startsWith('attachment; filename="Combined signed package.pdf"')) fail("combined Download disposition");
      if (sha256(viewBytes) !== after.combinedRow!.content_sha256 || !viewBytes.equals(await download.body())) fail("combined bytes differ from the recorded SHA-256 or from each other");
      await combinedRow.getByRole("button", { name: "View Combined signed package" }).click();
      const viewer = manager.getByTestId("completed-document-viewer");
      await viewer.locator("[data-completed-page] canvas").first().waitFor({ timeout: 60000 });
      const [saved] = await Promise.all([manager.waitForEvent("download"), viewer.getByRole("link", { name: /Download/ }).click()]);
      if (saved.suggestedFilename() !== "Combined signed package.pdf") fail(`viewer download name ${saved.suggestedFilename()}`);
      await manager.keyboard.press("Escape");
      await viewer.waitFor({ state: "detached" });
      ok("combined package: View renders in the viewer, Download saves \"Combined signed package.pdf\"; inline and attachment bytes are identical and equal the recorded SHA-256");

      const refreshesAtSettle = refreshes.count;
      await manager.waitForTimeout(POLL_MS * 2 + 3000);
      if (refreshes.count !== refreshesAtSettle) fail(`the watcher kept refreshing after settling (${refreshes.count - refreshesAtSettle})`);
      ok(`watcher stops once settled: 0 refreshes in ${seconds(POLL_MS * 2 + 3000)} after the package appeared`);
      console.log(`INFO: timing A (held): Finish→Complete ${seconds(times.completedAt - finishedAt)}, documents verified ${seconds(times.documents - finishedAt)}, certificate ${seconds(times.certificate - finishedAt)}, UI Preparing ${seconds(uiPreparingAt - finishedAt)}; combined verified at release, UI ready +${seconds(uiCombinedAt - after.combined)}`);
    }

    // ---------- B: hidden tab catches up on reveal ----------
    {
      const b = await buildActivatedSigning(`Combined QA Hidden Tab ${stamp}`, "Blake Hidden");
      const hidden = await context.newPage();
      noise.watch(hidden, "hidden");
      const hiddenRefreshes = countRefreshes(hidden);
      await hidden.goto(`${APP_ORIGIN}/signings/${b.signingId}`, { waitUntil: "networkidle" });
      await hidden.getByText("IN PROGRESS").first().waitFor({ timeout: 60000 });
      await hidden.evaluate(`window.__qaLive = "b"; ${setVisibility("hidden")}`);
      const finish = await signUpToFinish(b);
      await finish();
      await finalize(b.signingId);
      await generateCombined(b.signingId);
      const times = await artifactTimes(b.signingId);
      if (!Number.isFinite(times.combined)) fail("combined package missing in scenario B");
      const countWhileHidden = hiddenRefreshes.count;
      await hidden.waitForTimeout(POLL_MS + 3000);
      if (hiddenRefreshes.count !== countWhileHidden) fail("the hidden tab polled");
      if ((await hidden.getByTestId("completed-documents").count()) !== 0) fail("the hidden tab updated while hidden");
      const revealedAt = Date.now();
      await hidden.evaluate(setVisibility("visible"));
      await hidden.locator('li[data-completed-artifact="COMBINED"]').waitFor({ timeout: 10000 })
        .catch(() => fail("the revealed tab did not show the ready combined package"));
      const caughtUp = Date.now() - revealedAt;
      if ((await pendingRow(hidden).count()) !== 0) fail("the revealed tab shows a stale Preparing row");
      if ((await hidden.evaluate(`window.__qaLive`)) !== "b") fail("the hidden tab reloaded");
      if ((await rowsOf(hidden)).join(",") !== "DOCUMENT,CERTIFICATE,COMBINED") fail("revealed rows");
      await hidden.screenshot({ path: path.join(OUT_DIR, "b01-revealed.png"), fullPage: true });
      ok(`hidden tab: no polling and no change while hidden for ${seconds(POLL_MS + 3000)}; on reveal it showed COMPLETE with all three rows (no Preparing) ${seconds(caughtUp)} later, without a reload`);
      await hidden.close();
    }

    async function generateCombined(signingId: string) {
      const result = await processNextCombinedPackageWorkItem({ admin, signingId });
      if (result.status !== "COMPLETED") fail(`combined package: ${result.status} ${result.detail ?? ""}`);
    }

    // ---------- C: natural timing (request-driven batch, unmodified) ----------
    {
      const c = await buildActivatedSigning(`Combined QA Natural ${stamp}`, "Casey Natural");
      await manager.goto(`${APP_ORIGIN}/signings/${c.signingId}`, { waitUntil: "networkidle" });
      await manager.getByText("IN PROGRESS").first().waitFor({ timeout: 60000 });
      await manager.evaluate(`window.__qaLive = "c"`);
      const finish = await signUpToFinish(c);
      const finishedAt = await finish();
      const batch = await processSigningWorkBatch({ admin, secretOk: true, signingId: c.signingId, limit: 10 });
      if (batch.status !== "OK") fail(`batch ${batch.status}`);
      const times = await artifactTimes(c.signingId);
      if (!Number.isFinite(times.combined)) fail("natural batch did not produce the combined package");
      const sawPreparing = { value: false };
      const deadline = Date.now() + POLL_MS + 15000;
      let uiCompleteAt = NaN;
      while (Date.now() < deadline) {
        if (Number.isNaN(uiCompleteAt) && (await manager.getByTestId("completed-documents").count()) > 0) uiCompleteAt = Date.now();
        if ((await pendingRow(manager).count()) > 0) sawPreparing.value = true;
        if ((await manager.locator('li[data-completed-artifact="COMBINED"]').count()) > 0) break;
        await manager.waitForTimeout(250);
      }
      const uiCombinedAt = Date.now();
      if ((await manager.locator('li[data-completed-artifact="COMBINED"]').count()) === 0) fail("natural run: the open tab never showed the combined package");
      if ((await manager.evaluate(`window.__qaLive`)) !== "c") fail("the open tab reloaded");
      console.log(`INFO: timing C (natural batch): Finish→Complete ${seconds(times.completedAt - finishedAt)}; documents verified ${seconds(times.documents - finishedAt)}, certificate ${seconds(times.certificate - finishedAt)}, combined ${seconds(times.combined - finishedAt)} after Finish (combined ${seconds(times.combined - times.completedAt)} after Complete); UI first showed Completed documents ${seconds(uiCompleteAt - finishedAt)} and the combined package ${seconds(uiCombinedAt - finishedAt)} after Finish; Preparing observed: ${sawPreparing.value}`);
      ok("natural run: the open tab reached COMPLETE and the combined package without a reload");
    }

    const issues = noise.issues();
    if (issues.length) fail(`unexpected runtime errors/warnings:\n${issues.join("\n")}`);
    ok("no browser console errors/warnings, page errors, or dev server errors/warnings");
    console.log("\nCombined-package refresh browser QA: all checks passed.");
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
