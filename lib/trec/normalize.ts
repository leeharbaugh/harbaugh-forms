/**
 * TREC Open Data (Socrata) license lookup — pure helpers (safe for tests).
 * Official dataset: s7ft-44qi Broker and Sales Agent License Holder Information.
 */

export const TREC_DATASET_ID = "s7ft-44qi";
export const TREC_SODA_BASE_URL = `https://data.texas.gov/resource/${TREC_DATASET_ID}.json`;

export type TrecLicenseTypeCode = "SALE" | "BRK";

export type TrecLicenseCandidate = {
  licenseNumber: string;
  licenseNumberNormalized: string;
  licenseType: string;
  fullName: string;
  suffix: string | null;
  status: string;
  expirationDate: string | null;
  relatedLicenseNumber: string | null;
  relatedLicenseName: string | null;
  relatedLicenseType: string | null;
  county: string | null;
};

export type TrecLookupRequest = {
  licenseNumber?: string | null;
  fullName?: string | null;
  licenseTypes?: TrecLicenseTypeCode[];
  limit?: number;
};

export type TrecRawRecord = Record<string, unknown>;

const MAX_RESULTS = 25;

/** Preserve official display text; compare on a normalized form. */
export function normalizeLicenseNumberForCompare(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function preserveLicenseNumberDisplay(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  // Never coerce through Number — hyphens/suffixes must survive.
  return String(value).trim();
}

function asOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function escapeSodaString(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildTrecWhereClause(request: TrecLookupRequest): string | null {
  const parts: string[] = [];
  const licenseTypes = request.licenseTypes?.length
    ? request.licenseTypes
    : (["SALE", "BRK"] as TrecLicenseTypeCode[]);

  const typeList = licenseTypes
    .map((code) => `'${escapeSodaString(code)}'`)
    .join(", ");
  parts.push(`license_type in (${typeList})`);

  const licenseNumber = request.licenseNumber?.trim();
  if (licenseNumber) {
    const display = preserveLicenseNumberDisplay(licenseNumber);
    const normalized = normalizeLicenseNumberForCompare(display);
    parts.push(
      `(upper(license_number)='${escapeSodaString(normalized)}' or license_number='${escapeSodaString(display)}')`,
    );
  }

  const fullName = request.fullName?.trim();
  if (fullName) {
    const escaped = escapeSodaString(fullName.replace(/\s+/g, " "));
    parts.push(`upper(full_name) like upper('%${escaped}%')`);
  }

  if (!licenseNumber && !fullName) {
    return null;
  }

  return parts.join(" AND ");
}

export function normalizeTrecRecord(raw: TrecRawRecord): TrecLicenseCandidate | null {
  const licenseNumber = preserveLicenseNumberDisplay(raw.license_number);
  if (!licenseNumber) {
    return null;
  }
  const fullName = asOptionalString(raw.full_name) ?? "";
  if (!fullName) {
    return null;
  }

  // Reject unexpected nested objects / prototype pollution vectors.
  for (const [key, value] of Object.entries(raw)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    if (value !== null && typeof value === "object") {
      return null;
    }
  }

  return {
    licenseNumber,
    licenseNumberNormalized: normalizeLicenseNumberForCompare(licenseNumber),
    licenseType: asOptionalString(raw.license_type) ?? "",
    fullName,
    suffix: asOptionalString(raw.suffix),
    status: asOptionalString(raw.status) ?? "",
    expirationDate: asOptionalString(raw.license_expiration_date),
    relatedLicenseNumber: preserveLicenseNumberDisplay(
      raw.related_license_number || "",
    ) || null,
    relatedLicenseName: asOptionalString(raw.related_license_full_name),
    relatedLicenseType: asOptionalString(raw.related_license_type),
    county: asOptionalString(raw.county),
  };
}

export function normalizeTrecRecords(
  rows: TrecRawRecord[],
  limit = MAX_RESULTS,
): TrecLicenseCandidate[] {
  const out: TrecLicenseCandidate[] = [];
  for (const row of rows) {
    const normalized = normalizeTrecRecord(row);
    if (normalized) {
      out.push(normalized);
    }
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

export function isLicenseInGoodStanding(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (
    /current|active|good standing/.test(normalized) &&
    !/inactive|expired|suspend|revok|relinquish|deceased|cancelled|canceled/.test(
      normalized,
    )
  ) {
    return true;
  }
  // TREC status codes may be short (e.g. "A" / "Current").
  if (normalized === "a" || normalized === "c") {
    return true;
  }
  return false;
}

export function isLicenseExpired(expirationDate: string | null): boolean {
  if (!expirationDate) {
    return false;
  }
  // Accept YYYYMMDD or ISO-ish dates.
  const digits = expirationDate.replace(/\D/g, "");
  let iso = expirationDate;
  if (digits.length === 8 && !expirationDate.includes("-")) {
    iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export type SponsorshipMismatch = {
  mismatched: boolean;
  trecRelatedLicenseNumber: string | null;
  trecRelatedLicenseName: string | null;
  appBrokerLicenseNumber: string | null;
  appBrokerName: string | null;
};

export function compareSponsoringBroker(options: {
  candidate: Pick<
    TrecLicenseCandidate,
    "relatedLicenseNumber" | "relatedLicenseName"
  >;
  appBrokerLicenseNumber?: string | null;
  appBrokerName?: string | null;
}): SponsorshipMismatch {
  const trecLicense = options.candidate.relatedLicenseNumber
    ? normalizeLicenseNumberForCompare(options.candidate.relatedLicenseNumber)
    : "";
  const appLicense = options.appBrokerLicenseNumber
    ? normalizeLicenseNumberForCompare(options.appBrokerLicenseNumber)
    : "";

  let mismatched = false;
  if (trecLicense && appLicense && trecLicense !== appLicense) {
    mismatched = true;
  }

  return {
    mismatched,
    trecRelatedLicenseNumber: options.candidate.relatedLicenseNumber,
    trecRelatedLicenseName: options.candidate.relatedLicenseName,
    appBrokerLicenseNumber: options.appBrokerLicenseNumber ?? null,
    appBrokerName: options.appBrokerName ?? null,
  };
}

export function parseTrecFullName(fullName: string): {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  fullName: string;
} {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return { fullName: "" };
  }

  // TREC commonly returns "LAST, FIRST MIDDLE".
  if (trimmed.includes(",")) {
    const [lastPart, restPart = ""] = trimmed.split(",", 2);
    const lastName = lastPart.trim() || undefined;
    const given = restPart.trim().split(/\s+/).filter(Boolean);
    return {
      firstName: given[0],
      middleName: given.length > 1 ? given.slice(1).join(" ") : undefined,
      lastName,
      fullName: trimmed,
    };
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], fullName: trimmed };
  }
  return {
    firstName: parts[0],
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : undefined,
    lastName: parts[parts.length - 1],
    fullName: trimmed,
  };
}

export function clampTrecLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) {
    return 15;
  }
  return Math.min(MAX_RESULTS, Math.max(1, Math.floor(limit)));
}
