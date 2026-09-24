import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  displayNameFromFilename,
  looksLikePdfBytes,
  sanitizeUploadedPdfFilename,
  SIGNING_AD_HOC_PDF_MAX_BYTES,
} from "./ad-hoc-documents";
import {
  buildAdHocDraftSourceObjectKey,
} from "./draft-source-snapshots";
import {
  isAdHocDraftSourceObjectKey,
  isDraftSourceObjectKey,
  isPreparedVersionObjectKey,
} from "./stage1-schema";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

describe("Signing-owned ad hoc PDF documents", () => {
  it("validates PDF magic and sanitizes filenames", () => {
    assert.equal(looksLikePdfBytes(new TextEncoder().encode("%PDF-1.7")), true);
    assert.equal(looksLikePdfBytes(new TextEncoder().encode("not-pdf")), false);
    assert.equal(
      sanitizeUploadedPdfFilename("../../evil.exe"),
      "evil.exe.pdf",
    );
    assert.equal(
      sanitizeUploadedPdfFilename("Offer Letter.PDF"),
      "Offer Letter.PDF",
    );
    assert.equal(displayNameFromFilename("contract.pdf"), "contract");
    assert.ok(SIGNING_AD_HOC_PDF_MAX_BYTES >= 50 * 1024 * 1024);
  });

  it("uses a distinct private draft-ad-hoc Storage namespace", () => {
    const key = buildAdHocDraftSourceObjectKey({
      signingId: "11111111-1111-4111-8111-111111111111",
      documentId: "22222222-2222-4222-8222-222222222222",
      snapshotId: "33333333-3333-4333-8333-333333333333",
    });
    assert.match(key, /\/draft-ad-hoc\//);
    assert.ok(isAdHocDraftSourceObjectKey(key));
    assert.ok(isDraftSourceObjectKey(key));
    assert.ok(!isPreparedVersionObjectKey(key));
  });

  it("keeps upload on Draft trusted path without Packet/Form/evidence creation", () => {
    const adHoc = read("lib/signing/ad-hoc-documents.ts");
    const snapshots = read("lib/signing/draft-source-snapshots.ts");
    const stage3 = read("lib/signing/stage3-actions.ts");
    const migration = read(
      "supabase/migrations/20260923200000_native_signing_ad_hoc_documents.sql",
    );
    const prep = read("components/signings/signing-draft-prep-panel.tsx");

    assert.match(adHoc, /source_kind: "AD_HOC_PDF"/);
    assert.match(adHoc, /captureAndSelectAdHocDraftSourceSnapshot/);
    assert.doesNotMatch(adHoc, /from\("packet_forms"\)/);
    assert.doesNotMatch(adHoc, /signing_document_versions/);
    assert.doesNotMatch(adHoc, /signing_package_revisions/);
    assert.match(snapshots, /buildAdHocDraftSourceObjectKey/);
    assert.match(snapshots, /ignoreEncryption: false/);
    assert.match(stage3, /addAdHocDraftSigningDocumentAction/);
    assert.match(migration, /source_kind/);
    assert.match(migration, /AD_HOC_PDF/);
    assert.match(prep, /Upload PDF/);
    assert.match(prep, /addAdHocDraftSigningDocumentAction/);
  });

  it("cleans evidence-free ad hoc Draft documents via existing remove path", () => {
    const draftDocuments = read("lib/signing/draft-documents.ts");
    assert.match(draftDocuments, /selected_draft_source_snapshot_id: null/);
    assert.match(draftDocuments, /\.remove\(/);
    assert.match(draftDocuments, /included_in_draft: false/);
  });
});
