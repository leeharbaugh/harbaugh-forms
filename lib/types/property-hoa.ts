export type PropertyHoa = {
  id: number;
  create_date: string;
  update_date: string;
  status: string;
  property_id: number;
  hoa_name: string;
  hoa_phone: string | null;
  management_company_name: string | null;
  management_company_phone: string | null;
  management_company_email: string | null;
  notes: string | null;
};

export const PROPERTY_HOA_RESOLVER_KEYS = [
  "property_hoa_name",
  "property_hoa_phone",
] as const;

export type PropertyHoaResolverKey = (typeof PROPERTY_HOA_RESOLVER_KEYS)[number];

export function isPropertyHoaResolverKey(
  key: string | null | undefined,
): key is PropertyHoaResolverKey {
  if (!key) {
    return false;
  }

  return PROPERTY_HOA_RESOLVER_KEYS.includes(
    key.trim().toLowerCase() as PropertyHoaResolverKey,
  );
}

export function pickPrimaryPropertyHoa(
  hoas: PropertyHoa[],
): PropertyHoa | null {
  if (hoas.length === 0) {
    return null;
  }

  return [...hoas].sort((left, right) => {
    const byCreateDate = left.create_date.localeCompare(right.create_date);
    if (byCreateDate !== 0) {
      return byCreateDate;
    }

    return left.id - right.id;
  })[0];
}

export function resolvePropertyHoaFieldValue(
  key: string,
  hoa: PropertyHoa | null,
): string {
  if (!hoa) {
    return "";
  }

  const normalizedKey = key.trim().toLowerCase();

  if (normalizedKey === "property_hoa_name") {
    return hoa.hoa_name.trim();
  }

  if (normalizedKey === "property_hoa_phone") {
    return hoa.hoa_phone?.trim() ?? "";
  }

  return "";
}

/**
 * Temporary single-HOA UI convention: Property-screen form fields map to one
 * ACTIVE property_hoas row (first by create_date, then id).
 */
export type PropertyHoaFormFields = {
  hoa_name: string;
  hoa_phone: string;
  hoa_management_company: string;
};

export function extractPropertyHoaFormFields(input: {
  hoa_name: string;
  hoa_phone: string;
  hoa_management_company: string;
}): PropertyHoaFormFields {
  return {
    hoa_name: input.hoa_name,
    hoa_phone: input.hoa_phone,
    hoa_management_company: input.hoa_management_company,
  };
}

export function propertyHoaFormFieldsFromRow(
  hoa: PropertyHoa | null | undefined,
): PropertyHoaFormFields {
  if (!hoa) {
    return {
      hoa_name: "",
      hoa_phone: "",
      hoa_management_company: "",
    };
  }

  return {
    hoa_name: hoa.hoa_name ?? "",
    hoa_phone: hoa.hoa_phone ?? "",
    hoa_management_company: hoa.management_company_name ?? "",
  };
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildPropertyHoaWritePayload(fields: PropertyHoaFormFields): {
  hoa_name: string;
  hoa_phone: string | null;
  management_company_name: string | null;
} | null {
  const hoaName = fields.hoa_name.trim();
  if (!hoaName) {
    return null;
  }

  return {
    hoa_name: hoaName,
    hoa_phone: normalizeOptionalText(fields.hoa_phone),
    management_company_name: normalizeOptionalText(
      fields.hoa_management_company,
    ),
  };
}
