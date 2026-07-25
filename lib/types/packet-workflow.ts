import type { CollectionType } from "@/lib/types/collection";
import type { ListingOwnerKind } from "@/lib/types/listing-packet-kind";

/** UI workflow types for creating packets from the Packets page. */
export type PacketWorkflowType =
  | "buyer_rep"
  | "listing"
  | "contract_offer"
  | "custom";

export const PACKET_WORKFLOW_TYPES: PacketWorkflowType[] = [
  "buyer_rep",
  "listing",
  "contract_offer",
  "custom",
];

/** Collection-backed workflows only (excludes Custom Packet). */
export const COLLECTION_PACKET_WORKFLOW_TYPES: Exclude<
  PacketWorkflowType,
  "custom"
>[] = ["buyer_rep", "listing", "contract_offer"];

const WORKFLOW_LABELS: Record<PacketWorkflowType, string> = {
  buyer_rep: "Buyer Rep",
  listing: "Listing",
  contract_offer: "Contract Offer",
  custom: "Custom Packet",
};

const WORKFLOW_DESCRIPTIONS: Record<PacketWorkflowType, string> = {
  buyer_rep:
    "Create a buyer representation packet from a collection and assigned buyers.",
  listing:
    "Create a listing packet from a collection, sellers, and a property.",
  contract_offer:
    "Create a contract offer packet from a collection, contacts, and a property.",
  custom:
    "Create an empty packet with no forms or collection. Upload your own documents.",
};

const WORKFLOW_CREATE_TITLES: Record<PacketWorkflowType, string> = {
  buyer_rep: "Create Buyer Rep Packet",
  listing: "Create Listing Packet",
  contract_offer: "Create Contract Offer Packet",
  custom: "Create Custom Packet",
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
      "Choose a buyer rep collection.",
      "Add one or more buyers.",
      "Review forms, then create the packet.",
    ],
    collectionLabel: "1. Choose buyer rep collection",
    propertyLabel: null,
    contacts: {
      search: "2. Search and add buyers",
      selected: "3. Buyers assigned to this packet",
      empty: "No buyers added yet. Search above to add buyers.",
      required: "Add at least one buyer before continuing.",
    },
  },
  listing: {
    steps: [
      "Choose a listing collection.",
      "Add one or more sellers.",
      "Choose the property.",
      "Review forms, then create the packet.",
    ],
    collectionLabel: "1. Choose listing collection",
    propertyLabel: "4. Choose property",
    contacts: {
      search: "2. Search and add sellers",
      selected: "3. Sellers assigned to this packet",
      empty: "No sellers added yet. Search above to add sellers.",
      required: "Add at least one seller before continuing.",
    },
  },
  contract_offer: {
    steps: [
      "Choose a contract offer collection.",
      "Add one or more contacts.",
      "Choose the property.",
      "Review forms, then create the packet.",
    ],
    collectionLabel: "1. Choose contract offer collection",
    propertyLabel: "4. Choose property",
    contacts: {
      search: "2. Search and add contacts",
      selected: "3. Contacts assigned to this packet",
      empty: "No contacts added yet. Search above to add contacts.",
      required: "Add at least one contact before continuing.",
    },
  },
  custom: {
    steps: [
      "Name the packet.",
      "Optionally add contacts and a property.",
      "Create the empty packet, then upload your documents.",
    ],
    collectionLabel: "",
    propertyLabel: "Property (optional)",
    contacts: {
      search: "Search and add contacts (optional)",
      selected: "Contacts assigned to this packet",
      empty: "No contacts added yet. Search above to add contacts.",
      required: "",
    },
  },
};

const LEASE_LISTING_CREATE_FLOW_COPY: PacketCreateFlowCopy = {
  steps: [
    "Choose a listing collection.",
    "Add one or more landlords.",
    "Choose the property.",
    "Review forms, then create the packet.",
  ],
  collectionLabel: "1. Choose listing collection",
  propertyLabel: "4. Choose property",
  contacts: {
    search: "2. Search landlords",
    selected: "3. Landlords assigned to this packet",
    empty: "No landlords added yet. Search above to add landlords.",
    required: "Add at least one landlord before continuing.",
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
  listingOwnerKind: ListingOwnerKind = "seller",
): PacketCreateFlowCopy {
  if (type === "listing" && listingOwnerKind === "landlord") {
    return LEASE_LISTING_CREATE_FLOW_COPY;
  }
  return CREATE_FLOW_COPY[type];
}

export function getPacketContactLabels(
  type: PacketWorkflowType,
  listingOwnerKind: ListingOwnerKind = "seller",
) {
  return getPacketCreateFlowCopy(type, listingOwnerKind).contacts;
}

export function getPacketContactRequiredMessage(
  type: PacketWorkflowType,
  listingOwnerKind: ListingOwnerKind = "seller",
): string {
  return getPacketCreateFlowCopy(type, listingOwnerKind).contacts.required;
}

/** Maps a UI workflow to the legacy collection_type filter. */
export function workflowToCollectionType(
  workflow: Exclude<PacketWorkflowType, "custom">,
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

export function isCollectionPacketWorkflow(
  workflow: PacketWorkflowType,
): workflow is Exclude<PacketWorkflowType, "custom"> {
  return workflow !== "custom";
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
    case "custom":
      return null;
  }
}

/**
 * @legacy Optional advanced path that anchors a packet to representation_agreements.
 * Listing agreement-linked creation was removed; only Buyer Rep remains.
 */
export function workflowSupportsLegacyAgreement(
  workflow: PacketWorkflowType,
): workflow is "buyer_rep" {
  return workflow === "buyer_rep";
}

export function isPacketWorkflowType(
  value: string | null,
): value is PacketWorkflowType {
  return (
    value === "buyer_rep" ||
    value === "listing" ||
    value === "contract_offer" ||
    value === "custom"
  );
}

export function workflowRequiresProperty(workflow: PacketWorkflowType): boolean {
  switch (workflow) {
    case "buyer_rep":
    case "custom":
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

/** Buyer rep packets never persist a subject property. */
export function resolvePacketPropertyIdForSave(
  packetType: PacketWorkflowType | null,
  propertyId: number | null,
): number | null {
  if (packetType === "buyer_rep") {
    return null;
  }

  return propertyId;
}

export function validateCreatePacketFromCollectionInput(input: {
  collectionId: number | null;
  packetType: PacketWorkflowType;
  contactIds: number[];
  propertyId: number | null;
  listingOwnerKind?: ListingOwnerKind;
}): string | null {
  if (input.packetType === "custom") {
    return "Custom packets cannot be created from a collection.";
  }

  if (input.collectionId == null) {
    return "Choose a collection before continuing.";
  }

  if (input.contactIds.length === 0) {
    return getPacketContactRequiredMessage(
      input.packetType,
      input.listingOwnerKind ?? "seller",
    );
  }

  const propertyId = resolvePacketPropertyIdForSave(
    input.packetType,
    input.propertyId,
  );

  if (workflowRequiresProperty(input.packetType) && propertyId == null) {
    return getPropertyRequiredMessage(input.packetType);
  }

  return null;
}

export function validateCreateCustomPacketInput(input: {
  label: string;
}): string | null {
  if (!input.label.trim()) {
    return "Packet name is required.";
  }
  return null;
}

export function validateUpdatePacketInput(input: {
  label: string;
  packetType: PacketWorkflowType | null;
  collectionId: number | null;
  propertyId: number | null;
  hasLegacyAgreement: boolean;
}): string | null {
  if (!input.label.trim()) {
    return "Packet label is required.";
  }

  if (input.packetType === "custom") {
    if (input.collectionId != null) {
      return "Custom packets cannot have a collection.";
    }
  } else if (input.collectionId == null) {
    return "A collection is required.";
  }

  const propertyId = resolvePacketPropertyIdForSave(
    input.packetType,
    input.propertyId,
  );

  if (
    input.packetType &&
    workflowRequiresProperty(input.packetType) &&
    propertyId == null
  ) {
    return getPropertyRequiredMessage(input.packetType);
  }

  return null;
}
