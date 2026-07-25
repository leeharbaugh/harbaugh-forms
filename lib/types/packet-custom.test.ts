import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  validateCreateCustomPacketInput,
  validateCreatePacketFromCollectionInput,
  validateUpdatePacketInput,
} from "./packet-workflow.ts";

describe("custom packet creation validation", () => {
  it("requires a packet name for custom packets", () => {
    assert.equal(validateCreateCustomPacketInput({ label: "" }), "Packet name is required.");
    assert.equal(validateCreateCustomPacketInput({ label: "  " }), "Packet name is required.");
    assert.equal(validateCreateCustomPacketInput({ label: "Closing docs" }), null);
  });

  it("rejects collection-based create when workflow is custom", () => {
    assert.match(
      validateCreatePacketFromCollectionInput({
        collectionId: 1,
        packetType: "custom",
        contactIds: [1],
        propertyId: null,
      }) ?? "",
      /custom/i,
    );
  });

  it("keeps collection-based create rules intact", () => {
    assert.equal(
      validateCreatePacketFromCollectionInput({
        collectionId: null,
        packetType: "buyer_rep",
        contactIds: [1],
        propertyId: null,
      }),
      "Choose a collection before continuing.",
    );
    assert.match(
      validateCreatePacketFromCollectionInput({
        collectionId: 1,
        packetType: "buyer_rep",
        contactIds: [],
        propertyId: null,
      }) ?? "",
      /buyer/i,
    );
    assert.equal(
      validateCreatePacketFromCollectionInput({
        collectionId: 1,
        packetType: "buyer_rep",
        contactIds: [2],
        propertyId: null,
      }),
      null,
    );
  });

  it("allows custom packet updates without a collection", () => {
    assert.equal(
      validateUpdatePacketInput({
        label: "Custom",
        packetType: "custom",
        collectionId: null,
        propertyId: null,
        hasLegacyAgreement: false,
      }),
      null,
    );
    assert.match(
      validateUpdatePacketInput({
        label: "Custom",
        packetType: "custom",
        collectionId: 3,
        propertyId: null,
        hasLegacyAgreement: false,
      }) ?? "",
      /collection/i,
    );
  });

  it("createCustomPacket inserts an empty custom packet with zero packet_forms", () => {
    const src = fs.readFileSync("lib/types/packet.ts", "utf8");
    const start = src.indexOf("export async function createCustomPacket");
    const end = src.indexOf("export async function generatePacketFromAgreement", start);
    assert.ok(start >= 0 && end > start);
    const body = src.slice(start, end);
    assert.ok(body.includes('packet_type: "custom"'));
    assert.ok(body.includes("collection_id: null"));
    assert.equal(body.includes("createCollectionPacketForms"), false);
    assert.equal(body.includes("createExternalPacketForms"), false);
    assert.equal(body.includes("createAdditionalInternalPacketForms"), false);
  });
});
