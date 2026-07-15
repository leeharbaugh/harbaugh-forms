import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function readComponent(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("shared Select control", () => {
  const source = readComponent("components/ui/select.tsx");

  it("matches Input height and warm card surface", () => {
    assert.match(source, /h-9/);
    assert.match(source, /bg-card/);
    assert.match(source, /border-input/);
  });

  it("forwards native select props and focus ring", () => {
    assert.match(source, /React\.forwardRef/);
    assert.match(source, /focus-visible:ring-2/);
    assert.match(source, /ComponentProps<"select">/);
  });
});

describe("shared Textarea control", () => {
  const source = readComponent("components/ui/textarea.tsx");

  it("uses a sensible minimum height and card surface", () => {
    assert.match(source, /min-h-24/);
    assert.match(source, /bg-card/);
    assert.match(source, /border-input/);
  });

  it("forwards native textarea props and focus ring", () => {
    assert.match(source, /React\.forwardRef/);
    assert.match(source, /focus-visible:ring-2/);
    assert.match(source, /ComponentProps<"textarea">/);
  });
});

describe("form error class vocabulary", () => {
  it("auth forms use text-destructive instead of text-red-500", () => {
    for (const file of [
      "components/login-form.tsx",
      "components/forgot-password-form.tsx",
      "components/update-password-form.tsx",
    ]) {
      const source = readComponent(file);
      assert.doesNotMatch(source, /text-red-500|text-red-600/);
      assert.match(source, /text-destructive/);
    }
  });
});

describe("core forms use shared Select/Textarea", () => {
  it("migrates contact and property native controls", () => {
    for (const file of [
      "components/contacts/contact-form.tsx",
      "components/properties/property-form.tsx",
    ]) {
      const source = readComponent(file);
      assert.match(source, /from "@\/components\/ui\/select"/);
      assert.match(source, /from "@\/components\/ui\/textarea"/);
      assert.doesNotMatch(source, /<select[\s>]/);
      assert.doesNotMatch(source, /<textarea[\s>]/);
    }
  });
});
