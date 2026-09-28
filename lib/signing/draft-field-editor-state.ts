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

/** Editor shortcuts never fire while the user is typing in a form control. */
export function isTypingTarget(target: unknown): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return (
    typeof element?.closest === "function" &&
    element.closest("input, select, textarea, [contenteditable=true]") != null
  );
}

/** Ctrl-click (Windows/Linux) or Cmd-click (macOS) toggles a placement. */
export function isSelectionToggle(event: {
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return event.ctrlKey || event.metaKey;
}

export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((value) => value !== id)
    : [...selected, id];
}

/** Every id removed when `fieldIds` are removed (Signatures take their Dates). */
export function expandRemovalIds(
  model: SigningPreviewModel,
  fieldIds: readonly string[],
): string[] {
  const ids = new Set<string>();
  for (const id of fieldIds) {
    for (const removed of removalIds(model, id)) ids.add(removed);
  }
  return [...ids];
}

/**
 * Largest part of `delta` that keeps every rect on the page, applied equally
 * to all rects so their relative geometry is preserved.
 */
export function clampGroupDelta(
  rects: readonly PdfRect[],
  delta: { dx: number; dy: number },
  page: { width: number; height: number },
): { dx: number; dy: number } {
  if (rects.length === 0) return { dx: 0, dy: 0 };
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return {
    dx: Math.min(Math.max(delta.dx, -minX), page.width - maxX),
    dy: Math.min(Math.max(delta.dy, -minY), page.height - maxY),
  };
}

/**
 * Selected placements that move with `anchorId`: those in the anchor's
 * document on the anchor's page. Placements selected on other pages stay put.
 */
export function groupMoveIds(
  model: SigningPreviewModel,
  selectedIds: readonly string[],
  anchorId: string,
): string[] {
  const anchor = findField(model, anchorId);
  if (!anchor) return [];
  const ids = selectedIds.includes(anchorId) ? selectedIds : [anchorId];
  return ids.filter((id) => {
    const located = findField(model, id);
    return (
      located !== null &&
      located.documentId === anchor.documentId &&
      located.field.pageNumber === anchor.field.pageNumber
    );
  });
}

/** Move `fieldIds` (one page) by a page-clamped common delta in PDF units. */
export function moveGroup(
  model: SigningPreviewModel,
  fieldIds: readonly string[],
  delta: { dx: number; dy: number },
  page: { width: number; height: number },
): SigningPreviewModel {
  const fields = fieldIds
    .map((id) => findField(model, id)?.field)
    .filter((field): field is SigningPreviewField => Boolean(field));
  const clamped = clampGroupDelta(fields, delta, page);
  let next = model;
  for (const field of fields) {
    next = moveField(next, field.id, {
      x: field.x + clamped.dx,
      y: field.y + clamped.dy,
      width: field.width,
      height: field.height,
    });
  }
  return next;
}

/** In-memory editor clipboard entry; never written to the OS clipboard. */
export type PlacementClipboardItem = {
  sourceId: string;
  fieldType: DraftFieldType;
  participantId: string;
  isRequired: boolean;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  linkedSignatureSourceId: string | null;
};

export function copyPlacements(
  model: SigningPreviewModel,
  fieldIds: readonly string[],
): PlacementClipboardItem[] {
  return fieldIds
    .map((id) => findField(model, id)?.field)
    .filter((field): field is SigningPreviewField => Boolean(field))
    .map((field) => ({
      sourceId: field.id,
      fieldType: field.fieldType,
      participantId: field.participantId,
      isRequired: field.isRequired,
      pageNumber: field.pageNumber,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      linkedSignatureSourceId: field.linkedSignatureFieldId,
    }));
}

export const PASTE_OFFSET_PT = 12;

export type PastePlan = {
  /** New local fields in creation order (Signatures before their Dates). */
  fields: SigningPreviewField[];
  rejected: string[];
};

/**
 * Plan pasting clipboard placements into `documentId`, keeping participant,
 * type, required state, page, and relative offsets, shifted by `offset` and
 * clamped per page as a group.
 *
 * A copied Signature + Date pair pastes as a new linked pair; a Signature
 * alone gets a new paired Date Signed; a Date alone links only to a
 * same-participant Signature (its original, else one on that page without a
 * Date) and is otherwise rejected. Links never cross participants.
 */
export function planPaste(options: {
  model: SigningPreviewModel;
  documentId: string;
  clipboard: readonly PlacementClipboardItem[];
  pageSizes: Readonly<Record<number, { width: number; height: number }>>;
  offset: number;
  newId: () => string;
}): PastePlan {
  const { model, documentId, clipboard, pageSizes, offset, newId } = options;
  const document = model.documents.find((row) => row.id === documentId);
  const rejected: string[] = [];
  if (!document) return { fields: [], rejected: ["The document is not available."] };

  const participants = new Map(model.participants.map((row) => [row.id, row]));
  const usable = clipboard.filter((item) => {
    if (!participants.has(item.participantId)) {
      rejected.push("A copied placement's participant is no longer on this Signing.");
      return false;
    }
    if (!pageSizes[item.pageNumber]) {
      rejected.push(`Page ${item.pageNumber} does not exist in this document.`);
      return false;
    }
    return true;
  });

  const deltaByPage = new Map<number, { dx: number; dy: number }>();
  for (const pageNumber of new Set(usable.map((item) => item.pageNumber))) {
    deltaByPage.set(
      pageNumber,
      clampGroupDelta(
        usable.filter((item) => item.pageNumber === pageNumber),
        { dx: offset, dy: offset },
        pageSizes[pageNumber],
      ),
    );
  }

  const build = (
    item: Pick<PlacementClipboardItem, "fieldType" | "participantId" | "isRequired" | "pageNumber">,
    rect: PdfRect,
    linkedSignatureFieldId: string | null,
  ): SigningPreviewField => {
    const participant = participants.get(item.participantId)!;
    return {
      id: newId(),
      fieldType: item.fieldType,
      isRequired: item.isRequired,
      pageNumber: item.pageNumber,
      ...rect,
      participantId: participant.id,
      participantFullName: participant.fullName,
      capacityMode: participant.capacityMode,
      representedPartyName: participant.representedPartyName,
      capacityLabel: null,
      capacityWording: participant.capacityWording,
      linkedSignatureFieldId,
    };
  };
  const shifted = (item: PlacementClipboardItem): PdfRect => {
    const delta = deltaByPage.get(item.pageNumber)!;
    return {
      x: item.x + delta.dx,
      y: item.y + delta.dy,
      width: item.width,
      height: item.height,
    };
  };

  const fields: SigningPreviewField[] = [];
  const newIdBySource = new Map<string, string>();
  const copiedIds = new Set(usable.map((item) => item.sourceId));

  for (const item of usable) {
    if (item.fieldType === "DATE_SIGNED") continue;
    const field = build(item, shifted(item), null);
    newIdBySource.set(item.sourceId, field.id);
    fields.push(field);
    const dateCopied = usable.some(
      (other) =>
        other.fieldType === "DATE_SIGNED" &&
        other.linkedSignatureSourceId === item.sourceId,
    );
    if (item.fieldType === "SIGNATURE" && !dateCopied) {
      fields.push(
        build(
          { ...item, fieldType: "DATE_SIGNED" },
          pairedDatePlacement(field, pageSizes[item.pageNumber]),
          field.id,
        ),
      );
    }
  }

  const datedSignatureIds = new Set(
    document.fields
      .filter((field) => field.fieldType === "DATE_SIGNED")
      .map((field) => field.linkedSignatureFieldId),
  );
  for (const item of usable) {
    if (item.fieldType !== "DATE_SIGNED") continue;
    let linkId: string | null = null;
    if (item.linkedSignatureSourceId && copiedIds.has(item.linkedSignatureSourceId)) {
      linkId = newIdBySource.get(item.linkedSignatureSourceId) ?? null;
    } else {
      const sameParticipant = (field: SigningPreviewField) =>
        field.fieldType === "SIGNATURE" && field.participantId === item.participantId;
      const original = document.fields.find(
        (field) => field.id === item.linkedSignatureSourceId && sameParticipant(field),
      );
      const undated = document.fields.find(
        (field) =>
          sameParticipant(field) &&
          field.pageNumber === item.pageNumber &&
          !datedSignatureIds.has(field.id),
      );
      linkId = original?.id ?? undated?.id ?? null;
    }
    if (!linkId) {
      const name = participants.get(item.participantId)!.fullName;
      rejected.push(
        `Date Signed needs a Signature for ${name}. Copy the Signature with its Date Signed, or place a Signature for ${name} first.`,
      );
      continue;
    }
    datedSignatureIds.add(linkId);
    fields.push(build(item, shifted(item), linkId));
  }

  return { fields, rejected };
}