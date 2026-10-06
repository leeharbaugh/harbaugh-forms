import type { CeremonyDocumentView, CeremonyFieldView } from "./ceremony-context";

/**
 * Date Signed shown beside each applied Signature in the ceremony.
 *
 * The date is recorded on the linked DATE_SIGNED placement, never on the
 * Signature placement, so it must be read through `linkedSignatureFieldId`.
 */
export function linkedDateSignedBySignatureField(
  fields: readonly CeremonyFieldView[],
): Map<string, string> {
  const dates = new Map<string, string>();
  for (const field of fields) {
    if (
      field.fieldType === "DATE_SIGNED" &&
      field.linkedSignatureFieldId &&
      field.placementId &&
      field.renderedSenderLocalDate
    ) {
      dates.set(field.linkedSignatureFieldId, field.renderedSenderLocalDate);
    }
  }
  return dates;
}

/**
 * Server-mediated prepared-version bytes for one revision document. The route
 * authorizes from the ceremony session cookie; nothing secret is in the path.
 */
export function ceremonyDocumentUrl(revisionDocumentId: string): string {
  return `/sign/ceremony/document/${encodeURIComponent(revisionDocumentId)}`;
}

export type CeremonyActionableField = CeremonyFieldView & {
  fieldType: "SIGNATURE" | "INITIALS";
};

/** Date Signed is applied by the server with its Signature, never by the participant. */
export function isParticipantActionableField(
  field: CeremonyFieldView,
): field is CeremonyActionableField {
  return field.fieldType === "SIGNATURE" || field.fieldType === "INITIALS";
}

export type CeremonyPageMetrics = {
  /** PDF points at scale 1 (pdf.js viewport). */
  originalWidth: number;
  originalHeight: number;
  /** CSS pixels of the rendered page. */
  renderedWidth: number;
  renderedHeight: number;
};

export type CeremonyRenderRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Field geometry is stored in PDF points with a top-left origin, the same
 * convention Prepare Documents writes and finalization draws from; the overlay
 * only scales it to the rendered page and never inflates it.
 */
export function ceremonyFieldRenderRect(
  field: Pick<CeremonyFieldView, "x" | "y" | "width" | "height">,
  metrics: CeremonyPageMetrics,
): CeremonyRenderRect {
  const scaleX = metrics.renderedWidth / metrics.originalWidth;
  const scaleY = metrics.renderedHeight / metrics.originalHeight;
  return {
    x: field.x * scaleX,
    y: field.y * scaleY,
    width: field.width * scaleX,
    height: field.height * scaleY,
  };
}

/** Document display order, then page, then top-to-bottom, then left-to-right. */
export function orderCeremonyFields<T extends CeremonyFieldView>(
  fields: readonly T[],
  documents: readonly Pick<CeremonyDocumentView, "revisionDocumentId" | "displayOrder">[],
): T[] {
  const documentOrder = new Map(
    documents.map((document) => [document.revisionDocumentId, document.displayOrder]),
  );
  return [...fields].sort(
    (a, b) =>
      (documentOrder.get(a.revisionDocumentId) ?? Number.MAX_SAFE_INTEGER) -
        (documentOrder.get(b.revisionDocumentId) ?? Number.MAX_SAFE_INTEGER) ||
      a.pageNumber - b.pageNumber ||
      a.y - b.y ||
      a.x - b.x ||
      a.fieldId.localeCompare(b.fieldId),
  );
}

/**
 * The next Signature / Initials field still without an accepted placement,
 * in document and page order after `afterFieldId`, wrapping to the start.
 */
export function nextIncompleteCeremonyField(
  fields: readonly CeremonyFieldView[],
  documents: readonly Pick<CeremonyDocumentView, "revisionDocumentId" | "displayOrder">[],
  afterFieldId: string | null = null,
): CeremonyActionableField | null {
  const ordered = orderCeremonyFields(
    fields.filter(isParticipantActionableField),
    documents,
  );
  const incomplete = (field: CeremonyActionableField) => !field.placementId;
  const start = afterFieldId
    ? ordered.findIndex((field) => field.fieldId === afterFieldId)
    : -1;
  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const field = ordered[(start + offset + ordered.length) % ordered.length];
    if (field && incomplete(field)) return field;
  }
  return null;
}

export function ceremonyTargetLabel(field: CeremonyActionableField): string {
  return field.fieldType === "SIGNATURE" ? "Sign here" : "Initial here";
}

/** Accessible name for an on-document target: action, kind, location, requirement. */
export function ceremonyTargetAccessibleName(
  field: CeremonyActionableField,
  documentName: string,
): string {
  const kind = field.fieldType === "SIGNATURE" ? "Signature" : "Initials";
  const requirement = field.isRequired ? "required" : "optional";
  return `${ceremonyTargetLabel(field)}: ${kind}, page ${field.pageNumber} of ${documentName}, ${requirement}`;
}
