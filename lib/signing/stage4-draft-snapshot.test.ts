import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildAdHocDraftSourceObjectKey,
  buildDraftSourceObjectKey,
  renderPreparedPdfFromDraftSnapshot,
  type DraftSourceSnapshotRow,
} from "./draft-source-snapshots";
import { SigningError } from "./errors";
import { buildPreparedVersionObjectKey } from "./prepare-pdf";
import { compareDraftSourceFingerprints } from "./source-drift";
import {
  isAdHocDraftSourceObjectKey,
  isDraftSourceObjectKey,
  isPreparedVersionObjectKey,
  NATIVE_SIGNING_STAGE4_MIGRATIONS,
  NATIVE_SIGNING_STAGE4_TABLES,
} from "./stage1-schema";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

describe("Native Signing Stage 4 draft source snapshot contracts", () => {
  const migration = read(
    `supabase/migrations/${NATIVE_SIGNING_STAGE4_MIGRATIONS[0]}.sql`,
  );
  const snapshots = read("lib/signing/draft-source-snapshots.ts");
  const documentVersions = read("lib/signing/document-versions.ts");
  const draftDocuments = read("lib/signing/draft-documents.ts");
  const preparePdf = read("lib/signing/prepare-pdf.ts");
  const sourceDrift = read("lib/signing/source-drift.ts");
  const readiness = read("lib/signing/readiness.ts");

  it("adds Stage 4 tables additively with deny-by-default browser access", () => {
    assert.deepEqual([...NATIVE_SIGNING_STAGE4_TABLES], [
      "signing_draft_source_snapshots",
      "signing_participant_credentials",
      "signing_operation_idempotency",
      "signing_work_items",
      "signing_delivery_instructions",
      "signing_delivery_attempts",
      // Added by the Stage 4 review fixes; see stage4-entry-exchange.test.ts.
      "signing_entry_sessions",
    ]);
    for (const table of NATIVE_SIGNING_STAGE4_TABLES) {
      if (table === "signing_entry_sessions") continue;
      assert.match(
        migration,
        new RegExp(`create table if not exists public\\.${table}`),
      );
      assert.match(migration, new RegExp(`'${table}'`));
    }
    assert.match(migration, /force row level security/);
    assert.match(migration, /using \(false\) with check \(false\)/);
    assert.match(migration, /revoke all on table public\.%I from authenticated/);
    assert.doesNotMatch(migration, /on delete cascade/i);
  });

  it("keeps snapshots distinct from versions, revisions, and evidence", () => {
    assert.match(
      migration,
      /Not signing_document_versions, not package revisions, not participant evidence/,
    );
    // Snapshot rows record render inputs; they never carry a filled PDF.
    assert.match(migration, /field_views_json jsonb not null/);
    assert.match(migration, /annotations_json jsonb not null/);
    assert.match(migration, /content_fingerprint text not null/);
    assert.doesNotMatch(snapshots, /\.from\("signing_document_versions"\)/);
    assert.doesNotMatch(snapshots, /\.from\("signing_package_revisions"\)/);
    assert.doesNotMatch(snapshots, /\.from\("signing_fields"\)/);
  });

  it("uses opaque non-PII draft snapshot object keys", () => {
    const key = buildDraftSourceObjectKey({
      signingId: "11111111-1111-4111-8111-111111111111",
      documentId: "22222222-2222-4222-8222-222222222222",
      snapshotId: "33333333-3333-4333-8333-333333333333",
    });
    assert.equal(
      key,
      "signings/11111111-1111-4111-8111-111111111111/documents/22222222-2222-4222-8222-222222222222/draft-snapshots/33333333-3333-4333-8333-333333333333/source.pdf",
    );
    assert.doesNotMatch(key, /Contract|Buyer|@| /);
  });

  it("keeps preparation-history and evidentiary object keys in separate namespaces", () => {
    const ids = {
      signingId: "11111111-1111-4111-8111-111111111111",
      documentId: "22222222-2222-4222-8222-222222222222",
    };
    const draftKey = buildDraftSourceObjectKey({
      ...ids,
      snapshotId: "33333333-3333-4333-8333-333333333333",
    });
    const adHocKey = buildAdHocDraftSourceObjectKey({
      ...ids,
      snapshotId: "55555555-5555-4555-8555-555555555555",
    });
    const versionKey = buildPreparedVersionObjectKey({
      ...ids,
      versionId: "44444444-4444-4444-8444-444444444444",
    });

    assert.match(draftKey, /\/draft-snapshots\//);
    assert.match(adHocKey, /\/draft-ad-hoc\//);
    assert.match(versionKey, /\/versions\//);

    // Immutable bytes in either namespace, but only one namespace is evidence.
    assert.ok(isDraftSourceObjectKey(draftKey));
    assert.ok(isDraftSourceObjectKey(adHocKey));
    assert.ok(isAdHocDraftSourceObjectKey(adHocKey));
    assert.ok(!isAdHocDraftSourceObjectKey(draftKey));
    assert.ok(!isPreparedVersionObjectKey(draftKey));
    assert.ok(!isPreparedVersionObjectKey(adHocKey));
    assert.ok(isPreparedVersionObjectKey(versionKey));
    assert.ok(!isDraftSourceObjectKey(versionKey));

    for (const bogus of [
      null,
      undefined,
      "",
      42,
      `${draftKey}.bak`,
      draftKey.replace("draft-snapshots", "versions"),
      versionKey.replace("versions", "draft-snapshots"),
      "signings/not-a-uuid/documents/x/versions/y.pdf",
    ]) {
      assert.ok(!isDraftSourceObjectKey(bogus));
      assert.ok(!isPreparedVersionObjectKey(bogus));
    }

    // The distinction is documented where each key is built and interpreted.
    assert.match(snapshots, /Immutable bytes are not the same thing as evidence/);
    assert.match(preparePdf, /evidentiary `versions\/` namespace/);
  });

  it("acknowledges one exact live fingerprint: Keep Current Y then Z re-raises drift", () => {
    const snapshotFingerprint = "a".repeat(64);
    const liveY = "b".repeat(64);
    const liveZ = "c".repeat(64);

    // No acknowledgement yet: drift.
    assert.deepEqual(
      compareDraftSourceFingerprints({
        snapshotFingerprint,
        liveFingerprint: liveY,
        acknowledgedFingerprint: null,
      }),
      { status: "SOURCE_CHANGED", reason: "LIVE_CHANGED" },
    );

    // Keep Current on Y: current while live is still exactly Y.
    assert.deepEqual(
      compareDraftSourceFingerprints({
        snapshotFingerprint,
        liveFingerprint: liveY,
        acknowledgedFingerprint: liveY,
      }),
      { status: "CURRENT", reason: "ACKNOWLEDGED_LIVE_CHANGE" },
    );

    // Live then changes to Z: the Y acknowledgement must not suppress drift.
    assert.deepEqual(
      compareDraftSourceFingerprints({
        snapshotFingerprint,
        liveFingerprint: liveZ,
        acknowledgedFingerprint: liveY,
      }),
      { status: "SOURCE_CHANGED", reason: "LIVE_CHANGED" },
    );

    // Live reverting to the snapshot is CURRENT on its own merits.
    assert.deepEqual(
      compareDraftSourceFingerprints({
        snapshotFingerprint,
        liveFingerprint: snapshotFingerprint,
        acknowledgedFingerprint: liveY,
      }),
      { status: "CURRENT", reason: "MATCHES_SNAPSHOT" },
    );
  });

  it("fails closed when snapshot bytes do not match the recorded hash", async () => {
    const bytes = Buffer.from("not the bytes this snapshot recorded", "utf8");
    const snapshot = {
      id: "33333333-3333-4333-8333-333333333333",
      signing_id: "11111111-1111-4111-8111-111111111111",
      signing_document_id: "22222222-2222-4222-8222-222222222222",
      source_pdf_storage_bucket: "signing-artifacts",
      source_pdf_object_key: "signings/x/documents/y/draft-snapshots/z/source.pdf",
      // Deliberately wrong: simulates tampered or swapped Storage bytes.
      source_pdf_sha256: "0".repeat(64),
      source_pdf_byte_size: bytes.byteLength,
      field_views_json: [],
      annotations_json: [],
      content_fingerprint: "1".repeat(64),
    } as unknown as DraftSourceSnapshotRow;

    const adminReturning = (result: { data: unknown; error: unknown }) =>
      ({
        storage: { from: () => ({ download: async () => result }) },
      }) as never;

    await assert.rejects(
      () =>
        renderPreparedPdfFromDraftSnapshot({
          admin: adminReturning({ data: new Blob([bytes]), error: null }),
          snapshot,
        }),
      (error: unknown) =>
        error instanceof SigningError && error.code === "INTEGRITY_MISMATCH",
    );

    // A snapshot object that can no longer be read also fails closed.
    await assert.rejects(
      () =>
        renderPreparedPdfFromDraftSnapshot({
          admin: adminReturning({ data: null, error: { message: "gone" } }),
          snapshot,
        }),
      (error: unknown) =>
        error instanceof SigningError && error.code === "VALIDATION_FAILED",
    );
  });

  it("captures snapshots with a stale-source guard around the live read", () => {
    assert.match(snapshots, /captureLivePacketFormRenderState/);
    assert.match(snapshots, /assertPacketFormUnchanged/);
    assert.match(snapshots, /"STALE_SOURCE"/);
    assert.match(snapshots, /computeDraftContentFingerprint/);
    // Fingerprint is recomputed from what was actually loaded.
    assert.match(snapshots, /sourcePdfSha256 = sha256Hex\(sourcePdfBytes\)/);
  });

  it("promotes from the selected snapshot and never from live content", () => {
    assert.match(documentVersions, /renderPreparedPdfFromDraftSnapshot/);
    assert.match(documentVersions, /requireSelectedDraftSourceSnapshotId/);
    assert.doesNotMatch(documentVersions, /renderPreparedPacketFormPdf/);
    assert.match(preparePdf, /this is NOT the promotion path/);
    assert.match(
      preparePdf,
      /export function requireSelectedDraftSourceSnapshotId/,
    );
    assert.match(preparePdf, /"VALIDATION_FAILED"/);
    assert.match(
      snapshots,
      /export async function renderPreparedPdfFromSelectedDraftSnapshot/,
    );
    assert.match(
      snapshots,
      /This document has no selected Draft source snapshot/,
    );
  });

  it("verifies snapshot PDF integrity before rendering prepared bytes", () => {
    assert.match(snapshots, /"INTEGRITY_MISMATCH"/);
    assert.match(
      snapshots,
      /sha256Hex\(sourceBytes\) !== options\.snapshot\.source_pdf_sha256/,
    );
  });

  it("captures on add and preserves the selection on re-include", () => {
    assert.match(draftDocuments, /captureAndSelectDraftSourceSnapshot/);
    assert.match(
      draftDocuments,
      /Re-include preserves the previously selected Draft source snapshot/,
    );
    // Only legacy rows with no snapshot capture during re-include.
    assert.match(
      draftDocuments,
      /if \(!reincluded\.selected_draft_source_snapshot_id\)/,
    );
    // A document that cannot be promoted must not survive a failed capture.
    assert.match(draftDocuments, /\.delete\(\)\s*\n\s*\.eq\("id", inserted\.id as string\)/);
  });

  it("resolves drift explicitly without creating versions or revisions", () => {
    assert.match(sourceDrift, /export type DocumentSourceStatus =/);
    assert.match(sourceDrift, /"CURRENT"/);
    assert.match(sourceDrift, /"SOURCE_CHANGED"/);
    assert.match(sourceDrift, /"SOURCE_UNAVAILABLE"/);
    assert.match(
      sourceDrift,
      /input\.liveFingerprint === input\.acknowledgedFingerprint/,
    );
    assert.match(
      sourceDrift,
      /acknowledgedFingerprint:\s*\n\s*document\.acknowledged_live_content_fingerprint \?\? null/,
    );
    assert.match(
      sourceDrift,
      /export async function updateDraftSourceToLatestWithActor/,
    );
    assert.doesNotMatch(sourceDrift, /\.from\("signing_document_versions"\)/);
    assert.doesNotMatch(sourceDrift, /\.from\("signing_package_revisions"\)/);
    assert.doesNotMatch(sourceDrift, /ensurePreparedDocumentVersion/);
  });

  it("selecting a snapshot clears a stale Keep Current acknowledgement", () => {
    assert.match(
      snapshots,
      /selected_draft_source_snapshot_id: snapshotId,\s*\n\s*acknowledged_live_content_fingerprint: null/,
    );
  });

  it("derives readiness without writing a Ready lifecycle state", () => {
    assert.match(readiness, /Ready is DERIVED, never stored/);
    assert.match(readiness, /collectDraftPromotionBlockers/);
    assert.match(readiness, /DOCUMENT_MISSING_DRAFT_SNAPSHOT/);
    assert.match(readiness, /DOCUMENT_SOURCE_CHANGED/);
    assert.match(readiness, /DOCUMENT_SOURCE_UNAVAILABLE/);
    assert.doesNotMatch(readiness, /lifecycle_state:/);
    assert.doesNotMatch(readiness, /"READY"/);
    assert.doesNotMatch(readiness, /\.update\(/);
  });
});
