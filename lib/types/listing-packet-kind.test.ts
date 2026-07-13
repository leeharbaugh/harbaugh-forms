import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getListingOwnerKindFromCollection,
  getListingOwnerKindFromPacket,
  isLeaseListingCollection,
  isLeaseListingForm,
  isLeaseListingPacket,
} from "./listing-packet-kind.ts";
import {
  buildPacketContactAssignments,
  getDefaultPacketRole,
  getOrderedContactsForNumberedRolePrefix,
  getPacketContactByNumberedRoleSlug,
  type PacketContact,
} from "./packet-contact.ts";
import { getPacketCreateFlowCopy } from "./packet-workflow.ts";
import type { Contact } from "./contact.ts";

describe("listing packet kind detection", () => {
  it("detects TXR-1102 and lease listing form names", () => {
    assert.equal(
      isLeaseListingForm({ form_code: "TXR-1102", form_name: "Other" }),
      true,
    );
    assert.equal(
      isLeaseListingForm({
        form_code: "CUSTOM",
        form_name: "Residential Lease Listing Agreement",
      }),
      true,
    );
    assert.equal(
      isLeaseListingForm({
        form_code: "TXR-1101",
        form_name: "Residential Real Estate Listing Agreement",
      }),
      false,
    );
  });

  it("detects lease listing collections by name or forms", () => {
    assert.equal(
      isLeaseListingCollection({
        collection_name: "Lease Listing Packet",
        collection_forms: [],
      }),
      true,
    );
    assert.equal(
      isLeaseListingCollection({
        collection_name: "Sale Listing Packet",
        collection_forms: [
          {
            status: "ACTIVE",
            forms: { form_code: "TXR-1102", form_name: "Lease Listing" },
          },
        ],
      }),
      true,
    );
    assert.equal(
      isLeaseListingCollection({
        collection_name: "Sale Listing Packet",
        collection_forms: [
          {
            status: "ACTIVE",
            forms: { form_code: "TXR-1101", form_name: "Sale Listing" },
          },
        ],
      }),
      false,
    );
    assert.equal(
      getListingOwnerKindFromCollection({
        collection_name: "Lease Listing Packet",
      }),
      "landlord",
    );
  });

  it("detects lease listing packets from forms", () => {
    assert.equal(
      isLeaseListingPacket({
        packetType: "listing",
        collectionName: "Sale Listing Packet",
        packetForms: [
          {
            status: "ACTIVE",
            forms: { form_code: "TXR-1102", form_name: "Lease Listing" },
          },
        ],
      }),
      true,
    );
    assert.equal(
      isLeaseListingPacket({
        packetType: "listing",
        collectionName: "Sale Listing Packet",
        packetForms: [
          {
            status: "ACTIVE",
            forms: { form_code: "TXR-1101", form_name: "Sale Listing" },
          },
        ],
      }),
      false,
    );
    assert.equal(
      getListingOwnerKindFromPacket({
        packetType: "contract_offer",
        collectionName: "Lease Listing Packet",
      }),
      "seller",
    );
  });
});

describe("lease listing contact roles and copy", () => {
  it("defaults listing contacts to landlord for lease owner kind", () => {
    assert.equal(getDefaultPacketRole("listing", 0, "landlord"), "LANDLORD");
    assert.equal(getDefaultPacketRole("listing", 1, "landlord"), "CO_CLIENT");
    assert.equal(getDefaultPacketRole("listing", 0, "seller"), "SELLER");

    const assignments = buildPacketContactAssignments(
      "listing",
      [10, 11],
      "landlord",
    );
    assert.deepEqual(assignments, [
      { contactId: 10, packetRole: "LANDLORD", sortOrder: 0 },
      { contactId: 11, packetRole: "CO_CLIENT", sortOrder: 1 },
    ]);
  });

  it("uses landlord wording for lease listing create flow", () => {
    const leaseCopy = getPacketCreateFlowCopy("listing", "landlord");
    assert.equal(leaseCopy.contacts.search, "2. Search landlords");
    assert.equal(
      leaseCopy.contacts.selected,
      "3. Landlords assigned to this packet",
    );
    assert.equal(
      leaseCopy.contacts.required,
      "Add at least one landlord before continuing.",
    );

    const saleCopy = getPacketCreateFlowCopy("listing", "seller");
    assert.equal(saleCopy.contacts.search, "2. Search and add sellers");
    assert.equal(
      saleCopy.contacts.required,
      "Add at least one seller before continuing.",
    );
  });
});

describe("landlord numbered role seller fallback", () => {
  const sellerContact = {
    email: "seller@example.com",
    phone_primary: "817-555-0101",
  } as Contact;
  const coClientContact = {
    email: "co@example.com",
    phone_primary: "817-555-0102",
  } as Contact;

  const packetContacts = [
    {
      id: 1,
      packet_id: 1,
      contact_id: 1,
      packet_role: "SELLER",
      sort_order: 0,
      create_date: "",
      update_date: "",
      status: "ACTIVE",
      contacts: sellerContact,
    },
    {
      id: 2,
      packet_id: 1,
      contact_id: 2,
      packet_role: "CO_CLIENT",
      sort_order: 1,
      create_date: "",
      update_date: "",
      status: "ACTIVE",
      contacts: coClientContact,
    },
  ] as PacketContact[];

  it("falls back to sellers for landlord paths only when enabled", () => {
    const onlySellerContacts = [packetContacts[0]] as PacketContact[];

    assert.equal(
      getPacketContactByNumberedRoleSlug(onlySellerContacts, "landlord_1"),
      null,
    );

    const landlord1 = getPacketContactByNumberedRoleSlug(
      packetContacts,
      "landlord_1",
      { fallbackSellersAsLandlords: true },
    );
    const landlord2 = getPacketContactByNumberedRoleSlug(
      packetContacts,
      "landlord_2",
      { fallbackSellersAsLandlords: true },
    );

    assert.equal(landlord1?.email, "seller@example.com");
    assert.equal(landlord2?.email, "co@example.com");
  });

  it("does not use seller fallback when explicit landlords exist", () => {
    const landlordContacts = [
      {
        ...packetContacts[0],
        packet_role: "LANDLORD",
        contacts: {
          email: "landlord@example.com",
          phone_primary: "817-555-0199",
        } as Contact,
      },
      packetContacts[1],
    ] as PacketContact[];

    const landlords = getOrderedContactsForNumberedRolePrefix(
      landlordContacts,
      "landlord",
      { fallbackSellersAsLandlords: true },
    );

    assert.equal(landlords[0]?.email, "landlord@example.com");
    assert.equal(landlords[1]?.email, "co@example.com");
  });

  it("keeps seller paths unchanged for sale listing packets", () => {
    assert.equal(
      getPacketContactByNumberedRoleSlug(packetContacts, "seller_1")?.email,
      "seller@example.com",
    );
    assert.equal(
      getPacketContactByNumberedRoleSlug(packetContacts, "seller_2")?.email,
      "co@example.com",
    );
  });
});
