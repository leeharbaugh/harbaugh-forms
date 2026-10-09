import fontkit from "@pdf-lib/fontkit";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  fitTypedSignatureFontSize,
  typedSignatureFontSize,
} from "@/lib/pdf-text-layout";
import { suggestTypedInitialsFromDisplayName as suggestFromCeremony } from "@/lib/signing/adopted-marks";
import {
  addField,
  clampRectToPage,
  draftFieldCompactLabel,
  draftFieldDescription,
  dragExceededThreshold,
  moveField,
  pairedDatePlacement,
  preferredSignatureForDate,
  reassignField,
  removalIds,
  removeFields,
  replaceFieldId,
} from "@/lib/signing/draft-field-editor-state";
import {
  DATE_SIGNED_DEFAULT_SIZE,
  DATE_SIGNED_SAMPLE,
  DRAFT_FIELD_WIDTH_BOUNDS,
  caveatTextWidth,
  dateSignedFontSize,
  defaultDraftFieldSize,
  draftMarkFontSize,
  expectedDraftMarkText,
  type DraftMarkSigner,
} from "@/lib/signing/draft-field-sizing";
import { suggestTypedInitialsFromDisplayName } from "@/lib/signing/initials-suggestion";
import { renderRectToPdfPlacement } from "@/lib/types/template-pdf-field";
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

  it("places the linked Date Signed beside the Signature on its baseline, else below", () => {
    const page = { width: 612, height: 792 };
    const size = defaultDraftFieldSize("SIGNATURE", { fullName: "Lee Harbaugh" });
    const signature = { x: 72, y: 600, ...size };
    const date = pairedDatePlacement(signature, page);
    assert.equal(date.x, 72 + size.width + 12);
    assert.equal(date.y + date.height, signature.y + signature.height);
    assert.deepEqual([date.width, date.height], [DATE_SIGNED_DEFAULT_SIZE.width, DATE_SIGNED_DEFAULT_SIZE.height]);
    const nearEdge = pairedDatePlacement({ ...signature, x: 612 - size.width - 4 }, page);
    assert.equal(nearEdge.x, 612 - size.width - 4);
    assert.equal(nearEdge.y, 600 + size.height + 8);
  });
});

const lee: DraftMarkSigner = { fullName: "Lee Harbaugh", capacityMode: "PERSONAL" };
const REP_WORDING = "Jane Q. Public, Attorney-in-Fact for John Q. Public";
const rep: DraftMarkSigner = {
  fullName: "Jane Q. Public",
  capacityMode: "REPRESENTATIVE",
  capacityWording: REP_WORDING,
};

describe("Content-driven default field sizes", () => {
  it("derives the expected mark text the renderer will draw", () => {
    assert.equal(expectedDraftMarkText("INITIALS", lee), "LH");
    assert.equal(expectedDraftMarkText("SIGNATURE", lee), "Lee Harbaugh");
    assert.equal(expectedDraftMarkText("SIGNATURE", rep), REP_WORDING);
    assert.equal(
      expectedDraftMarkText("SIGNATURE", { ...rep, capacityWording: "  " }),
      "Jane Q. Public",
    );
    assert.equal(expectedDraftMarkText("DATE_SIGNED", lee), DATE_SIGNED_SAMPLE);
    assert.match(DATE_SIGNED_SAMPLE, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("sizes LH initials compactly and keeps longer initials bounded", () => {
    const lh = defaultDraftFieldSize("INITIALS", lee);
    assert.ok(lh.width <= 22 && lh.height <= 16, JSON.stringify(lh));
    const four = defaultDraftFieldSize("INITIALS", { fullName: "Mary Jane Kate Smith" });
    assert.equal(expectedDraftMarkText("INITIALS", { fullName: "Mary Jane Kate Smith" }), "MJKS");
    assert.ok(four.width > lh.width);
    assert.ok(four.width <= DRAFT_FIELD_WIDTH_BOUNDS.INITIALS.max);
    assert.equal(four.height, lh.height);
  });

  it("makes a short signature narrower than a long name and caps very long names", () => {
    const short = defaultDraftFieldSize("SIGNATURE", { fullName: "Al Li" });
    const normal = defaultDraftFieldSize("SIGNATURE", lee);
    const long = defaultDraftFieldSize("SIGNATURE", { fullName: "Lisa Ann Ellison Hernandez" });
    const huge = defaultDraftFieldSize("SIGNATURE", {
      fullName: "Maximiliana Alexandrina Wolfeschlegelsteinhausen-Bergerdorff",
    });
    assert.ok(short.width < normal.width && normal.width < long.width);
    assert.ok(short.width >= DRAFT_FIELD_WIDTH_BOUNDS.SIGNATURE.min);
    assert.equal(huge.width, DRAFT_FIELD_WIDTH_BOUNDS.SIGNATURE.max);
    assert.ok(normal.width < 120 && normal.height <= 24, JSON.stringify(normal));
  });

  it("sizes representative signatures from the approved execution wording", () => {
    const personal = defaultDraftFieldSize("SIGNATURE", { fullName: rep.fullName });
    const representative = defaultDraftFieldSize("SIGNATURE", rep);
    assert.ok(representative.width > personal.width);
    assert.ok(representative.width <= DRAFT_FIELD_WIDTH_BOUNDS.SIGNATURE.max);
    const size = draftMarkFontSize("SIGNATURE", REP_WORDING, representative);
    assert.ok(size >= 6);
    assert.ok(caveatTextWidth(REP_WORDING, size) <= representative.width + 0.01);
  });

  it("sizes Date Signed to the finalization date text", () => {
    const date = DATE_SIGNED_DEFAULT_SIZE;
    assert.ok(date.width <= 60 && date.height <= 18, JSON.stringify(date));
    assert.equal(dateSignedFontSize(date.height), date.height * 0.55);
  });

  it("round-trips placement geometry through the rendered page scale", () => {
    const metrics = { originalWidth: 612, originalHeight: 792, renderedWidth: 918, renderedHeight: 1188 };
    const rect = { x: 72, y: 600, ...defaultDraftFieldSize("INITIALS", lee) };
    const rendered = {
      x: (rect.x / 612) * 918,
      y: (rect.y / 792) * 1188,
      width: (rect.width / 612) * 918,
      height: (rect.height / 792) * 1188,
    };
    const back = renderRectToPdfPlacement(rendered, metrics);
    for (const key of ["x", "y", "width", "height"] as const) {
      assert.ok(Math.abs(back[key] - rect[key]) < 0.01, key);
    }
  });
});

describe("Default placements fit the completed-PDF renderer", () => {
  it("matches the browser metrics table to the embedded Caveat font", async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit as Parameters<PDFDocument["registerFontkit"]>[0]);
    const caveat = await doc.embedFont(readFileSync(join(root, "public/fonts/Caveat-Regular.ttf")));
    for (const text of ["LH", "Lee Harbaugh", REP_WORDING, "O'Neil-Smith, Jr."]) {
      const expected = caveat.widthOfTextAtSize(text, 16);
      assert.ok(Math.abs(caveatTextWidth(text, 16) - expected) < 0.2, text);
    }
  });

  it("draws every default mark inside its box without clipping", async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit as Parameters<PDFDocument["registerFontkit"]>[0]);
    const caveat = await doc.embedFont(readFileSync(join(root, "public/fonts/Caveat-Regular.ttf")));
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);

    const drawn = (text: string, box: { width: number; height: number }) => {
      const base = typedSignatureFontSize(box.height);
      const size = fitTypedSignatureFontSize({
        text,
        boxWidth: box.width,
        boxHeight: box.height,
        measureWidth: (value) => caveat.widthOfTextAtSize(value, base),
      });
      const descent = Math.abs(
        caveat.heightAtSize(size, { descender: true }) -
          caveat.heightAtSize(size, { descender: false }),
      );
      return { base, size, width: caveat.widthOfTextAtSize(text, size), bottom: 1 + size + descent };
    };

    const signers: Array<[DraftMarkSigner, "SIGNATURE" | "INITIALS"]> = [
      [lee, "INITIALS"],
      [{ fullName: "Mary Jane Kate Smith" }, "INITIALS"],
      [{ fullName: "Al Li" }, "SIGNATURE"],
      [lee, "SIGNATURE"],
      [{ fullName: "Lisa Ann Ellison Hernandez" }, "SIGNATURE"],
      [rep, "SIGNATURE"],
    ];
    for (const [signer, kind] of signers) {
      const text = expectedDraftMarkText(kind, signer);
      const box = defaultDraftFieldSize(kind, signer);
      const mark = drawn(text, box);
      assert.ok(mark.width <= box.width + 0.01, `${text} width`);
      assert.ok(mark.bottom <= box.height, `${text} height`);
      assert.ok(Math.abs(draftMarkFontSize(kind, text, box) - mark.size) < 0.05, `${text} size`);
      if (text !== REP_WORDING) assert.equal(mark.size, mark.base, `${text} not shrunk`);
    }

    const date = DATE_SIGNED_DEFAULT_SIZE;
    const dateSize = dateSignedFontSize(date.height);
    const dateWidth = helvetica.widthOfTextAtSize(DATE_SIGNED_SAMPLE, dateSize);
    assert.ok(dateWidth <= date.width - 4);
    assert.ok(dateSize + 1 < date.height);
  });
});
describe("Prepare Documents compact field labels", () => {
  const dialog = read("components/signings/signing-preview-dialog.tsx");
  const lee = {
    participantFullName: "Lee Harbaugh",
    capacityMode: "PERSONAL" as const,
    representedPartyName: null,
  };

  it("labels Initials with the ceremony's suggested initials", () => {
    assert.equal(draftFieldCompactLabel({ ...lee, fieldType: "INITIALS" }), "LH");
    assert.equal(suggestFromCeremony, suggestTypedInitialsFromDisplayName);
  });

  it("uses the human signer, not the represented party, for a representative", () => {
    const rep = {
      participantFullName: "Lee Harbaugh",
      capacityMode: "REPRESENTATIVE" as const,
      representedPartyName: "Frank Hernandez",
    };
    assert.equal(draftFieldCompactLabel({ ...rep, fieldType: "INITIALS" }), "LH");
    assert.equal(draftFieldCompactLabel({ ...rep, fieldType: "SIGNATURE" }), "Lee Harbaugh");
    assert.equal(
      draftFieldDescription({ ...rep, fieldType: "INITIALS" }),
      "Initials for Lee Harbaugh, representing Frank Hernandez",
    );
  });

  it("keeps Signature and Date labels concise", () => {
    assert.equal(draftFieldCompactLabel({ ...lee, fieldType: "SIGNATURE" }), "Lee Harbaugh");
    assert.equal(draftFieldCompactLabel({ ...lee, fieldType: "DATE_SIGNED" }), "Date");
    for (const fieldType of ["SIGNATURE", "INITIALS", "DATE_SIGNED"] as const) {
      assert.doesNotMatch(draftFieldCompactLabel({ ...lee, fieldType }), / — /);
    }
    assert.doesNotMatch(dialog, /participantFullName\} — \$\{/);
    assert.match(dialog, /aria-label=\{description\}/);
  });

  it("renders exact placement geometry without inflating small fields", () => {
    assert.doesNotMatch(dialog, /Math\.max\(\s*\(field\.width/);
    assert.doesNotMatch(dialog, /Math\.max\(\s*\(field\.height/);
    assert.match(dialog, /onResizeStop/);
    assert.match(dialog, /defaultDraftFieldSize\(selectedFieldType, participant!\)/);
    assert.match(dialog, /defaultPreparedContentSize\(selectedFieldType/);
    assert.match(dialog, /draftMarkFontSize\(field\.fieldType, text, field\)/);
  });
});

describe("Draft Participants layout", () => {
  const prep = read("components/signings/signing-draft-prep-panel.tsx");
  const dashboard = read("components/signings/signing-dashboard-page.tsx");

  it("renders Add participant with the participant list directly below", () => {
    const section = prep.slice(
      prep.indexOf('aria-labelledby="draft-participants-heading"'),
      prep.indexOf("</section>"),
    );
    const addAt = section.indexOf("Add participant");
    const listAt = section.indexOf('data-testid="draft-participant-list"');
    assert.ok(addAt > 0 && listAt > addAt);
    for (const text of ["Remove participant", "signing-capacity-mode", "represented-party", "capacity-wording", "No email"]) {
      assert.ok(section.includes(text), text);
    }
  });

  it("does not repeat a separate Participants card for a manageable Draft", () => {
    assert.match(dashboard, /\{isDraft && canManage \? null : \(\s*<Card>\s*<CardHeader>\s*<CardTitle>Participants<\/CardTitle>/);
    assert.match(dashboard, /participants=\{dashboard\.participants\}/);
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
    assert.match(sourcePacket, /requireManageableDraftSigning/);
    assert.match(sourcePacket, /owner_user_id !== actor\.userId/);
    assert.doesNotMatch(sourcePacket, /\.delete\(/);
  });

  it("binds and imports Packet parties in one transaction", () => {
    const migration = read(
      "supabase/migrations/20260928120000_native_signing_source_packet_selection.sql",
    );
    // Parties are derived before the RPC, then bind + inserts commit together.
    const deriveAt = sourcePacket.indexOf("deriveSigningParticipantsFromPacket(admin");
    const rpcAt = sourcePacket.indexOf('rpc("signing_select_source_packet"');
    assert.ok(deriveAt > 0 && rpcAt > deriveAt);
    assert.match(sourcePacket, /p_expected_source_packet_id: signing\.source_packet_id/);
    assert.doesNotMatch(sourcePacket, /bindSigningSourcePacketIfUnset/);
    assert.doesNotMatch(sourcePacket, /addDraftSigningParticipantWithActor/);
    assert.match(migration, /for update;/);
    assert.match(migration, /is distinct from p_expected_source_packet_id/);
    assert.match(migration, /SOURCE_PACKET_HAS_PARTICIPANTS/);
    assert.match(migration, /grant execute on function public\.signing_select_source_packet\(uuid, bigint, bigint, jsonb\) to service_role/);
    assert.match(migration, /from authenticated;/);
    assert.match(migration, /SOURCE_PACKET_DOCUMENT_MISMATCH/);
    assert.match(migration, /for share;/);
  });

  it("derives parties from packet_contacts and representation agreement clients", () => {
    const derive = read("lib/signing/packet-to-signing.ts");
    assert.match(derive, /from\("packet_contacts"\)/);
    assert.match(derive, /representation_agreement_clients\(contact_id, sort_order, status, contacts\(\*\)\)/);
    assert.match(derive, /BUYER_REP/);
  });

  it("returns the refreshed participant list and explains an empty Packet", () => {
    assert.match(sourcePacket, /participants: \(rows \?\? \[\]\)/);
    assert.match(prep, /await onChanged\(\);[\s\S]*setNotice\(/);
    assert.match(prep, /data\.reviewNote/);
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
    assert.match(draftFields, /A linked Date Signed always belongs to its source field's participant/);
  });
});
