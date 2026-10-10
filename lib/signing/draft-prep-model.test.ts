import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { isDateSignedSourceType } from "@/lib/signing/date-signed-link";
import {
  copyPlacements,
  dateSourceOptions,
  draftFieldCompactLabel,
  placementHasParticipant,
  planPaste,
  preferredSignatureForDate,
  reassignField,
  removalIds,
} from "@/lib/signing/draft-field-editor-state";
import { defaultPreparedContentSize } from "@/lib/signing/draft-field-sizing";
import {
  collectDraftPromotionBlockers,
  type DraftBundle,
} from "@/lib/signing/package-promotion";
import {
  participantRoleDisplay,
  roleCodeForPacketRole,
  isSigningParticipantRoleCode,
} from "@/lib/signing/participant-roles";
import { bakePreparedContentIntoPdf } from "@/lib/signing/prepared-content-pdf";
import { isPreparedContentType } from "@/lib/signing/prepared-content-types";
import type { SigningPreviewField, SigningPreviewModel } from "@/lib/signing/preview";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

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
    isRequired: !isPreparedContentType(fieldType),
    pageNumber: 1,
    x: 72,
    y: 600,
    width: 160,
    height: 40,
    participantId,
    participantFullName: participantId === "p1" ? "Bea Buyer" : participantId ? "Cal Buyer" : "",
    capacityMode: "PERSONAL",
    representedPartyName: null,
    capacityLabel: null,
    capacityWording: null,
    linkedSignatureFieldId: null,
    ...extra,
  };
}

function model(fields: SigningPreviewField[]): SigningPreviewModel {
  const participant = (id: string, fullName: string) => ({
    id,
    fullName,
    roleCode: "BUYER",
    optionalRole: "Buyer",
    capacityMode: "PERSONAL" as const,
    representedPartyName: null,
    capacityWording: null,
  });
  return {
    signingId: "s1",
    title: "Signing",
    participants: [participant("p1", "Bea Buyer"), participant("p2", "Cal Buyer")],
    documents: [
      { id: "d1", displayName: "Contract", displayOrder: 0, pageCount: 2, hasSelectedSnapshot: true, fields },
    ],
  };
}

let seq = 0;
const newId = () => `new-${(seq += 1)}`;

describe("participant role model", () => {
  it("uses the approved vocabulary and maps Packet roles", () => {
    for (const code of ["BUYER", "SELLER", "TENANT", "LANDLORD", "AGENT", "BROKER", "OTHER"]) {
      assert.equal(isSigningParticipantRoleCode(code), true);
    }
    assert.equal(isSigningParticipantRoleCode("ADMIN"), false);
    assert.equal(roleCodeForPacketRole("BUYER"), "BUYER");
    assert.equal(roleCodeForPacketRole("LANDLORD"), "LANDLORD");
    assert.equal(roleCodeForPacketRole("SPOUSE"), "OTHER");
    assert.equal(roleCodeForPacketRole("POWER_OF_ATTORNEY"), "OTHER");
  });

  it("displays role code with an optional label and keeps legacy free text", () => {
    assert.equal(participantRoleDisplay("BUYER", "Buyer"), "Buyer");
    assert.equal(participantRoleDisplay("OTHER", "Spouse"), "Other · Spouse");
    assert.equal(participantRoleDisplay("AGENT", null), "Agent");
    assert.equal(participantRoleDisplay(null, "Co-client"), "Co-client");
    assert.equal(participantRoleDisplay(null, null), null);
  });
});

describe("Date Signed linked to Signature or Initials", () => {
  const bundle = (fields: Array<Record<string, unknown>>, extra: Partial<DraftBundle> = {}): DraftBundle => ({
    documents: [{ id: "d1", display_order: 0 }],
    participants: [{ id: "p1" }, { id: "p2" }],
    fields,
    ...extra,
  });
  const f = (id: string, type: string, participant: string, linked: string | null = null) => ({
    id,
    field_type: type,
    signing_document_id: "d1",
    signing_participant_id: participant,
    linked_signature_draft_field_id: linked,
  });

  it("accepts Signature and Initials as Date sources only", () => {
    assert.equal(isDateSignedSourceType("SIGNATURE"), true);
    assert.equal(isDateSignedSourceType("INITIALS"), true);
    assert.equal(isDateSignedSourceType("DATE_SIGNED"), false);
    assert.equal(isDateSignedSourceType("PRINTED_NAME"), false);
  });

  it("is ready when a Date links to same-participant Initials", () => {
    const blockers = collectDraftPromotionBlockers(
      bundle([
        f("i1", "INITIALS", "p1"),
        f("dt", "DATE_SIGNED", "p1", "i1"),
        f("s2", "SIGNATURE", "p2"),
      ]),
    );
    assert.deepEqual(blockers, []);
  });

  it("rejects a cross-participant Date link", () => {
    const codes = collectDraftPromotionBlockers(
      bundle([
        f("i1", "INITIALS", "p1"),
        f("s2", "SIGNATURE", "p2"),
        f("dt", "DATE_SIGNED", "p2", "i1"),
      ]),
    ).map((row) => row.code);
    assert.deepEqual(codes, ["DATE_SIGNED_PARTICIPANT_MISMATCH"]);
  });

  it("blocks an unresolved Date link (missing source or Date-to-Date)", () => {
    const codes = collectDraftPromotionBlockers(
      bundle([
        f("s1", "SIGNATURE", "p1"),
        f("d0", "DATE_SIGNED", "p1", "s1"),
        f("dd", "DATE_SIGNED", "p1", "d0"),
        f("dx", "DATE_SIGNED", "p1", "gone"),
        f("s2", "SIGNATURE", "p2"),
      ]),
    ).map((row) => row.code);
    assert.deepEqual(codes, ["DATE_SIGNED_NOT_LINKED", "DATE_SIGNED_NOT_LINKED"]);
  });
});

describe("prepared content readiness", () => {
  const signerFields = [
    { id: "s1", field_type: "SIGNATURE", signing_document_id: "d1", signing_participant_id: "p1" },
  ];

  it("creates no participant requirement and never satisfies one", () => {
    const blockers = collectDraftPromotionBlockers({
      documents: [{ id: "d1", display_order: 0 }],
      participants: [{ id: "p1" }, { id: "p2" }],
      fields: signerFields,
      preparedContent: [
        { id: "pn", content_type: "PRINTED_NAME", signing_document_id: "d1", signing_participant_id: "p2" },
        { id: "ck", content_type: "CHECKMARK", signing_document_id: "d1", signing_participant_id: null },
      ],
    });
    assert.deepEqual(
      blockers.map((row) => [row.code, row.participantId]),
      [["PARTICIPANT_MISSING_SIGNATURE_OR_INITIALS", "p2"]],
    );
  });

  it("is ready with prepared content once every participant has a signing field", () => {
    const blockers = collectDraftPromotionBlockers({
      documents: [{ id: "d1", display_order: 0 }],
      participants: [{ id: "p1" }],
      fields: signerFields,
      preparedContent: [
        { id: "pn", content_type: "PRINTED_NAME", signing_document_id: "d1", signing_participant_id: "p1" },
        { id: "ck", content_type: "CHECKMARK", signing_document_id: "d1", signing_participant_id: null },
      ],
    });
    assert.deepEqual(blockers, []);
  });

  it("blocks prepared content on an excluded document or for a removed participant", () => {
    const codes = collectDraftPromotionBlockers({
      documents: [{ id: "d1", display_order: 0 }],
      participants: [{ id: "p1" }],
      fields: signerFields,
      preparedContent: [
        { id: "ck", content_type: "CHECKMARK", signing_document_id: "d9", signing_participant_id: null },
        { id: "pn", content_type: "PRINTED_NAME", signing_document_id: "d1", signing_participant_id: "gone" },
      ],
    }).map((row) => row.code);
    assert.deepEqual(codes, [
      "PREPARED_CONTENT_DOCUMENT_NOT_INCLUDED",
      "PREPARED_CONTENT_PARTICIPANT_UNKNOWN",
    ]);
  });
});

describe("editor state: Initials-linked Dates", () => {
  const state = () =>
    model([
      field("sig", "SIGNATURE", "p1"),
      field("ini", "INITIALS", "p1", { y: 100, width: 40, height: 20 }),
      field("idate", "DATE_SIGNED", "p1", { linkedSignatureFieldId: "ini", x: 130, y: 100 }),
    ]);

  it("removing Initials removes its linked Date", () => {
    assert.deepEqual(removalIds(state(), "ini").sort(), ["idate", "ini"]);
  });

  it("reassigning Initials moves its linked Date with it", () => {
    const next = reassignField(state(), "ini", "p2");
    const fields = next.documents[0].fields;
    assert.equal(fields.find((row) => row.id === "ini")!.participantId, "p2");
    assert.equal(fields.find((row) => row.id === "idate")!.participantId, "p2");
  });

  it("offers Signature and Initials as Date sources, but auto-picks only Signatures", () => {
    const fields = state().documents[0].fields;
    assert.deepEqual(dateSourceOptions(fields, "p1").map((row) => row.id), ["ini", "sig"]);
    assert.equal(preferredSignatureForDate(fields, "p1", 1)?.id, "sig");
    const initialsOnly = fields.filter((row) => row.id !== "sig");
    assert.equal(preferredSignatureForDate(initialsOnly, "p1", 1), null);
  });
});

describe("paste-placement mode (anchor paste)", () => {
  it("places a copied Initials centred on the click and creates nothing else", () => {
    const state = model([field("ini", "INITIALS", "p1", { x: 72, y: 100, width: 40, height: 20 })]);
    const plan = planPaste({
      model: state,
      documentId: "d1",
      clipboard: copyPlacements(state, ["ini"]),
      pageSizes: PAGES,
      anchor: { pageNumber: 2, x: 300, y: 400 },
      newId,
    });
    assert.deepEqual(plan.rejected, []);
    assert.equal(plan.fields.length, 1, "one copied Initials pastes as exactly one field");
    const [pasted] = plan.fields;
    assert.equal(pasted.fieldType, "INITIALS");
    assert.equal(pasted.participantId, "p1");
    assert.equal(pasted.pageNumber, 2);
    assert.deepEqual([pasted.x, pasted.y, pasted.width, pasted.height], [280, 390, 40, 20]);
  });

  it("keeps Signature + Date relative geometry and linkage", () => {
    const state = model([
      field("sig", "SIGNATURE", "p1", { x: 72, y: 600, width: 160, height: 40 }),
      field("date", "DATE_SIGNED", "p1", { linkedSignatureFieldId: "sig", x: 250, y: 616, width: 60, height: 24 }),
    ]);
    const plan = planPaste({
      model: state,
      documentId: "d1",
      clipboard: copyPlacements(state, ["sig", "date"]),
      pageSizes: PAGES,
      anchor: { pageNumber: 1, x: 252, y: 220 },
      newId,
    });
    assert.equal(plan.fields.length, 2);
    const sig = plan.fields.find((row) => row.fieldType === "SIGNATURE")!;
    const date = plan.fields.find((row) => row.fieldType === "DATE_SIGNED")!;
    assert.equal(date.linkedSignatureFieldId, sig.id);
    assert.equal(date.x - sig.x, 250 - 72);
    assert.equal(date.y - sig.y, 616 - 600);
    assert.deepEqual([sig.x, sig.y], [172, 200]);
  });

  it("pastes Initials + linked Date as a new linked pair", () => {
    const state = model([
      field("ini", "INITIALS", "p1", { y: 100, width: 40, height: 20 }),
      field("idate", "DATE_SIGNED", "p1", { linkedSignatureFieldId: "ini", x: 130, y: 100 }),
    ]);
    const plan = planPaste({
      model: state,
      documentId: "d1",
      clipboard: copyPlacements(state, ["ini", "idate"]),
      pageSizes: PAGES,
      anchor: { pageNumber: 1, x: 300, y: 300 },
      newId,
    });
    const ini = plan.fields.find((row) => row.fieldType === "INITIALS")!;
    const date = plan.fields.find((row) => row.fieldType === "DATE_SIGNED")!;
    assert.equal(plan.fields.length, 2);
    assert.equal(date.linkedSignatureFieldId, ini.id);
  });

  it("clamps the group at the page edge like a group move", () => {
    const state = model([field("ini", "INITIALS", "p1", { width: 40, height: 20 })]);
    const plan = planPaste({
      model: state,
      documentId: "d1",
      clipboard: copyPlacements(state, ["ini"]),
      pageSizes: PAGES,
      anchor: { pageNumber: 1, x: 610, y: 790 },
      newId,
    });
    assert.deepEqual([plan.fields[0].x, plan.fields[0].y], [572, 772]);
  });

  it("rejects a page that does not exist and pastes prepared content without participants", () => {
    const state = model([
      field("ck", "CHECKMARK", "", { width: 12, height: 12 }),
      field("pn", "PRINTED_NAME", "p1", { y: 300 }),
    ]);
    const missing = planPaste({
      model: state,
      documentId: "d1",
      clipboard: copyPlacements(state, ["ck"]),
      pageSizes: { 1: PAGE },
      anchor: { pageNumber: 3, x: 10, y: 10 },
      newId,
    });
    assert.equal(missing.fields.length, 0);
    assert.match(missing.rejected.join(" "), /Page 3 does not exist/);

    const plan = planPaste({
      model: state,
      documentId: "d1",
      clipboard: copyPlacements(state, ["ck", "pn"]),
      pageSizes: PAGES,
      anchor: { pageNumber: 1, x: 100, y: 100 },
      newId,
    });
    const ck = plan.fields.find((row) => row.fieldType === "CHECKMARK")!;
    const pn = plan.fields.find((row) => row.fieldType === "PRINTED_NAME")!;
    assert.equal(ck.participantId, "");
    assert.equal(ck.isRequired, false);
    assert.equal(pn.participantId, "p1");
    assert.equal(plan.fields.length, 2);
  });
});

describe("prepared content rendering", () => {
  it("labels Printed Name with the participant name and Checkmark with a check", () => {
    assert.equal(draftFieldCompactLabel(field("pn", "PRINTED_NAME", "p1")), "Bea Buyer");
    assert.equal(draftFieldCompactLabel(field("ck", "CHECKMARK", "")), "✓");
    assert.equal(placementHasParticipant("CHECKMARK"), false);
    assert.equal(placementHasParticipant("PRINTED_NAME"), true);
    assert.deepEqual(defaultPreparedContentSize("CHECKMARK", ""), { width: 12, height: 12 });
    assert.ok(defaultPreparedContentSize("PRINTED_NAME", "Bea Buyer").width >= 60);
  });

  it("bakes deterministically and leaves bytes untouched with nothing to bake", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    const source = await doc.save({ useObjectStreams: false });
    assert.equal(await bakePreparedContentIntoPdf(source, []), source);
    const items = [
      { contentType: "PRINTED_NAME" as const, pageNumber: 1, x: 72, y: 100, width: 160, height: 16, text: "Bea Buyer" },
      { contentType: "CHECKMARK" as const, pageNumber: 2, x: 300, y: 300, width: 12, height: 12, text: null },
    ];
    const first = await bakePreparedContentIntoPdf(source, items);
    const second = await bakePreparedContentIntoPdf(source, items);
    assert.deepEqual(Buffer.from(first), Buffer.from(second));
    assert.notDeepEqual(Buffer.from(first), Buffer.from(source));
    const baked = await PDFDocument.load(first);
    assert.equal(baked.getPageCount(), 2);
    await assert.rejects(
      bakePreparedContentIntoPdf(source, [{ ...items[1], pageNumber: 9 }]),
      /missing page 9/,
    );
  });
});

describe("Draft prep security boundaries (source)", () => {
  const actions = read("lib/signing/stage3-actions.ts");
  const participants = read("lib/signing/draft-participants.ts");
  const prepared = read("lib/signing/draft-prepared-content.ts");
  const sourcePacket = read("lib/signing/source-packet.ts");
  const migration = read(
    "supabase/migrations/20261008120000_native_signing_draft_prep_roles_prepared_content.sql",
  );

  it("never accepts a browser-supplied linked User id", () => {
    assert.doesNotMatch(actions, /linkedUserId/);
    assert.doesNotMatch(participants, /input\.linkedUserId/);
    assert.match(participants, /linkedUserId: actor\.userId/);
  });

  it("authorizes manage before any prepared-content or refresh read/write", () => {
    for (const name of [
      "upsertDraftPreparedContentWithActor",
      "removeDraftPreparedContentWithActor",
    ]) {
      const body = prepared.slice(prepared.indexOf(`function ${name}`));
      assert.ok(
        body.indexOf("requireManageableDraftSigning") < body.indexOf(".from("),
        `${name} authorizes first`,
      );
    }
    for (const name of [
      "loadDraftRemovedPacketParticipantsWithActor",
      "restoreDraftPacketParticipantWithActor",
    ]) {
      const start = sourcePacket.indexOf(`function ${name}`);
      assert.ok(start > 0, `${name} exists`);
      const body = sourcePacket.slice(start);
      const authorizeAt = body.indexOf("requireManageableDraftSigning");
      assert.ok(authorizeAt > 0 && authorizeAt < body.indexOf("buildPacketParties"));
    }
    for (const name of [
      "loadInternalSignerOptionsWithActor",
      "includeInternalSignerWithActor",
      "updateDraftSigningParticipantWithActor",
      "removeDraftSigningParticipantWithActor",
    ]) {
      const body = participants.slice(participants.indexOf(`function ${name}`));
      assert.ok(body.indexOf("requireManageableDraftSigning") < body.indexOf(".from("));
    }
    const dashboard = read("lib/signing/dashboard.ts");
    const authorizeAt = dashboard.indexOf("requireManageableDraftSigning(");
    assert.ok(authorizeAt > 0);
    assert.ok(authorizeAt < dashboard.indexOf("autoAddDraftPacketParticipants("));
    assert.ok(authorizeAt < dashboard.indexOf("syncDraftParticipantIdentities("));
  });

  it("imports only the actor's own Packet contacts and never by name/email", () => {
    assert.match(sourcePacket, /party\.contactOwnerUserId === actor\.userId/);
    assert.match(sourcePacket, /packetSourceEligibility\(packet, actor\.userId\)\.eligible/);
    assert.doesNotMatch(sourcePacket, /\.eq\("full_name"|\.eq\("email"/);
  });

  it("keeps prepared content out of signer evidence", () => {
    assert.doesNotMatch(prepared, /signing_adopted_marks|signing_fields|signing_field_placements/);
    const ceremony = read("lib/signing/ceremony-context.ts");
    const placements = read("lib/signing/placements.ts");
    assert.doesNotMatch(ceremony, /signing_draft_prepared_content/);
    assert.doesNotMatch(placements, /signing_draft_prepared_content|PRINTED_NAME|CHECKMARK/);
    assert.match(migration, /check \(field_type in \('SIGNATURE', 'INITIALS', 'DATE_SIGNED'\)\)|signing_fields_enforce_date_link/);
    assert.doesNotMatch(migration, /alter table public\.signing_fields\s+drop constraint signing_fields_type_check/);
  });

  it("locks the new table down and enforces Draft-only, same-participant links in the database", () => {
    assert.match(migration, /alter table public\.signing_draft_prepared_content force row level security/);
    assert.match(migration, /revoke all on table public\.signing_draft_prepared_content from authenticated/);
    assert.match(migration, /revoke all on table public\.signing_draft_prepared_content from anon/);
    assert.match(migration, /SIGNING_PREPARED_CONTENT_NOT_DRAFT/);
    assert.match(migration, /v_source\.signing_participant_id <> new\.signing_participant_id/);
    assert.match(migration, /v_source\.package_revision_participant_id <> new\.package_revision_participant_id/);
    assert.match(migration, /v_source\.field_type not in \('SIGNATURE', 'INITIALS'\)/);
    assert.match(migration, /signing_participants_signing_linked_user_key/);
  });

  it("paste mode intercepts the page click instead of placing a field", () => {
    const dialog = read("components/signings/signing-preview-dialog.tsx");
    assert.match(dialog, /if \(pasteMode\) return;/);
    assert.match(dialog, /data-testid="paste-placement-layer"/);
    assert.match(dialog, /startPasteMode\(\);/);
    assert.match(dialog, /data-testid=\{`placement-tool-\$\{tool\.type\}`\}/);
  });
});
