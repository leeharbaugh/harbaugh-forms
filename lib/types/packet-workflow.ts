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

export type PacketCreateFlowCopy = {
  steps: string[];
  collectionLabel: string;
  propertyLabel: string | null;
  contacts: {
    search: string;
    selected: string;
    empty: string;
    required: string;
  };
};

const CREATE_FLOW_COPY: Record<PacketWorkflowType, PacketCreateFlowCopy> = {
  buyer_rep: {
    steps: [
      "Step 1: Choose the buyer rep collection you want to use.",
      "Step 2: Search for each buyer by name, email, or phone.",
      "Step 3: Select the correct buyer to add them to the packet.",
      "Step 4: Continue to review the forms before generating the packet.",
    ],
    collectionLabel: "1. Choose buyer rep collection",
    propertyLabel: null,
    contacts: {
      search: "2. Search and add buyers",
      selected: "3. Buyers assigned to this packet",
      empty:
        "No buyers have been added to this packet yet. Search above to add one or more buyers.",
      required: "Add at least one buyer before continuing.",
    },
  },
  listing: {
    steps: [
      "Step 1: Choose the listing collection you want to use.",
      "Step 2: Search for each seller by name, email, or phone.",
      "Step 3: Select the correct seller to add them to the packet.",
      "Step 4: Choose the property for this listing.",
      "Step 5: Continue to review the forms before generating the packet.",
    ],
    collectionLabel: "1. Choose listing collection",
    propertyLabel: "4. Choose property",
    contacts: {
      search: "2. Search and add sellers",
      selected: "3. Sellers assigned to this packet",
      empty:
        "No sellers have been added to this packet yet. Search above to add one or more sellers.",
      required: "Add at least one seller before continuing.",
    },
  },
  contract_offer: {
    steps: [
      "Step 1: Choose the contract offer collection you want to use.",
      "Step 2: Search for each contact by name, email, or phone.",
      "Step 3: Select the correct contact to add them to the packet.",
      "Step 4: Choose the property for this offer.",
      "Step 5: Continue to review the forms before generating the packet.",
    ],
    collectionLabel: "1. Choose contract offer collection",
    propertyLabel: "4. Choose property",
    contacts: {
      search: "2. Search and add contacts",
      selected: "3. Contacts assigned to this packet",
      empty:
        "No contacts have been added to this packet yet. Search above to add one or more contacts.",
      required: "Add at least one contact before continuing.",
    },
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

export function getPacketCreateFlowCopy(
  type: PacketWorkflowType,
): PacketCreateFlowCopy {
  return CREATE_FLOW_COPY[type];
}

export function getPacketContactLabels(type: PacketWorkflowType) {
  return CREATE_FLOW_COPY[type].contacts;
}

export function getPacketContactRequiredMessage(
  type: PacketWorkflowType,
): string {
  return CREATE_FLOW_COPY[type].contacts.required;
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
      return "Choose a property for this listing before continuing.";
    case "contract_offer":
      return "Choose a property for this offer before continuing.";
    default:
      return "Choose a property before continuing.";
  }
}

export const NO_COLLECTIONS_MESSAGE =
  "Create a collection under Forms → Collections first.";
