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

export type MapboxFeatureLike = {
  properties?: {
    context?: unknown;
    address_level3?: string;
  };
};

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

type MapboxContextComponent = {
  id?: string;
  text?: string;
  name?: string;
};

type MapboxContextObject = {
  district?: MapboxDistrictValue;
};

type MapboxDistrictValue =
  | string
  | {
      id?: string;
      name?: string;
      text?: string;
      mapbox_id?: string;
    };

function trimToOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function districtLabelFromValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return trimToOptionalString(value);
  }

  if (!value || typeof value !== "object") return undefined;

  const district = value as Exclude<MapboxDistrictValue, string>;
  return (
    trimToOptionalString(district.name) ?? trimToOptionalString(district.text)
  );
}

function formatMapboxCountyName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const withoutSuffix = value.replace(/\s+county$/i, "").trim();
  return withoutSuffix || undefined;
}

function isDistrictContextId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  const normalized = id.toLowerCase();
  return normalized === "district" || normalized.startsWith("district.");
}

function isDistrictContextComponent(component: MapboxContextComponent): boolean {
  if (isDistrictContextId(component.id)) return true;
  if (typeof component.id !== "string") return false;
  const [type] = component.id.split(/[./]/);
  return type?.toLowerCase() === "district";
}

/**
 * Address Autofill returns `context` as an array (`district.*` → `text`).
 * Search Box retrieve responses use an object (`context.district.name`).
 *
 * County must come only from district/county-level context — never from
 * neighborhood, locality, place, street, or address-level3.
 */
export function extractCountyFromMapboxContext(
  context: unknown,
): string | undefined {
  if (!context) return undefined;

  if (Array.isArray(context)) {
    for (const component of context) {
      if (!component || typeof component !== "object") continue;
      const typed = component as MapboxContextComponent;
      if (!isDistrictContextComponent(typed)) continue;
      const county =
        districtLabelFromValue(typed) ??
        trimToOptionalString(typed.text) ??
        trimToOptionalString(typed.name);
      const formatted = formatMapboxCountyName(county);
      if (formatted) return formatted;
    }
    return undefined;
  }

  if (typeof context === "object") {
    return formatMapboxCountyName(
      districtLabelFromValue((context as MapboxContextObject).district),
    );
  }

  return undefined;
}

export function extractCountyFromMapboxFeature(
  feature: MapboxFeatureLike | null | undefined,
): string | undefined {
  if (!feature) return undefined;

  const properties = feature.properties;
  const fromProperties = extractCountyFromMapboxContext(properties?.context);
  if (fromProperties) return fromProperties;

  const featureContext = (feature as { context?: unknown }).context;
  return extractCountyFromMapboxContext(featureContext);
}

export function parseMapboxRetrieveResponse(
  response: AddressAutofillRetrieveResponse,
): ParsedMapboxAddress | null {
  const feature = response.features?.[0];
  const properties = feature?.properties;
  if (!properties) return null;

  const county = extractCountyFromMapboxFeature(feature);

  return {
    line1: properties.address_line1 ?? properties.feature_name ?? undefined,
    line2: properties.address_line2 || undefined,
    city: properties.address_level2 || undefined,
    state: properties.address_level1
      ? normalizeUsStateCode(properties.address_level1)
      : undefined,
    zip: properties.postcode || undefined,
    county,
  };
}
