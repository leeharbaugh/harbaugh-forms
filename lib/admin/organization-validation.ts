import type { OrganizationType } from "../types/organization";

export type OrganizationInput = {
  name: string;
  legalName?: string | null;
  organizationType?: OrganizationType;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  brokerageLicenseNumber?: string | null;
  brokerFirstName?: string | null;
  brokerMiddleName?: string | null;
  brokerLastName?: string | null;
  brokerLicenseNumber?: string | null;
  brokerPhone?: string | null;
  brokerEmail?: string | null;
};

export type NormalizedOrganizationInput = {
  name: string;
  legal_name: string | null;
  organization_type: OrganizationType;
  email: string | null;
  phone: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  brokerage_license_number: string | null;
  broker_first_name: string | null;
  broker_middle_name: string | null;
  broker_last_name: string | null;
  broker_license_number: string | null;
  broker_phone: string | null;
  broker_email: string | null;
};

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

/** Match lib/phone-format formatPhoneInput (no value import for Node strip-types tests). */
function formatOrgPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);
  if (digits.length === 0) {
    return "";
  }
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function validateOrganizationInput(
  input: OrganizationInput,
):
  | { ok: true; value: NormalizedOrganizationInput }
  | { ok: false; error: string } {
  const name = input.name?.trim() ?? "";
  if (!name) {
    return { ok: false, error: "Organization name is required." };
  }

  const organizationType = input.organizationType ?? "BROKERAGE";
  if (organizationType !== "BROKERAGE" && organizationType !== "OTHER") {
    return { ok: false, error: "Invalid organization type." };
  }

  const state = (input.state?.trim().toUpperCase() || "TX").slice(0, 2);
  if (state.length !== 2) {
    return { ok: false, error: "State must be a two-letter code." };
  }

  const phone = nullableTrim(input.phone);
  const brokerPhone = nullableTrim(input.brokerPhone);

  return {
    ok: true,
    value: {
      name,
      legal_name: nullableTrim(input.legalName),
      organization_type: organizationType,
      email: nullableTrim(input.email)?.toLowerCase() ?? null,
      phone: phone ? formatOrgPhone(phone) : null,
      address_line_1: nullableTrim(input.addressLine1),
      address_line_2: nullableTrim(input.addressLine2),
      city: nullableTrim(input.city),
      state,
      zip: nullableTrim(input.zip),
      brokerage_license_number: nullableTrim(input.brokerageLicenseNumber),
      broker_first_name: nullableTrim(input.brokerFirstName),
      broker_middle_name: nullableTrim(input.brokerMiddleName),
      broker_last_name: nullableTrim(input.brokerLastName),
      broker_license_number: nullableTrim(input.brokerLicenseNumber),
      broker_phone: brokerPhone ? formatOrgPhone(brokerPhone) : null,
      broker_email: nullableTrim(input.brokerEmail)?.toLowerCase() ?? null,
    },
  };
}
