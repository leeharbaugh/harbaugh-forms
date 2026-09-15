import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  generateParticipantCredentialToken,
  hashParticipantCredentialToken,
  isWellFormedParticipantCredentialToken,
  PARTICIPANT_CREDENTIAL_TOKEN_RE,
} from "./credentials";
import {
  buildParticipantInviteUrl,
  PARTICIPANT_INVITATION_WORK_TYPE,
} from "./delivery";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

describe("Native Signing Stage 4 activation boundary contracts", () => {
  const activation = read("lib/signing/activation.ts");
  const credentials = read("lib/signing/credentials.ts");
  const delivery = read("lib/signing/delivery.ts");
  const actions = read("lib/signing/stage4-actions.ts");
  const migration = read(
    "supabase/migrations/20260915160000_native_signing_stage4_draft_snapshots_activation.sql",
  );

  it("issues opaque high-entropy tokens and stores only their hash", () => {
    const token = generateParticipantCredentialToken();
    assert.match(token, PARTICIPANT_CREDENTIAL_TOKEN_RE);
    assert.ok(isWellFormedParticipantCredentialToken(token));
    assert.notEqual(token, generateParticipantCredentialToken());

    const hash = hashParticipantCredentialToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.notEqual(hash, token);
    assert.equal(hash, hashParticipantCredentialToken(token));

    // Authentication stores only the hash; invitation retry may use a
    // server-only AES-GCM wrap. There is never a raw_token column.
    assert.match(migration, /token_hash text not null/);
    assert.match(migration, /spc_token_hash_hex/);
    assert.doesNotMatch(migration, /raw_token/);
    assert.match(
      credentials,
      /token_hash: hashParticipantCredentialToken\(rawToken\)/,
    );
    assert.match(credentials, /wrapParticipantCredentialToken/);
    assert.match(credentials, /unwrapParticipantCredentialToken/);
    assert.match(credentials, /loadRawParticipantCredentialToken/);
    assert.doesNotMatch(credentials, /raw_token:/);
  });

  it("keeps credentials unusable until the Signing is In Progress", () => {
    assert.match(credentials, /signing\.lifecycle_state !== "IN_PROGRESS"/);
    assert.match(credentials, /credential\.revoked_at/);
    assert.match(credentials, /credential\.is_current !== true/);
  });

  it("routes activation through idempotency records per mode", () => {
    assert.match(activation, /signing_operation_idempotency/);
    assert.match(activation, /ACTIVATE_REMOTE_SEND/);
    assert.match(activation, /ACTIVATE_IN_PERSON/);
    assert.match(activation, /"IN_PROGRESS"/);
    assert.match(activation, /"SUCCEEDED"/);
    assert.match(activation, /"FAILED"/);
    assert.match(activation, /"IDEMPOTENCY_CONFLICT"/);
    assert.match(activation, /request_fingerprint/);
    assert.match(migration, /soi_signing_request_uidx/);
    assert.match(
      migration,
      /unique \(signing_id, operation_type, client_request_id\)/,
    );
  });

  it("re-checks readiness and fails closed on source drift", () => {
    assert.match(activation, /evaluateSigningReadiness/);
    assert.match(activation, /DOCUMENT_SOURCE_CHANGED/);
    assert.match(activation, /"SOURCE_CHANGED"/);
    assert.match(activation, /"NOT_READY"/);
  });

  it("guards the lifecycle flip and abandons a revision on earlier failure", () => {
    assert.match(activation, /lifecycle_state: "IN_PROGRESS"/);
    assert.match(activation, /\.eq\("lifecycle_state", "DRAFT"\)/);
    assert.match(activation, /activation_mode: mode/);
    assert.match(activation, /activated_by_user_id: actor\.userId/);
    assert.match(activation, /abandonPromotedRevisionAfterFailedActivation/);
    assert.match(activation, /if \(!lifecycleAdvanced\)/);
    assert.match(activation, /revokeIssuedCredentials/);
    assert.match(activation, /markIdempotencyFailed/);
  });

  it("records activation history without leaking tokens", () => {
    assert.match(activation, /event_type: "SIGNING_ACTIVATED"/);
    assert.match(activation, /visibility: "BUSINESS"/);
    assert.match(activation, /remote signing/);
    assert.match(activation, /in-person signing/);

    const eventInsert = activation.slice(
      activation.indexOf('event_type: "SIGNING_ACTIVATED"'),
      activation.indexOf("if (eventError)"),
    );
    assert.ok(eventInsert.length > 0);
    assert.doesNotMatch(eventInsert, /rawToken/);
    assert.doesNotMatch(eventInsert, /token/);
  });

  it("separates delivery from activation and never rolls activation back", () => {
    assert.match(activation, /mode === "REMOTE_SEND"/);
    assert.match(
      activation,
      /Delivery problems are recorded[\s\S]*never reverse activation/,
    );
    // IN_PERSON never enqueues invitation delivery.
    const remoteBlock = activation.slice(
      activation.indexOf('if (mode === "REMOTE_SEND") {'),
    );
    assert.match(remoteBlock, /enqueueParticipantInvitations/);
    assert.match(
      delivery,
      /A failed or\s*\n \* unconfigured provider records a FAILED attempt and never undoes activation/,
    );
  });

  it("enqueues invitation work referencing the credential id, not the token", () => {
    assert.equal(PARTICIPANT_INVITATION_WORK_TYPE, "PARTICIPANT_INVITATION_EMAIL");
    const referencePayload = delivery.slice(
      delivery.indexOf("reference_json: {"),
      delivery.indexOf("processing_state: \"PENDING\""),
    );
    assert.match(
      referencePayload,
      /signingParticipantCredentialId: target\.credentialId/,
    );
    assert.doesNotMatch(referencePayload, /rawToken/);
    assert.doesNotMatch(referencePayload, /inviteUrl/);
    assert.match(migration, /swi_signing_work_uidx/);
  });

  it("records a safe FAILED attempt when the mail provider is unconfigured", () => {
    assert.match(delivery, /RESEND_API_KEY/);
    assert.match(delivery, /SIGNING_EMAIL_FROM/);
    assert.match(
      delivery,
      /Signing email provider is not configured; invitation was not sent/,
    );
    assert.match(delivery, /outcome: result\.ok \? "ACCEPTED" : "FAILED"/);
    assert.match(delivery, /failure_detail_safe/);
    // Provider bookkeeping must not touch Signing lifecycle state.
    assert.doesNotMatch(delivery, /lifecycle_state/);
    assert.doesNotMatch(delivery, /\.from\("signings"\)\s*\n\s*\.update\(/);
  });

  it("builds invitation links as a path segment and does not log them", () => {
    const url = buildParticipantInviteUrl("Zm9vYmFy");
    assert.match(url, /\/sign\/Zm9vYmFy$/);
    assert.doesNotMatch(url, /\?/);
    assert.doesNotMatch(delivery, /console\.log/);
    const logCalls = delivery.match(/console\.error\([^)]*\)/g) ?? [];
    for (const call of logCalls) {
      assert.doesNotMatch(call, /inviteUrl|rawToken|textBody/);
    }
  });

  it("exposes activation only through activateSigningWithActor", () => {
    assert.match(actions, /activateSigningWithActor/);
    assert.doesNotMatch(
      actions,
      /export async function promotePackageRevision/,
    );
    // Promotion is never imported or re-exported by the browser action surface.
    assert.doesNotMatch(actions, /from "@\/lib\/signing\/package-promotion"/);
    assert.match(actions, /remains internal by design/);
  });
});
