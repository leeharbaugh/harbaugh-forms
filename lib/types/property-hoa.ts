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
