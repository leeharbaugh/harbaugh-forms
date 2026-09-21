import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyCronAuthorization, CRON_SECRET_ENV } from "./cron-auth";

describe("cron auth", () => {
  it("denies missing secret, missing header, wrong secret, and malformed header", () => {
    assert.equal(verifyCronAuthorization(null, {}), false);
    assert.equal(
      verifyCronAuthorization("Bearer abc", { [CRON_SECRET_ENV]: "" }),
      false,
    );
    assert.equal(
      verifyCronAuthorization("Bearer wrong", { [CRON_SECRET_ENV]: "secret-value-16+" }),
      false,
    );
    assert.equal(
      verifyCronAuthorization("secret-value-16+", {
        [CRON_SECRET_ENV]: "secret-value-16+",
      }),
      false,
    );
    assert.equal(
      verifyCronAuthorization("Basic secret-value-16+", {
        [CRON_SECRET_ENV]: "secret-value-16+",
      }),
      false,
    );
  });

  it("accepts exact Bearer match with timing-safe compare", () => {
    assert.equal(
      verifyCronAuthorization("Bearer secret-value-16+", {
        [CRON_SECRET_ENV]: "secret-value-16+",
      }),
      true,
    );
  });
});
