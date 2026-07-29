export type BrokerageOfficeInput = {
  organizationId: string;
  officeName: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  officePhone?: string | null;
  branchLicenseNumber?: string | null;
  isMainOffice?: boolean;
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function validateBrokerageOfficeInput(
  input: BrokerageOfficeInput,
): { ok: true; value: BrokerageOfficeInput } | { ok: false; error: string } {
  const organizationId = input.organizationId?.trim() ?? "";
  const officeName = input.officeName?.trim() ?? "";
  if (!organizationId) {
    return { ok: false, error: "Organization is required." };
  }
  if (!officeName) {
    return { ok: false, error: "Office name is required." };
  }
  return {
    ok: true,
    value: {
      organizationId,
      officeName,
      addressLine1: trimOrNull(input.addressLine1),
      addressLine2: trimOrNull(input.addressLine2),
      city: trimOrNull(input.city),
      state: trimOrNull(input.state) ?? "TX",
      zip: trimOrNull(input.zip),
      officePhone: trimOrNull(input.officePhone),
      branchLicenseNumber: trimOrNull(input.branchLicenseNumber),
      isMainOffice: Boolean(input.isMainOffice),
    },
  };
}
