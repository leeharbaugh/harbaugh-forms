/**
 * Development-only cancellation email validator.
 * Targets development Supabase ewxsxwzezhkeawnjvigx only. Disposable synthetic
 * Users and Signings. No email can leave: the sandbox and the provider key are
 * both removed, so the shared email boundary reports "not configured"; success
 * paths use the worker's provider seam.
 *
 * Proves: recipients come from invitation history (active, finished, revoked,
 * replaced, credential-only, archived-then-revoked included; never-invited,
 * in-person-only and Draft participants excluded); the latest invitation
 * snapshot wins over a later participant-row change; the internal reason is
 * stored and never reaches the email; the optional message does; Complete and
 * Declined refuse; repeat and concurrent Cancel queue one notice per
 * participant; unauthorized and other-brokerage Cancel denied; provider
 * failure leaves lifecycle Cancelled; transient failure then retry succeeds;
 * permanent failure stops at once; retryable failures stop after the attempt
 * limit; two workers never send twice; an accepted notice is never resent;
 * old links stop working; a stale invitation is not sent after Cancel.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { archiveSigningForActor } from "../lib/signing/archive.ts";
import { cancelSigningWithActor } from "../lib/signing/cancel.ts";
import {
  CANCELLATION_NOTICE_MAX_ATTEMPTS,
  loadCancellationNoticeMessage,
  processNextCancellationNoticeWorkItem,
} from "../lib/signing/cancellation-notices.ts";
import {
  issueParticipantCredentialsForActivation,
  validateParticipantCredential,
  WRAP_KEY_ENV,
  WRAP_KEY_ID_ENV,
} from "../lib/signing/credentials.ts";
import { loadSigningDashboardForActor } from "../lib/signing/dashboard.ts";
import type { SigningEmailMessage, SigningEmailSendResult } from "../lib/signing/delivery.ts";
import {
  enqueueParticipantInvitations,
  processParticipantInvitationWorkItem,
} from "../lib/signing/delivery.ts";
import { SigningError } from "../lib/signing/errors.ts";
import { getSigningExternalAccessState } from "../lib/signing/external-access.ts";
import { createDraftSigningWithActor } from "../lib/signing/operations.ts";
import {
  replaceParticipantCredentialsWithActor,
  revokeParticipantCredentialWithActor,
} from "../lib/signing/participant-credential-recovery.ts";
import type { SigningActor } from "../lib/signing/types.ts";
import type { Profile } from "../lib/types/profile.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PRODUCTION_REF = "eetonalyyyssvkyfdoxh";
const INTERNAL_REASON = "Wrong buyer entity on page 3 (internal)";
const PARTICIPANT_MESSAGE = "We will send a corrected signing request shortly.";

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

async function expectSigningError(label: string, code: string | string[], action: () => Promise<unknown>) {
  const codes = Array.isArray(code) ? code : [code];
  try {
    await action();
  } catch (error) {
    if (error instanceof SigningError && codes.includes(error.code)) {
      ok(`${label} rejected (${error.code})`);
      return;
    }
    fail(`${label} threw unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
  fail(`${label} unexpectedly succeeded`);
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

type Sent = SigningEmailMessage[];
const accept = (sent: Sent) => async (message: SigningEmailMessage): Promise<SigningEmailSendResult> => {
  sent.push(message);
  return { ok: true, providerReference: `validator:${sent.length}` };
};
const reject = (retryable: boolean) => async (): Promise<SigningEmailSendResult> => ({
  ok: false,
  retryable,
  failureDetailSafe: `Email provider rejected the message (status ${retryable ? 503 : 422}).`,
});

async function main() {
  process.env[WRAP_KEY_ID_ENV] ||= "cancellation-dev-cred-wrap-v1";
  process.env[WRAP_KEY_ENV] ||= randomBytes(32).toString("base64");
  process.env.NATIVE_SIGNING_ENABLED = "true";
  delete process.env.SIGNING_EMAIL_SANDBOX;
  delete process.env.RESEND_API_KEY;

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF) || url.includes(PRODUCTION_REF)) {
    fail(`Refusing to run outside development (${url})`);
  }
  ok(`target project verified (${EXPECTED_REF}); email sandbox and provider key removed, nothing can be sent`);
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) fail("Need service role key");
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const access = await getSigningExternalAccessState(admin);
  if (access.suspended || !access.currentEpoch) {
    fail("external Signing access is suspended in development; resume it first");
  }

  const stamp = Date.now();
  const password = `Cancel-${stamp}-Aa1!`;
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const signingIds: string[] = [];

  async function cleanup() {
    for (const id of signingIds) {
      await admin.from("signings").update({ archived_at: null }).eq("id", id);
      await admin.from("signing_entry_sessions").delete().eq("signing_id", id);
      await admin
        .from("signing_participant_credentials")
        .update({ replaced_by_credential_id: null })
        .eq("signing_id", id);
      await admin.from("signing_work_items").delete().eq("signing_id", id);
      await admin.from("signing_delivery_attempts").delete().eq("signing_id", id);
      await admin.from("signing_delivery_instructions").delete().eq("signing_id", id);
      await admin.from("signing_participant_credentials").delete().eq("signing_id", id);
      await admin.from("signing_participants").delete().eq("signing_id", id);
      await admin.from("signing_events").delete().eq("signing_id", id);
      await admin.from("signing_event_chain_state").delete().eq("signing_id", id);
      await admin.from("signings").update({ current_primary_agent_association_id: null }).eq("id", id);
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
    async function createUser(label: string, orgId: string, role: "MEMBER" | "ORG_ADMIN" = "MEMBER") {
      const email = `cancel-${label}-${stamp}@example.invalid`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error || !data.user) fail(`user create failed: ${error?.message}`);
      const userId = data.user.id;
      userIds.push(userId);
      const displayName = `Cancel ${label}`;
      const { error: profileError } = await admin.from("profiles").upsert({
        id: userId,
        email,
        status: "ACTIVE",
        app_role: "USER",
        onboarding_status: "ACTIVE",
        display_name: displayName,
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
      return buildActor({ userId, email, displayName, organizationId: orgId, membershipRole: role });
    }

    const brokerageName = `Cancel Brokerage ${stamp}`;
    const orgId = await createOrg(brokerageName);
    const otherOrgId = await createOrg(`Cancel Other Brokerage ${stamp}`);
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
    let displayOrder = 0;
    async function addParticipant(signingId: string, label: string, status = "PENDING") {
      const { data, error } = await admin
        .from("signing_participants")
        .insert({
          signing_id: signingId,
          full_name: `Cancel ${label}`,
          email: `cancel-${label}-${stamp}@example.invalid`,
          participant_status: status,
          optional_role: "Buyer",
          display_order: displayOrder++,
        })
        .select("id")
        .single();
      if (error || !data) fail(`participant insert failed: ${error?.message}`);
      return data.id as string;
    }
    async function activate(signingId: string, mode: "REMOTE_SEND" | "IN_PERSON") {
      const { error } = await admin
        .from("signings")
        .update({ lifecycle_state: "IN_PROGRESS", activation_mode: mode })
        .eq("id", signingId);
      if (error) fail(`activation failed: ${error.message}`);
    }
    async function issue(signingId: string, participantIds: string[]) {
      return issueParticipantCredentialsForActivation({
        admin,
        signingId,
        participantIds,
        issuedByUserId: agent.userId,
      });
    }
    async function invite(signingId: string, participantId: string, credentialId: string, label: string) {
      const [queued] = await enqueueParticipantInvitations({
        admin,
        signingId,
        packageRevisionId: null,
        initiatedByUserId: agent.userId,
        targets: [{
          signingParticipantId: participantId,
          credentialId,
          fullName: `Cancel ${label} (invited)`,
          email: `cancel-${label}-invited-${stamp}@example.invalid`,
        }],
      });
      return queued;
    }
    async function cancellationRows(signingId: string) {
      const { data, error } = await admin
        .from("signing_delivery_instructions")
        .select("id, signing_participant_id, recipient_email_snapshot, recipient_name_snapshot, delivery_state")
        .eq("signing_id", signingId)
        .eq("purpose", "CANCELLATION");
      if (error) fail(error.message);
      return data ?? [];
    }
    async function cancellationWork(signingId: string) {
      const { data, error } = await admin
        .from("signing_work_items")
        .select("id, processing_state, attempt_count, next_attempt_at, last_error_safe")
        .eq("signing_id", signingId)
        .eq("work_type", "PARTICIPANT_CANCELLATION_EMAIL");
      if (error) fail(error.message);
      return data ?? [];
    }
    async function makeDue(signingId: string) {
      const { error } = await admin
        .from("signing_work_items")
        .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
        .eq("signing_id", signingId)
        .eq("work_type", "PARTICIPANT_CANCELLATION_EMAIL")
        .neq("processing_state", "SUCCEEDED");
      if (error) fail(error.message);
    }
    async function attempts(signingId: string, instructionId?: string) {
      let query = admin
        .from("signing_delivery_attempts")
        .select("attempt_number, outcome, provider_reference, failure_detail_safe, delivery_instruction_id")
        .eq("signing_id", signingId);
      if (instructionId) query = query.eq("delivery_instruction_id", instructionId);
      const { data, error } = await query.order("attempt_number");
      if (error) fail(error.message);
      return data ?? [];
    }
    async function eventCount(signingId: string, eventType: string) {
      const { count, error } = await admin
        .from("signing_events")
        .select("id", { count: "exact", head: true })
        .eq("signing_id", signingId)
        .eq("event_type", eventType);
      if (error) fail(error.message);
      return count ?? 0;
    }
    async function lifecycle(signingId: string) {
      const { data } = await admin
        .from("signings")
        .select("lifecycle_state, archived_at, cancellation_reason, cancellation_participant_message, cancelled_by_user_id, cancelled_at")
        .eq("id", signingId)
        .single();
      return data!;
    }

    // ---------------------------------------------------------------------
    // Mixed In Progress Signing: every eligibility case.
    // ---------------------------------------------------------------------
    const mixedId = await createAgentSigning(`Cancel Mixed ${stamp}`);
    const pActive = await addParticipant(mixedId, "active");
    const pFinished = await addParticipant(mixedId, "finished", "FINISHED");
    const pRevoked = await addParticipant(mixedId, "revoked");
    const pReplaced = await addParticipant(mixedId, "replaced");
    const pCredOnly = await addParticipant(mixedId, "credonly");
    const pNever = await addParticipant(mixedId, "never");
    await activate(mixedId, "REMOTE_SEND");
    const issued = await issue(mixedId, [pActive, pFinished, pRevoked, pReplaced, pCredOnly]);
    const activeInvite = await invite(mixedId, pActive, issued.get(pActive)!.credentialId, "active");
    await invite(mixedId, pFinished, issued.get(pFinished)!.credentialId, "finished");
    await invite(mixedId, pRevoked, issued.get(pRevoked)!.credentialId, "revoked");
    await invite(mixedId, pReplaced, issued.get(pReplaced)!.credentialId, "replaced");
    await revokeParticipantCredentialWithActor(agent, { signingId: mixedId, participantId: pRevoked }, admin);
    await replaceParticipantCredentialsWithActor(
      agent,
      { signingId: mixedId, participantIds: [pReplaced], enqueueInvitation: false },
      admin,
    );
    // The participant row changes after the invitation was sent.
    await admin
      .from("signing_participants")
      .update({ full_name: "Cancel active (renamed later)", email: `cancel-active-later-${stamp}@example.invalid` })
      .eq("id", pActive);
    const activeRaw = issued.get(pActive)!.rawToken;
    if (!(await validateParticipantCredential(admin, activeRaw))) fail("active link should work before Cancel");
    ok("fixture: active, finished, revoked, replaced, credential-only (failed enqueue) and never-invited participants; one invitation still queued");

    // Validation before anything changes.
    await expectSigningError("Cancel without a reason", "INVALID_INPUT", () =>
      cancelSigningWithActor(agent, { signingId: mixedId, reason: "   " }, admin),
    );
    await expectSigningError("Cancel with a 501-character reason", "INVALID_INPUT", () =>
      cancelSigningWithActor(agent, { signingId: mixedId, reason: "x".repeat(501) }, admin),
    );
    await expectSigningError("Cancel with a 1001-character message", "INVALID_INPUT", () =>
      cancelSigningWithActor(agent, { signingId: mixedId, reason: "ok", participantMessage: "x".repeat(1001) }, admin),
    );
    await expectSigningError("unrelated member Cancel", "NOT_FOUND", () =>
      cancelSigningWithActor(member, { signingId: mixedId, reason: INTERNAL_REASON }, admin),
    );
    await expectSigningError("other-brokerage admin Cancel", "NOT_FOUND", () =>
      cancelSigningWithActor(outsider, { signingId: mixedId, reason: INTERNAL_REASON }, admin),
    );
    if ((await lifecycle(mixedId)).lifecycle_state !== "IN_PROGRESS" || (await cancellationRows(mixedId)).length) {
      fail("refused Cancel attempts must change nothing");
    }
    ok("refused attempts left the Signing In Progress with nothing queued");

    // Concurrent double Cancel (double click / two tabs).
    const [first, second] = await Promise.all([
      cancelSigningWithActor(agent, { signingId: mixedId, reason: INTERNAL_REASON, participantMessage: PARTICIPANT_MESSAGE }, admin),
      cancelSigningWithActor(agent, { signingId: mixedId, reason: INTERNAL_REASON, participantMessage: PARTICIPANT_MESSAGE }, admin),
    ]);
    if (first.lifecycleState !== "CANCELLED" || second.lifecycleState !== "CANCELLED") fail("concurrent Cancel lifecycle");
    if (first.cancellationNoticesQueued + second.cancellationNoticesQueued !== 5) {
      fail(`concurrent Cancel queued ${first.cancellationNoticesQueued + second.cancellationNoticesQueued} notices, expected 5`);
    }
    if ((await eventCount(mixedId, "SIGNING_CANCELLED")) !== 1) fail("concurrent Cancel appended two SIGNING_CANCELLED events");
    const repeat = await cancelSigningWithActor(agent, { signingId: mixedId, reason: "again" }, admin);
    if (!repeat.alreadyCancelled || repeat.cancellationNoticesQueued !== 0) fail("repeat Cancel must queue nothing");
    ok("concurrent double Cancel: one transition, one SIGNING_CANCELLED event, 5 notices total; a later repeat queues nothing");

    const row = await lifecycle(mixedId);
    if (
      row.cancellation_reason !== INTERNAL_REASON ||
      row.cancellation_participant_message !== PARTICIPANT_MESSAGE ||
      row.cancelled_by_user_id !== agent.userId ||
      !row.cancelled_at
    ) {
      fail("Cancel did not record reason, message, actor and time");
    }
    ok("reason, participant message, actor and time stored separately on the Signing");

    const notices = await cancellationRows(mixedId);
    const recipients = new Set(notices.map((notice) => notice.signing_participant_id));
    for (const [label, id] of [["active", pActive], ["finished", pFinished], ["revoked", pRevoked], ["replaced", pReplaced], ["credential-only", pCredOnly]] as const) {
      if (!recipients.has(id)) fail(`${label} participant was not queued a cancellation email`);
    }
    if (recipients.has(pNever)) fail("never-invited participant was queued a cancellation email");
    if (notices.length !== 5) fail(`expected 5 cancellation instructions, got ${notices.length}`);
    ok("eligibility: active, finished, revoked-link, replaced-link and credential-only participants included; never-invited excluded");

    const activeNotice = notices.find((notice) => notice.signing_participant_id === pActive)!;
    if (
      activeNotice.recipient_email_snapshot !== `cancel-active-invited-${stamp}@example.invalid` ||
      activeNotice.recipient_name_snapshot !== "Cancel active (invited)"
    ) {
      fail("cancellation recipient must be the invitation snapshot, not the later participant row");
    }
    const credOnlyNotice = notices.find((notice) => notice.signing_participant_id === pCredOnly)!;
    if (credOnlyNotice.recipient_email_snapshot !== `cancel-credonly-${stamp}@example.invalid`) {
      fail("credential-only participant should fall back to the participant row");
    }
    ok("recipient identity: invitation snapshot wins over a later participant-row edit; row used only without an earlier snapshot");

    // Provider unavailable (no sandbox, no key): lifecycle unaffected, retry scheduled.
    const firstAttempts = await attempts(mixedId);
    const cancellationAttempts = firstAttempts.filter((attempt) =>
      notices.some((notice) => notice.id === attempt.delivery_instruction_id),
    );
    if (cancellationAttempts.length !== 5 || cancellationAttempts.some((attempt) => attempt.outcome !== "FAILED")) {
      fail("expected one failed post-commit attempt per notice while the provider is not configured");
    }
    const workAfterFailure = await cancellationWork(mixedId);
    if (
      workAfterFailure.length !== 5 ||
      workAfterFailure.some((item) => item.processing_state !== "FAILED" || !item.next_attempt_at || new Date(item.next_attempt_at).getTime() < Date.now() + 600_000)
    ) {
      fail("retryable failures must be FAILED with a later retry");
    }
    if ((await lifecycle(mixedId)).lifecycle_state !== "CANCELLED") fail("email failure changed lifecycle");
    ok("provider not configured: each notice failed once after commit, retry scheduled ~15 minutes out; Signing stays CANCELLED");

    // Content: exactly what the worker will send.
    const rendered = await loadCancellationNoticeMessage(admin, mixedId, activeNotice.id);
    if (!rendered) fail("could not render the cancellation email");
    if (rendered.subject !== `Signing cancelled: Cancel Mixed ${stamp}`) fail(`subject: ${rendered.subject}`);
    if (!rendered.textBody.includes(PARTICIPANT_MESSAGE)) fail("participant message missing from email");
    if (rendered.textBody.includes(INTERNAL_REASON) || rendered.textBody.includes("Wrong buyer")) fail("internal reason leaked into email");
    if (!rendered.textBody.includes(`Cancel agent at ${brokerageName}`)) fail("agent and brokerage missing from email");
    if (/https?:\/\/|\/sign\/|#[A-Za-z0-9_-]{20,}/.test(rendered.textBody)) fail("email contains a link or token");
    if (rendered.to !== `cancel-active-invited-${stamp}@example.invalid`) fail("email addressed to the wrong snapshot");
    ok("email content: subject, participant message, agent + brokerage; no internal reason, no link, no token; addressed to the invitation snapshot");

    // Stale invitation queued before Cancel is not sent now.
    {
      const result = await processParticipantInvitationWorkItem({ admin, workItemId: activeInvite.workItemId });
      if (result.outcome !== "FAILED" || !/no longer accepting signatures/.test(result.failureDetailSafe ?? "")) {
        fail("a queued invitation was processed after Cancel");
      }
      const { data: work } = await admin.from("signing_work_items").select("next_attempt_at").eq("id", activeInvite.workItemId).single();
      if (new Date(work!.next_attempt_at as string).getTime() < Date.now() + 86_400_000) fail("stale invitation will retry");
      ok("an invitation queued before Cancel is refused by the worker (no link sent) and parked");
    }

    // Old links stop working; Cancel itself never touches credentials.
    if (await validateParticipantCredential(admin, activeRaw)) fail("old link still validates after Cancel");
    ok("old signing link no longer validates once Cancelled");

    // Retry succeeds; two workers never double send.
    await makeDue(mixedId);
    const sent: Sent = [];
    const workers = await Promise.all([0, 1, 2].map(async () => {
      const results = [];
      for (let i = 0; i < 6; i += 1) {
        const result = await processNextCancellationNoticeWorkItem({ admin, signingId: mixedId, send: accept(sent) });
        if (result.outcome === "NO_WORK") break;
        results.push(result);
      }
      return results;
    }));
    const processed = workers.flat();
    if (sent.length !== 5) fail(`three concurrent workers sent ${sent.length} emails, expected 5`);
    if (new Set(sent.map((message) => message.to)).size !== 5) fail("a participant was emailed twice");
    if (processed.some((result) => result.outcome !== "ACCEPTED")) fail("unexpected worker outcome on retry");
    const afterRetry = await cancellationRows(mixedId);
    if (afterRetry.some((notice) => notice.delivery_state !== "ACCEPTED")) fail("instructions not ACCEPTED after retry");
    if ((await eventCount(mixedId, "PARTICIPANT_CANCELLATION_EMAIL_SENT")) !== 5) fail("expected 5 sent events");
    ok("transient failure then retry: all 5 accepted; three concurrent workers sent exactly one email per participant");

    // Forced re-run of a finished item: skipped, never resent.
    await admin
      .from("signing_work_items")
      .update({ processing_state: "PENDING", next_attempt_at: new Date(Date.now() - 1000).toISOString(), claimed_until: null })
      .eq("signing_id", mixedId)
      .eq("work_type", "PARTICIPANT_CANCELLATION_EMAIL");
    const resent: Sent = [];
    for (let i = 0; i < 6; i += 1) {
      const result = await processNextCancellationNoticeWorkItem({ admin, signingId: mixedId, send: accept(resent) });
      if (result.outcome === "NO_WORK") break;
      if (result.outcome !== "SKIPPED") fail(`re-run outcome ${result.outcome}`);
    }
    if (resent.length !== 0) fail("an accepted cancellation email was sent again");
    ok("a re-queued item for an accepted notice is skipped; no duplicate email");

    // Manager dashboard shows the outcome.
    {
      const dashboard = await loadSigningDashboardForActor(agent, mixedId, admin);
      if (dashboard.cancellation?.reason !== INTERNAL_REASON || dashboard.cancellation.participantMessage !== PARTICIPANT_MESSAGE) {
        fail("dashboard cancellation details");
      }
      const active = dashboard.participants.find((participant) => participant.id === pActive);
      const never = dashboard.participants.find((participant) => participant.id === pNever);
      if (active?.cancellationEmail?.deliveryState !== "ACCEPTED" || active.cancellationEmail.sandboxed) fail("dashboard email status for active participant");
      if (never && never.cancellationEmail !== null) fail("never-invited participant shows a cancellation email");
      ok("dashboard: reason + message card data; per-participant cancellation email state (accepted / none)");
    }

    // ---------------------------------------------------------------------
    // Permanent failure stops immediately; retryable stops at the limit.
    // ---------------------------------------------------------------------
    {
      const id = await createAgentSigning(`Cancel Permanent ${stamp}`);
      const p = await addParticipant(id, "permanent");
      await activate(id, "REMOTE_SEND");
      const creds = await issue(id, [p]);
      await invite(id, p, creds.get(p)!.credentialId, "permanent");
      await cancelSigningWithActor(agent, { signingId: id, reason: "permanent failure test" }, admin);
      await makeDue(id);
      const result = await processNextCancellationNoticeWorkItem({ admin, signingId: id, send: reject(false) });
      if (result.outcome !== "TERMINAL_FAILURE") fail(`permanent failure outcome ${result.outcome}`);
      const [item] = await cancellationWork(id);
      if (new Date(item.next_attempt_at as string).getTime() < Date.now() + 86_400_000) fail("permanent failure will retry");
      if ((await processNextCancellationNoticeWorkItem({ admin, signingId: id, send: accept([]) })).outcome !== "NO_WORK") {
        fail("permanent failure was claimed again");
      }
      if ((await eventCount(id, "PARTICIPANT_CANCELLATION_EMAIL_FAILED")) !== 1) fail("failed event missing");
      const dashboard = await loadSigningDashboardForActor(agent, id, admin);
      const status = dashboard.participants[0]?.cancellationEmail;
      if (status?.deliveryState !== "FAILED" || !/status 422/.test(status.lastFailureSafe ?? "")) fail("dashboard failure state");
      if ((await lifecycle(id)).lifecycle_state !== "CANCELLED") fail("permanent failure changed lifecycle");
      ok("permanent provider rejection: stops at once, FAILED shown with a safe reason, event recorded, lifecycle CANCELLED");
    }
    {
      const id = await createAgentSigning(`Cancel Exhausted ${stamp}`);
      const p = await addParticipant(id, "exhausted");
      await activate(id, "REMOTE_SEND");
      const creds = await issue(id, [p]);
      await invite(id, p, creds.get(p)!.credentialId, "exhausted");
      await cancelSigningWithActor(agent, { signingId: id, reason: "retry limit test" }, admin);
      let outcome = "";
      for (let i = 0; i < CANCELLATION_NOTICE_MAX_ATTEMPTS + 2 && outcome !== "TERMINAL_FAILURE"; i += 1) {
        await makeDue(id);
        outcome = (await processNextCancellationNoticeWorkItem({ admin, signingId: id, send: reject(true) })).outcome;
      }
      if (outcome !== "TERMINAL_FAILURE") fail("retryable failures never became terminal");
      const [notice] = await cancellationRows(id);
      const count = (await attempts(id, notice.id)).length;
      if (count !== CANCELLATION_NOTICE_MAX_ATTEMPTS) fail(`expected ${CANCELLATION_NOTICE_MAX_ATTEMPTS} attempts, got ${count}`);
      ok(`retryable failures stop after ${CANCELLATION_NOTICE_MAX_ATTEMPTS} attempts (including the post-commit attempt)`);
    }

    // ---------------------------------------------------------------------
    // Exclusions and lifecycle limits.
    // ---------------------------------------------------------------------
    {
      const id = await createAgentSigning(`Cancel In Person ${stamp}`);
      const p = await addParticipant(id, "inperson");
      await activate(id, "IN_PERSON");
      await issue(id, [p]);
      const result = await cancelSigningWithActor(agent, { signingId: id, reason: "in person test" }, admin);
      if (result.cancellationNoticesQueued !== 0 || (await cancellationRows(id)).length !== 0) {
        fail("in-person-only participant was queued a cancellation email");
      }
      ok("in-person-only participant (never sent a remote invitation) receives no cancellation email");
    }
    {
      const id = await createAgentSigning(`Cancel Draft ${stamp}`);
      await addParticipant(id, "draftperson");
      const result = await cancelSigningWithActor(orgAdmin, { signingId: id, reason: "draft test", participantMessage: "unused" }, admin);
      if (result.lifecycleState !== "CANCELLED" || result.cancellationNoticesQueued !== 0 || (await cancellationRows(id)).length !== 0) {
        fail("Draft Cancel must queue nothing");
      }
      if ((await eventCount(id, "PARTICIPANT_CANCELLATION_EMAILS_QUEUED")) !== 0) fail("Draft Cancel appended a queued event");
      ok("Draft cancelled by the brokerage administrator: no participant was invited, no email queued");
    }
    {
      const id = await createAgentSigning(`Cancel Archived ${stamp}`);
      const p = await addParticipant(id, "archived");
      await activate(id, "REMOTE_SEND");
      const creds = await issue(id, [p]);
      await invite(id, p, creds.get(p)!.credentialId, "archived");
      await archiveSigningForActor(agent, { signingId: id }, admin);
      const archivedAt = (await lifecycle(id)).archived_at;
      const result = await cancelSigningWithActor(agent, { signingId: id, reason: "archived test" }, admin);
      const after = await lifecycle(id);
      if (result.cancellationNoticesQueued !== 1 || after.lifecycle_state !== "CANCELLED" || after.archived_at !== archivedAt) {
        fail("archived In Progress Cancel must queue the notice and stay archived");
      }
      const { count } = await admin
        .from("signing_participant_credentials")
        .select("id", { count: "exact", head: true })
        .eq("signing_id", id)
        .is("revoked_at", null);
      if ((count ?? 0) !== 0) fail("Cancel restored access on an archived Signing");
      ok("archived In Progress (links revoked by archive) then Cancel: notice queued, stays archived, no access restored");
    }
    for (const terminal of ["COMPLETE", "DECLINED"] as const) {
      const { data, error } = await admin
        .from("signings")
        .insert({
          originating_organization_id: orgId,
          original_sender_user_id: agent.userId,
          original_sender_display_name: agent.displayName,
          original_sender_email: agent.email,
          title: `Cancel ${terminal} ${stamp}`,
          lifecycle_state: terminal,
          ...(terminal === "COMPLETE" ? { completed_at: new Date().toISOString() } : {}),
        })
        .select("id")
        .single();
      if (error || !data) fail(`${terminal} insert failed: ${error?.message}`);
      signingIds.push(data.id as string);
      await expectSigningError(`${terminal} Cancel`, ["FORBIDDEN", "CONFLICT"], () =>
        cancelSigningWithActor(orgAdmin, { signingId: data.id as string, reason: "should refuse" }, admin),
      );
      const { error: rpcError } = await admin.rpc("signing_cancel", {
        p_signing_id: data.id,
        p_actor_user_id: agent.userId,
        p_reason: "direct",
        p_participant_message: null,
      });
      if (!rpcError || !/SIGNING_CANCEL_NOT_ALLOWED/.test(rpcError.message)) fail(`${terminal}: transaction did not refuse`);
      if ((await lifecycle(data.id as string)).lifecycle_state !== terminal) fail(`${terminal} lifecycle changed`);
      ok(`${terminal}: Cancel refused by the action and by the transaction; lifecycle unchanged`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    await cleanup();
    process.exit(1);
  }

  await cleanup();
  ok("cancellation email validator passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
