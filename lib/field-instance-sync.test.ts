import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fieldInstanceSyncWouldWrite,
  planFieldInstanceSyncMutations,
  shouldRefreshNonOverrideInstance,
  type SyncExistingFieldInstance,
  type SyncResolvedFieldValue,
} from "./field-instance-sync.ts";

const LISTING_EXCLUSIONS_FIELD_ID = "4861d3dd-ad35-4a65-827b-a6266486f7da";
const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";
const ADMIN_USER_ID = "admin-viewer-id";

function existing(
  overrides: Partial<SyncExistingFieldInstance> &
    Pick<SyncExistingFieldInstance, "id" | "field_id">,
): SyncExistingFieldInstance {
  return {
    value: null,
    value_json: null,
    source: "field_default",
    is_override: false,
    update_date: "2026-06-24T21:52:28.378083+00:00",
    ...overrides,
  };
}

function resolved(
  overrides: Partial<SyncResolvedFieldValue> &
    Pick<SyncResolvedFieldValue, "value" | "source">,
): SyncResolvedFieldValue {
  return {
    value_json: null,
    ...overrides,
  };
}

describe("shouldRefreshNonOverrideInstance", () => {
  it("never refreshes manual overrides", () => {
    assert.equal(
      shouldRefreshNonOverrideInstance(
        existing({
          id: "1",
          field_id: "f1",
          value: "NA",
          is_override: true,
        }),
        resolved({ value: "", source: "empty" }),
      ),
      false,
    );
  });

  it("detects value drift for non-overrides", () => {
    assert.equal(
      shouldRefreshNonOverrideInstance(
        existing({
          id: "1",
          field_id: "f1",
          value: "NA",
          source: "field_default",
        }),
        resolved({ value: "", source: "empty" }),
      ),
      true,
    );
  });
});

describe("planFieldInstanceSyncMutations ensure_missing (ordinary open)", () => {
  it("keeps existing non-override NA when resolver returns empty (Abbas / LISTING_EXCLUSIONS)", () => {
    const storedUpdateDate = "2026-06-24T21:52:28.378083+00:00";
    const instance = existing({
      id: "d0dba3e6-4a38-43a2-9180-e16dce446a3f",
      field_id: LISTING_EXCLUSIONS_FIELD_ID,
      value: "NA",
      source: "field_default",
      update_date: storedUpdateDate,
    });

    let resolveCalls = 0;
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: [LISTING_EXCLUSIONS_FIELD_ID],
      existingByFieldId: new Map([
        [LISTING_EXCLUSIONS_FIELD_ID, instance],
      ]),
      resolveForFieldId: () => {
        resolveCalls += 1;
        return resolved({ value: "", source: "empty" });
      },
    });

    assert.equal(plan.updates.length, 0);
    assert.equal(plan.inserts.length, 0);
    assert.equal(fieldInstanceSyncWouldWrite(plan), false);
    // Ordinary open must not even re-resolve sticky rows for mutation.
    assert.equal(resolveCalls, 0);
    assert.equal(instance.value, "NA");
    assert.equal(instance.update_date, storedUpdateDate);
  });

  it("keeps existing non-override zero when resolver returns empty", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["money"],
      existingByFieldId: new Map([
        [
          "money",
          existing({
            id: "m1",
            field_id: "money",
            value: "0",
            source: "field_default",
          }),
        ],
      ]),
      resolveForFieldId: () => resolved({ value: "", source: "empty" }),
    });
    assert.equal(plan.updates.length, 0);
    assert.equal(fieldInstanceSyncWouldWrite(plan), false);
  });

  it("keeps existing non-override false when resolver returns null/other", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["cb"],
      existingByFieldId: new Map([
        [
          "cb",
          existing({
            id: "c1",
            field_id: "cb",
            value: "false",
            value_json: { checked: false },
            source: "empty",
          }),
        ],
      ]),
      resolveForFieldId: () =>
        resolved({
          value: "true",
          value_json: { checked: true },
          source: "private_default",
        }),
    });
    assert.equal(plan.updates.length, 0);
  });

  it("keeps an existing stored blank even if a new default now exists", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["blank"],
      existingByFieldId: new Map([
        [
          "blank",
          existing({
            id: "b1",
            field_id: "blank",
            value: null,
            source: "empty",
          }),
        ],
      ]),
      resolveForFieldId: () =>
        resolved({ value: "Broker Bay", source: "organization_default" }),
    });
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.inserts.length, 0);
  });

  it("keeps an existing mapped value when its source record would resolve differently", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["mapped"],
      existingByFieldId: new Map([
        [
          "mapped",
          existing({
            id: "map1",
            field_id: "mapped",
            value: "Dallas",
            source: "property",
          }),
        ],
      ]),
      resolveForFieldId: () =>
        resolved({ value: "Fort Worth", source: "property" }),
    });
    assert.equal(plan.updates.length, 0);
  });

  it("keeps a manual override unchanged", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["ov"],
      existingByFieldId: new Map([
        [
          "ov",
          existing({
            id: "o1",
            field_id: "ov",
            value: "Custom",
            source: "manual_override",
            is_override: true,
          }),
        ],
      ]),
      resolveForFieldId: () => resolved({ value: "NA", source: "empty" }),
    });
    assert.equal(plan.updates.length, 0);
  });

  it("does not change UPDATE_DATE because it plans no updates on repeated open", () => {
    const instance = existing({
      id: "sticky",
      field_id: "f1",
      value: "NA",
      update_date: "2026-07-10T20:41:10.817546+00:00",
    });
    const plan1 = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["f1"],
      existingByFieldId: new Map([["f1", instance]]),
      resolveForFieldId: () => resolved({ value: "", source: "empty" }),
    });
    const plan2 = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["f1"],
      existingByFieldId: new Map([["f1", instance]]),
      resolveForFieldId: () => resolved({ value: "", source: "empty" }),
    });
    assert.equal(fieldInstanceSyncWouldWrite(plan1), false);
    assert.equal(fieldInstanceSyncWouldWrite(plan2), false);
    assert.equal(plan1.updates.length, 0);
    assert.equal(plan2.updates.length, 0);
  });

  it("inserts a missing instance using the packet-owner resolution result", () => {
    let resolvedFor: string | null = null;
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["new-field"],
      existingByFieldId: new Map(),
      resolveForFieldId: (fieldId) => {
        resolvedFor = fieldId;
        // Simulates packet-owner Private default, not viewing admin.
        assert.notEqual(LEE_USER_ID, ADMIN_USER_ID);
        return resolved({
          value: "DFW Metro",
          source: "private_default",
        });
      },
    });

    assert.equal(resolvedFor, "new-field");
    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.inserts[0]?.resolved.value, "DFW Metro");
    assert.equal(plan.inserts[0]?.resolved.source, "private_default");
    assert.equal(fieldInstanceSyncWouldWrite(plan), true);
  });

  it("is idempotent: second ensure_missing after insert plans no writes", () => {
    const afterInsert = existing({
      id: "created",
      field_id: "new-field",
      value: "DFW Metro",
      source: "private_default",
      update_date: "2026-07-17T20:00:00.000Z",
    });
    const plan = planFieldInstanceSyncMutations({
      mode: "ensure_missing",
      fieldIds: ["new-field"],
      existingByFieldId: new Map([["new-field", afterInsert]]),
      resolveForFieldId: () =>
        resolved({ value: "Something Else", source: "private_default" }),
    });
    assert.equal(fieldInstanceSyncWouldWrite(plan), false);
  });
});

describe("planFieldInstanceSyncMutations refresh_non_overrides (explicit Refresh values)", () => {
  it("updates non-override NA when resolver now returns empty", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "refresh_non_overrides",
      fieldIds: [LISTING_EXCLUSIONS_FIELD_ID],
      existingByFieldId: new Map([
        [
          LISTING_EXCLUSIONS_FIELD_ID,
          existing({
            id: "d0dba3e6-4a38-43a2-9180-e16dce446a3f",
            field_id: LISTING_EXCLUSIONS_FIELD_ID,
            value: "NA",
            source: "field_default",
          }),
        ],
      ]),
      resolveForFieldId: () => resolved({ value: "", source: "empty" }),
    });
    assert.equal(plan.updates.length, 1);
    assert.equal(plan.updates[0]?.resolved.source, "empty");
  });

  it("does not update manual overrides on refresh", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "refresh_non_overrides",
      fieldIds: ["ov"],
      existingByFieldId: new Map([
        [
          "ov",
          existing({
            id: "o1",
            field_id: "ov",
            value: "Custom",
            is_override: true,
            source: "manual_override",
          }),
        ],
      ]),
      resolveForFieldId: () => resolved({ value: "NA", source: "empty" }),
    });
    assert.equal(plan.updates.length, 0);
  });

  it("still inserts missing fields during refresh", () => {
    const plan = planFieldInstanceSyncMutations({
      mode: "refresh_non_overrides",
      fieldIds: ["missing"],
      existingByFieldId: new Map(),
      resolveForFieldId: () =>
        resolved({ value: "30", source: "private_default" }),
    });
    assert.equal(plan.inserts.length, 1);
    assert.equal(plan.updates.length, 0);
  });
});

/**
 * Mirrors the production default for ordinary editor/download load paths:
 * ensureFieldInstancesForPacketForm → sync(..., { mode: "ensure_missing" }).
 */
describe("ordinary open sync contract", () => {
  it("ordinary open mode never plans field-instance UPDATEs", () => {
    const cases: Array<{
      label: string;
      value: string | null;
      value_json: Record<string, unknown> | null;
      source: string;
      is_override: boolean;
      next: SyncResolvedFieldValue;
    }> = [
      {
        label: "NA",
        value: "NA",
        value_json: null,
        source: "field_default",
        is_override: false,
        next: resolved({ value: "", source: "empty" }),
      },
      {
        label: "zero",
        value: "0",
        value_json: null,
        source: "field_default",
        is_override: false,
        next: resolved({ value: "", source: "empty" }),
      },
      {
        label: "false",
        value: "false",
        value_json: { checked: false },
        source: "empty",
        is_override: false,
        next: resolved({
          value: "true",
          value_json: { checked: true },
          source: "private_default",
        }),
      },
      {
        label: "blank",
        value: null,
        value_json: null,
        source: "empty",
        is_override: false,
        next: resolved({ value: "NA", source: "private_default" }),
      },
      {
        label: "override",
        value: "Kept",
        value_json: null,
        source: "manual_override",
        is_override: true,
        next: resolved({ value: "Changed", source: "empty" }),
      },
    ];

    for (const row of cases) {
      const plan = planFieldInstanceSyncMutations({
        mode: "ensure_missing",
        fieldIds: ["f"],
        existingByFieldId: new Map([
          [
            "f",
            existing({
              id: "id",
              field_id: "f",
              value: row.value,
              value_json: row.value_json,
              source: row.source,
              is_override: row.is_override,
            }),
          ],
        ]),
        resolveForFieldId: () => row.next,
      });
      assert.equal(
        plan.updates.length,
        0,
        `ordinary open must not update existing ${row.label}`,
      );
    }
  });
});
