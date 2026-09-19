import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGenesisPriorDigest,
  canonicalizeSigningEventV1,
  digestCanonicalEvent,
  sanitizeSigningEventDetails,
} from "./event-chain-canonical";
import {
  hmacSha256Hex,
  safeEqualHex,
  sha256HexBuffer,
} from "./event-chain-keys";
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

describe("event-chain canonical v1", () => {
  it("is stable for identical inputs", () => {
    const input = {
      signingId: "11111111-1111-1111-1111-111111111111",
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
      signingId: "11111111-1111-1111-1111-111111111111",
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
    }) as Record<string, unknown>;
    assert.equal(sanitized.ok, true);
    assert.equal(sanitized.ipAddress, undefined);
    assert.equal(sanitized.userAgent, undefined);
  });

  it("builds deterministic genesis digests", () => {
    const a = buildGenesisPriorDigest({
      signingId: "11111111-1111-1111-1111-111111111111",
      unprotectedPrefixEndSequence: 0,
    });
    const b = buildGenesisPriorDigest({
      signingId: "11111111-1111-1111-1111-111111111111",
      unprotectedPrefixEndSequence: 0,
    });
    assert.equal(a, b);
    assert.equal(a.length, 64);
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
