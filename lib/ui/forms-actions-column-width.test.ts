import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";
import { mergeColumnWidthsWithDefaults } from "../types/user-preferences.ts";

const FORMS = "components/forms/forms-page.tsx";

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

function parseFormsActionsColumn(source: string) {
  const match = source.match(
    /id:\s*"actions",\s*label:\s*"Actions",[\s\S]*?defaultWidth:\s*(\d+),\s*minWidth:\s*(\d+),\s*maxWidth:\s*(\d+),/,
  );
  assert.ok(match, "Form Templates Actions column bounds missing");
  return {
    defaultWidth: Number(match[1]),
    minWidth: Number(match[2]),
    maxWidth: Number(match[3]),
  };
}

describe("Form Templates Actions column width", () => {
  it("uses compact bounds for Map Fields, Edit, and Delete", () => {
    const page = read(FORMS);
    const actions = parseFormsActionsColumn(page);

    assert.ok(actions.defaultWidth <= 300);
    assert.ok(actions.minWidth >= 220);
    assert.ok(actions.maxWidth <= 360);
    assert.ok(actions.minWidth <= actions.defaultWidth);
    assert.ok(actions.defaultWidth <= actions.maxWidth);

    const tableActions = page.slice(
      page.lastIndexOf("<ResizableDataTableActionsCell>"),
      page.lastIndexOf("</ResizableDataTableActionsCell>"),
    );
    assert.ok(tableActions.includes("Map Fields"));
    assert.ok(/\bEdit\b/.test(tableActions));
    assert.ok(tableActions.includes("Delete"));
    assert.equal(tableActions.includes("Copy to Global Library"), false);
    assert.equal(tableActions.includes("Publish Form"), false);
  });

  it("clamps previously saved oversized Actions widths without resetting other columns", () => {
    const page = read(FORMS);
    const actions = parseFormsActionsColumn(page);
    const columns = [
      { id: "id", defaultWidth: 72, minWidth: 48 },
      { id: "form_name", defaultWidth: 220 },
      {
        id: "actions",
        defaultWidth: actions.defaultWidth,
        minWidth: actions.minWidth,
        maxWidth: actions.maxWidth,
      },
    ];

    const merged = mergeColumnWidthsWithDefaults(columns, {
      id: 80,
      form_name: 260,
      actions: 520,
    });

    assert.equal(merged.id, 80);
    assert.equal(merged.form_name, 260);
    assert.equal(merged.actions, actions.maxWidth);
    assert.ok(merged.actions < 520);
  });
});
