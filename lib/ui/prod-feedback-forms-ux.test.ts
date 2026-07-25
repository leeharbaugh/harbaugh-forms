import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

describe("Fields catalog navigation removal", () => {
  it("removes Fields from FormsNav", () => {
    const nav = fs.readFileSync("components/forms/forms-nav.tsx", "utf8");
    assert.equal(nav.includes("/forms/fields"), false);
    assert.equal(nav.includes(">Fields<"), false);
    assert.ok(nav.includes("/forms"));
  });

  it("redirects former Fields routes to Templates", () => {
    const fieldsPage = fs.readFileSync("app/forms/fields/page.tsx", "utf8");
    const cleanupPage = fs.readFileSync(
      "app/forms/fields/cleanup/page.tsx",
      "utf8",
    );
    assert.ok(fieldsPage.includes('redirect("/forms")'));
    assert.ok(cleanupPage.includes('redirect("/forms")'));
  });
});

describe("Forms edit scroll trigger", () => {
  it("scrolls the editor panel when formMode or editingTemplateId changes", () => {
    const page = fs.readFileSync("components/forms/forms-page.tsx", "utf8");
    assert.ok(page.includes("formPanelRef"));
    assert.ok(page.includes("scrollIntoView"));
    assert.ok(page.includes("editingTemplateId"));
    assert.ok(page.includes("prefers-reduced-motion"));
  });
});
