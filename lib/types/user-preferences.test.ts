import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampColumnWidth,
  mergeColumnWidthsWithDefaults,
} from "./user-preferences.ts";

const COLLECTION_LIKE_COLUMNS = [
  { id: "id", defaultWidth: 72, minWidth: 48 },
  { id: "forms", defaultWidth: 96, minWidth: 72, maxWidth: 160 },
  {
    id: "actions",
    defaultWidth: 280,
    minWidth: 220,
    maxWidth: 400,
  },
];

describe("clampColumnWidth", () => {
  it("clamps below min and above max", () => {
    assert.equal(
      clampColumnWidth(10, { id: "forms", defaultWidth: 96, minWidth: 72 }),
      72,
    );
    assert.equal(
      clampColumnWidth(999, {
        id: "actions",
        defaultWidth: 280,
        minWidth: 220,
        maxWidth: 400,
      }),
      400,
    );
  });
});

describe("mergeColumnWidthsWithDefaults", () => {
  it("returns defaults when nothing is saved", () => {
    assert.deepEqual(mergeColumnWidthsWithDefaults(COLLECTION_LIKE_COLUMNS, null), {
      id: 72,
      forms: 96,
      actions: 280,
    });
  });

  it("clamps unsafe saved widths for Forms and Actions", () => {
    assert.deepEqual(
      mergeColumnWidthsWithDefaults(COLLECTION_LIKE_COLUMNS, {
        forms: 20,
        actions: 900,
        id: 72,
      }),
      {
        id: 72,
        forms: 72,
        actions: 400,
      },
    );
  });

  it("ignores unknown column ids from saved preferences", () => {
    const merged = mergeColumnWidthsWithDefaults(COLLECTION_LIKE_COLUMNS, {
      forms: 100,
      obsolete: 120,
    });
    assert.equal(merged.forms, 100);
    assert.equal("obsolete" in merged, false);
  });

  it("clamps defaultWidth when it falls outside min/max", () => {
    assert.deepEqual(
      mergeColumnWidthsWithDefaults(
        [{ id: "actions", defaultWidth: 50, minWidth: 220, maxWidth: 400 }],
        null,
      ),
      { actions: 220 },
    );
  });
});
