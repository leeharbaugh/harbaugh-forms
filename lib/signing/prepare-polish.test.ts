import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  autoAddNoticeEntryName,
  formatAutoAddNotice,
  joinDisplayNames,
} from "./auto-add-notice-format";
import {
  nearestDateLinkSource,
  PLACEMENT_TOOLS,
  placementToolEnabled,
  rectGapDistance,
  resolveDateLinkTarget,
} from "./draft-field-editor-state";
import type { SigningPreviewField } from "./preview";
import {
  applyPreparationReadiness,
  participantMissingSignerField,
} from "./readiness-view";

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

function slice(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `missing ${from}`);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `missing ${to}`);
  return source.slice(start, end);
}

function field(
  id: string,
  fieldType: SigningPreviewField["fieldType"],
  rect: { x: number; y: number; width?: number; height?: number },
  options: { participantId?: string; pageNumber?: number } = {},
): SigningPreviewField {
  return {
    id,
    fieldType,
    isRequired: true,
    pageNumber: options.pageNumber ?? 1,
    x: rect.x,
    y: rect.y,
    width: rect.width ?? 100,
    height: rect.height ?? 20,
    participantId: options.participantId ?? "p1",
    participantFullName: "Pat",
    capacityMode: "PERSONAL",
    representedPartyName: null,
    capacityLabel: null,
    capacityWording: null,
    linkedSignatureFieldId: null,
  };
}

const date = (x: number, y: number) => ({ x, y, width: 80, height: 16 });

describe("Date Signed nearest-field linking", () => {
  const initialsA = field("a", "INITIALS", { x: 50, y: 50, width: 40 });
  const initialsB = field("b", "INITIALS", { x: 450, y: 700, width: 40 });

  it("measures the gap between rectangles, zero when they touch", () => {
    assert.equal(rectGapDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 13, y: 0, width: 5, height: 5 }), 3);
    assert.equal(rectGapDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }), 0);
    assert.equal(rectGapDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 13, y: 14, width: 5, height: 5 }), 5);
  });

  it("links to the only candidate on the page", () => {
    assert.equal(nearestDateLinkSource([initialsA], "p1", 1, date(300, 300))?.id, "a");
  });

  it("picks the nearest of several and follows the pointer", () => {
    const fields = [initialsA, initialsB];
    assert.equal(nearestDateLinkSource(fields, "p1", 1, date(100, 52))?.id, "a");
    assert.equal(nearestDateLinkSource(fields, "p1", 1, date(500, 702))?.id, "b");
    assert.equal(nearestDateLinkSource([initialsB, initialsA], "p1", 1, date(500, 702))?.id, "b");
  });

  it("uses geometry, not insertion order or id", () => {
    const first = field("z-first", "INITIALS", { x: 50, y: 50 });
    const second = field("a-second", "INITIALS", { x: 50, y: 600 });
    assert.equal(nearestDateLinkSource([first, second], "p1", 1, date(160, 602))?.id, "a-second");
  });

  it("accepts Signature, Initials and a mixed set; never another Date", () => {
    const signature = field("sig", "SIGNATURE", { x: 50, y: 400, width: 160 });
    const dated = field("d", "DATE_SIGNED", { x: 220, y: 400 });
    assert.equal(nearestDateLinkSource([signature], "p1", 1, date(220, 402))?.id, "sig");
    assert.equal(nearestDateLinkSource([signature, initialsA, dated], "p1", 1, date(220, 402))?.id, "sig");
    assert.equal(nearestDateLinkSource([signature, initialsA, dated], "p1", 1, date(100, 60))?.id, "a");
    assert.equal(nearestDateLinkSource([dated], "p1", 1, date(220, 402)), null);
  });

  it("never crosses participants or pages", () => {
    const otherParticipant = field("o", "INITIALS", { x: 100, y: 50 }, { participantId: "p2" });
    const otherPage = field("pg2", "INITIALS", { x: 100, y: 50 }, { pageNumber: 2 });
    assert.equal(nearestDateLinkSource([otherParticipant, otherPage], "p1", 1, date(100, 52)), null);
    assert.equal(nearestDateLinkSource([otherParticipant, otherPage], "p1", 2, date(100, 52))?.id, "pg2");
    assert.equal(nearestDateLinkSource([initialsA], "", 1, date(100, 52)), null);
  });

  it("breaks near-equal ties deterministically by geometry", () => {
    const left = field("left", "INITIALS", { x: 0, y: 100, width: 40 });
    const right = field("right", "INITIALS", { x: 240, y: 100, width: 40 });
    const between = date(100, 100);
    assert.equal(rectGapDistance(between, left), rectGapDistance(between, right));
    const forward = nearestDateLinkSource([left, right], "p1", 1, between)?.id;
    const backward = nearestDateLinkSource([right, left], "p1", 1, between)?.id;
    assert.equal(forward, backward);
    assert.equal(forward, "left");

    const upper = field("zz-upper", "INITIALS", { x: 100, y: 0, width: 40 });
    const lower = field("aa-lower", "INITIALS", { x: 100, y: 200, width: 40 });
    assert.equal(nearestDateLinkSource([lower, upper], "p1", 1, { x: 100, y: 92, width: 40, height: 16 })?.id, "zz-upper");
  });

  it("an explicit Link to choice overrides the pointer until cleared", () => {
    const fields = [initialsA, initialsB];
    const explicit = resolveDateLinkTarget({
      fields,
      participantId: "p1",
      explicitSourceId: "a",
      pageNumber: 1,
      dateRect: date(500, 702),
    });
    assert.equal(explicit.mode, "EXPLICIT_SOURCE");
    assert.equal(explicit.source?.id, "a");
    const cleared = resolveDateLinkTarget({
      fields,
      participantId: "p1",
      explicitSourceId: "",
      pageNumber: 1,
      dateRect: date(500, 702),
    });
    assert.deepEqual([cleared.mode, cleared.source?.id], ["AUTO_NEAREST", "b"]);
  });

  it("an explicit choice that is no longer valid never falls back to another field", () => {
    for (const explicitSourceId of ["gone", "o"]) {
      const target = resolveDateLinkTarget({
        fields: [initialsA, field("o", "INITIALS", { x: 0, y: 0 }, { participantId: "p2" })],
        participantId: "p1",
        explicitSourceId,
        pageNumber: 1,
        dateRect: date(60, 52),
      });
      assert.deepEqual([target.mode, target.source], ["EXPLICIT_SOURCE", null]);
    }
  });

  it("has no automatic target without a pointer on a page", () => {
    const target = resolveDateLinkTarget({
      fields: [initialsA],
      participantId: "p1",
      explicitSourceId: "",
      pageNumber: null,
      dateRect: null,
    });
    assert.deepEqual([target.mode, target.source], ["AUTO_NEAREST", null]);
  });
});

describe("Prepare Documents Date placement (source)", () => {
  const dialog = read("components/signings/signing-preview-dialog.tsx");
  const place = slice(dialog, "function placeFieldAt(", "async function createField(");

  it("places a Date only with a resolved nearest source and never an unlinked one", () => {
    const targetAt = slice(dialog, "function dateLinkTargetAt(", "/** Arm one placement");
    assert.match(targetAt, /resolveDateLinkTarget\(\{/);
    assert.match(targetAt, /explicitSourceId: ""/);
    assert.match(place, /linkedSource = dateLinkTargetAt\(point\)\.source;\s+if \(!linkedSource\) \{[\s\S]*?return;\s+\}/);
    assert.match(place, /No Signature or Initials for \$\{participant\?\.fullName \?\? "this participant"\} on this page/);
    assert.doesNotMatch(place, /preferredSignatureForDate|dateSourceOptions\(/);
  });

  it("highlights the live target without selecting or moving it", () => {
    assert.match(dialog, /field\.id === dateTargetSourceId\s+\? "target"\s+: "candidate"/);
    assert.match(dialog, /Will link to: \$\{dateLinkSourceDisplay\(dateTarget\.source\)\}/);
    assert.match(dialog, /onMouseMove=\{\s+toolTracking/);
  });

  it("tells the server every placed Date was linked by proximity", () => {
    assert.match(place, /if \(tool === "DATE_SIGNED"\) autoLinkedDateIdsRef\.current\.add\(fieldId\);/);
    assert.match(dialog, /existingId === undefined && autoLinkedDateIdsRef\.current\.has\(field\.id\)\s+\? "AUTO_NEAREST"/);
  });
});

describe("One-shot placement tools (source)", () => {
  const dialog = read("components/signings/signing-preview-dialog.tsx");
  const place = slice(dialog, "function placeFieldAt(", "async function createField(");
  const arm = slice(dialog, "function armTool(", "function disarmTool(");
  const escape = slice(dialog, 'if (event.key === "Escape") {', "if (!editable || isTypingTarget(event.target)) return;");

  it("a successful placement disarms the tool, so a second Date needs re-arming", () => {
    assert.match(place, /persistNewFields\(documentId, pairedDate \? \[field, pairedDate\] : \[field\]\);\s+disarmTool\(\);/);
    const disarm = slice(dialog, "function disarmTool(", "/** Page anchor");
    assert.match(disarm, /setActiveTool\(null\);\s+setToolPreview\(null\);/);
  });

  it("no armed tool means a page click only clears the selection and places nothing", () => {
    assert.match(place, /const tool = activeTool;\s+if \(!tool\) \{\s+if \(selectedFieldIds\.length > 0\) setSelectedFieldIds\(\[\]\);\s+return;\s+\}/);
  });

  it("a Date with no candidate stays armed and places nothing", () => {
    const noSource = slice(place, "if (!linkedSource) {", "linkedSignatureDraftFieldId = linkedSource.id;");
    assert.doesNotMatch(noSource, /disarmTool|buildLocalField/);
  });

  it("Esc cancels the armed tool before clearing a selection or closing", () => {
    assert.ok(escape.indexOf("cancelPasteMode()") < escape.indexOf("disarmTool()"));
    assert.ok(escape.indexOf("disarmTool()") < escape.indexOf("setSelectedFieldIds([])"));
    assert.ok(escape.indexOf("disarmTool()") < escape.indexOf("handleClose()"));
  });

  it("selecting an existing field (page or list) cancels the ghost", () => {
    assert.match(slice(dialog, "function pressField(", "const wasSelected"), /if \(activeTool\) disarmTool\(\);/);
    assert.match(slice(dialog, "function selectField(", "setSelectedFieldIds([fieldId]);"), /disarmTool\(\);/);
  });

  it("participant, document, paste and close transitions leave no stale ghost", () => {
    assert.match(dialog, /cancelPasteMode\(\);\s+disarmTool\(\);\s+setSelectedParticipantId/);
    assert.match(slice(dialog, "function goToDocument(", "const handleClose"), /disarmTool\(\);/);
    assert.match(slice(dialog, "function startPasteMode(", "function cancelPasteMode("), /disarmTool\(\);/);
    assert.match(slice(dialog, "const handleClose = useCallback(", "onClose();"), /setActiveTool\(null\);\s+setToolPreview\(null\);/);
    assert.match(dialog, /setPastePreview\(null\);\s+setActiveTool\(null\);\s+setToolPreview\(null\);/);
  });

  it("arming clears the field selection and shows the ghost at once", () => {
    assert.match(arm, /cancelPasteMode\(\);/);
    assert.match(arm, /setSelectedFieldIds\(\[\]\);/);
    assert.match(arm, /setActiveTool\(tool\);/);
    assert.match(arm, /setToolPreview\(pointer \? pointToPageAnchor\(pointer\.x, pointer\.y\) : null\);/);
  });

  it("a participant-owned tool never arms without a participant", () => {
    assert.match(arm, /if \(placementHasParticipant\(tool\) && !selectedParticipantId\) \{[\s\S]*?return;\s+\}/);
  });
});

describe("Placement toolbar", () => {
  const dialog = read("components/signings/signing-preview-dialog.tsx");
  const participantSelect = slice(dialog, 'id="prepare-participant"', "</select>");

  it("lists the five tools in order with the Date tool labelled Date", () => {
    assert.deepEqual(
      PLACEMENT_TOOLS.map((tool) => [tool.type, tool.label]),
      [
        ["SIGNATURE", "Signature"],
        ["INITIALS", "Initials"],
        ["DATE_SIGNED", "Date"],
        ["PRINTED_NAME", "Printed Name"],
        ["CHECKMARK", "Checkmark"],
      ],
    );
  });

  it("requires a participant for every tool except Checkmark", () => {
    for (const tool of ["SIGNATURE", "INITIALS", "DATE_SIGNED", "PRINTED_NAME"] as const) {
      assert.equal(placementToolEnabled(tool, ""), false, tool);
      assert.equal(placementToolEnabled(tool, "p1"), true, tool);
    }
    assert.equal(placementToolEnabled("CHECKMARK", ""), true);
  });

  it("renders accessible toggle buttons with an active state; the dropdown is gone", () => {
    assert.match(dialog, /role="toolbar"/);
    assert.match(dialog, /aria-pressed=\{active\}/);
    assert.match(dialog, /data-testid=\{`placement-tool-\$\{tool\.type\}`\}/);
    assert.match(dialog, /disabled=\{!enabled\}/);
    assert.match(dialog, /onClick=\{\(\) => \(active \? disarmTool\(\) : armTool\(tool\.type\)\)\}/);
    assert.doesNotMatch(dialog, /id="prepare-field-type"|<optgroup|function changeFieldType|selectedFieldType/);
  });

  it("choosing a participant never arms a tool", () => {
    assert.doesNotMatch(participantSelect, /\barmTool\(|setActiveTool\(/);
    assert.match(participantSelect, /disarmTool\(\);/);
    assert.match(dialog, /useState<DraftFieldType \| null>\(null\)/);
  });
});

describe("Linked-source highlight; no Link to override (source)", () => {
  const dialog = read("components/signings/signing-preview-dialog.tsx");

  it("removes the Link to dropdown, the override card and every manual relink path", () => {
    for (const pattern of [
      /id="prepare-date-link"/,
      /id="relink-date"/,
      /Link to<\/Label>/,
      /Automatic: nearest on the page/,
      /chosen under Link to/,
      /function relinkSelectedDate/,
      /function armDateLink/,
      /EXPLICIT_SOURCE/,
    ]) {
      assert.doesNotMatch(dialog, pattern);
    }
  });

  it("a selected Date's participant cannot be reassigned (that would relink it)", () => {
    const reassign = slice(dialog, "function reassignSelectedField(", "function selectField(");
    assert.match(reassign, /located\.field\.fieldType === "DATE_SIGNED"\s+\) \{\s+return;/);
    assert.match(dialog, /placementHasParticipant\(selectedField\.fieldType\) &&\s+selectedField\.fieldType !== "DATE_SIGNED"/);
  });

  it("highlights only the selected Date's linked source, read-only", () => {
    assert.match(dialog, /editable && selectedField\?\.fieldType === "DATE_SIGNED"\s+\? \(selectedField\.linkedSignatureFieldId \?\? null\)\s+: null/);
    assert.match(dialog, /field\.id === linkedSourceId\s+\? "linked"/);
    assert.match(dialog, /selected=\{selectedFieldIds\.includes\(field\.id\)\}/);
    assert.match(dialog, /data-date-linked-source=\{highlight === "linked" \? "true" : undefined\}/);
  });

  it("styles candidate, target, linked and selected differently", () => {
    const candidate = /highlight === "candidate" && "ring-2 ring-amber-300 ring-offset-1"/;
    const target = /highlight === "target" && "z-10 bg-amber-50\/90 ring-2 ring-amber-600 ring-offset-1"/;
    const linked = /highlight === "linked" &&\s+"outline-dashed outline-2 outline-offset-2 outline-amber-600"/;
    const selected = /selected && "z-10 bg-sky-50\/90 ring-2 ring-sky-500 ring-offset-1"/;
    for (const pattern of [candidate, target, linked, selected]) assert.match(dialog, pattern);
  });

  it("delete and re-place relinks: a new Date near B links to B", () => {
    const initialsA = field("ia", "INITIALS", { x: 50, y: 100 });
    const initialsB = field("ib", "INITIALS", { x: 50, y: 500 });
    const nearB = { x: 160, y: 502, width: 60, height: 16 };
    assert.equal(
      nearestDateLinkSource([initialsA, initialsB], "p1", 1, nearB)?.id,
      "ib",
    );
  });

  it("a Date drag moves only the selected placements, never its linked source", () => {
    assert.match(dialog, /ids: groupMoveIds\(model, selectedFieldIds, anchorId\)/);
  });
});

describe("Auto-add notice text", () => {
  it("names the participant, never [object Object]", () => {
    assert.equal(
      formatAutoAddNotice([{ participantId: "a", fullName: "Jane Smith" }]),
      "Added from the source Packet: Jane Smith.",
    );
  });

  it("reads several names", () => {
    assert.equal(
      formatAutoAddNotice([
        { participantId: "a", fullName: "Jane Smith" },
        { participantId: "b", fullName: "John Smith" },
      ]),
      "Added from the source Packet: Jane Smith and John Smith.",
    );
    assert.equal(joinDisplayNames(["A", "B", "C"]), "A, B and C");
  });

  it("tolerates older payload shapes and drops anything without a name", () => {
    assert.equal(formatAutoAddNotice(["Jane Smith"]), "Added from the source Packet: Jane Smith.");
    const text = formatAutoAddNotice([{ participantId: "a" }, { fullName: { first: "x" } }, null, 7, " Pat "]);
    assert.equal(text, "Added from the source Packet: Pat.");
    assert.equal(formatAutoAddNotice([{}, null, "  "]), null);
    assert.equal(formatAutoAddNotice([]), null);
    assert.equal(autoAddNoticeEntryName({ fullName: "  Jane  " }), "Jane");
  });

  it("the panel renders the formatted text only", () => {
    const panel = read("components/signings/signing-draft-prep-panel.tsx");
    assert.match(panel, /const autoAddNotice = formatAutoAddNotice\(autoAddedFromPacket\);/);
    assert.match(panel, /\{autoAddNotice\}/);
    assert.doesNotMatch(panel, /joinNames\(autoAddedFromPacket|Added from the source Packet:\{" "\}/);
  });
});

describe("Date link server validation (source)", () => {
  const fields = read("lib/signing/draft-fields.ts");
  const upsert = slice(fields, "export async function upsertDraftSigningFieldWithActor", "export async function removeDraftSigningFieldWithActor");

  it("authorizes before reading, and requires a linked source for every Date", () => {
    assert.ok(upsert.indexOf("requireManageableDraftSigning(") < upsert.indexOf('.from("signing_draft_fields")'));
    assert.match(upsert, /Date Signed must be linked to a Signature or Initials field\./);
  });

  it("rejects wrong type, other participant, other document and, when automatic, other page", () => {
    assert.match(upsert, /\.eq\("signing_id", signing\.id\)\s+\.maybeSingle\(\);\s+if \(linkedError\)/);
    assert.match(upsert, /!DATE_SIGNED_SOURCE_TYPES\.includes\(linked\.field_type as string\)/);
    assert.match(upsert, /linked\.signing_participant_id !== input\.signingParticipantId/);
    assert.match(upsert, /linked\.signing_document_id !== input\.signingDocumentId/);
    assert.match(upsert, /input\.dateLinkMode === "AUTO_NEAREST" && linked\.page_number !== pageNumber/);
    assert.match(upsert, /Invalid Date Signed link mode\./);
  });
});

describe("Send readiness after placement changes", () => {
  const missing = (participantId: string) => ({
    code: "PARTICIPANT_MISSING_SIGNATURE_OR_INITIALS",
    message: "Every participant must have at least one Signature or Initials field.",
    participantId,
  });
  const drift = { code: "DOCUMENT_SOURCE_CHANGED", message: "changed", documentId: "d1" };

  it("becomes ready when the final required placement is saved", () => {
    const result = applyPreparationReadiness([missing("p1")], []);
    assert.deepEqual(result, { ready: true, blockers: [] });
  });

  it("becomes not ready again when a required placement is removed", () => {
    const result = applyPreparationReadiness([], [missing("p1")]);
    assert.equal(result.ready, false);
    assert.equal(participantMissingSignerField(result.blockers, "p1"), true);
    assert.equal(participantMissingSignerField(result.blockers, "p2"), false);
  });

  it("keeps document-source blockers, which placements cannot change", () => {
    const result = applyPreparationReadiness([missing("p1"), drift], []);
    assert.deepEqual(result, { ready: false, blockers: [drift] });
  });

  it("takes placement blockers only from the server's preparation result", () => {
    const result = applyPreparationReadiness([], [drift, missing("p2")]);
    assert.deepEqual(result.blockers, [missing("p2")]);
  });
});

describe("Send readiness wiring (source)", () => {
  const dialog = read("components/signings/signing-preview-dialog.tsx");
  const dashboard = read("components/signings/signing-dashboard-page.tsx");
  const readiness = read("lib/signing/readiness.ts");
  const activation = read("lib/signing/activation.ts");
  const actions = read("lib/signing/stage4-actions.ts");

  it("refreshes readiness once the write queue drains, newest request wins", () => {
    const enqueue = slice(dialog, "const enqueue = useCallback(", "/** Trusted server state wins");
    assert.match(enqueue, /if \(pendingRef\.current === 0\) void refreshReadiness\(\);/);
    const refresh = slice(dialog, "const refreshReadiness = useCallback(", "const enqueue = useCallback(");
    assert.match(refresh, /getSigningPreparationReadinessAction\(\{ signingId \}\)/);
    assert.match(refresh, /seq !== readinessSeqRef\.current \|\| pendingRef\.current > 0/);
  });

  it("uses no polling, timers or reloads for readiness", () => {
    for (const source of [dialog, dashboard]) {
      assert.doesNotMatch(source, /setInterval|location\.reload/);
    }
    assert.doesNotMatch(slice(dialog, "const refreshReadiness", "const enqueue"), /setTimeout/);
  });

  it("the Signing page adopts it immediately and a slower full load cannot undo it", () => {
    assert.match(dashboard, /onPreparationReadiness=\{applyPreparationReadiness\}/);
    assert.match(dashboard, /readiness=\{\{ ready: dashboard\.ready, blockers: dashboard\.blockers \}\}/);
    assert.match(dashboard, /preparationRef\.current\.seq > seqAtStart\s+\? withPreparationReadiness/);
  });

  it("the server owns readiness; activation re-evaluates everything", () => {
    assert.match(actions, /evaluateSigningPreparationReadiness\(admin, input\.signingId, actor\)/);
    assert.match(readiness, /export async function evaluateSigningPreparationReadiness/);
    assert.match(readiness, /const blockers = preparationBlockers\(authorityBundle, bundle\);/);
    assert.match(readiness, /await Promise\.all\(\s+documentRows\.map/);
    assert.match(activation, /const readiness = await evaluateSigningReadiness\(admin, signing\.id, actor\);\s+if \(!readiness\.ready\)/);
  });
});

describe("Auto-add notice is acknowledged once (source)", () => {
  const sourcePacket = read("lib/signing/source-packet.ts");
  const panel = read("components/signings/signing-draft-prep-panel.tsx");
  const migration = read("supabase/migrations/20261010120000_native_signing_auto_add_notice_ack.sql");
  const ack = slice(
    sourcePacket,
    "export async function acknowledgeDraftPacketAutoAddNoticeWithActor",
    "export type DraftRemovedPacketParticipants",
  );

  it("lists only unacknowledged, present, auto-added participants and never writes", () => {
    const notice = slice(sourcePacket, "export async function listDraftPacketAutoAddNotice", "export const AUTO_ADD_NOTICE_ACK_MAX_IDS");
    assert.match(notice, /\.is\("auto_add_notice_acknowledged_at", null\)/);
    assert.match(notice, /\.neq\("participant_status", "REMOVED"\)/);
    assert.doesNotMatch(notice, /\.update\(|\.insert\(|\.delete\(/);
  });

  it("acknowledges after Draft manage authority, only this Signing's marked rows", () => {
    assert.ok(ack.indexOf("requireManageableDraftSigning(") < ack.indexOf('.from("signing_participants")'));
    assert.match(ack, /!ids\.every\(isUuid\)/);
    assert.match(ack, /ids\.length > AUTO_ADD_NOTICE_ACK_MAX_IDS/);
    assert.match(ack, /\.update\(\{ auto_add_notice_acknowledged_at: new Date\(\)\.toISOString\(\) \}\)/);
    assert.match(ack, /\.eq\("signing_id", signing\.id\)/);
    assert.match(ack, /\.not\("auto_added_from_packet_at", "is", null\)/);
    assert.match(ack, /\.is\("auto_add_notice_acknowledged_at", null\)/);
  });

  it("acknowledges from a committed render only, never during the server render", () => {
    const effect = slice(panel, "const autoAddNoticeKey", "if (!canManage)");
    assert.match(effect, /useEffect\(\(\) => \{\s+if \(!autoAddNoticeKey\) return;\s+void acknowledgeDraftPacketAutoAddNoticeAction\(/);
    assert.doesNotMatch(read("lib/signing/dashboard.ts"), /acknowledgeDraftPacketAutoAddNotice/);
    assert.doesNotMatch(panel, /localStorage|sessionStorage/);
  });

  it("the acknowledgement column is notification metadata tied to the marker", () => {
    assert.match(migration, /add column if not exists auto_add_notice_acknowledged_at timestamptz/);
    assert.match(migration, /check \(auto_add_notice_acknowledged_at is null or auto_added_from_packet_at is not null\)/);
    assert.doesNotMatch(read("lib/signing/package-promotion.ts"), /auto_add_notice_acknowledged_at/);
  });
});
