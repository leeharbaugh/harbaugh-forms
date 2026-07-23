/**
 * Pure reconciliation planning for selective production public-data import.
 * Compares export rows against target snapshots and the approved manifest.
 */

import {
  APPROVED_COLLECTION_IDS,
  APPROVED_CONTACT_IDS,
  APPROVED_FORM_IDS,
  APPROVED_PACKET_IDS,
  EXCLUDED_COLLECTION_IDS,
  EXCLUDED_FORM_IDS,
} from "./constants.ts";
import type { ProductionSelectionManifest } from "./manifest.ts";

export type ReconciliationAction = "insert" | "update" | "retain" | "remove";

export type ReconciliationItem = {
  table: string;
  id: string | number;
  action: ReconciliationAction;
  reason?: string;
};

export type TargetSnapshots = {
  fieldDefaults: Array<{ id: string; status: string }>;
  contacts: Array<{ id: number }>;
  collections: Array<{ id: number; status?: string }>;
  packets?: Array<{ id: number; status?: string }>;
  forms?: Array<{ id: number; status?: string }>;
  representationAgreementClients?: Array<{
    id: number;
    contact_id: number;
  }>;
  fields?: Array<{ id: string; field_key: string; scope?: string; status?: string }>;
};

export type ReconciliationPlan = {
  inserts: ReconciliationItem[];
  updates: ReconciliationItem[];
  retains: ReconciliationItem[];
  removes: ReconciliationItem[];
};

/** Stable logical key helpers useful for defaults / fields conflict detection. */
export function defaultLogicalKey(row: {
  id?: string | number;
  field_id?: string | null;
  form_id?: number | null;
  scope?: string | null;
  owner_user_id?: string | null;
  organization_id?: string | null;
}): string {
  if (row.id != null) return `id:${String(row.id)}`;
  return [
    row.scope ?? "",
    row.owner_user_id ?? "",
    row.organization_id ?? "",
    row.field_id ?? "",
    row.form_id == null ? "" : String(row.form_id),
  ].join("|");
}

export function fieldKeyLogicalKey(fieldKey: string, scope = "GLOBAL"): string {
  return `${scope}:${String(fieldKey).trim().toLowerCase()}`;
}

/**
 * Target ACTIVE GLOBAL fields whose lower(field_key) collides with an incoming
 * field id set but whose id is not in the incoming export — soft-delete these
 * before upsert to satisfy fields_global_field_key_active_uidx.
 */
export function planConflictingGlobalFieldSoftDeletes(
  incomingFields: Array<{ id: string | number; field_key: string; scope?: string | null }>,
  targetActiveGlobalFields: Array<{ id: string; field_key: string }>,
): ReconciliationItem[] {
  const incomingIds = new Set(incomingFields.map((f) => String(f.id)));
  const incomingKeys = new Set(
    incomingFields
      .filter((f) => (f.scope ?? "GLOBAL") === "GLOBAL")
      .map((f) => String(f.field_key).trim().toLowerCase()),
  );

  const removes: ReconciliationItem[] = [];
  for (const t of targetActiveGlobalFields) {
    const key = String(t.field_key).trim().toLowerCase();
    if (!incomingKeys.has(key)) continue;
    if (incomingIds.has(String(t.id))) continue;
    removes.push({
      table: "fields",
      id: t.id,
      action: "remove",
      reason: `ACTIVE GLOBAL field_key conflict on lower(${key})`,
    });
  }
  return removes;
}

function classifyById(
  table: string,
  exportIds: Array<string | number>,
  targetIds: Set<string>,
  reasonInsert: string,
  reasonUpdate: string,
): Pick<ReconciliationPlan, "inserts" | "updates" | "retains"> {
  const inserts: ReconciliationItem[] = [];
  const updates: ReconciliationItem[] = [];
  const retains: ReconciliationItem[] = [];
  for (const id of exportIds) {
    const key = String(id);
    if (targetIds.has(key)) {
      updates.push({ table, id, action: "update", reason: reasonUpdate });
    } else {
      inserts.push({ table, id, action: "insert", reason: reasonInsert });
    }
  }
  return { inserts, updates, retains };
}

/**
 * Plan inserts / updates / retains / removes for scaffold reconciliation.
 * Focused on defaults, contacts, collections, packets, forms, and field conflicts.
 */
export function planReconciliation(
  exportTables: Record<string, Record<string, unknown>[]>,
  targetSnapshots: TargetSnapshots,
  manifest: ProductionSelectionManifest,
): ReconciliationPlan {
  const approvedDefaultIds = new Set(manifest.defaults.map((d) => String(d.id)));
  const inserts: ReconciliationItem[] = [];
  const updates: ReconciliationItem[] = [];
  const retains: ReconciliationItem[] = [];
  const removes: ReconciliationItem[] = [];

  // --- field_defaults: upsert approved; soft-delete other ACTIVE ---
  const exportDefaults = exportTables.field_defaults || [];
  const targetDefaultById = new Map(
    targetSnapshots.fieldDefaults.map((d) => [String(d.id), d]),
  );
  for (const row of exportDefaults) {
    const id = String(row.id);
    if (!approvedDefaultIds.has(id)) continue;
    const existing = targetDefaultById.get(id);
    if (!existing) {
      inserts.push({
        table: "field_defaults",
        id,
        action: "insert",
        reason: "approved default missing on target",
      });
    } else {
      updates.push({
        table: "field_defaults",
        id,
        action: "update",
        reason: "upsert approved default",
      });
    }
  }
  for (const t of targetSnapshots.fieldDefaults) {
    if (t.status !== "ACTIVE") continue;
    if (approvedDefaultIds.has(String(t.id))) continue;
    removes.push({
      table: "field_defaults",
      id: t.id,
      action: "remove",
      reason: "ACTIVE default not in approved manifest set",
    });
  }

  // --- contacts: upsert approved; remove scaffold contact 1 / non-approved ---
  const exportContacts = (exportTables.contacts || []).map((r) => Number(r.id));
  const contactClassify = classifyById(
    "contacts",
    exportContacts,
    new Set(targetSnapshots.contacts.map((c) => String(c.id))),
    "approved contact missing",
    "upsert approved contact",
  );
  inserts.push(...contactClassify.inserts);
  updates.push(...contactClassify.updates);

  const approvedContacts = new Set(
    (APPROVED_CONTACT_IDS as readonly number[]).map(String),
  );
  for (const c of targetSnapshots.contacts) {
    if (approvedContacts.has(String(c.id))) continue;
    removes.push({
      table: "contacts",
      id: c.id,
      action: "remove",
      reason:
        c.id === 1
          ? "remove scaffold contact 1 after approved clients exist"
          : "contact not in approved set 2,3,4,6",
    });
  }

  // --- representation_agreement_clients pointing at contact 1 ---
  for (const rac of targetSnapshots.representationAgreementClients || []) {
    if (rac.contact_id === 1) {
      removes.push({
        table: "representation_agreement_clients",
        id: rac.id,
        action: "remove",
        reason: "client link to scaffold contact 1",
      });
    }
  }

  // --- collections: upsert 1,2,3,5; remove excluded (esp. 4 Test Packet) ---
  const exportCollections = (exportTables.collections || []).map((r) => Number(r.id));
  const collectionClassify = classifyById(
    "collections",
    exportCollections,
    new Set(targetSnapshots.collections.map((c) => String(c.id))),
    "approved collection missing",
    "upsert approved collection",
  );
  inserts.push(...collectionClassify.inserts);
  updates.push(...collectionClassify.updates);

  const approvedCollections = new Set(
    (APPROVED_COLLECTION_IDS as readonly number[]).map(String),
  );
  const excludedCollections = new Set(
    (EXCLUDED_COLLECTION_IDS as readonly number[]).map(Number),
  );
  for (const c of targetSnapshots.collections) {
    if (approvedCollections.has(String(c.id))) continue;
    if (excludedCollections.has(c.id) || !approvedCollections.has(String(c.id))) {
      removes.push({
        table: "collections",
        id: c.id,
        action: "remove",
        reason:
          c.id === 4
            ? "remove excluded Test Packet collection 4"
            : `excluded/non-approved collection ${c.id}`,
      });
    }
  }

  // --- packets: only 2,5 ---
  const exportPackets = (exportTables.packets || []).map((r) => Number(r.id));
  const packetClassify = classifyById(
    "packets",
    exportPackets,
    new Set((targetSnapshots.packets || []).map((p) => String(p.id))),
    "approved packet missing",
    "upsert approved packet",
  );
  inserts.push(...packetClassify.inserts);
  updates.push(...packetClassify.updates);
  const approvedPackets = new Set((APPROVED_PACKET_IDS as readonly number[]).map(String));
  for (const p of targetSnapshots.packets || []) {
    if (approvedPackets.has(String(p.id))) continue;
    removes.push({
      table: "packets",
      id: p.id,
      action: "remove",
      reason: "packet not in approved set 2,5",
    });
  }

  // --- forms: upsert 1-18; soft-delete 21-23 ---
  const exportForms = (exportTables.forms || []).map((r) => Number(r.id));
  const formClassify = classifyById(
    "forms",
    exportForms,
    new Set((targetSnapshots.forms || []).map((f) => String(f.id))),
    "approved form missing",
    "upsert approved form",
  );
  inserts.push(...formClassify.inserts);
  updates.push(...formClassify.updates);
  const approvedForms = new Set((APPROVED_FORM_IDS as readonly number[]).map(String));
  const excludedForms = new Set((EXCLUDED_FORM_IDS as readonly number[]).map(Number));
  for (const f of targetSnapshots.forms || []) {
    if (approvedForms.has(String(f.id))) continue;
    if (excludedForms.has(f.id)) {
      removes.push({
        table: "forms",
        id: f.id,
        action: "remove",
        reason: `soft-delete excluded form ${f.id}`,
      });
    }
  }

  // --- conflicting GLOBAL fields ---
  const exportFields = (exportTables.fields || []) as Array<{
    id: string | number;
    field_key: string;
    scope?: string | null;
  }>;
  const targetGlobal = (targetSnapshots.fields || [])
    .filter((f) => (f.status ?? "ACTIVE") === "ACTIVE" && (f.scope ?? "GLOBAL") === "GLOBAL")
    .map((f) => ({ id: f.id, field_key: f.field_key }));
  removes.push(...planConflictingGlobalFieldSoftDeletes(exportFields, targetGlobal));

  return { inserts, updates, retains, removes };
}

export function summarizeReconciliationPlan(plan: ReconciliationPlan): {
  inserts: number;
  updates: number;
  retains: number;
  removes: number;
  removesByTable: Record<string, number>;
} {
  const removesByTable: Record<string, number> = {};
  for (const r of plan.removes) {
    removesByTable[r.table] = (removesByTable[r.table] || 0) + 1;
  }
  return {
    inserts: plan.inserts.length,
    updates: plan.updates.length,
    retains: plan.retains.length,
    removes: plan.removes.length,
    removesByTable,
  };
}
