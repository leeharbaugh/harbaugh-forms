import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expectedTypedSignatureText,
  suggestCapacityWording,
} from "./capacity-notices";
import { PACKET_SIGNING_PARTY_ROLES } from "./packet-to-signing";

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
  it("exposes Create Signing from Packet and participant removal", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const packetDetail = readFileSync(
      join(process.cwd(), "components/packets/packet-detail.tsx"),
      "utf8",
    );
    const prep = readFileSync(
      join(process.cwd(), "components/signings/signing-draft-prep-panel.tsx"),
      "utf8",
    );
    const list = readFileSync(
      join(process.cwd(), "components/signings/signings-list-page.tsx"),
      "utf8",
    );
    const controls = readFileSync(
      join(process.cwd(), "app/admin/signing-controls/page.tsx"),
      "utf8",
    );
    assert.match(packetDetail, /Create Signing/);
    assert.match(packetDetail, /createSigningFromPacketAction/);
    assert.match(prep, /Remove participant/);
    assert.match(prep, /removeDraftSigningParticipantAction/);
    assert.match(prep, /Prepare Signing/);
    assert.match(list, /Create Signing/);
    assert.doesNotMatch(list, /Create Draft/);
    assert.match(controls, /Native Signing enabled/);
    assert.match(controls, /Work suspended/);
    assert.match(controls, /Access suspended/);
    assert.match(controls, /recovery job checks every 2 minutes/);
  });

  it("lists Complete Signings via original sender candidates", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const ops = readFileSync(
      join(process.cwd(), "lib/signing/operations.ts"),
      "utf8",
    );
    assert.match(ops, /original_sender_user_id/);
    assert.match(ops, /listSigningsForActor/);
  });
});
