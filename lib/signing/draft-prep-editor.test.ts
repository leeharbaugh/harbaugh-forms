import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  addField,
  clampRectToPage,
  dragExceededThreshold,
  moveField,
  pairedDatePlacement,
  preferredSignatureForDate,
  reassignField,
  removalIds,
  removeFields,
  replaceFieldId,
} from "@/lib/signing/draft-field-editor-state";
import type {
  SigningPreviewField,
  SigningPreviewModel,
} from "@/lib/signing/preview";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

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
    linkedSignatureFieldId: null,
    ...extra,
  };
}

function model(fields: SigningPreviewField[]): SigningPreviewModel {
  return {
    signingId: "s1",
    title: "Signing",
    participants: [
      { id: "p1", fullName: "Bea Buyer", capacityMode: "PERSONAL", representedPartyName: null },
      { id: "p2", fullName: "Cal Buyer", capacityMode: "PERSONAL", representedPartyName: null },
    ],
    documents: [
      {
        id: "d1",
        displayName: "Contract",
        displayOrder: 0,
        pageCount: 2,
        hasSelectedSnapshot: true,
        fields,
      },
    ],
  };
}

const base = () =>
  model([
    field("sig", "SIGNATURE", "p1"),
    field("date", "DATE_SIGNED", "p1", { linkedSignatureFieldId: "sig", x: 250 }),
    field("ini", "INITIALS", "p1", { y: 100 }),
  ]);

describe("Prepare Documents local editor state", () => {
  it("treats a drag stop without movement as a click (no persist)", () => {
    assert.equal(dragExceededThreshold({ x: 10, y: 10 }, { x: 11, y: 12 }), false);
    assert.equal(dragExceededThreshold({ x: 10, y: 10 }, { x: 14, y: 10 }), true);
  });

  it("places, moves, and resizes locally without touching other fields", () => {
    const placed = addField(base(), "d1", field("new", "INITIALS", "p2"));
    assert.equal(placed.documents[0].fields.length, 4);
    const moved = moveField(placed, "new", { x: 5, y: 6, width: 90, height: 30 });
    const row = moved.documents[0].fields.find((f) => f.id === "new")!;
    assert.deepEqual([row.x, row.y, row.width, row.height], [5, 6, 90, 30]);
    assert.equal(moved.documents[0].fields.find((f) => f.id === "sig")!.x, 72);
  });

  it("swaps a local placeholder id for the persisted id, including links", () => {
    const local = model([
      field("local-1", "SIGNATURE", "p1"),
      field("local-2", "DATE_SIGNED", "p1", { linkedSignatureFieldId: "local-1" }),
    ]);
    const persisted = replaceFieldId(local, "local-1", "uuid-1");
    const [sig, date] = persisted.documents[0].fields;
    assert.equal(sig.id, "uuid-1");
    assert.equal(date.linkedSignatureFieldId, "uuid-1");
  });

  it("removing a Signature removes its paired Date Signed; Initials stay", () => {
    const state = base();
    assert.deepEqual(removalIds(state, "sig").sort(), ["date", "sig"]);
    const after = removeFields(state, removalIds(state, "sig"));
    assert.deepEqual(after.documents[0].fields.map((f) => f.id), ["ini"]);
  });

  it("removes Initials and Date Signed independently", () => {
    const state = base();
    assert.deepEqual(removalIds(state, "ini"), ["ini"]);
    assert.deepEqual(removalIds(state, "date"), ["date"]);
    const after = removeFields(state, removalIds(state, "date"));
    assert.ok(after.documents[0].fields.some((f) => f.id === "sig"));
  });

  it("reassigning a Signature moves its paired Date Signed with it", () => {
    const after = reassignField(base(), "sig", "p2");
    const fields = after.documents[0].fields;
    assert.equal(fields.find((f) => f.id === "sig")!.participantId, "p2");
    assert.equal(fields.find((f) => f.id === "date")!.participantId, "p2");
    assert.equal(fields.find((f) => f.id === "date")!.participantFullName, "Cal Buyer");
    assert.equal(fields.find((f) => f.id === "ini")!.participantId, "p1");
  });

  it("relinks a reassigned Date Signed to the new participant's Signature", () => {
    const state = model([
      field("sig1", "SIGNATURE", "p1"),
      field("sig2", "SIGNATURE", "p2", { y: 300 }),
      field("date", "DATE_SIGNED", "p1", { linkedSignatureFieldId: "sig1" }),
    ]);
    const target = preferredSignatureForDate(state.documents[0].fields, "p2", 1);
    assert.equal(target?.id, "sig2");
    const after = reassignField(state, "date", "p2", target!.id);
    const date = after.documents[0].fields.find((f) => f.id === "date")!;
    assert.equal(date.participantId, "p2");
    assert.equal(date.linkedSignatureFieldId, "sig2");
  });

  it("keeps placements on the page and puts the paired date beside or below", () => {
    const page = { width: 612, height: 792 };
    const clamped = clampRectToPage({ x: -20, y: 780, width: 160, height: 40 }, page);
    assert.deepEqual([clamped.x, clamped.y], [0, 752]);
    const beside = pairedDatePlacement({ x: 72, y: 600, width: 160, height: 40 }, page);
    assert.equal(beside.x, 72 + 160 + 12);
    const below = pairedDatePlacement({ x: 440, y: 600, width: 160, height: 40 }, page);
    assert.deepEqual([below.x, below.y], [440, 648]);
  });
});

describe("Prepare Documents editor stability (refresh root cause)", () => {
  const dialog = read("components/signings/signing-preview-dialog.tsx");

  it("never reloads the model or resets view state after an edit", () => {
    // Root cause: every edit awaited load(), which set loading (unmounting the
    // PDF) and reset page/size/selection, then reloaded the dashboard.
    assert.doesNotMatch(dialog, /await load\(\)/);
    assert.doesNotMatch(dialog, /setPageNumber\(1\)/);
    assert.doesNotMatch(dialog, /setLoading\(true\)/);
    assert.doesNotMatch(dialog, /if \(onChanged\) await onChanged\(\)/);
    assert.match(dialog, /initialLoading/);
    assert.match(dialog, /updateModel\(/);
  });

  it("does not disable fields or the Remove control while saving", () => {
    // A busy-disabled Remove button swallowed the click after a no-op drag stop.
    assert.doesNotMatch(dialog, /disabled=\{busy\}/);
    assert.doesNotMatch(dialog, /disableDragging=\{busy\}/);
    assert.match(dialog, /cancel="\.signing-field-remove"/);
    assert.match(dialog, /dragExceededThreshold/);
    assert.match(dialog, /pointerStartedOnFieldRef/);
  });

  it("serializes trusted writes and reconciles from the server on failure", () => {
    assert.match(dialog, /queueRef/);
    assert.match(dialog, /upsertDraftSigningFieldAction/);
    assert.match(dialog, /removeDraftSigningFieldAction/);
    assert.match(dialog, /removedFieldIds/);
    assert.match(dialog, /reconcile\(\)/);
    assert.doesNotMatch(dialog, /from\("signing_draft_fields"\)/);
    assert.doesNotMatch(dialog, /createClient|supabase/i);
  });

  it("uses the Packet editor layout: full-height workspace, zoom, sidebar", () => {
    assert.match(dialog, /fixed inset-0/);
    assert.match(dialog, /computePdfPageWidth/);
    assert.match(dialog, /PDF_EDITOR_SIDEBAR_WIDTH/);
    assert.match(dialog, /Fit Width/);
    assert.match(dialog, /Fit Page/);
    assert.match(dialog, /ResizeObserver/);
    assert.doesNotMatch(dialog, /max-w-5xl/);
    assert.doesNotMatch(dialog, /renderedWidth = 720/);
  });
});

describe("Prepare Documents dead-control removal", () => {
  const dialog = read("components/signings/signing-preview-dialog.tsx");

  it("removes the decorative Signature/Initials/Date Signed toolbar badges", () => {
    assert.doesNotMatch(dialog, /\["SIGNATURE", "INITIALS", "DATE_SIGNED"\]/);
    assert.doesNotMatch(dialog, /<Badge/);
    assert.doesNotMatch(dialog, /Previous page|Next page/);
  });

  it("keeps the Participant and Field type controls", () => {
    assert.match(dialog, /id="prepare-participant"/);
    assert.match(dialog, /id="prepare-field-type"/);
    assert.match(dialog, /<option value="SIGNATURE">Signature<\/option>/);
    assert.match(dialog, /<option value="INITIALS">Initials<\/option>/);
    assert.match(dialog, /<option value="DATE_SIGNED">Date Signed<\/option>/);
  });
});

describe("Signature adoption boundary", () => {
  const dialog = read("components/signings/signing-preview-dialog.tsx");
  const prep = read("components/signings/signing-draft-prep-panel.tsx");

  it("shows only the concise adoption copy and no adopt feature in prep", () => {
    assert.match(
      dialog,
      /Place signing fields for each participant\. Participants adopt their signatures and initials when they sign\./,
    );
    for (const source of [dialog, prep]) {
      assert.doesNotMatch(source, /Adopt Signature|adoptSignature|AdoptSignature/);
    }
  });
});

describe("One source Packet per Signing", () => {
  const prep = read("components/signings/signing-draft-prep-panel.tsx");
  const stage3 = read("lib/signing/stage3-actions.ts");
  const sourcePacket = read("lib/signing/source-packet.ts");
  const draftDocuments = read("lib/signing/draft-documents.ts");
  const draftFields = read("lib/signing/draft-fields.ts");

  it("binds, scopes, and never silently remaps the source Packet", () => {
    assert.match(draftDocuments, /bindSigningSourcePacketIfUnset/);
    assert.match(draftDocuments, /\.is\("source_packet_id", null\)/);
    assert.match(draftDocuments, /already includes documents from a different Packet/);
    assert.match(sourcePacket, /deriveSigningParticipantsFromPacket/);
    assert.match(sourcePacket, /linkedContactIds\.has\(party\.linkedContactId\)/);
    assert.match(sourcePacket, /\.eq\("source_packet_id", signing\.source_packet_id\)/);
    assert.match(sourcePacket, /requireManageableDraftSigning/);
    assert.match(sourcePacket, /owner_user_id !== actor\.userId/);
    assert.doesNotMatch(sourcePacket, /\.delete\(/);
  });

  it("lists Packet forms only from the bound source Packet", () => {
    assert.match(stage3, /if \(signing\.source_packet_id == null\) \{\s*return \[\];/);
    assert.match(stage3, /selectDraftSourcePacketAction/);
    assert.match(stage3, /getDraftSourcePacketStateAction/);
  });

  it("shows the source Packet prominently and hides selectors that would fail", () => {
    assert.match(prep, /Source Packet/);
    assert.match(prep, /Use this Packet/);
    assert.match(prep, /canChangeSourcePacket/);
    assert.match(prep, /A Signing uses one source Packet/);
    assert.match(prep, /Upload PDF/);
  });

  it("removes a Signature's paired Date Signed server-side and moves it on reassign", () => {
    assert.match(draftFields, /\.eq\("linked_signature_draft_field_id", input\.fieldId\)\s*\.select\("id"\)/);
    assert.doesNotMatch(draftFields, /update\(\{ linked_signature_draft_field_id: null \}\)/);
    assert.match(draftFields, /A paired Date Signed always belongs to its Signature's participant/);
  });
});
