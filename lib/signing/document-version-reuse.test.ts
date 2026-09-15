import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sha256Hex } from "./prepare-pdf";

/**
 * Pure documentation of the Stage 3 reuse rule used by
 * ensurePreparedDocumentVersion. Cross-document hash equality must not reuse.
 */
function chooseReusableVersion(options: {
  logicalDocumentId: string;
  renderedSha256: string;
  candidates: Array<{
    id: string;
    signingDocumentId: string;
    contentSha256: string;
    trusted: boolean;
  }>;
}): string | null {
  for (const candidate of options.candidates) {
    if (candidate.signingDocumentId !== options.logicalDocumentId) continue;
    if (candidate.contentSha256 !== options.renderedSha256) continue;
    if (!candidate.trusted) continue;
    return candidate.id;
  }
  return null;
}

describe("document version reuse rule", () => {
  const hashA = sha256Hex(new TextEncoder().encode("pdf-a"));
  const hashB = sha256Hex(new TextEncoder().encode("pdf-b"));

  it("reuses an unchanged trusted version for the same logical document", () => {
    const reused = chooseReusableVersion({
      logicalDocumentId: "doc-1",
      renderedSha256: hashA,
      candidates: [
        {
          id: "ver-1",
          signingDocumentId: "doc-1",
          contentSha256: hashA,
          trusted: true,
        },
      ],
    });
    assert.equal(reused, "ver-1");
  });

  it("does not reuse another logical document merely because hashes match", () => {
    const reused = chooseReusableVersion({
      logicalDocumentId: "doc-1",
      renderedSha256: hashA,
      candidates: [
        {
          id: "ver-other",
          signingDocumentId: "doc-2",
          contentSha256: hashA,
          trusted: true,
        },
      ],
    });
    assert.equal(reused, null);
  });

  it("does not reuse a mismatched or untrusted prior version", () => {
    assert.equal(
      chooseReusableVersion({
        logicalDocumentId: "doc-1",
        renderedSha256: hashA,
        candidates: [
          {
            id: "ver-stale",
            signingDocumentId: "doc-1",
            contentSha256: hashB,
            trusted: true,
          },
          {
            id: "ver-corrupt",
            signingDocumentId: "doc-1",
            contentSha256: hashA,
            trusted: false,
          },
        ],
      }),
      null,
    );
  });
});
