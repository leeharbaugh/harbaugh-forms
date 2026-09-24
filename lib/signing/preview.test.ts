import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Signing manager Draft preview", () => {
  it("loads preview from selected Draft snapshots without creating evidence", () => {
    const preview = read("lib/signing/preview.ts");
    const route = read(
      "app/signings/[signingId]/preview/document/[documentId]/route.ts",
    );
    const actions = read("lib/signing/preview-actions.ts");
    assert.match(preview, /loadSigningPreviewForActor/);
    assert.match(preview, /loadDraftPreviewDocumentBytes/);
    assert.match(preview, /renderPreparedPdfFromSelectedDraftSnapshot/);
    assert.match(preview, /canManage/);
    assert.match(preview, /lifecycle_state !== "DRAFT"/);
    assert.match(preview, /signing_draft_fields/);
    assert.doesNotMatch(preview, /promotePackageRevision|activateSigning|issueParticipant/);
    assert.match(route, /loadDraftPreviewDocumentBytes/);
    assert.match(route, /Cache-Control.: .no-store|no-store/);
    assert.match(route, /requireSigningActor/);
    assert.doesNotMatch(route, /createSignedUrl|getPublicUrl/);
    assert.match(actions, /getSigningPreviewAction/);
    assert.match(actions, /Does not create revisions/);
  });

  it("wires Preview Signing UI with Signature/Initials/Date Signed overlays", () => {
    const dialog = read("components/signings/signing-preview-dialog.tsx");
    const dashboard = read("components/signings/signing-dashboard-page.tsx");
    assert.match(dashboard, /Preview Signing/);
    assert.match(dashboard, /SigningPreviewDialog/);
    assert.match(dialog, /Signature/);
    assert.match(dialog, /Initials/);
    assert.match(dialog, /Date Signed/);
    assert.match(dialog, /participantFullName/);
    assert.match(dialog, /Previous document/);
    assert.match(dialog, /Next document/);
    assert.match(dialog, /representing/);
    assert.match(dialog, /pointer-events-none/);
    assert.match(dialog, /Prepare Documents/);
    assert.match(dialog, /mode === "prepare"/);
    assert.doesNotMatch(dialog, /rawToken|token_wrapped|signing-artifacts/);
  });

  it("denies cross-Signing preview through signingId+documentId binding", () => {
    const preview = read("lib/signing/preview.ts");
    assert.match(
      preview,
      /\.eq\("id", options\.signingDocumentId\)[\s\S]*\.eq\("signing_id", bundle\.signing\.id\)/,
    );
    assert.match(preview, /FORBIDDEN/);
    assert.match(preview, /You cannot preview this Signing/);
  });
});
