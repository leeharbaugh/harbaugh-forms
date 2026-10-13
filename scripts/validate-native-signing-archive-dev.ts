/**
 * Development-only Archive Signing validator.
 * Targets development Supabase ewxsxwzezhkeawnjvigx only. Disposable synthetic
 * Users and Signings; no real email; never touches the global access epoch.
 *
 * Proves: archive never changes lifecycle (all five states); archive and
 * unarchive are idempotent; authority (primary agent, brokerage administrator
 * allowed; unrelated member and other brokerage denied); archiving In Progress
 * revokes credentials, entry sessions, ceremony sessions, presence leases and
 * unconsumed handoffs atomically while evidence and progress survive; no new
 * access or evidence lands while archived; unarchive restores nothing; Replace
 * after unarchive works; Cancel keeps archived; the archive/credential race
 * never leaves an archived In Progress Signing with a valid credential.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import {
  archiveSigningForActor,
  unarchiveSigningForActor,
} from "../lib/signing/archive.ts";
import {
  createCeremonyBrowserSession,
  validateCeremonyBrowserSession,
} from "../lib/signing/browser-sessions.ts";
import { cancelSigningWithActor } from "../lib/signing/cancel.ts";
import {
  issueParticipantCredentialsForActivation,
  validateParticipantCredential,
  WRAP_KEY_ENV,
  WRAP_KEY_ID_ENV,
} from "../lib/signing/credentials.ts";
import {
  createSigningEntrySession,
  validateSigningEntrySession,
} from "../lib/signing/entry-sessions.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { getSigningExternalAccessState } from "../lib/signing/external-access.ts";
import {
  generateInPersonHandoffToken,
  hashInPersonHandoffToken,
  validateInPersonHandoff,
} from "../lib/signing/in-person-handoff.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import {
  replaceParticipantCredentialsWithActor,
  replaceParticipantInvitationWithActor,
} from "../lib/signing/participant-credential-recovery.ts";
import { acquirePresenceLease } from "../lib/signing/presence.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PRODUCTION_REF = "eetonalyyyssvkyfdoxh";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function fail(message: string): never {
  throw new Error(`FAIL: ${message}`);
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
  } catch (error) {
    if (error instanceof SigningError && error.code === code) {
      ok(`${label} rejected (${error.code})`);
      return;
    }
    fail(
      `${label} threw unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  fail(`${label} unexpectedly succeeded`);
}

async function expectDbArchivedRejection(
  label: string,
  action: () => PromiseLike<{ error: { message: string } | null }>,
) {
  const { error } = await action();
  if (!error) fail(`${label} unexpectedly succeeded`);
  if (!/SIGNING_ARCHIVED/.test(error.message)) {
    fail(`${label} rejected for the wrong reason: ${error.message}`);
  }
  ok(`${label} rejected by database guard`);
}

function buildActor(options: {
  userId: string;
  email: string;
  displayName: string;
  organizationId: string;
  membershipRole?: "MEMBER" | "ORG_ADMIN";
}): SigningActor {
  const profile = {
    id: options.userId,
    status: "ACTIVE",
    app_role: "USER",
    onboarding_status: "ACTIVE",
    display_name: options.displayName,
    email: options.email,
    primary_organization_id: options.organizationId,
    must_change_password: false,
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

async function loadSigning(admin: SupabaseClient, id: string) {
  const { data, error } = await admin
    .from("signings")
    .select("id, lifecycle_state, archived_at, title, completed_at, current_package_revision_id, frozen_package_revision_id")
    .eq("id", id)
    .single();
  if (error || !data) fail(`load Signing failed: ${error?.message}`);
  return data;
}

async function countEvents(admin: SupabaseClient, id: string, eventType: string) {
  const { count, error } = await admin
    .from("signing_events")
    .select("id", { count: "exact", head: true })
    .eq("signing_id", id)
    .eq("event_type", eventType);
  if (error) fail(error.message);
  return count ?? 0;
}

async function activeCredentialCount(admin: SupabaseClient, id: string) {
  const { count, error } = await admin
    .from("signing_participant_credentials")
    .select("id", { count: "exact", head: true })
    .eq("signing_id", id)
    .eq("is_current", true)
    .is("revoked_at", null);
  if (error) fail(error.message);
  return count ?? 0;
}

async function main() {
  process.env[WRAP_KEY_ID_ENV] ||= "archive-dev-cred-wrap-v1";
  process.env[WRAP_KEY_ENV] ||= randomBytes(32).toString("base64");
  process.env.NATIVE_SIGNING_ENABLED = "true";
  process.env.SIGNING_EMAIL_SANDBOX = "true";
  delete process.env.RESEND_API_KEY;

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF) || url.includes(PRODUCTION_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }
  ok(`target project verified (${EXPECTED_REF})`);
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) fail("Need service role key");
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const access = await getSigningExternalAccessState(admin);
  if (access.suspended || !access.currentEpoch) {
    fail("external Signing access is suspended in development; resume it first");
  }
  const epoch = access.currentEpoch;

  const stamp = Date.now();
  const password = `Archive-${stamp}-Aa1!`;
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const signingIds: string[] = [];

  async function cleanup() {
    for (const id of signingIds) {
      await admin.from("signing_participant_presence_leases").delete().eq("signing_id", id);
      await admin.from("signing_browser_sessions").delete().eq("signing_id", id);
      await admin.from("signing_entry_sessions").delete().eq("signing_id", id);
      await admin.from("signing_in_person_handoffs").delete().eq("signing_id", id);
      await admin
        .from("signing_participant_credentials")
        .update({ replaced_by_credential_id: null })
        .eq("signing_id", id);
      await admin.from("signing_participant_credentials").delete().eq("signing_id", id);
      await admin.from("signing_work_items").delete().eq("signing_id", id);
      await admin.from("signing_delivery_attempts").delete().eq("signing_id", id);
      await admin.from("signing_delivery_instructions").delete().eq("signing_id", id);
      await admin.from("signing_adopted_marks").delete().eq("signing_id", id);
      await admin.from("signing_participants").delete().eq("signing_id", id);
      await admin.from("signing_events").delete().eq("signing_id", id);
      await admin.from("signing_event_chain_state").delete().eq("signing_id", id);
      await admin
        .from("signings")
        .update({ current_primary_agent_association_id: null })
        .eq("id", id);
      await admin.from("signing_operator_associations").delete().eq("signing_id", id);
      await admin.from("signing_agent_associations").delete().eq("signing_id", id);
      const { error } = await admin.from("signings").delete().eq("id", id);
      if (error) console.error(`Cleanup: Signing ${id}: ${error.message}`);
    }
    for (const id of organizationIds) {
      await admin.from("organization_members").delete().eq("organization_id", id);
    }
    for (const id of userIds) {
      await admin.from("profiles").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    }
    for (const id of organizationIds) {
      await admin.from("organizations").delete().eq("id", id);
    }
  }

  try {
    async function createOrg(name: string) {
      const { data, error } = await admin
        .from("organizations")
        .insert({ name, organization_type: "OTHER", status: "ACTIVE" })
        .select("id")
        .single();
      if (error || !data) fail(`org create failed: ${error?.message}`);
      organizationIds.push(data.id as string);
      return data.id as string;
    }
    async function createUser(
      label: string,
      orgId: string,
      role: "MEMBER" | "ORG_ADMIN" = "MEMBER",
    ): Promise<SigningActor> {
      const email = `archive-${label}-${stamp}@example.invalid`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) fail(`user create failed: ${error?.message}`);
      const userId = data.user.id;
      userIds.push(userId);
      const { error: profileError } = await admin.from("profiles").upsert({
        id: userId,
        email,
        status: "ACTIVE",
        app_role: "USER",
        onboarding_status: "ACTIVE",
        display_name: `Archive ${label}`,
        primary_organization_id: orgId,
        must_change_password: false,
      });
      if (profileError) fail(`profile upsert failed: ${profileError.message}`);
      const { error: membershipError } = await admin.from("organization_members").insert({
        organization_id: orgId,
        user_id: userId,
        membership_role: role,
        status: "ACTIVE",
      });
      if (membershipError) fail(`membership insert failed: ${membershipError.message}`);
      return buildActor({
        userId,
        email,
        displayName: `Archive ${label}`,
        organizationId: orgId,
        membershipRole: role,
      });
    }

    const orgId = await createOrg(`Archive Org ${stamp}`);
    const otherOrgId = await createOrg(`Archive Other Org ${stamp}`);
    const agent = await createUser("agent", orgId);
    const orgAdmin = await createUser("orgadmin", orgId, "ORG_ADMIN");
    const member = await createUser("member", orgId);
    const outsider = await createUser("outsider", otherOrgId, "ORG_ADMIN");
    ok("created disposable Users and organizations");

    async function createAgentSigning(title: string) {
      const summary = await createDraftSigningWithActor(agent, { title }, admin);
      signingIds.push(summary.id);
      return summary.id;
    }
    async function insertTerminalSigning(lifecycle: "COMPLETE" | "DECLINED" | "CANCELLED") {
      const { data, error } = await admin
        .from("signings")
        .insert({
          originating_organization_id: orgId,
          original_sender_user_id: agent.userId,
          original_sender_display_name: agent.displayName,
          original_sender_email: agent.email,
          title: `Archive ${lifecycle} ${stamp}`,
          lifecycle_state: lifecycle,
          ...(lifecycle === "COMPLETE" ? { completed_at: new Date().toISOString() } : {}),
        })
        .select("id")
        .single();
      if (error || !data) fail(`${lifecycle} insert failed: ${error?.message}`);
      signingIds.push(data.id as string);
      return data.id as string;
    }
    let displayOrder = 0;
    async function addParticipant(signingId: string, label: string, status = "PENDING") {
      const { data, error } = await admin
        .from("signing_participants")
        .insert({
          signing_id: signingId,
          full_name: `Archive ${label}`,
          email: `archive-${label}-${stamp}@example.invalid`,
          participant_status: status,
          optional_role: "Buyer",
          display_order: displayOrder++,
        })
        .select("id")
        .single();
      if (error || !data) fail(`participant insert failed: ${error?.message}`);
      return data.id as string;
    }

    // ---------------------------------------------------------------------
    // Data model: new Signings start unarchived.
    // ---------------------------------------------------------------------
    const draftId = await createAgentSigning(`Archive Draft ${stamp}`);
    if ((await loadSigning(admin, draftId)).archived_at !== null) {
      fail("a new Signing must start unarchived");
    }
    ok("new Signings default to archived_at = null");

    // ---------------------------------------------------------------------
    // Authorization.
    // ---------------------------------------------------------------------
    await expectSigningError("logged-out / invalid id archive", "INVALID_INPUT", () =>
      archiveSigningForActor(agent, { signingId: "not-a-uuid" }, admin),
    );
    await expectSigningError("missing Signing archive", "NOT_FOUND", () =>
      archiveSigningForActor(agent, { signingId: "00000000-0000-4000-8000-000000000000" }, admin),
    );
    await expectSigningError("unrelated member archive", "NOT_FOUND", () =>
      archiveSigningForActor(member, { signingId: draftId }, admin),
    );
    await expectSigningError("other-brokerage admin archive", "NOT_FOUND", () =>
      archiveSigningForActor(outsider, { signingId: draftId }, admin),
    );
    if ((await loadSigning(admin, draftId)).archived_at !== null) {
      fail("denied archive attempts must not write");
    }
    ok("denied archive attempts left the Signing unarchived");

    // ---------------------------------------------------------------------
    // Draft: archive / idempotence / Send refused / unarchive.
    // ---------------------------------------------------------------------
    const draftArchived = await archiveSigningForActor(agent, { signingId: draftId }, admin);
    if (draftArchived.lifecycleState !== "DRAFT" || !draftArchived.archivedAt) {
      fail("Draft archive must keep DRAFT and set archivedAt");
    }
    const draftAgain = await archiveSigningForActor(agent, { signingId: draftId }, admin);
    if (draftAgain.archivedAt !== draftArchived.archivedAt) {
      fail("repeat archive must not move archived_at");
    }
    if ((await countEvents(admin, draftId, "SIGNING_ARCHIVED")) !== 1) {
      fail("repeat archive must not append a second SIGNING_ARCHIVED event");
    }
    ok("Draft archived by the primary agent; lifecycle DRAFT; archive idempotent (one event)");

    await expectDbArchivedRejection("archived Draft activation", () =>
      admin.from("signings").update({ lifecycle_state: "IN_PROGRESS" }).eq("id", draftId),
    );

    await expectSigningError("unrelated member unarchive", "NOT_FOUND", () =>
      unarchiveSigningForActor(member, { signingId: draftId }, admin),
    );
    const draftRestored = await unarchiveSigningForActor(agent, { signingId: draftId }, admin);
    if (draftRestored.archivedAt !== null || draftRestored.lifecycleState !== "DRAFT") {
      fail("unarchive must clear archivedAt and keep DRAFT");
    }
    await unarchiveSigningForActor(agent, { signingId: draftId }, admin);
    if ((await countEvents(admin, draftId, "SIGNING_UNARCHIVED")) !== 1) {
      fail("repeat unarchive must not append a second SIGNING_UNARCHIVED event");
    }
    ok("Draft unarchived; unarchive idempotent (one event)");

    // Cancelled via the real Cancel path, then archived by the primary agent.
    await cancelSigningWithActor(agent, { signingId: draftId, reason: "Archive validator" }, admin);
    const cancelledArchived = await archiveSigningForActor(agent, { signingId: draftId }, admin);
    if (cancelledArchived.lifecycleState !== "CANCELLED" || !cancelledArchived.archivedAt) {
      fail("archiving Cancelled must keep CANCELLED");
    }
    ok("Cancelled Signing archived by the primary agent; lifecycle CANCELLED");

    // ---------------------------------------------------------------------
    // Terminal states archived by the brokerage administrator.
    // ---------------------------------------------------------------------
    for (const lifecycle of ["COMPLETE", "DECLINED", "CANCELLED"] as const) {
      const id = await insertTerminalSigning(lifecycle);
      const before = await loadSigning(admin, id);
      const archived = await archiveSigningForActor(orgAdmin, { signingId: id }, admin);
      const after = await loadSigning(admin, id);
      if (archived.lifecycleState !== lifecycle || after.lifecycle_state !== lifecycle) {
        fail(`${lifecycle} lifecycle changed on archive`);
      }
      if (
        after.completed_at !== before.completed_at ||
        after.frozen_package_revision_id !== before.frozen_package_revision_id ||
        after.current_package_revision_id !== before.current_package_revision_id ||
        after.title !== before.title
      ) {
        fail(`${lifecycle} archive changed Signing data other than archived_at`);
      }
      await expectSigningError(`${lifecycle} archive by other-brokerage admin`, "NOT_FOUND", () =>
        unarchiveSigningForActor(outsider, { signingId: id }, admin),
      );
      const restored = await unarchiveSigningForActor(orgAdmin, { signingId: id }, admin);
      if (restored.lifecycleState !== lifecycle || restored.archivedAt !== null) {
        fail(`${lifecycle} unarchive must restore visibility only`);
      }
      ok(`${lifecycle}: archived and unarchived by the brokerage administrator; lifecycle and data unchanged`);
    }

    // ---------------------------------------------------------------------
    // In Progress: atomic revocation, evidence preserved, nothing restored.
    // ---------------------------------------------------------------------
    const ipId = await createAgentSigning(`Archive In Progress ${stamp}`);
    const p1 = await addParticipant(ipId, "p1");
    const p2 = await addParticipant(ipId, "p2");
    const p3 = await addParticipant(ipId, "p3", "FINISHED");
    {
      const { error } = await admin
        .from("signings")
        .update({ lifecycle_state: "IN_PROGRESS", activation_mode: "REMOTE_SEND" })
        .eq("id", ipId);
      if (error) fail(`move to IN_PROGRESS failed: ${error.message}`);
    }
    const issued = await issueParticipantCredentialsForActivation({
      admin,
      signingId: ipId,
      participantIds: [p1, p2],
      issuedByUserId: agent.userId,
    });
    const cred1 = issued.get(p1)!;
    const cred2 = issued.get(p2)!;
    const validated1 = await validateParticipantCredential(admin, cred1.rawToken);
    if (!validated1) fail("credential should validate before archive");
    const entry1 = await createSigningEntrySession({ admin, credential: validated1 });
    const ceremony2 = await createCeremonyBrowserSession({
      admin,
      signingId: ipId,
      signingParticipantId: p2,
      provenance: { kind: "CREDENTIAL", credentialId: cred2.credentialId },
    });
    await acquirePresenceLease({
      admin,
      signingId: ipId,
      signingParticipantId: p2,
      signingBrowserSessionId: ceremony2.sessionId,
    });
    if (!(await validateCeremonyBrowserSession(admin, ceremony2.rawSessionToken))) {
      fail("ceremony session should validate before archive");
    }
    const handoffToken = generateInPersonHandoffToken();
    {
      const { error } = await admin.from("signing_in_person_handoffs").insert({
        signing_id: ipId,
        signing_participant_id: p1,
        created_by_user_id: agent.userId,
        handoff_token_hash: hashInPersonHandoffToken(handoffToken),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        access_epoch: epoch,
      });
      if (error) fail(`handoff insert failed: ${error.message}`);
    }
    if (!(await validateInPersonHandoff(admin, handoffToken))) {
      fail("in-person handoff should validate before archive");
    }
    const { data: mark, error: markError } = await admin
      .from("signing_adopted_marks")
      .insert({
        signing_id: ipId,
        signing_participant_id: p2,
        mark_kind: "SIGNATURE",
        representation_type: "TYPED",
        typed_text: "Archive p2",
        adopted_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (markError || !mark) fail(`mark insert failed: ${markError?.message}`);
    {
      const { error } = await admin
        .from("signing_participants")
        .update({ participant_status: "STARTED", identity_confirmed_at: new Date().toISOString() })
        .eq("id", p2);
      if (error) fail(`participant progress update failed: ${error.message}`);
    }
    const { data: participantsBefore } = await admin
      .from("signing_participants")
      .select("id, participant_status, identity_confirmed_at, finished_at")
      .eq("signing_id", ipId)
      .order("id");
    const { count: credentialRowsBefore } = await admin
      .from("signing_participant_credentials")
      .select("id", { count: "exact", head: true })
      .eq("signing_id", ipId);
    ok("In Progress fixture: two active links, entry session, ceremony session + lease, handoff, adopted mark, participant progress");

    const ipArchived = await archiveSigningForActor(agent, { signingId: ipId }, admin);
    if (ipArchived.lifecycleState !== "IN_PROGRESS" || !ipArchived.archivedAt) {
      fail("archiving In Progress must keep IN_PROGRESS");
    }
    ok("In Progress archived; lifecycle stays IN_PROGRESS");

    if ((await activeCredentialCount(admin, ipId)) !== 0) {
      fail("archived In Progress Signing still has an active credential");
    }
    {
      const { data } = await admin
        .from("signing_participant_credentials")
        .select("revoked_reason")
        .eq("signing_id", ipId)
        .eq("revoked_reason", "SIGNING_ARCHIVED");
      if ((data ?? []).length !== 2) fail("expected two credentials revoked with SIGNING_ARCHIVED");
    }
    if (await validateParticipantCredential(admin, cred1.rawToken)) fail("old link 1 still validates");
    if (await validateParticipantCredential(admin, cred2.rawToken)) fail("old link 2 still validates");
    if (await validateSigningEntrySession(admin, entry1.rawSessionToken)) fail("entry session still validates");
    if (await validateCeremonyBrowserSession(admin, ceremony2.rawSessionToken)) {
      fail("ceremony session still validates");
    }
    if (await validateInPersonHandoff(admin, handoffToken)) fail("handoff still validates");
    {
      const { data: sessionRow } = await admin
        .from("signing_browser_sessions")
        .select("status, ended_reason")
        .eq("id", ceremony2.sessionId)
        .single();
      if (sessionRow?.status !== "REVOKED" || sessionRow?.ended_reason !== "SIGNING_ARCHIVED") {
        fail("ceremony session row not revoked by archive");
      }
      const { count: openLeases } = await admin
        .from("signing_participant_presence_leases")
        .select("id", { count: "exact", head: true })
        .eq("signing_id", ipId)
        .is("released_at", null);
      if ((openLeases ?? 0) !== 0) fail("presence lease not released by archive");
    }
    ok("old links, entry session, active ceremony session, presence lease and handoff all revoked atomically");

    {
      const { data: markAfter } = await admin
        .from("signing_adopted_marks")
        .select("*")
        .eq("id", mark.id)
        .single();
      if (!markAfter || markAfter.typed_text !== mark.typed_text || markAfter.adopted_at !== mark.adopted_at) {
        fail("adopted mark changed on archive");
      }
      const { data: participantsAfter } = await admin
        .from("signing_participants")
        .select("id, participant_status, identity_confirmed_at, finished_at")
        .eq("signing_id", ipId)
        .order("id");
      if (JSON.stringify(participantsAfter) !== JSON.stringify(participantsBefore)) {
        fail("participant progress changed on archive");
      }
      const { count: credentialRowsAfter } = await admin
        .from("signing_participant_credentials")
        .select("id", { count: "exact", head: true })
        .eq("signing_id", ipId);
      if (credentialRowsAfter !== credentialRowsBefore) fail("credential history rows changed");
      const { data: event } = await admin
        .from("signing_events")
        .select("details_json, visibility, actor_user_id")
        .eq("signing_id", ipId)
        .eq("event_type", "SIGNING_ARCHIVED")
        .single();
      const details = (event?.details_json ?? {}) as Record<string, unknown>;
      if (
        event?.visibility !== "BUSINESS" ||
        event.actor_user_id !== agent.userId ||
        details.revokedCredentials !== 2 ||
        details.participantAccessRevoked !== true ||
        details.lifecycleState !== "IN_PROGRESS"
      ) {
        fail("SIGNING_ARCHIVED event details incomplete");
      }
      if (/[A-Za-z0-9_-]{40,}/.test(JSON.stringify(event?.details_json))) {
        fail("archive event details look like they contain a token");
      }
    }
    ok("marks, participant progress (including FINISHED), credential history and SIGNING_ARCHIVED event preserved");
    void p3;

    // Nothing new while archived.
    await expectSigningError("Replace while archived", "CONFLICT", () =>
      replaceParticipantCredentialsWithActor(
        agent,
        { signingId: ipId, participantIds: [p1], enqueueInvitation: false },
        admin,
      ),
    );
    await expectSigningError("Replace invitation while archived", "CONFLICT", () =>
      replaceParticipantInvitationWithActor(agent, { signingId: ipId, participantId: p1 }, admin),
    );
    {
      let rejected = false;
      try {
        await issueParticipantCredentialsForActivation({
          admin,
          signingId: ipId,
          participantIds: [p1],
          issuedByUserId: agent.userId,
        });
      } catch (error) {
        rejected = /SIGNING_ARCHIVED/.test(error instanceof Error ? error.message : String(error));
      }
      if (!rejected) fail("direct credential issuance on an archived Signing must be refused");
      if ((await activeCredentialCount(admin, ipId)) !== 0) fail("issuance left an active credential");
      ok("direct credential issuance refused by database guard; no active credential");
    }
    await expectDbArchivedRejection("handoff insert while archived", () =>
      admin.from("signing_in_person_handoffs").insert({
        signing_id: ipId,
        signing_participant_id: p1,
        created_by_user_id: agent.userId,
        handoff_token_hash: hashInPersonHandoffToken(generateInPersonHandoffToken()),
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        access_epoch: epoch,
      }),
    );
    await expectDbArchivedRejection("adopted mark insert while archived", () =>
      admin.from("signing_adopted_marks").insert({
        signing_id: ipId,
        signing_participant_id: p1,
        mark_kind: "SIGNATURE",
        representation_type: "TYPED",
        typed_text: "Archive p1",
      }),
    );
    await expectDbArchivedRejection("participant Finish while archived", () =>
      admin
        .from("signing_participants")
        .update({ participant_status: "FINISHED", finished_at: new Date().toISOString() })
        .eq("id", p2),
    );
    await expectDbArchivedRejection("participant Decline while archived", () =>
      admin
        .from("signing_participants")
        .update({ participant_status: "DECLINED", declined_at: new Date().toISOString() })
        .eq("id", p1),
    );

    // Unarchive restores nothing.
    const ipRestored = await unarchiveSigningForActor(agent, { signingId: ipId }, admin);
    if (ipRestored.lifecycleState !== "IN_PROGRESS" || ipRestored.archivedAt !== null) {
      fail("unarchive must keep IN_PROGRESS and clear archivedAt");
    }
    if ((await activeCredentialCount(admin, ipId)) !== 0) fail("unarchive restored a credential");
    if (await validateParticipantCredential(admin, cred1.rawToken)) fail("old link works after unarchive");
    if (await validateSigningEntrySession(admin, entry1.rawSessionToken)) {
      fail("old entry session works after unarchive");
    }
    if (await validateCeremonyBrowserSession(admin, ceremony2.rawSessionToken)) {
      fail("old ceremony session works after unarchive");
    }
    if (await validateInPersonHandoff(admin, handoffToken)) fail("old handoff works after unarchive");
    {
      const { count } = await admin
        .from("signing_delivery_instructions")
        .select("id", { count: "exact", head: true })
        .eq("signing_id", ipId);
      if ((count ?? 0) !== 0) fail("unarchive created an invitation");
    }
    ok("unarchive kept IN_PROGRESS; old links, sessions and handoff stay dead; no invitation created");

    {
      const { error } = await admin.from("signing_adopted_marks").insert({
        signing_id: ipId,
        signing_participant_id: p1,
        mark_kind: "SIGNATURE",
        representation_type: "TYPED",
        typed_text: "Archive p1",
      });
      if (error) fail(`mark insert after unarchive must succeed: ${error.message}`);
      ok("evidence writes accepted again once unarchived");
    }

    // Replace resumes.
    const replaced = await replaceParticipantCredentialsWithActor(
      agent,
      { signingId: ipId, participantIds: [p1], enqueueInvitation: false },
      admin,
    );
    const newCred = replaced.issued.get(p1);
    if (!newCred) fail("Replace after unarchive did not issue a credential");
    const newValidated = await validateParticipantCredential(admin, newCred.rawToken);
    if (!newValidated || newValidated.credentialId !== newCred.credentialId) {
      fail("replacement link after unarchive must validate");
    }
    if (await validateParticipantCredential(admin, cred1.rawToken)) fail("old link revived by Replace");
    ok("Replace after unarchive issues a working link; old link still dead");

    // Race: archive vs credential issuance, repeated.
    let raceIterations = 0;
    for (let i = 0; i < 6; i += 1) {
      await unarchiveSigningForActor(agent, { signingId: ipId }, admin);
      await Promise.allSettled([
        archiveSigningForActor(agent, { signingId: ipId }, admin),
        issueParticipantCredentialsForActivation({
          admin,
          signingId: ipId,
          participantIds: [p2],
          issuedByUserId: agent.userId,
        }),
      ]);
      const state = await loadSigning(admin, ipId);
      if (state.archived_at && (await activeCredentialCount(admin, ipId)) !== 0) {
        fail(`race iteration ${i}: archived In Progress Signing kept an active credential`);
      }
      raceIterations += 1;
    }
    ok(`archive / credential-issuance race x${raceIterations}: never an archived In Progress Signing with a valid credential`);

    // Cancel while archived keeps it archived.
    const before = await loadSigning(admin, ipId);
    if (!before.archived_at) {
      await archiveSigningForActor(agent, { signingId: ipId }, admin);
    }
    const archivedAt = (await loadSigning(admin, ipId)).archived_at;
    const cancelled = await cancelSigningWithActor(agent, { signingId: ipId, reason: "Archive validator" }, admin);
    if (cancelled.lifecycleState !== "CANCELLED" || cancelled.archivedAt !== archivedAt) {
      fail("cancelling an archived In Progress Signing must keep it archived");
    }
    ok("Cancel reachable while archived; Signing stays archived and becomes CANCELLED");
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    await cleanup();
    process.exit(1);
  }

  await cleanup();
  ok("archive validator passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
