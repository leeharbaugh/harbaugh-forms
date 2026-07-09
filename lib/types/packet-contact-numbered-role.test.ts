import assert from "node:assert/strict";
import { describe, it } from "node:test";

type Contact = {
  email: string | null;
  phone_primary: string | null;
};

type PacketContact = {
  id: number;
  packet_role: string;
  sort_order: number;
  status: string;
  contacts: Contact | null;
};

const BUYER_SIDE_ROLES = new Set([
  "BUYER",
  "CO_CLIENT",
  "SPOUSE",
  "TENANT",
  "PRIMARY",
]);

function getOrderedBuyerContacts(packetContacts: PacketContact[]): Contact[] {
  return packetContacts
    .filter(
      (row) =>
        row.status === "ACTIVE" &&
        row.contacts &&
        BUYER_SIDE_ROLES.has(row.packet_role),
    )
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => row.contacts as Contact);
}

function getPacketContactByNumberedRoleSlug(
  packetContacts: PacketContact[],
  roleSlug: string,
): Contact | null {
  const match = roleSlug
    .trim()
    .toLowerCase()
    .match(/^buyer_(\d+)$/);
  if (!match) {
    return null;
  }

  const index = Number(match[1]);
  return getOrderedBuyerContacts(packetContacts)[index - 1] ?? null;
}

describe("buyer numbered packet contact resolution", () => {
  it("resolves buyer_2 from the second buyer-side contact by sort_order", () => {
    const packetContacts: PacketContact[] = [
      {
        id: 1,
        packet_role: "BUYER",
        sort_order: 0,
        status: "ACTIVE",
        contacts: {
          email: "buyer1@example.com",
          phone_primary: "817-555-0101",
        },
      },
      {
        id: 2,
        packet_role: "CO_CLIENT",
        sort_order: 1,
        status: "ACTIVE",
        contacts: {
          email: "buyer2@example.com",
          phone_primary: "817-555-0102",
        },
      },
    ];

    const buyer1 = getPacketContactByNumberedRoleSlug(packetContacts, "buyer_1");
    const buyer2 = getPacketContactByNumberedRoleSlug(packetContacts, "buyer_2");

    assert.equal(buyer1?.email, "buyer1@example.com");
    assert.equal(buyer2?.email, "buyer2@example.com");
    assert.equal(buyer2?.phone_primary, "817-555-0102");
  });
});
