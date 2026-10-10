/**
 * Pure local-state rules for the Prepare Documents editor. The editor applies
 * these immediately for responsive edits; trusted server actions persist the
 * same change and the returned rows reconcile local state. Mirrors the server
 * rules in `draft-fields.ts` (a linked Date Signed follows its Signature or
 * Initials) and `draft-prepared-content.ts`.
 */
import { isDateSignedSourceType } from "./date-signed-link";
import { DATE_SIGNED_DEFAULT_SIZE, expectedDraftMarkText } from "./draft-field-sizing";
import { isPreparedContentType } from "./prepared-content-types";
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
    case "PRINTED_NAME":
      return "Printed Name";
    case "CHECKMARK":
      return "Checkmark";
  }
}

/** Checkmark is the only placement without a participant. */
export function placementHasParticipant(type: DraftFieldType): boolean {
  return type !== "CHECKMARK";
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
  if (field.fieldType === "PRINTED_NAME") return field.participantFullName;
  if (field.fieldType === "CHECKMARK") return "✓";
  return expectedDraftMarkText(field.fieldType, {
    fullName: field.participantFullName,
    capacityMode: field.capacityMode,
    capacityWording: field.capacityWording,
  });
}

/** Full description for tooltips and assistive technology. */
export function draftFieldDescription(field: LabelledField): string {
  if (field.fieldType === "CHECKMARK") return "Checkmark (prepared content)";
  if (field.fieldType === "PRINTED_NAME") {
    return `Printed Name for ${field.participantFullName} (prepared content)`;
  }
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
 * Rect for a newly placed field at a click (PDF units). The click marks the
 * field's left edge, vertically centred, so it starts where the blank line
 * starts. A Checkmark is a point mark that belongs on the box clicked, so it
 * stays centred. Then clamped onto the page: near the right edge the field
 * shifts left at full size rather than shrinking. Placement only; drag,
 * resize and stored geometry are unaffected.
 */
export function newPlacementRect(
  fieldType: DraftFieldType,
  point: { x: number; y: number },
  size: { width: number; height: number },
  page: { width: number; height: number },
): PdfRect {
  const x = fieldType === "CHECKMARK" ? point.x - size.width / 2 : point.x;
  return clampRectToPage(
    { x, y: point.y - size.height / 2, width: size.width, height: size.height },
    page,
  );
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
 * Ids removed when `fieldId` is removed: a Signature or Initials takes any
 * Date Signed linked to it; everything else removes alone.
 */
export function removalIds(
  model: SigningPreviewModel,
  fieldId: string,
): string[] {
  const located = findField(model, fieldId);
  if (!located) return [];
  if (!isDateSignedSourceType(located.field.fieldType)) return [fieldId];
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
 * Reassign a field to another participant. A Signature's or Initials' linked
 * Date Signed follows it; a Date Signed relinks to `linkedSignatureFieldId`.
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
    isDateSignedSourceType(located.field.fieldType)
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

/**
 * Fields on a document a Date Signed for `participantId` may link to: that
 * participant's Signatures and Initials, in page reading order.
 */
export function dateSourceOptions(
  fields: SigningPreviewField[],
  participantId: string,
): SigningPreviewField[] {
  return fields
    .filter(
      (field) =>
        isDateSignedSourceType(field.fieldType) && field.participantId === participantId,
    )
    .sort((a, b) => a.pageNumber - b.pageNumber || a.y - b.y || a.x - b.x);
}

/**
 * The explicit Date Signed source, if it is still a Signature or Initials of
 * `participantId` on this document. Never falls back to another field, so a
 * Date is not silently linked to the wrong source.
 */
export function resolveDateLinkSource(
  fields: SigningPreviewField[],
  participantId: string,
  sourceId: string,
): SigningPreviewField | null {
  if (!sourceId || !participantId) return null;
  return (
    dateSourceOptions(fields, participantId).find((field) => field.id === sourceId) ??
    null
  );
}

/** Distances closer than this (PDF points) count as equal. */
export const DATE_LINK_TIE_EPSILON_PT = 0.5;

/** Shortest distance between two rectangles' edges; 0 when they touch or overlap. */
export function rectGapDistance(a: PdfRect, b: PdfRect): number {
  const dx = Math.max(0, b.x - (a.x + a.width), a.x - (b.x + b.width));
  const dy = Math.max(0, b.y - (a.y + a.height), a.y - (b.y + b.height));
  return Math.hypot(dx, dy);
}

function rectCenterDistance(a: PdfRect, b: PdfRect): number {
  return Math.hypot(
    a.x + a.width / 2 - (b.x + b.width / 2),
    a.y + a.height / 2 - (b.y + b.height / 2),
  );
}

/**
 * The Signature or Initials a Date Signed at `dateRect` links to by default:
 * the participant's nearest one on the same page of this document, by the
 * gap between the two rectangles. Near-equal gaps fall back to centre
 * distance, then reading order (top, then left), then id, so the choice is
 * deterministic. Never looks at other participants, documents or pages; null
 * when the page has no candidate.
 */
export function nearestDateLinkSource(
  fields: SigningPreviewField[],
  participantId: string,
  pageNumber: number,
  dateRect: PdfRect,
): SigningPreviewField | null {
  if (!participantId) return null;
  const candidates = dateSourceOptions(fields, participantId).filter(
    (field) => field.pageNumber === pageNumber,
  );
  let best: SigningPreviewField | null = null;
  let bestGap = Infinity;
  let bestCenter = Infinity;
  for (const field of candidates) {
    const gap = rectGapDistance(dateRect, field);
    const center = rectCenterDistance(dateRect, field);
    const closer =
      best === null ||
      gap < bestGap - DATE_LINK_TIE_EPSILON_PT ||
      (Math.abs(gap - bestGap) <= DATE_LINK_TIE_EPSILON_PT &&
        (center < bestCenter - DATE_LINK_TIE_EPSILON_PT ||
          (Math.abs(center - bestCenter) <= DATE_LINK_TIE_EPSILON_PT &&
            (field.y < best.y ||
              (field.y === best.y &&
                (field.x < best.x || (field.x === best.x && field.id < best.id)))))));
    if (closer) {
      best = field;
      bestGap = gap;
      bestCenter = center;
    }
  }
  return best;
}

/**
 * How a Date Signed being placed is linked. AUTO_NEAREST follows the pointer
 * (`nearestDateLinkSource`); EXPLICIT_SOURCE is the manager's Link to choice
 * and stays fixed wherever the pointer is. An explicit choice that is no
 * longer a Signature or Initials of the participant resolves to null, never
 * to another field.
 */
export type DateLinkTarget =
  | { mode: "AUTO_NEAREST"; source: SigningPreviewField | null }
  | { mode: "EXPLICIT_SOURCE"; source: SigningPreviewField | null };

export function resolveDateLinkTarget(options: {
  fields: SigningPreviewField[];
  participantId: string;
  explicitSourceId: string;
  pageNumber: number | null;
  dateRect: PdfRect | null;
}): DateLinkTarget {
  if (options.explicitSourceId) {
    return {
      mode: "EXPLICIT_SOURCE",
      source: resolveDateLinkSource(
        options.fields,
        options.participantId,
        options.explicitSourceId,
      ),
    };
  }
  return {
    mode: "AUTO_NEAREST",
    source:
      options.pageNumber == null || options.dateRect == null
        ? null
        : nearestDateLinkSource(
            options.fields,
            options.participantId,
            options.pageNumber,
            options.dateRect,
          ),
  };
}

/** "Initials — Page 1": the armed Date Signed source as shown to the manager. */
export function dateLinkSourceDisplay(field: Pick<SigningPreviewField, "fieldType" | "pageNumber">): string {
  return `${draftFieldTypeLabel(field.fieldType)} — Page ${field.pageNumber}`;
}

/**
 * Signature a Date Signed should link to for `participantId` on a document.
 * Only Signatures are chosen automatically; linking to Initials is always the
 * manager's explicit choice.
 */
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
  /** New local fields in creation order (Date sources before their Dates). */
  fields: SigningPreviewField[];
  rejected: string[];
};

/** Click point (PDF units) that places a pasted group in paste-placement mode. */
export type PasteAnchor = { pageNumber: number; x: number; y: number };

/**
 * The clipboard item a paste anchor positions: the first copied placement
 * that is not a Date Signed (dates follow their source), else the first item.
 */
export function pasteReferenceItem(
  clipboard: readonly PlacementClipboardItem[],
): PlacementClipboardItem | null {
  return clipboard.find((item) => item.fieldType !== "DATE_SIGNED") ?? clipboard[0] ?? null;
}

/**
 * Plan pasting clipboard placements into `documentId`, keeping participant,
 * type, required state, and relative geometry, clamped per page as a group.
 *
 * With `anchor` (paste-placement mode) the reference placement is centred on
 * the clicked point and the group lands on the clicked page (multi-page
 * copies keep their page spacing). Without it the group shifts by `offset`
 * on its original pages.
 *
 * A copied Signature/Initials + linked Date pastes as a new linked pair; a
 * Signature alone gets a new paired Date Signed (Initials never do); a Date
 * alone links only to a same-participant source (its original Signature or
 * Initials, else a Signature on that page without a Date) and is otherwise
 * rejected. Links never cross participants. Prepared content pastes as-is.
 */
export function planPaste(options: {
  model: SigningPreviewModel;
  documentId: string;
  clipboard: readonly PlacementClipboardItem[];
  pageSizes: Readonly<Record<number, { width: number; height: number }>>;
  offset?: number;
  anchor?: PasteAnchor;
  newId: () => string;
}): PastePlan {
  const { model, documentId, clipboard, pageSizes, anchor, newId } = options;
  const offset = options.offset ?? PASTE_OFFSET_PT;
  const document = model.documents.find((row) => row.id === documentId);
  const rejected: string[] = [];
  if (!document) return { fields: [], rejected: ["The document is not available."] };

  const reference = pasteReferenceItem(clipboard);
  const pageShift = anchor && reference ? anchor.pageNumber - reference.pageNumber : 0;
  const baseDelta =
    anchor && reference
      ? {
          dx: anchor.x - (reference.x + reference.width / 2),
          dy: anchor.y - (reference.y + reference.height / 2),
        }
      : { dx: offset, dy: offset };
  const targetPage = (item: PlacementClipboardItem) => item.pageNumber + pageShift;

  const participants = new Map(model.participants.map((row) => [row.id, row]));
  const usable = clipboard.filter((item) => {
    if (placementHasParticipant(item.fieldType) && !participants.has(item.participantId)) {
      rejected.push("A copied placement's participant is no longer on this Signing.");
      return false;
    }
    if (!pageSizes[targetPage(item)]) {
      rejected.push(`Page ${targetPage(item)} does not exist in this document.`);
      return false;
    }
    return true;
  });

  const deltaByPage = new Map<number, { dx: number; dy: number }>();
  for (const pageNumber of new Set(usable.map(targetPage))) {
    deltaByPage.set(
      pageNumber,
      clampGroupDelta(
        usable.filter((item) => targetPage(item) === pageNumber),
        baseDelta,
        pageSizes[pageNumber],
      ),
    );
  }

  const build = (
    item: Pick<PlacementClipboardItem, "fieldType" | "participantId" | "isRequired">,
    pageNumber: number,
    rect: PdfRect,
    linkedSignatureFieldId: string | null,
  ): SigningPreviewField => {
    const participant = participants.get(item.participantId);
    return {
      id: newId(),
      fieldType: item.fieldType,
      isRequired: isPreparedContentType(item.fieldType) ? false : item.isRequired,
      pageNumber,
      ...rect,
      participantId: participant?.id ?? "",
      participantFullName: participant?.fullName ?? "",
      capacityMode: participant?.capacityMode ?? "PERSONAL",
      representedPartyName: participant?.representedPartyName ?? null,
      capacityLabel: null,
      capacityWording: participant?.capacityWording ?? null,
      linkedSignatureFieldId,
    };
  };
  const shifted = (item: PlacementClipboardItem): PdfRect => {
    const delta = deltaByPage.get(targetPage(item))!;
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
    const field = build(item, targetPage(item), shifted(item), null);
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
          targetPage(item),
          pairedDatePlacement(field, pageSizes[targetPage(item)]),
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
      const original = document.fields.find(
        (field) =>
          field.id === item.linkedSignatureSourceId &&
          isDateSignedSourceType(field.fieldType) &&
          field.participantId === item.participantId,
      );
      const undated = document.fields.find(
        (field) =>
          field.fieldType === "SIGNATURE" &&
          field.participantId === item.participantId &&
          field.pageNumber === targetPage(item) &&
          !datedSignatureIds.has(field.id),
      );
      linkId = original?.id ?? undated?.id ?? null;
    }
    if (!linkId) {
      const name = participants.get(item.participantId)!.fullName;
      rejected.push(
        `Date Signed needs a Signature or Initials for ${name}. Copy it with its Date Signed, or place a Signature for ${name} first.`,
      );
      continue;
    }
    datedSignatureIds.add(linkId);
    fields.push(build(item, targetPage(item), shifted(item), linkId));
  }

  return { fields, rejected };
}