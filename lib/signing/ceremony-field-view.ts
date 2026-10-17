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
 * Guidance passes `requiredOnly` so optional fields never hold up Finish.
 */
export function nextIncompleteCeremonyField(
  fields: readonly CeremonyFieldView[],
  documents: readonly Pick<CeremonyDocumentView, "revisionDocumentId" | "displayOrder">[],
  afterFieldId: string | null = null,
  options: { requiredOnly?: boolean } = {},
): CeremonyActionableField | null {
  const ordered = orderCeremonyFields(
    fields.filter(isParticipantActionableField),
    documents,
  );
  const incomplete = (field: CeremonyActionableField) =>
    !field.placementId && (!options.requiredOnly || field.isRequired);
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

/** Non-modal hint beside the guided field. It never applies anything itself. */
export function ceremonyGuidanceText(field: CeremonyActionableField): string {
  return field.fieldType === "SIGNATURE" ? "Click here to sign" : "Click here to initial";
}

export type CeremonyFieldListEntry = {
  field: CeremonyActionableField;
  kindLabel: "Signature" | "Initials";
  documentName: string;
  pageNumber: number;
  /** "2 of 3" when the same kind repeats on one page, else null. */
  positionOnPage: string | null;
  status: "Completed" | "Remaining";
};

/**
 * "Your fields" rows in ceremony order, with repeated kinds on one page told
 * apart by position (top-to-bottom, then left-to-right) instead of ids.
 */
export function ceremonyFieldListEntries(
  fields: readonly CeremonyFieldView[],
  documents: readonly Pick<
    CeremonyDocumentView,
    "revisionDocumentId" | "displayOrder" | "displayName"
  >[],
): CeremonyFieldListEntry[] {
  const ordered = orderCeremonyFields(fields.filter(isParticipantActionableField), documents);
  const nameById = new Map(
    documents.map((document) => [document.revisionDocumentId, document.displayName]),
  );
  const groupKey = (field: CeremonyActionableField) =>
    `${field.revisionDocumentId}:${field.pageNumber}:${field.fieldType}`;
  const groupSizes = new Map<string, number>();
  for (const field of ordered) {
    groupSizes.set(groupKey(field), (groupSizes.get(groupKey(field)) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return ordered.map((field) => {
    const key = groupKey(field);
    const index = (seen.get(key) ?? 0) + 1;
    seen.set(key, index);
    const size = groupSizes.get(key) ?? 1;
    return {
      field,
      kindLabel: field.fieldType === "SIGNATURE" ? "Signature" : "Initials",
      documentName: nameById.get(field.revisionDocumentId) ?? "Document",
      pageNumber: field.pageNumber,
      positionOnPage: size > 1 ? `${index} of ${size}` : null,
      status: field.placementId ? "Completed" : "Remaining",
    };
  });
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
