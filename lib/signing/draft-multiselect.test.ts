import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  PASTE_OFFSET_PT,
  clampGroupDelta,
  copyPlacements,
  expandRemovalIds,
  groupMoveIds,
  isSelectionToggle,
  isTypingTarget,
  moveGroup,
  planPaste,
  removeFields,
  toggleSelection,
} from "@/lib/signing/draft-field-editor-state";
import {
  invitationStatusLabel,
  summarizeParticipantAccess,
} from "@/lib/signing/participant-access-status";
import type {
  SigningPreviewField,
  SigningPreviewModel,
} from "@/lib/signing/preview";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const PAGE = { width: 612, height: 792 };
const PAGES = { 1: PAGE, 2: PAGE };

function field(
  id: string,
  fieldType: SigningPreviewField["fieldType"],
  participantId: string,
  extra: Partial<SigningPreviewField> = {},
): SigningPreviewField {
  return {
    id,
    fieldType,
    isRequired: true,
    pageNumber: 1,
    x: 72,
    y: 600,
    width: 160,
    height: 40,
    participantId,
    participantFullName: participantId === "p1" ? "Bea Buyer" : "Cal Buyer",
    capacityMode: "PERSONAL",
    representedPartyName: null,
    capacityLabel: null,
    capacityWording: null,
    linkedSignatureFieldId: null,
    ...extra,
  };
}

function model(fields: SigningPreviewField[]): SigningPreviewModel {
  return {
    signingId: "s1",
    title: "Signing",
    participants: [
      { id: "p1", fullName: "Bea Buyer", capacityMode: "PERSONAL", representedPartyName: null, capacityWording: null },
      { id: "p2", fullName: "Cal Buyer", capacityMode: "PERSONAL", representedPartyName: null, capacityWording: null },
    ],
    documents: [
      { id: "d1", displayName: "Contract", displayOrder: 0, pageCount: 2, hasSelectedSnapshot: true, fields },
    ],
  };
}

const base = () =>
  model([
    field("sig", "SIGNATURE", "p1"),
    field("date", "DATE_SIGNED", "p1", { linkedSignatureFieldId: "sig", x: 250 }),
    field("ini", "INITIALS", "p1", { y: 100, width: 60, height: 30 }),
    field("ini2", "INITIALS", "p2", { x: 300, y: 100, width: 60, height: 30 }),
    field("sig2", "SIGNATURE", "p2", { pageNumber: 2, y: 200 }),
  ]);

let counter = 0;
const newId = () => `local-${++counter}`;
const rows = (state: SigningPreviewModel) => state.documents[0].fields;
const byId = (state: SigningPreviewModel, id: string) =>
  rows(state).find((row) => row.id === id)!;

describe("Prepare Documents multi-select", () => {
  it("Ctrl-click or Cmd-click toggles; a plain click does not", () => {
    assert.equal(isSelectionToggle({ ctrlKey: true, metaKey: false }), true);
    assert.equal(isSelectionToggle({ ctrlKey: false, metaKey: true }), true);
    assert.equal(isSelectionToggle({ ctrlKey: false, metaKey: false }), false);
    assert.deepEqual(toggleSelection(["a"], "b"), ["a", "b"]);
    assert.deepEqual(toggleSelection(["a", "b"], "a"), ["b"]);
  });

  it("ignores shortcuts while typing in form controls", () => {
    const control = { closest: (selector: string) => (selector.includes("input") ? {} : null) };
    const none = { closest: () => null };
    assert.equal(isTypingTarget(control), true);
    assert.equal(isTypingTarget(none), false);
    assert.equal(isTypingTarget(null), false);
    assert.equal(isTypingTarget({}), false);
  });

  it("group drag moves only same-page selected placements and keeps offsets", () => {
    const state = base();
    const ids = groupMoveIds(state, ["sig", "ini", "sig2"], "sig");
    assert.deepEqual(ids.sort(), ["ini", "sig"]);
    assert.deepEqual(groupMoveIds(state, ["ini"], "sig"), ["sig"]);

    const moved = moveGroup(state, ids, { dx: 20, dy: -30 }, PAGE);
    assert.equal(byId(moved, "sig").x - byId(moved, "ini").x, 72 - 72);
    assert.equal(byId(moved, "sig").y - byId(moved, "ini").y, 600 - 100);
    assert.deepEqual([byId(moved, "sig").x, byId(moved, "sig").y], [92, 570]);
    assert.equal(byId(moved, "sig2").y, 200);
    assert.equal(byId(moved, "date").x, 250);
  });

  it("clamps the whole group at page bounds without distorting it", () => {
    const rects = [
      { x: 10, y: 10, width: 50, height: 20 },
      { x: 500, y: 700, width: 100, height: 40 },
    ];
    assert.deepEqual(clampGroupDelta(rects, { dx: -100, dy: 200 }, PAGE), { dx: -10, dy: 52 });
    assert.deepEqual(clampGroupDelta([], { dx: 5, dy: 5 }, PAGE), { dx: 0, dy: 0 });
  });

  it("multi-delete removes a Signature's Date; Initials and Date delete independently", () => {
    const state = base();
    assert.deepEqual(expandRemovalIds(state, ["sig", "ini"]).sort(), ["date", "ini", "sig"]);
    assert.deepEqual(expandRemovalIds(state, ["date", "ini2"]).sort(), ["date", "ini2"]);
    const after = removeFields(state, expandRemovalIds(state, ["date", "ini2"]));
    assert.ok(rows(after).some((row) => row.id === "sig"));
  });
});

describe("Prepare Documents copy/paste", () => {
  it("pastes single Initials with participant, type, required, and offset kept", () => {
    const state = base();
    const clipboard = copyPlacements(state, ["ini2"]);
    const plan = planPaste({ model: state, documentId: "d1", clipboard, pageSizes: PAGES, offset: PASTE_OFFSET_PT, newId });
    assert.deepEqual(plan.rejected, []);
    assert.equal(plan.fields.length, 1);
    const [pasted] = plan.fields;
    assert.equal(pasted.fieldType, "INITIALS");
    assert.equal(pasted.participantId, "p2");
    assert.equal(pasted.isRequired, true);
    assert.deepEqual([pasted.x, pasted.y, pasted.width, pasted.height], [312, 112, 60, 30]);
    assert.notEqual(pasted.id, "ini2");
  });

  it("a Signature alone gets a new linked Date Signed", () => {
    const state = base();
    const plan = planPaste({ model: state, documentId: "d1", clipboard: copyPlacements(state, ["sig"]), pageSizes: PAGES, offset: PASTE_OFFSET_PT, newId });
    assert.equal(plan.fields.length, 2);
    const [sig, date] = plan.fields;
    assert.equal(sig.fieldType, "SIGNATURE");
    assert.equal(date.fieldType, "DATE_SIGNED");
    assert.equal(date.linkedSignatureFieldId, sig.id);
    assert.equal(date.participantId, "p1");
  });

  it("a copied pair pastes as a new linked pair with the same relative geometry", () => {
    const state = base();
    const plan = planPaste({ model: state, documentId: "d1", clipboard: copyPlacements(state, ["sig", "date"]), pageSizes: PAGES, offset: PASTE_OFFSET_PT, newId });
    assert.equal(plan.fields.length, 2);
    const sig = plan.fields.find((row) => row.fieldType === "SIGNATURE")!;
    const date = plan.fields.find((row) => row.fieldType === "DATE_SIGNED")!;
    assert.equal(date.linkedSignatureFieldId, sig.id);
    assert.notEqual(date.linkedSignatureFieldId, "sig");
    assert.equal(date.x - sig.x, 250 - 72);
    assert.equal(date.y - sig.y, 0);
  });

  it("pastes multiple placements across participants and pages, links never cross", () => {
    const state = base();
    const clipboard = copyPlacements(state, ["sig", "date", "ini", "ini2", "sig2"]);
    const plan = planPaste({ model: state, documentId: "d1", clipboard, pageSizes: PAGES, offset: PASTE_OFFSET_PT, newId });
    assert.deepEqual(plan.rejected, []);
    // sig + date + ini + ini2 + sig2 + auto Date for sig2
    assert.equal(plan.fields.length, 6);
    const pastedById = new Map(plan.fields.map((row) => [row.id, row]));
    for (const date of plan.fields.filter((row) => row.fieldType === "DATE_SIGNED")) {
      const signature = pastedById.get(date.linkedSignatureFieldId!)!;
      assert.equal(signature.participantId, date.participantId);
    }
    assert.equal(plan.fields.filter((row) => row.pageNumber === 2).length, 2);
  });

  it("a Date alone links to its original same-participant Signature", () => {
    const state = base();
    const plan = planPaste({ model: state, documentId: "d1", clipboard: copyPlacements(state, ["date"]), pageSizes: PAGES, offset: PASTE_OFFSET_PT, newId });
    assert.deepEqual(plan.rejected, []);
    assert.equal(plan.fields[0].linkedSignatureFieldId, "sig");
  });

  it("rejects an orphan Date with no same-participant Signature", () => {
    const orphan = model([field("sig", "SIGNATURE", "p1"), field("ini2", "INITIALS", "p2")]);
    const clipboard = [
      {
        sourceId: "gone",
        fieldType: "DATE_SIGNED" as const,
        participantId: "p2",
        isRequired: true,
        pageNumber: 1,
        x: 10,
        y: 10,
        width: 90,
        height: 20,
        linkedSignatureSourceId: "gone-sig",
      },
    ];
    const plan = planPaste({ model: orphan, documentId: "d1", clipboard, pageSizes: PAGES, offset: PASTE_OFFSET_PT, newId });
    assert.equal(plan.fields.length, 0);
    assert.match(plan.rejected[0], /Date Signed needs a Signature for Cal Buyer/);
  });

  it("clamps pasted groups to the page and rejects missing pages", () => {
    const edge = model([field("ini", "INITIALS", "p1", { x: 600, y: 780, width: 12, height: 12 })]);
    const plan = planPaste({ model: edge, documentId: "d1", clipboard: copyPlacements(edge, ["ini"]), pageSizes: PAGES, offset: PASTE_OFFSET_PT, newId });
    assert.deepEqual([plan.fields[0].x, plan.fields[0].y], [600, 780]);
    const missing = planPaste({ model: base(), documentId: "d1", clipboard: copyPlacements(base(), ["sig2"]), pageSizes: { 1: PAGE }, offset: PASTE_OFFSET_PT, newId });
    assert.equal(missing.fields.length, 0);
    assert.match(missing.rejected[0], /Page 2 does not exist/);
  });

  it("wires shortcuts, typing guard, in-memory clipboard, and trusted writes in the dialog", () => {
    const source = read("components/signings/signing-preview-dialog.tsx");
    assert.match(source, /isTypingTarget\(event\.target\)/);
    assert.match(source, /event\.key === "Delete" \|\| event\.key === "Backspace"/);
    assert.doesNotMatch(source, /navigator\.clipboard/);
    assert.match(source, /data-testid="prepare-selection"/);
    assert.match(source, /placement.*selected/);
    assert.doesNotMatch(source, /from\("signing_draft_fields"\)/);
    assert.doesNotMatch(source, /router\.refresh\(\)/);
  });
});

describe("Participant link access status", () => {
  const credentials = [
    { signing_participant_id: "p1", issued_at: "2026-09-01T00:00:00Z", is_current: false, revoked_at: "2026-09-02T00:00:00Z", revoked_reason: "REPLACED_BY_MANAGER" },
    { signing_participant_id: "p1", issued_at: "2026-09-02T00:00:00Z", is_current: true, revoked_at: null, revoked_reason: null },
    { signing_participant_id: "p2", issued_at: "2026-09-01T00:00:00Z", is_current: false, revoked_at: "2026-09-03T00:00:00Z", revoked_reason: "REVOKED_BY_MANAGER" },
  ];
  const instructions = [
    { id: "i1", signing_participant_id: "p1", delivery_state: "ACCEPTED", create_date: "2026-09-02T00:00:01Z" },
    { id: "i0", signing_participant_id: "p1", delivery_state: "FAILED", create_date: "2026-09-01T00:00:01Z" },
  ];
  const attempts = [
    { delivery_instruction_id: "i1", attempt_number: 1, attempted_at: "2026-09-02T00:00:02Z", outcome: "ACCEPTED", provider_reference: "sandbox:bea@example.test" },
  ];

  it("reports Active link, replacement time, and sandbox acceptance honestly", () => {
    const status = summarizeParticipantAccess("p1", credentials, instructions, attempts);
    assert.equal(status.linkState, "ACTIVE");
    assert.equal(status.linkIssuedAt, "2026-09-02T00:00:00Z");
    assert.equal(status.lastReplacedAt, "2026-09-02T00:00:00Z");
    assert.equal(status.lastInvitationState, "ACCEPTED");
    assert.equal(status.lastAttemptSandboxed, true);
    assert.match(invitationStatusLabel(status), /sandbox \(not sent\)/);
    assert.doesNotMatch(JSON.stringify(status), /sandbox:|example\.test/);
  });

  it("reports Revoked without a replacement and never says delivered", () => {
    const status = summarizeParticipantAccess("p2", credentials, instructions, attempts);
    assert.equal(status.linkState, "REVOKED");
    assert.equal(status.revokedAt, "2026-09-03T00:00:00Z");
    assert.equal(invitationStatusLabel(status), "No invitation yet");
    for (const state of [null, "PENDING", "QUEUED", "ACCEPTED", "FAILED", "OTHER"]) {
      const label = invitationStatusLabel({ ...status, lastInvitationState: state, lastAttemptSandboxed: false });
      assert.doesNotMatch(label, /delivered/i);
    }
  });

  it("dashboard page confirms Replace/Revoke and shows inline status copy", () => {
    const page = read("components/signings/signing-dashboard-page.tsx");
    assert.match(page, /Replace signing link\?/);
    assert.match(page, /current link will stop working and a new signing link will be sent\./);
    assert.match(page, /Signing link replaced\./);
    assert.match(page, /The previous link no longer works\. A new link has been queued for delivery\./);
    assert.match(page, /Email delivery is sandboxed in development\./);
    assert.match(page, /setPendingLinkOp\(\{ participantId: participant\.id, op: "replace" \}\)/);
    assert.match(page, /data-testid="participant-link-status"/);
    assert.doesNotMatch(page, /Invitation delivered/);
  });

  it("Replace runs participant pre-checks and revokes old entry sessions", () => {
    const recovery = read("lib/signing/participant-credential-recovery.ts");
    const replace = recovery.slice(recovery.indexOf("export async function replaceParticipantInvitationWithActor"));
    const body = replace.slice(0, replace.indexOf("\n}\n"));
    assert.ok(body.indexOf("requireInProgressManageableParticipant") < body.indexOf("replaceParticipantCredentialsWithActor"));
    assert.match(body, /revokeSigningEntrySessionsForCredential/);
    const actions = read("lib/signing/stage4-actions.ts");
    assert.match(actions, /replaceParticipantInvitationWithActor/);
  });
});
