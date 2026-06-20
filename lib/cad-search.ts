const CAD_SEARCH_URLS: Record<string, string> = {
  dallas: "https://www.dallascad.org/searchaddr.aspx",
  tarrant: "https://www.tad.org/",
  johnson: "https://johnsoncad.com/",
  ellis: "https://www.elliscad.com/property-search",
  parker:
    "https://www.southwestdatasolution.com/webindex.aspx?dbkey=PARKERCAD",
  denton: "https://www.dentoncad.com/property-search",
  collin: "https://esearch.collincad.org/",
  wise: "https://esearch.wise-cad.com/",
  hood: "https://hoodcad.net/",
};

export function normalizeCountyName(county: string): string | null {
  const trimmed = county.trim();
  if (!trimmed) {
    return null;
  }

  const withoutSuffix = trimmed.replace(/\s+county$/i, "").trim();
  if (!withoutSuffix) {
    return null;
  }

  return withoutSuffix.toLowerCase();
}

export function getCadSearchUrl(county: string): string | null {
  const normalized = normalizeCountyName(county);
  if (!normalized) {
    return null;
  }

  return CAD_SEARCH_URLS[normalized] ?? null;
}
