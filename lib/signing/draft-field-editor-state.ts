/**
 * Pure local-state rules for the Prepare Documents editor. The editor applies
 * these immediately for responsive edits; trusted server actions persist the
 * same change and the returned rows reconcile local state. Mirrors the server
 * rules in `draft-fields.ts` (paired Date Signed follows its Signature).
 */
import { DATE_SIGNED_DEFAULT_SIZE, expectedDraftMarkText } from "./draft-field-sizing";
import type { SigningPreviewField, SigningPreviewModel } from "./preview";

export type DraftFieldType = SigningPreviewField["fieldType"];

export function draftFieldTypeLabel(type: DraftFieldType): string {
  switch (type) {
    case "SIGNATURE":
      return "Signature";
    case "INITIALS":
      return "Initials";
    case "DATE_SIGNED":
      return "Date Signed";
  }
}

type LabelledField = Pick<
  SigningPreviewField,
  "fieldType" | "participantFullName" | "capacityMode" | "representedPartyName"
> & { capacityWording?: string | null };

/**
 * On-page label: the mark the renderer will draw (suggested initials, the
 * personal signing name or representative execution wording) or "Date".
 * Visual only; type and participant details live in the tooltip/sidebar.
 */
export function draftFieldCompactLabel(field: LabelledField): string {
  if (field.fieldType === "DATE_SIGNED") return "Date";
  return expectedDraftMarkText(field.fieldType, {
    fullName: field.participantFullName,
    capacityMode: field.capacityMode,
    capacityWording: field.capacityWording,
  });
}

/** Full description for tooltips and assistive technology. */
export function draftFieldDescription(field: LabelledField): string {
  const base = `${draftFieldTypeLabel(field.fieldType)} for ${field.participantFullName}`;
  return field.capacityMode === "REPRESENTATIVE" && field.representedPartyName
    ? `${base}, representing ${field.representedPartyName}`
    : base;
}

/** Pointer travel (CSS px) below which a drag stop is treated as a click. */
export const DRAG_MOVE_THRESHOLD_PX = 3;

export type PdfRect = { x: number; y: number; width: number; height: number };

export function dragExceededThreshold(
  start: { x: number; y: number },
  end: { x: number; y: number },
  threshold = DRAG_MOVE_THRESHOLD_PX,
): boolean {
  return (
    Math.abs(end.x - start.x) >= threshold ||
    Math.abs(end.y - start.y) >= threshold
  );
}

/** Keep a placement fully on the page in PDF units. */
export function clampRectToPage(
  rect: PdfRect,
  page: { width: number; height: number },
): PdfRect {
  const width = Math.min(Math.max(rect.width, 1), page.width);
  const height = Math.min(Math.max(rect.height, 1), page.height);
  return {
    x: Math.min(Math.max(0, rect.x), page.width - width),
    y: Math.min(Math.max(0, rect.y), page.height - height),
    width,
    height,
  };
}

/**
 * Default spot for the paired Date Signed: to the right of the Signature on
 * the same baseline (bottom-aligned), or below it when the right side would
 * run off the page.
 */
export function pairedDatePlacement(
  signature: PdfRect,
  page: { width: number; height: number },
): PdfRect {
  const size = DATE_SIGNED_DEFAULT_SIZE;
  const right = signature.x + signature.width + 12;
  const candidate =
    right + size.width <= page.width
      ? {
          x: right,
          y: signature.y + signature.height - size.height,
          ...size,
        }
      : { x: signature.x, y: signature.y + signature.height + 8, ...size };
  return clampRectToPage(candidate, page);
}

function mapDocumentFields(
  model: SigningPreviewModel,
  documentId: string,
  update: (fields: SigningPreviewField[]) => SigningPreviewField[],
): SigningPreviewModel {
  return {
    ...model,
    documents: model.documents.map((document) =>
      document.id === documentId
        ? { ...document, fields: update(document.fields) }
        : document,
    ),
  };
}

export function findField(
  model: SigningPreviewModel,
  fieldId: string,
): { documentId: string; field: SigningPreviewField } | null {
  for (const document of model.documents) {
    const field = document.fields.find((row) => row.id === fieldId);
    if (field) return { documentId: document.id, field };
  }
  return null;
}

export function addField(
  model: SigningPreviewModel,
  documentId: string,
  field: SigningPreviewField,
): SigningPreviewModel {
  return mapDocumentFields(model, documentId, (fields) => [...fields, field]);
}

/** Replace a local placeholder id with the persisted id (and link targets). */
export function replaceFieldId(
  model: SigningPreviewModel,
  fromId: string,
  toId: string,
): SigningPreviewModel {
  return {
    ...model,
    documents: model.documents.map((document) => ({
      ...document,
      fields: document.fields.map((field) => ({
        ...field,
        id: field.id === fromId ? toId : field.id,
        linkedSignatureFieldId:
          field.linkedSignatureFieldId === fromId
            ? toId
            : field.linkedSignatureFieldId,
      })),
    })),
  };
}

export function moveField(
  model: SigningPreviewModel,
  fieldId: string,
  rect: PdfRect,
): SigningPreviewModel {
  const located = findField(model, fieldId);
  if (!located) return model;
  return mapDocumentFields(model, located.documentId, (fields) =>
    fields.map((field) => (field.id === fieldId ? { ...field, ...rect } : field)),
  );
}

/**
 * Ids removed when `fieldId` is removed: a Signature takes its paired Date
 * Signed with it; Initials and Date Signed remove alone.
 */
export function removalIds(
  model: SigningPreviewModel,
  fieldId: string,
): string[] {
  const located = findField(model, fieldId);
  if (!located) return [];
  if (located.field.fieldType !== "SIGNATURE") return [fieldId];
  const linked = model.documents
    .flatMap((document) => document.fields)
    .filter((field) => field.linkedSignatureFieldId === fieldId)
    .map((field) => field.id);
  return [fieldId, ...linked];
}

export function removeFields(
  model: SigningPreviewModel,
  fieldIds: string[],
): SigningPreviewModel {
  if (fieldIds.length === 0) return model;
  const removed = new Set(fieldIds);
  return {
    ...model,
    documents: model.documents.map((document) => ({
      ...document,
      fields: document.fields.filter((field) => !removed.has(field.id)),
    })),
  };
}

/**
 * Reassign a field to another participant. A Signature's paired Date Signed
 * follows it; a Date Signed relinks to `linkedSignatureFieldId`.
 */
export function reassignField(
  model: SigningPreviewModel,
  fieldId: string,
  participantId: string,
  linkedSignatureFieldId?: string | null,
): SigningPreviewModel {
  const located = findField(model, fieldId);
  const participant = model.participants.find((row) => row.id === participantId);
  if (!located || !participant) return model;
  const followerIds = new Set(
    located.field.fieldType === "SIGNATURE"
      ? removalIds(model, fieldId).filter((id) => id !== fieldId)
      : [],
  );
  const participantPatch = {
    participantId: participant.id,
    participantFullName: participant.fullName,
    capacityMode: participant.capacityMode,
    representedPartyName: participant.representedPartyName,
    capacityWording: participant.capacityWording,
  };
  return {
    ...model,
    documents: model.documents.map((document) => ({
      ...document,
      fields: document.fields.map((field) => {
        if (field.id === fieldId) {
          return {
            ...field,
            ...participantPatch,
            linkedSignatureFieldId:
              field.fieldType === "DATE_SIGNED"
                ? (linkedSignatureFieldId ?? field.linkedSignatureFieldId)
                : field.linkedSignatureFieldId,
          };
        }
        if (followerIds.has(field.id)) {
          return { ...field, ...participantPatch };
        }
        return field;
      }),
    })),
  };
}

/** Signature a Date Signed should link to for `participantId` on a document. */
export function preferredSignatureForDate(
  fields: SigningPreviewField[],
  participantId: string,
  pageNumber: number,
): SigningPreviewField | null {
  const signatures = fields.filter(
    (field) =>
      field.fieldType === "SIGNATURE" && field.participantId === participantId,
  );
  return (
    signatures.find((field) => field.pageNumber === pageNumber) ??
    signatures[signatures.length - 1] ??
    null
  );
}
