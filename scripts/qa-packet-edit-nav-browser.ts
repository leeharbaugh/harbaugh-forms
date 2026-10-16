/**
 * Browser QA: Packet Edit must not open stuck on "Saving…" after Signing→Packet navigation.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=... NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-packet-edit-nav-browser.ts
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import type { Profile } from "../lib/types/profile.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import { createRuntimeNoiseGuard } from "./qa-runtime-noise.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PRODUCTION_REF = "eetonalyyyssvkyfdoxh";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

class QaFailure extends Error {}
function fail(message: string): never {
  throw new QaFailure(message);
}
function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url.includes(EXPECTED_REF) || url.includes(PRODUCTION_REF)) fail(`Refusing outside development: ${url}`);
  const admin = createClient(url, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const email = `packet-nav-qa-${stamp}@example.com`;
  const password = `PacketNav-${randomUUID()}!aA1`;
  let userId = "";
  let organizationId = "";
  let packetId = 0;
  let contactId = 0;
  let contactB = 0;
  let signingId = "";
  const generatedPaths: string[] = [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const noise = createRuntimeNoiseGuard();
  noise.watch(page, "packet-nav");

  try {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({ name: `Packet Nav Org ${stamp}`, status: "ACTIVE" })
      .select("id")
      .single();
    if (orgError || !org) fail(orgError?.message ?? "org");
    organizationId = org.id as string;

    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
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
      display_name: "Packet Nav QA",
      first_name: "Packet",
      primary_organization_id: organizationId,
      must_change_password: false,
    });
    await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: userId,
      membership_role: "MEMBER",
      status: "ACTIVE",
    });

    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({
        owner_user_id: userId,
        label: `Packet Nav ${stamp}`,
        status: "ACTIVE",
        packet_type: "custom",
      })
      .select("id")
      .single();
    if (packetError || !packet) fail(packetError?.message ?? "packet");
    packetId = packet.id as number;

    const { data: contact, error: contactError } = await admin
      .from("contacts")
      .insert({
        owner_user_id: userId,
        contact_type: "INDIVIDUAL",
        first_name: "Bailey",
        last_name: "Buyer",
        email: `bailey-${stamp}@example.com`,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (contactError || !contact) fail(contactError?.message ?? "contact");
    contactId = contact.id as number;
    await admin.from("packet_contacts").insert({
      packet_id: packetId,
      contact_id: contactId,
      packet_role: "BUYER",
      sort_order: 0,
      status: "ACTIVE",
    });

    const { data: agentContact, error: agentContactError } = await admin
      .from("contacts")
      .insert({
        owner_user_id: userId,
        contact_type: "INDIVIDUAL",
        first_name: "Avery",
        last_name: "Agent",
        email: `avery-${stamp}@example.com`,
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (agentContactError || !agentContact) fail(agentContactError?.message ?? "agent contact");
    contactB = agentContact.id as number;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pdfPage = pdf.addPage([612, 792]);
    pdfPage.drawText("Packet Nav QA", { x: 72, y: 720, size: 16, font });
    const bytes = await pdf.save();
    const { data: pf, error: pfError } = await admin
      .from("packet_forms")
      .insert({
        packet_id: packetId,
        form_id: null,
        status: "ACTIVE",
        document_state: "DRAFT",
        availability_state: "AVAILABLE",
        document_name: "Nav Contract",
        document_type: "PDF",
        origin: "external_upload",
        sort_order: 1,
        is_required: false,
        field_data: {},
        owner_user_id: userId,
      })
      .select("id")
      .single();
    if (pfError || !pf) fail(pfError?.message ?? "packet form");
    const storagePath = `users/${userId}/packets/${packetId}/${pf.id}-nav.pdf`;
    await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).upload(storagePath, bytes, {
      contentType: "application/pdf",
    });
    generatedPaths.push(storagePath);
    await admin.from("packet_forms").update({ storage_path: storagePath }).eq("id", pf.id);
    ok("fixture Packet with Buyer contact and PDF");

    process.env.NATIVE_SIGNING_ENABLED = "true";
    const actor: SigningActor = {
      userId,
      email,
      displayName: "Packet Nav QA",
      profile: {
        id: userId,
        status: "ACTIVE",
        app_role: "USER",
        onboarding_status: "ACTIVE",
        display_name: "Packet Nav QA",
        first_name: "Packet",
        email,
        must_change_password: false,
      } as Profile,
      memberships: [
        {
          organizationId,
          membershipRole: "MEMBER",
          membershipStatus: "ACTIVE",
          organizationStatus: "ACTIVE",
        },
      ],
    };
    const signing = await createDraftSigningWithActor(
      actor,
      { title: `Packet Nav Signing ${stamp}` },
      admin,
    );
    signingId = signing.id;
    await admin.from("signings").update({ source_packet_id: packetId }).eq("id", signingId);
    ok("Draft Signing created (server) with source Packet");

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkError || !link.properties?.hashed_token) fail("generateLink failed");
    await page.goto(
      `${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(`/signings/${signingId}`)}`,
      { waitUntil: "networkidle" },
    );
    if (page.url().includes("/auth/")) fail(`auth failed: ${page.url()}`);
    await page.getByText(/Draft|Participants|Packet/i).first().waitFor({ timeout: 60000 });
    ok("signed in on Draft Signing");

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await page.goto(`${APP_ORIGIN}/packets/${packetId}/edit`, { waitUntil: "networkidle" });
      const save = page.getByRole("button", { name: /^Save packet$|^Saving/ });
      await save.waitFor({ timeout: 30000 });
      const label = (await save.innerText()).trim();
      if (label !== "Save packet") fail(`cycle ${cycle}: Save reads "${label}" on arrival`);
      if (await save.isDisabled()) fail(`cycle ${cycle}: Save disabled on arrival`);

      // Agent role must be offered and usable.
      const roleSelect = page.locator("select").filter({ has: page.locator('option[value="AGENT"]') }).first();
      await roleSelect.waitFor({ timeout: 15000 });
      ok(`cycle ${cycle}: Packet Edit idle; Agent role present in selector`);

      if (cycle === 1) {
        await admin.from("packet_contacts").insert({
          packet_id: packetId,
          contact_id: contactB,
          packet_role: "AGENT",
          sort_order: 1,
          status: "ACTIVE",
        });
        await page.reload({ waitUntil: "networkidle" });
        await page.getByText("Avery Agent").first().waitFor({ timeout: 20000 });
        const agentSelect = page.locator('select').filter({ has: page.locator('option[value="AGENT"]') });
        const selectedAgent = await agentSelect.evaluateAll((nodes) =>
          nodes.some((node) => (node as HTMLSelectElement).value === "AGENT"),
        );
        if (!selectedAgent) fail("Agent contact row did not keep role AGENT after reload");
        ok("Agent contact assigned on Packet and role AGENT persisted in the UI");
      }

      await page.locator("#packet_label").fill(`Packet Nav ${stamp} c${cycle}`);
      await save.click();
      await page.waitForURL(new RegExp(`/packets/${packetId}(?:\\?|$)`), { timeout: 60000 });
      ok(`cycle ${cycle}: save succeeded`);

      await page.goto(`${APP_ORIGIN}/signings/${signingId}`, { waitUntil: "networkidle" });
      await page.getByText(/Draft|Participants/i).first().waitFor({ timeout: 30000 });
      ok(`cycle ${cycle}: returned to Draft Signing`);
    }

    const { data: roles } = await admin
      .from("packet_contacts")
      .select("packet_role, contacts(first_name)")
      .eq("packet_id", packetId)
      .eq("status", "ACTIVE");
    if (!(roles ?? []).some((row) => row.packet_role === "AGENT")) {
      fail(`Agent role not persisted: ${JSON.stringify(roles)}`);
    }
    ok("Agent Packet role persisted in the database");

    // History: Signing → Edit via Back.
    await page.goto(`${APP_ORIGIN}/packets/${packetId}/edit`, { waitUntil: "networkidle" });
    await page.goto(`${APP_ORIGIN}/signings/${signingId}`, { waitUntil: "networkidle" });
    await page.goBack({ waitUntil: "networkidle" });
    const saveAfterBack = page.getByRole("button", { name: /^Save packet$|^Saving/ });
    await saveAfterBack.waitFor({ timeout: 30000 });
    if ((await saveAfterBack.innerText()).trim() !== "Save packet") {
      fail("Back to Packet Edit left Save stuck");
    }
    ok("Browser Back to Packet Edit stays idle");

    const issues = noise.issues();
    if (issues.length > 0) fail(`unexpected runtime noise:\n${issues.join("\n")}`);
    ok("no browser console errors/warnings, page errors, or server ERROR/WARN lines");
    console.log("\nPacket edit navigation browser QA: all checks passed.");
  } finally {
    await browser.close();
    if (signingId) {
      await admin.from("signing_documents").delete().eq("signing_id", signingId);
      await admin.from("signing_participants").delete().eq("signing_id", signingId);
      await admin.from("signing_events").delete().eq("signing_id", signingId);
      await admin.from("signing_event_chain_state").delete().eq("signing_id", signingId);
      await admin.from("signings").update({ current_primary_agent_association_id: null }).eq("id", signingId);
      await admin.from("signing_operator_associations").delete().eq("signing_id", signingId);
      await admin.from("signing_agent_associations").delete().eq("signing_id", signingId);
      await admin.from("signings").delete().eq("id", signingId);
    }
    if (generatedPaths.length > 0) await admin.storage.from(GENERATED_DOCUMENTS_BUCKET).remove(generatedPaths);
    if (packetId) {
      await admin.from("packet_contacts").delete().eq("packet_id", packetId);
      await admin.from("packet_forms").update({ status: "DELETED" }).eq("packet_id", packetId);
      await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    }
    for (const id of [contactId, contactB].filter(Boolean)) {
      await admin.from("contacts").delete().eq("id", id);
    }
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
