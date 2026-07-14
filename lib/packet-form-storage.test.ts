import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Packet path builder tests mirror lib/packet-form-storage.ts without importing
 * that module (Next path aliases are not available under node --test).
 */
const OWNER = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";

function sanitizePdfFileName(fileName: string): string {
  const trimmed = fileName.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  const baseName = trimmed.replace(/\.pdf$/i, "");
  const sanitized = baseName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${sanitized || "form"}.pdf`;
}

function buildPacketFormStoragePath(options: {
  ownerUserId: string;
  packetId: number;
  packetFormId: number;
  documentName: string;
}): string {
  const ownerId = options.ownerUserId.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      ownerId,
    )
  ) {
    throw new Error("A valid owner user ID is required for Storage paths.");
  }
  if (!Number.isInteger(options.packetId) || options.packetId <= 0) {
    throw new Error("A valid packet ID is required for Storage paths.");
  }
  if (!Number.isInteger(options.packetFormId) || options.packetFormId <= 0) {
    throw new Error("A valid packet form ID is required for Storage paths.");
  }
  const safeFileName = sanitizePdfFileName(options.documentName).replace(
    /\.pdf$/i,
    "",
  );
  return `users/${ownerId}/packets/${options.packetId}/${options.packetFormId}-${safeFileName}.pdf`;
}

describe("packet form storage paths", () => {
  it("builds owner-scoped packet paths with packet_form id", () => {
    assert.equal(
      buildPacketFormStoragePath({
        ownerUserId: OWNER,
        packetId: 15,
        packetFormId: 52,
        documentName: "listing agreement.pdf",
      }),
      `users/${OWNER}/packets/15/52-listing-agreement.pdf`,
    );
  });

  it("requires owner and positive ids", () => {
    assert.throws(() =>
      buildPacketFormStoragePath({
        ownerUserId: "",
        packetId: 1,
        packetFormId: 2,
        documentName: "a.pdf",
      }),
    );
    assert.throws(() =>
      buildPacketFormStoragePath({
        ownerUserId: OWNER,
        packetId: 0,
        packetFormId: 2,
        documentName: "a.pdf",
      }),
    );
  });
});
