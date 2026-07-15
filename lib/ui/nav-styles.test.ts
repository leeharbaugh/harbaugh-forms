import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { navLinkClass } from "./nav-styles.ts";

describe("navLinkClass", () => {
  it("applies a soft pill for the active state", () => {
    const active = navLinkClass(true);
    assert.match(active, /bg-secondary/);
    assert.match(active, /font-medium/);
    assert.match(active, /text-foreground/);
  });

  it("uses muted text and hover treatment when inactive", () => {
    const inactive = navLinkClass(false);
    assert.match(inactive, /text-muted-foreground/);
    assert.match(inactive, /hover:bg-secondary\/70/);
    assert.ok(!inactive.split(/\s+/).includes("bg-secondary"));
  });

  it("includes visible focus-ring classes", () => {
    const classes = navLinkClass(false);
    assert.match(classes, /focus-visible:ring-2/);
  });
});
