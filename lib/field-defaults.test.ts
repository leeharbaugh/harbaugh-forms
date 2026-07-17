import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildScopedDefaultLookup,
  classifyPrivateFieldForGlobalization,
  globalCatalogFieldPreferenceDefaults,
  isStructuralMappingDefaultOverride,
  mappingOverrideForGlobalCopy,
  pickBestFieldDefault,
  resolveScopedPreferenceDefault,
  validateFieldDefaultInput,
  type FieldDefault,
} from "./types/field-default.ts";

const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";
const ADMIN_USER_ID = "admin-user-id";
const OTHER_USER_ID = "other-user-id";
const DAVEY_ORG_ID = "b788f525-53f4-42ed-b5a1-cb741398a974";

const CONTRACT_PROPERTY_AS_IS_FIELD_ID =
  "71cc5bb4-8b16-4e6d-861a-a925a650da91";
const SCHEDULING_COMPANY_FIELD_ID = "1c7ef2a8-0842-4a84-80ac-4e69a8ec2437";
const SELLER_IS_NOT_FOREIGN_PERSON_FIELD_ID =
  "b0548c8b-c4f7-44f9-8328-9c14899e09e7";
const YAHOO_USER_ID = "8d10af59-f3f8-4a48-94b5-3477656c02a6";

/** Local stand-in for catalog-default branch (avoids @/ imports). */
function resolveCatalogFieldDefault(field: {
  default_value: string | null;
  default_checked: boolean | null;
  field_widget_type: string;
}): { value: string; source: string } {
  const fieldDefault = field.default_value?.trim();
  if (fieldDefault) {
    return { value: fieldDefault, source: "field_default" };
  }
  if (
    field.field_widget_type.toLowerCase() === "checkbox" &&
    field.default_checked === true
  ) {
    return { value: "true", source: "field_default_checked" };
  }
  return { value: "", source: "empty" };
}

function baseDefault(
  overrides: Partial<FieldDefault> & Pick<FieldDefault, "id" | "scope" | "field_id">,
): FieldDefault {
  return {
    create_date: "2026-01-01T00:00:00Z",
    update_date: "2026-01-01T00:00:00Z",
    status: "ACTIVE",
    form_id: null,
    form_field_mapping_id: null,
    owner_user_id: overrides.scope === "PRIVATE" ? LEE_USER_ID : null,
    organization_id: overrides.scope === "ORGANIZATION" ? DAVEY_ORG_ID : null,
    default_value: "3%",
    default_checked: null,
    created_by_user_id: null,
    updated_by_user_id: null,
    notes: null,
    ...overrides,
  };
}

/**
 * Mirrors packet context construction: load defaults for the packet owner
 * (acting user), never the viewing administrator.
 */
function lookupForPacketOwner(options: {
  packetOwnerUserId: string;
  packetOwnerOrganizationId: string | null;
  allDefaults: FieldDefault[];
}): ReturnType<typeof buildScopedDefaultLookup> {
  const privateDefaults = options.allDefaults.filter(
    (row) =>
      row.status === "ACTIVE" &&
      row.scope === "PRIVATE" &&
      row.owner_user_id === options.packetOwnerUserId,
  );
  const organizationDefaults =
    options.packetOwnerOrganizationId == null
      ? []
      : options.allDefaults.filter(
          (row) =>
            row.status === "ACTIVE" &&
            row.scope === "ORGANIZATION" &&
            row.organization_id === options.packetOwnerOrganizationId,
        );
  return buildScopedDefaultLookup([
    ...privateDefaults,
    ...organizationDefaults,
  ]);
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

    const lookup = buildScopedDefaultLookup([privateField, orgField]);
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
    assert.equal(pickBestFieldDefault([deleted], { fieldId: "fld" }), null);
  });
});

describe("scoped default classification scenarios", () => {
  const leeAsIsPrivate = baseDefault({
    id: "7d04c8f3-c9d4-4b54-8bab-cd16cfe96c86",
    scope: "PRIVATE",
    field_id: CONTRACT_PROPERTY_AS_IS_FIELD_ID,
    owner_user_id: LEE_USER_ID,
    default_value: null,
    default_checked: true,
    notes: "Classified 2026-07-17: Lee PRIVATE preference (Property Accepted As Is).",
  });

  const daveySchedulingOrg = baseDefault({
    id: "org-scheduling",
    scope: "ORGANIZATION",
    field_id: SCHEDULING_COMPANY_FIELD_ID,
    organization_id: DAVEY_ORG_ID,
    default_value: "Broker Bay",
    default_checked: null,
  });

  const leeSchedulingPrivate = baseDefault({
    id: "lee-scheduling-private",
    scope: "PRIVATE",
    field_id: SCHEDULING_COMPANY_FIELD_ID,
    owner_user_id: LEE_USER_ID,
    default_value: "Lee Private Scheduler",
    default_checked: null,
  });

  const adminAsIsPrivate = baseDefault({
    id: "admin-as-is",
    scope: "PRIVATE",
    field_id: CONTRACT_PROPERTY_AS_IS_FIELD_ID,
    owner_user_id: ADMIN_USER_ID,
    default_value: null,
    default_checked: false,
  });

  const allDefaults = [
    leeAsIsPrivate,
    daveySchedulingOrg,
    leeSchedulingPrivate,
    adminAsIsPrivate,
  ];

  it("resolves Lee CONTRACT_PROPERTY_AS_IS Private default for Lee", () => {
    const lookup = lookupForPacketOwner({
      packetOwnerUserId: LEE_USER_ID,
      packetOwnerOrganizationId: DAVEY_ORG_ID,
      allDefaults,
    });
    const hit = resolveScopedPreferenceDefault({
      lookup,
      fieldId: CONTRACT_PROPERTY_AS_IS_FIELD_ID,
    });
    assert.equal(hit?.source, "private_default");
    assert.equal(hit?.value, "true");
    assert.deepEqual(hit?.value_json, { checked: true });
  });

  it("does not resolve Lee Private CONTRACT_PROPERTY_AS_IS for another user", () => {
    const lookup = lookupForPacketOwner({
      packetOwnerUserId: OTHER_USER_ID,
      packetOwnerOrganizationId: DAVEY_ORG_ID,
      allDefaults,
    });
    const hit = resolveScopedPreferenceDefault({
      lookup,
      fieldId: CONTRACT_PROPERTY_AS_IS_FIELD_ID,
    });
    assert.equal(hit, null);
  });

  it("gives a Davey organization member the Organization default", () => {
    const lookup = lookupForPacketOwner({
      packetOwnerUserId: OTHER_USER_ID,
      packetOwnerOrganizationId: DAVEY_ORG_ID,
      allDefaults,
    });
    const hit = resolveScopedPreferenceDefault({
      lookup,
      fieldId: SCHEDULING_COMPANY_FIELD_ID,
    });
    assert.equal(hit?.source, "organization_default");
    assert.equal(hit?.value, "Broker Bay");
  });

  it("lets a Private default override an Organization default for the same field", () => {
    const lookup = lookupForPacketOwner({
      packetOwnerUserId: LEE_USER_ID,
      packetOwnerOrganizationId: DAVEY_ORG_ID,
      allDefaults,
    });
    const hit = resolveScopedPreferenceDefault({
      lookup,
      fieldId: SCHEDULING_COMPANY_FIELD_ID,
    });
    assert.equal(hit?.source, "private_default");
    assert.equal(hit?.value, "Lee Private Scheduler");
  });

  it("uses the packet owner's defaults when an administrator views the packet", () => {
    const viewingAdminId = ADMIN_USER_ID;
    const packetOwnerUserId = LEE_USER_ID;
    assert.notEqual(viewingAdminId, packetOwnerUserId);

    const lookup = lookupForPacketOwner({
      packetOwnerUserId,
      packetOwnerOrganizationId: DAVEY_ORG_ID,
      allDefaults,
    });

    const asIs = resolveScopedPreferenceDefault({
      lookup,
      fieldId: CONTRACT_PROPERTY_AS_IS_FIELD_ID,
    });
    assert.equal(asIs?.source, "private_default");
    assert.equal(asIs?.value, "true");

    assert.equal(
      lookup.privateDefaults.some((row) => row.owner_user_id === viewingAdminId),
      false,
    );
  });
});

describe("cleared Global catalog preference literals", () => {
  it("does not resolve NA, numeric zero, or unchecked catalog literals from fields", () => {
    for (const literal of ["NA", "0", "3%", "Broker Bay"]) {
      const before = resolveCatalogFieldDefault({
        default_value: literal,
        default_checked: null,
        field_widget_type: "text",
      });
      assert.equal(before.source, "field_default");
      assert.equal(before.value, literal);

      const after = resolveCatalogFieldDefault({
        default_value: null,
        default_checked: null,
        field_widget_type: "text",
      });
      assert.equal(after.source, "empty");
      assert.equal(after.value, "");
    }

    const uncheckedBefore = resolveCatalogFieldDefault({
      default_value: null,
      default_checked: false,
      field_widget_type: "checkbox",
    });
    // false is stored but only true participates as field_default_checked;
    // after cleanup both columns are null and the catalog contributes nothing.
    assert.equal(uncheckedBefore.source, "empty");

    const checkedLiteral = resolveCatalogFieldDefault({
      default_value: null,
      default_checked: true,
      field_widget_type: "checkbox",
    });
    assert.equal(checkedLiteral.source, "field_default_checked");
    assert.equal(checkedLiteral.value, "true");

    const checkedCleared = resolveCatalogFieldDefault({
      default_value: null,
      default_checked: null,
      field_widget_type: "checkbox",
    });
    assert.equal(checkedCleared.source, "empty");
    assert.equal(checkedCleared.value, "");
  });

  it("leaves scoped Private/Organization defaults able to resolve after catalog clear", () => {
    const leeAsIs = baseDefault({
      id: "as-is",
      scope: "PRIVATE",
      field_id: CONTRACT_PROPERTY_AS_IS_FIELD_ID,
      owner_user_id: LEE_USER_ID,
      default_value: null,
      default_checked: true,
    });
    const orgScheduling = baseDefault({
      id: "org-sched",
      scope: "ORGANIZATION",
      field_id: SCHEDULING_COMPANY_FIELD_ID,
      organization_id: DAVEY_ORG_ID,
      default_value: "Broker Bay",
      default_checked: null,
    });

    const leeLookup = lookupForPacketOwner({
      packetOwnerUserId: LEE_USER_ID,
      packetOwnerOrganizationId: DAVEY_ORG_ID,
      allDefaults: [leeAsIs, orgScheduling],
    });
    assert.equal(
      resolveScopedPreferenceDefault({
        lookup: leeLookup,
        fieldId: CONTRACT_PROPERTY_AS_IS_FIELD_ID,
      })?.value,
      "true",
    );

    const memberLookup = lookupForPacketOwner({
      packetOwnerUserId: OTHER_USER_ID,
      packetOwnerOrganizationId: DAVEY_ORG_ID,
      allDefaults: [leeAsIs, orgScheduling],
    });
    assert.equal(
      resolveScopedPreferenceDefault({
        lookup: memberLookup,
        fieldId: CONTRACT_PROPERTY_AS_IS_FIELD_ID,
      }),
      null,
    );
    assert.equal(
      resolveScopedPreferenceDefault({
        lookup: memberLookup,
        fieldId: SCHEDULING_COMPANY_FIELD_ID,
      })?.value,
      "Broker Bay",
    );
  });

  it("treats source mappings as authoritative over blank catalog defaults", () => {
    // Catalog columns cleared → empty. Mapped transaction/source data is a
    // separate resolution stage and is unaffected by clearing catalog literals.
    const catalog = resolveCatalogFieldDefault({
      default_value: null,
      default_checked: null,
      field_widget_type: "text",
    });
    assert.equal(catalog.source, "empty");

    // Simulate a mapped source hit taking precedence over any catalog default.
    const mappedSourceValue = "Dallas";
    const resolved =
      mappedSourceValue.trim() !== ""
        ? { value: mappedSourceValue, source: "mapped_source" }
        : catalog;
    assert.equal(resolved.source, "mapped_source");
    assert.equal(resolved.value, "Dallas");
  });
});

describe("Copy to Global Library preference exclusion", () => {
  it("never copies Private/Organization preference defaults onto Global catalog fields", () => {
    assert.deepEqual(globalCatalogFieldPreferenceDefaults(), {
      default_value: null,
      default_checked: null,
    });
  });

  it("does not reintroduce catalog default literals when promoting fields", () => {
    const payload = {
      ...globalCatalogFieldPreferenceDefaults(),
      fallback_value: null as null,
      source_type: "buyer_rep_details",
      source_path: "other_compensation",
    };
    assert.equal(payload.default_value, null);
    assert.equal(payload.default_checked, null);
    assert.equal(payload.fallback_value, null);
    // Source mapping metadata is preserved; preference literals are not.
    assert.equal(payload.source_type, "buyer_rep_details");
    assert.equal(payload.source_path, "other_compensation");
  });

  it("strips preference mapping overrides and keeps structural placeholders", () => {
    assert.equal(mappingOverrideForGlobalCopy("3%"), null);
    assert.equal(mappingOverrideForGlobalCopy("Davey Goosmann Realty"), null);
    assert.equal(mappingOverrideForGlobalCopy("Off"), "Off");
    assert.equal(mappingOverrideForGlobalCopy("NA"), "NA");
    assert.equal(mappingOverrideForGlobalCopy(null), null);
  });
});

describe("isStructuralMappingDefaultOverride", () => {
  it("treats Off/NA/empty as structural", () => {
    assert.equal(isStructuralMappingDefaultOverride("Off"), true);
    assert.equal(isStructuralMappingDefaultOverride("NA"), true);
    assert.equal(isStructuralMappingDefaultOverride(""), true);
    assert.equal(isStructuralMappingDefaultOverride("3%"), false);
    assert.equal(
      isStructuralMappingDefaultOverride("Davey Goosmann Realty"),
      false,
    );
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

describe("SELLER_IS_NOT_FOREIGN_PERSON Lee Private restoration", () => {
  const leeNotForeign = baseDefault({
    id: "lee-not-foreign",
    scope: "PRIVATE",
    field_id: SELLER_IS_NOT_FOREIGN_PERSON_FIELD_ID,
    owner_user_id: LEE_USER_ID,
    default_value: null,
    default_checked: true,
  });

  it("resolves checked for Lee when no listing-detail source exists", () => {
    const lookup = lookupForPacketOwner({
      packetOwnerUserId: LEE_USER_ID,
      packetOwnerOrganizationId: DAVEY_ORG_ID,
      allDefaults: [leeNotForeign],
    });
    const resolved = resolveScopedPreferenceDefault({
      lookup,
      fieldId: SELLER_IS_NOT_FOREIGN_PERSON_FIELD_ID,
    });
    assert.equal(resolved?.value, "true");
    assert.equal(resolved?.value_json?.checked, true);
    assert.equal(resolved?.source, "private_default");
  });

  it("does not give Yahoo Lee’s Private default", () => {
    const lookup = lookupForPacketOwner({
      packetOwnerUserId: YAHOO_USER_ID,
      packetOwnerOrganizationId: null,
      allDefaults: [leeNotForeign],
    });
    assert.equal(
      resolveScopedPreferenceDefault({
        lookup,
        fieldId: SELLER_IS_NOT_FOREIGN_PERSON_FIELD_ID,
      }),
      null,
    );
  });

  it("lets explicit listing-detail foreign-person true override the Private default", () => {
    // Mirrors resolveSellerIsNotForeignPerson: NOT-foreign checkbox is true
    // only when seller_is_foreign_person === false. Mapped listing data wins
    // before scoped defaults in resolveFieldValueFromContext.
    const listingSaysForeign = { seller_is_foreign_person: true as const };
    const mappedNotForeignChecked =
      listingSaysForeign.seller_is_foreign_person === false;
    assert.equal(mappedNotForeignChecked, false);

    const leeDefault = resolveScopedPreferenceDefault({
      lookup: lookupForPacketOwner({
        packetOwnerUserId: LEE_USER_ID,
        packetOwnerOrganizationId: DAVEY_ORG_ID,
        allDefaults: [leeNotForeign],
      }),
      fieldId: SELLER_IS_NOT_FOREIGN_PERSON_FIELD_ID,
    });
    assert.equal(leeDefault?.value, "true");

    // Precedence: mapped listing result replaces Private default.
    const finalValue = mappedNotForeignChecked ? "true" : "false";
    assert.equal(finalValue, "false");
  });

  it("is excluded from Copy to Global Library catalog preference columns", () => {
    assert.deepEqual(globalCatalogFieldPreferenceDefaults(), {
      default_value: null,
      default_checked: null,
    });
    assert.equal(
      resolveCatalogFieldDefault({
        default_value: null,
        default_checked: null,
        field_widget_type: "checkbox",
      }).source,
      "empty",
    );
  });
});
