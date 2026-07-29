import "server-only";

import {
  TREC_SODA_BASE_URL,
  buildTrecWhereClause,
  clampTrecLimit,
  normalizeTrecRecords,
  type TrecLicenseCandidate,
  type TrecLookupRequest,
  type TrecRawRecord,
} from "@/lib/trec/normalize";

export type TrecLookupResult =
  | {
      ok: true;
      candidates: TrecLicenseCandidate[];
      lookedUpAt: string;
      fromCache: boolean;
      queryKind: "license" | "name" | "combined";
    }
  | {
      ok: false;
      error: string;
      code: "VALIDATION" | "TIMEOUT" | "UPSTREAM" | "PARSE";
      lookedUpAt: string;
      allowManualEntry: true;
    };

type CacheEntry = {
  expiresAt: number;
  result: Extract<TrecLookupResult, { ok: true }>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const lookupCache = new Map<string, CacheEntry>();

function cacheKey(request: TrecLookupRequest): string {
  return JSON.stringify({
    licenseNumber: request.licenseNumber?.trim() ?? "",
    fullName: request.fullName?.trim().toLowerCase() ?? "",
    licenseTypes: request.licenseTypes ?? ["SALE", "BRK"],
    limit: clampTrecLimit(request.limit),
  });
}

export type TrecFetchFn = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

/**
 * Server-side TREC lookup against Texas Open Data / Socrata.
 * Does not write profile fields — callers confirm selection explicitly.
 */
export async function lookupTrecLicenses(
  request: TrecLookupRequest,
  options?: {
    fetchFn?: TrecFetchFn;
    now?: Date;
    bypassCache?: boolean;
    appToken?: string | null;
  },
): Promise<TrecLookupResult> {
  const lookedUpAt = (options?.now ?? new Date()).toISOString();
  const where = buildTrecWhereClause(request);
  if (!where) {
    return {
      ok: false,
      error: "Enter a license number and/or name to search TREC.",
      code: "VALIDATION",
      lookedUpAt,
      allowManualEntry: true,
    };
  }

  const key = cacheKey(request);
  if (!options?.bypassCache) {
    const cached = lookupCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, fromCache: true, lookedUpAt };
    }
  }

  const limit = clampTrecLimit(request.limit);
  const url = new URL(TREC_SODA_BASE_URL);
  url.searchParams.set("$where", where);
  url.searchParams.set("$limit", String(limit));
  url.searchParams.set(
    "$select",
    [
      "license_type",
      "license_number",
      "full_name",
      "suffix",
      "status",
      "license_expiration_date",
      "related_license_type",
      "related_license_number",
      "related_license_full_name",
      "county",
    ].join(","),
  );

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const token =
    options?.appToken ??
    process.env.TREC_SODA_APP_TOKEN ??
    process.env.TEXAS_OPEN_DATA_APP_TOKEN ??
    null;
  if (token) {
    headers["X-App-Token"] = token;
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetchFn(url.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `TREC Open Data returned HTTP ${response.status}. Manual entry remains available.`,
        code: "UPSTREAM",
        lookedUpAt,
        allowManualEntry: true,
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        ok: false,
        error: "TREC Open Data returned an unreadable response.",
        code: "PARSE",
        lookedUpAt,
        allowManualEntry: true,
      };
    }

    if (!Array.isArray(payload)) {
      return {
        ok: false,
        error: "TREC Open Data returned an unexpected payload.",
        code: "PARSE",
        lookedUpAt,
        allowManualEntry: true,
      };
    }

    const candidates = normalizeTrecRecords(payload as TrecRawRecord[], limit);
    const result: Extract<TrecLookupResult, { ok: true }> = {
      ok: true,
      candidates,
      lookedUpAt,
      fromCache: false,
      queryKind: request.licenseNumber?.trim()
        ? request.fullName?.trim()
          ? "combined"
          : "license"
        : "name",
    };
    lookupCache.set(key, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      result,
    });
    return result;
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message));
    return {
      ok: false,
      error: aborted
        ? "TREC Open Data timed out. Manual entry remains available."
        : "TREC Open Data is unavailable. Manual entry remains available.",
      code: aborted ? "TIMEOUT" : "UPSTREAM",
      lookedUpAt,
      allowManualEntry: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Test helper — clears in-memory cache. */
export function clearTrecLookupCache(): void {
  lookupCache.clear();
}
