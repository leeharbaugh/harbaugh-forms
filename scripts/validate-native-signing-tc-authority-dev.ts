/**
 * Development-only TC / operator authority validator.
 * Targets development Supabase ewxsxwzezhkeawnjvigx only.
 * Disposable synthetic Users; no real email; cleans fixtures.
 */
import { createClient } from "@supabase/supabase-js";
import type { SigningActor } from "../lib/signing/types.ts";
import { cancelSigningWithActor } from "../lib/signing/cancel.ts";
import {
  createDraftSigningWithActor,
  getSigningForActor,
  updateDraftSigningTitleForActor,
} from "../lib/signing/operations.ts";
import {
  grantOperatorDelegationWithActor,
  revokeOperatorDelegationWithActor,
} from "../lib/signing/operator-delegations.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { NativeSigningDisabledError } from "../lib/signing/feature-gate.ts";
import {
  NATIVE_SIGNING_TC_AUTHORITY_TABLES,
} from "../lib/signing/stage1-schema.ts";
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
    if (
      error instanceof NativeSigningDisabledError &&
      code === "NATIVE_SIGNING_DISABLED"
    ) {
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
    first_name: "TC",
    middle_name: null,
    last_name: "Validator",
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
  };
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }
  ok(`target project ${EXPECTED_REF}`);

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

  for (const table of NATIVE_SIGNING_TC_AUTHORITY_TABLES) {
    const { error } = await admin.from(table).select("id").limit(1);
    if (error) fail(`missing TC table ${table}: ${error.message}`);
  }
  ok("TC authority tables present");

  const stamp = Date.now();
  const password = `TcAuth-${stamp}-Aa1!`;
  const agentEmail = `tc-agent-${stamp}@example.invalid`;
  const tcEmail = `tc-delegate-${stamp}@example.invalid`;
  const memberEmail = `tc-member-${stamp}@example.invalid`;
  const orgAdminEmail = `tc-orgadmin-${stamp}@example.invalid`;
  const otherOrgEmail = `tc-otherorg-${stamp}@example.invalid`;

  let agentUserId: string | null = null;
  let tcUserId: string | null = null;
  let memberUserId: string | null = null;
  let orgAdminUserId: string | null = null;
  let otherOrgUserId: string | null = null;
  let organizationId: string | null = null;
  let otherOrganizationId: string | null = null;
  const createdSigningIds: string[] = [];
  const createdDelegationIds: string[] = [];

  const previousGate = process.env.NATIVE_SIGNING_ENABLED;
  process.env.NATIVE_SIGNING_ENABLED = "true";

  try {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: `TC Org ${stamp}`,
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
        name: `TC Other Org ${stamp}`,
        organization_type: "OTHER",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    if (otherOrgError || !otherOrg) {
      fail(`other org create failed: ${otherOrgError?.message}`);
    }
    otherOrganizationId = otherOrg.id as string;

    async function createUser(
      email: string,
      orgId: string,
      role: "MEMBER" | "ORG_ADMIN" = "MEMBER",
    ) {
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
          membership_role: role,
          status: "ACTIVE",
        });
      if (membershipError) {
        fail(`membership insert failed: ${membershipError.message}`);
      }
      return userId;
    }

    agentUserId = await createUser(agentEmail, organizationId);
    tcUserId = await createUser(tcEmail, organizationId);
    memberUserId = await createUser(memberEmail, organizationId);
    orgAdminUserId = await createUser(orgAdminEmail, organizationId, "ORG_ADMIN");
    otherOrgUserId = await createUser(otherOrgEmail, otherOrganizationId);
    ok("created disposable TC fixture Users");

    const agent = buildActor({
      userId: agentUserId,
      email: agentEmail,
      displayName: "Lee Harbaugh",
      organizationId,
    });
    const tc = buildActor({
      userId: tcUserId,
      email: tcEmail,
      displayName: "Jane Smith",
      organizationId,
    });
    const member = buildActor({
      userId: memberUserId,
      email: memberEmail,
      displayName: "Ordinary Member",
      organizationId,
    });
    const orgAdmin = buildActor({
      userId: orgAdminUserId,
      email: orgAdminEmail,
      displayName: "Org Admin",
      organizationId,
      membershipRole: "ORG_ADMIN",
    });
    const otherOrgUser = buildActor({
      userId: otherOrgUserId,
      email: otherOrgEmail,
      displayName: "Other Org User",
      organizationId: otherOrganizationId,
    });

    // Browser cannot read/write TC tables.
    for (const table of NATIVE_SIGNING_TC_AUTHORITY_TABLES) {
      const { data, error } = await browser.from(table).select("id").limit(1);
      if (!error && data && data.length >= 0) {
        // RLS may return empty without error; mutation must fail.
      }
      const { error: insertError } = await browser.from(table).insert({
        organization_id: organizationId,
        responsible_user_id: agentUserId,
        delegate_user_id: tcUserId,
        operator_role: "TRANSACTION_COORDINATOR",
        status: "ACTIVE",
      } as Record<string, unknown>);
      if (!insertError) fail(`browser insert into ${table} unexpectedly succeeded`);
    }
    ok("browser denied TC table mutations");

    await expectSigningError(
      "ordinary MEMBER grant",
      "FORBIDDEN",
      () =>
        grantOperatorDelegationWithActor(
          member,
          {
            organizationId,
            responsibleUserId: agentUserId,
            delegateUserId: tcUserId,
          },
          admin,
        ),
    );

    await expectSigningError(
      "TC self-grant",
      "FORBIDDEN",
      () =>
        grantOperatorDelegationWithActor(
          tc,
          {
            organizationId,
            responsibleUserId: agentUserId,
            delegateUserId: tcUserId,
          },
          admin,
        ),
    );

    await expectSigningError(
      "cross-org grant",
      "FORBIDDEN",
      () =>
        grantOperatorDelegationWithActor(
          agent,
          {
            organizationId: otherOrganizationId,
            responsibleUserId: otherOrgUserId,
            delegateUserId: tcUserId,
          },
          admin,
        ),
    );

    const grantedByAgent = await grantOperatorDelegationWithActor(
      agent,
      {
        organizationId,
        responsibleUserId: agentUserId,
        delegateUserId: tcUserId,
      },
      admin,
    );
    createdDelegationIds.push(grantedByAgent.id);
    ok("responsible User granted TC delegation");

    // Second grant for ORG_ADMIN path: use a second TC-like user (member as
    // alternate delegate after first revoke), or grant agent→member via org admin.
    await revokeOperatorDelegationWithActor(
      agent,
      { delegationId: grantedByAgent.id },
      admin,
    );
    ok("responsible User revoked TC delegation");

    const grantedByAdmin = await grantOperatorDelegationWithActor(
      orgAdmin,
      {
        organizationId,
        responsibleUserId: agentUserId,
        delegateUserId: tcUserId,
      },
      admin,
    );
    createdDelegationIds.push(grantedByAdmin.id);
    ok("ORG_ADMIN granted TC delegation");

    await expectSigningError(
      "undelegated create-on-behalf before re-grant wait",
      "FORBIDDEN",
      () =>
        createDraftSigningWithActor(
          member,
          { title: `TC bad ${stamp}`, responsibleUserId: agentUserId },
          admin,
        ),
    );

    const created = await createDraftSigningWithActor(
      tc,
      {
        title: `TC Signing ${stamp}`,
        responsibleUserId: agentUserId,
      },
      admin,
    );
    createdSigningIds.push(created.id);

    if (created.createdByUserId !== tcUserId) {
      fail("created_by_user_id must be TC");
    }
    if (created.originalSenderUserId !== agentUserId) {
      fail("original_sender must be responsible agent");
    }
    if (created.primaryAssociation?.agentUserId !== agentUserId) {
      fail("PRIMARY association must be responsible agent");
    }
    if (!created.canManage || !created.isTransactionCoordinator) {
      fail("TC must manage created Signing as TRANSACTION_COORDINATOR");
    }
    ok("TC created Signing: operator not PRIMARY; original_sender = agent");

    const { data: createEvent, error: createEventError } = await admin
      .from("signing_events")
      .select("actor_type, actor_user_id, details_json")
      .eq("signing_id", created.id)
      .eq("event_type", "SIGNING_CREATED")
      .maybeSingle();
    if (createEventError || !createEvent) {
      fail(`SIGNING_CREATED missing: ${createEventError?.message}`);
    }
    if (createEvent.actor_type !== "TRANSACTION_COORDINATOR") {
      fail(`expected TRANSACTION_COORDINATOR actor, got ${createEvent.actor_type}`);
    }
    if (createEvent.actor_user_id !== tcUserId) {
      fail("SIGNING_CREATED actor_user_id must be TC");
    }
    ok("SIGNING_CREATED attributed to TC");

    const { data: operators, error: opError } = await admin
      .from("signing_operator_associations")
      .select("*")
      .eq("signing_id", created.id)
      .eq("operator_user_id", tcUserId)
      .eq("status", "ACTIVE");
    if (opError || !operators || operators.length !== 1) {
      fail("expected one active TC operator association");
    }
    ok("Signing operator association created for TC");

    const { data: agents, error: agentAssocError } = await admin
      .from("signing_agent_associations")
      .select("*")
      .eq("signing_id", created.id);
    if (agentAssocError || !agents) fail(agentAssocError?.message ?? "agents");
    if (agents.some((row) => row.agent_user_id === tcUserId)) {
      fail("TC must not appear in signing_agent_associations");
    }
    ok("signing_agent_associations remain agent-only");

    const retitled = await updateDraftSigningTitleForActor(
      tc,
      { signingId: created.id, title: `TC Signing renamed ${stamp}` },
      admin,
    );
    if (retitled.title !== `TC Signing renamed ${stamp}`) {
      fail("TC Draft retitle failed");
    }
    ok("TC may Draft edit (title)");

    const cancelled = await cancelSigningWithActor(
      tc,
      { signingId: created.id, reason: "validator" },
      admin,
    );
    if (cancelled.lifecycleState !== "CANCELLED") {
      fail("TC cancel failed");
    }
    const { data: cancelEvent } = await admin
      .from("signing_events")
      .select("actor_type, summary")
      .eq("signing_id", created.id)
      .eq("event_type", "SIGNING_CANCELLED")
      .maybeSingle();
    if (cancelEvent?.actor_type !== "TRANSACTION_COORDINATOR") {
      fail("Cancel must attribute TRANSACTION_COORDINATOR");
    }
    if (!String(cancelEvent?.summary ?? "").includes("on behalf of")) {
      fail("Cancel summary must preserve on-behalf-of wording");
    }
    ok("TC Cancel attributed with on-behalf-of semantics");

    // Historical read after revoke
    const activeSigning = await createDraftSigningWithActor(
      tc,
      {
        title: `TC historical ${stamp}`,
        responsibleUserId: agentUserId,
      },
      admin,
    );
    createdSigningIds.push(activeSigning.id);

    await revokeOperatorDelegationWithActor(
      agent,
      { delegationId: grantedByAdmin.id },
      admin,
    );
    ok("revoked active TC delegation");

    await expectSigningError(
      "TC manage after revoke",
      "FORBIDDEN",
      () =>
        updateDraftSigningTitleForActor(
          tc,
          { signingId: activeSigning.id, title: "Should fail" },
          admin,
        ),
    );

    const historical = await getSigningForActor(tc, activeSigning.id, admin);
    if (!historical.canRead || historical.canManage) {
      fail("revoked TC must retain historical read without manage");
    }
    ok("revoked TC: historical read yes, manage no");

    const unrelated = await createDraftSigningWithActor(
      agent,
      { title: `Agent only ${stamp}` },
      admin,
    );
    createdSigningIds.push(unrelated.id);
    await expectSigningError(
      "TC read unrelated Signing",
      "NOT_FOUND",
      () => getSigningForActor(tc, unrelated.id, admin),
    );
    ok("unrelated Signing inaccessible to former TC");

    await expectSigningError(
      "TC create after revoke",
      "FORBIDDEN",
      () =>
        createDraftSigningWithActor(
          tc,
          { title: "nope", responsibleUserId: agentUserId },
          admin,
        ),
    );

    // Cross-org TC cannot create for this org's agent
    await expectSigningError(
      "other-org User create-on-behalf",
      "FORBIDDEN",
      () =>
        createDraftSigningWithActor(
          otherOrgUser,
          { title: "cross", responsibleUserId: agentUserId },
          admin,
        ),
    );
    ok("cross-org create-on-behalf rejected");

    ok("TC authority development validator passed");
  } finally {
    process.env.NATIVE_SIGNING_ENABLED = previousGate;

    for (const signingId of createdSigningIds) {
      await admin
        .from("signings")
        .update({ current_primary_agent_association_id: null })
        .eq("id", signingId);
      await admin
        .from("signing_operator_associations")
        .delete()
        .eq("signing_id", signingId);
      await admin
        .from("signing_agent_associations")
        .delete()
        .eq("signing_id", signingId);
      await admin.from("signing_events").delete().eq("signing_id", signingId);
      await admin.from("signings").delete().eq("id", signingId);
    }
    for (const delegationId of createdDelegationIds) {
      await admin
        .from("signing_operator_delegations")
        .delete()
        .eq("id", delegationId);
    }
    for (const userId of [
      agentUserId,
      tcUserId,
      memberUserId,
      orgAdminUserId,
      otherOrgUserId,
    ]) {
      if (userId) {
        await admin.from("organization_members").delete().eq("user_id", userId);
        await admin.from("profiles").delete().eq("id", userId);
        await admin.auth.admin.deleteUser(userId);
      }
    }
    if (organizationId) {
      await admin.from("organizations").delete().eq("id", organizationId);
    }
    if (otherOrganizationId) {
      await admin.from("organizations").delete().eq("id", otherOrganizationId);
    }
    ok("cleaned TC fixtures");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
