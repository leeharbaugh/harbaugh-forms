/**
 * Development-only R12 Stage 2 Native Signing authority validator.
 * Proves Draft create/read/title-update through trusted server operations
 * while browsers remain denied and the feature gate defaults off.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { SigningActor } from "../lib/signing/types.ts";
import {
  createDraftSigningWithActor,
  getSigningForActor,
  updateDraftSigningTitleForActor,
} from "../lib/signing/operations.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { NativeSigningDisabledError } from "../lib/signing/feature-gate.ts";
import { NATIVE_SIGNING_STAGE1_TABLES } from "../lib/signing/stage1-schema.ts";
import type { Profile } from "../lib/types/profile.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function expectSigningError(
  label: string,
  code: string,
  action: () => Promise<unknown>,
) {
  try {
    await action();
    fail(`${label} unexpectedly succeeded`);
  } catch (error) {
    if (error instanceof SigningError && error.code === code) {
      ok(`${label} rejected (${error.code})`);
      return;
    }
    if (error instanceof NativeSigningDisabledError && code === "NATIVE_SIGNING_DISABLED") {
      ok(`${label} rejected (${error.code})`);
      return;
    }
    fail(
      `${label} threw unexpected error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function buildActor(options: {
  userId: string;
  email: string;
  displayName: string;
  organizationId: string;
  membershipRole?: "MEMBER" | "ORG_ADMIN";
  profileOverrides?: Partial<Profile>;
}): SigningActor {
  const profile = {
    id: options.userId,
    create_date: new Date().toISOString(),
    update_date: new Date().toISOString(),
    status: "ACTIVE",
    app_role: "USER",
    onboarding_status: "ACTIVE",
    invited_at: null,
    activated_at: null,
    invited_by_user_id: null,
    first_name: "Stage",
    middle_name: null,
    last_name: "Two",
    preferred_name: null,
    display_name: options.displayName,
    email: options.email,
    phone: null,
    trec_license_number: null,
    brokerage_name: null,
    notes: null,
    primary_organization_id: options.organizationId,
    must_change_password: false,
    ...options.profileOverrides,
  } as Profile;

  return {
    userId: options.userId,
    email: options.email,
    displayName: options.displayName,
    profile,
    memberships: [
      {
        organizationId: options.organizationId,
        membershipRole: options.membershipRole ?? "MEMBER",
        membershipStatus: "ACTIVE",
        organizationStatus: "ACTIVE",
      },
    ],
    originatingOrganizationId: options.organizationId,
  };
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }

  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) {
    fail("Need anon/publishable and service/secret keys");
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const browser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const password = `Stage2-${stamp}-Aa1!`;
  const agentEmail = `stage2-agent-${stamp}@example.invalid`;
  const strangerEmail = `stage2-stranger-${stamp}@example.invalid`;
  const otherOrgEmail = `stage2-otherorg-${stamp}@example.invalid`;

  let agentUserId: string | null = null;
  let strangerUserId: string | null = null;
  let otherOrgUserId: string | null = null;
  let organizationId: string | null = null;
  let otherOrganizationId: string | null = null;
    let packetId: number | null = null;
    let foreignPacketId: number | null = null;
    const createdSigningIds: string[] = [];

  const previousGate = process.env.NATIVE_SIGNING_ENABLED;
  process.env.NATIVE_SIGNING_ENABLED = "true";

  try {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: `Stage 2 Org ${stamp}`,
        organization_type: "OTHER",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (orgError || !org) fail(`org create failed: ${orgError?.message}`);
    organizationId = org.id as string;

    const { data: otherOrg, error: otherOrgError } = await admin
      .from("organizations")
      .insert({
        name: `Stage 2 Other Org ${stamp}`,
        organization_type: "OTHER",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (otherOrgError || !otherOrg) {
      fail(`other org create failed: ${otherOrgError?.message}`);
    }
    otherOrganizationId = otherOrg.id as string;

    async function createUser(email: string, orgId: string) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) fail(`user create failed: ${error?.message}`);
      const userId = data.user.id;
      const { error: profileError } = await admin.from("profiles").upsert({
        id: userId,
        email,
        status: "ACTIVE",
        app_role: "USER",
        onboarding_status: "ACTIVE",
        display_name: email.split("@")[0],
        primary_organization_id: orgId,
        must_change_password: false,
      });
      if (profileError) fail(`profile upsert failed: ${profileError.message}`);
      const { error: membershipError } = await admin
        .from("organization_members")
        .insert({
          organization_id: orgId,
          user_id: userId,
          membership_role: "MEMBER",
          status: "ACTIVE",
        });
      if (membershipError) {
        fail(`membership insert failed: ${membershipError.message}`);
      }
      return userId;
    }

    agentUserId = await createUser(agentEmail, organizationId);
    strangerUserId = await createUser(strangerEmail, organizationId);
    otherOrgUserId = await createUser(otherOrgEmail, otherOrganizationId);
    ok("created disposable Stage 2 users and organizations");

    const { data: packet, error: packetError } = await admin
      .from("packets")
      .insert({
        owner_user_id: agentUserId,
        label: `Stage 2 packet ${stamp}`,
        packet_type: "custom",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (packetError || !packet) fail(`packet create failed: ${packetError?.message}`);
    packetId = packet.id as number;

    const { data: foreignPacket, error: foreignPacketError } = await admin
      .from("packets")
      .insert({
        owner_user_id: strangerUserId,
        label: `Stage 2 foreign packet ${stamp}`,
        packet_type: "custom",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (foreignPacketError || !foreignPacket) {
      fail(`foreign packet create failed: ${foreignPacketError?.message}`);
    }
    foreignPacketId = foreignPacket.id as number;

    const agent = buildActor({
      userId: agentUserId,
      email: agentEmail,
      displayName: "Stage Two Agent",
      organizationId,
    });

    // Feature gate off denies operations.
    process.env.NATIVE_SIGNING_ENABLED = "false";
    await expectSigningError(
      "create while feature disabled",
      "NATIVE_SIGNING_DISABLED",
      () => createDraftSigningWithActor(agent, { title: "Should fail" }, admin),
    );
    process.env.NATIVE_SIGNING_ENABLED = "true";

    const created = await createDraftSigningWithActor(
      agent,
      { title: `  Stage 2 Draft ${stamp}  `, sourcePacketId: packetId },
      admin,
    );
    createdSigningIds.push(created.id);
    ok("eligible agent created Draft Signing through trusted operation");

    if (created.originalSenderUserId !== agentUserId) {
      fail("original sender was not derived from session actor");
    }
    if (created.originatingOrganizationId !== organizationId) {
      fail("originating organization was not derived from actor membership");
    }
    if (created.primaryAssociation?.agentUserId !== agentUserId) {
      fail("primary agent association was not the creating actor");
    }
    if (created.lifecycleState !== "DRAFT") {
      fail(`expected DRAFT lifecycle, got ${created.lifecycleState}`);
    }
    if (created.title !== `Stage 2 Draft ${stamp}`) {
      fail("title was not normalized");
    }
    if (created.sourcePacketId !== packetId) {
      fail("source packet was not attached");
    }
    ok("server derived sender, organization, and primary association");

    await expectSigningError(
      "cross-owner packet create",
      "INVALID_PACKET",
      () =>
        createDraftSigningWithActor(
          agent,
          { title: "Bad packet", sourcePacketId: foreignPacketId },
          admin,
        ),
    );

    const readBack = await getSigningForActor(agent, created.id, admin);
    if (readBack.id !== created.id || !readBack.canManage) {
      fail("primary agent could not read/manage own Signing");
    }
    ok("current primary agent can read Signing");

    const stranger = buildActor({
      userId: strangerUserId,
      email: strangerEmail,
      displayName: "Stage Two Stranger",
      organizationId,
    });
    await expectSigningError(
      "same-org non-associated user read",
      "NOT_FOUND",
      () => getSigningForActor(stranger, created.id, admin),
    );

    const otherOrgActor = buildActor({
      userId: otherOrgUserId,
      email: otherOrgEmail,
      displayName: "Stage Two Other Org",
      organizationId: otherOrganizationId,
    });
    await expectSigningError(
      "other-organization UUID possession read",
      "NOT_FOUND",
      () => getSigningForActor(otherOrgActor, created.id, admin),
    );

    // Former manager loses current management when brokerage eligibility ends,
    // but retains historical read through association history.
    const ineligibleFormer = {
      ...agent,
      memberships: [],
    };
    const historical = await getSigningForActor(
      ineligibleFormer,
      created.id,
      admin,
    );
    if (!historical.canRead || historical.canManage) {
      fail("ineligible former manager should retain read-only historical access");
    }
    ok("ineligible former manager retains historical read without management");

    await expectSigningError(
      "ineligible former manager title update",
      "FORBIDDEN",
      () =>
        updateDraftSigningTitleForActor(
          ineligibleFormer,
          { signingId: created.id, title: "Nope" },
          admin,
        ),
    );

    const retitled = await updateDraftSigningTitleForActor(
      agent,
      { signingId: created.id, title: ` Renamed Stage 2 ${stamp} ` },
      admin,
    );
    if (retitled.title !== `Renamed Stage 2 ${stamp}`) {
      fail("title update failed");
    }
    ok("eligible primary agent can update Draft title only");

    // Direct browser bypass remains denied.
    const { data: browserSession, error: signInError } =
      await browser.auth.signInWithPassword({
        email: agentEmail,
        password,
      });
    if (signInError || !browserSession.user) {
      fail(`browser sign-in failed: ${signInError?.message}`);
    }
    ok("ordinary authenticated browser session established");

    for (const table of ["signings", "signing_agent_associations", "signing_events"]) {
      const { error: selectError } = await browser.from(table).select("id").limit(1);
      if (!selectError) fail(`authenticated SELECT ${table} unexpectedly succeeded`);
      ok(`authenticated SELECT ${table} rejected (${selectError.message})`);

      const { error: insertError } = await browser.from(table).insert({
        id: randomUUID(),
      } as never);
      if (!insertError) fail(`authenticated INSERT ${table} unexpectedly succeeded`);
      ok(`authenticated INSERT ${table} rejected (${insertError.message})`);
    }

    // Ensure Stage 1 table list still exists for deny posture.
    if (NATIVE_SIGNING_STAGE1_TABLES.length !== 13) {
      fail("Stage 1 table contract changed unexpectedly");
    }

    ok("Stage 2 Native Signing authority development checks passed");
  } finally {
    if (previousGate === undefined) {
      delete process.env.NATIVE_SIGNING_ENABLED;
    } else {
      process.env.NATIVE_SIGNING_ENABLED = previousGate;
    }

    for (const id of createdSigningIds) {
      await admin.from("signing_events").delete().eq("signing_id", id);
      await admin
        .from("signings")
        .update({ current_primary_agent_association_id: null })
        .eq("id", id);
      await admin.from("signing_agent_associations").delete().eq("signing_id", id);
      await admin.from("signings").delete().eq("id", id);
    }
    if (packetId) {
      await admin.from("packets").update({ status: "DELETED" }).eq("id", packetId);
    }
    if (foreignPacketId) {
      await admin
        .from("packets")
        .update({ status: "DELETED" })
        .eq("id", foreignPacketId);
    }
    for (const userId of [agentUserId, strangerUserId, otherOrgUserId]) {
      if (!userId) continue;
      await admin.from("organization_members").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    if (organizationId) {
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    if (otherOrganizationId) {
      await admin.from("organizations").delete().eq("id", otherOrganizationId);
    }
    await browser.auth.signOut();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
