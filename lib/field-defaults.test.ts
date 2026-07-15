import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScopedDefaultLookup,
  classifyPrivateFieldForGlobalization,
  isStructuralMappingDefaultOverride,
  resolveScopedPreferenceDefault,
} from "./field-defaults.ts";
import {
  pickBestFieldDefault,
  validateFieldDefaultInput,
  type FieldDefault,
} from "./types/field-default.ts";

function baseDefault(
  overrides: Partial<FieldDefault> & Pick<FieldDefault, "id" | "scope" | "field_id">,
): FieldDefault {
  return {
    create_date: "2026-01-01T00:00:00Z",
    update_date: "2026-01-01T00:00:00Z",
    status: "ACTIVE",
    form_id: null,
    form_field_mapping_id: null,
    owner_user_id:
      overrides.scope === "PRIVATE" ? "user-lee" : null,
    organization_id:
      overrides.scope === "ORGANIZATION" ? "org-davey" : null,
    default_value: "3%",
    default_checked: null,
    created_by_user_id: null,
    updated_by_user_id: null,
    notes: null,
    ...overrides,
  };
}

describe("validateFieldDefaultInput", () => {
  it("allows PRIVATE with owner", () => {
    assert.equal(
      validateFieldDefaultInput({
        field_id: "f1",
        scope: "PRIVATE",
        owner_user_id: "user-1",
        default_value: "3%",
      }),
      null,
    );
  });

  it("allows ORGANIZATION with organization", () => {
    assert.equal(
      validateFieldDefaultInput({
        field_id: "f1",
        scope: "ORGANIZATION",
        organization_id: "org-1",
        default_checked: true,
      }),
      null,
    );
  });

  it("rejects GLOBAL", () => {
    assert.match(
      validateFieldDefaultInput({
        field_id: "f1",
        scope: "GLOBAL",
        default_value: "x",
      }) ?? "",
      /Global/i,
    );
  });

  it("rejects missing owner/org and both together", () => {
    assert.match(
      validateFieldDefaultInput({
        field_id: "f1",
        scope: "PRIVATE",
        default_value: "x",
      }) ?? "",
      /owner/i,
    );
    assert.match(
      validateFieldDefaultInput({
        field_id: "f1",
        scope: "ORGANIZATION",
        default_value: "x",
      }) ?? "",
      /organization/i,
    );
    assert.match(
      validateFieldDefaultInput({
        field_id: "f1",
        scope: "PRIVATE",
        owner_user_id: "u1",
        organization_id: "o1",
        default_value: "x",
      }) ?? "",
      /organization/i,
    );
  });
});

describe("pickBestFieldDefault / resolveScopedPreferenceDefault", () => {
  it("prefers mapping, then form, then field-only; private beats org", () => {
    const privateField = baseDefault({
      id: "p1",
      scope: "PRIVATE",
      field_id: "fld",
      default_value: "private-field",
    });
    const privateForm = baseDefault({
      id: "p2",
      scope: "PRIVATE",
      field_id: "fld",
      form_id: 10,
      default_value: "private-form",
    });
    const privateMapping = baseDefault({
      id: "p3",
      scope: "PRIVATE",
      field_id: "fld",
      form_id: 10,
      form_field_mapping_id: "map-1",
      default_value: "private-map",
    });
    const orgField = baseDefault({
      id: "o1",
      scope: "ORGANIZATION",
      field_id: "fld",
      default_value: "org-field",
    });

    assert.equal(
      pickBestFieldDefault([privateField, privateForm, privateMapping], {
        fieldId: "fld",
        formId: 10,
        mappingId: "map-1",
      })?.default_value,
      "private-map",
    );

    const lookup = buildScopedDefaultLookup([
      privateField,
      orgField,
    ]);
    const hit = resolveScopedPreferenceDefault({
      lookup,
      fieldId: "fld",
    });
    assert.equal(hit?.source, "private_default");
    assert.equal(hit?.value, "private-field");

    const orgOnly = resolveScopedPreferenceDefault({
      lookup: buildScopedDefaultLookup([orgField]),
      fieldId: "fld",
    });
    assert.equal(orgOnly?.source, "organization_default");
    assert.equal(orgOnly?.value, "org-field");
  });

  it("ignores deleted/inactive rows", () => {
    const deleted = baseDefault({
      id: "d1",
      scope: "PRIVATE",
      field_id: "fld",
      status: "DELETED",
      default_value: "gone",
    });
    assert.equal(
      pickBestFieldDefault([deleted], { fieldId: "fld" }),
      null,
    );
  });
});

describe("isStructuralMappingDefaultOverride", () => {
  it("treats Off/NA/empty as structural", () => {
    assert.equal(isStructuralMappingDefaultOverride("Off"), true);
    assert.equal(isStructuralMappingDefaultOverride("NA"), true);
    assert.equal(isStructuralMappingDefaultOverride(""), true);
    assert.equal(isStructuralMappingDefaultOverride("3%"), false);
    assert.equal(isStructuralMappingDefaultOverride("Davey Goosmann Realty"), false);
  });
});

describe("classifyPrivateFieldForGlobalization", () => {
  it("blocks brokerage/user-specific keys", () => {
    const blocked = classifyPrivateFieldForGlobalization({
      field_key: "davey_goosmann_internal_code",
      field_label: "Office code",
    });
    assert.equal(blocked.safe, false);

    const ok = classifyPrivateFieldForGlobalization({
      field_key: "protection_period_days",
      field_label: "Protection Period",
    });
    assert.equal(ok.safe, true);
  });
});
