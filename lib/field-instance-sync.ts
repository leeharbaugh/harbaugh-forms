/**
 * Packet field-instance synchronization planning.
 *
 * Ordinary open/view uses `ensure_missing`: insert only; never mutate existing
 * snapshots. Explicit user "Refresh values" uses `refresh_non_overrides`.
 */

export type FieldInstanceSyncMode =
  | "ensure_missing"
  | "refresh_non_overrides";

export type SyncResolvedFieldValue = {
  value: string;
  value_json: Record<string, unknown> | null;
  source: string;
};

export type SyncExistingFieldInstance = {
  id: string;
  field_id: string;
  value: string | null;
  value_json: Record<string, unknown> | null;
  source: string | null;
  is_override: boolean;
  update_date?: string;
};

export type PlannedFieldInstanceInsert = {
  fieldId: string;
  resolved: SyncResolvedFieldValue;
};

export type PlannedFieldInstanceUpdate = {
  id: string;
  fieldId: string;
  resolved: SyncResolvedFieldValue;
};

export type FieldInstanceSyncPlan = {
  mode: FieldInstanceSyncMode;
  inserts: PlannedFieldInstanceInsert[];
  updates: PlannedFieldInstanceUpdate[];
};

/**
 * Whether an existing non-override instance should be rewritten during an
 * explicit refresh. Ordinary open never calls this for mutation decisions.
 */
export function shouldRefreshNonOverrideInstance(
  instance: SyncExistingFieldInstance,
  resolved: SyncResolvedFieldValue,
): boolean {
  if (instance.is_override) {
    return false;
  }

  const storedValue = instance.value ?? "";
  const storedSource = instance.source ?? "";
  const storedJson = JSON.stringify(instance.value_json ?? null);
  const resolvedJson = JSON.stringify(resolved.value_json ?? null);

  return (
    storedValue !== resolved.value ||
    storedSource !== resolved.source ||
    storedJson !== resolvedJson
  );
}

/**
 * Plan insert/update mutations for packet-form field instances.
 *
 * `ensure_missing` (ordinary open): inserts only; existing rows are sticky
 * including null, blank, false, zero, and source metadata.
 * `refresh_non_overrides` (explicit Refresh values): may update non-override
 * rows whose stored snapshot differs from the current resolution.
 */
export function planFieldInstanceSyncMutations(params: {
  mode: FieldInstanceSyncMode;
  fieldIds: string[];
  existingByFieldId: Map<string, SyncExistingFieldInstance>;
  /**
   * Fresh resolution for fields that need an insert, or (refresh mode only)
   * for fields that may be updated. Callers must resolve with
   * `existingInstance: null` for inserts so defaults come from the packet
   * owner context, not a viewing admin.
   */
  resolveForFieldId: (fieldId: string) => SyncResolvedFieldValue | null;
}): FieldInstanceSyncPlan {
  const inserts: PlannedFieldInstanceInsert[] = [];
  const updates: PlannedFieldInstanceUpdate[] = [];

  for (const fieldId of params.fieldIds) {
    const existing = params.existingByFieldId.get(fieldId) ?? null;

    if (existing) {
      if (params.mode === "ensure_missing") {
        // Sticky snapshot: never plan an update on ordinary open/view.
        continue;
      }

      const resolved = params.resolveForFieldId(fieldId);
      if (!resolved) {
        continue;
      }

      if (shouldRefreshNonOverrideInstance(existing, resolved)) {
        updates.push({
          id: existing.id,
          fieldId,
          resolved,
        });
      }
      continue;
    }

    const resolved = params.resolveForFieldId(fieldId);
    if (!resolved) {
      continue;
    }

    inserts.push({
      fieldId,
      resolved,
    });
  }

  return {
    mode: params.mode,
    inserts,
    updates,
  };
}

export function fieldInstanceSyncWouldWrite(
  plan: FieldInstanceSyncPlan,
): boolean {
  return plan.inserts.length > 0 || plan.updates.length > 0;
}
