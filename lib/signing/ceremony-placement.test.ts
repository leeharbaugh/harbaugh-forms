import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveActionableRevisionId } from "./ceremony-context";
import { FINALIZE_SIGNING_WORK_TYPE } from "./ceremony-finish";
import { SigningError } from "./errors";
import { senderLocalDate } from "./placements";
import { NATIVE_SIGNING_STAGE1_MIGRATIONS } from "./stage1-schema";

const root = process.cwd();
// Newlines are normalized so ordering assertions can match multi-line call
// chains regardless of the checkout's line endings.
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8").replace(/\r\n/g, "\n");

describe("Native Signing ceremony placements, Finish, and Decline", () => {
  const placements = read("lib/signing/placements.ts");
  const marks = read("lib/signing/adopted-marks.ts");
  const context = read("lib/signing/ceremony-context.ts");
  const finish = read("lib/signing/ceremony-finish.ts");
  const decline = read("lib/signing/ceremony-decline.ts");
  const documents = read("lib/signing/ceremony-documents.ts");

  it("places marks only in the participant's own current-revision fields", () => {
    assert.match(placements, /\.eq\("package_revision_id", context\.packageRevisionId\)/);
    assert.match(
      placements,
      /\.eq\("package_revision_participant_id", context\.revisionParticipantId\)/,
    );
    // An unknown, foreign-revision, or other-participant field is one answer.
    assert.match(placements, /That field is not assigned to you/);
    assert.match(placements, /code: "CEREMONY_FORBIDDEN"|"CEREMONY_FORBIDDEN"/);
    // Only SIGNATURE and INITIALS are participant-placeable.
    assert.match(
      placements,
      /fieldType !== "SIGNATURE" && fieldType !== "INITIALS"/,
    );
    assert.match(
      placements,
      /Date Signed is applied automatically with its signature/,
    );
  });

  it("requires the frozen revision to still be the current revision", () => {
    const session = {
      currentPackageRevisionId: "11111111-1111-4111-8111-111111111111",
      frozenPackageRevisionId: null as string | null,
    };
    assert.equal(
      resolveActionableRevisionId(session),
      session.currentPackageRevisionId,
    );
    assert.equal(
      resolveActionableRevisionId({
        currentPackageRevisionId: session.currentPackageRevisionId,
        frozenPackageRevisionId: session.currentPackageRevisionId,
      }),
      session.currentPackageRevisionId,
    );
    assert.throws(
      () =>
        resolveActionableRevisionId({
          currentPackageRevisionId: session.currentPackageRevisionId,
          frozenPackageRevisionId: "22222222-2222-4222-8222-222222222222",
        }),
      (error: unknown) =>
        error instanceof SigningError && error.code === "CONFLICT",
    );
    assert.throws(
      () =>
        resolveActionableRevisionId({
          currentPackageRevisionId: null,
          frozenPackageRevisionId: null,
        }),
      (error: unknown) =>
        error instanceof SigningError && error.code === "CONFLICT",
    );
  });

  it("freezes the package before the first placement exists", () => {
    assert.match(
      placements,
      /async function freezePackageRevisionOnFirstMark/,
    );
    assert.match(
      placements,
      /\.update\(\{ frozen_package_revision_id: context\.packageRevisionId \}\)/,
    );
    // Only the revision being acted on, only while it is still current, and
    // only when nothing is frozen yet.
    assert.match(
      placements,
      /\.eq\("current_package_revision_id", context\.packageRevisionId\)/,
    );
    assert.match(placements, /\.is\("frozen_package_revision_id", null\)/);
    assert.match(placements, /PACKAGE_FROZEN/);

    const accept = placements.slice(
      placements.indexOf("export async function acceptFieldPlacement"),
      placements.indexOf("export type RemovePlacementResult"),
    );
    const freezeAt = accept.indexOf("freezePackageRevisionOnFirstMark");
    const insertAt = accept.indexOf('.from("signing_field_placements")\n    .insert');
    const lockAt = accept.indexOf("lockAdoptedMarkOnFirstUse");
    assert.ok(freezeAt > 0);
    assert.ok(insertAt > freezeAt);
    // The mark locks only after a placement actually succeeded.
    assert.ok(lockAt > insertAt);
  });

  it("locks only the used mark kind, and only that participant's row", () => {
    assert.match(marks, /export async function lockAdoptedMarkOnFirstUse/);
    const lock = marks.slice(
      marks.indexOf("export async function lockAdoptedMarkOnFirstUse"),
      marks.indexOf("export async function requireAdoptedMarkForKind"),
    );
    assert.match(lock, /\.eq\("id", options\.markId\)/);
    assert.match(lock, /\.is\("locked_at", null\)/);
    // Not scoped by kind or participant because a mark row is already one kind
    // for one participant; the important part is that it never widens.
    assert.doesNotMatch(lock, /signing_participant_id/);
    assert.doesNotMatch(lock, /mark_kind/);

    assert.match(marks, /if \(existing\?\.lockedAt\)/);
    assert.match(marks, /"MARK_LOCKED"/);
    assert.match(placements, /requireAdoptedMarkForKind/);
    assert.match(placements, /markKind: field\.fieldType/);
  });

  it("keeps Date Signed following its Signature in the sender's timezone", () => {
    // Sender-local business date, not the participant's local date.
    const lateEvening = new Date("2026-09-18T02:30:00.000Z");
    assert.equal(senderLocalDate("America/Chicago", lateEvening), "2026-09-17");
    assert.equal(senderLocalDate("UTC", lateEvening), "2026-09-18");
    // An unusable timezone falls back rather than throwing mid-placement.
    assert.match(
      senderLocalDate("Not/AZone", lateEvening),
      /^\d{4}-\d{2}-\d{2}$/,
    );

    assert.match(placements, /\.eq\("field_type", "DATE_SIGNED"\)/);
    assert.match(
      placements,
      /\.eq\("linked_signature_field_id", field\.id as string\)/,
    );
    assert.match(placements, /async function applyLinkedDatePlacements/);
    assert.match(placements, /async function retireLinkedDatePlacements/);
    assert.match(placements, /rendered_sender_local_date: renderedDate/);
    // Accept, remove, and replace each carry the linked date along.
    for (const fn of [
      "export async function acceptFieldPlacement",
      "export async function removeFieldPlacement",
      "export async function replaceFieldPlacement",
    ]) {
      const body = placements.slice(placements.indexOf(fn));
      assert.match(body.slice(0, 4000), /LinkedDatePlacements/);
    }
  });

  it("is idempotent on every placement write", () => {
    assert.match(placements, /function placementIdempotencyKey/);
    assert.match(
      placements,
      /`\$\{operation\}:\$\{signingFieldId\}:\$\{clientRequestId\}`/,
    );
    assert.match(placements, /"ACCEPT" \| "REMOVE" \| "REPLACE" \| "DATE"/);
    assert.match(placements, /findPlacementByIdempotencyKey/);
    assert.match(placements, /replayed: true/);
    // A raced insert converges instead of surfacing a database error.
    assert.match(placements, /duplicate key/i);
    // The event log is idempotent too, so a retry cannot double-log.
    assert.match(
      placements,
      /idempotencyKey: `FIELD_PLACEMENT_ACCEPTED:\$\{placement\.placementId\}`/,
    );
    assert.match(
      placements,
      /idempotencyKey: `FIELD_PLACEMENT_REMOVED:\$\{accepted\.placementId\}`/,
    );
    assert.match(
      placements,
      /idempotencyKey: `FIELD_PLACEMENT_REPLACED:\$\{placement\.placementId\}`/,
    );

    // One accepted placement per field is a database invariant from Stage 1,
    // so convergence here is belt-and-braces rather than the only guard.
    const stage1Foundation = read(
      `supabase/migrations/${NATIVE_SIGNING_STAGE1_MIGRATIONS[0]}.sql`,
    );
    assert.match(
      stage1Foundation,
      /create unique index signing_field_placements_one_accepted_per_field_uidx[\s\S]*?where disposition = 'ACCEPTED'/,
    );
    assert.match(
      stage1Foundation,
      /create unique index signing_field_placements_idempotency_uidx/,
    );
  });

  it("retires the prior placement before inserting its replacement", () => {
    const replace = placements.slice(
      placements.indexOf("export async function replaceFieldPlacement"),
      placements.indexOf("/** Required Signature/Initials fields"),
    );
    const retireAt = replace.indexOf('.update({ disposition: "REPLACED" })');
    const insertAt = replace.indexOf('.from("signing_field_placements")\n    .insert');
    assert.ok(retireAt > 0);
    assert.ok(insertAt > retireAt);
    assert.match(replace, /replaced_by_placement_id: placement\.placementId/);
    // A replaced Signature gets a fresh server date, never the old value.
    assert.match(replace, /applyLinkedDatePlacements/);
  });

  it("treats Finish as idempotent and never completes the Signing", () => {
    assert.match(finish, /participant_status: "FINISHED", finished_at: finishedAt/);
    assert.match(finish, /\.in\("participant_status", \["PENDING", "STARTED"\]\)/);
    assert.match(finish, /replayed: true/);
    assert.match(finish, /countOutstandingRequiredFields/);
    assert.match(finish, /"NOT_READY"/);
    // Presence and the session end with Finish.
    assert.match(finish, /endCeremonyBrowserSession/);
    assert.match(finish, /reason: "PARTICIPANT_FINISHED"/);
    // Finalization is signalled, not performed, and lifecycle never advances.
    assert.match(finish, /finalization_condition: "READY"/);
    assert.equal(FINALIZE_SIGNING_WORK_TYPE, "FINALIZE_SIGNING");
    assert.match(finish, /work_type: FINALIZE_SIGNING_WORK_TYPE/);
    assert.doesNotMatch(finish, /lifecycle_state: "COMPLETE"/);
    assert.doesNotMatch(finish, /"VERIFIED"/);
    assert.match(finish, /\.eq\("lifecycle_state", "IN_PROGRESS"\)/);
    // Required-field accounting ignores automatic Date Signed fields.
    assert.match(
      placements,
      /\.in\("field_type", \["SIGNATURE", "INITIALS"\]\)/,
    );
  });

  it("declines the whole Signing only on explicit confirmation", () => {
    assert.match(decline, /options\.confirmed !== true/);
    assert.match(decline, /Declining requires explicit confirmation/);
    assert.match(decline, /participant_status: "DECLINED"/);
    assert.match(decline, /lifecycle_state: "DECLINED"/);
    assert.match(decline, /PARTICIPANT_DECLINED/);
    assert.match(decline, /SIGNING_DECLINED/);
    assert.match(decline, /releasePresenceLeasesForSigning/);
    assert.match(decline, /endActiveCeremonySessionsForSigning/);
    // Accepted marks survive as history.
    assert.doesNotMatch(decline, /\.delete\(\)/);
  });

  it("serves only prepared version bytes, verified before display", () => {
    assert.match(documents, /isPreparedVersionObjectKey/);
    assert.match(documents, /draft-snapshots/);
    assert.doesNotMatch(
      documents,
      /from\("signing_document_draft_snapshots"\)/,
    );
    assert.match(documents, /createHash\("sha256"\)/);
    assert.match(documents, /actualSha256 !== expectedSha256/);
    assert.match(documents, /"INTEGRITY_MISMATCH"/);
    // Revision membership is re-checked for the requesting participant.
    assert.match(documents, /signing_package_revision_participants/);
    assert.match(documents, /resolveActionableRevisionId/);
  });

  it("derives the ceremony read model without exposing other participants", () => {
    const overview = context.slice(
      context.indexOf("export async function loadCeremonyOverview"),
    );
    assert.match(
      overview,
      /\.eq\("package_revision_participant_id", revisionParticipantId\)/,
    );
    assert.match(
      overview,
      /\.eq\("signing_participant_id", session\.signingParticipantId\)/,
    );
    assert.match(overview, /requiredRemaining/);
    assert.match(overview, /canFinish/);
    assert.doesNotMatch(overview, /\bemail\b/i);
  });
});
