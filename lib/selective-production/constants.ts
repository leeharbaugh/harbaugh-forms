/**
 * Approved selective production migration constants and ID sets.
 * Source of truth for tooling; must match PRODUCTION_DATA_SELECTION_MANIFEST.json.
 */

export const DEV_PROJECT_REF = "ewxsxwzezhkeawnjvigx";
export const DEV_PROJECT_URL = "https://ewxsxwzezhkeawnjvigx.supabase.co";

/** Production Supabase project (harbaugh-forms-prod). */
export const PROD_PROJECT_REF = "eetonalyyyssvkyfdoxh";
export const PROD_PROJECT_URL = "https://eetonalyyyssvkyfdoxh.supabase.co";

export const LEE_AUTH_UUID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";
export const LEE_AUTH_EMAIL = "lee@leeharbaugh.com";
export const LEE_IDENTITY_ID = "b1c72b22-2835-44d9-afd4-294fc21d1ca5";

export const YAHOO_AUTH_UUID = "8d10af59-f3f8-4a48-94b5-3477656c02a6";

export const DGR_ORGANIZATION_ID = "b788f525-53f4-42ed-b5a1-cb741398a974";
export const LEE_ORG_MEMBERSHIP_ID = "bbeff129-afd3-4c79-bef3-36df38ac0c31";

export const APPROVED_FORM_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
] as const;

export const EXCLUDED_FORM_IDS = [21, 22, 23] as const;

export const APPROVED_COLLECTION_IDS = [1, 2, 3, 5] as const;
export const EXCLUDED_COLLECTION_IDS = [4, 7, 9, 12, 14] as const;

export const APPROVED_CONTACT_IDS = [2, 3, 4, 6] as const;
export const APPROVED_PROPERTY_IDS = [1, 3] as const;
export const APPROVED_PACKET_IDS = [2, 5] as const;

/** Packet 2 ACTIVE forms */
export const PACKET_2_ACTIVE_FORM_IDS = [7, 8, 9, 10, 11, 12] as const;
/** Packet 2 DELETED historical forms — must migrate with DELETED status */
export const PACKET_2_DELETED_FORM_IDS = [25, 26] as const;
export const PACKET_2_PACKET_FORM_IDS = [
  ...PACKET_2_ACTIVE_FORM_IDS,
  ...PACKET_2_DELETED_FORM_IDS,
] as const;

export const PACKET_5_PACKET_FORM_IDS = [27, 28, 29, 30] as const;

export const PACKET_2_FIELD_INSTANCE_COUNT = 65;
export const PACKET_5_FIELD_INSTANCE_COUNT = 107;
export const PACKET_5_OVERRIDE_COUNT = 16;
export const DEV_FIELD_INSTANCE_TOTAL = 1501;

/** Recalculated ACTIVE approved defaults after excluding forms 21–23 (none were form-scoped to those). */
export const APPROVED_DEFAULT_COUNT = 101;
export const APPROVED_DEFAULT_BREAKDOWN = {
  leePersonalAllForms: 56,
  leePersonalFormSpecific: 41,
  dgrOrganizationAllForms: 4,
} as const;

export const FORM_TEMPLATES_BUCKET = "form-templates";
export const GENERATED_DOCUMENTS_BUCKET = "generated-documents";

export const GLOBAL_FORM_PDF_PATHS = APPROVED_FORM_IDS.map(
  (id) => `global/forms/${id}/`,
);

export const EXCLUDED_FORM_PDF_PATH_MARKERS = [
  "global/forms/21/",
  "global/forms/22/",
  "global/forms/23/",
  `users/${YAHOO_AUTH_UUID}/forms/21/`,
] as const;

/** Public-schema insertion order for selective import (FK-safe). */
export const PUBLIC_INSERTION_ORDER = [
  "organizations",
  "profiles",
  "organization_members",
  "user_agent_settings",
  "brokerage_settings",
  "user_preferences",
  "field_resolvers",
  "fields",
  "forms",
  "form_field_mappings",
  "acroform_field_mapping_memory",
  "field_defaults",
  "collections",
  "collection_forms",
  "contacts",
  "properties",
  "property_hoas",
  "representation_agreements",
  "representation_agreement_clients",
  "buyer_rep_details",
  "packets",
  "packet_contacts",
  "packet_forms",
  "field_instances",
  "field_instance_mappings",
] as const;

export type ApprovedFormId = (typeof APPROVED_FORM_IDS)[number];
export type ExcludedFormId = (typeof EXCLUDED_FORM_IDS)[number];
export type ApprovedCollectionId = (typeof APPROVED_COLLECTION_IDS)[number];
