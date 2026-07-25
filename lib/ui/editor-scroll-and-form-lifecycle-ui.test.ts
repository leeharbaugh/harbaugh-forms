import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

const HOOK = "lib/ui/use-scroll-editor-into-view.ts";
const FORMS = "components/forms/forms-page.tsx";
const PROPERTIES = "components/properties/properties-page.tsx";
const COLLECTIONS = "components/collections/collections-page.tsx";
const CONTACTS = "components/contacts/contacts-page.tsx";

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

describe("useScrollEditorIntoView", () => {
  it("scrolls only for mode/selection changes and respects reduced motion", () => {
    const hook = read(HOOK);
    assert.ok(hook.includes("scrollIntoView"));
    assert.ok(hook.includes("prefers-reduced-motion"));
    assert.ok(hook.includes('mode === "hidden"'));
    assert.ok(hook.includes("selectionKey"));
    assert.ok(hook.includes('behavior: prefersReducedMotion ? "auto" : "smooth"'));
  });
});

describe("editor scroll wiring", () => {
  it("Forms uses the shared scroll hook with formMode and editingTemplateId", () => {
    const page = read(FORMS);
    assert.ok(page.includes("useScrollEditorIntoView"));
    assert.ok(page.includes("formPanelRef"));
    assert.ok(page.includes("editingTemplateId"));
    assert.equal(page.includes("prefers-reduced-motion"), false);
  });

  it("Properties Edit scrolls editor into view via shared hook", () => {
    const page = read(PROPERTIES);
    assert.ok(page.includes("useScrollEditorIntoView"));
    assert.ok(page.includes("formPanelRef"));
    assert.ok(page.includes("editingPropertyId"));
    assert.ok(page.includes("scroll-mt-6"));
    assert.ok(page.includes("openPropertyForm"));
  });

  it("Collections Edit scrolls editor into view via shared hook", () => {
    const page = read(COLLECTIONS);
    assert.ok(page.includes("useScrollEditorIntoView"));
    assert.ok(page.includes("formPanelRef"));
    assert.ok(page.includes("editingPacketId"));
    assert.ok(page.includes("scroll-mt-6"));
  });

  it("Contacts uses the shared scroll hook (same list+editor pattern)", () => {
    const page = read(CONTACTS);
    assert.ok(page.includes("useScrollEditorIntoView"));
    assert.ok(page.includes("formPanelRef"));
    assert.ok(page.includes("editingContactId"));
  });

  it("scroll deps are limited to mode and selection id (not form values)", () => {
    for (const path of [FORMS, PROPERTIES, COLLECTIONS, CONTACTS]) {
      const page = read(path);
      const call = page.match(
        /useScrollEditorIntoView\(\s*formPanelRef\s*,\s*formMode\s*,\s*([A-Za-z0-9_]+)\s*\)/,
      );
      assert.ok(call, `missing hook call in ${path}`);
      assert.notEqual(call![1], "formValue");
      assert.notEqual(call![1], "isSubmitting");
    }
  });
});

describe("Form Templates table vs Edit lifecycle relocation", () => {
  it("table actions keep Map Fields, Edit/View, and Delete; lifecycle gone from table", () => {
    const page = read(FORMS);
    const actionsCellStart = page.indexOf("<ResizableDataTableActionsCell>");
    assert.ok(actionsCellStart > 0);
    // Use the last (table) actions cell block
    const lastActions = page.lastIndexOf("<ResizableDataTableActionsCell>");
    const actionsBlock = page.slice(
      lastActions,
      page.indexOf("</ResizableDataTableActionsCell>", lastActions),
    );

    assert.ok(actionsBlock.includes("Map Fields"));
    assert.ok(actionsBlock.includes("openEditForm"));
    assert.ok(actionsBlock.includes("Delete"));

    assert.equal(actionsBlock.includes("Publish Form"), false);
    assert.equal(actionsBlock.includes("Unpublish Form"), false);
    assert.equal(actionsBlock.includes("Retire Version"), false);
    assert.equal(actionsBlock.includes("Restore Retired Version"), false);
    assert.equal(actionsBlock.includes(">History<"), false);
    assert.equal(actionsBlock.includes("openPublishDialog"), false);
    assert.equal(actionsBlock.includes("openHistoryDialog"), false);
  });

  it("Edit screen shows Form lifecycle controls by state and permission", () => {
    const page = read(FORMS);
    assert.ok(page.includes("Form lifecycle"));
    assert.ok(page.includes("showEditorLifecycle"));
    assert.ok(page.includes("View History"));
    assert.ok(page.includes("openPublishDialog(editingTemplate)"));
    assert.ok(page.includes("openUnpublishDialog(editingTemplate)"));
    assert.ok(page.includes("openRetireDialog(editingTemplate)"));
    assert.ok(page.includes("openRestoreDialog(editingTemplate)"));
    assert.ok(page.includes("openHistoryDialog(editingTemplate)"));
    assert.ok(page.includes("canPublishForm(editingTemplate)"));
    assert.ok(page.includes("canUnpublishForm(editingTemplate)"));
    assert.ok(page.includes("canRetireForm(editingTemplate)"));
    assert.ok(page.includes("canRestoreForm(editingTemplate)"));
    assert.ok(page.includes("isActiveAdmin"));
  });

  it("restore remains admin + reason gated", () => {
    const page = read(FORMS);
    assert.ok(page.includes("Only application admins can restore retired forms"));
    assert.ok(page.includes("A written reason is required to restore"));
    assert.ok(page.includes("restoreReason"));
    const historyGate = page.includes(
      "Only application admins can view lifecycle history",
    );
    assert.ok(historyGate);
  });
});
