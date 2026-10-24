import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SigningAuthorityResult } from "./authority";
import type { SigningAuthorityBundle } from "./authority-context";
import { prepareCeremonyMarks } from "./adopted-marks";
import { processCancellationNoticeWorkItem } from "./cancellation-notices";
import type { CeremonyWriteContext } from "./ceremony-context";
import {
  acceptConsent,
  checkConsentSatisfied,
  consentDisclosureFingerprint,
  requireConsentSatisfied,
} from "./consent-disclosure";
import { CONSENT_WITHDRAWN_PARTICIPANT_MESSAGE } from "./consent-disclosure-view";
import {
  canRecordConsentWithdrawal,
  CONSENT_WITHDRAWN_DELIVERY_DETAIL,
  recordConsentWithdrawal,
  recordSuppressedDelivery,
} from "./consent-withdrawal";
import { mapDeliveryStateToLabel } from "./completed-ops";
import { SigningError } from "./errors";
import { invitationStatusLabel } from "./participant-access-status";
import type { SigningActor } from "./types";

type Row = Record<string, unknown>;

/** In-memory stand-in for the PostgREST builder calls these paths make. */
function fakeAdmin(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; kind: "insert" | "update"; values: Row }> = [];
  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    let inserted: Row | null = null;
    let orderBy: { column: string; ascending: boolean } | null = null;
    let limitTo: number | null = null;
    const rows = () => (tables[table] ??= []);
    const matching = () => rows().filter((row) => filters.every((filter) => filter(row)));
    const run = (): { data: unknown; error: { message: string; code?: string } | null } => {
      if (inserted) {
        if (
          table === "signing_events" &&
          inserted.idempotency_key &&
          rows().some((row) => row.idempotency_key === inserted?.idempotency_key)
        ) {
          return { data: null, error: { message: "duplicate key", code: "23505" } };
        }
        const row = { id: `${table}-${rows().length + 1}`, ...inserted };
        rows().push(row);
        writes.push({ table, kind: "insert", values: row });
        return { data: [row], error: null };
      }
      const found = matching();
      if (patch) {
        for (const row of found) Object.assign(row, patch);
        writes.push({ table, kind: "update", values: patch });
        return { data: found, error: null };
      }
      let result = [...found];
      if (orderBy) {
        const { column, ascending } = orderBy;
        result.sort((a, b) => (Number(a[column]) - Number(b[column])) * (ascending ? 1 : -1));
      }
      if (limitTo !== null) result = result.slice(0, limitTo);
      return { data: result, error: null };
    };
    const single = () => {
      const { data, error } = run();
      return { data: (data as Row[] | null)?.[0] ?? null, error };
    };
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      neq: (column: string, value: unknown) => {
        filters.push((row) => row[column] !== value);
        return builder;
      },
      is: (column: string, value: unknown) => {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      gt: (column: string, value: unknown) => {
        filters.push((row) => String(row[column] ?? "") > String(value));
        return builder;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        orderBy = { column, ascending: options?.ascending !== false };
        return builder;
      },
      limit: (count: number) => {
        limitTo = count;
        return builder;
      },
      update: (values: Row) => {
        patch = values;
        return builder;
      },
      insert: (values: Row) => {
        inserted = values;
        return builder;
      },
      maybeSingle: async () => single(),
      single: async () => single(),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }
  return { admin: { from } as unknown as SupabaseClient, tables, writes };
}

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");

const DEV = {} as NodeJS.ProcessEnv;
const SIGNING = "11111111-1111-4111-8111-111111111111";
const OTHER_SIGNING = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AGENT = "99999999-9999-4999-8999-999999999999";
const VERSION = "d0000000-0000-4000-8000-000000000001";
const BODY = "Test-only disclosure body.";
const SHA = consentDisclosureFingerprint(BODY);
const ACCEPTED_AT = "2026-10-22T13:00:00.000Z";

const actor = { userId: AGENT, displayName: "Pat Agent", email: null, memberships: [] } as unknown as SigningActor;

function authority(overrides: Partial<SigningAuthorityResult> = {}): SigningAuthorityResult {
  return {
    canRead: true,
    canManage: false,
    activeAssociation: null,
    historicalAssociation: null,
    activeOperatorAssociation: null,
    historicalOperatorAssociation: null,
    isBrokerageAdministrator: false,
    isTransactionCoordinator: false,
    ...overrides,
  } as SigningAuthorityResult;
}

const primary = { associationRole: "PRIMARY" } as SigningAuthorityResult["activeAssociation"];

function bundle(lifecycleState: string, auth: SigningAuthorityResult, signingId = SIGNING): SigningAuthorityBundle {
  return {
    signing: { id: signingId, lifecycle_state: lifecycleState } as SigningAuthorityBundle["signing"],
    associations: [],
    operatorAssociations: [],
    authority: auth,
  };
}

function participant(overrides: Row = {}): Row {
  return {
    id: P1,
    signing_id: SIGNING,
    participant_status: "FINISHED",
    finished_at: "2026-10-22T14:00:00.000Z",
    consent_accepted_at: ACCEPTED_AT,
    consent_disclosure_version_id: VERSION,
    consent_content_sha256: SHA,
    consent_withdrawn_at: null,
    ...overrides,
  };
}

function disclosureVersion(): Row {
  return {
    id: VERSION,
    version_key: "test-version",
    title: "Electronic records and signatures",
    body_text: BODY,
    content_sha256: SHA,
    is_production_ready: false,
    published_at: "2026-10-20T12:00:00.000Z",
    superseded_at: null,
  };
}

const withdrawalEvents = (db: ReturnType<typeof fakeAdmin>) =>
  (db.tables.signing_events ?? []).filter((event) => event.event_type === "CONSENT_WITHDRAWN");

describe("Consent withdrawal: who may record it", () => {
  it("is the In Progress manager or the completed-operations manager", () => {
    assert.equal(canRecordConsentWithdrawal(authority({ canManage: true }), "IN_PROGRESS"), true);
    assert.equal(canRecordConsentWithdrawal(authority({ canManage: false }), "IN_PROGRESS"), false);
    assert.equal(canRecordConsentWithdrawal(authority({ activeAssociation: primary }), "COMPLETE"), true);
    assert.equal(canRecordConsentWithdrawal(authority({ isBrokerageAdministrator: true }), "COMPLETE"), true);
    assert.equal(
      canRecordConsentWithdrawal(
        authority({ activeOperatorAssociation: {} as SigningAuthorityResult["activeOperatorAssociation"] }),
        "COMPLETE",
      ),
      true,
    );
    assert.equal(
      canRecordConsentWithdrawal(
        authority({ historicalAssociation: {} as SigningAuthorityResult["historicalAssociation"] }),
        "COMPLETE",
      ),
      false,
      "historical read never grants it",
    );
    for (const state of ["DRAFT", "DECLINED", "CANCELLED"]) {
      assert.equal(canRecordConsentWithdrawal(authority({ canManage: true, activeAssociation: primary }), state), false);
    }
  });

  it("refuses read-only viewers and closed lifecycles without writing", async () => {
    const db = fakeAdmin({ signing_participants: [participant()] });
    await assert.rejects(
      () => recordConsentWithdrawal({ admin: db.admin, actor, bundle: bundle("IN_PROGRESS", authority()), signingParticipantId: P1 }),
      (error: unknown) => error instanceof SigningError && error.code === "FORBIDDEN",
    );
    for (const state of ["DRAFT", "DECLINED", "CANCELLED"]) {
      await assert.rejects(
        () =>
          recordConsentWithdrawal({
            admin: db.admin,
            actor,
            bundle: bundle(state, authority({ canManage: true, activeAssociation: primary })),
            signingParticipantId: P1,
          }),
        (error: unknown) => error instanceof SigningError && error.code === "CONFLICT",
      );
    }
    assert.equal(db.writes.length, 0);
  });

  it("refuses a participant who never consented, a removed one, or one on another Signing", async () => {
    const db = fakeAdmin({
      signing_participants: [
        participant({ id: P1, consent_accepted_at: null, consent_disclosure_version_id: null, consent_content_sha256: null }),
        participant({ id: P2, participant_status: "REMOVED" }),
      ],
    });
    const manage = bundle("IN_PROGRESS", authority({ canManage: true, activeAssociation: primary }));
    await assert.rejects(
      () => recordConsentWithdrawal({ admin: db.admin, actor, bundle: manage, signingParticipantId: P1 }),
      (error: unknown) => error instanceof SigningError && error.code === "CONFLICT",
    );
    await assert.rejects(
      () => recordConsentWithdrawal({ admin: db.admin, actor, bundle: manage, signingParticipantId: P2 }),
      (error: unknown) => error instanceof SigningError && error.code === "NOT_FOUND",
    );
    const elsewhere = bundle("IN_PROGRESS", authority({ canManage: true, activeAssociation: primary }), OTHER_SIGNING);
    await assert.rejects(
      () => recordConsentWithdrawal({ admin: db.admin, actor, bundle: elsewhere, signingParticipantId: P2 }),
      (error: unknown) => error instanceof SigningError && error.code === "NOT_FOUND",
    );
    assert.equal(db.writes.length, 0);
  });
});

describe("Consent withdrawal: recording keeps evidence", () => {
  for (const state of ["IN_PROGRESS", "COMPLETE"]) {
    it(`records the time and one attributable event (${state}), changing nothing else`, async () => {
      const db = fakeAdmin({ signing_participants: [participant()] });
      const before = { ...db.tables.signing_participants[0] };
      const auth =
        state === "IN_PROGRESS"
          ? authority({ canManage: true, activeAssociation: primary })
          : authority({ activeAssociation: primary });

      const result = await recordConsentWithdrawal({ admin: db.admin, actor, bundle: bundle(state, auth), signingParticipantId: P1 });
      assert.equal(result.replayed, false);
      const after = db.tables.signing_participants[0];
      assert.equal(after.consent_withdrawn_at, result.consentWithdrawnAt);
      assert.deepEqual({ ...after, consent_withdrawn_at: null }, before, "only the withdrawal time is written");

      const events = withdrawalEvents(db);
      assert.equal(events.length, 1);
      assert.equal(events[0].actor_type, "PRIMARY_AGENT");
      assert.equal(events[0].actor_user_id, AGENT);
      const details = events[0].details_json as Row;
      assert.equal(details.signingParticipantId, P1);
      assert.equal(details.acceptedDisclosureVersionId, VERSION);
      assert.equal(details.acceptedContentSha256, SHA);
      assert.equal(details.lifecycleState, state);

      const replay = await recordConsentWithdrawal({ admin: db.admin, actor, bundle: bundle(state, auth), signingParticipantId: P1 });
      assert.equal(replay.replayed, true);
      assert.equal(replay.consentWithdrawnAt, result.consentWithdrawnAt);
      assert.equal(withdrawalEvents(db).length, 1, "a replay never adds a second event");
      assert.equal(db.tables.signing_participants[0].consent_withdrawn_at, result.consentWithdrawnAt);
    });
  }

  it("touches no signature, placement, document, artifact or credential table", async () => {
    const db = fakeAdmin({ signing_participants: [participant()] });
    await recordConsentWithdrawal({
      admin: db.admin,
      actor,
      bundle: bundle("COMPLETE", authority({ activeAssociation: primary })),
      signingParticipantId: P1,
    });
    assert.deepEqual(
      [...new Set(db.writes.map((write) => write.table))].sort(),
      ["signing_events", "signing_participants"],
    );
  });
});

describe("Consent withdrawal: no further signing relies on it", () => {
  const context = {
    session: { sessionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", signingId: SIGNING, signingParticipantId: P1 },
    packageRevisionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    frozenPackageRevisionId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    displayedName: "Pat Participant",
  } as unknown as CeremonyWriteContext;

  it("is reported as CONSENT_WITHDRAWN even when the acceptance verifies", async () => {
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [disclosureVersion()],
      signing_participants: [participant({ participant_status: "IN_PROGRESS", consent_withdrawn_at: "2026-10-22T15:00:00.000Z" })],
    });
    const state = await checkConsentSatisfied({ admin: db.admin, signingId: SIGNING, signingParticipantId: P1, env: DEV });
    assert.equal(state.satisfied, false);
    assert.equal(state.reason, "CONSENT_WITHDRAWN");
    assert.equal(state.acceptedDisclosure, null);
    assert.equal(state.acceptedDisclosureVersionId, VERSION, "the recorded acceptance is reported as-is");
    await assert.rejects(
      () => requireConsentSatisfied({ admin: db.admin, signingId: SIGNING, signingParticipantId: P1, env: DEV }),
      (error: unknown) =>
        error instanceof SigningError &&
        error.code === "CONSENT_REQUIRED" &&
        error.message === CONSENT_WITHDRAWN_PARTICIPANT_MESSAGE,
    );
  });

  it("refuses re-consent in the same Signing and Start signing, writing nothing", async () => {
    const db = fakeAdmin({
      signing_consent_disclosure_versions: [disclosureVersion()],
      signing_participants: [participant({ participant_status: "IN_PROGRESS", consent_withdrawn_at: "2026-10-22T15:00:00.000Z" })],
    });
    const before = { ...db.tables.signing_participants[0] };
    await assert.rejects(
      () => acceptConsent({ admin: db.admin, context, disclosureVersionId: VERSION, env: DEV }),
      (error: unknown) => error instanceof SigningError && error.code === "CEREMONY_FORBIDDEN",
    );
    const originalVercelEnv = process.env.VERCEL_ENV;
    delete process.env.VERCEL_ENV;
    try {
      await assert.rejects(
        () => prepareCeremonyMarks({ admin: db.admin, context }),
        (error: unknown) => error instanceof SigningError && error.code === "CONSENT_REQUIRED",
      );
    } finally {
      if (originalVercelEnv !== undefined) process.env.VERCEL_ENV = originalVercelEnv;
    }
    assert.deepEqual(db.tables.signing_participants[0], before);
    assert.equal(db.writes.length, 0);
  });

  it("guards every ceremony write and the in-person handoff in source", () => {
    const disclosure = read("lib/signing/consent-disclosure.ts");
    assert.match(disclosure, /if \(withdrawnAt\) \{\s+return \{\s+satisfied: false,\s+reason: "CONSENT_WITHDRAWN"/);
    assert.match(disclosure, /\.neq\("participant_status", "REMOVED"\)\s+\.is\("consent_withdrawn_at", null\)/);
    for (const [file, fn] of [
      ["lib/signing/adopted-marks.ts", "prepareCeremonyMarks"],
      ["lib/signing/adopted-marks.ts", "adoptCeremonyMark"],
      ["lib/signing/placements.ts", "acceptFieldPlacement"],
      ["lib/signing/placements.ts", "replaceFieldPlacement"],
      ["lib/signing/ceremony-finish.ts", "finishParticipantSigning"],
    ]) {
      const source = read(file);
      const start = source.indexOf(`export async function ${fn}(`);
      assert.ok(start >= 0, `${fn} exists`);
      assert.ok(source.indexOf("await requireConsentSatisfied(", start) > start, `${fn} requires consent`);
    }
    const handoff = read("lib/signing/in-person-handoff.ts");
    assert.match(handoff, /if \(participant\.consent_withdrawn_at\) \{\s+throw new SigningError\("CONFLICT", CONSENT_WITHDRAWN_MANAGER_MESSAGE\)/);
  });
});

describe("Consent withdrawal: automated email is suppressed and recorded", () => {
  it("records a SUPPRESSED attempt, a SUPPRESSED instruction and one system event", async () => {
    const db = fakeAdmin({
      signing_delivery_instructions: [{ id: "instruction-1", signing_id: SIGNING, delivery_state: "QUEUED" }],
      signing_delivery_attempts: [{ delivery_instruction_id: "instruction-1", attempt_number: 1, outcome: "FAILED" }],
    });
    const options = {
      admin: db.admin,
      signingId: SIGNING,
      deliveryInstructionId: "instruction-1",
      signingParticipantId: P1,
      purpose: "COMPLETED_PACKAGE",
    };
    await recordSuppressedDelivery(options);
    const attempts = db.tables.signing_delivery_attempts;
    assert.equal(attempts.length, 2);
    assert.equal(attempts[1].attempt_number, 2);
    assert.equal(attempts[1].outcome, "SUPPRESSED");
    assert.equal(attempts[1].failure_detail_safe, CONSENT_WITHDRAWN_DELIVERY_DETAIL);
    assert.equal(db.tables.signing_delivery_instructions[0].delivery_state, "SUPPRESSED");
    const events = db.tables.signing_events.filter((event) => event.event_type === "DELIVERY_SUPPRESSED_CONSENT_WITHDRAWN");
    assert.equal(events.length, 1);
    assert.equal(events[0].actor_type, "SYSTEM");
    assert.deepEqual(events[0].details_json, {
      deliveryInstructionId: "instruction-1",
      signingParticipantId: P1,
      purpose: "COMPLETED_PACKAGE",
    });
  });

  it("the cancellation worker suppresses a withdrawn participant's email and sends the others", async () => {
    const now = Date.now();
    const leased = (id: string, instructionId: string) => ({
      id,
      signing_id: SIGNING,
      work_type: "PARTICIPANT_CANCELLATION_EMAIL",
      reference_json: { deliveryInstructionId: instructionId },
      processing_state: "PROCESSING",
      claimed_by: "worker-1",
      claimed_until: new Date(now + 60_000).toISOString(),
    });
    const db = fakeAdmin({
      signing_system_controls: [{ id: "default", work_suspended: false, access_suspended: false, access_epoch: "epoch-1" }],
      signings: [{ id: SIGNING, title: "Test Signing", lifecycle_state: "CANCELLED" }],
      signing_participants: [
        participant({ id: P1, participant_status: "IN_PROGRESS", consent_withdrawn_at: "2026-10-22T15:00:00.000Z" }),
        participant({ id: P2, participant_status: "IN_PROGRESS" }),
      ],
      signing_delivery_instructions: [
        { id: "cancel-1", signing_id: SIGNING, purpose: "CANCELLATION", signing_participant_id: P1, recipient_email_snapshot: "p1@example.com", recipient_name_snapshot: "P One", delivery_state: "QUEUED" },
        { id: "cancel-2", signing_id: SIGNING, purpose: "CANCELLATION", signing_participant_id: P2, recipient_email_snapshot: "p2@example.com", recipient_name_snapshot: "P Two", delivery_state: "QUEUED" },
      ],
      signing_work_items: [leased("work-1", "cancel-1"), leased("work-2", "cancel-2")],
    });
    const sent: string[] = [];
    const send = async (message: { to: string }) => {
      sent.push(message.to);
      return { ok: true as const, providerReference: "test" };
    };

    const suppressed = await processCancellationNoticeWorkItem({ admin: db.admin, workItemId: "work-1", workerId: "worker-1", send });
    assert.equal(suppressed.outcome, "SUPPRESSED");
    const delivered = await processCancellationNoticeWorkItem({ admin: db.admin, workItemId: "work-2", workerId: "worker-1", send });
    assert.equal(delivered.outcome, "ACCEPTED");

    assert.deepEqual(sent, ["p2@example.com"], "nothing is sent to the withdrawn participant");
    const instruction = (id: string) => db.tables.signing_delivery_instructions.find((row) => row.id === id);
    assert.equal(instruction("cancel-1")?.delivery_state, "SUPPRESSED");
    assert.equal(instruction("cancel-2")?.delivery_state, "ACCEPTED");
    const attemptsFor = (id: string) => db.tables.signing_delivery_attempts.filter((row) => row.delivery_instruction_id === id);
    assert.deepEqual(attemptsFor("cancel-1").map((row) => row.outcome), ["SUPPRESSED"]);
    assert.deepEqual(attemptsFor("cancel-2").map((row) => row.outcome), ["ACCEPTED"]);
    assert.equal(db.tables.signing_work_items.find((row) => row.id === "work-1")?.processing_state, "SUCCEEDED");
  });

  it("every participant email path checks withdrawal before it sends", () => {
    const invitation = read("lib/signing/delivery.ts");
    const invitationBody = invitation.slice(invitation.indexOf("export async function processParticipantInvitationWorkItem("));
    const withdrawnAt = invitationBody.indexOf("isParticipantConsentWithdrawn(");
    assert.ok(withdrawnAt > 0 && withdrawnAt < invitationBody.indexOf("await sendSigningEmail("));
    assert.ok(withdrawnAt > invitationBody.indexOf("accessBeforeSend"), "rechecked after the last suspension check");

    const completed = read("lib/signing/completed-package-delivery.ts");
    const workerBody = completed.slice(completed.indexOf("export async function processCompletedPackageDeliveryWorkItem("));
    const completedCheck = workerBody.indexOf("isParticipantConsentWithdrawn(");
    assert.ok(completedCheck > 0 && completedCheck < workerBody.indexOf("await sendSigningEmail("));

    const fanOut = completed.slice(
      completed.indexOf("export async function enqueueInitialCompletedPackageFanOut("),
      completed.indexOf("export async function enqueueInitialCopyRecipientFanOut("),
    );
    assert.match(fanOut, /if \(participant\.consent_withdrawn_at\) \{[\s\S]*?recordSuppressedDelivery\([\s\S]*?continue;/);
    assert.ok(fanOut.indexOf("participant.consent_withdrawn_at") < fanOut.indexOf("await enqueueCompletedPackageDelivery("));

    const resend = completed.slice(completed.indexOf("export async function resendCompletedPackageWithActor("));
    assert.ok(resend.indexOf("assertParticipantConsentNotWithdrawn(") < resend.indexOf("enqueueCompletedPackageDelivery("));
    const replace = completed.slice(completed.indexOf("export async function replaceCompletedPackageCredentialWithActor("));
    assert.ok(
      replace.indexOf("assertParticipantConsentNotWithdrawn(") < replace.indexOf("revokeCompletedPackageSessionsForCredential("),
      "Replace refuses before it revokes anything",
    );

    const cancellation = read("lib/signing/cancellation-notices.ts");
    const cancellationBody = cancellation.slice(cancellation.indexOf("export async function processCancellationNoticeWorkItem("));
    assert.ok(cancellationBody.indexOf("isParticipantConsentWithdrawn(") < cancellationBody.indexOf("sendSigningEmail(message"));

    const recovery = read("lib/signing/participant-credential-recovery.ts");
    for (const fn of [
      "resendParticipantInvitationWithActor",
      "replaceParticipantInvitationWithActor",
      "getParticipantSigningLinkForQaWithActor",
    ]) {
      const body = recovery.slice(recovery.indexOf(`export async function ${fn}(`));
      const guard = body.indexOf("assertParticipantConsentNotWithdrawn(");
      assert.ok(guard > 0 && guard < body.indexOf("loadCurrentCredentialId("), `${fn} refuses a withdrawn participant first`);
    }
    const revoke = recovery.slice(recovery.indexOf("export async function revokeParticipantCredentialWithActor("));
    assert.doesNotMatch(revoke, /assertParticipantConsentNotWithdrawn/, "revoking a link stays available");
  });

  it("shows managers a suppressed email as not sent, never as queued, failed or unknown", () => {
    const access = {
      linkState: "ACTIVE",
      linkIssuedAt: null,
      lastReplacedAt: null,
      revokedAt: null,
      revokedOnArchive: false,
      lastInvitationQueuedAt: null,
      lastInvitationState: "SUPPRESSED",
      lastAttemptAt: null,
      lastAttemptOutcome: null,
      lastAttemptSandboxed: false,
    } as const;
    assert.equal(invitationStatusLabel(access), "Invitation not sent: consent withdrawn");
    assert.equal(mapDeliveryStateToLabel("SUPPRESSED"), "Not sent: consent withdrawn");
    const page = read("components/signings/signing-dashboard-page.tsx");
    assert.match(page, /case "SUPPRESSED":\s+return "Cancellation email not sent: consent withdrawn";/);
    const panel = read("components/signings/signing-completed-ops-panel.tsx");
    assert.match(panel, /\{row\.consentWithdrawn \? null : \(\s*<>[\s\S]*?Resend Package[\s\S]*?Replace Link[\s\S]*?<\/>\s*\)\}/);
    assert.match(panel, /Revoke Link/);
    assert.match(read("lib/signing/completed-ops.ts"), /consentWithdrawn: Boolean\(row\.consent_withdrawn_at\)/);
  });

  it("does not revoke completed-document links or Decline the Signing", () => {
    const withdrawal = read("lib/signing/consent-withdrawal.ts");
    assert.doesNotMatch(withdrawal, /revoke|signing_completed_package_credentials|lifecycle_state:|participant_status:|DECLINED/);
  });
});

describe("Consent withdrawal: migration and manager UI", () => {
  const migration = read("supabase/migrations/20261022120000_native_signing_consent_withdrawal.sql");

  it("is additive and forward-only, protecting the withdrawal and the accepted consent", () => {
    assert.match(migration, /add column if not exists consent_withdrawn_at timestamptz/);
    assert.match(migration, /check \(consent_withdrawn_at is null or consent_accepted_at is not null\)/);
    assert.match(migration, /raise exception 'SIGNING_CONSENT_WITHDRAWAL_IMMUTABLE'/);
    assert.match(migration, /raise exception 'SIGNING_CONSENT_WITHDRAWN'/);
    assert.match(migration, /before update of consent_withdrawn_at, consent_accepted_at,\s+consent_disclosure_version_id, consent_content_sha256/);
    assert.match(migration, /delivery_state in \('PENDING', 'QUEUED', 'ACCEPTED', 'FAILED', 'SUPPRESSED'\)/);
    assert.match(migration, /outcome in \('ACCEPTED', 'FAILED', 'SUPPRESSED'\)/);
    assert.doesNotMatch(migration, /^\s*(update|delete from|insert into|truncate)\b/im, "no data rewrite");
    assert.doesNotMatch(migration, /drop (column|table)/i);
  });

  it("offers Record consent withdrawal only after acceptance, behind a confirmation", () => {
    const page = read("components/signings/signing-dashboard-page.tsx");
    assert.match(
      page,
      /dashboard\.canRecordConsentWithdrawal &&\s+participant\.consentAcceptedAt &&\s+!participant\.consentWithdrawnAt \? \(/,
    );
    assert.match(page, /Record consent withdrawal/);
    assert.match(page, /recordParticipantConsentWithdrawalAction\(\{ signingId, participantId \}\)/);
    const dashboard = read("lib/signing/dashboard.ts");
    assert.match(dashboard, /canRecordConsentWithdrawal\(bundle\.authority, bundle\.signing\.lifecycle_state\)/);
    const ceremony = read("components/sign/ceremony-shell.tsx");
    assert.match(ceremony, /overview\.consent\.reason === "CONSENT_WITHDRAWN"/);
    assert.doesNotMatch(ceremony, /recordParticipantConsentWithdrawal|withdrawConsent/, "no participant-facing withdrawal control");
  });
});

let savedChainKeyId: string | undefined;
beforeEach(() => {
  savedChainKeyId = process.env.SIGNING_EVENT_CHAIN_KEY_ID;
  delete process.env.SIGNING_EVENT_CHAIN_KEY_ID;
});
afterEach(() => {
  if (savedChainKeyId !== undefined) process.env.SIGNING_EVENT_CHAIN_KEY_ID = savedChainKeyId;
});
