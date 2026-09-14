import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertNativeSigningEnabled,
  isNativeSigningEnabled,
  NATIVE_SIGNING_ENV_FLAG,
  NativeSigningDisabledError,
} from "./feature-gate.ts";

describe("Native Signing feature gate", () => {
  it("defaults to disabled when unset", () => {
    assert.equal(isNativeSigningEnabled({}), false);
  });

  it("rejects non-exact truthy strings", () => {
    assert.equal(isNativeSigningEnabled({ [NATIVE_SIGNING_ENV_FLAG]: "TRUE" }), false);
    assert.equal(isNativeSigningEnabled({ [NATIVE_SIGNING_ENV_FLAG]: "1" }), false);
    assert.equal(isNativeSigningEnabled({ [NATIVE_SIGNING_ENV_FLAG]: "yes" }), false);
  });

  it("enables only for exact true", () => {
    assert.equal(isNativeSigningEnabled({ [NATIVE_SIGNING_ENV_FLAG]: "true" }), true);
  });

  it("assertNativeSigningEnabled throws when disabled", () => {
    assert.throws(
      () => assertNativeSigningEnabled({}),
      (error: unknown) =>
        error instanceof NativeSigningDisabledError &&
        error.code === "NATIVE_SIGNING_DISABLED",
    );
  });

  it("assertNativeSigningEnabled passes when enabled", () => {
    assert.doesNotThrow(() =>
      assertNativeSigningEnabled({ [NATIVE_SIGNING_ENV_FLAG]: "true" }),
    );
  });
});
