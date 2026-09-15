/**
 * Native Signing Stage 4 Draft source fingerprinting.
 *
 * Pure, dependency-light canonicalization of the exact inputs that
 * `fillPacketFormPdfBytes` consumes when a prepared PDF is rendered. A Draft
 * source snapshot is Signing-owned preparation state: it is not a
 * signing_document_version, not a package revision, and not signer evidence.
 *
 * Only render-affecting values participate in the fingerprint so that unrelated
 * bookkeeping churn on live packet_form rows never looks like source drift.
 */
import { createHash } from "node:crypto";
import type { Field } from "@/lib/types/field";
import type { FieldInstanceWithField } from "@/lib/types/field-instance";
import type { FormFieldMapping } from "@/lib/types/form-field-mapping";
import type {
  PacketFormAnnotation,
  PacketFormAnnotationType,
} from "@/lib/types/packet-form-annotation";
import type {
  PacketFormFieldView,
  ResolvedPacketPlacement,
} from "@/lib/types/packet-form-editor";
import type { TemplatePdfFieldType } from "@/lib/types/template-pdf-field";

/** Canonical payload version. Bump only with a matching migration/backfill plan. */
export const DRAFT_RENDER_INPUT_CANONICAL_VERSION = 1 as const;

export type DraftSnapshotFieldPlacement = {
  page_number: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  page_width: number | null;
  page_height: number | null;
  font_size: number | null;
  alignment: string | null;
};

export type DraftSnapshotFieldMapping = {
  is_multiline: boolean;
  mask_background: boolean;
  pdf_field_name: string | null;
  pdf_export_value: string | null;
  field_widget_type: string | null;
  mapping_name: string | null;
};

/** Catalog metadata that checkbox/currency render decisions read. */
export type DraftSnapshotFieldMetadata = {
  field_key: string | null;
  field_label: string | null;
  field_data_type: string | null;
  field_widget_type: string | null;
  default_checked: boolean | null;
};

export type DraftSnapshotField = {
  /** Template placement (form_field_mapping) id; identity for stable ordering. */
  id: string;
  displayValue: string;
  field_type: TemplatePdfFieldType;
  placement: DraftSnapshotFieldPlacement;
  mapping: DraftSnapshotFieldMapping;
  instance: {
    id: string;
    value: string | null;
    field: DraftSnapshotFieldMetadata;
  };
};

export type DraftSnapshotAnnotation = {
  id: string;
  annotation_type: PacketFormAnnotationType;
  page_number: number;
  text_value: string;
  font_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

function finiteOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // Normalize -0 so an equivalent placement never changes the fingerprint.
  return value === 0 ? 0 : value;
}

function finiteOrZero(value: unknown): number {
  return finiteOrNull(value) ?? 0;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

export function toDraftSnapshotField(
  fieldView: PacketFormFieldView,
): DraftSnapshotField {
  const field = fieldView.instance.fields;
  return {
    id: fieldView.mapping.id,
    displayValue: fieldView.displayValue ?? "",
    field_type: fieldView.field_type,
    placement: {
      page_number: finiteOrZero(fieldView.placement.page_number),
      x: finiteOrZero(fieldView.placement.x),
      y: finiteOrZero(fieldView.placement.y),
      width: finiteOrNull(fieldView.placement.width),
      height: finiteOrNull(fieldView.placement.height),
      page_width: finiteOrNull(fieldView.placement.page_width),
      page_height: finiteOrNull(fieldView.placement.page_height),
      font_size: finiteOrNull(fieldView.placement.font_size),
      alignment: textOrNull(fieldView.placement.alignment),
    },
    mapping: {
      is_multiline: fieldView.mapping.is_multiline === true,
      mask_background: fieldView.mapping.mask_background === true,
      pdf_field_name: textOrNull(fieldView.mapping.pdf_field_name),
      pdf_export_value: textOrNull(fieldView.mapping.pdf_export_value),
      field_widget_type: textOrNull(fieldView.mapping.field_widget_type),
      mapping_name: textOrNull(fieldView.mapping.mapping_name),
    },
    instance: {
      id: fieldView.instance.id,
      value: textOrNull(fieldView.instance.value),
      field: {
        field_key: textOrNull(field?.field_key),
        field_label: textOrNull(field?.field_label),
        field_data_type: textOrNull(field?.field_data_type),
        field_widget_type: textOrNull(field?.field_widget_type),
        default_checked: field?.default_checked ?? null,
      },
    },
  };
}

export function toDraftSnapshotAnnotation(
  annotation: PacketFormAnnotation,
): DraftSnapshotAnnotation {
  return {
    id: annotation.id,
    annotation_type: annotation.annotation_type,
    page_number: finiteOrZero(annotation.page_number),
    text_value: annotation.text_value ?? "",
    font_id: annotation.font_id,
    x: finiteOrZero(annotation.x),
    y: finiteOrZero(annotation.y),
    width: finiteOrZero(annotation.width),
    height: finiteOrZero(annotation.height),
    rotation: finiteOrZero(annotation.rotation),
  };
}

/**
 * Rebuild the minimal PacketFormFieldView that the fill pipeline reads.
 * Unused catalog/mapping columns are intentionally absent: a snapshot must not
 * depend on live rows to reproduce its prepared bytes.
 */
export function draftSnapshotFieldToFieldView(
  field: DraftSnapshotField,
): PacketFormFieldView {
  const placement = {
    page_number: field.placement.page_number,
    x: field.placement.x,
    y: field.placement.y,
    width: field.placement.width,
    height: field.placement.height,
    page_width: field.placement.page_width,
    page_height: field.placement.page_height,
    font_size: field.placement.font_size,
    alignment: field.placement.alignment,
    source: "template",
    field_instance_mapping_id: null,
  } as ResolvedPacketPlacement;

  const mapping = {
    id: field.id,
    page_number: field.placement.page_number,
    x: field.placement.x,
    y: field.placement.y,
    width: field.placement.width,
    height: field.placement.height,
    page_width: field.placement.page_width,
    page_height: field.placement.page_height,
    font_size: field.placement.font_size,
    alignment: field.placement.alignment,
    is_multiline: field.mapping.is_multiline,
    mask_background: field.mapping.mask_background,
    pdf_field_name: field.mapping.pdf_field_name,
    pdf_export_value: field.mapping.pdf_export_value,
    field_widget_type: field.mapping.field_widget_type,
    mapping_name: field.mapping.mapping_name,
    occurrence_index: null,
    required: false,
  } as FormFieldMapping;

  const catalogField = {
    field_key: field.instance.field.field_key ?? "",
    field_label: field.instance.field.field_label,
    field_data_type: field.instance.field.field_data_type ?? "text",
    field_widget_type: field.instance.field.field_widget_type ?? "text",
    default_checked: field.instance.field.default_checked,
  } as Field;

  const instance = {
    id: field.instance.id,
    value: field.instance.value,
    fields: catalogField,
  } as FieldInstanceWithField;

  return {
    mapping,
    instance,
    placement,
    displayValue: field.displayValue,
    field_type: field.field_type,
    hasPlacementOverride: false,
  };
}

export function draftSnapshotAnnotationToPacketFormAnnotation(
  annotation: DraftSnapshotAnnotation,
): PacketFormAnnotation {
  return {
    id: annotation.id,
    page_number: annotation.page_number,
    annotation_type: annotation.annotation_type,
    text_value: annotation.text_value,
    font_id: annotation.font_id,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
    rotation: annotation.rotation,
    // Snapshots only ever store ACTIVE annotations; the fill pipeline filters on it.
    status: "ACTIVE",
  } as PacketFormAnnotation;
}

function canonicalFieldEntry(field: DraftSnapshotField) {
  return {
    id: field.id,
    displayValue: field.displayValue,
    fieldType: field.field_type,
    placement: {
      page: field.placement.page_number,
      x: field.placement.x,
      y: field.placement.y,
      width: field.placement.width,
      height: field.placement.height,
      pageWidth: field.placement.page_width,
      pageHeight: field.placement.page_height,
      fontSize: field.placement.font_size,
      alignment: field.placement.alignment,
    },
    mapping: {
      isMultiline: field.mapping.is_multiline,
      maskBackground: field.mapping.mask_background,
      pdfFieldName: field.mapping.pdf_field_name,
      pdfExportValue: field.mapping.pdf_export_value,
      fieldWidgetType: field.mapping.field_widget_type,
      mappingName: field.mapping.mapping_name,
    },
    instance: {
      value: field.instance.value,
      fieldKey: field.instance.field.field_key,
      fieldLabel: field.instance.field.field_label,
      fieldDataType: field.instance.field.field_data_type,
      fieldWidgetType: field.instance.field.field_widget_type,
      defaultChecked: field.instance.field.default_checked,
    },
  };
}

function canonicalAnnotationEntry(annotation: DraftSnapshotAnnotation) {
  return {
    id: annotation.id,
    annotationType: annotation.annotation_type,
    page: annotation.page_number,
    textValue: annotation.text_value,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
  };
}

function byId<T extends { id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Deterministic JSON for the render-affecting Draft source inputs.
 * Stable across collection order; sensitive to any value the fill pipeline uses.
 */
export function canonicalizeDraftRenderInputs(input: {
  sourcePdfSha256: string;
  fieldViews: readonly DraftSnapshotField[];
  annotations: readonly DraftSnapshotAnnotation[];
}): string {
  return JSON.stringify({
    version: DRAFT_RENDER_INPUT_CANONICAL_VERSION,
    sourcePdfSha256: input.sourcePdfSha256,
    fields: byId(input.fieldViews).map(canonicalFieldEntry),
    annotations: byId(input.annotations).map(canonicalAnnotationEntry),
  });
}

/** Convenience wrapper for live editor state. */
export function canonicalizeLiveDraftRenderInputs(input: {
  sourcePdfSha256: string;
  fieldViews: readonly PacketFormFieldView[];
  annotations: readonly PacketFormAnnotation[];
}): string {
  return canonicalizeDraftRenderInputs({
    sourcePdfSha256: input.sourcePdfSha256,
    fieldViews: input.fieldViews.map(toDraftSnapshotField),
    annotations: input.annotations.map(toDraftSnapshotAnnotation),
  });
}

export function computeDraftContentFingerprint(input: {
  sourcePdfSha256: string;
  fieldViews: readonly DraftSnapshotField[];
  annotations: readonly DraftSnapshotAnnotation[];
}): string {
  return createHash("sha256")
    .update(canonicalizeDraftRenderInputs(input), "utf8")
    .digest("hex");
}

export function computeLiveDraftContentFingerprint(input: {
  sourcePdfSha256: string;
  fieldViews: readonly PacketFormFieldView[];
  annotations: readonly PacketFormAnnotation[];
}): string {
  return computeDraftContentFingerprint({
    sourcePdfSha256: input.sourcePdfSha256,
    fieldViews: input.fieldViews.map(toDraftSnapshotField),
    annotations: input.annotations.map(toDraftSnapshotAnnotation),
  });
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null,
      )
    : [];
}

/** Tolerant re-read of a persisted field_views_json payload. */
export function parseDraftSnapshotFields(value: unknown): DraftSnapshotField[] {
  return asRecordArray(value).map((row) => {
    const placement = (row.placement ?? {}) as Record<string, unknown>;
    const mapping = (row.mapping ?? {}) as Record<string, unknown>;
    const instance = (row.instance ?? {}) as Record<string, unknown>;
    const field = (instance.field ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      displayValue: typeof row.displayValue === "string" ? row.displayValue : "",
      field_type: String(row.field_type ?? "TEXT") as TemplatePdfFieldType,
      placement: {
        page_number: finiteOrZero(placement.page_number),
        x: finiteOrZero(placement.x),
        y: finiteOrZero(placement.y),
        width: finiteOrNull(placement.width),
        height: finiteOrNull(placement.height),
        page_width: finiteOrNull(placement.page_width),
        page_height: finiteOrNull(placement.page_height),
        font_size: finiteOrNull(placement.font_size),
        alignment: textOrNull(placement.alignment),
      },
      mapping: {
        is_multiline: mapping.is_multiline === true,
        mask_background: mapping.mask_background === true,
        pdf_field_name: textOrNull(mapping.pdf_field_name),
        pdf_export_value: textOrNull(mapping.pdf_export_value),
        field_widget_type: textOrNull(mapping.field_widget_type),
        mapping_name: textOrNull(mapping.mapping_name),
      },
      instance: {
        id: String(instance.id ?? ""),
        value: textOrNull(instance.value),
        field: {
          field_key: textOrNull(field.field_key),
          field_label: textOrNull(field.field_label),
          field_data_type: textOrNull(field.field_data_type),
          field_widget_type: textOrNull(field.field_widget_type),
          default_checked:
            typeof field.default_checked === "boolean"
              ? field.default_checked
              : null,
        },
      },
    };
  });
}

/** Tolerant re-read of a persisted annotations_json payload. */
export function parseDraftSnapshotAnnotations(
  value: unknown,
): DraftSnapshotAnnotation[] {
  return asRecordArray(value).flatMap((row) => {
    const annotationType = String(row.annotation_type ?? "");
    if (annotationType !== "typed_signature" && annotationType !== "date_signed") {
      return [];
    }
    return [
      {
        id: String(row.id ?? ""),
        annotation_type: annotationType,
        page_number: finiteOrZero(row.page_number),
        text_value: typeof row.text_value === "string" ? row.text_value : "",
        font_id: typeof row.font_id === "string" ? row.font_id : "helvetica",
        x: finiteOrZero(row.x),
        y: finiteOrZero(row.y),
        width: finiteOrZero(row.width),
        height: finiteOrZero(row.height),
        rotation: finiteOrZero(row.rotation),
      },
    ];
  });
}
