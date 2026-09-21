/**
 * Native Signing recovery credential/session access gate tests.
 * Source-boundary + pure helper coverage (no live DB).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  isCredentialEpochCurrent,
  PRE_RECOVERY_ACCESS_EPOCH_SENTINEL,
  SIGNING_ACCESS_SUSPENDED_ENV,
} from "./external-access";
import { NATIVE_SIGNING_RECOVERY_ACCESS_MIGRATIONS } from "./stage1-schema";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("Native Signing recovery access gate", () => {
  const migration = read(
    `supabase/migrations/${NATIVE_SIGNING_RECOVERY_ACCESS_MIGRATIONS[0]}.sql`,
  );
  const externalAccess = read("lib/signing/external-access.ts");
  const credentials = read("lib/signing/credentials.ts");
  const entrySessions = read("lib/signing/entry-sessions.ts");
  const browserSessions = read("lib/signing/browser-sessions.ts");
  const completedCreds = read("lib/signing/completed-package-credentials.ts");
  const completedSessions = read("lib/signing/completed-package-sessions.ts");
  const handoff = read("lib/signing/in-person-handoff.ts");
  const deviceLock = read("lib/signing/device-handoff-lock.ts");
  const delivery = read("lib/signing/delivery.ts");
  const completedDelivery = read("lib/signing/completed-package-delivery.ts");
  const finalization = read("lib/signing/finalization-worker.ts");

  it("migration seeds access controls fail-closed for old rows", () => {
    assert.equal(
      NATIVE_SIGNING_RECOVERY_ACCESS_MIGRATIONS[0],
      "20260920180000_native_signing_recovery_access",
    );
    assert.match(migration, /access_suspended boolean not null default true/);
    assert.match(migration, /access_epoch text/);
    assert.match(migration, /pre-recovery-access-v0/);
    assert.match(migration, /signing_access_epoch_immutable/);
    assert.match(migration, /access_suspended = false/);
    assert.match(
      migration,
      /production\/restore must set true|PRODUCTION \/ RESTORE/i,
    );
    const guardMigration = read(
      `supabase/migrations/${NATIVE_SIGNING_RECOVERY_ACCESS_MIGRATIONS[1]}.sql`,
    );
    assert.match(guardMigration, /signing_access_epoch_history/);
    assert.match(guardMigration, /retired epoch/i);
    assert.match(guardMigration, /ssc_access_controls_guard/);
    assert.match(guardMigration, /cannot be deleted/);
    for (const table of [
      "signing_participant_credentials",
      "signing_entry_sessions",
      "signing_browser_sessions",
      "signing_completed_package_credentials",
      "signing_completed_package_sessions",
      "signing_in_person_handoffs",
      "signing_device_handoff_locks",
    ]) {
      assert.match(
        migration,
        new RegExp(`alter table public\\.${table}[\\s\\S]*access_epoch`),
      );
    }
  });

  it("exposes env OR DB suspension and epoch helpers", () => {
    assert.equal(SIGNING_ACCESS_SUSPENDED_ENV, "SIGNING_ACCESS_SUSPENDED");
    assert.equal(
      PRE_RECOVERY_ACCESS_EPOCH_SENTINEL,
      "pre-recovery-access-v0",
    );
    assert.match(externalAccess, /getSigningExternalAccessState/);
    assert.match(externalAccess, /assertSigningExternalAccessActive/);
    assert.match(externalAccess, /requireIssuanceAccessEpoch/);
    assert.match(externalAccess, /bumpSigningAccessEpoch/);
    assert.match(externalAccess, /setSigningAccessSuspended/);
    assert.match(externalAccess, /Missing controls row/);
    assert.match(externalAccess, /access_suspended: true/);
    assert.match(
      externalAccess,
      /SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE/,
    );
  });

  it("isCredentialEpochCurrent compares trimmed epochs", () => {
    assert.equal(isCredentialEpochCurrent("epoch-a", "epoch-a"), true);
    assert.equal(isCredentialEpochCurrent(" epoch-a ", "epoch-a"), true);
    assert.equal(isCredentialEpochCurrent("epoch-a", "epoch-b"), false);
    assert.equal(
      isCredentialEpochCurrent(PRE_RECOVERY_ACCESS_EPOCH_SENTINEL, "epoch-a"),
      false,
    );
    assert.equal(isCredentialEpochCurrent(null, "epoch-a"), false);
    assert.equal(isCredentialEpochCurrent("epoch-a", null), false);
    assert.equal(isCredentialEpochCurrent("", "epoch-a"), false);
  });

  it("wires issuance to requireIssuanceAccessEpoch and stamps access_epoch", () => {
    for (const source of [
      credentials,
      entrySessions,
      browserSessions,
      completedCreds,
      completedSessions,
      handoff,
      deviceLock,
    ]) {
      assert.match(source, /requireIssuanceAccessEpoch/);
      assert.match(source, /access_epoch:/);
    }
  });

  it("wires validation: suspension before epoch before revoke/lifecycle", () => {
    for (const [label, source, validateFn] of [
      ["credentials", credentials, "validateParticipantCredential"],
      ["entry", entrySessions, "validateSigningEntrySession"],
      ["browser", browserSessions, "resolveCeremonyBrowserSession"],
      ["completed-cred", completedCreds, "validateCompletedPackageCredential"],
      ["completed-session", completedSessions, "validateCompletedPackageSession"],
      ["handoff", handoff, "validateInPersonHandoff"],
      ["device-lock", deviceLock, "validateDeviceHandoffLock"],
    ] as const) {
      const start = source.indexOf(`export async function ${validateFn}`);
      assert.ok(start >= 0, `${label}: missing ${validateFn}`);
      const body = source.slice(start, start + 1800);
      const suspensionAt = body.indexOf("assertSigningExternalAccessActive");
      const epochAt = Math.max(
        body.indexOf("isCredentialEpochCurrent"),
        body.indexOf("finalizeValidatedParticipantCredential"),
        body.indexOf("finalizeValidatedCompletedPackageCredential"),
      );
      assert.ok(suspensionAt >= 0, `${label}: missing suspension check`);
      assert.ok(epochAt > suspensionAt, `${label}: epoch must follow suspension`);
      // Look for the runtime revoke/lifecycle gate (not column names in .select()).
      const revokeGateAt = body.search(
        /if \([^)]*revoked_at|is_current !== true|consumed_at \|\| handoff\.revoked_at|data\.released_at\)/,
      );
      if (revokeGateAt >= 0) {
        assert.ok(
          epochAt < revokeGateAt,
          `${label}: epoch must precede revoke/lifecycle gate`,
        );
      }
    }
  });

  it("parks invitation and completed-package email on access suspension", () => {
    assert.match(delivery, /getSigningExternalAccessState/);
    assert.match(
      delivery,
      /Signing external access is suspended; invitation was not sent/,
    );
    assert.match(delivery, /next_attempt_at: new Date\(Date\.now\(\) \+ 300_000\)/);
    assert.match(completedDelivery, /getSigningExternalAccessState/);
    assert.match(
      completedDelivery,
      /Signing external access is suspended/,
    );
    assert.match(completedDelivery, /retryDelaySeconds: 300/);
    // Finalization must NOT gate on access suspension alone.
    assert.doesNotMatch(finalization, /getSigningExternalAccessState/);
    assert.doesNotMatch(finalization, /SIGNING_ACCESS_SUSPENDED/);
    assert.match(finalization, /isSigningWorkSuspended/);
  });

  it("clears device handoff cookies on unavailable and escape return-to-agent", () => {
    const unavailable = read("app/sign/unavailable/route.ts");
    const returnToAgent = read("app/sign/return-to-agent/page.tsx");
    assert.match(unavailable, /buildClearedDeviceHandoffLockCookieAttributes/);
    assert.match(unavailable, /buildClearedDeviceHandoffActiveCookieAttributes/);
    assert.match(returnToAgent, /redirect\("\/sign\/unavailable"\)/);
  });
});
