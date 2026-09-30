import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  countPacketFormInstancesByFormId,
  DUPLICATE_PACKET_FORM_CONFIRM_LABEL,
  DUPLICATE_PACKET_FORM_TITLE_MULTIPLE,
  DUPLICATE_PACKET_FORM_TITLE_SINGLE,
  findDuplicatePacketFormSelections,
  formatDuplicatePacketFormMessage,
  formatDuplicatePacketFormTitle,
  formatPacketFormPresenceLabel,
  validatePacketFormDocumentName,
} from "./packet-form.ts";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

const AMENDMENT = { id: 101, form_name: "Amendment to Contract" };
const THIRD_PARTY = { id: 202, form_name: "Third Party Financing Addendum" };

describe("validatePacketFormDocumentName", () => {
  it("requires a nonblank packet-specific document name", () => {
    assert.equal(validatePacketFormDocumentName("  "), "Document name is required.");
  });

  it("allows a distinct amendment label", () => {
    assert.equal(
      validatePacketFormDocumentName("Amendment to Contract - price change to $400k"),
      null,
    );
  });

  it("rejects names beyond the database limit", () => {
    assert.equal(
      validatePacketFormDocumentName("a".repeat(256)),
      "Document name must be 255 characters or fewer.",
    );
  });
});

describe("duplicate packet forms are allowed", () => {
  it("counts every instance of a form, ignoring external uploads", () => {
    const counts = countPacketFormInstancesByFormId([101, null, 101, 202, undefined]);
    assert.equal(counts.get(101), 2);
    assert.equal(counts.get(202), 1);
    assert.equal(counts.size, 2);
  });

  it("flags a form already in the packet without blocking it", () => {
    const duplicates = findDuplicatePacketFormSelections([AMENDMENT], [101]);
    assert.deepEqual(duplicates, [
      { formId: 101, formName: "Amendment to Contract", existingCount: 1 },
    ]);
  });

  it("needs no confirmation when nothing selected is already in the packet", () => {
    assert.deepEqual(findDuplicatePacketFormSelections([THIRD_PARTY], [101]), []);
    assert.deepEqual(findDuplicatePacketFormSelections([AMENDMENT], []), []);
  });

  it("flags only the duplicate in a mixed selection (Form A duplicate + Form B new)", () => {
    const duplicates = findDuplicatePacketFormSelections(
      [AMENDMENT, THIRD_PARTY],
      [101],
    );
    assert.deepEqual(
      duplicates.map((duplicate) => duplicate.formId),
      [101],
    );
  });

  it("treats a form selected twice in one batch as a duplicate on the second pick", () => {
    const duplicates = findDuplicatePacketFormSelections(
      [THIRD_PARTY, THIRD_PARTY],
      [],
    );
    assert.deepEqual(duplicates, [
      { formId: 202, formName: "Third Party Financing Addendum", existingCount: 1 },
    ]);
  });

  it("reports how many copies already exist", () => {
    const [duplicate] = findDuplicatePacketFormSelections([AMENDMENT], [101, 101]);
    assert.equal(duplicate.existingCount, 2);
  });

  it("uses the confirmation wording and identifies the duplicate names", () => {
    const single = findDuplicatePacketFormSelections([AMENDMENT], [101]);
    assert.equal(formatDuplicatePacketFormTitle(single), DUPLICATE_PACKET_FORM_TITLE_SINGLE);
    assert.equal(
      DUPLICATE_PACKET_FORM_TITLE_SINGLE,
      "This form is already in the packet. Add another copy?",
    );
    assert.equal(DUPLICATE_PACKET_FORM_CONFIRM_LABEL, "Add Another");
    assert.match(
      formatDuplicatePacketFormMessage(single),
      /Amendment to Contract \(1 already in packet\)/,
    );

    const multiple = findDuplicatePacketFormSelections(
      [AMENDMENT, THIRD_PARTY],
      [101, 202],
    );
    assert.equal(
      formatDuplicatePacketFormTitle(multiple),
      DUPLICATE_PACKET_FORM_TITLE_MULTIPLE,
    );
    const message = formatDuplicatePacketFormMessage(multiple);
    assert.match(message, /Amendment to Contract/);
    assert.match(message, /Third Party Financing Addendum/);
  });

  it("labels forms already in the packet with their copy count", () => {
    assert.equal(formatPacketFormPresenceLabel(0), null);
    assert.equal(formatPacketFormPresenceLabel(1), "In packet");
    assert.equal(formatPacketFormPresenceLabel(2), "In packet (2)");
    assert.equal(formatPacketFormPresenceLabel(3), "In packet (3)");
  });
});

describe("duplicate packet form contracts", () => {
  const packetFormSource = readSource("lib/types/packet-form.ts");
  const packetSource = readSource("lib/types/packet.ts");
  const liveEditor = readSource("components/packets/packet-forms-live-editor.tsx");
  const draftEditor = readSource("components/packets/packet-forms-draft-editor.tsx");

  it("addInternalFormToPacket always inserts a new row and never looks up an existing one", () => {
    const start = packetFormSource.indexOf("export async function addInternalFormToPacket");
    const end = packetFormSource.indexOf("export async function addExternalFormToPacket", start);
    assert.ok(start >= 0 && end > start);
    const body = packetFormSource.slice(start, end);
    assert.equal(body.includes('.from("packet_forms")'), false);
    assert.equal(body.includes("maybeSingle"), false);
    assert.equal(body.includes("already in the packet"), false);
    assert.ok(body.includes("insertPacketFormRow"));
    assert.ok(body.includes("return packetFormId"));
  });

  it("packet creation accepts repeated additional forms and forms already in the collection", () => {
    assert.equal(packetSource.includes("Duplicate additional forms are not allowed"), false);
    assert.equal(packetSource.includes("validateAdditionalInternalFormId"), false);
    assert.equal(packetFormSource.includes("validateAdditionalInternalFormId"), false);
    assert.equal(packetFormSource.includes("already included from the collection"), false);
  });

  it("the live Add Forms search never disables a form because it is in the packet", () => {
    assert.equal(liveEditor.includes("alreadyIncluded"), false);
    assert.match(liveEditor, /disabled=\{isSubmitting\}\s*>/);
    assert.equal(/>\s*In packet\s*</.test(liveEditor), false);
    assert.ok(liveEditor.includes("formatPacketFormPresenceLabel"));
  });

  it("the live editor confirms only when a duplicate is selected", () => {
    const start = liveEditor.indexOf("const handleSelectInternalForm");
    const end = liveEditor.indexOf("const cancelDuplicate", start);
    const body = liveEditor.slice(start, end);
    assert.ok(body.includes("findDuplicatePacketFormSelections"));
    assert.match(body, /if \(duplicates\.length > 0\) \{[\s\S]*setPendingDuplicate[\s\S]*return;/);
    assert.ok(body.includes("void addInternalForm(form.id)"));
  });

  it("cancelling the duplicate confirmation creates nothing", () => {
    const start = liveEditor.indexOf("const cancelDuplicate");
    const end = liveEditor.indexOf("};", start);
    const body = liveEditor.slice(start, end);
    assert.ok(body.includes("setPendingDuplicate(null)"));
    assert.equal(body.includes("addInternalForm"), false);
    assert.equal(body.includes("addInternalFormToPacket"), false);
    assert.match(liveEditor, /onCancel=\{cancelDuplicate\}/);
  });

  it("the packet-creation draft editor keeps duplicates selectable and removes by position", () => {
    assert.equal(draftEditor.includes("alreadyIncluded"), false);
    assert.equal(draftEditor.includes("disabled={alreadyIncluded}"), false);
    assert.ok(draftEditor.includes("findDuplicatePacketFormSelections"));
    assert.ok(draftEditor.includes("removeInternalForm(index)"));
    assert.ok(draftEditor.includes("key={`${form.id}-${index}`}"));
  });

  it("the forward-only migration drops only the duplicate-form unique index", () => {
    const migration = readSource(
      "supabase/migrations/20260930120000_packet_forms_allow_duplicate_forms.sql",
    );
    const statements = migration
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--"));
    assert.deepEqual(statements, [
      "drop index if exists public.packet_forms_packet_form_internal_active_uidx;",
    ]);
  });
});
