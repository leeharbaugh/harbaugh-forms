import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SIGNING_CEREMONY_COOKIE_NAME } from "./browser-sessions";
import { SIGNING_ENTRY_COOKIE_NAME } from "./entry-sessions";
import { SIGNING_HANDOFF_COOKIE_NAME } from "./in-person-handoff";
import {
  NATIVE_SIGNING_CEREMONY_MIGRATIONS,
  NATIVE_SIGNING_CEREMONY_TABLES,
} from "./stage1-schema";

const root = process.cwd();
// Newlines are normalized so ordering assertions can match multi-line call
// chains regardless of the checkout's line endings.
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("Native Signing ceremony boundaries", () => {
  const migration = read(
    `supabase/migrations/${NATIVE_SIGNING_CEREMONY_MIGRATIONS[0]}.sql`,
  );
  const browserSessions = read("lib/signing/browser-sessions.ts");
  const presence = read("lib/signing/presence.ts");
  const amendmentLocks = read("lib/signing/amendment-locks.ts");
  const context = read("lib/signing/ceremony-context.ts");
  const events = read("lib/signing/ceremony-events.ts");
  const marks = read("lib/signing/adopted-marks.ts");
  const placements = read("lib/signing/placements.ts");
  const finish = read("lib/signing/ceremony-finish.ts");
  const decline = read("lib/signing/ceremony-decline.ts");
  const documents = read("lib/signing/ceremony-documents.ts");
  const actions = read("lib/signing/ceremony-actions.ts");
  const agentActions = read("lib/signing/ceremony-agent-actions.ts");
  const affirmation = read("lib/signing/ceremony-affirmation.ts");
  const continuePage = read("app/sign/continue/page.tsx");
  const ceremonyPage = read("app/sign/ceremony/page.tsx");
  const documentRoute = read(
    "app/sign/ceremony/document/[revisionDocumentId]/route.ts",
  );
  const handoffRoute = read("app/sign/in-person/[token]/route.ts");
  const deviceLockMigration = read(
    `supabase/migrations/${NATIVE_SIGNING_CEREMONY_MIGRATIONS[2]}.sql`,
  );
  const proxy = read("lib/supabase/proxy.ts");
  const returnToAgentPage = read("app/sign/return-to-agent/page.tsx");
  const deviceLockLib = read("lib/signing/device-handoff-lock.ts");
  const inPersonHandoffLib = read("lib/signing/in-person-handoff.ts");
  const errors = read("lib/signing/errors.ts");

  it("declares exactly the additive ceremony tables the migration creates", () => {
    assert.deepEqual(NATIVE_SIGNING_CEREMONY_TABLES, [
      "signing_consent_disclosure_versions",
      "signing_in_person_handoffs",
      "signing_browser_sessions",
      "signing_participant_presence_leases",
      "signing_amendment_locks",
      "signing_device_handoff_locks",
    ]);
    for (const table of NATIVE_SIGNING_CEREMONY_TABLES) {
      const source =
        table === "signing_device_handoff_locks" ? deviceLockMigration : migration;
      assert.match(
        source,
        new RegExp(`create table if not exists public\\.${table}\\b`),
      );
    }
    // Nothing Stage 1 evidence-bearing is redefined here.
    for (const evidenceTable of [
      "signing_adopted_marks",
      "signing_field_placements",
      "signing_events",
      "signing_document_versions",
    ]) {
      assert.doesNotMatch(
        migration,
        new RegExp(`create table[^;]*public\\.${evidenceTable}\\b`),
      );
    }
  });

  it("keeps every ceremony table deny-by-default and restrict-on-delete", () => {
    assert.match(migration, /enable row level security/);
    assert.match(migration, /force row level security/);
    assert.match(migration, /using \(false\) with check \(false\)/);
    assert.match(migration, /account_state_application_gate/);
    assert.match(migration, /revoke all on table public\.%I from authenticated/);
    assert.match(migration, /revoke all on table public\.%I from anon/);
    assert.doesNotMatch(migration, /on delete cascade/i);
    // Same-Signing composite pointers, as in every earlier Signing stage.
    assert.match(migration, /siph_participant_same_signing_fkey/);
    assert.match(migration, /sbs_participant_same_signing_fkey/);
    assert.match(migration, /sbs_credential_same_signing_fkey/);
    assert.match(migration, /sbs_handoff_same_signing_fkey/);
    assert.match(migration, /sppl_session_same_signing_fkey/);
    assert.match(migration, /sal_revision_same_signing_fkey/);
    // Hash-only secrets.
    assert.match(migration, /sbs_session_token_hash_hex/);
    assert.match(migration, /siph_token_hash_hex/);
  });

  it("routes every ceremony write through the ceremony session, not the entry session", () => {
    // Identity affirmation is the only place an entry session is read, and it
    // exists to retire it.
    for (const source of [
      marks,
      placements,
      finish,
      decline,
      documents,
      context,
      presence,
    ]) {
      assert.doesNotMatch(source, /entry-sessions/);
      assert.doesNotMatch(source, /SIGNING_ENTRY_COOKIE_NAME/);
    }
    assert.match(affirmation, /validateSigningEntrySession/);
    assert.match(browserSessions, /revokeSigningEntrySessionById/);

    // Every write action resolves the ceremony cookie and revalidates.
    assert.match(actions, /function readCeremonyCookie/);
    assert.match(actions, /SIGNING_CEREMONY_COOKIE_NAME/);
    assert.match(actions, /requireCeremonyBrowserSession/);
    assert.match(actions, /requireCeremonyWriteContext/);
    // The entry cookie is referenced only by affirmation.
    const affirmAction = actions.slice(
      actions.indexOf("export async function affirmIdentityAction"),
      actions.indexOf("/** Ceremony read model"),
    );
    assert.match(affirmAction, /SIGNING_ENTRY_COOKIE_NAME/);
    assert.equal(
      actions.split("SIGNING_ENTRY_COOKIE_NAME").length - 1,
      // The import plus the single read inside affirmIdentityAction.
      2,
    );

    // Placements and marks can only be reached with an already-validated
    // ceremony write context.
    assert.match(placements, /context: CeremonyWriteContext/);
    assert.match(marks, /context: CeremonyWriteContext/);
  });

  it("revalidates Signing, participant, lock, revision, and presence per write", () => {
    const guard = context.slice(
      context.indexOf("export async function requireCeremonyWriteContext"),
      context.indexOf("export function resolveActionableRevisionId"),
    );
    assert.match(guard, /"CEREMONY_FORBIDDEN"/);
    assert.match(guard, /"DECLINED"/);
    assert.match(guard, /"ALREADY_FINISHED"/);
    assert.match(guard, /assertNoActiveAmendmentLock/);
    assert.match(guard, /resolveActionableRevisionId/);
    assert.match(guard, /loadRevisionParticipantId/);
    assert.match(guard, /requireValidPresenceForSession/);
    // Signing must still be In Progress: enforced at session resolution.
    assert.match(browserSessions, /lifecycle_state !== "IN_PROGRESS"/);
  });

  it("fails ceremony writes closed while a manager holds an amendment lock", () => {
    assert.match(amendmentLocks, /export async function hasActiveAmendmentLock/);
    assert.match(amendmentLocks, /"AMENDMENT_LOCKED"/);
    assert.match(amendmentLocks, /\.is\("released_at", null\)/);
    assert.match(amendmentLocks, /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/);
    // TC foundation: managers (agent or TC) may acquire/release; never hard-delete.
    assert.match(amendmentLocks, /acquireAmendmentLockWithActor/);
    assert.match(amendmentLocks, /releaseAmendmentLockWithActor/);
    assert.match(amendmentLocks, /held_by_operator_association_id/);
    assert.doesNotMatch(amendmentLocks, /\.delete\(/);
    // Presence remains the predicate acquisition must contend with.
    assert.match(presence, /export async function hasActivePresenceForSigning/);
    assert.match(amendmentLocks, /hasActivePresenceForSigning/);
  });

  it("appends exactly the ceremony event types through signing_events", () => {
    for (const eventType of [
      "IDENTITY_AFFIRMED",
      "CONSENT_ACCEPTED",
      "SIGNATURE_ADOPTED",
      "INITIALS_ADOPTED",
      "PACKAGE_FROZEN",
      "FIELD_PLACEMENT_ACCEPTED",
      "FIELD_PLACEMENT_REMOVED",
      "FIELD_PLACEMENT_REPLACED",
      "PARTICIPANT_FINISHED",
      "PARTICIPANT_DECLINED",
      "SIGNING_DECLINED",
    ]) {
      assert.match(events, new RegExp(`"${eventType}"`));
    }
    assert.match(events, /appendSigningEvent/);
    assert.match(events, /actorType: "PARTICIPANT"/);
    assert.match(events, /actorParticipantId: options\.signingParticipantId/);
    assert.match(events, /packageRevisionId: options\.packageRevisionId/);
    assert.match(events, /idempotencyKey: options\.idempotencyKey/);
    // Append-only: ceremony code never rewrites or deletes Signing history.
    for (const source of [events, marks, placements, finish, decline]) {
      assert.doesNotMatch(source, /from\("signing_events"\)\s*\n?\s*\.update/);
      assert.doesNotMatch(source, /from\("signing_events"\)\s*\n?\s*\.delete/);
    }
    // Heartbeat and navigation are operational state, not history.
    const heartbeat = actions.slice(
      actions.indexOf("export async function ceremonyHeartbeatAction"),
    );
    assert.doesNotMatch(heartbeat, /appendCeremonyEvent/);
  });

  it("carries the ceremony error vocabulary", () => {
    for (const code of [
      "SESSION_EXPIRED",
      "SESSION_SUPERSEDED",
      "CEREMONY_FORBIDDEN",
      "CONSENT_REQUIRED",
      "MARK_LOCKED",
      "ALREADY_FINISHED",
      "DECLINED",
      "AMENDMENT_LOCKED",
      "PRESENCE_REQUIRED",
    ]) {
      assert.match(errors, new RegExp(`\\| "${code}"`));
    }
  });

  it("requires same-origin for every ceremony action", () => {
    assert.match(actions, /function requireSameOriginCeremonyRequest/);
    assert.match(actions, /sec-fetch-site/);
    assert.match(actions, /fetchSite !== "same-origin"/);
    assert.match(actions, /headerStore\.get\("origin"\)/);
    assert.match(actions, /x-forwarded-host/);
    // Fails closed when neither signal is present.
    assert.match(actions, /if \(!origin \|\| !host\)/);

    // Every mutating action asserts it, directly or through the wrapper.
    const wrapped = actions.slice(
      actions.indexOf("async function withCeremonyWriteContext"),
    );
    assert.match(wrapped.slice(0, 1200), /requireSameOriginCeremonyRequest/);
    for (const action of [
      "affirmIdentityAction",
      "finishCeremonyAction",
      "declineCeremonyAction",
      "ceremonyHeartbeatAction",
    ]) {
      const body = actions.slice(
        actions.indexOf(`export async function ${action}`),
      );
      assert.match(body.slice(0, 900), /requireSameOriginCeremonyRequest/);
    }
    // Feature-gated like every other Signing surface.
    assert.match(actions, /assertNativeSigningEnabled/);
    assert.match(continuePage, /isNativeSigningEnabled/);
    assert.match(ceremonyPage, /isNativeSigningEnabled/);
    assert.match(documentRoute, /isNativeSigningEnabled/);
    assert.match(handoffRoute, /isNativeSigningEnabled/);
  });

  it("keeps ceremony cookies distinct, HttpOnly, and scoped to /sign", () => {
    assert.equal(SIGNING_CEREMONY_COOKIE_NAME, "hf_signing_ceremony");
    assert.equal(SIGNING_HANDOFF_COOKIE_NAME, "hf_signing_handoff");
    assert.notEqual(SIGNING_CEREMONY_COOKIE_NAME, SIGNING_ENTRY_COOKIE_NAME);
    assert.notEqual(SIGNING_HANDOFF_COOKIE_NAME, SIGNING_ENTRY_COOKIE_NAME);
    for (const source of [browserSessions, read("lib/signing/in-person-handoff.ts")]) {
      assert.match(source, /httpOnly: true/);
      assert.match(source, /secure: true/);
      assert.match(source, /sameSite: "lax"/);
      assert.match(source, /path: SIGNING_(CEREMONY|HANDOFF)_COOKIE_PATH/);
    }
    // Finish and Decline clear the ceremony cookie instead of leaving it live.
    assert.match(actions, /buildClearedSigningCeremonyCookieAttributes/);
    // The single-use handoff cookie is cleared at affirmation.
    assert.match(actions, /buildClearedSigningHandoffCookieAttributes/);
  });


  it("discloses nothing but identity and official business before affirmation", () => {
    const preAffirmation = context.slice(
      context.indexOf("export async function loadPreAffirmationContext"),
      context.indexOf("export type CeremonyWriteContext"),
    );
    assert.match(preAffirmation, /original_sender_display_name/);
    assert.match(preAffirmation, /from\("organizations"\)/);
    assert.match(preAffirmation, /participant_status === "REMOVED"/);
    assert.doesNotMatch(preAffirmation, /\bemail\b/i);
    assert.doesNotMatch(preAffirmation, /signing_fields|signing_field_placements/);
    assert.doesNotMatch(preAffirmation, /signing_document_versions/);

    // The page shows the participant, the sender, the brokerage, and the title.
    assert.match(continuePage, /context\.participantFullName/);
    assert.match(continuePage, /context\.senderDisplayName/);
    assert.match(continuePage, /context\.brokerageName/);
    assert.match(continuePage, /context\.signingTitle/);
    // No email, no progress, no document list.
    assert.doesNotMatch(continuePage, /\.email|participantEmail/);
    assert.doesNotMatch(
      continuePage,
      /requiredRemaining|acceptedFieldCount|signing_fields/,
    );
    assert.doesNotMatch(
      continuePage,
      /revisionDocumentId|documents\.map|loadCeremonyDocumentBytes/,
    );
  });

  it("serves ceremony PDFs server-side only, behind the ceremony session", () => {
    assert.match(documentRoute, /SIGNING_CEREMONY_COOKIE_NAME/);
    assert.match(documentRoute, /requireCeremonyBrowserSession/);
    assert.match(documentRoute, /loadCeremonyDocumentBytes/);
    assert.match(documentRoute, /"Content-Type": "application\/pdf"/);
    assert.match(documentRoute, /"Cache-Control": "no-store"/);
    assert.match(documentRoute, /"X-Robots-Tag": "noindex, nofollow"/);
    // No signed URL and no public bucket exposure.
    assert.doesNotMatch(documentRoute, /createSignedUrl|getPublicUrl/);
    assert.doesNotMatch(documents, /createSignedUrl|getPublicUrl/);
    // Every failure is a bare 404.
    assert.match(documentRoute, /status: 404/);
    assert.doesNotMatch(documentRoute, /error\.code/);
  });

  it("exchanges the in-person token out of the URL like the entry route", () => {
    assert.match(handoffRoute, /validateInPersonHandoff/);
    assert.match(handoffRoute, /buildSigningHandoffCookieAttributes/);
    assert.match(handoffRoute, /status: 303/);
    assert.match(handoffRoute, /Location: CONTINUE_PATH/);
    assert.match(handoffRoute, /"Referrer-Policy": "no-referrer"/);
    assert.match(handoffRoute, /status: 404/);
    // Validation only here: the token is consumed at affirmation.
    assert.doesNotMatch(handoffRoute, /consumeInPersonHandoff/);
    assert.match(affirmation, /consumeInPersonHandoff/);
  });

  it("locks the agent workspace during in-person handoff until Return-to-Agent", () => {
    assert.match(deviceLockMigration, /sdhl_one_open_per_signing_uidx/);
    assert.match(deviceLockLib, /DEVICE_HANDOFF_LOCK_COOKIE_NAME/);
    assert.match(deviceLockLib, /DEVICE_HANDOFF_LOCK_COOKIE_PATH = "\/"/);
    // Segment boundaries: `/signings` must not match `/sign`.
    assert.match(deviceLockLib, /pathname\.startsWith\("\/sign\/"\)/);
    assert.match(deviceLockLib, /pathname === "\/sign"/);
    assert.match(agentActions, /buildDeviceHandoffLockCookieAttributes/);
    assert.match(agentActions, /buildDeviceHandoffActiveCookieAttributes/);
    assert.match(agentActions, /unlockDeviceHandoffLockAction/);
    assert.match(inPersonHandoffLib, /createDeviceHandoffLock/);
    assert.match(proxy, /DEVICE_HANDOFF_LOCK_COOKIE_NAME/);
    assert.match(proxy, /\/sign\/return-to-agent/);
    assert.match(proxy, /no-store/);
    assert.match(returnToAgentPage, /validateDeviceHandoffLock/);
    assert.match(read("components/sign/return-to-agent-form.tsx"), /unlockDeviceHandoffLockAction/);
    assert.match(read("components/sign/return-to-agent-form.tsx"), /location\.replace/);
    assert.doesNotMatch(returnToAgentPage, /loadCeremonyDocumentBytes/);
    assert.match(actions, /exitCeremonyAction/);
    assert.match(actions, /return-to-agent/);
    assert.match(read("components/device-handoff-bfcache-guard.tsx"), /pageshow/);
  });

  it("authorizes the agent handoff with the ordinary Signing actor checks", () => {
    assert.match(agentActions, /"use server"/);
    assert.match(agentActions, /server-only/);
    assert.match(agentActions, /requireSigningActor/);
    assert.match(agentActions, /createInPersonHandoffWithActor/);
    assert.match(inPersonHandoffLib, /if \(!summary\.canManage\)/);
    assert.match(inPersonHandoffLib, /assertNativeSigningEnabled/);
    assert.match(inPersonHandoffLib, /lifecycleState !== "IN_PROGRESS"/);
    // The raw token is returned once and never logged.
    assert.match(agentActions, /handoffPath: `\/sign\/in-person\/\$\{handoff\.rawHandoffToken\}`/);
    for (const source of [agentActions, inPersonHandoffLib]) {
      assert.doesNotMatch(source, /console\.log/);
    }
    assert.match(inPersonHandoffLib, /Never the token/);
  });

  it("never returns raw database errors to a participant", () => {
    assert.match(actions, /Unexpected Signing error\./);
    assert.match(actions, /code: "INTERNAL"/);
    const handler = actions.slice(
      actions.indexOf("function toActionError"),
      actions.indexOf("Same-origin requirement"),
    );
    assert.match(handler, /error instanceof SigningError/);
    assert.doesNotMatch(handler, /return \{ ok: false, code: "INTERNAL", error: error\.message/);
  });

  it("signals finalization without completing the Signing", () => {
    assert.match(finish, /finalization_condition: "READY"/);
    assert.match(finish, /FINALIZE_SIGNING/);
    assert.doesNotMatch(finish, /"COMPLETE"/);
    assert.doesNotMatch(decline, /"COMPLETE"/);
    // Completed-PDF generation and the audit certificate remain a later stage.
    for (const source of [finish, placements, documents]) {
      assert.doesNotMatch(source, /pdf-lib/);
      assert.doesNotMatch(source, /audit_certificate|auditCertificate/i);
      assert.doesNotMatch(source, /completed-documents|completedDocument/i);
    }
  });
});
