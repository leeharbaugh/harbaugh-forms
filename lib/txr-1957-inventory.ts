/**
 * TXR-1957 / T-47.1 catalog inventory used by apply script and regression tests.
 * Coordinates are Map Fields PDF space: origin top-left, y downward, page 612×792.
 */
export const TXR_1957_FORM_ID = 53;
export const TXR_1957_FORM_CODE = "TXR-1957";
export const TXR_1957_VERSION_LABEL = "TXR-1957-11-1-2024";
export const TXR_1957_FORM_FAMILY_KEY = "TXR-1957";
export const TXR_1957_FORM_NAME = "T-47 In Lieu of Affidavit";
export const TXR_1957_STORAGE_PATH = "global/forms/53/T-47-not-affidavit.pdf";
export const TXR_1957_PDF_MD5 = "779f199830e4d6a470654b67d46fb93f";
export const TXR_1957_PDF_SHA256 =
  "003824479b864953e9c60fc689c6ddcc7f0fcc6306c4b23f67546384ae7a21ff";
export const TXR_1957_PDF_BYTES = 159938;
export const TXR_1957_PAGE_WIDTH = 612;
export const TXR_1957_PAGE_HEIGHT = 792;
export const TXR_1957_PAGE_COUNT = 2;

export const LEE_USER_ID = "e26c8f57-c0aa-4474-b43e-6e15f0260e99";

export const TXR_1957_REUSE_FIELDS = {
  property_legal_description: "d2a7f794-9260-406f-9f27-94fb753056eb",
  property_county: "980830bf-8d4d-4bbe-8f4d-026453594617",
  seller_name_1: "5b8880d8-04de-4e56-ac0e-7ec5c0c70f3e",
  seller_name_2: "624ccb71-0ca2-48f8-b7ba-a25f183d6f10",
} as const;

export const FORBIDDEN_SOURCE_TYPES = [
  "contract_details",
  "listing_agreement_details",
  "packet",
  "static_default",
] as const;

export const FORBIDDEN_RESOLVER_KEYS = [
  "seller_names",
  "seller_address",
  "seller_notice_address",
  "agent_full_name",
  "broker_full_name",
] as const;

export const PAGE2_CENTER_X = 305;
export const PAGE2_LEFT_MAX_RIGHT = 300;
export const PAGE2_RIGHT_MIN_LEFT = 310;

export type Txr1957SourceType =
  | "manual_only"
  | "packet_contact"
  | "packet_property";

export type Txr1957FieldDef = {
  field_key: string;
  field_label: string;
  field_data_type: "text" | "date";
  field_widget_type: "text" | "date";
  source_type: Txr1957SourceType;
  source_path: string | null;
  resolver_key: string | null;
  reuse: boolean;
  reuse_field_id?: string;
};

export type Txr1957Placement = {
  field_key: string;
  mapping_name: string;
  page_number: 1 | 2;
  x: number;
  y: number;
  width: number;
  height: number;
  font_size: number;
  is_multiline: boolean;
  mask_background: boolean;
  column?: "left" | "right";
};

const NEW_FIELDS: Txr1957FieldDef[] = [
  {
    field_key: "txr_1957_declaration_date",
    field_label: "Declaration Date",
    field_data_type: "date",
    field_widget_type: "date",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_gf_number",
    field_label: "GF Number",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant",
    field_label: "Declarant",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_survey_date",
    field_label: "Date of Survey",
    field_data_type: "date",
    field_widget_type: "date",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_survey_changes_exceptions",
    field_label: "Survey Changes / Exceptions",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_1_dob",
    field_label: "Declarant 1 Date of Birth",
    field_data_type: "date",
    field_widget_type: "date",
    source_type: "packet_contact",
    source_path: "seller_1.date_of_birth",
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_1_address",
    field_label: "Declarant 1 Address",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_1_execution_county",
    field_label: "Declarant 1 Execution County",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_1_execution_state",
    field_label: "Declarant 1 Execution State",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_1_execution_day",
    field_label: "Declarant 1 Execution Day",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_1_execution_month",
    field_label: "Declarant 1 Execution Month",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_1_execution_year",
    field_label: "Declarant 1 Execution Year",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_2_dob",
    field_label: "Declarant 2 Date of Birth",
    field_data_type: "date",
    field_widget_type: "date",
    source_type: "packet_contact",
    source_path: "seller_2.date_of_birth",
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_2_address",
    field_label: "Declarant 2 Address",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_2_execution_county",
    field_label: "Declarant 2 Execution County",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_2_execution_state",
    field_label: "Declarant 2 Execution State",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_2_execution_day",
    field_label: "Declarant 2 Execution Day",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_2_execution_month",
    field_label: "Declarant 2 Execution Month",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
  {
    field_key: "txr_1957_declarant_2_execution_year",
    field_label: "Declarant 2 Execution Year",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "manual_only",
    source_path: null,
    resolver_key: null,
    reuse: false,
  },
];

const REUSE_FIELDS: Txr1957FieldDef[] = [
  {
    field_key: "property_legal_description",
    field_label: "Property Legal Description",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "packet_property",
    source_path: "legal_description",
    resolver_key: null,
    reuse: true,
    reuse_field_id: TXR_1957_REUSE_FIELDS.property_legal_description,
  },
  {
    field_key: "property_county",
    field_label: "Property County",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "packet_property",
    source_path: "county",
    resolver_key: null,
    reuse: true,
    reuse_field_id: TXR_1957_REUSE_FIELDS.property_county,
  },
  {
    field_key: "seller_name_1",
    field_label: "Seller Name 1",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "packet_contact",
    source_path: "seller_1.full_name",
    resolver_key: null,
    reuse: true,
    reuse_field_id: TXR_1957_REUSE_FIELDS.seller_name_1,
  },
  {
    field_key: "seller_name_2",
    field_label: "Seller Name 2",
    field_data_type: "text",
    field_widget_type: "text",
    source_type: "packet_contact",
    source_path: "seller_2.full_name",
    resolver_key: null,
    reuse: true,
    reuse_field_id: TXR_1957_REUSE_FIELDS.seller_name_2,
  },
];

export const TXR_1957_FIELDS: Txr1957FieldDef[] = [...REUSE_FIELDS, ...NEW_FIELDS];
export const TXR_1957_NEW_FIELDS = NEW_FIELDS;

/** Pixel/text-derived placements. y = underline yTop − 14 for single-line fields. */
export const TXR_1957_PLACEMENTS: Txr1957Placement[] = [
  {
    field_key: "txr_1957_declaration_date",
    mapping_name: "Page 1 Date",
    page_number: 1,
    x: 93.5,
    y: 85.5,
    width: 175,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
  },
  {
    field_key: "txr_1957_gf_number",
    mapping_name: "Page 1 GF Number",
    page_number: 1,
    x: 311.5,
    y: 85.5,
    width: 174,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
  },
  {
    field_key: "txr_1957_declarant",
    mapping_name: "Page 1 Declarant",
    page_number: 1,
    x: 114,
    y: 100,
    width: 367.5,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
  },
  {
    field_key: "property_legal_description",
    mapping_name: "Page 1 Description of Property",
    page_number: 1,
    x: 169.5,
    y: 114.5,
    width: 314.5,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
  },
  {
    field_key: "property_county",
    mapping_name: "Page 1 County",
    page_number: 1,
    x: 113,
    y: 129,
    width: 153,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
  },
  {
    field_key: "txr_1957_survey_date",
    mapping_name: "Page 1 Date of Survey",
    page_number: 1,
    x: 136,
    y: 144,
    width: 166.5,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
  },
  {
    field_key: "txr_1957_survey_changes_exceptions",
    mapping_name: "Page 1 Survey exceptions (two lines)",
    page_number: 1,
    x: 120,
    y: 567.1,
    width: 385,
    height: 35.4,
    font_size: 9,
    is_multiline: true,
    mask_background: true,
  },
  {
    field_key: "seller_name_1",
    mapping_name: "Page 2 Declarant 1 name",
    page_number: 2,
    x: 127,
    y: 153,
    width: 139.5,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
    column: "left",
  },
  {
    field_key: "txr_1957_declarant_1_dob",
    mapping_name: "Page 2 Declarant 1 date of birth",
    page_number: 2,
    x: 150,
    y: 164.5,
    width: 114.5,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
    column: "left",
  },
  {
    field_key: "txr_1957_declarant_1_address",
    mapping_name: "Page 2 Declarant 1 address",
    page_number: 2,
    x: 151,
    y: 176,
    width: 115,
    height: 22,
    font_size: 9,
    is_multiline: true,
    mask_background: true,
    column: "left",
  },
  {
    field_key: "txr_1957_declarant_1_execution_county",
    mapping_name: "Page 2 Declarant 1 execution county",
    page_number: 2,
    x: 127.5,
    y: 289,
    width: 115,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
    column: "left",
  },
  {
    field_key: "txr_1957_declarant_1_execution_state",
    mapping_name: "Page 2 Declarant 1 execution state",
    page_number: 2,
    x: 111,
    y: 300.5,
    width: 125,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
    column: "left",
  },
  {
    field_key: "txr_1957_declarant_1_execution_day",
    mapping_name: "Page 2 Declarant 1 execution day",
    page_number: 2,
    x: 80.5,
    y: 312,
    width: 25,
    height: 14,
    font_size: 8,
    is_multiline: false,
    mask_background: false,
    column: "left",
  },
  {
    field_key: "txr_1957_declarant_1_execution_month",
    mapping_name: "Page 2 Declarant 1 execution month",
    page_number: 2,
    x: 133,
    y: 312,
    width: 100,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
    column: "left",
  },
  {
    field_key: "txr_1957_declarant_1_execution_year",
    mapping_name: "Page 2 Declarant 1 execution year",
    page_number: 2,
    x: 238,
    y: 312,
    width: 40,
    height: 14,
    font_size: 8,
    is_multiline: false,
    mask_background: false,
    column: "left",
  },
  {
    field_key: "seller_name_2",
    mapping_name: "Page 2 Declarant 2 name",
    page_number: 2,
    x: 367.5,
    y: 153,
    width: 139.5,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
    column: "right",
  },
  {
    field_key: "txr_1957_declarant_2_dob",
    mapping_name: "Page 2 Declarant 2 date of birth",
    page_number: 2,
    x: 390,
    y: 164.5,
    width: 115,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
    column: "right",
  },
  {
    field_key: "txr_1957_declarant_2_address",
    mapping_name: "Page 2 Declarant 2 address",
    page_number: 2,
    x: 391.5,
    y: 176,
    width: 114.5,
    height: 22,
    font_size: 9,
    is_multiline: true,
    mask_background: true,
    column: "right",
  },
  {
    field_key: "txr_1957_declarant_2_execution_county",
    mapping_name: "Page 2 Declarant 2 execution county",
    page_number: 2,
    x: 367.5,
    y: 289,
    width: 115.5,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
    column: "right",
  },
  {
    field_key: "txr_1957_declarant_2_execution_state",
    mapping_name: "Page 2 Declarant 2 execution state",
    page_number: 2,
    x: 351,
    y: 300.5,
    width: 125,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
    column: "right",
  },
  {
    field_key: "txr_1957_declarant_2_execution_day",
    mapping_name: "Page 2 Declarant 2 execution day",
    page_number: 2,
    x: 320.5,
    y: 312,
    width: 25,
    height: 14,
    font_size: 8,
    is_multiline: false,
    mask_background: false,
    column: "right",
  },
  {
    field_key: "txr_1957_declarant_2_execution_month",
    mapping_name: "Page 2 Declarant 2 execution month",
    page_number: 2,
    x: 373,
    y: 312,
    width: 95,
    height: 14,
    font_size: 9,
    is_multiline: false,
    mask_background: false,
    column: "right",
  },
  {
    field_key: "txr_1957_declarant_2_execution_year",
    mapping_name: "Page 2 Declarant 2 execution year",
    page_number: 2,
    x: 473,
    y: 312,
    width: 40,
    height: 14,
    font_size: 8,
    is_multiline: false,
    mask_background: false,
    column: "right",
  },
];

export const TXR_1957_DEFAULTS: Array<{
  field_key: string;
  default_value: string;
  notes: string;
}> = [
  {
    field_key: "txr_1957_survey_changes_exceptions",
    default_value: "None",
    notes: "TXR-1957 Lee Personal form-specific default (printed instruction: insert None)",
  },
  {
    field_key: "txr_1957_declarant_1_execution_state",
    default_value: "Texas",
    notes: "TXR-1957 Lee Personal form-specific default",
  },
  {
    field_key: "txr_1957_declarant_2_execution_state",
    default_value: "Texas",
    notes: "TXR-1957 Lee Personal form-specific default",
  },
];

export const TXR_1957_EXPECTED_COUNTS = {
  placements: 23,
  newFields: 19,
  reuseFields: 4,
  page1: 7,
  page2: 16,
  multiline: 3,
  signatures: 0,
  defaults: 3,
} as const;

export function fieldByKey(key: string): Txr1957FieldDef {
  const row = TXR_1957_FIELDS.find((f) => f.field_key === key);
  if (!row) throw new Error(`Unknown TXR-1957 field key: ${key}`);
  return row;
}

export function isSignatureLikeKey(fieldKey: string): boolean {
  const key = fieldKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return (
    key.includes("signature") ||
    key.endsWith("_sig") ||
    key.startsWith("sig_") ||
    key.includes("_initial") ||
    key.startsWith("initial_") ||
    key.endsWith("_initial") ||
    key.endsWith("_initials")
  );
}

export function placementRight(p: Txr1957Placement): number {
  return p.x + p.width;
}

export function placementBottom(p: Txr1957Placement): number {
  return p.y + p.height;
}
