import {
  APPROVED_COLLECTION_IDS,
  APPROVED_CONTACT_IDS,
  APPROVED_FORM_IDS,
  APPROVED_PACKET_IDS,
  APPROVED_PROPERTY_IDS,
  DGR_ORGANIZATION_ID,
  EXCLUDED_COLLECTION_IDS,
  EXCLUDED_FORM_IDS,
  LEE_AUTH_UUID,
  LEE_ORG_MEMBERSHIP_ID,
  PACKET_2_DELETED_FORM_IDS,
  PACKET_2_PACKET_FORM_IDS,
  PACKET_5_PACKET_FORM_IDS,
  PUBLIC_INSERTION_ORDER,
} from "./constants.ts";
import type { ProductionSelectionManifest } from "./manifest.ts";
import { SelectiveMigrationSafetyError } from "./safety.ts";

export type RowAction = "create" | "skip" | "conflict" | "fail";

export type ImportRowResult = {
  table: string;
  id: string | number;
  action: RowAction;
  reason?: string;
};

export type SequenceReset = {
  table: string;
  sequence: string;
  setTo: number;
};

/** Tables keyed by approved ID lists from the manifest / constants. */
export const SELECTIVE_TABLE_FILTERS: Record<
  string,
  { idColumn: string; approvedIds: readonly (string | number)[] } | { allApprovedRows: true } | null
> = {
  organizations: { idColumn: "id", approvedIds: [] }, // filled from manifest
  profiles: { idColumn: "id", approvedIds: [] },
  organization_members: { idColumn: "id", approvedIds: [] },
  user_agent_settings: { allApprovedRows: true },
  brokerage_settings: { allApprovedRows: true },
  user_preferences: { allApprovedRows: true },
  field_resolvers: { allApprovedRows: true },
  fields: { allApprovedRows: true }, // filtered: exclude exclusive to forms 21-23 (none)
  forms: { idColumn: "id", approvedIds: APPROVED_FORM_IDS },
  form_field_mappings: { allApprovedRows: true }, // filter by form_id in 1-18
  acroform_field_mapping_memory: { allApprovedRows: true },
  field_defaults: { allApprovedRows: true }, // filter ACTIVE approved from manifest
  collections: { idColumn: "id", approvedIds: APPROVED_COLLECTION_IDS },
  collection_forms: { allApprovedRows: true }, // filter by collection_id
  contacts: { idColumn: "id", approvedIds: APPROVED_CONTACT_IDS },
  properties: { idColumn: "id", approvedIds: APPROVED_PROPERTY_IDS },
  property_hoas: { allApprovedRows: true }, // none for approved props
  representation_agreements: { idColumn: "id", approvedIds: [1] },
  representation_agreement_clients: { allApprovedRows: true },
  buyer_rep_details: { allApprovedRows: true },
  packets: { idColumn: "id", approvedIds: APPROVED_PACKET_IDS },
  packet_contacts: { allApprovedRows: true },
  packet_forms: {
    idColumn: "id",
    approvedIds: [...PACKET_2_PACKET_FORM_IDS, ...PACKET_5_PACKET_FORM_IDS],
  },
  field_instances: { allApprovedRows: true }, // filter by packet_id and/or packet_form_id
  field_instance_mappings: { allApprovedRows: true },
};

/** Approved packet_form ids for packets 2 and 5 (ACTIVE + DELETED historical). */
export const APPROVED_PACKET_FORM_IDS: readonly number[] = [
  ...PACKET_2_PACKET_FORM_IDS,
  ...PACKET_5_PACKET_FORM_IDS,
];

export function isApprovedFieldInstanceRow(row: Record<string, unknown>): boolean {
  const packetId = row.packet_id == null ? null : Number(row.packet_id);
  const packetFormId = row.packet_form_id == null ? null : Number(row.packet_form_id);
  if (
    packetId != null &&
    (APPROVED_PACKET_IDS as readonly number[]).includes(packetId)
  ) {
    return true;
  }
  if (
    packetFormId != null &&
    (APPROVED_PACKET_FORM_IDS as readonly number[]).includes(packetFormId)
  ) {
    return true;
  }
  return false;
}

export function getInsertionOrder(): readonly string[] {
  return PUBLIC_INSERTION_ORDER;
}

export function assertRowAllowed(
  table: string,
  row: Record<string, unknown>,
  manifest: ProductionSelectionManifest,
): void {
  if (table === "forms") {
    const id = Number(row.id);
    if ((EXCLUDED_FORM_IDS as readonly number[]).includes(id)) {
      throw new SelectiveMigrationSafetyError(`Refusing to import excluded form ${id}.`);
    }
    if (!(APPROVED_FORM_IDS as readonly number[]).includes(id)) {
      throw new SelectiveMigrationSafetyError(`Form ${id} is not in the approved set 1–18.`);
    }
  }
  if (table === "collections") {
    const id = Number(row.id);
    if ((EXCLUDED_COLLECTION_IDS as readonly number[]).includes(id)) {
      throw new SelectiveMigrationSafetyError(`Refusing to import excluded collection ${id}.`);
    }
  }
  if (table === "packets") {
    const id = Number(row.id);
    if (!(APPROVED_PACKET_IDS as readonly number[]).includes(id)) {
      throw new SelectiveMigrationSafetyError(`Packet ${id} is not approved.`);
    }
  }
  if (table === "packet_forms") {
    const id = Number(row.id);
    const formId = row.form_id == null ? null : Number(row.form_id);
    if (formId != null && (EXCLUDED_FORM_IDS as readonly number[]).includes(formId)) {
      throw new SelectiveMigrationSafetyError(
        `Packet form ${id} depends on excluded form ${formId}.`,
      );
    }
    if ((PACKET_2_DELETED_FORM_IDS as readonly number[]).includes(id)) {
      if (row.status !== "DELETED") {
        throw new SelectiveMigrationSafetyError(
          `Packet form ${id} must remain DELETED (got ${String(row.status)}).`,
        );
      }
    }
  }
  if (table === "field_defaults") {
    const formId = row.form_id == null ? null : Number(row.form_id);
    if (formId != null && (EXCLUDED_FORM_IDS as readonly number[]).includes(formId)) {
      throw new SelectiveMigrationSafetyError(
        `Default references excluded form ${formId}.`,
      );
    }
    const approvedIds = new Set(manifest.defaults.map((d) => String(d.id)));
    if (!approvedIds.has(String(row.id))) {
      throw new SelectiveMigrationSafetyError(`Default ${String(row.id)} not in approved manifest.`);
    }
  }
  if (table === "form_field_mappings") {
    const formId = Number(row.form_id);
    if ((EXCLUDED_FORM_IDS as readonly number[]).includes(formId)) {
      throw new SelectiveMigrationSafetyError(`Mapping for excluded form ${formId}.`);
    }
  }
}

export function filterRowsForTable(
  table: string,
  rows: Record<string, unknown>[],
  manifest: ProductionSelectionManifest,
): Record<string, unknown>[] {
  switch (table) {
    case "organizations":
      return rows.filter((r) => String(r.id) === DGR_ORGANIZATION_ID);
    case "profiles":
      return rows.filter((r) => String(r.id) === LEE_AUTH_UUID);
    case "organization_members":
      return rows.filter((r) => String(r.id) === LEE_ORG_MEMBERSHIP_ID);
    case "user_agent_settings":
    case "user_preferences":
      return rows.filter((r) => String(r.user_id) === LEE_AUTH_UUID);
    case "forms":
      return rows.filter((r) =>
        (APPROVED_FORM_IDS as readonly number[]).includes(Number(r.id)),
      );
    case "collections":
      return rows.filter((r) =>
        (APPROVED_COLLECTION_IDS as readonly number[]).includes(Number(r.id)),
      );
    case "collection_forms":
      return rows.filter((r) =>
        (APPROVED_COLLECTION_IDS as readonly number[]).includes(Number(r.collection_id)),
      );
    case "contacts":
      return rows.filter((r) =>
        (APPROVED_CONTACT_IDS as readonly number[]).includes(Number(r.id)),
      );
    case "properties":
      return rows.filter((r) =>
        (APPROVED_PROPERTY_IDS as readonly number[]).includes(Number(r.id)),
      );
    case "representation_agreements":
      return rows.filter((r) => Number(r.id) === 1);
    case "representation_agreement_clients":
      return rows.filter(
        (r) =>
          Number(r.representation_agreement_id) === 1 &&
          (APPROVED_CONTACT_IDS as readonly number[]).includes(Number(r.contact_id)),
      );
    case "buyer_rep_details":
      return rows.filter((r) => Number(r.representation_agreement_id) === 1);
    case "packets":
      return rows.filter((r) =>
        (APPROVED_PACKET_IDS as readonly number[]).includes(Number(r.id)),
      );
    case "packet_forms":
      return rows.filter((r) =>
        (APPROVED_PACKET_FORM_IDS as readonly number[]).includes(Number(r.id)),
      );
    case "packet_contacts":
      return rows.filter((r) =>
        (APPROVED_PACKET_IDS as readonly number[]).includes(Number(r.packet_id)),
      );
    case "field_instances":
      // Schema has both packet_id and packet_form_id; keep rows for approved packets/forms.
      return rows.filter(isApprovedFieldInstanceRow);
    case "field_instance_mappings":
      return rows.filter(isApprovedFieldInstanceRow);
    case "form_field_mappings":
      return rows.filter((r) =>
        (APPROVED_FORM_IDS as readonly number[]).includes(Number(r.form_id)),
      );
    case "field_defaults": {
      const approved = new Set(manifest.defaults.map((d) => String(d.id)));
      return rows.filter((r) => approved.has(String(r.id)));
    }
    case "property_hoas":
      return rows.filter((r) =>
        (APPROVED_PROPERTY_IDS as readonly number[]).includes(Number(r.property_id)),
      );
    default:
      return rows;
  }
}

export function planSequenceResets(
  importedMaxIds: Record<string, number>,
): SequenceReset[] {
  const seqByTable: Record<string, string> = {
    contacts: "public.clients_id_seq",
    properties: "public.properties_id_seq",
    packets: "public.generated_packets_id_seq",
    packet_forms: "public.generated_documents_id_seq",
    collections: "public.packet_templates_id_seq",
    collection_forms: "public.packet_template_forms_id_seq",
    representation_agreements: "public.representation_agreements_id_seq",
    representation_agreement_clients:
      "public.representation_agreement_clients_id_seq",
    buyer_rep_details: "public.buyer_rep_details_id_seq",
    brokerage_settings: "public.brokerage_settings_id_seq",
    property_hoas: "public.property_hoas_id_seq",
    packet_contacts: "public.packet_contacts_id_seq",
    forms: "public.form_templates_id_seq",
    app_settings: "public.app_settings_id_seq",
  };

  const resets: SequenceReset[] = [];
  for (const [table, sequence] of Object.entries(seqByTable)) {
    const max = importedMaxIds[table];
    if (typeof max === "number" && Number.isFinite(max) && max > 0) {
      resets.push({ table, sequence, setTo: max });
    }
  }
  return resets;
}

export function sequenceResetSql(reset: SequenceReset): string {
  return `SELECT setval('${reset.sequence}', GREATEST(${reset.setTo}, 1), true);`;
}

export function summarizeImportResults(results: ImportRowResult[]): {
  created: number;
  skipped: number;
  conflicted: number;
  failed: number;
} {
  return {
    created: results.filter((r) => r.action === "create").length,
    skipped: results.filter((r) => r.action === "skip").length,
    conflicted: results.filter((r) => r.action === "conflict").length,
    failed: results.filter((r) => r.action === "fail").length,
  };
}

export function abortOnMissingDependency(
  dependency: string,
  present: boolean,
): void {
  if (!present) {
    throw new SelectiveMigrationSafetyError(
      `Missing required dependency: ${dependency}`,
    );
  }
}
