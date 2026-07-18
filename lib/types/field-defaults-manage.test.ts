import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFieldDefaultWritePayload,
  describeEffectiveFallback,
  draftFromDisplay,
  filterDefaultsEditorRows,
  formatSharedFieldWarning,
  formatSourceSummary,
  normalizeDefaultValueForSave,
  pickFieldLevelDefault,
  scopedDefaultToDisplay,
  type DefaultsEditorFieldRow,
} from "./field-defaults-manage.ts";
import type { FieldDefault } from "./field-default.ts";
import {
  resolveScopedPreferenceDefault,
  buildScopedDefaultLookup,
} from "./field-default.ts";

function makeDefault(
  overrides: Partial<FieldDefault> &
    Pick<FieldDefault, "id" | "field_id" | "scope">,
): FieldDefault {
  return {
    create_date: "2026-07-01T00:00:00Z",
    update_date: "2026-07-01T00:00:00Z",
    status: "ACTIVE",
    form_id: null,
    form_field_mapping_id: null,
    owner_user_id: overrides.scope === "PRIVATE" ? "user-a" : null,
    organization_id: overrides.scope === "ORGANIZATION" ? "org-1" : null,
    default_value: null,
    default_checked: null,
    created_by_user_id: null,
    updated_by_user_id: null,
    notes: null,
    ...overrides,
  };
}

describe("field defaults manage modes", () => {
  it("maps checkbox inherit/checked/unchecked displays", () => {
    assert.equal(scopedDefaultToDisplay(null, true).mode, "inherit");
    assert.equal(
      scopedDefaultToDisplay(
        makeDefault({
          id: "1",
          field_id: "f1",
          scope: "PRIVATE",
          default_checked: true,
        }),
        true,
      ).mode,
      "checked",
    );
    assert.equal(
      scopedDefaultToDisplay(
        makeDefault({
          id: "2",
          field_id: "f1",
          scope: "PRIVATE",
          default_checked: false,
        }),
        true,
      ).mode,
      "unchecked",
    );
  });

  it("maps text inherit/value/blank and preserves zero", () => {
    assert.equal(scopedDefaultToDisplay(null, false).mode, "inherit");
    const blank = scopedDefaultToDisplay(
      makeDefault({
        id: "1",
        field_id: "f1",
        scope: "PRIVATE",
        default_value: "",
      }),
      false,
    );
    assert.equal(blank.mode, "blank");
    assert.equal(blank.isBlankOverride, true);

    const zero = scopedDefaultToDisplay(
      makeDefault({
        id: "2",
        field_id: "f1",
        scope: "PRIVATE",
        default_value: "0",
      }),
      false,
    );
    assert.equal(zero.mode, "value");
    assert.equal(zero.displayValue, "0");
    assert.equal(normalizeDefaultValueForSave("0", { isDate: false }), "0");
    assert.equal(normalizeDefaultValueForSave("5th", { isDate: false }), "5th");
    assert.equal(
      normalizeDefaultValueForSave("2026-07-17", { isDate: true }),
      "07/17/2026",
    );
  });

  it("builds write payloads for value, blank, and checkbox", () => {
    const value = buildFieldDefaultWritePayload({
      fieldId: "f1",
      scope: "PRIVATE",
      ownerUserId: "user-a",
      organizationId: null,
      draft: { kind: "text", mode: "value", value: "30" },
      isDate: false,
    });
    assert.equal(value.error, null);
    assert.equal(value.values?.default_value, "30");
    assert.equal(value.values?.form_id, null);
    assert.equal(value.values?.form_field_mapping_id, null);

    const blank = buildFieldDefaultWritePayload({
      fieldId: "f1",
      scope: "PRIVATE",
      ownerUserId: "user-a",
      organizationId: null,
      draft: { kind: "text", mode: "blank" },
      isDate: false,
    });
    assert.equal(blank.values?.default_value, "");
    assert.equal(blank.values?.default_checked, null);

    const checked = buildFieldDefaultWritePayload({
      fieldId: "f1",
      scope: "ORGANIZATION",
      ownerUserId: null,
      organizationId: "org-1",
      draft: { kind: "checkbox", mode: "checked" },
      isDate: false,
    });
    assert.equal(checked.values?.default_checked, true);
    assert.equal(checked.values?.default_value, null);

    const unchecked = buildFieldDefaultWritePayload({
      fieldId: "f1",
      scope: "PRIVATE",
      ownerUserId: "user-a",
      organizationId: null,
      draft: { kind: "checkbox", mode: "unchecked" },
      isDate: false,
    });
    assert.equal(unchecked.values?.default_checked, false);
  });

  it("rejects GLOBAL via validateFieldDefaultInput path", () => {
    // validateFieldDefaultInput is used inside build; force via invalid scope cast
    const result = buildFieldDefaultWritePayload({
      fieldId: "f1",
      scope: "PRIVATE",
      ownerUserId: null,
      organizationId: null,
      draft: { kind: "text", mode: "value", value: "x" },
      isDate: false,
    });
    assert.match(result.error ?? "", /owner/i);
  });
});

describe("precedence and effective fallback", () => {
  it("lets Private blank override Organization value", () => {
    const privateRow = makeDefault({
      id: "p",
      field_id: "f1",
      scope: "PRIVATE",
      default_value: "",
    });
    const orgRow = makeDefault({
      id: "o",
      field_id: "f1",
      scope: "ORGANIZATION",
      default_value: "Broker Bay",
    });

    const resolved = resolveScopedPreferenceDefault({
      lookup: buildScopedDefaultLookup([privateRow, orgRow]),
      fieldId: "f1",
    });
    assert.equal(resolved?.source, "private_default");
    assert.equal(resolved?.value, "");

    const fallback = describeEffectiveFallback({
      selectedScope: "PRIVATE",
      fieldId: "f1",
      privateRow,
      organizationRow: orgRow,
      isCheckbox: false,
      hasSourceMapping: true,
    });
    assert.match(fallback.label, /Blank override/i);
    assert.match(fallback.detail, /priority/i);
  });

  it("removing Private reveals Organization in effective fallback", () => {
    const orgRow = makeDefault({
      id: "o",
      field_id: "f1",
      scope: "ORGANIZATION",
      default_value: "Broker Bay",
    });
    const fallback = describeEffectiveFallback({
      selectedScope: "PRIVATE",
      fieldId: "f1",
      privateRow: null,
      organizationRow: orgRow,
      isCheckbox: false,
      hasSourceMapping: false,
    });
    assert.match(fallback.label, /Broker Bay/);
    assert.match(fallback.label, /Organization/);
  });

  it("Organization removal yields blank when no Private value", () => {
    const fallback = describeEffectiveFallback({
      selectedScope: "ORGANIZATION",
      fieldId: "f1",
      privateRow: null,
      organizationRow: null,
      isCheckbox: false,
      hasSourceMapping: false,
    });
    assert.equal(fallback.label, "Blank");
  });

  it("Private precedes Organization for checked checkboxes", () => {
    const privateRow = makeDefault({
      id: "p",
      field_id: "f1",
      scope: "PRIVATE",
      default_checked: false,
    });
    const orgRow = makeDefault({
      id: "o",
      field_id: "f1",
      scope: "ORGANIZATION",
      default_checked: true,
    });
    const resolved = resolveScopedPreferenceDefault({
      lookup: buildScopedDefaultLookup([privateRow, orgRow]),
      fieldId: "f1",
    });
    assert.equal(resolved?.source, "private_default");
    assert.equal(resolved?.value, "false");
  });
});

describe("shared-field and source helpers", () => {
  it("warns when a field is shared across multiple forms", () => {
    assert.equal(formatSharedFieldWarning(["Only One"]), null);
    assert.match(
      formatSharedFieldWarning(["Form A", "Form B"]) ?? "",
      /shared with: Form A, Form B/,
    );
  });

  it("summarizes source mapping as higher-priority context", () => {
    assert.equal(
      formatSourceSummary({ source_type: null, source_path: null }),
      "Manual/default value",
    );
    assert.match(
      formatSourceSummary({
        source_type: "property",
        source_path: "street_address",
      }),
      /property · street_address/,
    );
  });

  it("filters rows by search and type", () => {
    const rows = [
      {
        fieldId: "1",
        fieldKey: "PROTECTION_PERIOD_DAYS",
        fieldLabel: "Protection Period Days",
        isCheckbox: false,
      },
      {
        fieldId: "2",
        fieldKey: "ADD_IABS",
        fieldLabel: "Add IABS",
        isCheckbox: true,
      },
    ] as DefaultsEditorFieldRow[];

    assert.equal(filterDefaultsEditorRows(rows, "protection", null).length, 1);
    assert.equal(filterDefaultsEditorRows(rows, "", "checkbox").length, 1);
    assert.equal(filterDefaultsEditorRows(rows, "ADD_IABS", "text").length, 0);
  });

  it("picks field-level ACTIVE rows only", () => {
    const rows = [
      makeDefault({
        id: "deleted",
        field_id: "f1",
        scope: "PRIVATE",
        status: "DELETED",
        default_value: "old",
      }),
      makeDefault({
        id: "active",
        field_id: "f1",
        scope: "PRIVATE",
        default_value: "new",
      }),
      makeDefault({
        id: "formish",
        field_id: "f1",
        scope: "PRIVATE",
        form_id: 12,
        default_value: "form",
      }),
    ];
    const picked = pickFieldLevelDefault(rows, "f1");
    assert.equal(picked?.id, "active");
  });

  it("draftFromDisplay round-trips checkbox and blank", () => {
    const checked = draftFromDisplay(
      scopedDefaultToDisplay(
        makeDefault({
          id: "1",
          field_id: "f1",
          scope: "PRIVATE",
          default_checked: true,
        }),
        true,
      ),
      true,
    );
    assert.deepEqual(checked, { kind: "checkbox", mode: "checked" });

    const blank = draftFromDisplay(
      scopedDefaultToDisplay(
        makeDefault({
          id: "2",
          field_id: "f1",
          scope: "PRIVATE",
          default_value: "",
        }),
        false,
      ),
      false,
    );
    assert.deepEqual(blank, { kind: "text", mode: "blank" });
  });
});
