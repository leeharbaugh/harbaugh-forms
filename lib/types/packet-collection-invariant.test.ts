import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import {
  isAllowedPacketTypeValue,
  satisfiesPacketCollectionInvariant,
  validateUpdatePacketInput,
} from "./packet-workflow.ts";

const CORRECTIVE_MIGRATION =
  "supabase/migrations/20260725043000_packets_custom_collection_null_check_fix.sql";
const ORIGINAL_MIGRATION =
  "supabase/migrations/20260725040000_packets_custom_nullable_collection.sql";

describe("packets collection / custom invariant", () => {
  it("allows custom with null collection and collection-backed types with a collection", () => {
    assert.equal(satisfiesPacketCollectionInvariant("custom", null), true);
    assert.equal(satisfiesPacketCollectionInvariant("buyer_rep", 1), true);
    assert.equal(satisfiesPacketCollectionInvariant("listing", 2), true);
    assert.equal(satisfiesPacketCollectionInvariant("contract_offer", 3), true);
    assert.equal(satisfiesPacketCollectionInvariant(null, 4), true);
  });

  it("rejects custom with a collection and non-custom (including null type) without a collection", () => {
    assert.equal(satisfiesPacketCollectionInvariant("custom", 1), false);
    assert.equal(satisfiesPacketCollectionInvariant("buyer_rep", null), false);
    assert.equal(satisfiesPacketCollectionInvariant("listing", null), false);
    assert.equal(satisfiesPacketCollectionInvariant("contract_offer", null), false);
    assert.equal(satisfiesPacketCollectionInvariant(null, null), false);
  });

  it("rejects unsupported packet_type values", () => {
    assert.equal(isAllowedPacketTypeValue("buyer_rep"), true);
    assert.equal(isAllowedPacketTypeValue("listing"), true);
    assert.equal(isAllowedPacketTypeValue("contract_offer"), true);
    assert.equal(isAllowedPacketTypeValue("custom"), true);
    assert.equal(isAllowedPacketTypeValue(null), true);
    assert.equal(isAllowedPacketTypeValue("unknown"), false);
    assert.equal(isAllowedPacketTypeValue("ORGANIZATION"), false);
  });

  it("mirrors the invariant in validateUpdatePacketInput", () => {
    assert.equal(
      validateUpdatePacketInput({
        label: "Ok",
        packetType: "custom",
        collectionId: null,
        propertyId: null,
        hasLegacyAgreement: false,
      }),
      null,
    );
    assert.equal(
      validateUpdatePacketInput({
        label: "Ok",
        packetType: "buyer_rep",
        collectionId: 1,
        propertyId: null,
        hasLegacyAgreement: false,
      }),
      null,
    );
    assert.equal(
      validateUpdatePacketInput({
        label: "Ok",
        packetType: null,
        collectionId: 1,
        propertyId: null,
        hasLegacyAgreement: false,
      }),
      null,
    );
    assert.match(
      validateUpdatePacketInput({
        label: "Bad",
        packetType: "custom",
        collectionId: 9,
        propertyId: null,
        hasLegacyAgreement: false,
      }) ?? "",
      /collection/i,
    );
    assert.match(
      validateUpdatePacketInput({
        label: "Bad",
        packetType: "listing",
        collectionId: null,
        propertyId: 1,
        hasLegacyAgreement: false,
      }) ?? "",
      /collection/i,
    );
    assert.match(
      validateUpdatePacketInput({
        label: "Bad",
        packetType: null,
        collectionId: null,
        propertyId: null,
        hasLegacyAgreement: false,
      }) ?? "",
      /collection/i,
    );
  });
});

describe("packets custom collection constraint migrations", () => {
  it("keeps allowed packet_type values on the original migration", () => {
    const sql = fs.readFileSync(ORIGINAL_MIGRATION, "utf8");
    assert.match(sql, /'buyer_rep'/);
    assert.match(sql, /'listing'/);
    assert.match(sql, /'contract_offer'/);
    assert.match(sql, /'custom'/);
    assert.match(sql, /packet_type is null/i);
    assert.doesNotMatch(sql, /cascade/i);
  });

  it("corrective migration replaces the check with the strict pairing invariant", () => {
    const sql = fs.readFileSync(CORRECTIVE_MIGRATION, "utf8");
    assert.match(
      sql,
      /drop constraint if exists packets_custom_collection_null_check/i,
    );
    assert.match(sql, /add constraint packets_custom_collection_null_check/i);
    assert.match(
      sql,
      /packet_type = 'custom'\s+and collection_id is null/i,
    );
    assert.match(
      sql,
      /packet_type is distinct from 'custom'\s+and collection_id is not null/i,
    );
    assert.doesNotMatch(sql, /update\s+public\.packets/i);
    assert.doesNotMatch(sql, /cascade/i);
  });
});
