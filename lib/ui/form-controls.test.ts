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

describe("packet property picker hides results until search text is entered", () => {
  const picker = readComponent("components/properties/property-picker.tsx");
  const consumers = [
    "components/packets/create-custom-packet-form.tsx",
    "components/packets/create-packet-from-collection-form.tsx",
    "components/packets/packet-edit-form.tsx",
  ];

  it("keeps the search box but does not list properties for a blank or whitespace-only query", () => {
    assert.match(picker, /id="property_search"/);
    assert.match(picker, /const trimmedSearch = searchQuery\.trim\(\);/);
    assert.match(picker, /if \(!trimmedSearch\) \{[\s\S]*return;/);
    assert.match(
      picker,
      /const hasSearchQuery = searchQuery\.trim\(\)\.length > 0;/,
    );
    assert.match(picker, /\{hasSearchQuery && \(/);
    assert.doesNotMatch(
      picker,
      /No active properties found\. Create a new property instead\./,
    );
  });

  it("keeps the selected property independent of the search query", () => {
    assert.match(picker, /<Label>Selected property<\/Label>/);
    assert.match(picker, /void loadSelectedProperty\(propertyId\);/);

    const selectPropertyMatch = picker.match(
      /const selectProperty = \(nextProperty: Property\) => \{[\s\S]*?\n  const switchToNew/,
    );
    assert.ok(selectPropertyMatch);
    assert.match(selectPropertyMatch[0], /setSelectedProperty\(nextProperty\);/);
    assert.match(selectPropertyMatch[0], /setSearchQuery\(""\);/);
    assert.doesNotMatch(selectPropertyMatch[0], /setSelectedProperty\(null\)/);
    assert.doesNotMatch(selectPropertyMatch[0], /property_id:\s*null/);
  });

  it("is shared by New Packet and Edit Packet", () => {
    for (const file of consumers) {
      const source = readComponent(file);
      assert.match(
        source,
        /from "@\/components\/properties\/property-picker"/,
      );
      assert.match(source, /<PropertyPicker/);
    }
  });
});

describe("packet assigned property is independent of property-entry UI mode", () => {
  const picker = readComponent("components/properties/property-picker.tsx");
  const customCreate = readComponent(
    "components/packets/create-custom-packet-form.tsx",
  );
  const collectionCreate = readComponent(
    "components/packets/create-packet-from-collection-form.tsx",
  );
  const editForm = readComponent("components/packets/packet-edit-form.tsx");

  it("does not clear property_id or selectedProperty when toggling entry modes", () => {
    const switchToNewMatch = picker.match(
      /const switchToNew = \(\) => \{[\s\S]*?\n  const switchToExisting/,
    );
    const switchToExistingMatch = picker.match(
      /const switchToExisting = \(\) => \{[\s\S]*?\n  const handleSaveNewProperty/,
    );

    assert.ok(switchToNewMatch);
    assert.ok(switchToExistingMatch);
    assert.match(switchToNewMatch[0], /property_mode: "new"/);
    assert.match(switchToExistingMatch[0], /property_mode: "existing"/);
    assert.doesNotMatch(switchToNewMatch[0], /property_id:\s*null/);
    assert.doesNotMatch(switchToExistingMatch[0], /property_id:\s*null/);
    assert.doesNotMatch(switchToNewMatch[0], /setSelectedProperty\(null\)/);
    assert.doesNotMatch(
      switchToExistingMatch[0],
      /setSelectedProperty\(null\)/,
    );
  });

  it("does not clear the assigned property while typing a new-property draft", () => {
    assert.match(
      picker,
      /onChange=\{\(nextProperty\) => \{[\s\S]*?property_mode: "new",[\s\S]*?property: nextProperty,/,
    );
    assert.doesNotMatch(
      picker,
      /onChange=\{\(nextProperty\) => \{[\s\S]*?property_id:\s*null/,
    );
  });

  it("keeps assigned-property loading independent of the entry mode", () => {
    assert.match(picker, /void loadSelectedProperty\(propertyId\);/);
    assert.doesNotMatch(
      picker,
      /if \(mode === "existing"\) \{\s*void loadSelectedProperty\(propertyId\);/,
    );
  });

  it("New Packet create falls back to the assigned propertyId when a new property is not committed", () => {
    assert.match(
      customCreate,
      /let resolvedPropertyId: number \| null = propertyId;/,
    );
    assert.doesNotMatch(
      customCreate,
      /else if \(propertyMode === "existing"\) \{\s*resolvedPropertyId = propertyId;/,
    );
    assert.match(
      collectionCreate,
      /if \(required\) \{\s*if \(propertyId == null\) \{/,
    );
    assert.match(collectionCreate, /return propertyId;/);
  });

  it("Edit Packet save uses the assigned propertyId regardless of entry mode", () => {
    assert.match(
      editForm,
      /propertyId: showPropertySelection \? propertyId : null,/,
    );
    assert.doesNotMatch(
      editForm,
      /propertyMode === "new"[\s\S]*propertyId: null/,
    );
  });

  it("selecting an existing search result still assigns that property", () => {
    const selectPropertyMatch = picker.match(
      /const selectProperty = \(nextProperty: Property\) => \{[\s\S]*?\n  const switchToNew/,
    );
    assert.ok(selectPropertyMatch);
    assert.match(selectPropertyMatch[0], /property_id: nextProperty\.id/);
    assert.match(selectPropertyMatch[0], /property_mode: "existing"/);
  });

  it("Save and select property still replaces the assignment with the created property", () => {
    const saveMatch = picker.match(
      /const handleSaveNewProperty = async \(\) => \{[\s\S]*?setSearchQuery\(""\);/,
    );
    assert.ok(saveMatch);
    assert.match(saveMatch[0], /property_id: savedProperty\.id/);
    assert.match(saveMatch[0], /property_mode: "existing"/);
  });
});
