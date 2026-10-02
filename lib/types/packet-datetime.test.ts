import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDate } from "@/lib/types/buyer-rep-agreement";
import { formatDateTime } from "@/lib/types/packet";

describe("formatDateTime (packet Created/Updated)", () => {
  it("takes date and time from the same instant in America/Chicago", () => {
    // 00:30 UTC on Oct 3 is still Oct 2 in Chicago.
    assert.equal(formatDateTime("2026-10-03T00:30:00+00:00"), "10/2/2026, 7:30:00 PM CDT");
    assert.equal(formatDateTime("2026-01-15T03:15:00Z"), "1/14/2026, 9:15:00 PM CST");
    assert.equal(formatDateTime("2026-10-02T17:15:50.927485+00:00"), "10/2/2026, 12:15:50 PM CDT");
  });

  it("does not depend on the runtime time zone", () => {
    const original = process.env.TZ;
    try {
      const outputs = ["UTC", "America/Chicago", "Asia/Tokyo", "America/Los_Angeles"].map((tz) => {
        process.env.TZ = tz;
        return formatDateTime("2026-10-03T00:30:00+00:00");
      });
      assert.deepEqual(new Set(outputs), new Set(["10/2/2026, 7:30:00 PM CDT"]));
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("keeps the empty and unparseable fallbacks", () => {
    assert.equal(formatDateTime(null), "—");
    assert.equal(formatDateTime(undefined), "—");
    assert.equal(formatDateTime(""), "—");
    assert.equal(formatDateTime("2026-13-45"), formatDate("2026-13-45"));
  });
});
