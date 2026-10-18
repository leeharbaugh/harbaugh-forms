import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { assertSigningNotArchived, canArchiveSigning } from "./archive";
import {
  evaluateSigningAuthority,
  type SigningAuthoritySnapshot,
} from "./authority";
import type { SigningOrganizationMembership } from "./eligibility";
import { SigningError } from "./errors";
import { summarizeParticipantAccess } from "./participant-access-status";

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ORG = "org-a";
const LIFECYCLES = ["DRAFT", "IN_PROGRESS", "COMPLETE", "DECLINED", "CANCELLED"];

const member = (
  organizationId = ORG,
  membershipRole: "MEMBER" | "ORG_ADMIN" = "MEMBER",
): SigningOrganizationMembership => ({
  organizationId,
  membershipRole,
  membershipStatus: "ACTIVE",
  organizationStatus: "ACTIVE",
});

function canArchive(
  lifecycleState: string,
  actorUserId: string,
  memberships: SigningOrganizationMembership[],
  overrides: Partial<SigningAuthoritySnapshot> = {},
): boolean {
  const signing: SigningAuthoritySnapshot = {
    signingId: "s1",
    originatingOrganizationId: ORG,
    lifecycleState,
    currentPrimaryAgentAssociationId: "a1",
    originalSenderUserId: OWNER,
    associations: [
      { id: "a1", agentUserId: OWNER, associationRole: "PRIMARY", effectiveEndedAt: null },
    ],
    ...overrides,
  };
  return canArchiveSigning({
    authority: evaluateSigningAuthority({ signing, actorUserId, memberships }),
    lifecycleState,
    originatingOrganizationId: ORG,
    memberships,
  });
}

describe("Archive authority", () => {
  it("lets the primary agent, a co-agent, an active TC and the brokerage administrator archive in every lifecycle state", () => {
    const coAgent = {
      associations: [
        { id: "a1", agentUserId: OWNER, associationRole: "PRIMARY" as const, effectiveEndedAt: null },
        { id: "a2", agentUserId: OTHER, associationRole: "CO_AGENT" as const, effectiveEndedAt: null },
      ],
    };
    const tc = {
      operatorAssociations: [
        {
          id: "o1",
          operatorUserId: OTHER,
          operatorRole: "TRANSACTION_COORDINATOR" as const,
          status: "ACTIVE",
          effectiveEndedAt: null,
          signingOperatorDelegationId: "d1",
        },
      ],
      operatorDelegations: [
        {
          id: "d1",
          organizationId: ORG,
          responsibleUserId: OWNER,
          delegateUserId: OTHER,
          operatorRole: "TRANSACTION_COORDINATOR" as const,
          status: "ACTIVE",
          revokedAt: null,
          effectiveEndedAt: null,
        },
      ],
    };
    for (const state of LIFECYCLES) {
      assert.equal(canArchive(state, OWNER, [member()]), true, state);
      assert.equal(canArchive(state, OTHER, [member()], coAgent), true, state);
      assert.equal(canArchive(state, OTHER, [member()], tc), true, state);
      assert.equal(canArchive(state, OTHER, [member(ORG, "ORG_ADMIN")]), true, state);
    }
  });

  it("denies unrelated users, other brokerages and actors with no membership", () => {
    for (const state of LIFECYCLES) {
      assert.equal(canArchive(state, OTHER, [member()]), false, state);
      assert.equal(canArchive(state, OTHER, [member("org-b", "ORG_ADMIN")]), false, state);
      assert.equal(canArchive(state, OTHER, []), false, state);
    }
  });

  it("is the same rule as rename, with no Global Admin bypass", () => {
    const archive = read("lib/signing/archive.ts");
    assert.match(archive, /export const canArchiveSigning = canRenameSigning;/);
    assert.doesNotMatch(archive, /isGlobalAdmin|GLOBAL_ADMIN|app_role/);
  });
});

describe("Archive implementation", () => {
  const archive = read("lib/signing/archive.ts");
  const archiveBody = archive.slice(
    archive.indexOf("export async function archiveSigningForActor"),
    archive.indexOf("export async function unarchiveSigningForActor"),
  );
  const unarchiveBody = archive.slice(
    archive.indexOf("export async function unarchiveSigningForActor"),
  );
  const loader = archive.slice(
    archive.indexOf("async function loadArchiveBundle"),
    archive.indexOf("export async function archiveSigningForActor"),
  );

  it("fails closed: invalid id, missing Signing → NOT_FOUND, reader without authority → FORBIDDEN", () => {
    assert.match(loader, /assertNativeSigningEnabled\(\)/);
    assert.match(loader, /isUuid\(signingId\)/);
    assert.match(loader, /!bundle \|\| !bundle\.authority\.canRead[\s\S]*NOT_FOUND/);
    assert.match(loader, /canArchiveSigning\([\s\S]*FORBIDDEN/);
  });

  it("authorizes before the elevated archive function runs", () => {
    const authorizeAt = archiveBody.indexOf("loadArchiveBundle(");
    const rpcAt = archiveBody.indexOf('rpc("signing_archive"');
    assert.ok(authorizeAt > 0 && rpcAt > authorizeAt);
  });

  it("never writes lifecycle state", () => {
    assert.doesNotMatch(archive, /\.update\(\{[^}]*lifecycle/);
    assert.equal((archive.match(/\.update\(/g) ?? []).length, 1);
  });

  it("is idempotent: archived/unarchived Signings return without another write or event", () => {
    assert.match(archiveBody, /if \(signing\.archived_at\) \{\s*return getSigningForActor/);
    assert.match(archiveBody, /if \(!result\.already_archived\)/);
    assert.match(unarchiveBody, /if \(!previousArchivedAt\) \{\s*return getSigningForActor/);
    assert.match(unarchiveBody, /if \(updated\)/);
  });

  it("unarchive clears archived_at only and restores no access", () => {
    assert.match(unarchiveBody, /\.update\(\{ archived_at: null \}\)/);
    assert.equal((unarchiveBody.match(/\.from\(/g) ?? []).length, 1);
    assert.doesNotMatch(
      unarchiveBody,
      /credential|handoff|invitation|session|issueParticipant|enqueue/i,
    );
    assert.match(unarchiveBody, /participantAccessRestored: false/);
  });

  it("records SIGNING_ARCHIVED / SIGNING_UNARCHIVED business events without secrets", () => {
    assert.match(archiveBody, /eventType: "SIGNING_ARCHIVED"/);
    assert.match(unarchiveBody, /eventType: "SIGNING_UNARCHIVED"/);
    for (const body of [archiveBody, unarchiveBody]) {
      assert.match(body, /visibility: "BUSINESS"/);
      assert.match(body, /requireSigningEventActorType\(authority\)/);
      assert.doesNotMatch(body, /token|secret|url\b|inviteUrl/i);
    }
    assert.match(archiveBody, /idempotencyKey: `SIGNING_ARCHIVED:\$\{result\.archived_at\}`/);
    assert.match(unarchiveBody, /idempotencyKey: `SIGNING_UNARCHIVED:\$\{previousArchivedAt\}`/);
  });

  it("refuses to issue participant access on an archived Signing", () => {
    assert.throws(
      () => assertSigningNotArchived({ archived_at: "2026-10-12T00:00:00Z" }),
      (error: unknown) => error instanceof SigningError && error.code === "CONFLICT",
    );
    assert.doesNotThrow(() => assertSigningNotArchived({ archived_at: null }));
    assert.doesNotThrow(() => assertSigningNotArchived({}));
  });
});

describe("Archive migration", () => {
  const sql = read("supabase/migrations/20261012120000_native_signing_archive.sql");
  const archiveFn = sql.slice(
    sql.indexOf("create or replace function public.signing_archive"),
    sql.indexOf("revoke all on function public.signing_archive"),
  );

  it("adds a nullable archived_at with no default, so existing rows stay unarchived", () => {
    assert.match(sql, /add column if not exists archived_at timestamptz;/);
    assert.doesNotMatch(sql, /archived_at timestamptz (not null|default)/);
    assert.doesNotMatch(sql, /add column[^;]*archived_by/);
  });

  it("does not add ARCHIVED to lifecycle or touch lifecycle in the archive function", () => {
    assert.doesNotMatch(sql, /'ARCHIVED'/);
    const signingUpdates = archiveFn.match(/update public\.signings\s+set [^;]*;/g) ?? [];
    assert.equal(signingUpdates.length, 1);
    assert.match(signingUpdates[0], /^update public\.signings\s+set archived_at = v_now\s+where id = p_signing_id;$/);
  });

  it("locks the Signing row and revokes access only for In Progress", () => {
    assert.match(archiveFn, /for update;/);
    const revokeAt = archiveFn.indexOf("if v_signing.lifecycle_state = 'IN_PROGRESS' then");
    assert.ok(revokeAt > 0);
    for (const table of [
      "signing_participant_credentials",
      "signing_entry_sessions",
      "signing_in_person_handoffs",
      "signing_participant_presence_leases",
      "signing_browser_sessions",
    ]) {
      const at = archiveFn.indexOf(`update public.${table}`);
      assert.ok(at > revokeAt, table);
    }
    assert.match(archiveFn, /is_current = false,\s*revoked_at = v_now,\s*revoked_reason = 'SIGNING_ARCHIVED'/);
    assert.match(archiveFn, /status = 'REVOKED'/);
  });

  it("never deletes participants, credentials, events or evidence", () => {
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
    assert.doesNotMatch(
      archiveFn,
      /signing_adopted_marks|signing_field_placements|signing_events|signing_package_revisions|signing_artifacts/,
    );
  });

  it("is executable by service_role only", () => {
    assert.match(sql, /revoke all on function public\.signing_archive\(uuid\) from public;/);
    assert.match(sql, /revoke all on function public\.signing_archive\(uuid\) from anon;/);
    assert.match(sql, /revoke all on function public\.signing_archive\(uuid\) from authenticated;/);
    assert.match(sql, /grant execute on function public\.signing_archive\(uuid\) to service_role;/);
  });

  it("guards new access, archived activation and evidence writes under a share lock", () => {
    assert.equal((sql.match(/for share;/g) ?? []).length, 2);
    for (const trigger of [
      "spc_reject_when_archived",
      "ses_reject_when_archived",
      "siph_reject_when_archived",
      "sbs_reject_when_archived",
      "spl_reject_when_archived",
      "signings_reject_archived_activation",
      "signing_field_placements_reject_when_archived",
      "signing_adopted_marks_reject_when_archived",
      "signing_participants_reject_when_archived",
    ]) {
      assert.match(sql, new RegExp(`create trigger ${trigger}\\b`), trigger);
    }
    assert.match(
      sql,
      /old\.lifecycle_state = 'DRAFT'\s*and new\.lifecycle_state = 'IN_PROGRESS'/,
    );
  });
});

describe("Archive evidence guard fix migration", () => {
  const fix = read(
    "supabase/migrations/20261012120100_native_signing_archive_evidence_guard_fix.sql",
  );

  it("reads participant-only columns only for signing_participants rows", () => {
    assert.match(
      fix,
      /if tg_table_name = 'signing_participants' then\s+if new\.participant_status is not distinct from/,
    );
    assert.match(fix, /for share;/);
    assert.match(fix, /v_signing\.lifecycle_state = 'IN_PROGRESS'/);
  });
});

describe("Participant access gates", () => {
  for (const file of [
    "lib/signing/credentials.ts",
    "lib/signing/entry-sessions.ts",
    "lib/signing/browser-sessions.ts",
    "lib/signing/in-person-handoff.ts",
    "lib/signing/ceremony-context.ts",
  ]) {
    it(`${file} rejects archived Signings after the lifecycle check`, () => {
      const source = read(file);
      const lifecycleAt = source.search(/signing\.lifecycle_state !== "IN_PROGRESS"/);
      const archivedAt = source.search(/if \(signing\.archived_at\) return/);
      assert.ok(lifecycleAt > 0, "lifecycle gate");
      assert.ok(archivedAt > lifecycleAt, "archived gate");
      assert.match(source, /lifecycle_state, archived_at/);
    });
  }

  it("manager link, handoff, Send and amendment paths refuse archived Signings", () => {
    const recovery = read("lib/signing/participant-credential-recovery.ts");
    assert.equal((recovery.match(/assertSigningNotArchived\(bundle\.signing\)/g) ?? []).length, 2);
    assert.match(read("lib/signing/activation.ts"), /assertSigningNotArchived\(\s*signing,/);
    assert.match(read("lib/signing/amendment-locks.ts"), /assertSigningNotArchived\(\s*signing,/);
    assert.match(read("lib/signing/in-person-handoff.ts"), /if \(summary\.archivedAt\)/);
  });

  it("leaves Cancel, completed artifacts and participant completed access unaffected", () => {
    for (const file of [
      "lib/signing/cancel.ts",
      "lib/signing/completed-package-authority.ts",
      "lib/signing/completed-package-credentials.ts",
      "lib/signing/completed-package-sessions.ts",
      "app/signings/[signingId]/completed/[artifactId]/route.ts",
    ]) {
      assert.doesNotMatch(read(file), /archived_at|archivedAt/, file);
    }
  });
});

describe("Archive link status", () => {
  it("reports links revoked by archive as revoked, and says why", () => {
    const status = summarizeParticipantAccess(
      "p1",
      [
        {
          signing_participant_id: "p1",
          issued_at: "2026-10-12T00:00:00Z",
          is_current: false,
          revoked_at: "2026-10-12T01:00:00Z",
          revoked_reason: "SIGNING_ARCHIVED",
        },
      ],
      [],
      [],
    );
    assert.equal(status.linkState, "REVOKED");
    assert.equal(status.revokedOnArchive, true);
    assert.equal(status.revokedAt, "2026-10-12T01:00:00Z");
  });

  it("a replacement link after unarchive is ACTIVE and no longer flagged", () => {
    const status = summarizeParticipantAccess(
      "p1",
      [
        {
          signing_participant_id: "p1",
          issued_at: "2026-10-12T00:00:00Z",
          is_current: false,
          revoked_at: "2026-10-12T01:00:00Z",
          revoked_reason: "SIGNING_ARCHIVED",
        },
        {
          signing_participant_id: "p1",
          issued_at: "2026-10-12T02:00:00Z",
          is_current: true,
          revoked_at: null,
          revoked_reason: null,
        },
      ],
      [],
      [],
    );
    assert.equal(status.linkState, "ACTIVE");
    assert.equal(status.revokedOnArchive, false);
  });
});

describe("Archive UI", () => {
  const list = read("components/signings/signings-list-page.tsx");
  const dashboard = read("components/signings/signing-dashboard-page.tsx");

  it("hides archived Signings by default with a Show archived toggle and Archived badge", () => {
    assert.match(list, /useState\(false\)[\s\S]*showArchived/);
    assert.match(list, /signings\.filter\(\(signing\) => !signing\.archivedAt\)/);
    assert.match(list, />\s*Show archived\s*</);
    assert.match(list, />\s*Archived\s*</);
  });

  it("uses the agreed confirmation copy", () => {
    assert.match(dashboard, /"Archive this In Progress Signing\?"/);
    assert.match(
      dashboard,
      /"It will remain In Progress in its history, but all active participant signing links will be revoked\. If you later unarchive it, you will need to issue new participant links before signing can resume\."/,
    );
    assert.match(dashboard, /"Keep Signing Active"/);
    assert.match(dashboard, /"Archive this Signing\?"/);
    assert.match(
      dashboard,
      /"It will be hidden from the default Signings list\. You can unarchive it later\."/,
    );
    assert.match(
      dashboard,
      /Participant access was revoked when this Signing was archived\.\s+Unarchiving does not restore previous signing links\./,
    );
  });

  it("offers Archive / Unarchive and keeps Cancel reachable while archived", () => {
    assert.match(dashboard, /Archive Signing/);
    assert.match(dashboard, /Unarchive Signing/);
    assert.match(dashboard, /\) : isInProgress && canManage \? \(\s*<Button[\s\S]*?Cancel Signing/);
  });

  it("avoids Delete / Void / Disable wording for archive", () => {
    const archiveCopy = dashboard
      .split("\n")
      .filter((line) => /archiv/i.test(line))
      .join("\n");
    assert.doesNotMatch(archiveCopy, /\b(Delete|Inactivate|Disable|Void)\b/);
  });
});
