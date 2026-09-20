import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildParticipantInviteUrl } from "./delivery";
import {
  buildSigningEntryCookieAttributes,
  generateSigningEntrySessionToken,
  hashSigningEntrySessionToken,
  isWellFormedSigningEntrySessionToken,
  SIGNING_ENTRY_COOKIE_NAME,
  SIGNING_ENTRY_COOKIE_PATH,
  SIGNING_ENTRY_SESSION_TTL_MINUTES,
} from "./entry-sessions";
import { NATIVE_SIGNING_STAGE4_MIGRATIONS } from "./stage1-schema";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

describe("Native Signing Stage 4 participant entry exchange", () => {
  const migration = read(
    `supabase/migrations/${NATIVE_SIGNING_STAGE4_MIGRATIONS[3]}.sql`,
  );
  const sessions = read("lib/signing/entry-sessions.ts");
  const exchangeRoute = read("app/sign/[token]/route.ts");
  const continuePage = read("app/sign/continue/page.tsx");
  const signLayout = read("app/sign/layout.tsx");
  const nextConfig = read("next.config.ts");

  it("stores only a session token hash, never the session secret", () => {
    const token = generateSigningEntrySessionToken();
    assert.ok(isWellFormedSigningEntrySessionToken(token));
    assert.notEqual(token, generateSigningEntrySessionToken());

    const hash = hashSigningEntrySessionToken(token);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.notEqual(hash, token);
    assert.equal(hash, hashSigningEntrySessionToken(token));

    for (const bogus of [null, undefined, "", "short", `${token}extra`, 42]) {
      assert.equal(isWellFormedSigningEntrySessionToken(bogus), false);
    }

    assert.match(migration, /session_token_hash text not null/);
    assert.match(migration, /ses_session_token_hash_hex/);
    assert.match(migration, /\^\[0-9a-f\]\{64\}\$/);
    assert.doesNotMatch(migration, /session_token text/);
    assert.match(sessions, /session_token_hash: hashSigningEntrySessionToken/);
  });

  it("adds signing_entry_sessions additively with deny-by-default browser access", () => {
    assert.match(
      migration,
      /create table if not exists public\.signing_entry_sessions/,
    );
    assert.match(migration, /force row level security/);
    assert.match(migration, /using \(false\) with check \(false\)/);
    assert.match(
      migration,
      /revoke all on table public\.%I from authenticated/,
    );
    assert.doesNotMatch(migration, /on delete cascade/i);
    // Same-Signing pointers for both the participant and the credential.
    assert.match(migration, /ses_participant_same_signing_fkey/);
    assert.match(migration, /ses_credential_same_signing_fkey/);
    assert.match(migration, /expires_at timestamptz not null/);
    assert.match(migration, /revoked_at timestamptz/);
    // Access plumbing, explicitly not evidence.
    assert.match(migration, /not participant ceremony evidence/);
  });

  it("keeps the invitation link on /sign/{token} and exchanges it on open", () => {
    const url = buildParticipantInviteUrl("Zm9vYmFy");
    assert.match(url, /\/sign\/Zm9vYmFy$/);
    assert.doesNotMatch(url, /\?/);

    assert.match(exchangeRoute, /validateParticipantCredential/);
    assert.match(exchangeRoute, /createSigningEntrySession/);
    assert.match(exchangeRoute, /Location: CONTINUE_PATH/);
    assert.match(exchangeRoute, /status: 303/);
    assert.match(exchangeRoute, /"\/sign\/continue"/);
    assert.match(exchangeRoute, /buildSigningEntryCookieAttributes/);
    // Failures use a generic unavailable response (no epoch/token leakage).
    assert.match(exchangeRoute, /status: 503/);
    assert.match(
      exchangeRoute,
      /SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE/,
    );
    assert.match(exchangeRoute, /isNativeSigningEnabled/);
  });

  it("issues an HttpOnly, Secure, SameSite=Lax cookie scoped to /sign", () => {
    const cookie = buildSigningEntryCookieAttributes({
      rawSessionToken: generateSigningEntrySessionToken(),
    });
    assert.equal(cookie.name, "hf_signing_entry");
    assert.equal(SIGNING_ENTRY_COOKIE_NAME, "hf_signing_entry");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.path, "/sign");
    assert.equal(SIGNING_ENTRY_COOKIE_PATH, "/sign");
    assert.equal(cookie.maxAge, SIGNING_ENTRY_SESSION_TTL_MINUTES * 60);
    // Short-lived: 15-60 minutes, never an open-ended session.
    assert.ok(SIGNING_ENTRY_SESSION_TTL_MINUTES >= 15);
    assert.ok(SIGNING_ENTRY_SESSION_TTL_MINUTES <= 60);
    assert.match(sessions, /ttlMinutes < 1 \|\| ttlMinutes > 60/);
  });

  it("re-validates the session, the Signing state, and the credential on every read", () => {
    assert.match(continuePage, /SIGNING_ENTRY_COOKIE_NAME/);
    assert.match(continuePage, /validateSigningEntrySession/);
    // The continue page never accepts a bearer from the URL.
    assert.doesNotMatch(continuePage, /params/);
    assert.doesNotMatch(continuePage, /searchParams/);

    assert.match(sessions, /session\.revoked_at/);
    assert.match(sessions, /new Date\(expiresAt\)\.getTime\(\) <= Date\.now\(\)/);
    assert.match(sessions, /signing\.lifecycle_state !== "IN_PROGRESS"/);
    assert.match(sessions, /credential\.is_current !== true/);
    assert.match(sessions, /participant\.participant_status === "REMOVED"/);
    assert.match(
      sessions,
      /export async function revokeSigningEntrySessionsForCredential/,
    );
  });

  it("never logs the credential token or the session secret", () => {
    for (const source of [exchangeRoute, continuePage, sessions]) {
      assert.doesNotMatch(source, /console\.log/);
      const logCalls = source.match(/console\.error\([\s\S]*?\)/g) ?? [];
      for (const call of logCalls) {
        assert.doesNotMatch(call, /token|Token|session\.raw/);
      }
    }
    assert.doesNotMatch(sessions, /rawSessionToken[^)]*console/);
  });

  it("suppresses referrers and caching for every /sign response", () => {
    assert.match(nextConfig, /source: "\/sign\/:path\*"/);
    assert.match(nextConfig, /"Referrer-Policy", value: "no-referrer"/);
    assert.match(nextConfig, /"Cache-Control", value: "no-store"/);
    assert.match(signLayout, /name="referrer" content="no-referrer"/);
    assert.match(exchangeRoute, /"Referrer-Policy": "no-referrer"/);
    assert.match(exchangeRoute, /"Cache-Control": "no-store"/);
  });
});
