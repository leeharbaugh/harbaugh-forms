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
  const wrapMigration = read(
    "supabase/migrations/20260915161000_native_signing_stage4_credential_wrap.sql",
  );
  const wrapKeyMigration = read(
    "supabase/migrations/20260915162000_native_signing_stage4_wrap_key_version.sql",
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

  it("wraps with a dedicated key and never falls back to the Supabase service key", () => {
    // The whole point of the dedicated key: database credentials must not be
    // reachable as wrapping material from this module at all.
    assert.doesNotMatch(credentials, /SUPABASE_SECRET_KEY/);
    assert.doesNotMatch(credentials, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(credentials, /SIGNING_CREDENTIAL_WRAP_KEY_ID/);
    assert.match(credentials, /SIGNING_CREDENTIAL_WRAP_KEY/);
    assert.match(credentials, /SIGNING_CREDENTIAL_WRAP_PREVIOUS_KEYS/);
    assert.match(credentials, /class SigningCredentialWrapConfigError/);
    // Keyring resolution happens before any credential row is written.
    assert.match(
      credentials,
      /const keyring = resolveCredentialWrapKeyring\(\);/,
    );
  });

  it("binds wrapped bearers to their row through AAD and a named key version", () => {
    assert.match(credentials, /cipher\.setAAD\(buildCredentialWrapAad\(/);
    assert.match(credentials, /decipher\.setAAD\(buildCredentialWrapAad\(/);
    assert.match(
      credentials,
      /requireContextPart\(context\.credentialId, "credential id"\)/,
    );
    assert.match(credentials, /requireWrapKeyId\(wrapKeyId, "wrap key id"\)/);

    // The credential id exists before wrapping so it can be part of the AAD.
    assert.match(credentials, /const credentialId = randomUUID\(\);/);
    assert.match(credentials, /id: credentialId,/);
    assert.match(credentials, /wrap_key_id: wrapKeyId,/);

    // Unwrap selects the key by the id recorded on the row.
    assert.match(credentials, /wrapKeyId: data\.wrap_key_id as string \| null/);
    assert.match(
      credentials,
      /signingParticipantId: data\.signing_participant_id as string/,
    );

    assert.match(wrapMigration, /add column if not exists token_wrapped text/);
    assert.match(wrapKeyMigration, /add column if not exists wrap_key_id text/);
    assert.match(wrapKeyMigration, /spc_wrapped_requires_key_id/);
    assert.match(wrapKeyMigration, /spc_wrap_key_id_shape/);
  });

  it("keeps credentials unusable until the Signing is In Progress", () => {
    assert.match(credentials, /signing\.lifecycle_state !== "IN_PROGRESS"/);
    assert.match(credentials, /credential\.revoked_at/);
    assert.match(credentials, /credential\.is_current !== true/);
  });

  it("authenticates on token_hash only and never decrypts to authenticate", () => {
    const validate = credentials.slice(
      credentials.indexOf("export async function validateParticipantCredential"),
      credentials.indexOf("/** Constant-time hash comparison"),
    );
    assert.ok(validate.length > 0);
    assert.match(validate, /hashParticipantCredentialToken\(rawToken\)/);
    assert.doesNotMatch(validate, /token_wrapped/);
    assert.doesNotMatch(validate, /unwrap/);
    assert.doesNotMatch(validate, /wrap_key_id/);
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
    assert.match(activation, /appendSigningEvent/);
    assert.match(activation, /eventType: "SIGNING_ACTIVATED"/);
    assert.match(activation, /visibility: "BUSINESS"/);
    assert.match(activation, /remote signing/);
    assert.match(activation, /in-person signing/);

    const eventAppend = activation.slice(
      activation.indexOf("await appendSigningEvent"),
      activation.indexOf("const activatedAt"),
    );
    assert.ok(eventAppend.length > 0);
    assert.doesNotMatch(eventAppend, /rawToken/);
    assert.doesNotMatch(eventAppend, /token/);
    assert.doesNotMatch(activation, /\.from\("signing_events"\)\s*\.insert/);
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
      /Signing email provider is not configured; message was not sent/,
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
