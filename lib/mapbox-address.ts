import type { AddressAutofillRetrieveResponse } from "@mapbox/search-js-core";

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

export type ParsedMapboxAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
};

export type AddressAutofillSection = "default" | "shipping";

export function getMapboxAccessToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  return token || null;
}

export function addressAutocompleteAttr(
  section: AddressAutofillSection,
  field:
    | "address-line1"
    | "address-line2"
    | "address-level2"
    | "address-level1"
    | "postal-code"
    | "country",
): string {
  if (section === "shipping") {
    return `shipping ${field}`;
  }
  return field;
}

export function normalizeUsStateCode(state: string): string {
  const trimmed = state.trim();
  if (!trimmed) return trimmed;
  if (trimmed.length <= 2) return trimmed.toUpperCase();
  return US_STATE_NAME_TO_CODE[trimmed.toLowerCase()] ?? trimmed.toUpperCase();
}

export function parseMapboxRetrieveResponse(
  response: AddressAutofillRetrieveResponse,
): ParsedMapboxAddress | null {
  const properties = response.features?.[0]?.properties;
  if (!properties) return null;

  const countyFromContext = properties.context?.find((component) =>
    component.id.startsWith("district."),
  )?.text;

  return {
    line1: properties.address_line1 ?? properties.feature_name ?? undefined,
    line2: properties.address_line2 || undefined,
    city: properties.address_level2 || undefined,
    state: properties.address_level1
      ? normalizeUsStateCode(properties.address_level1)
      : undefined,
    zip: properties.postcode || undefined,
    county: countyFromContext || properties.address_level3 || undefined,
  };
}
