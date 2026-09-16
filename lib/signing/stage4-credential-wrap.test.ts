import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  buildCredentialWrapAad,
  buildCredentialWrapKeyring,
  deriveCredentialWrapKey,
  generateParticipantCredentialToken,
  resolveCredentialWrapKeyring,
  SigningCredentialWrapConfigError,
  unwrapParticipantCredentialTokenWithKeyring,
  wrapParticipantCredentialTokenWithKeyring,
  WRAP_KEY_ENV,
  WRAP_KEY_ID_ENV,
  WRAP_PREVIOUS_KEYS_ENV,
  type CredentialWrapContext,
} from "./credentials";

const randomKeyMaterial = () => randomBytes(32).toString("base64url");

function context(): CredentialWrapContext {
  return {
    credentialId: randomUUID(),
    signingId: randomUUID(),
    signingParticipantId: randomUUID(),
  };
}

function keyring(currentKeyId = "v1", previous: [string, string][] = []) {
  return buildCredentialWrapKeyring({
    currentKeyId,
    currentKeyMaterial: randomKeyMaterial(),
    previousKeys: previous.map(([keyId, keyMaterial]) => ({
      keyId,
      keyMaterial,
    })),
  });
}

/** Runs `body` with an isolated view of the wrap-key environment. */
function withEnv(
  overrides: Record<string, string | undefined>,
  body: () => void,
) {
  const managed = [
    WRAP_KEY_ID_ENV,
    WRAP_KEY_ENV,
    WRAP_PREVIOUS_KEYS_ENV,
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const previous = new Map(managed.map((name) => [name, process.env[name]]));
  try {
    for (const name of managed) delete process.env[name];
    for (const [name, value] of Object.entries(overrides)) {
      if (value !== undefined) process.env[name] = value;
    }
    body();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

describe("Native Signing Stage 4 credential wrap key", () => {
  it("requires a dedicated wrap key and never falls back to Supabase keys", () => {
    withEnv({}, () => {
      assert.throws(
        () => resolveCredentialWrapKeyring(),
        SigningCredentialWrapConfigError,
      );
    });

    // A configured service key must not be usable as wrapping material.
    withEnv(
      {
        SUPABASE_SECRET_KEY: randomKeyMaterial(),
        SUPABASE_SERVICE_ROLE_KEY: randomKeyMaterial(),
      },
      () => {
        assert.throws(
          () => resolveCredentialWrapKeyring(),
          SigningCredentialWrapConfigError,
        );
      },
    );

    // Key material without a key version id also fails closed.
    withEnv({ [WRAP_KEY_ENV]: randomKeyMaterial() }, () => {
      assert.throws(
        () => resolveCredentialWrapKeyring(),
        SigningCredentialWrapConfigError,
      );
    });
    withEnv({ [WRAP_KEY_ID_ENV]: "v1" }, () => {
      assert.throws(
        () => resolveCredentialWrapKeyring(),
        SigningCredentialWrapConfigError,
      );
    });
  });

  it("resolves a keyring with previous decrypt-only versions from the environment", () => {
    const current = randomKeyMaterial();
    const older = randomKeyMaterial();
    withEnv(
      {
        [WRAP_KEY_ID_ENV]: "v2",
        [WRAP_KEY_ENV]: current,
        [WRAP_PREVIOUS_KEYS_ENV]: ` v1:${older} `,
      },
      () => {
        const resolved = resolveCredentialWrapKeyring();
        assert.equal(resolved.currentKeyId, "v2");
        assert.deepEqual([...resolved.keys.keys()].sort(), ["v1", "v2"]);
      },
    );
  });

  it("rejects malformed key material and key ids", () => {
    // 32 raw bytes as base64url is the preferred form.
    assert.equal(deriveCredentialWrapKey(randomKeyMaterial(), "k").length, 32);
    // A long passphrase is hashed to 32 bytes.
    assert.equal(
      deriveCredentialWrapKey("not base64 but long enough!!!!!!!", "k").length,
      32,
    );
    // Anything shorter fails closed rather than being stretched.
    assert.throws(
      () => deriveCredentialWrapKey("too short", "k"),
      SigningCredentialWrapConfigError,
    );
    assert.throws(
      () => deriveCredentialWrapKey("", "k"),
      SigningCredentialWrapConfigError,
    );
    assert.throws(
      () => deriveCredentialWrapKey(undefined, "k"),
      SigningCredentialWrapConfigError,
    );
    // A 16-byte base64 key is not AES-256 material and is too short to hash.
    assert.throws(
      () => deriveCredentialWrapKey(randomBytes(16).toString("base64"), "k"),
      SigningCredentialWrapConfigError,
    );

    assert.throws(
      () =>
        buildCredentialWrapKeyring({
          currentKeyId: "not a key id",
          currentKeyMaterial: randomKeyMaterial(),
        }),
      SigningCredentialWrapConfigError,
    );
    assert.throws(
      () =>
        buildCredentialWrapKeyring({
          currentKeyId: "",
          currentKeyMaterial: randomKeyMaterial(),
        }),
      SigningCredentialWrapConfigError,
    );
    withEnv(
      {
        [WRAP_KEY_ID_ENV]: "v1",
        [WRAP_KEY_ENV]: randomKeyMaterial(),
        [WRAP_PREVIOUS_KEYS_ENV]: "v0-without-material",
      },
      () => {
        assert.throws(
          () => resolveCredentialWrapKeyring(),
          SigningCredentialWrapConfigError,
        );
      },
    );
  });

  it("round-trips a token bound to its credential row and key version", () => {
    const ring = keyring("v1");
    const ctx = context();
    const rawToken = generateParticipantCredentialToken();

    const { wrapped, wrapKeyId } = wrapParticipantCredentialTokenWithKeyring({
      keyring: ring,
      rawToken,
      context: ctx,
    });

    assert.equal(wrapKeyId, "v1");
    assert.ok(wrapped.startsWith("v2."));
    assert.doesNotMatch(wrapped, new RegExp(rawToken));
    assert.notEqual(
      wrapped,
      wrapParticipantCredentialTokenWithKeyring({
        keyring: ring,
        rawToken,
        context: ctx,
      }).wrapped,
    );

    assert.equal(
      unwrapParticipantCredentialTokenWithKeyring({
        keyring: ring,
        wrapped,
        wrapKeyId,
        context: ctx,
      }),
      rawToken,
    );
  });

  it("decrypts with a previous key while encrypting with the current key", () => {
    const oldMaterial = randomKeyMaterial();
    const oldRing = buildCredentialWrapKeyring({
      currentKeyId: "v1",
      currentKeyMaterial: oldMaterial,
    });
    const ctx = context();
    const rawToken = generateParticipantCredentialToken();
    const legacy = wrapParticipantCredentialTokenWithKeyring({
      keyring: oldRing,
      rawToken,
      context: ctx,
    });

    const rotated = buildCredentialWrapKeyring({
      currentKeyId: "v2",
      currentKeyMaterial: randomKeyMaterial(),
      previousKeys: [{ keyId: "v1", keyMaterial: oldMaterial }],
    });

    // Existing rows keep working under their recorded key version...
    assert.equal(
      unwrapParticipantCredentialTokenWithKeyring({
        keyring: rotated,
        wrapped: legacy.wrapped,
        wrapKeyId: legacy.wrapKeyId,
        context: ctx,
      }),
      rawToken,
    );
    // ...and new rows are written under the current version.
    assert.equal(
      wrapParticipantCredentialTokenWithKeyring({
        keyring: rotated,
        rawToken,
        context: ctx,
      }).wrapKeyId,
      "v2",
    );

    // Once the previous key is dropped, its rows fail closed.
    const currentOnly = buildCredentialWrapKeyring({
      currentKeyId: "v2",
      currentKeyMaterial: randomKeyMaterial(),
    });
    assert.equal(
      unwrapParticipantCredentialTokenWithKeyring({
        keyring: currentOnly,
        wrapped: legacy.wrapped,
        wrapKeyId: legacy.wrapKeyId,
        context: ctx,
      }),
      null,
    );
  });

  it("fails closed when the AAD context does not match the ciphertext", () => {
    const ring = keyring("v1", [["v0", randomKeyMaterial()]]);
    const ctx = context();
    const rawToken = generateParticipantCredentialToken();
    const { wrapped, wrapKeyId } = wrapParticipantCredentialTokenWithKeyring({
      keyring: ring,
      rawToken,
      context: ctx,
    });

    const mismatches: CredentialWrapContext[] = [
      { ...ctx, credentialId: randomUUID() },
      { ...ctx, signingId: randomUUID() },
      { ...ctx, signingParticipantId: randomUUID() },
    ];
    for (const mismatch of mismatches) {
      assert.equal(
        unwrapParticipantCredentialTokenWithKeyring({
          keyring: ring,
          wrapped,
          wrapKeyId,
          context: mismatch,
        }),
        null,
      );
    }

    // Claiming a different (known) key version also fails the tag check.
    assert.equal(
      unwrapParticipantCredentialTokenWithKeyring({
        keyring: ring,
        wrapped,
        wrapKeyId: "v0",
        context: ctx,
      }),
      null,
    );
    // Unknown or absent key version id: nothing to select, nothing to try.
    assert.equal(
      unwrapParticipantCredentialTokenWithKeyring({
        keyring: ring,
        wrapped,
        wrapKeyId: "v9",
        context: ctx,
      }),
      null,
    );
    assert.equal(
      unwrapParticipantCredentialTokenWithKeyring({
        keyring: ring,
        wrapped,
        wrapKeyId: null,
        context: ctx,
      }),
      null,
    );
  });

  it("fails closed on tampered ciphertext and on pre-AAD envelopes", () => {
    const ring = keyring("v1");
    const ctx = context();
    const rawToken = generateParticipantCredentialToken();
    const { wrapped, wrapKeyId } = wrapParticipantCredentialTokenWithKeyring({
      keyring: ring,
      rawToken,
      context: ctx,
    });

    const payload = Buffer.from(wrapped.slice("v2.".length), "base64url");
    payload[payload.length - 1] ^= 0xff;
    assert.equal(
      unwrapParticipantCredentialTokenWithKeyring({
        keyring: ring,
        wrapped: `v2.${payload.toString("base64url")}`,
        wrapKeyId,
        context: ctx,
      }),
      null,
    );

    for (const bogus of [
      null,
      undefined,
      "",
      "v1.abc",
      `v1.${wrapped.slice("v2.".length)}`,
      wrapped.slice("v2.".length),
      "v2.",
      "v2.not-base64!!",
    ]) {
      assert.equal(
        unwrapParticipantCredentialTokenWithKeyring({
          keyring: ring,
          wrapped: bogus,
          wrapKeyId,
          context: ctx,
        }),
        null,
      );
    }
  });

  it("binds credential id, Signing id, participant id, and key version in the AAD", () => {
    const ctx = context();
    assert.equal(
      buildCredentialWrapAad(ctx, "v1").toString("utf8"),
      `${ctx.credentialId}|${ctx.signingId}|${ctx.signingParticipantId}|v1`,
    );
    assert.throws(() =>
      buildCredentialWrapAad({ ...ctx, credentialId: "" }, "v1"),
    );
    assert.throws(() => buildCredentialWrapAad(ctx, ""));
  });
});
