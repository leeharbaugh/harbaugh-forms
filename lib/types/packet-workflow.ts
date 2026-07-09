import type { CollectionType } from "@/lib/types/collection";

/** UI workflow types for creating packets from the Packets page. */
export type PacketWorkflowType = "buyer_rep" | "listing" | "contract_offer";

export const PACKET_WORKFLOW_TYPES: PacketWorkflowType[] = [
  "buyer_rep",
  "listing",
  "contract_offer",
];

const WORKFLOW_LABELS: Record<PacketWorkflowType, string> = {
  buyer_rep: "Buyer Rep",
  listing: "Listing",
  contract_offer: "Contract Offer",
};

const WORKFLOW_DESCRIPTIONS: Record<PacketWorkflowType, string> = {
  buyer_rep:
    "Create a buyer representation packet from a collection and assigned buyers.",
  listing:
    "Create a listing packet from a collection, sellers, and a property.",
  contract_offer:
    "Create a contract offer packet from a collection, contacts, and a property.",
};

const WORKFLOW_CREATE_TITLES: Record<PacketWorkflowType, string> = {
  buyer_rep: "Create Buyer Rep Packet",
  listing: "Create Listing Packet",
  contract_offer: "Create Contract Offer Packet",
};

const CONTACT_LABELS: Record<
  PacketWorkflowType,
  { search: string; selected: string; empty: string }
> = {
  buyer_rep: {
    search: "Search buyers",
    selected: "Assigned buyers",
    empty: "No buyers assigned yet.",
  },
  listing: {
    search: "Search sellers",
    selected: "Assigned sellers",
    empty: "No sellers assigned yet.",
  },
  contract_offer: {
    search: "Search contacts",
    selected: "Assigned contacts",
    empty: "No contacts assigned yet.",
  },
};

export function formatPacketWorkflowType(type: PacketWorkflowType): string {
  return WORKFLOW_LABELS[type];
}

export function getPacketWorkflowDescription(type: PacketWorkflowType): string {
  return WORKFLOW_DESCRIPTIONS[type];
}

export function getPacketCreateTitle(type: PacketWorkflowType): string {
  return WORKFLOW_CREATE_TITLES[type];
}

export function getPacketContactLabels(type: PacketWorkflowType) {
  return CONTACT_LABELS[type];
}

/** Maps a UI workflow to the legacy collection_type filter. */
export function workflowToCollectionType(
  workflow: PacketWorkflowType,
): CollectionType {
  switch (workflow) {
    case "buyer_rep":
      return "BUYER_REP_PACKET";
    case "listing":
      return "LISTING_PACKET";
    case "contract_offer":
      return "OFFER_PACKET";
  }
}

/** Maps a UI workflow to representation_agreements.agreement_type, if any. */
export function workflowToAgreementType(
  workflow: PacketWorkflowType,
): "BUYER_REP" | "LISTING" | null {
  switch (workflow) {
    case "buyer_rep":
      return "BUYER_REP";
    case "listing":
      return "LISTING";
    case "contract_offer":
      return null;
  }
}

/** @legacy Optional advanced path that anchors a packet to representation_agreements. */
export function workflowSupportsLegacyAgreement(
  workflow: PacketWorkflowType,
): boolean {
  return workflow === "buyer_rep" || workflow === "listing";
}

export function isPacketWorkflowType(
  value: string | null,
): value is PacketWorkflowType {
  return (
    value === "buyer_rep" ||
    value === "listing" ||
    value === "contract_offer"
  );
}

export function workflowRequiresProperty(workflow: PacketWorkflowType): boolean {
  switch (workflow) {
    case "buyer_rep":
      return false;
    case "listing":
    case "contract_offer":
      return true;
  }
}

/** Buyer rep packets are client/representation-based and do not use a subject property. */
export function workflowSupportsPropertySelection(
  workflow: PacketWorkflowType,
): boolean {
  return workflow !== "buyer_rep";
}

export function getPropertyRequiredMessage(
  workflow: PacketWorkflowType,
): string {
  switch (workflow) {
    case "listing":
      return "A property is required for listing packets.";
    case "contract_offer":
      return "A property is required for contract offer packets.";
    default:
      return "A property is required for this packet type.";
  }
}

export const NO_COLLECTIONS_MESSAGE =
  "Create a collection under Forms → Collections first.";
