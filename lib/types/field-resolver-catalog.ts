/** Catalog of computed field resolvers (`field_resolvers` table). */

export type FieldResolverStatus = "ACTIVE" | "INACTIVE" | "DELETED";

export type FieldResolver = {
  id: string;
  resolver_key: string;
  friendly_name: string;
  category: string;
  description: string | null;
  example_output: string | null;
  create_date: string;
  update_date: string;
  status: string;
};

export const FIELD_RESOLVER_CATALOG_MIGRATION =
  "20250626120000_field_resolvers_catalog.sql";

export const FIELD_RESOLVER_ID_BACKFILL_MIGRATION =
  "20250626130000_fields_field_resolver_id_backfill.sql";

export const FIELD_RESOLVER_SELECT = "*";

/** Shown in Fields and PDF Field Mapping editors — prefer atomic source paths over resolvers. */
export const FIELD_VALUE_MAPPING_GUIDANCE =
  "Prefer atomic fields mapped directly to database values. Use resolver fields only when a form truly requires one combined value in a single blank.";

/** Fields catalog page subtitle (intro + mapping guidance, single paragraph). */
export const FIELDS_CATALOG_PAGE_DESCRIPTION = `Reusable business field definitions used across forms and packets. ${FIELD_VALUE_MAPPING_GUIDANCE}`;

/** Initial seed resolver keys (Migration A). */
export const SEEDED_FIELD_RESOLVER_KEYS = [
  "property_full_address",
  "property_city_state_zip",
  "property_address_street_zip",
  "agent_full_name",
  "broker_full_name",
  "buyer_1_full_name",
  "buyer_2_full_name",
  "seller_1_full_name",
  "seller_2_full_name",
  "seller_names",
  "buyer_names",
  "buyer_notice_address",
  "buyer_notice_phone",
  "buyer_notice_email",
  "seller_notice_address",
  "seller_notice_phone",
  "seller_notice_email",
] as const;

export type SeededFieldResolverKey = (typeof SEEDED_FIELD_RESOLVER_KEYS)[number];

const CATEGORY_LABELS: Record<string, string> = {
  property: "Property",
  settings: "Settings",
  contact_buyer: "Contact · Buyer",
  contact_seller: "Contact · Seller",
  contract: "Contract",
};

export function formatFieldResolverCategory(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function formatFieldResolverReference(id: string): string {
  return id.slice(0, 8);
}
