import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canMarkPacketFormFinal,
  canRefreshPacketFormValues,
  canReopenPacketFormToDraft,
  formatPacketFormDocumentState,
  isPacketFormValueEditable,
  isValidPacketFormLifecycleTransition,
  packetFormDocumentStateVariant,
  packetFormLifecycleBlockedMessage,
} from "./packet-form-lifecycle.ts";

describe("packet form lifecycle helpers", () => {
  it("allows DRAFT edits, refresh, and Mark Final", () => {
    assert.equal(isPacketFormValueEditable("DRAFT"), true);
    assert.equal(canRefreshPacketFormValues("DRAFT"), true);
    assert.equal(canMarkPacketFormFinal("DRAFT"), true);
    assert.equal(canReopenPacketFormToDraft("DRAFT"), false);
  });

  it("locks FINAL for value mutations but allows reopen", () => {
    assert.equal(isPacketFormValueEditable("FINAL"), false);
    assert.equal(canRefreshPacketFormValues("FINAL"), false);
    assert.equal(canMarkPacketFormFinal("FINAL"), false);
    assert.equal(canReopenPacketFormToDraft("FINAL"), true);
    assert.match(
      packetFormLifecycleBlockedMessage("FINAL"),
      /Final/i,
    );
  });

  it("keeps SIGNED and VOID read-only without reopen", () => {
    for (const state of ["SIGNED", "VOID"] as const) {
      assert.equal(isPacketFormValueEditable(state), false);
      assert.equal(canRefreshPacketFormValues(state), false);
      assert.equal(canReopenPacketFormToDraft(state), false);
    }
    assert.match(packetFormLifecycleBlockedMessage("SIGNED"), /Signed/i);
  });

  it("only allows DRAFT↔FINAL transitions", () => {
    assert.equal(isValidPacketFormLifecycleTransition("DRAFT", "FINAL"), true);
    assert.equal(isValidPacketFormLifecycleTransition("FINAL", "DRAFT"), true);
    assert.equal(isValidPacketFormLifecycleTransition("SIGNED", "DRAFT"), false);
    assert.equal(isValidPacketFormLifecycleTransition("DRAFT", "SIGNED"), false);
    assert.equal(isValidPacketFormLifecycleTransition("FINAL", "SIGNED"), false);
    assert.equal(isValidPacketFormLifecycleTransition("VOID", "DRAFT"), false);
  });

  it("treats soft-deleted forms as non-editable", () => {
    assert.equal(isPacketFormValueEditable("DRAFT", "DELETED"), false);
    assert.equal(canMarkPacketFormFinal("DRAFT", "DELETED"), false);
    assert.equal(canReopenPacketFormToDraft("FINAL", "DELETED"), false);
  });

  it("formats document-state badge labels and variants for list UI", () => {
    assert.equal(formatPacketFormDocumentState("DRAFT"), "Draft");
    assert.equal(formatPacketFormDocumentState("FINAL"), "Final");
    assert.equal(formatPacketFormDocumentState("SIGNED"), "Signed");
    assert.equal(formatPacketFormDocumentState("VOID"), "Void");

    assert.equal(packetFormDocumentStateVariant("DRAFT"), "secondary");
    assert.equal(packetFormDocumentStateVariant("FINAL"), "info");
    assert.equal(packetFormDocumentStateVariant("SIGNED"), "success");
    assert.equal(packetFormDocumentStateVariant("VOID"), "destructive");
  });
});
