import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { deriveTypedInitialsFromDisplayName } from "./adopted-marks";
import {
  buildClearedSigningCeremonyCookieAttributes,
  buildSigningCeremonyCookieAttributes,
  generateCeremonySessionToken,
  hashCeremonySessionToken,
  isWellFormedCeremonySessionToken,
  SIGNING_CEREMONY_COOKIE_NAME,
  SIGNING_CEREMONY_COOKIE_PATH,
  SIGNING_CEREMONY_INACTIVITY_MINUTES,
} from "./browser-sessions";
import { consentDisclosureFingerprint } from "./consent-disclosure";
import {
  buildSigningHandoffCookieAttributes,
  generateInPersonHandoffToken,
  hashInPersonHandoffToken,
  isWellFormedInPersonHandoffToken,
  SIGNING_HANDOFF_COOKIE_NAME,
  SIGNING_HANDOFF_COOKIE_PATH,
  SIGNING_HANDOFF_TTL_MINUTES,
} from "./in-person-handoff";
import {
  SIGNING_PRESENCE_HEARTBEAT_SECONDS,
  SIGNING_PRESENCE_LEASE_TTL_SECONDS,
} from "./presence";
import { NATIVE_SIGNING_CEREMONY_MIGRATIONS } from "./stage1-schema";

const root = process.cwd();
// Newlines are normalized so ordering assertions can match multi-line call
// chains regardless of the checkout's line endings.
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("Native Signing ceremony sessions, presence, and consent", () => {
  const foundationMigration = read(
    `supabase/migrations/${NATIVE_SIGNING_CEREMONY_MIGRATIONS[0]}.sql`,
  );
  const fingerprintMigration = read(
    `supabase/migrations/${NATIVE_SIGNING_CEREMONY_MIGRATIONS[1]}.sql`,
  );
  const browserSessions = read("lib/signing/browser-sessions.ts");
  const presence = read("lib/signing/presence.ts");
  const consent = read("lib/signing/consent-disclosure.ts");
  const affirmation = read("lib/signing/ceremony-affirmation.ts");
  const handoff = read("lib/signing/in-person-handoff.ts");
  const actions = read("lib/signing/ceremony-actions.ts");
  const entrySessions = read("lib/signing/entry-sessions.ts");

  it("stores only a session token hash, never the ceremony secret", () => {
    const token = generateCeremonySessionToken();
    assert.ok(isWellFormedCeremonySessionToken(token));
    assert.notEqual(token, generateCeremonySessionToken());

    const hash = hashCeremonySessionToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.notEqual(hash, token);
    assert.equal(hash, hashCeremonySessionToken(token));

    for (const bogus of [null, undefined, "", "short", `${token}extra`, 7]) {
      assert.equal(isWellFormedCeremonySessionToken(bogus), false);
    }

    assert.match(foundationMigration, /session_token_hash text not null/);
    assert.match(foundationMigration, /sbs_session_token_hash_hex/);
    assert.doesNotMatch(foundationMigration, /session_token text/);
    assert.match(
      browserSessions,
      /session_token_hash: hashCeremonySessionToken/,
    );
  });

  it("scopes the ceremony cookie to /sign and never to the workspace", () => {
    const cookie = buildSigningCeremonyCookieAttributes({
      rawSessionToken: generateCeremonySessionToken(),
    });
    assert.equal(cookie.name, "hf_signing_ceremony");
    assert.equal(SIGNING_CEREMONY_COOKIE_NAME, "hf_signing_ceremony");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.path, "/sign");
    assert.equal(SIGNING_CEREMONY_COOKIE_PATH, "/sign");
    assert.equal(
      cookie.maxAge,
      SIGNING_CEREMONY_INACTIVITY_MINUTES * 60,
    );

    const cleared = buildClearedSigningCeremonyCookieAttributes();
    assert.equal(cleared.maxAge, 0);
    assert.equal(cleared.value, "");

    // The ceremony cookie is a separate name from the Stage 4 entry cookie.
    assert.notEqual(SIGNING_CEREMONY_COOKIE_NAME, "hf_signing_entry");
  });

  it("uses the approved 60-minute meaningful-activity inactivity window", () => {
    assert.equal(SIGNING_CEREMONY_INACTIVITY_MINUTES, 60);
    assert.match(
      browserSessions,
      /export async function recordMeaningfulCeremonyActivity/,
    );
    assert.match(browserSessions, /last_meaningful_activity_at: nowIso/);
    assert.match(browserSessions, /inactivity_expires_at: inactivityExpiresAt/);
    // A timed-out session cannot extend itself.
    assert.match(browserSessions, /\.gt\("inactivity_expires_at", nowIso\)/);
    assert.match(foundationMigration, /last_meaningful_activity_at timestamptz/);
    assert.match(foundationMigration, /inactivity_expires_at timestamptz/);
  });

  it("renews presence by heartbeat without touching the inactivity deadline", () => {
    assert.ok(SIGNING_PRESENCE_LEASE_TTL_SECONDS >= 120);
    assert.ok(SIGNING_PRESENCE_LEASE_TTL_SECONDS <= 300);
    assert.ok(
      SIGNING_PRESENCE_HEARTBEAT_SECONDS < SIGNING_PRESENCE_LEASE_TTL_SECONDS,
    );

    // renewPresenceLease writes only lease columns.
    const renew = presence.slice(
      presence.indexOf("export async function renewPresenceLease"),
      presence.indexOf("export async function releasePresenceLeasesForSession"),
    );
    assert.match(renew, /renewed_at:/);
    assert.match(renew, /expires_at:/);
    assert.doesNotMatch(renew, /last_meaningful_activity_at/);
    assert.doesNotMatch(renew, /inactivity_expires_at/);

    // The heartbeat action renews presence and nothing else.
    const heartbeat = actions.slice(
      actions.indexOf("export async function ceremonyHeartbeatAction"),
    );
    assert.match(heartbeat, /renewPresenceLease/);
    assert.doesNotMatch(heartbeat, /recordMeaningfulCeremonyActivity/);
  });

  it("keeps exactly one ACTIVE ceremony session per participant", () => {
    assert.match(
      foundationMigration,
      /create unique index if not exists sbs_one_active_per_participant_uidx[\s\S]*?where status = 'ACTIVE'/,
    );
    assert.match(
      browserSessions,
      /export async function supersedeActiveCeremonySessions/,
    );
    // Supersession releases the prior lease and records the successor.
    assert.match(browserSessions, /releasePresenceLeasesForSession/);
    assert.match(browserSessions, /superseded_by_session_id: sessionId/);
    assert.match(browserSessions, /"SUPERSEDED_BY_NEW_SESSION"/);
    // The older tab is told it was superseded rather than getting a bare error.
    assert.match(browserSessions, /code: "SESSION_SUPERSEDED"/);
    assert.match(browserSessions, /code: "SESSION_EXPIRED"/);
  });

  it("terminates the entry session when ceremony authority is created", () => {
    assert.match(
      entrySessions,
      /export async function revokeSigningEntrySessionById/,
    );
    assert.match(browserSessions, /revokeSigningEntrySessionById/);
    assert.match(browserSessions, /"SUPERSEDED_BY_CEREMONY_SESSION"/);
    // Entry revocation happens before the new session exists, so a failure
    // cannot leave a usable entry cookie beside a ceremony session.
    assert.ok(
      browserSessions.indexOf("revokeSigningEntrySessionById") <
        browserSessions.indexOf('.from("signing_browser_sessions")\n    .insert'),
    );
    assert.match(affirmation, /entrySessionIdToTerminate: entry\.sessionId/);
  });

  it("starts presence only at identity affirmation", () => {
    assert.match(affirmation, /acquirePresenceLease/);
    assert.match(affirmation, /IDENTITY_AFFIRMED/);
    // Presence rows are owned by the ceremony session, not the entry session.
    assert.match(foundationMigration, /signing_browser_session_id uuid not null/);
    assert.match(
      foundationMigration,
      /create unique index if not exists sppl_one_open_per_participant_uidx/,
    );
    // The pre-affirmation shell never acquires presence.
    const continuePage = read("app/sign/continue/page.tsx");
    assert.doesNotMatch(continuePage, /acquirePresenceLease/);
  });

  it("re-validates credential, handoff, Signing, and participant on every read", () => {
    assert.match(browserSessions, /signing\.lifecycle_state !== "IN_PROGRESS"/);
    assert.match(
      browserSessions,
      /participant\.participant_status === "REMOVED"/,
    );
    assert.match(browserSessions, /credential\.is_current !== true/);
    assert.match(browserSessions, /handoff\.revoked_at/);
  });

  it("issues single-use, hash-only in-person handoffs", () => {
    const token = generateInPersonHandoffToken();
    assert.ok(isWellFormedInPersonHandoffToken(token));
    assert.match(hashInPersonHandoffToken(token), /^[0-9a-f]{64}$/);
    assert.notEqual(hashInPersonHandoffToken(token), token);
    assert.equal(isWellFormedInPersonHandoffToken("nope"), false);

    const cookie = buildSigningHandoffCookieAttributes({
      rawHandoffToken: token,
    });
    assert.equal(cookie.name, "hf_signing_handoff");
    assert.equal(SIGNING_HANDOFF_COOKIE_NAME, "hf_signing_handoff");
    assert.equal(SIGNING_HANDOFF_COOKIE_PATH, "/sign");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "lax");
    assert.ok(SIGNING_HANDOFF_TTL_MINUTES <= 60);

    assert.match(foundationMigration, /handoff_token_hash text not null/);
    assert.match(foundationMigration, /siph_token_hash_hex/);
    assert.match(handoff, /export async function consumeInPersonHandoff/);
    assert.match(handoff, /\.is\("consumed_at", null\)/);
    // A new handoff ends the prior participant session on that device.
    assert.match(handoff, /supersedeActiveCeremonySessions/);
    assert.match(handoff, /"IN_PERSON_HANDOFF_ISSUED"/);
    assert.match(handoff, /SUPERSEDED_BY_NEW_HANDOFF/);
  });

  it("records consent as version plus content fingerprint", () => {
    const fingerprint = consentDisclosureFingerprint("disclosure body");
    assert.match(fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(
      fingerprint,
      consentDisclosureFingerprint("disclosure body"),
    );
    assert.notEqual(fingerprint, consentDisclosureFingerprint("other body"));

    assert.match(consent, /consent_disclosure_version_id: current\.id/);
    assert.match(consent, /consent_content_sha256: current\.contentSha256/);
    // Load-time verification: a fingerprint that cannot reproduce the accepted
    // text fails closed instead of being trusted.
    assert.match(consent, /INTEGRITY_MISMATCH/);
    assert.match(
      consent,
      /acceptedDisclosureVersionId === currentDisclosure\.id/,
    );
    assert.match(
      consent,
      /acceptedContentSha256 === currentDisclosure\.contentSha256/,
    );

    assert.match(
      foundationMigration,
      /create table if not exists public\.signing_consent_disclosure_versions/,
    );
    assert.match(foundationMigration, /is_production_ready boolean not null default false/);
    assert.match(fingerprintMigration, /encode\(sha256\(convert_to\(v\.body_text, 'UTF8'\)\), 'hex'\)/);
    // Accepted disclosure text is never rewritten under a participant.
    assert.match(fingerprintMigration, /consent_disclosure_version_id = v\.id/);
  });

  it("does not re-require consent after a session timeout when unchanged", () => {
    assert.match(consent, /"SATISFIED"/);
    assert.match(consent, /"NEVER_ACCEPTED"/);
    assert.match(consent, /"DISCLOSURE_CHANGED"/);
    const context = read("lib/signing/ceremony-context.ts");
    assert.match(context, /nextStep = "CONSENT"/);
    assert.match(context, /!consent\.satisfied/);
  });

  it("derives typed initials from the displayed name, exact match only", () => {
    assert.equal(deriveTypedInitialsFromDisplayName("Jane Q Public"), "JQP");
    assert.equal(deriveTypedInitialsFromDisplayName("Mary-Jane Smith"), "MS");
    assert.equal(deriveTypedInitialsFromDisplayName("  lee   harbaugh "), "LH");
    assert.equal(deriveTypedInitialsFromDisplayName("Ann Boleyn 3rd"), "AB");
    assert.equal(deriveTypedInitialsFromDisplayName(""), "");

    const marks = read("lib/signing/adopted-marks.ts");
    assert.match(marks, /typedText !== expected/);
    assert.match(marks, /deriveTypedInitialsFromDisplayName\(context\.displayedName\)/);
    assert.match(marks, /context\.displayedName\.trim\(\)/);
    // Exact match only: no name detection in the prepared PDF.
    assert.match(marks, /exact-match only/);
  });

  it("never logs a ceremony, entry, or handoff token", () => {
    for (const source of [
      browserSessions,
      presence,
      consent,
      affirmation,
      handoff,
      actions,
    ]) {
      assert.doesNotMatch(source, /console\.log/);
      const logCalls = source.match(/console\.error\([\s\S]*?\);/g) ?? [];
      for (const call of logCalls) {
        assert.doesNotMatch(call, /token|Token|raw/);
      }
    }
  });
});
