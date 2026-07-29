import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAuditUpdateDiff,
  sanitizeAuditMetadata,
} from "../audit/sanitize.ts";
import { MANDATORY_AUDIT_ACTIONS } from "../audit/constants.ts";
import {
  buildTrecWhereClause,
  clampTrecLimit,
  compareSponsoringBroker,
  isLicenseExpired,
  isLicenseInGoodStanding,
  normalizeLicenseNumberForCompare,
  normalizeTrecRecord,
  normalizeTrecRecords,
  parseTrecFullName,
  preserveLicenseNumberDisplay,
  type TrecRawRecord,
} from "../trec/normalize.ts";
import { validateBrokerageOfficeInput } from "../admin/brokerage-office-validation.ts";
import { validateInviteUserInput } from "../admin/invite-validation.ts";

/** Mirrors lib/trec/lookup.ts outage/success contract for Node tests (no @/ aliases). */
async function lookupWithMockFetch(
  request: {
    licenseNumber?: string | null;
    fullName?: string | null;
    licenseTypes?: Array<"SALE" | "BRK">;
    limit?: number;
  },
  fetchFn: () => Promise<Response>,
): Promise<
  | { ok: true; candidates: ReturnType<typeof normalizeTrecRecords> }
  | {
      ok: false;
      code: "VALIDATION" | "TIMEOUT" | "UPSTREAM" | "PARSE";
      allowManualEntry: true;
    }
> {
  const where = buildTrecWhereClause(request);
  if (!where) {
    return { ok: false, code: "VALIDATION", allowManualEntry: true };
  }
  try {
    const response = await fetchFn();
    if (!response.ok) {
      return { ok: false, code: "UPSTREAM", allowManualEntry: true };
    }
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      return { ok: false, code: "PARSE", allowManualEntry: true };
    }
    return {
      ok: true,
      candidates: normalizeTrecRecords(
        payload as TrecRawRecord[],
        clampTrecLimit(request.limit),
      ),
    };
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || /aborted/i.test(error.message));
    return {
      ok: false,
      code: aborted ? "TIMEOUT" : "UPSTREAM",
      allowManualEntry: true,
    };
  }
}

describe("audit metadata sanitizer", () => {
  it("redacts secret-like keys and truncates long strings", () => {
    const sanitized = sanitizeAuditMetadata({
      password: "secret",
      access_token: "abc",
      invitation_token: "xyz",
      name: "Davey",
      long: "x".repeat(600),
      nested: { foo: "bar" },
      changedFields: ["name"],
      safeOldValues: { name: "A", api_key: "nope" },
      safeNewValues: { name: "B" },
    });
    assert.equal(sanitized.password, "[redacted]");
    assert.equal(sanitized.access_token, "[redacted]");
    assert.equal(sanitized.invitation_token, "[redacted]");
    assert.equal(sanitized.name, "Davey");
    assert.equal(typeof sanitized.long, "string");
    assert.ok(String(sanitized.long).endsWith("…"));
    assert.equal(sanitized.nested, "[object-omitted]");
    assert.deepEqual(sanitized.changedFields, ["name"]);
    assert.equal(
      (sanitized.safeOldValues as Record<string, unknown>).api_key,
      "[redacted]",
    );
  });

  it("does not store complete database rows in update diffs", () => {
    const diff = buildAuditUpdateDiff(
      {
        name: "Old",
        password_hash: "hash",
        notes: "private note",
        status: "ACTIVE",
      },
      {
        name: "New",
        password_hash: "hash2",
        notes: "private note 2",
        status: "INACTIVE",
      },
    );
    assert.ok(diff.changedFields.includes("name"));
    assert.ok(diff.changedFields.includes("status"));
    assert.ok(diff.changedFields.includes("notes"));
    assert.equal(diff.safeOldValues.name, "Old");
    assert.equal(diff.safeNewValues.status, "INACTIVE");
    assert.equal(diff.safeOldValues.notes, undefined);
    assert.equal(diff.safeOldValues.password_hash, undefined);
  });
});

describe("mandatory audit actions", () => {
  it("includes audit config and global admin actions", () => {
    assert.ok(MANDATORY_AUDIT_ACTIONS.has("audit_logging_enabled"));
    assert.ok(MANDATORY_AUDIT_ACTIONS.has("audit_logging_disabled"));
    assert.ok(MANDATORY_AUDIT_ACTIONS.has("global_admin_access_granted"));
    assert.ok(MANDATORY_AUDIT_ACTIONS.has("global_admin_access_removed"));
  });
});

describe("TREC normalize", () => {
  it("preserves hyphenated license numbers and avoids integer coercion", () => {
    assert.equal(preserveLicenseNumberDisplay("0283-607"), "0283-607");
    assert.equal(preserveLicenseNumberDisplay(283607), "283607");
    assert.equal(
      normalizeLicenseNumberForCompare("0283-607"),
      "0283-607",
    );
  });

  it("normalizes exact license candidates", () => {
    const candidate = normalizeTrecRecord({
      license_number: "0712335",
      license_type: "SALE",
      full_name: "HARBAUGH, KENNETH LEE",
      status: "Current and Active",
      license_expiration_date: "20271231",
      related_license_number: "0283607",
      related_license_full_name: "DAVEY, DEE",
    });
    assert.ok(candidate);
    assert.equal(candidate.licenseNumber, "0712335");
    assert.equal(candidate.licenseType, "SALE");
    assert.equal(candidate.relatedLicenseNumber, "0283607");
  });

  it("rejects nested object injection payloads", () => {
    const bad = normalizeTrecRecord({
      license_number: "1",
      full_name: "Test",
      evil: { __proto__: { polluted: true } },
    });
    assert.equal(bad, null);
  });

  it("requires explicit selection for duplicate names", () => {
    const candidates = normalizeTrecRecords([
      {
        license_number: "111",
        license_type: "SALE",
        full_name: "SMITH, JOHN",
        status: "Current",
      },
      {
        license_number: "222",
        license_type: "SALE",
        full_name: "SMITH, JOHN",
        status: "Current",
      },
    ]);
    assert.equal(candidates.length, 2);
    assert.notEqual(candidates[0].licenseNumber, candidates[1].licenseNumber);
  });

  it("builds parameterized where clauses", () => {
    const where = buildTrecWhereClause({
      licenseNumber: "0712335",
      licenseTypes: ["SALE"],
    });
    assert.ok(where);
    assert.match(where, /license_type in \('SALE'\)/);
    assert.match(where, /0712335/);
    assert.equal(
      buildTrecWhereClause({}),
      null,
    );
  });

  it("parses TREC LAST, FIRST MIDDLE names correctly", () => {
    const parsed = parseTrecFullName("HARBAUGH, KENNETH LEE");
    assert.equal(parsed.lastName, "HARBAUGH");
    assert.equal(parsed.firstName, "KENNETH");
    assert.equal(parsed.middleName, "LEE");
  });

  it("flags inactive/expired licenses and sponsorship mismatches", () => {
    assert.equal(isLicenseInGoodStanding("Current and Active"), true);
    assert.equal(isLicenseInGoodStanding("Expired"), false);
    assert.equal(isLicenseInGoodStanding("Suspended"), false);
    assert.equal(isLicenseExpired("19990101"), true);
    assert.equal(isLicenseExpired("20990101"), false);

    const mismatch = compareSponsoringBroker({
      candidate: {
        relatedLicenseNumber: "0283607",
        relatedLicenseName: "DAVEY, DEE",
      },
      appBrokerLicenseNumber: "9999999",
      appBrokerName: "Other Broker",
    });
    assert.equal(mismatch.mismatched, true);

    const match = compareSponsoringBroker({
      candidate: {
        relatedLicenseNumber: "0283607",
        relatedLicenseName: "DAVEY, DEE",
      },
      appBrokerLicenseNumber: "0283607",
      appBrokerName: "Dee Davey",
    });
    assert.equal(match.mismatched, false);
  });
});

describe("brokerage office validation", () => {
  it("requires organization and office name", () => {
    const missing = validateBrokerageOfficeInput({
      organizationId: "",
      officeName: "",
    });
    assert.equal(missing.ok, false);

    const ok = validateBrokerageOfficeInput({
      organizationId: "org-1",
      officeName: "Main Office",
      isMainOffice: true,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.value.isMainOffice, true);
      assert.equal(ok.value.officeName, "Main Office");
    }
  });
});

describe("invite validation with office and manual override", () => {
  it("accepts brokerage office selection", () => {
    const result = validateInviteUserInput({
      loginEmail: "agent@example.com",
      firstName: "Ada",
      lastName: "Agent",
      primaryOrganizationId: "org-1",
      primaryBrokerageOfficeId: "office-1",
      trecLicenseNumber: "123",
      licenseVerification: {
        source: "trec",
        licenseType: "SALE",
        reportedFullName: "AGENT, ADA",
        licenseStatus: "Current",
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.primaryBrokerageOfficeId, "office-1");
      assert.equal(result.value.memberships[0].brokerageOfficeId, "office-1");
      assert.equal(result.value.licenseVerification?.source, "trec");
    }
  });

  it("requires reason for manual license override", () => {
    const missingReason = validateInviteUserInput({
      loginEmail: "agent@example.com",
      firstName: "Ada",
      lastName: "Agent",
      primaryOrganizationId: "org-1",
      trecLicenseNumber: "123",
      licenseVerification: {
        source: "manual",
      },
    });
    assert.equal(missingReason.ok, false);

    const withReason = validateInviteUserInput({
      loginEmail: "agent@example.com",
      firstName: "Ada",
      lastName: "Agent",
      primaryOrganizationId: "org-1",
      trecLicenseNumber: "123",
      licenseVerification: {
        source: "manual",
        manualOverrideReason: "TREC dataset lag",
      },
    });
    assert.equal(withReason.ok, true);
  });
});

describe("TREC lookup with mocks", () => {
  it("returns exact license candidate from mocked Open Data response", async () => {
    const result = await lookupWithMockFetch(
      { licenseNumber: "0712335", licenseTypes: ["SALE"] },
      async () =>
        new Response(
          JSON.stringify([
            {
              license_number: "0712335",
              license_type: "SALE",
              full_name: "HARBAUGH, KENNETH LEE",
              status: "Current and Active",
              license_expiration_date: "20271231",
              related_license_number: "0283607",
              related_license_full_name: "DAVEY, DEE",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0].licenseNumber, "0712335");
      assert.equal(result.candidates[0].relatedLicenseNumber, "0283607");
    }
  });

  it("preserves hyphenated license numbers from mocked responses", async () => {
    const result = await lookupWithMockFetch(
      { licenseNumber: "0283-607", licenseTypes: ["BRK"] },
      async () =>
        new Response(
          JSON.stringify([
            {
              license_number: "0283-607",
              license_type: "BRK",
              full_name: "DAVEY, DEE",
              status: "Current",
            },
          ]),
          { status: 200 },
        ),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.candidates[0].licenseNumber, "0283-607");
    }
  });

  it("allows manual entry path on outage", async () => {
    const result = await lookupWithMockFetch(
      { fullName: "Someone", licenseTypes: ["SALE"] },
      async () => {
        throw new Error("network down");
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.allowManualEntry, true);
      assert.equal(result.code, "UPSTREAM");
    }
  });

  it("returns name matches without auto-selecting", async () => {
    const result = await lookupWithMockFetch(
      { fullName: "SMITH", licenseTypes: ["SALE"] },
      async () =>
        new Response(
          JSON.stringify([
            {
              license_number: "111",
              license_type: "SALE",
              full_name: "SMITH, JOHN A",
              status: "Current",
            },
            {
              license_number: "222",
              license_type: "SALE",
              full_name: "SMITH, JOHN B",
              status: "Current",
            },
          ]),
          { status: 200 },
        ),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.candidates.length, 2);
    }
  });
});
