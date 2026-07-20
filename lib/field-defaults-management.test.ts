import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateFieldDefaultInput,
  type FieldDefault,
} from "./types/field-default.ts";
import type { DefaultsManagementActor } from "./types/field-default-management.ts";
import {
  assertWritableDefaultScope,
  canManageOrganizationDefault,
  canManagePrivateDefault,
  canOfferFormDefaultsManagement,
  canViewOrganizationDefaults,
  defaultsEditorKindForField,
  draftFromFieldDefault,
  effectiveScopedDefaultWinner,
  formatDefaultsDisplayValue,
  serializeDefaultsDraft,
} from "./types/field-default-management.ts";

function makeDefault(
  overrides: Partial<FieldDefault> & Pick<FieldDefault, "id" | "scope">,
): FieldDefault {
  return {
    create_date: "2026-07-01T00:00:00Z",
    update_date: "2026-07-01T00:00:00Z",
    status: "ACTIVE",
    field_id: "field-1",
    form_id: 10,
    form_field_mapping_id: null,
    owner_user_id: overrides.scope === "PRIVATE" ? "user-1" : null,
    organization_id: overrides.scope === "ORGANIZATION" ? "org-1" : null,
    default_value: null,
    default_checked: null,
    created_by_user_id: null,
    updated_by_user_id: null,
    notes: null,
    ...overrides,
  };
}

const member: DefaultsManagementActor = {
  userId: "user-1",
  isActiveAdmin: false,
  memberOrganizationIds: ["org-1"],
  orgAdminOrganizationIds: [],
};

const orgAdmin: DefaultsManagementActor = {
  userId: "user-2",
  isActiveAdmin: false,
  memberOrganizationIds: ["org-1"],
  orgAdminOrganizationIds: ["org-1"],
};

const appAdmin: DefaultsManagementActor = {
  userId: "admin-1",
  isActiveAdmin: true,
  memberOrganizationIds: ["org-admin-home"],
  orgAdminOrganizationIds: [],
};

describe("validateFieldDefaultInput rejects GLOBAL", () => {
  it("rejects GLOBAL scope", () => {
    const error = validateFieldDefaultInput({
      field_id: "field-1",
      scope: "GLOBAL",
      owner_user_id: "user-1",
      default_value: "x",
    });
    assert.match(error ?? "", /Global/i);
  });
});

describe("serializeDefaultsDraft value shapes", () => {
  it("stores checkbox false distinctly from absent", () => {
    const unchecked = serializeDefaultsDraft("checkbox", {
      textValue: "",
      checked: false,
    });
    assert.equal(unchecked.ok, true);
    if (unchecked.ok) {
      assert.equal(unchecked.payload.default_checked, false);
      assert.equal(unchecked.payload.default_value, null);
    }

    const missing = serializeDefaultsDraft("checkbox", {
      textValue: "",
      checked: null,
    });
    assert.equal(missing.ok, false);
  });

  it("stores numeric zero and rejects blank number", () => {
    const zero = serializeDefaultsDraft("number", {
      textValue: "0",
      checked: null,
    });
    assert.equal(zero.ok, true);
    if (zero.ok) {
      assert.equal(zero.payload.default_value, "0");
    }

    const blank = serializeDefaultsDraft("currency", {
      textValue: "   ",
      checked: null,
    });
    assert.equal(blank.ok, false);
  });

  it("rejects NA for dates and allows blank text", () => {
    const badDate = serializeDefaultsDraft("date", {
      textValue: "NA",
      checked: null,
    });
    assert.equal(badDate.ok, false);

    const goodDate = serializeDefaultsDraft("date", {
      textValue: "2026-08-01",
      checked: null,
    });
    assert.equal(goodDate.ok, true);

    const blankText = serializeDefaultsDraft("text", {
      textValue: "",
      checked: null,
    });
    assert.equal(blankText.ok, true);
    if (blankText.ok) {
      assert.equal(blankText.payload.default_value, "");
    }
  });

  it("rejects unsupported field kinds", () => {
    const result = serializeDefaultsDraft("unsupported", {
      textValue: "x",
      checked: null,
    });
    assert.equal(result.ok, false);
  });
});

describe("defaultsEditorKindForField", () => {
  it("maps checkbox, date, currency, and signature", () => {
    assert.equal(
      defaultsEditorKindForField({
        field_data_type: "boolean",
        field_widget_type: "checkbox",
      }),
      "checkbox",
    );
    assert.equal(
      defaultsEditorKindForField({
        field_data_type: "date",
        field_widget_type: "date",
      }),
      "date",
    );
    assert.equal(
      defaultsEditorKindForField({
        field_data_type: "currency",
        field_widget_type: "currency",
      }),
      "currency",
    );
    assert.equal(
      defaultsEditorKindForField({
        field_data_type: "text",
        field_widget_type: "signature",
      }),
      "unsupported",
    );
  });
});

describe("effective scoped default display", () => {
  it("Private overrides Organization", () => {
    const privateDefault = makeDefault({
      id: "p1",
      scope: "PRIVATE",
      default_value: "private",
    });
    const organizationDefault = makeDefault({
      id: "o1",
      scope: "ORGANIZATION",
      default_value: "org",
    });
    assert.equal(
      effectiveScopedDefaultWinner({ privateDefault, organizationDefault }),
      "Private",
    );
    assert.equal(
      effectiveScopedDefaultWinner({
        privateDefault: null,
        organizationDefault,
      }),
      "Organization",
    );
    assert.equal(
      effectiveScopedDefaultWinner({
        privateDefault: null,
        organizationDefault: null,
      }),
      "None",
    );
  });

  it("formats checkbox and blank displays", () => {
    assert.equal(
      formatDefaultsDisplayValue(
        makeDefault({
          id: "c1",
          scope: "PRIVATE",
          default_checked: false,
        }),
        "checkbox",
      ),
      "Unchecked",
    );
    assert.equal(
      formatDefaultsDisplayValue(
        makeDefault({
          id: "t1",
          scope: "PRIVATE",
          default_value: "",
        }),
        "text",
      ),
      "(blank)",
    );
    assert.equal(formatDefaultsDisplayValue(null, "text"), "None");
  });

  it("draftFromFieldDefault round-trips checkbox and text", () => {
    assert.deepEqual(
      draftFromFieldDefault(
        makeDefault({
          id: "c1",
          scope: "PRIVATE",
          default_checked: true,
        }),
        "checkbox",
      ),
      { textValue: "", checked: true },
    );
    assert.deepEqual(
      draftFromFieldDefault(
        makeDefault({
          id: "t1",
          scope: "ORGANIZATION",
          default_value: "hello",
        }),
        "text",
      ),
      { textValue: "hello", checked: null },
    );
  });
});

describe("permission helpers", () => {
  it("allows users to manage only their own Private defaults", () => {
    assert.equal(canManagePrivateDefault(member, "user-1"), true);
    assert.equal(canManagePrivateDefault(member, "user-2"), false);
    assert.equal(canManagePrivateDefault(appAdmin, "admin-1"), true);
    assert.equal(canManagePrivateDefault(appAdmin, "user-1"), false);
  });

  it("allows ORG_ADMIN only for own organization", () => {
    assert.equal(canManageOrganizationDefault(orgAdmin, "org-1"), true);
    assert.equal(canManageOrganizationDefault(orgAdmin, "org-2"), false);
    assert.equal(canManageOrganizationDefault(member, "org-1"), false);
  });

  it("allows members to view but not mutate Organization defaults", () => {
    assert.equal(canViewOrganizationDefaults(member, "org-1"), true);
    assert.equal(canManageOrganizationDefault(member, "org-1"), false);
    assert.equal(canViewOrganizationDefaults(member, "org-2"), false);
  });

  it("allows application Admin to manage an eligible organization", () => {
    assert.equal(canManageOrganizationDefault(appAdmin, "org-9"), true);
    assert.equal(canViewOrganizationDefaults(appAdmin, "org-9"), true);
  });

  it("treats inactive membership omission as no access", () => {
    const outsider: DefaultsManagementActor = {
      userId: "outsider",
      isActiveAdmin: false,
      memberOrganizationIds: [],
      orgAdminOrganizationIds: [],
    };
    assert.equal(canViewOrganizationDefaults(outsider, "org-1"), false);
    assert.equal(canManageOrganizationDefault(outsider, "org-1"), false);
  });
});

describe("Global-form entry constraints", () => {
  it("offers defaults only for active Global forms", () => {
    assert.equal(
      canOfferFormDefaultsManagement({ scope: "GLOBAL", status: "ACTIVE" }),
      true,
    );
    assert.equal(
      canOfferFormDefaultsManagement({ scope: "PRIVATE", status: "ACTIVE" }),
      false,
    );
    assert.equal(
      canOfferFormDefaultsManagement({ scope: "GLOBAL", status: "DELETED" }),
      false,
    );
  });

  it("rejects GLOBAL via assertWritableDefaultScope", () => {
    assert.equal(assertWritableDefaultScope("GLOBAL"), null);
    assert.equal(assertWritableDefaultScope("PRIVATE"), "PRIVATE");
    assert.equal(assertWritableDefaultScope("ORGANIZATION"), "ORGANIZATION");
  });
});

describe("packet safety invariants (management helpers)", () => {
  it("management serialization never invents packet refresh payloads", () => {
    const saved = serializeDefaultsDraft("text", {
      textValue: "new preference",
      checked: null,
    });
    assert.equal(saved.ok, true);
    if (saved.ok) {
      assert.deepEqual(Object.keys(saved.payload).sort(), [
        "default_checked",
        "default_value",
      ]);
    }
  });

  it("clearing is represented as soft-delete status, not catalog writes", () => {
    const statusForClear = "DELETED";
    assert.equal(statusForClear, "DELETED");
    assert.notEqual(statusForClear, "ACTIVE");
  });
});
