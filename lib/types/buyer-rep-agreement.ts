import {
  type Contact,
  formatContactDisplayName,
} from "@/lib/types/contact";

export type AgreementLifecycleStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "TERMINATED"
  | "COMPLETED";

export type RepresentationKind = "PURCHASE" | "LEASE";

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

export type BuyerRepDetails = {
  id: number;
  representation_agreement_id: number;
  representation_kind: RepresentationKind;
  market_area: string;
  compensation_percent: number;
  lease_one_month_rent_percent: number;
  lease_all_rents_percent: number;
  lease_flat_fee: number;
  purchase_flat_fee: number;
  protection_period_days: number;
  county_for_payment: string;
  employer_relocation: string;
  intermediary_allowed: boolean;
  retainer_amount: number;
  retainer_applies_to_fee: boolean;
  construction_compensation: string;
  other_compensation: string;
  add_iabs: boolean;
  add_home_inspection: boolean;
  add_wire_fraud: boolean;
  add_mineral_clauses: boolean;
  add_lead_based_paint: boolean;
  add_mold_remediation: boolean;
  add_flood_hazard: boolean;
  add_property_insurance: boolean;
  add_general_information_notice: boolean;
  add_other_document: boolean;
  add_other_document_description: string;
  special_provisions: string;
  create_date: string;
  update_date: string;
  status: string;
};

export type RepresentationAgreementContactLink = {
  id: number;
  representation_agreement_id: number;
  contact_id: number;
  client_role: string;
  sort_order: number;
  status: string;
  contacts?: Contact;
};

export type BuyerRepAgreementListItem = RepresentationAgreement & {
  buyer_rep_details: BuyerRepDetails | BuyerRepDetails[] | null;
  representation_agreement_clients: RepresentationAgreementContactLink[];
};

export type BuyerRepAgreementInput = {
  effective_date: string;
  expiration_date: string;
  agreement_status: AgreementLifecycleStatus;
  contact_ids: number[];
  representation_kind: RepresentationKind;
  market_area: string;
  compensation_percent: string;
  lease_one_month_rent_percent: string;
  lease_all_rents_percent: string;
  lease_flat_fee: string;
  purchase_flat_fee: string;
  protection_period_days: string;
  county_for_payment: string;
  employer_relocation: string;
  intermediary_allowed: boolean;
  retainer_amount: string;
  retainer_applies_to_fee: boolean;
  construction_compensation: string;
  other_compensation: string;
  add_iabs: boolean;
  add_home_inspection: boolean;
  add_wire_fraud: boolean;
  add_mineral_clauses: boolean;
  add_lead_based_paint: boolean;
  add_mold_remediation: boolean;
  add_flood_hazard: boolean;
  add_property_insurance: boolean;
  add_general_information_notice: boolean;
  add_other_document: boolean;
  add_other_document_description: string;
  special_provisions: string;
};

export const emptyBuyerRepAgreementInput = (): BuyerRepAgreementInput => ({
  effective_date: "",
  expiration_date: "",
  agreement_status: "ACTIVE",
  contact_ids: [],
  representation_kind: "PURCHASE",
  market_area: "DFW",
  compensation_percent: "3.000",
  lease_one_month_rent_percent: "0",
  lease_all_rents_percent: "0",
  lease_flat_fee: "0",
  purchase_flat_fee: "0",
  protection_period_days: "30",
  county_for_payment: "Dallas/Tarrant",
  employer_relocation: "NA",
  intermediary_allowed: true,
  retainer_amount: "0",
  retainer_applies_to_fee: true,
  construction_compensation: "NA",
  other_compensation: "NA",
  add_iabs: true,
  add_home_inspection: true,
  add_wire_fraud: true,
  add_mineral_clauses: true,
  add_lead_based_paint: false,
  add_mold_remediation: false,
  add_flood_hazard: false,
  add_property_insurance: false,
  add_general_information_notice: false,
  add_other_document: false,
  add_other_document_description: "NA",
  special_provisions: "NA",
});

export function formatAgreementType(type: string): string {
  if (type === "BUYER_REP") return "Buyer Rep";
  if (type === "LISTING") return "Listing";
  return type;
}

export function formatAgreementStatus(status: AgreementLifecycleStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function formatRepresentationKind(kind: RepresentationKind): string {
  return kind.charAt(0) + kind.slice(1).toLowerCase();
}

export function formatAgreementReference(id: number): string {
  return `#${id}`;
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const datePart = date.split("T")[0];
  const [year, month, day] = datePart.split("-");
  if (!year || !month || !day) return datePart;
  return `${month}/${day}/${year}`;
}

export function getBuyerRepDetails(
  item: BuyerRepAgreementListItem,
): BuyerRepDetails | null {
  if (!item.buyer_rep_details) return null;
  if (Array.isArray(item.buyer_rep_details)) {
    return item.buyer_rep_details[0] ?? null;
  }
  return item.buyer_rep_details;
}

export function getOrderedContactNames(item: BuyerRepAgreementListItem): string {
  const links = [...(item.representation_agreement_clients ?? [])]
    .filter((link) => link.status === "ACTIVE" && link.contacts)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (links.length === 0) return "—";

  return links
    .map((link) => formatContactDisplayName(link.contacts as Contact))
    .join(", ");
}

/** @deprecated Use getOrderedContactNames */
export const getOrderedClientNames = getOrderedContactNames;

export function buyerRepAgreementToInput(
  agreement: RepresentationAgreement,
  details: BuyerRepDetails,
  contactLinks: RepresentationAgreementContactLink[],
): BuyerRepAgreementInput {
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
    representation_kind: details.representation_kind,
    market_area: details.market_area,
    compensation_percent: String(details.compensation_percent),
    lease_one_month_rent_percent: String(
      details.lease_one_month_rent_percent ?? 0,
    ),
    lease_all_rents_percent: String(details.lease_all_rents_percent ?? 0),
    lease_flat_fee: String(details.lease_flat_fee ?? 0),
    purchase_flat_fee: String(details.purchase_flat_fee ?? 0),
    protection_period_days: String(details.protection_period_days),
    county_for_payment: details.county_for_payment,
    employer_relocation: details.employer_relocation,
    intermediary_allowed: details.intermediary_allowed,
    retainer_amount: String(details.retainer_amount),
    retainer_applies_to_fee: details.retainer_applies_to_fee ?? true,
    construction_compensation: details.construction_compensation ?? "NA",
    other_compensation: details.other_compensation ?? "NA",
    add_iabs: details.add_iabs,
    add_home_inspection: details.add_home_inspection,
    add_wire_fraud: details.add_wire_fraud,
    add_mineral_clauses: details.add_mineral_clauses,
    add_lead_based_paint: details.add_lead_based_paint ?? false,
    add_mold_remediation: details.add_mold_remediation ?? false,
    add_flood_hazard: details.add_flood_hazard ?? false,
    add_property_insurance: details.add_property_insurance ?? false,
    add_general_information_notice:
      details.add_general_information_notice ?? false,
    add_other_document: details.add_other_document ?? false,
    add_other_document_description:
      details.add_other_document_description ?? "NA",
    special_provisions: details.special_provisions,
  };
}

export function validateBuyerRepAgreementInput(
  input: BuyerRepAgreementInput,
): string | null {
  if (!input.effective_date.trim()) {
    return "Effective date is required.";
  }

  if (input.contact_ids.length === 0) {
    return "At least one buyer is required.";
  }

  if (!input.representation_kind) {
    return "Representation kind is required.";
  }

  if (
    input.expiration_date &&
    input.expiration_date < input.effective_date
  ) {
    return "Expiration date must be on or after the effective date.";
  }

  const compensation = Number(input.compensation_percent);
  if (Number.isNaN(compensation) || compensation < 0) {
    return "Purchase compensation percent must be a valid number.";
  }

  const leaseOneMonthRentPercent = Number(input.lease_one_month_rent_percent);
  if (Number.isNaN(leaseOneMonthRentPercent) || leaseOneMonthRentPercent < 0) {
    return "Lease one month rent percent must be a valid number.";
  }

  const leaseAllRentsPercent = Number(input.lease_all_rents_percent);
  if (Number.isNaN(leaseAllRentsPercent) || leaseAllRentsPercent < 0) {
    return "Lease all rents percent must be a valid number.";
  }

  const leaseFlatFee = Number(input.lease_flat_fee);
  if (Number.isNaN(leaseFlatFee) || leaseFlatFee < 0) {
    return "Lease flat fee must be a valid number of 0 or more.";
  }

  const purchaseFlatFee = Number(input.purchase_flat_fee);
  if (Number.isNaN(purchaseFlatFee) || purchaseFlatFee < 0) {
    return "Purchase flat fee must be a valid number of 0 or more.";
  }

  const protectionDays = Number(input.protection_period_days);
  if (
    Number.isNaN(protectionDays) ||
    protectionDays < 0 ||
    !Number.isInteger(protectionDays)
  ) {
    return "Protection period days must be a whole number of 0 or more.";
  }

  const retainer = Number(input.retainer_amount);
  if (Number.isNaN(retainer) || retainer < 0) {
    return "Retainer amount must be a valid number of 0 or more.";
  }

  return null;
}

export function normalizeBuyerRepAgreementInput(input: BuyerRepAgreementInput) {
  const trim = (value: string) => value.trim();

  return {
    agreement: {
      agreement_type: "BUYER_REP" as const,
      agreement_status: input.agreement_status,
      effective_date: trim(input.effective_date),
      expiration_date: trim(input.expiration_date) || null,
    },
    details: {
      representation_kind: input.representation_kind,
      market_area: trim(input.market_area) || "DFW",
      compensation_percent: Number(input.compensation_percent),
      lease_one_month_rent_percent: Number(input.lease_one_month_rent_percent),
      lease_all_rents_percent: Number(input.lease_all_rents_percent),
      lease_flat_fee: Number(input.lease_flat_fee),
      purchase_flat_fee: Number(input.purchase_flat_fee),
      protection_period_days: Number(input.protection_period_days),
      county_for_payment: trim(input.county_for_payment) || "Dallas/Tarrant",
      employer_relocation: trim(input.employer_relocation) || "NA",
      intermediary_allowed: input.intermediary_allowed,
      retainer_amount: Number(input.retainer_amount),
      retainer_applies_to_fee: input.retainer_applies_to_fee,
      construction_compensation: trim(input.construction_compensation) || "NA",
      other_compensation: trim(input.other_compensation) || "NA",
      add_iabs: input.add_iabs,
      add_home_inspection: input.add_home_inspection,
      add_wire_fraud: input.add_wire_fraud,
      add_mineral_clauses: input.add_mineral_clauses,
      add_lead_based_paint: input.add_lead_based_paint,
      add_mold_remediation: input.add_mold_remediation,
      add_flood_hazard: input.add_flood_hazard,
      add_property_insurance: input.add_property_insurance,
      add_general_information_notice: input.add_general_information_notice,
      add_other_document: input.add_other_document,
      add_other_document_description:
        trim(input.add_other_document_description) || "NA",
      special_provisions: trim(input.special_provisions) || "NA",
    },
    contact_ids: input.contact_ids,
  };
}

export function buildContactLinkRows(
  agreementId: number,
  contactIds: number[],
) {
  return contactIds.map((contactId, index) => ({
    representation_agreement_id: agreementId,
    contact_id: contactId,
    sort_order: index,
    client_role: index === 0 ? "PRIMARY" : "CO_CLIENT",
  }));
}

/** @deprecated Use buildContactLinkRows */
export const buildClientLinkRows = buildContactLinkRows;
