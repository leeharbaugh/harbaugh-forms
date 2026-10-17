import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildCancellationNoticeMessage,
  CANCELLATION_NOTICE_MAX_ATTEMPTS,
  PARTICIPANT_CANCELLATION_WORK_TYPE,
} from "./cancellation-notices";
import { NATIVE_SIGNING_ALL_MIGRATIONS } from "./native-signing-migrations";

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

const MIGRATION = read(
  "supabase/migrations/20261013120000_native_signing_cancellation_notices.sql",
);
const NOTICES = read("lib/signing/cancellation-notices.ts");
const CANCEL = read("lib/signing/cancel.ts");
const DELIVERY = read("lib/signing/delivery.ts");
const DISPATCH = read("lib/signing/signing-worker-dispatch.ts");
const DASHBOARD_PAGE = read("components/signings/signing-dashboard-page.tsx");
const DASHBOARD = read("lib/signing/dashboard.ts");

const BASE = {
  recipientName: "Pat Buyer",
  recipientEmail: "pat@example.com",
  signingTitle: "123 Main St Purchase",
  senderDisplayName: "Alex Agent",
  brokerageName: "Harbaugh Realty",
  participantMessage: null,
};

const LEGAL_OVERCLAIMS = [
  /contract (is |has been )?cancel/i,
  /agreement (is |has been )?cancel/i,
  /\bvoid\b/i,
  /transaction (is |has been )?(cancel|terminat)/i,
  /legally invalid/i,
  /all parties agreed/i,
];

describe("cancellation email content", () => {
  it("names the Signing, the agent and brokerage, and the dead link", () => {
    const message = buildCancellationNoticeMessage(BASE);
    assert.equal(message.to, "pat@example.com");
    assert.equal(message.subject, "Signing cancelled: 123 Main St Purchase");
    assert.match(message.textBody, /^Hello Pat Buyer,/);
    assert.match(
      message.textBody,
      /The signing request "123 Main St Purchase" from Alex Agent at Harbaugh Realty has been cancelled\./,
    );
    assert.match(message.textBody, /Your previous signing link can no longer be used/);
    assert.match(
      message.textBody,
      /If you have questions, please contact Alex Agent at Harbaugh Realty\./,
    );
  });

  it("includes the participant-safe message when supplied", () => {
    const message = buildCancellationNoticeMessage({
      ...BASE,
      participantMessage: "  We will send a corrected request today.  ",
    });
    assert.match(
      message.textBody,
      /Message from Alex Agent:\n"We will send a corrected request today\."/,
    );
  });

  it("omits the message section cleanly when blank", () => {
    for (const participantMessage of [null, "", "   "]) {
      const message = buildCancellationNoticeMessage({ ...BASE, participantMessage });
      assert.doesNotMatch(message.textBody, /Message from/);
      assert.doesNotMatch(message.textBody, /""/);
      assert.doesNotMatch(message.textBody, /\n\n\n/);
    }
  });

  it("reads naturally without an agent or brokerage", () => {
    const message = buildCancellationNoticeMessage({
      ...BASE,
      senderDisplayName: null,
      brokerageName: null,
      participantMessage: "Sorry for the trouble.",
    });
    assert.match(message.textBody, /The signing request "123 Main St Purchase" has been cancelled\./);
    assert.match(message.textBody, /Message from the sender:/);
    assert.match(message.textBody, /contact the person who sent you this signing request/);
  });

  it("contains no link, credential or call to action", () => {
    const message = buildCancellationNoticeMessage({
      ...BASE,
      participantMessage: "Thanks.",
    });
    assert.doesNotMatch(message.textBody, /https?:\/\//);
    assert.doesNotMatch(message.textBody, /\/sign\//);
    assert.doesNotMatch(message.textBody, /#/);
    assert.doesNotMatch(message.textBody, /download|open your|click/i);
  });

  it("makes no legal conclusion about the underlying transaction", () => {
    const message = buildCancellationNoticeMessage({ ...BASE, participantMessage: null });
    for (const pattern of LEGAL_OVERCLAIMS) {
      assert.doesNotMatch(`${message.subject}\n${message.textBody}`, pattern);
    }
    assert.match(message.textBody, /signing request/);
  });

  it("the worker never reads the internal cancellation reason", () => {
    assert.doesNotMatch(NOTICES, /cancellation_reason/);
    assert.match(NOTICES, /cancellation_participant_message/);
    assert.doesNotMatch(NOTICES, /buildParticipantInviteUrl|loadRawParticipantCredentialToken|issueParticipantCredential/);
  });
});

describe("cancellation transaction (migration)", () => {
  it("is in the Native Signing migration inventory after the archive migrations", () => {
    const list = [...NATIVE_SIGNING_ALL_MIGRATIONS] as string[];
    const index = list.indexOf("20261013120000_native_signing_cancellation_notices");
    assert.ok(index > list.indexOf("20261012120100_native_signing_archive_evidence_guard_fix"));
  });

  it("stores the internal reason and participant message in separate columns", () => {
    assert.match(MIGRATION, /add column if not exists cancellation_reason text/);
    assert.match(MIGRATION, /add column if not exists cancellation_participant_message text/);
    assert.match(MIGRATION, /SIGNING_CANCEL_REASON_REQUIRED/);
  });

  it("cancels, records both values and queues notices in one locked function", () => {
    assert.match(MIGRATION, /from public\.signings\s+where id = p_signing_id\s+for update/);
    assert.match(MIGRATION, /set lifecycle_state = 'CANCELLED'/);
    assert.match(MIGRATION, /insert into public\.signing_delivery_instructions/);
    assert.match(MIGRATION, /insert into public\.signing_work_items/);
    assert.match(MIGRATION, /'PARTICIPANT_CANCELLATION_EMAIL'/);
    assert.match(MIGRATION, /'cancellation:' \|\| ins\.signing_participant_id::text/);
  });

  it("only Draft and In Progress may be cancelled; a repeat queues nothing", () => {
    assert.match(MIGRATION, /lifecycle_state not in \('DRAFT', 'IN_PROGRESS'\)/);
    assert.match(MIGRATION, /SIGNING_CANCEL_NOT_ALLOWED/);
    assert.match(MIGRATION, /'already_cancelled', true/);
  });

  it("recipients come from invitation history, not current link validity", () => {
    assert.match(MIGRATION, /i\.purpose = 'INVITATION'/);
    assert.match(MIGRATION, /activation_mode = 'REMOTE_SEND'/);
    assert.doesNotMatch(MIGRATION, /is_current\s*=\s*true/);
    assert.doesNotMatch(MIGRATION, /revoked_at is null/);
    assert.doesNotMatch(MIGRATION, /participant_status/);
  });

  it("recipient identity is the frozen revision snapshot, never a Contact", () => {
    assert.match(MIGRATION, /signing_package_revision_participants/);
    assert.match(MIGRATION, /rp\.frozen_email/);
    assert.match(MIGRATION, /rp\.frozen_full_name/);
    assert.doesNotMatch(MIGRATION, /contacts/);
  });

  it("at most one cancellation instruction per participant", () => {
    assert.match(
      MIGRATION,
      /create unique index if not exists sdi_cancellation_participant_uidx[\s\S]*where purpose = 'CANCELLATION'/,
    );
    assert.match(MIGRATION, /on conflict \(signing_id, signing_participant_id\)\s+where purpose = 'CANCELLATION'\s+do nothing/);
    assert.match(MIGRATION, /on conflict \(signing_id, work_type, idempotency_key\) do nothing/);
  });

  it("never touches credentials, sessions or evidence", () => {
    assert.doesNotMatch(MIGRATION, /update public\.signing_participant_credentials/);
    assert.doesNotMatch(MIGRATION, /insert into public\.signing_participant_credentials/);
    assert.doesNotMatch(MIGRATION, /signing_field_placements|signing_adopted_marks/);
  });

  it("is executable by the service role only", () => {
    assert.match(MIGRATION, /revoke all on function public\.signing_cancel\(uuid, uuid, text, text\) from authenticated/);
    assert.match(MIGRATION, /grant execute on function public\.signing_cancel\(uuid, uuid, text, text\) to service_role/);
  });
});

describe("cancel action and worker", () => {
  it("authorizes before the elevated cancellation call", () => {
    const authorize = CANCEL.indexOf("authority.canManage");
    const rpc = CANCEL.indexOf('admin.rpc("signing_cancel"');
    assert.ok(authorize > 0 && rpc > authorize);
    assert.match(CANCEL, /A cancellation reason is required\./);
  });

  it("a repeat Cancel returns without queuing", () => {
    const repeat = CANCEL.slice(CANCEL.indexOf('if (signing.lifecycle_state === "CANCELLED")'));
    assert.match(repeat.slice(0, 900), /alreadyCancelled: true/);
    assert.match(CANCEL, /idempotencyKey: `SIGNING_CANCELLED:\$\{signing\.id\}`/);
  });

  it("email sending happens after commit and cannot fail the cancellation", () => {
    assert.match(CANCEL, /sendQueuedCancellationNotices/);
    assert.match(CANCEL, /never surfaces as a cancellation failure/);
    assert.doesNotMatch(CANCEL, /sendSigningEmail/);
  });

  it("the worker processes cancellation work and records each attempt", () => {
    assert.equal(PARTICIPANT_CANCELLATION_WORK_TYPE, "PARTICIPANT_CANCELLATION_EMAIL");
    assert.match(DISPATCH, /processNextCancellationNoticeWorkItem/);
    assert.match(NOTICES, /from\("signing_delivery_attempts"\)\s*\.insert/);
    assert.match(NOTICES, /workerHoldsLease/);
  });

  it("an accepted instruction is never sent again", () => {
    assert.match(NOTICES, /instruction\.delivery_state === "ACCEPTED"[\s\S]{0,200}completeWorkItem/);
  });

  it("retries transient failures, then stops; permanent failures stop at once", () => {
    assert.equal(CANCELLATION_NOTICE_MAX_ATTEMPTS, 5);
    assert.match(NOTICES, /result\.retryable === false \|\| attemptNumber >= CANCELLATION_NOTICE_MAX_ATTEMPTS/);
    assert.match(DELIVERY, /retryable: response\.status === 429 \|\| response\.status >= 500/);
  });

  it("delivery outcome never changes lifecycle", () => {
    assert.doesNotMatch(NOTICES, /lifecycle_state:\s*"/);
    assert.doesNotMatch(NOTICES, /from\("signings"\)\s*\.update/);
  });

  it("invitations queued before a Signing ended are not sent", () => {
    assert.match(DELIVERY, /signing\.lifecycle_state !== "IN_PROGRESS" \|\| signing\.archived_at/);
    assert.match(DELIVERY, /no longer accepting signatures; invitation was not sent/);
  });
});

describe("Cancel Signing UI", () => {
  it("separates the required internal reason from the optional participant message", () => {
    assert.match(DASHBOARD_PAGE, /Internal cancellation reason/);
    assert.match(DASHBOARD_PAGE, /Required\. Saved in Signing history and not sent to participants\./);
    assert.match(DASHBOARD_PAGE, /Message to participants/);
    assert.match(DASHBOARD_PAGE, /Optional\. Included in the cancellation email\./);
    assert.match(DASHBOARD_PAGE, /confirmDisabled=\{cancelReason\.trim\(\)\.length === 0\}/);
    assert.match(DASHBOARD_PAGE, /reason: cancelReason,\s*participantMessage: cancelMessage/);
  });

  it("shows cancellation email outcomes with honest provider wording", () => {
    assert.match(DASHBOARD_PAGE, /Cancellation email accepted by the email service/);
    assert.match(DASHBOARD_PAGE, /Cancellation email failed/);
    assert.match(DASHBOARD_PAGE, /Cancellation email queued/);
    assert.match(DASHBOARD, /\.eq\("purpose", "CANCELLATION"\)/);
  });

  it("avoids legal-overclaim wording in manager copy", () => {
    const copy = [
      ...(DASHBOARD_PAGE.match(/"[^"\r\n]*"/g) ?? []),
      ...(DASHBOARD_PAGE.match(/>[^<>{}]*</g) ?? []),
    ].join("\n");
    for (const pattern of LEGAL_OVERCLAIMS) {
      assert.doesNotMatch(copy, pattern);
    }
  });
});
