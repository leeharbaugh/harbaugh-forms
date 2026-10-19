import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { expectedTypedInitialsText } from "./adopted-marks";
import type { CeremonyFieldView } from "./ceremony-context";
import { SIGNING_CEREMONY_EXIT_COPY } from "./ceremony-exit";
import {
  ceremonyFieldListEntries,
  ceremonyGuidanceText,
  nextIncompleteCeremonyField,
  type CeremonyActionableField,
} from "./ceremony-field-view";
import { suggestTypedInitialsFromDisplayName } from "./initials-suggestion";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");

const shell = read("components/sign/ceremony-shell.tsx");
const viewer = read("components/sign/ceremony-document-viewer.tsx");
const adoptedMarks = read("lib/signing/adopted-marks.ts");
const actions = read("lib/signing/ceremony-actions.ts");
const placements = read("lib/signing/placements.ts");
const finish = read("lib/signing/ceremony-finish.ts");

const field = (
  overrides: Partial<CeremonyFieldView> & Pick<CeremonyFieldView, "fieldId" | "fieldType">,
): CeremonyFieldView => ({
  revisionDocumentId: "doc-a",
  isRequired: true,
  pageNumber: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 20,
  linkedSignatureFieldId: null,
  placementId: null,
  acceptedAt: null,
  renderedSenderLocalDate: null,
  ...overrides,
});

const documents = [
  { revisionDocumentId: "doc-a", displayOrder: 1, displayName: "Purchase Contract" },
  { revisionDocumentId: "doc-b", displayOrder: 2, displayName: "Addendum" },
];

function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  const indent = signature.match(/^ */)?.[0] ?? "";
  return source.slice(start, source.indexOf(`\n${indent}}\n`, start));
}

describe("Ceremony marks come from the Signing identity", () => {
  it("derives initials deterministically from the frozen Signing name", () => {
    for (const [name, initials] of [
      ["Lee Harbaugh", "LH"],
      ["  lee   harbaugh ", "LH"],
      ["Mary-Jane Smith", "MJS"],
      ["Dr Jane Q Public Jr.", "JQP"],
    ] as const) {
      assert.equal(expectedTypedInitialsText({ displayedName: name }), initials);
      assert.equal(
        expectedTypedInitialsText({ displayedName: name }),
        suggestTypedInitialsFromDisplayName(name),
      );
    }
  });

  it("rejects typed initials that differ from the derivation, and empty derivations", () => {
    const initialsBranch = adoptedMarks.slice(
      adoptedMarks.indexOf("typedText = parseTypedInitialsText(options.typedText);"),
      adoptedMarks.indexOf("} else {\n    // Validate payload shape first"),
    );
    assert.match(initialsBranch, /const expected = expectedTypedInitialsText\(context\);/);
    assert.match(initialsBranch, /if \(!expected\) \{\s*throw new SigningError\(\s*"VALIDATION_FAILED"/);
    assert.match(initialsBranch, /if \(typedText !== expected\) \{\s*throw new SigningError\(\s*"VALIDATION_FAILED"/);
  });

  it("keeps the typed Signature exact-match to the Signing name or capacity wording", () => {
    assert.match(
      adoptedMarks,
      /const expected = context\.expectedTypedSignatureText\.trim\(\);\s*if \(!expected \|\| typedText !== expected\) \{/,
    );
  });

  it("Start signing records marks from server-side identity only", () => {
    const start = functionBody(actions, "export async function startCeremonySigningAction");
    assert.match(start, /startCeremonySigningAction\(\): Promise/);
    assert.match(start, /prepareCeremonyMarks\(\{ admin, context \}\)/);
    const prepare = functionBody(adoptedMarks, "export async function prepareCeremonyMarks");
    assert.match(prepare, /context\.expectedTypedSignatureText\.trim\(\)/);
    assert.match(prepare, /expectedTypedInitialsText\(context\)/);
    assert.match(prepare, /representationType: "TYPED",\s*typedText: expected,/);
    assert.doesNotMatch(prepare, /options\.typedText/);
    // Locked or already-matching marks are not re-adopted (no duplicate evidence).
    assert.match(prepare, /existing\.lockedAt \|\|/);
  });

  it("no longer exposes a browser-supplied mark-text action", () => {
    assert.doesNotMatch(actions, /export async function adoptCeremonyMarkAction/);
    assert.doesNotMatch(shell, /adoptCeremonyMarkAction|typedText:|setTypedInitials|<Input/);
    assert.match(shell, /startCeremonySigningAction\(\)/);
  });

  it("shows the marks read-only and avoids adoption wording", () => {
    assert.match(shell, /overview\.expectedTypedSignatureText \|\| overview\.displayedName/);
    assert.match(shell, /\{overview\.typedInitials\}/);
    assert.match(shell, /These cannot be changed here\./);
    assert.doesNotMatch(shell, /\badopt/i);
    assert.doesNotMatch(viewer, /\badopt/i);
  });

  it("records the evidence source of each mark's text", () => {
    assert.match(adoptedMarks, /textSource:/);
    assert.match(adoptedMarks, /"DERIVED_FROM_FROZEN_PARTICIPANT_NAME"/);
    assert.match(adoptedMarks, /browserSessionId: context\.session\.sessionId/);
    assert.match(adoptedMarks, /packageRevisionId: context\.packageRevisionId/);
  });

  it("requires e-sign consent on the server for marks, placements and Finish", () => {
    assert.match(
      functionBody(adoptedMarks, "export async function adoptCeremonyMark("),
      /await requireConsentSatisfied\(/,
    );
    const start = functionBody(adoptedMarks, "export async function prepareCeremonyMarks(");
    assert.ok(
      start.indexOf("await requireConsentSatisfied(") > 0 &&
        start.indexOf("await requireConsentSatisfied(") < start.indexOf('.from("signing_fields")'),
      "Start signing checks consent before reading or reusing marks",
    );
    for (const name of ["acceptFieldPlacement", "replaceFieldPlacement"]) {
      const body = functionBody(placements, `export async function ${name}(`);
      const consentAt = body.indexOf("await requireConsentSatisfied(");
      assert.ok(consentAt > 0, `${name} must require consent`);
      assert.ok(consentAt < body.indexOf("requirePlaceableField("), `${name} checks consent first`);
    }
    assert.match(
      functionBody(finish, "export async function finishParticipantSigning("),
      /await requireConsentSatisfied\(/,
    );
  });
});

describe("Ceremony guidance and navigation", () => {
  const fields = [
    field({ fieldId: "a1-sig", fieldType: "SIGNATURE", y: 600 }),
    field({ fieldId: "a1-opt", fieldType: "INITIALS", y: 50, isRequired: false }),
    field({ fieldId: "a2-ini", fieldType: "INITIALS", pageNumber: 2 }),
    field({ fieldId: "b1-sig", fieldType: "SIGNATURE", revisionDocumentId: "doc-b" }),
  ];

  it("starts at the first incomplete required field in stable order", () => {
    assert.equal(
      nextIncompleteCeremonyField(fields, documents, null, { requiredOnly: true })?.fieldId,
      "a1-sig",
    );
    // Without requiredOnly the optional field higher on the page comes first.
    assert.equal(nextIncompleteCeremonyField(fields, documents)?.fieldId, "a1-opt");
  });

  it("advances across pages and documents, then reports none left", () => {
    const opts = { requiredOnly: true };
    assert.equal(nextIncompleteCeremonyField(fields, documents, "a1-sig", opts)?.fieldId, "a2-ini");
    assert.equal(nextIncompleteCeremonyField(fields, documents, "a2-ini", opts)?.fieldId, "b1-sig");
    const done = fields.map((entry) =>
      entry.isRequired ? { ...entry, placementId: "p" } : entry,
    );
    assert.equal(nextIncompleteCeremonyField(done, documents, "b1-sig", opts), null);
  });

  it("wraps back to a required field the participant skipped", () => {
    const skipped = fields.map((entry) =>
      entry.fieldId === "b1-sig" || entry.fieldId === "a2-ini" ? { ...entry, placementId: "p" } : entry,
    );
    assert.equal(
      nextIncompleteCeremonyField(skipped, documents, "b1-sig", { requiredOnly: true })?.fieldId,
      "a1-sig",
    );
  });

  it("names the hint by mark type", () => {
    assert.equal(ceremonyGuidanceText(fields[0] as CeremonyActionableField), "Click here to sign");
    assert.equal(ceremonyGuidanceText(fields[2] as CeremonyActionableField), "Click here to initial");
  });

  it("navigates only after the server accepts a mark", () => {
    const place = functionBody(shell, "  function placeField(");
    const onSuccessAt = place.indexOf("onSuccess: () => {");
    assert.ok(onSuccessAt > 0);
    assert.ok(place.indexOf("goToField(next, true)") > onSuccessAt);
    // run() calls onSuccess only on an ok result; failures keep the field and offer retry.
    const run = functionBody(shell, "  function run(");
    const failureAt = run.indexOf("if (!result.ok) {");
    const successAt = run.indexOf("options?.onSuccess?.(result.data);");
    assert.ok(failureAt > 0 && successAt > failureAt);
    assert.match(run.slice(failureAt, successAt), /setRetryField\(options\.retry\)/);
    assert.match(run, /catch \{\s*setError\(NETWORK_ERROR\);/);
  });

  it("guidance never applies a mark", () => {
    const goTo = functionBody(shell, "  function goToField(");
    assert.doesNotMatch(goTo, /placeCeremonyFieldAction|onPlace/);
    assert.equal(viewer.match(/onPlace\(/g)?.length, 2);
    assert.match(viewer, /onClick=\{\(\) => onPlace\(field\)\}/);
    assert.doesNotMatch(viewer, /setTimeout|setInterval/);
  });

  it("moves focus to Finish only once the refreshed server state allows it", () => {
    assert.match(
      shell,
      /if \(focusFinishWhenReady\.current && overview\.canFinish && !pending\) \{/,
    );
  });

  it("keeps review free: documents switch at any time and the hint can be dismissed", () => {
    assert.match(viewer, /aria-label="Dismiss hint"/);
    assert.match(viewer, /data-ceremony-document=\{document\.revisionDocumentId\}/);
    assert.match(viewer, /"fit-width"/);
    assert.match(viewer, /"fit-page"/);
  });
});

describe("Your fields", () => {
  it("labels rows by kind, document, page and status, and tells repeats apart", () => {
    const entries = ceremonyFieldListEntries(
      [
        field({ fieldId: "i-right", fieldType: "INITIALS", pageNumber: 2, y: 700, x: 400 }),
        field({ fieldId: "i-left", fieldType: "INITIALS", pageNumber: 2, y: 700, x: 50, placementId: "p" }),
        field({ fieldId: "s", fieldType: "SIGNATURE", pageNumber: 2, y: 600 }),
        field({ fieldId: "d", fieldType: "DATE_SIGNED", pageNumber: 2, y: 600 }),
        field({ fieldId: "b", fieldType: "INITIALS", revisionDocumentId: "doc-b" }),
      ],
      documents,
    );
    assert.deepEqual(
      entries.map((entry) => [
        entry.field.fieldId,
        entry.kindLabel,
        entry.documentName,
        entry.pageNumber,
        entry.positionOnPage,
        entry.status,
      ]),
      [
        ["s", "Signature", "Purchase Contract", 2, null, "Remaining"],
        ["i-left", "Initials", "Purchase Contract", 2, "1 of 2", "Completed"],
        ["i-right", "Initials", "Purchase Contract", 2, "2 of 2", "Remaining"],
        ["b", "Initials", "Addendum", 1, null, "Remaining"],
      ],
    );
  });

  it("navigates spatially and never shows ids", () => {
    assert.match(shell, /goToField\(field, !completed\);/);
    assert.match(shell, /aria-label=\{`Go to \$\{entry\.kindLabel\}, \$\{where\}/);
    assert.doesNotMatch(shell, /\{field\.fieldId\}<|\{entry\.field\.fieldId\}</);
  });

  it("offers Replace / Remove only for completed fields", () => {
    const rowActions = shell.slice(shell.indexOf("{completed ? (\n                        <div"));
    assert.match(rowActions, /replacePlacement\(field, clientRequestId\)/);
    assert.match(rowActions, /removePlacement\(field, clientRequestId\)/);
  });
});

describe("Finish, Exit and Decline wording and boundaries", () => {
  it("distinguishes the participant's ready state from Signing completion", () => {
    assert.match(shell, /All required fields are complete\./);
    assert.match(shell, /Click Finish Signing when you are done reviewing\./);
    assert.match(shell, /disabled=\{pending \|\| !allRequiredComplete\}/);
    assert.match(shell, /const allRequiredComplete = overview\.canFinish;/);
  });

  it("confirms Finish with the irreversibility and pending-others wording", () => {
    assert.match(shell, /You are finishing your part of this Signing\./);
    assert.match(shell, /you cannot change your signature, initials, or any of\s+your fields\./);
    assert.match(shell, /The Signing may still be waiting for other participants or final\s+processing\./);
    assert.match(shell, /onConfirm=\{\(\) => runTerminal\(\(\) => finishCeremonyAction\(\)\)\}/);
  });

  it("uses done-page copy that claims nothing beyond this participant", () => {
    assert.deepEqual(SIGNING_CEREMONY_EXIT_COPY.finished, {
      title: "You have finished signing.",
      body: "You may now close this browser.",
    });
    const copy = JSON.stringify(SIGNING_CEREMONY_EXIT_COPY.finished);
    assert.doesNotMatch(copy, /email|every participant|completed documents/i);
  });

  it("keeps Exit a session-only action that says it is not a decline", () => {
    const exit = functionBody(actions, "export async function exitCeremonyAction");
    assert.match(exit, /reason: "PARTICIPANT_EXIT"/);
    assert.doesNotMatch(exit, /declineSigning|removeFieldPlacement|participant_status/);
    assert.match(SIGNING_CEREMONY_EXIT_COPY.exited.body, /You have not declined\./);
    assert.match(shell, />\s*Leave for now\s*</);
  });

  it("requires a separate destructive confirmation to Decline", () => {
    assert.match(shell, /onClick=\{\(\) => setDeclineOpen\(true\)\}/);
    const dialog = shell.slice(shell.indexOf("const declineDialog = ("));
    assert.match(dialog, /variant="destructive"/);
    assert.match(dialog, /confirmLabel="Yes, decline to sign"/);
    assert.match(dialog, /declineCeremonyAction\(\{ confirmed: true, reason: declineReason \}\)/);
    assert.match(dialog, /choose Leave for now instead/);
    const decline = read("lib/signing/ceremony-decline.ts");
    assert.match(decline, /if \(options\.confirmed !== true\) \{/);
  });
});
