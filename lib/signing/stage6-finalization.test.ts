import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGenesisPriorDigest,
  canonicalizeSigningEventV1,
  digestCanonicalEvent,
  normalizeEventOccurredAt,
  sanitizeSigningEventDetails,
} from "./event-chain-canonical";
import {
  hmacSha256Hex,
  loadEventChainKeyringFromEnv,
  safeEqualHex,
  sha256HexBuffer,
  SigningEventChainConfigError,
} from "./event-chain-keys";
import {
  type SigningEventChainState,
  type SigningEventRow,
  verifySigningEventChainRows,
} from "./event-chain";
import { parseDrawnPathForRendering } from "./completed-pdf";
import {
  auditCertificateIdempotencyKey,
  buildAuditCertificateObjectKey,
  buildCompletedDocumentObjectKey,
  completedDocumentIdempotencyKey,
} from "./artifacts";
import {
  isCertificateArtifactObjectKey,
  isCompletedArtifactObjectKey,
} from "./stage1-schema";

const SIGNING_ID = "11111111-1111-1111-1111-111111111111";

function buildProtectedRow(options: {
  sequence: number;
  priorDigest: string;
  keyId: string;
  key: Buffer;
  overrides?: Partial<{
    eventType: string;
    actorType: string;
    actorUserId: string | null;
    actorParticipantId: string | null;
    actorDisplayName: string | null;
    summary: string | null;
    detailsJson: unknown;
    createDate: string;
    eventDigest: string;
    priorDigest: string;
    integrityTag: string;
    integrityKeyId: string;
  }>;
}): SigningEventRow {
  const createDate = options.overrides?.createDate ?? "2026-09-18T12:00:00.000Z";
  const eventType = options.overrides?.eventType ?? "PARTICIPANT_FINISHED";
  const actorType = options.overrides?.actorType ?? "PARTICIPANT";
  const actorUserId = options.overrides?.actorUserId ?? null;
  const actorParticipantId =
    options.overrides?.actorParticipantId ??
    "22222222-2222-2222-2222-222222222222";
  const actorDisplayName = options.overrides?.actorDisplayName ?? "Sam Signer";
  const summary = options.overrides?.summary ?? "Finished";
  const detailsJson = options.overrides?.detailsJson ?? { ok: true };
  const prior = options.overrides?.priorDigest ?? options.priorDigest;

  const digest =
    options.overrides?.eventDigest ??
    digestCanonicalEvent(
      canonicalizeSigningEventV1({
        signingId: SIGNING_ID,
        sequenceNumber: options.sequence,
        eventType,
        actorType,
        actorUserId,
        actorParticipantId,
        actorDisplayName,
        visibility: "BUSINESS",
        packageRevisionId: null,
        signingDocumentVersionId: null,
        signingFieldId: null,
        signingFieldPlacementId: null,
        summary,
        detailsJson,
        eventOccurredAt: createDate,
        priorEventDigest: prior,
        idempotencyKey: null,
      }),
    );
  const tag =
    options.overrides?.integrityTag ?? hmacSha256Hex(options.key, digest);

  return {
    id: `00000000-0000-0000-0000-00000000000${options.sequence}`,
    signing_id: SIGNING_ID,
    sequence_number: options.sequence,
    event_type: eventType,
    actor_type: actorType,
    actor_user_id: actorUserId,
    actor_participant_id: actorParticipantId,
    actor_display_name: actorDisplayName,
    visibility: "BUSINESS",
    package_revision_id: null,
    signing_document_version_id: null,
    signing_field_id: null,
    signing_field_placement_id: null,
    summary,
    details_json: detailsJson,
    idempotency_key: null,
    create_date: createDate,
    prior_event_digest: prior,
    event_digest: digest,
    integrity_key_id: options.overrides?.integrityKeyId ?? options.keyId,
    integrity_authentication_tag: tag,
  };
}

describe("event-chain canonical v1", () => {
  it("is stable for identical inputs", () => {
    const input = {
      signingId: SIGNING_ID,
      sequenceNumber: 3,
      eventType: "PARTICIPANT_FINISHED",
      actorType: "PARTICIPANT",
      actorUserId: null,
      actorParticipantId: "22222222-2222-2222-2222-222222222222",
      actorDisplayName: "Sam Signer",
      visibility: "BUSINESS",
      packageRevisionId: null,
      signingDocumentVersionId: null,
      signingFieldId: null,
      signingFieldPlacementId: null,
      summary: "Finished",
      detailsJson: { b: 2, a: 1 },
      eventOccurredAt: "2026-09-18T12:00:00.000Z",
      priorEventDigest: "abc",
      idempotencyKey: "k",
    };
    const a = canonicalizeSigningEventV1(input);
    const b = canonicalizeSigningEventV1({
      ...input,
      detailsJson: { a: 1, b: 2 },
    });
    assert.equal(digestCanonicalEvent(a), digestCanonicalEvent(b));
  });

  it("changes digest when content changes", () => {
    const base = {
      signingId: SIGNING_ID,
      sequenceNumber: 1,
      eventType: "X",
      actorType: "SYSTEM",
      actorUserId: null,
      actorParticipantId: null,
      actorDisplayName: null,
      visibility: "BUSINESS",
      packageRevisionId: null,
      signingDocumentVersionId: null,
      signingFieldId: null,
      signingFieldPlacementId: null,
      summary: "one",
      detailsJson: null,
      eventOccurredAt: "2026-09-18T12:00:00.000Z",
      priorEventDigest: "genesis",
      idempotencyKey: null,
    };
    const d1 = digestCanonicalEvent(canonicalizeSigningEventV1(base));
    const d2 = digestCanonicalEvent(
      canonicalizeSigningEventV1({ ...base, summary: "two" }),
    );
    assert.notEqual(d1, d2);
  });

  it("strips blocked detail keys", () => {
    const sanitized = sanitizeSigningEventDetails({
      ok: true,
      ipAddress: "1.2.3.4",
      userAgent: "Mozilla",
      browserSessionId: "sess",
      accessToken: "tok",
      password: "x",
      hmacTag: "y",
    }) as Record<string, unknown>;
    assert.equal(sanitized.ok, true);
    assert.equal(sanitized.ipAddress, undefined);
    assert.equal(sanitized.userAgent, undefined);
    assert.equal(sanitized.accessToken, undefined);
    assert.equal(sanitized.password, undefined);
  });

  it("builds deterministic genesis digests", () => {
    const a = buildGenesisPriorDigest({
      signingId: SIGNING_ID,
      unprotectedPrefixEndSequence: 0,
    });
    const b = buildGenesisPriorDigest({
      signingId: SIGNING_ID,
      unprotectedPrefixEndSequence: 0,
    });
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it("changes digest when eventOccurredAt changes", () => {
    const base = {
      signingId: SIGNING_ID,
      sequenceNumber: 1,
      eventType: "X",
      actorType: "SYSTEM",
      actorUserId: null,
      actorParticipantId: null,
      actorDisplayName: null,
      visibility: "BUSINESS",
      packageRevisionId: null,
      signingDocumentVersionId: null,
      signingFieldId: null,
      signingFieldPlacementId: null,
      summary: "one",
      detailsJson: null,
      eventOccurredAt: "2026-09-18T12:00:00.000Z",
      priorEventDigest: "genesis",
      idempotencyKey: null,
    };
    const d1 = digestCanonicalEvent(canonicalizeSigningEventV1(base));
    const d2 = digestCanonicalEvent(
      canonicalizeSigningEventV1({
        ...base,
        eventOccurredAt: "2026-09-18T12:00:01.000Z",
      }),
    );
    assert.notEqual(d1, d2);
  });

  it("normalizes timestamptz round-trips for MAC coverage", () => {
    assert.equal(
      normalizeEventOccurredAt("2026-09-18T12:00:00+00:00"),
      "2026-09-18T12:00:00.000Z",
    );
  });

  it("distinguishes null vs empty string and absent vs null details", () => {
    const base = {
      signingId: SIGNING_ID,
      sequenceNumber: 1,
      eventType: "X",
      actorType: "SYSTEM",
      actorUserId: null,
      actorParticipantId: null,
      actorDisplayName: null as string | null,
      visibility: "BUSINESS",
      packageRevisionId: null,
      signingDocumentVersionId: null,
      signingFieldId: null,
      signingFieldPlacementId: null,
      summary: null as string | null,
      detailsJson: null as unknown,
      eventOccurredAt: "2026-09-18T12:00:00.000Z",
      priorEventDigest: "genesis",
      idempotencyKey: null as string | null,
    };
    const nullDisplay = digestCanonicalEvent(canonicalizeSigningEventV1(base));
    const emptyDisplay = digestCanonicalEvent(
      canonicalizeSigningEventV1({ ...base, actorDisplayName: "" }),
    );
    assert.notEqual(nullDisplay, emptyDisplay);
    const nullDetails = digestCanonicalEvent(
      canonicalizeSigningEventV1({ ...base, detailsJson: null }),
    );
    const keyNull = digestCanonicalEvent(
      canonicalizeSigningEventV1({ ...base, detailsJson: { a: null } }),
    );
    assert.notEqual(nullDetails, keyNull);
  });

  it("changes digest when actor or details fields change", () => {
    const base = {
      signingId: SIGNING_ID,
      sequenceNumber: 2,
      eventType: "SIGNING_CREATED",
      actorType: "PRIMARY_AGENT",
      actorUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      actorParticipantId: null,
      actorDisplayName: "Agent",
      visibility: "BUSINESS",
      packageRevisionId: null,
      signingDocumentVersionId: null,
      signingFieldId: null,
      signingFieldPlacementId: null,
      summary: "created",
      detailsJson: { ok: true },
      eventOccurredAt: "2026-09-18T12:00:00.000Z",
      priorEventDigest: "genesis",
      idempotencyKey: null,
    };
    const d0 = digestCanonicalEvent(canonicalizeSigningEventV1(base));
    assert.notEqual(
      d0,
      digestCanonicalEvent(
        canonicalizeSigningEventV1({ ...base, actorType: "CO_AGENT" }),
      ),
    );
    assert.notEqual(
      d0,
      digestCanonicalEvent(
        canonicalizeSigningEventV1({
          ...base,
          actorDisplayName: "Other",
        }),
      ),
    );
    assert.notEqual(
      d0,
      digestCanonicalEvent(
        canonicalizeSigningEventV1({
          ...base,
          detailsJson: { ok: false },
        }),
      ),
    );
  });
});

describe("event-chain synthetic tamper matrix", () => {
  const keyA = Buffer.alloc(32, 1);
  const keyB = Buffer.alloc(32, 2);
  const genesis = buildGenesisPriorDigest({
    signingId: SIGNING_ID,
    unprotectedPrefixEndSequence: 0,
  });
  const chain: SigningEventChainState = {
    signingId: SIGNING_ID,
    chainFormatVersion: "v1",
    unprotectedPrefixEndSequence: 0,
    genesisPriorDigest: genesis,
    startedAt: "2026-09-18T12:00:00.000Z",
  };
  const keyring = {
    currentKeyId: "k1",
    keys: new Map([
      ["k1", keyA],
      ["k0", keyB],
    ]),
  };

  function authenticChain() {
    const e1 = buildProtectedRow({
      sequence: 1,
      priorDigest: genesis,
      keyId: "k1",
      key: keyA,
    });
    const e2 = buildProtectedRow({
      sequence: 2,
      priorDigest: e1.event_digest!,
      keyId: "k0",
      key: keyB,
      overrides: { eventType: "SIGNING_CANCELLED", actorType: "PRIMARY_AGENT" },
    });
    return [e1, e2];
  }

  it("verifies an authentic multi-key chain", () => {
    const result = verifySigningEventChainRows({
      chain,
      rows: authenticChain(),
      keyring,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.protectedEventCount, 2);
  });

  it("detects event type mutation", () => {
    const [e1, e2] = authenticChain();
    e1.event_type = "TAMPERED";
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1, e2],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "DIGEST_MISMATCH");
  });

  it("detects actor type mutation", () => {
    const [e1] = authenticChain();
    e1.actor_type = "ORG_ADMIN";
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "DIGEST_MISMATCH");
  });

  it("detects actor user id mutation", () => {
    const [e1] = authenticChain();
    e1.actor_user_id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "DIGEST_MISMATCH");
  });

  it("detects actor display mutation", () => {
    const [e1] = authenticChain();
    e1.actor_display_name = "Eve";
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "DIGEST_MISMATCH");
  });

  it("detects event timestamp mutation", () => {
    const [e1] = authenticChain();
    e1.create_date = "2026-09-18T12:00:01.000Z";
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "DIGEST_MISMATCH");
  });

  it("detects details JSON mutation", () => {
    const [e1] = authenticChain();
    e1.details_json = { ok: false };
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "DIGEST_MISMATCH");
  });

  it("detects sequence alteration / gap", () => {
    const [e1, e2] = authenticChain();
    e2.sequence_number = 3;
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1, e2],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "REORDER");
  });

  it("detects event removal / gap", () => {
    const [, e2] = authenticChain();
    const result = verifySigningEventChainRows({
      chain,
      rows: [e2],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "REORDER");
  });

  it("detects prior digest mutation", () => {
    const [e1] = authenticChain();
    e1.prior_event_digest = "0".repeat(64);
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "PRIOR_MISMATCH");
  });

  it("detects current digest mutation", () => {
    const [e1] = authenticChain();
    e1.event_digest = "f".repeat(64);
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "DIGEST_MISMATCH");
  });

  it("detects HMAC tag mutation", () => {
    const [e1] = authenticChain();
    e1.integrity_authentication_tag = "a".repeat(64);
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "TAG_MISMATCH");
  });

  it("detects unknown key id", () => {
    const [e1] = authenticChain();
    e1.integrity_key_id = "unknown";
    const result = verifySigningEventChainRows({
      chain,
      rows: [e1],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "MISSING_KEY");
  });

  it("fails when historical verify key is removed", () => {
    const rows = authenticChain();
    const withoutOld = {
      currentKeyId: "k1",
      keys: new Map([["k1", keyA]]),
    };
    const result = verifySigningEventChainRows({
      chain,
      rows,
      keyring: withoutOld,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "MISSING_KEY");
  });

  it("detects event reorder", () => {
    const [e1, e2] = authenticChain();
    const result = verifySigningEventChainRows({
      chain,
      rows: [e2, e1],
      keyring,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "REORDER");
  });
});

describe("event-chain keyring config", () => {
  it("rejects missing current key and does not fall back", () => {
    assert.throws(
      () => loadEventChainKeyringFromEnv({} as NodeJS.ProcessEnv),
      (err: unknown) => err instanceof SigningEventChainConfigError,
    );
  });

  it("loads current + previous verify-only keys", () => {
    const ring = loadEventChainKeyringFromEnv({
      SIGNING_EVENT_CHAIN_KEY_ID: "cur",
      SIGNING_EVENT_CHAIN_KEY: "x".repeat(32),
      SIGNING_EVENT_CHAIN_PREVIOUS_KEYS: `old:${"y".repeat(32)}`,
    } as NodeJS.ProcessEnv);
    assert.equal(ring.currentKeyId, "cur");
    assert.equal(ring.keys.has("cur"), true);
    assert.equal(ring.keys.has("old"), true);
  });
});

describe("event-chain hmac helpers", () => {
  it("verifies matching tags", () => {
    const key = Buffer.alloc(32, 7);
    const digest = sha256HexBuffer("payload");
    const tag = hmacSha256Hex(key, digest);
    assert.equal(safeEqualHex(tag, hmacSha256Hex(key, digest)), true);
    assert.equal(safeEqualHex(tag, hmacSha256Hex(key, "other")), false);
  });
});

describe("drawn path rendering evidence", () => {
  it("accepts finite {x,y} paths", () => {
    const points = parseDrawnPathForRendering([
      { x: 0, y: 0 },
      { x: 10, y: 4 },
    ]);
    assert.equal(points.length, 2);
  });

  it("rejects insufficient schema", () => {
    assert.throws(() => parseDrawnPathForRendering([{ x: 1 }]));
    assert.throws(() => parseDrawnPathForRendering("stroke"));
    assert.throws(() => parseDrawnPathForRendering([{ x: 1, y: 2 }]));
  });
});

describe("artifact namespaces and idempotency", () => {
  it("builds opaque completed/certificate keys", () => {
    const signingId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const artifactId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const completed = buildCompletedDocumentObjectKey({ signingId, artifactId });
    const certificate = buildAuditCertificateObjectKey({
      signingId,
      artifactId,
    });
    assert.equal(isCompletedArtifactObjectKey(completed), true);
    assert.equal(isCertificateArtifactObjectKey(certificate), true);
    assert.equal(isCompletedArtifactObjectKey(certificate), false);
  });

  it("uses revision-scoped idempotency keys", () => {
    assert.equal(
      completedDocumentIdempotencyKey({
        frozenRevisionId: "r1",
        packageRevisionDocumentId: "d1",
      }),
      "COMPLETED_DOCUMENT:r1:d1",
    );
    assert.equal(auditCertificateIdempotencyKey("r1"), "AUDIT_CERTIFICATE:r1");
  });
});
