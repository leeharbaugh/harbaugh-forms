import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  evaluateSigningAuthority,
  type SigningAuthoritySnapshot,
} from "./authority";
import type { SigningOrganizationMembership } from "./eligibility";
import { SigningError } from "./errors";
import {
  assertPacketSigningEligible,
  getPacketSigningEligibility,
  packetSourceEligibility,
  SIGNING_SOURCE_PACKET_STATUS,
} from "./packet-signing-eligibility";
import { canRenameSigning } from "./rename";

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ORG = "org-a";

const member = (
  organizationId = ORG,
  membershipRole: "MEMBER" | "ORG_ADMIN" = "MEMBER",
): SigningOrganizationMembership => ({
  organizationId,
  membershipRole,
  membershipStatus: "ACTIVE",
  organizationStatus: "ACTIVE",
});

const actor = (
  userId: string,
  memberships: SigningOrganizationMembership[] = [member()],
  primary: string | null = ORG,
) => ({ userId, profile: { primary_organization_id: primary }, memberships });

describe("Create Signing eligibility (canonical helper)", () => {
  it("allows the owner of an Active Packet", () => {
    const result = getPacketSigningEligibility({
      packet: { owner_user_id: OWNER, status: "ACTIVE" },
      actor: actor(OWNER),
    });
    assert.deepEqual(result, { eligible: true, reasonCode: null, message: null });
  });

  it("never treats a status other than ACTIVE as a source", () => {
    for (const status of ["INACTIVE", "", "UNKNOWN"]) {
      assert.equal(packetSourceEligibility({ owner_user_id: OWNER, status }, OWNER).eligible, false);
    }
  });

  it("explains each ineligible reason", () => {
    const cases = [
      [null, actor(OWNER), "PACKET_UNAVAILABLE"],
      [{ owner_user_id: OWNER, status: "DELETED" }, actor(OWNER), "PACKET_DELETED"],
      [{ owner_user_id: OTHER, status: "ACTIVE" }, actor(OWNER), "NOT_PACKET_OWNER"],
      [{ owner_user_id: OWNER, status: "ACTIVE" }, actor(OWNER, [], null), "NO_ACTIVE_ORGANIZATION"],
      [
        { owner_user_id: OWNER, status: "ACTIVE" },
        actor(OWNER, [member("org-a"), member("org-b")], null),
        "PRIMARY_ORGANIZATION_REQUIRED",
      ],
    ] as const;
    for (const [packet, who, reason] of cases) {
      const result = getPacketSigningEligibility({ packet, actor: who });
      assert.equal(result.eligible, false);
      assert.equal(result.reasonCode, reason);
      assert.ok(result.message && result.message.length > 0);
    }
  });

  it("does not let an administrator who can view the Packet bypass ownership", () => {
    const result = getPacketSigningEligibility({
      packet: { owner_user_id: OWNER, status: "ACTIVE" },
      actor: actor(OTHER, [member(ORG, "ORG_ADMIN")]),
    });
    assert.equal(result.reasonCode, "NOT_PACKET_OWNER");
    assert.equal(result.message, "Only the Packet's owner can create a Signing from it.");
  });

  it("maps ineligible results to server errors", () => {
    assert.doesNotThrow(() =>
      assertPacketSigningEligible(packetSourceEligibility({ owner_user_id: OWNER, status: "ACTIVE" }, OWNER)),
    );
    const expectCode = (status: string, owner: string, code: string) =>
      assert.throws(
        () => assertPacketSigningEligible(packetSourceEligibility({ owner_user_id: owner, status }, OWNER)),
        (error) => error instanceof SigningError && error.code === code,
      );
    expectCode("DELETED", OWNER, "INVALID_PACKET");
    expectCode("ACTIVE", OTHER, "FORBIDDEN");
  });

  it("accepts only ACTIVE Packets as a source", () => {
    assert.equal(SIGNING_SOURCE_PACKET_STATUS, "ACTIVE");
  });

  it("is the one rule used by Create Signing, the source selector and Draft documents", () => {
    const packetToSigning = read("lib/signing/packet-to-signing.ts");
    const operations = read("lib/signing/operations.ts");
    const sourcePacket = read("lib/signing/source-packet.ts");
    const draftDocuments = read("lib/signing/draft-documents.ts");
    const actions = read("lib/signing/actions.ts");
    assert.match(
      packetToSigning,
      /assertPacketSigningEligible\(\s*getPacketSigningEligibility\(\{ packet, actor \}\)/,
    );
    assert.match(operations, /packetSourceEligibility\(packet, responsibleUserId\)/);
    assert.match(sourcePacket, /\.filter\(\(row\) => packetSourceEligibility\(row, actor\.userId\)\.eligible\)/);
    assert.match(sourcePacket, /\.eq\("status", SIGNING_SOURCE_PACKET_STATUS\)/);
    assert.match(draftDocuments, /packetSourceEligibility\(row, actor\.userId\)\.eligible/);
    for (const source of [packetToSigning, sourcePacket, draftDocuments]) {
      assert.doesNotMatch(source, /owner_user_id !== actor\.userId/);
    }
    const action = actions.slice(actions.indexOf("export async function getPacketSigningEligibilityAction"));
    const requireAt = action.indexOf("requireSigningActor()");
    assert.ok(requireAt > 0 && requireAt < action.indexOf("createClient()"));
    assert.doesNotMatch(action.slice(0, action.search(/\r?\n\}\r?\n/)), /createAdminClient/);
  });

  it("shows Create Signing disabled with the reason instead of hiding it", () => {
    const detail = read("components/packets/packet-detail.tsx");
    assert.match(detail, /getPacketSigningEligibilityAction\(\{ packetId \}\)/);
    assert.match(detail, /!signingEligibility\.eligible \|\|/);
    assert.match(detail, /Create Signing unavailable: \{signingEligibility\.message\}/);
    assert.match(detail, /aria-describedby=\{/);
  });
});

describe("Packet visibility", () => {
  it("lists Active Packets, adding Deleted only for Show deleted", () => {
    const packets = read("components/packets/packets-page.tsx");
    assert.match(packets, /query = query\.in\("status", \["ACTIVE", "DELETED"\]\)/);
    assert.match(packets, /query = query\.eq\("status", "ACTIVE"\)/);
    assert.match(packets, /<RecordStatusBadge status="DELETED" \/>/);
    assert.doesNotMatch(packets, /INACTIVE/);
  });
});

describe("Signing rename authority", () => {
  const snapshot = (
    lifecycleState: string,
    overrides: Partial<SigningAuthoritySnapshot> = {},
  ): SigningAuthoritySnapshot => ({
    signingId: "s1",
    originatingOrganizationId: ORG,
    lifecycleState,
    currentPrimaryAgentAssociationId: "a1",
    originalSenderUserId: OWNER,
    associations: [
      { id: "a1", agentUserId: OWNER, associationRole: "PRIMARY", effectiveEndedAt: null },
    ],
    ...overrides,
  });
  const canRename = (
    lifecycleState: string,
    actorUserId: string,
    memberships: SigningOrganizationMembership[],
    overrides: Partial<SigningAuthoritySnapshot> = {},
  ) => {
    const signing = snapshot(lifecycleState, overrides);
    return canRenameSigning({
      authority: evaluateSigningAuthority({ signing, actorUserId, memberships }),
      lifecycleState,
      originatingOrganizationId: ORG,
      memberships,
    });
  };
  const ALL_STATES = ["DRAFT", "IN_PROGRESS", "COMPLETE", "CANCELLED", "EXPIRED"];

  it("lets the active primary agent rename in every lifecycle state", () => {
    for (const state of ALL_STATES) {
      assert.equal(canRename(state, OWNER, [member()]), true, state);
    }
  });

  it("lets the brokerage administrator rename in every lifecycle state", () => {
    for (const state of ALL_STATES) {
      assert.equal(canRename(state, OTHER, [member(ORG, "ORG_ADMIN")]), true, state);
    }
  });

  it("denies unrelated users, other brokerages and Global-Admin-style outsiders", () => {
    for (const state of ALL_STATES) {
      assert.equal(canRename(state, OTHER, [member()]), false, state);
      assert.equal(canRename(state, OTHER, [member("org-b", "ORG_ADMIN")]), false, state);
      assert.equal(canRename(state, OTHER, []), false, state);
    }
  });

  it("denies a former agent who retains only historical read", () => {
    const ended = {
      associations: [
        {
          id: "a1",
          agentUserId: OWNER,
          associationRole: "PRIMARY" as const,
          effectiveEndedAt: "2026-01-01T00:00:00Z",
        },
      ],
    };
    for (const state of ALL_STATES) {
      assert.equal(canRename(state, OWNER, [member()], ended), false, state);
    }
  });

  it("denies the agent once they leave the originating brokerage", () => {
    for (const state of ALL_STATES) {
      assert.equal(canRename(state, OWNER, [member("org-b")]), false, state);
    }
  });

  it("lets an actively delegated TC rename, and not after revocation", () => {
    const tc = (status: string, revokedAt: string | null) => ({
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
          status,
          revokedAt,
          effectiveEndedAt: null,
        },
      ],
    });
    for (const state of ALL_STATES) {
      assert.equal(canRename(state, OTHER, [member()], tc("ACTIVE", null)), true, state);
      assert.equal(
        canRename(state, OTHER, [member()], tc("REVOKED", "2026-01-01T00:00:00Z")),
        false,
        state,
      );
    }
  });
});

describe("Signing rename implementation", () => {
  const rename = read("lib/signing/rename.ts");
  const body = rename.slice(rename.indexOf("export async function renameSigningForActor"));

  it("authorizes before writing and only touches signings.title", () => {
    const authorizeAt = body.indexOf("canRenameSigning(");
    const updateAt = body.indexOf('.from("signings")');
    assert.ok(body.indexOf("loadSigningAuthorityBundle(") < authorizeAt);
    assert.ok(authorizeAt > 0 && authorizeAt < updateAt);
    assert.match(body, /\.update\(\{ title \}\)/);
    assert.equal((body.match(/\.from\(/g) ?? []).length, 1);
    assert.doesNotMatch(
      rename,
      /signing_package_revisions|signing_documents|signing_participants|signing_fields|signing_adopted_marks|signing_artifacts|sha256|content_hash|invitation/,
    );
  });

  it("records old and new name in a business event without secrets or links", () => {
    assert.match(body, /eventType: "SIGNING_TITLE_UPDATED"/);
    assert.match(body, /visibility: "BUSINESS"/);
    assert.match(body, /previousTitle,\s*newTitle: title,/);
    assert.match(body, /actorUserId: actor\.userId/);
    assert.doesNotMatch(body, /token|secret|url|link/i);
  });

  it("validates the name with the shared title rules", () => {
    assert.match(body, /normalizeSigningTitle\(input\.title\)/);
    assert.match(body, /A Signing name is required\./);
    assert.match(body, /SIGNING_TITLE_MAX_LENGTH/);
  });

  it("exposes rename to managers only, never in the participant ceremony", () => {
    const dashboard = read("components/signings/signing-dashboard-page.tsx");
    assert.match(dashboard, /dashboard\.canRename && renameValue == null/);
    assert.match(dashboard, /renameSigningAction\(\{ signingId, title \}\)/);
    assert.match(dashboard, /maxLength=\{SIGNING_TITLE_MAX_LENGTH\}/);
    assert.match(dashboard, /setNotice\("Signing renamed\."\)/);
    assert.doesNotMatch(dashboard, /router\.(push|replace|refresh)\([^)]*\)[\s\S]{0,40}Signing renamed/);
    const participantFiles = ["app/sign", "components/sign"].flatMap((dir) =>
      readdirSync(path.join(process.cwd(), dir), { recursive: true, encoding: "utf8" })
        .filter((entry) => /\.(ts|tsx)$/.test(entry))
        .map((entry) => path.join(dir, entry)),
    );
    assert.ok(participantFiles.length > 5);
    for (const file of participantFiles) {
      assert.doesNotMatch(read(file), /renameSigning|canRename|SIGNING_TITLE_MAX_LENGTH/, file);
    }
  });
});

describe("Draft sync completes as part of opening a Signing", () => {
  it("authorizes, auto-adds, syncs, then loads in the dashboard read", () => {
    const dashboard = read("lib/signing/dashboard.ts");
    const authorizeAt = dashboard.indexOf("requireManageableDraftSigning(");
    const addAt = dashboard.indexOf("autoAddDraftPacketParticipants(");
    const syncAt = dashboard.indexOf("syncDraftParticipantIdentities(");
    const loadAt = dashboard.indexOf("const draftPrepLoad");
    assert.ok(authorizeAt > 0 && authorizeAt < addAt && addAt < syncAt && syncAt < loadAt);
    const noticeAt = dashboard.indexOf("listDraftPacketAutoAddedParticipantNames(");
    assert.ok(syncAt < noticeAt && noticeAt < loadAt);
  });

  it("derives the auto-add notice from a marker written with the insert", () => {
    const sourcePacket = read("lib/signing/source-packet.ts");
    const autoAdd = sourcePacket.slice(
      sourcePacket.indexOf("export async function autoAddDraftPacketParticipants"),
      sourcePacket.indexOf("export async function listDraftPacketAutoAddedParticipantNames"),
    );
    assert.match(autoAdd, /const autoAdded = options\.onlyContactId === undefined;/);
    assert.match(autoAdd, /auto_added: autoAdded/);
    const notice = sourcePacket.slice(
      sourcePacket.indexOf("export async function listDraftPacketAutoAddedParticipantNames"),
      sourcePacket.indexOf("export type DraftRemovedPacketParticipants"),
    );
    assert.match(notice, /\.neq\("participant_status", "REMOVED"\)/);
    assert.match(notice, /\.not\("auto_added_from_packet_at", "is", null\)/);

    const migration = read(
      "supabase/migrations/20261009130000_native_signing_draft_auto_add_marker.sql",
    );
    assert.match(migration, /add column if not exists auto_added_from_packet_at timestamptz/);
    assert.match(migration, /case when \(v_party ->> 'auto_added'\) = 'true' then now\(\) end/);
    assert.match(migration, /for update;/);

    const client = read("components/signings/signing-dashboard-page.tsx");
    assert.match(client, /autoAddedFromPacket=\{dashboard\.participantSync\.addedFromPacket\}/);
    assert.doesNotMatch(client, /rememberAutoAdded|setAutoAdded/);
  });

  it("renders the Signing page from server data, without a client mount fetch", () => {
    const page = read("app/signings/[signingId]/page.tsx");
    const client = read("components/signings/signing-dashboard-page.tsx");
    const list = read("app/signings/page.tsx");
    const listClient = read("components/signings/signings-list-page.tsx");
    assert.match(page, /await getSigningDashboardAction\(\{ signingId \}\)/);
    assert.match(page, /initial=\{initial\}/);
    assert.match(list, /initial=\{await listSigningsAction\(\)\}/);
    for (const source of [client, listClient]) {
      assert.doesNotMatch(source, /useEffect\(/);
      assert.doesNotMatch(source, /setTimeout|setInterval|location\.reload/);
      assert.match(source, /useHistoryRestoreRefresh\(reload\)/);
    }
    const prep = read("components/signings/signing-draft-prep-panel.tsx");
    assert.match(prep, /prep: SigningDraftPrep \| null/);
    assert.doesNotMatch(prep, /getDraftSourcePacketStateAction|listPacketFormsForDraftAction/);
  });

  it("keeps Signing UI text free of double-encoded characters", () => {
    for (const file of [
      "components/signings/signing-draft-prep-panel.tsx",
      "components/signings/signing-dashboard-page.tsx",
      "components/signings/signings-list-page.tsx",
      "components/packets/packet-detail.tsx",
      "components/packets/packets-page.tsx",
    ]) {
      assert.doesNotMatch(read(file), /\u00c2[\u00a0-\u00bf]|\u00e2\u20ac/, file);
    }
  });

  it("refreshes on Back/Forward only for a real history traversal", () => {
    const hook = read("components/signings/use-history-restore-refresh.ts");
    assert.match(hook, /navigationType === "traverse"/);
    assert.match(hook, /bfcacheId/);
    assert.doesNotMatch(hook, /setTimeout|setInterval|location\.reload/);
  });
});
