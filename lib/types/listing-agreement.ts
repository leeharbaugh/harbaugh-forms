import {
  type Contact,
  formatContactDisplayName,
} from "@/lib/types/contact";
import {
  type Property,
  type PropertyInput,
  emptyPropertyInput,
  formatPropertyAddress,
  propertyToInput,
  validatePropertyInput,
} from "@/lib/types/property";

export type AgreementLifecycleStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "TERMINATED"
  | "COMPLETED";

export type ListingRepresentationKind = "SALE" | "LEASE";

export type ClientRole =
  | "PRIMARY"
  | "CO_CLIENT"
  | "SPOUSE"
  | "POWER_OF_ATTORNEY"
  | "BUYER"
  | "TENANT"
  | "SELLER"
  | "LANDLORD"
  | "OTHER";

export type RepresentationAgreement = {
  id: number;
  agreement_type: "BUYER_REP" | "LISTING";
  agreement_status: AgreementLifecycleStatus;
  effective_date: string;
  expiration_date: string | null;
  signed_date: string | null;
  property_id: number | null;
  created_by_user_id: string | null;
  notes: string | null;
  create_date: string;
  update_date: string;
  status: string;
};

export type ListingAgreementDetails = {
  id: number;
  representation_agreement_id: number;
  representation_kind: ListingRepresentationKind;
  list_price: number | null;
  seller_broker_fee_percent: number | null;
  buyer_broker_fee_percent: number | null;
  showing_service: string;
  hoa_exists: boolean | null;
  lead_based_paint_required: boolean | null;
  seller_disclosure_required: boolean | null;
  exclusions: string;
  included_personal_property: string;
  service_contract_amount: number;
  preferred_title_company: string | null;
  occupancy_status: string | null;
  access_notes: string;
  seller_is_foreign_person?: boolean | null;
  create_date: string;
  update_date: string;
  status: string;
};

export type RepresentationAgreementContactLink = {
  id: number;
  representation_agreement_id: number;
  contact_id: number;
  client_role: ClientRole;
  sort_order: number;
  status: string;
  contacts?: Contact;
};

export type ListingAgreementListItem = RepresentationAgreement & {
  listing_agreement_details:
    | ListingAgreementDetails
    | ListingAgreementDetails[]
    | null;
  properties: Property | Property[] | null;
  representation_agreement_clients: RepresentationAgreementContactLink[];
};

import type { PropertySelectionMode } from "@/lib/types/property";

export type ListingAgreementInput = {
  effective_date: string;
  expiration_date: string;
  agreement_status: AgreementLifecycleStatus;
  contact_ids: number[];
  property_mode: PropertySelectionMode;
  property_id: number | null;
  property: PropertyInput;
  representation_kind: ListingRepresentationKind;
  list_price: string;
  seller_broker_fee_percent: string;
  buyer_broker_fee_percent: string;
  showing_service: string;
  hoa_exists: boolean;
  lead_based_paint_required: boolean;
  seller_disclosure_required: boolean;
  exclusions: string;
  included_personal_property: string;
  service_contract_amount: string;
  preferred_title_company: string;
  occupancy_status: string;
  access_notes: string;
};

export const emptyListingAgreementInput = (): ListingAgreementInput => ({
  effective_date: "",
  expiration_date: "",
  agreement_status: "ACTIVE",
  contact_ids: [],
  property_mode: "existing",
  property_id: null,
  property: emptyPropertyInput(),
  representation_kind: "SALE",
  list_price: "",
  seller_broker_fee_percent: "",
  buyer_broker_fee_percent: "",
  showing_service: "BrokerBay",
  hoa_exists: false,
  lead_based_paint_required: false,
  seller_disclosure_required: false,
  exclusions: "NA",
  included_personal_property: "NA",
  service_contract_amount: "0",
  preferred_title_company: "",
  occupancy_status: "",
  access_notes: "NA",
});

export function formatAgreementReference(id: number): string {
  return `#${id}`;
}

export function formatAgreementStatus(status: AgreementLifecycleStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function formatListingRepresentationKind(
  kind: ListingRepresentationKind,
): string {
  return kind.charAt(0) + kind.slice(1).toLowerCase();
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const datePart = date.split("T")[0];
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return datePart;
  return `${month}/${day}/${year}`;
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function getListingAgreementDetails(
  item: ListingAgreementListItem,
): ListingAgreementDetails | null {
  if (!item.listing_agreement_details) return null;
  if (Array.isArray(item.listing_agreement_details)) {
    return item.listing_agreement_details[0] ?? null;
  }
  return item.listing_agreement_details;
}

export function getLinkedProperty(
  item: ListingAgreementListItem,
): Property | null {
  if (!item.properties) return null;
  if (Array.isArray(item.properties)) {
    return item.properties[0] ?? null;
  }
  return item.properties;
}

export function getOrderedSellerNames(item: ListingAgreementListItem): string {
  const links = [...(item.representation_agreement_clients ?? [])]
    .filter((link) => link.status === "ACTIVE" && link.contacts)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (links.length === 0) return "—";

  return links
    .map((link) => formatContactDisplayName(link.contacts as Contact))
    .join(", ");
}

export function getSellerClientRole(
  representationKind: ListingRepresentationKind,
  index: number,
): ClientRole {
  if (index > 0) return "CO_CLIENT";
  return representationKind === "SALE" ? "SELLER" : "LANDLORD";
}

export function listingAgreementToInput(
  agreement: RepresentationAgreement,
  details: ListingAgreementDetails,
  contactLinks: RepresentationAgreementContactLink[],
  property: Property | null,
): ListingAgreementInput {
  const orderedContactIds = [...contactLinks]
    .filter((link) => link.status === "ACTIVE")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((link) => link.contact_id);

  return {
    effective_date: agreement.effective_date.split("T")[0],
    expiration_date: agreement.expiration_date
      ? agreement.expiration_date.split("T")[0]
      : "",
    agreement_status: agreement.agreement_status,
    contact_ids: orderedContactIds,
    property_mode: property ? "existing" : "new",
    property_id: agreement.property_id,
    property: property ? propertyToInput(property) : emptyPropertyInput(),
    representation_kind: details.representation_kind,
    list_price:
      details.list_price != null ? String(details.list_price) : "",
    seller_broker_fee_percent:
      details.seller_broker_fee_percent != null
        ? String(details.seller_broker_fee_percent)
        : "",
    buyer_broker_fee_percent:
      details.buyer_broker_fee_percent != null
        ? String(details.buyer_broker_fee_percent)
        : "",
    showing_service: details.showing_service,
    hoa_exists: details.hoa_exists ?? false,
    lead_based_paint_required: details.lead_based_paint_required ?? false,
    seller_disclosure_required: details.seller_disclosure_required ?? false,
    exclusions: details.exclusions,
    included_personal_property: details.included_personal_property,
    service_contract_amount: String(details.service_contract_amount),
    preferred_title_company: details.preferred_title_company ?? "",
    occupancy_status: details.occupancy_status ?? "",
    access_notes: details.access_notes,
  };
}

export function validateListingAgreementInput(
  input: ListingAgreementInput,
): string | null {
  if (!input.effective_date.trim()) {
    return "Effective date is required.";
  }

  if (input.contact_ids.length === 0) {
    return "At least one seller is required.";
  }

  if (!input.representation_kind) {
    return "Representation kind is required.";
  }

  if (input.property_mode === "existing" && input.property_id == null) {
    return "Property is required.";
  }

  if (input.property_mode === "new") {
    const propertyError = validatePropertyInput(input.property);
    if (propertyError) return propertyError;
  }

  if (
    input.expiration_date &&
    input.expiration_date < input.effective_date
  ) {
    return "Expiration date must be on or after the effective date.";
  }

  if (input.representation_kind === "SALE") {
    if (!input.list_price.trim()) {
      return "List price is required for sale listings.";
    }
    const listPrice = Number(input.list_price);
    if (Number.isNaN(listPrice) || listPrice < 0) {
      return "List price must be a valid number of 0 or more.";
    }
  }

  if (input.list_price.trim()) {
    const listPrice = Number(input.list_price);
    if (Number.isNaN(listPrice) || listPrice < 0) {
      return "List price must be a valid number of 0 or more.";
    }
  }

  const serviceContract = Number(input.service_contract_amount);
  if (Number.isNaN(serviceContract) || serviceContract < 0) {
    return "Service contract amount must be a valid number of 0 or more.";
  }

  return null;
}

export function normalizeListingAgreementInput(input: ListingAgreementInput) {
  const trim = (value: string) => value.trim();
  const optionalNumber = (value: string) => {
    const trimmed = trim(value);
    return trimmed.length > 0 ? Number(trimmed) : null;
  };

  return {
    agreement: {
      agreement_type: "LISTING" as const,
      agreement_status: input.agreement_status,
      effective_date: trim(input.effective_date),
      expiration_date: trim(input.expiration_date) || null,
    },
    details: {
      representation_kind: input.representation_kind,
      list_price: optionalNumber(input.list_price),
      seller_broker_fee_percent: optionalNumber(input.seller_broker_fee_percent),
      buyer_broker_fee_percent: optionalNumber(input.buyer_broker_fee_percent),
      showing_service: trim(input.showing_service) || "BrokerBay",
      hoa_exists: input.hoa_exists,
      lead_based_paint_required: input.lead_based_paint_required,
      seller_disclosure_required: input.seller_disclosure_required,
      exclusions: trim(input.exclusions) || "NA",
      included_personal_property: trim(input.included_personal_property) || "NA",
      service_contract_amount: Number(input.service_contract_amount),
      preferred_title_company: trim(input.preferred_title_company) || null,
      occupancy_status: trim(input.occupancy_status) || null,
      access_notes: trim(input.access_notes) || "NA",
    },
    contact_ids: input.contact_ids,
    property_mode: input.property_mode,
    property_id: input.property_id,
    property: input.property,
  };
}

export function buildListingContactLinkRows(
  agreementId: number,
  contactIds: number[],
  representationKind: ListingRepresentationKind,
) {
  return contactIds.map((contactId, index) => ({
    representation_agreement_id: agreementId,
    contact_id: contactId,
    sort_order: index,
    client_role: getSellerClientRole(representationKind, index),
  }));
}

/** @deprecated Use buildListingContactLinkRows */
export const buildListingClientLinkRows = buildListingContactLinkRows;

export function getPropertyAddressForListItem(
  item: ListingAgreementListItem,
): string {
  const property = getLinkedProperty(item);
  if (!property) return "—";
  return formatPropertyAddress(property);
}
