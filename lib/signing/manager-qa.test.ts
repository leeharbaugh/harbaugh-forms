import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  expectedTypedSignatureText,
  suggestCapacityWording,
} from "./capacity-notices";
import { PACKET_SIGNING_PARTY_ROLES } from "./packet-to-signing";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("representative capacity helpers", () => {
  it("suggests common execution wording", () => {
    assert.equal(
      suggestCapacityWording({
        signatoryName: "Kenneth Lee Harbaugh",
        representedPartyName: "Richard Harbaugh",
        capacityLabel: "ATTORNEY_IN_FACT",
      }),
      "Kenneth Lee Harbaugh as Attorney-in-Fact for Richard Harbaugh",
    );
  });

  it("uses capacity wording for representative typed signatures", () => {
    assert.equal(
      expectedTypedSignatureText({
        capacityMode: "PERSONAL",
        signatoryName: "Jane Doe",
        capacityWording: null,
      }),
      "Jane Doe",
    );
    assert.equal(
      expectedTypedSignatureText({
        capacityMode: "REPRESENTATIVE",
        signatoryName: "Jane Doe",
        capacityWording: "Jane Doe as Trustee of The Doe Trust",
      }),
      "Jane Doe as Trustee of The Doe Trust",
    );
  });

  it("derives packet parties from transaction roles only", () => {
    assert.ok(PACKET_SIGNING_PARTY_ROLES.includes("BUYER"));
    assert.ok(PACKET_SIGNING_PARTY_ROLES.includes("SELLER"));
    assert.ok(!PACKET_SIGNING_PARTY_ROLES.includes("AGENT" as never));
  });
});

describe("manager QA wiring", () => {
  it("uses Signing terminology without unnecessary Native Signing UI", () => {
    const controls = read("app/admin/signing-controls/page.tsx");
    const listMeta = read("app/signings/page.tsx");
    const dashboard = read("components/signings/signing-dashboard-page.tsx");
    assert.match(controls, /Signings enabled/);
    assert.doesNotMatch(controls, /Native Signing enabled/);
    assert.match(listMeta, /Prepare and manage Signings/);
    assert.doesNotMatch(listMeta, /Native Signings/);
    assert.doesNotMatch(dashboard, /Native Signing/);
  });

  it("gates Packet Create Signing on packet ownership", () => {
    const packetDetail = read("components/packets/packet-detail.tsx");
    assert.match(packetDetail, /canCreateSigning/);
    assert.match(packetDetail, /owner_user_id === currentUserId/);
    assert.match(packetDetail, /createSigningFromPacketAction/);
    assert.match(packetDetail, /Create Signing/);
  });

  it("supports Draft document add/remove and whole-packet import", () => {
    const prep = read("components/signings/signing-draft-prep-panel.tsx");
    const stage3 = read("lib/signing/stage3-actions.ts");
    const draftDocs = read("lib/signing/draft-documents.ts");
    assert.match(prep, /Remove document/);
    assert.match(prep, /removeDraftSigningDocumentAction/);
    assert.match(prep, /Add all remaining packet documents|Add entire packet/);
    assert.match(prep, /Add individual document/);
    assert.match(prep, /Add documents/);
    assert.match(prep, /Documents/);
    assert.match(stage3, /addRemainingPacketDocumentsAction/);
    assert.match(draftDocs, /addRemainingPacketDocumentsWithActor/);
    assert.match(draftDocs, /already included/);
    assert.match(stage3, /included_in_draft/);
  });

  it("uses ready/not-ready readiness and concise Send confirmation", () => {
    const dashboard = read("components/signings/signing-dashboard-page.tsx");
    assert.match(dashboard, /This Signing is ready to send\./);
    assert.match(dashboard, /This Signing is not ready to send\./);
    assert.doesNotMatch(
      dashboard,
      /Readiness is calculated from the current Draft/,
    );
    assert.match(
      dashboard,
      /This freezes all the documents and emails each participant a signing link\./,
    );
    assert.match(dashboard, /Send this Signing\?/);
    // Representative notice remains on the Draft page, not in Send confirmation.
    const sendConfirmSlice = dashboard.slice(
      dashboard.indexOf("Send this Signing?"),
    );
    assert.doesNotMatch(sendConfirmSlice, /NATIVE_SIGNING_REPRESENTATIVE_NOTICE/);
    assert.doesNotMatch(
      sendConfirmSlice,
      /representative capacity|signing as a representative/i,
    );
  });

  it("exposes In Progress resend/replace/revoke without bearer secrets", () => {
    const dashboard = read("components/signings/signing-dashboard-page.tsx");
    const stage4 = read("lib/signing/stage4-actions.ts");
    const recovery = read("lib/signing/participant-credential-recovery.ts");
    assert.match(dashboard, /In Progress — participant access/);
    assert.match(dashboard, /Resend signing link/);
    assert.match(dashboard, /Replace signing link/);
    assert.match(dashboard, /Revoke signing link/);
    assert.doesNotMatch(dashboard, /rawToken|bearer|#\$\{/);
    assert.match(stage4, /resendParticipantInvitationAction/);
    assert.match(stage4, /replaceParticipantInvitationAction/);
    assert.match(stage4, /revokeParticipantInvitationAction/);
    assert.match(recovery, /resendParticipantInvitationWithActor/);
    assert.match(recovery, /revokeParticipantCredentialWithActor/);
    assert.match(recovery, /IN_PROGRESS/);
  });

  it("keeps copy recipients Complete-only and completed ops intact", () => {
    const copy = read("lib/signing/copy-recipients.ts");
    const completed = read("components/signings/signing-completed-ops-panel.tsx");
    const authority = read("lib/signing/completed-package-authority.ts");
    assert.match(copy, /requireCompletedManageableSigning/);
    assert.match(authority, /lifecycleState !== "COMPLETE"/);
    assert.match(completed, /Copy recipients/);
    assert.match(completed, /addCopyRecipientAction/);
  });

  it("does not fake In Progress amendment via Revision 1 mutation", () => {
    const dashboard = read("components/signings/signing-dashboard-page.tsx");
    const stage3 = read("lib/signing/stage3-actions.ts");
    assert.match(
      dashboard,
      /Pre-first-mark amendment is not available in this manager yet/,
    );
    assert.doesNotMatch(dashboard, /Amend Signing/);
    assert.match(
      stage3,
      /Intentionally NOT exported as a browser-facing activation action/,
    );
  });

  it("preserves Create Signing, participant removal, and Complete list", () => {
    const packetDetail = read("components/packets/packet-detail.tsx");
    const prep = read("components/signings/signing-draft-prep-panel.tsx");
    const list = read("components/signings/signings-list-page.tsx");
    const controls = read("app/admin/signing-controls/page.tsx");
    const ops = read("lib/signing/operations.ts");
    assert.match(packetDetail, /Create Signing/);
    assert.match(prep, /Remove participant/);
    assert.match(prep, /Prepare Signing/);
    assert.match(list, /Create Signing/);
    assert.doesNotMatch(list, /Create Draft/);
    assert.match(controls, /Signings enabled/);
    assert.match(controls, /Work suspended/);
    assert.match(controls, /Access suspended/);
    assert.match(controls, /recovery job checks every 2 minutes/);
    assert.match(ops, /original_sender_user_id/);
    assert.match(ops, /listSigningsForActor/);
  });
});
