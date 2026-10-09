"use client";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { acquirePdfWorker, releasePdfWorker } from "@/lib/pdfjs-setup";
import {
  PDF_EDITOR_SIDEBAR_WIDTH,
  PDF_MIN_PAGE_WIDTH,
  computePdfPageWidth,
  displayZoomPercent,
  scrollElementIntoContainer,
  stepZoomPercent,
  type PdfZoomMode,
} from "@/lib/pdf-editor-zoom";
import {
  addField,
  clampGroupDelta,
  clampRectToPage,
  copyPlacements,
  dateLinkSourceDisplay,
  dateSourceOptions,
  expandRemovalIds,
  groupMoveIds,
  isSelectionToggle,
  isTypingTarget,
  moveGroup,
  placementHasParticipant,
  planPaste,
  toggleSelection,
  type PasteAnchor,
  type PlacementClipboardItem,
  dragExceededThreshold,
  draftFieldCompactLabel,
  draftFieldDescription,
  draftFieldTypeLabel,
  findField,
  moveField,
  newPlacementRect,
  pairedDatePlacement,
  preferredSignatureForDate,
  reassignField,
  removeFields,
  replaceFieldId,
  resolveDateLinkSource,
  type DraftFieldType,
  type PdfRect,
} from "@/lib/signing/draft-field-editor-state";
import {
  defaultDraftFieldSize,
  defaultPreparedContentSize,
  draftMarkFontSize,
} from "@/lib/signing/draft-field-sizing";
import { approximateHelveticaWidth } from "@/lib/pdf-text-layout";
import { participantRoleDisplay } from "@/lib/signing/participant-roles";
import { CHECKMARK_POINTS, printedNameFontSize } from "@/lib/signing/prepared-content-geometry";
import { isPreparedContentType } from "@/lib/signing/prepared-content-types";
import { getSigningPreviewAction } from "@/lib/signing/preview-actions";
import type {
  SigningPreviewDocument,
  SigningPreviewField,
  SigningPreviewModel,
  SigningPreviewParticipant,
} from "@/lib/signing/preview";
import {
  removeDraftPreparedContentAction,
  removeDraftSigningFieldAction,
  upsertDraftPreparedContentAction,
  upsertDraftSigningFieldAction,
} from "@/lib/signing/stage3-actions";
import {
  clickToPdfCoordinates,
  renderRectToPdfPlacement,
  type PageMetrics,
} from "@/lib/types/template-pdf-field";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Document, Page } from "react-pdf";
import { Rnd } from "react-rnd";

export type SigningDocumentWorkspaceMode = "preview" | "prepare";

const ADOPTION_BOUNDARY_COPY =
  "Place signing fields for each participant. Participants adopt their signatures and initials when they sign.";

const fieldTypeLabel = draftFieldTypeLabel;

function participantOptionLabel(participant: SigningPreviewParticipant): string {
  const role = participantRoleDisplay(participant.roleCode, participant.optionalRole);
  const representing =
    participant.capacityMode === "REPRESENTATIVE" && participant.representedPartyName
      ? ` (representing ${participant.representedPartyName})`
      : "";
  return `${participant.fullName}${role ? ` — ${role}` : ""}${representing}`;
}

function dateSourceLabel(field: SigningPreviewField): string {
  return `${draftFieldTypeLabel(field.fieldType)} · page ${field.pageNumber}`;
}

/**
 * The renderer puts the baseline 1pt + font size below the box top; a
 * line-height:1 CSS box puts it about 0.84em down, so pad the difference.
 */
const BASELINE_OFFSET_EM = 0.16;

/** Exact PDF geometry scaled to the rendered page; never inflated. */
function toRenderRect(field: PdfRect, metrics: PageMetrics): PdfRect {
  return {
    x: (field.x / metrics.originalWidth) * metrics.renderedWidth,
    y: (field.y / metrics.originalHeight) * metrics.renderedHeight,
    width: (field.width / metrics.originalWidth) * metrics.renderedWidth,
    height: (field.height / metrics.originalHeight) * metrics.renderedHeight,
  };
}

const FIELD_BORDER: Record<DraftFieldType, string> = {
  SIGNATURE: "border-sky-600",
  INITIALS: "border-emerald-600",
  DATE_SIGNED: "border-amber-600",
  PRINTED_NAME: "border-dashed border-violet-600",
  CHECKMARK: "border-dashed border-slate-500",
};

/** Overlay font size (PDF pt) for the text a placement will show. */
function overlayFontPt(field: SigningPreviewField, text: string): number {
  if (field.fieldType === "PRINTED_NAME") {
    return printedNameFontSize({
      text,
      width: field.width,
      height: field.height,
      measureWidth: approximateHelveticaWidth,
    });
  }
  if (field.fieldType === "CHECKMARK") return field.height;
  return draftMarkFontSize(field.fieldType, text, field);
}

function CheckmarkGlyph() {
  const path = CHECKMARK_POINTS.map(([x, y], index) =>
    `${index === 0 ? "M" : "L"}${x * 100} ${y * 100}`,
  ).join(" ");
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="h-full w-full text-foreground/80">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={12} strokeLinecap="square" />
    </svg>
  );
}

function SigningFieldOverlay({
  field,
  metrics,
  editable,
  selected,
  showRemove,
  offset,
  onPress,
  onDragMove,
  onDragEnd,
  onResizeCommit,
  onRemove,
  dateLink = null,
}: {
  field: SigningPreviewField;
  metrics: PageMetrics;
  editable: boolean;
  selected: boolean;
  showRemove: boolean;
  /**
   * Date Signed tool active: "candidate" marks a Signature/Initials the Date
   * may link to, "source" the armed one. Either is clicked, not dragged.
   */
  dateLink?: "candidate" | "source" | null;
  /** Live group-drag offset (render px) for selected followers. */
  offset: { dx: number; dy: number } | null;
  onPress: (fieldId: string, toggle: boolean) => void;
  onDragMove: (fieldId: string, delta: { dx: number; dy: number }) => void;
  /** `renderRect` is null when the drag stop was a click without movement. */
  onDragEnd: (fieldId: string, renderRect: PdfRect | null) => void;
  onResizeCommit: (fieldId: string, renderRect: PdfRect) => void;
  onRemove: (fieldId: string) => void;
}) {
  const rect = toRenderRect(field, metrics);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const description = draftFieldDescription(field);
  const markText = draftFieldCompactLabel(field);
  const scale = metrics.renderedWidth / metrics.originalWidth;
  const markFontPt = overlayFontPt(field, markText);
  const markFontPx = markFontPt * scale;
  const typed = field.fieldType === "SIGNATURE" || field.fieldType === "INITIALS";
  const printed = field.fieldType === "PRINTED_NAME";
  const label =
    field.fieldType === "CHECKMARK" ? (
      <div
        className="flex h-full items-center justify-center"
        aria-label={description}
        data-field-type={field.fieldType}
        data-field-label={markText}
      >
        <CheckmarkGlyph />
      </div>
    ) : (
      <div
        className={cn(
          "flex h-full overflow-hidden",
          printed ? "items-center" : "items-start",
          typed || printed ? "justify-start" : "justify-center",
        )}
        aria-label={description}
        data-field-type={field.fieldType}
        data-field-label={markText}
        style={
          printed
            ? { paddingLeft: 2 * scale }
            : { paddingTop: (1 + BASELINE_OFFSET_EM * markFontPt) * scale }
        }
      >
        <span
          aria-hidden
          className="whitespace-nowrap leading-none text-foreground/80"
          style={{
            fontSize: markFontPx,
            fontFamily: typed ? "Caveat, cursive" : "Helvetica, Arial, sans-serif",
          }}
        >
          {markText}
        </span>
      </div>
    );

  if (!editable) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute box-border rounded-sm border bg-background/80",
          FIELD_BORDER[field.fieldType],
        )}
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        title={description}
      >
        {label}
      </div>
    );
  }

  return (
    <Rnd
      bounds="parent"
      size={{ width: rect.width, height: rect.height }}
      position={{ x: rect.x + (offset?.dx ?? 0), y: rect.y + (offset?.dy ?? 0) }}
      minWidth={field.fieldType === "CHECKMARK" ? 6 : 12}
      minHeight={field.fieldType === "CHECKMARK" ? 6 : 8}
      cancel=".signing-field-remove"
      disableDragging={dateLink !== null}
      enableResizing={dateLink === null}
      className={cn(
        "signing-field-overlay absolute box-border rounded-sm border bg-background/85",
        FIELD_BORDER[field.fieldType],
        selected && "z-10 bg-sky-50/90 ring-2 ring-sky-500 ring-offset-1",
        dateLink === "candidate" &&
          "cursor-pointer ring-2 ring-amber-400 ring-offset-1 hover:bg-amber-50/90",
        dateLink === "source" && "z-10 bg-amber-50/90 ring-2 ring-amber-600 ring-offset-1",
      )}
      data-selected={selected ? "true" : undefined}
      data-date-link-candidate={dateLink ? "true" : undefined}
      data-date-link-source={dateLink === "source" ? "true" : undefined}
      onMouseDown={(event: MouseEvent) => {
        event.stopPropagation();
        onPress(field.id, isSelectionToggle(event));
      }}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
      }}
      onDragStart={(_event, data) => {
        dragStartRef.current = { x: data.x, y: data.y };
      }}
      onDrag={(_event, data) => {
        const start = dragStartRef.current ?? { x: rect.x, y: rect.y };
        onDragMove(field.id, { dx: data.x - start.x, dy: data.y - start.y });
      }}
      onDragStop={(_event, data) => {
        const start = dragStartRef.current ?? { x: rect.x, y: rect.y };
        dragStartRef.current = null;
        // react-draggable reports a drag stop on every click; only real
        // movement persists.
        onDragEnd(
          field.id,
          dragExceededThreshold(start, { x: data.x, y: data.y })
            ? { x: data.x, y: data.y, width: rect.width, height: rect.height }
            : null,
        );
      }}
      onResizeStart={() => onPress(field.id, false)}
      onResizeStop={(_event, _dir, ref, _delta, position) => {
        onResizeCommit(field.id, {
          x: position.x,
          y: position.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        });
      }}
      title={description}
    >
      {label}
      {showRemove ? (
        <button
          type="button"
          className="signing-field-remove absolute -top-5 right-0 whitespace-nowrap rounded border border-border bg-background px-1 text-[10px] leading-4 text-destructive shadow-sm"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onRemove(field.id);
          }}
        >
          Remove
        </button>
      ) : null}
    </Rnd>
  );
}
export function SigningPreviewDialog({
  open,
  signingId,
  mode = "preview",
  initialDocumentId = null,
  onClose,
  onChanged,
}: {
  open: boolean;
  signingId: string;
  mode?: SigningDocumentWorkspaceMode;
  initialDocumentId?: string | null;
  onClose: () => void;
  onChanged?: () => Promise<void>;
}) {
  const titleId = useId();
  const editable = mode === "prepare";
  const [model, setModel] = useState<SigningPreviewModel | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [selectedFieldType, setSelectedFieldType] =
    useState<DraftFieldType>("SIGNATURE");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const selectedFieldId = selectedFieldIds.length === 1 ? selectedFieldIds[0] : null;
  const [groupDrag, setGroupDrag] = useState<{
    ids: string[];
    dx: number;
    dy: number;
  } | null>(null);
  const [clipboard, setClipboard] = useState<PlacementClipboardItem[] | null>(null);
  /**
   * Paste-placement mode: the next page click anchors the clipboard group and
   * never places a normal field. `pastePreview` is the hovered anchor.
   */
  const [pasteMode, setPasteMode] = useState(false);
  const [pastePreview, setPastePreview] = useState<PasteAnchor | null>(null);
  /**
   * Armed Date Signed source (clicked on the page or chosen under Link to).
   * "" = not armed: a Date Signed never links without an explicit source.
   */
  const [dateLinkSourceId, setDateLinkSourceId] = useState("");
  /** Hovered spot for the armed Date Signed ghost. */
  const [datePreview, setDatePreview] = useState<PasteAnchor | null>(null);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const pressRef = useRef<{ id: string; toggle: boolean; wasSelected: boolean } | null>(null);
  const [pageSizes, setPageSizes] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [numPagesByDocument, setNumPagesByDocument] = useState<
    Record<string, number>
  >({});
  const [pendingCount, setPendingCount] = useState(0);
  const [workspaceEl, setWorkspaceEl] = useState<HTMLDivElement | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>("fit-width");
  const [zoomPercent, setZoomPercent] = useState(100);

  const modelRef = useRef<SigningPreviewModel | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const idMapRef = useRef(new Map<string, string>());
  const localIdSeqRef = useRef(0);
  const dirtyRef = useRef(false);
  const pointerStartedOnFieldRef = useRef(false);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  /** The positioned page surfaces (PDF canvas + overlays), by page number. */
  const pageSurfaceRefs = useRef<Record<number, HTMLDivElement | null>>({});
  /** Last pointer position, so ghosts follow the cursor across scrolling. */
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  /** Queued server writes read `modelRef`, so it updates synchronously. */
  const replaceModel = useCallback((next: SigningPreviewModel | null) => {
    modelRef.current = next;
    setModel(next);
  }, []);

  const updateModel = useCallback(
    (update: (current: SigningPreviewModel) => SigningPreviewModel) => {
      if (!modelRef.current) return;
      replaceModel(update(modelRef.current));
    },
    [replaceModel],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setInitialLoading(true);
    setError(null);
    setSelectedFieldIds([]);
    setClipboard(null);
    setPasteMode(false);
    setPastePreview(null);
    setDateLinkSourceId("");
    setDatePreview(null);
    setEditorNotice(null);
    idMapRef.current = new Map();
    dirtyRef.current = false;
    void (async () => {
      const result = await getSigningPreviewAction({ signingId });
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        replaceModel(null);
      } else {
        const data = result.data as SigningPreviewModel;
        replaceModel(data);
        setSelectedParticipantId((previous) =>
          previous && data.participants.some((row) => row.id === previous)
            ? previous
            : (data.participants[0]?.id ?? ""),
        );
        setCurrentDocumentId(
          initialDocumentId &&
            data.documents.some((document) => document.id === initialDocumentId)
            ? initialDocumentId
            : (data.documents[0]?.id ?? null),
        );
      }
      setInitialLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, signingId, initialDocumentId, replaceModel]);

  useEffect(() => {
    if (!open) return;
    acquirePdfWorker();
    return () => {
      releasePdfWorker();
    };
  }, [open]);

  useEffect(() => {
    if (!workspaceEl) return;
    const update = () =>
      setWorkspaceSize({
        width: workspaceEl.clientWidth,
        height: workspaceEl.clientHeight,
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(workspaceEl);
    return () => observer.disconnect();
  }, [workspaceEl]);

  const documents = useMemo(() => model?.documents ?? [], [model]);
  const documentIndex = documents.findIndex(
    (document) => document.id === currentDocumentId,
  );
  const currentDocument: SigningPreviewDocument | null =
    documentIndex >= 0 ? documents[documentIndex] : null;
  const pdfUrl = currentDocument?.hasSelectedSnapshot
    ? `/signings/${signingId}/preview/document/${currentDocument.id}`
    : null;
  const numPages = currentDocument
    ? (numPagesByDocument[currentDocument.id] ?? 0)
    : 0;
  const basePage = currentDocument
    ? pageSizes[`${currentDocument.id}:1`]
    : undefined;

  const pageWidth = useMemo(() => {
    if (!basePage) return PDF_MIN_PAGE_WIDTH;
    return computePdfPageWidth({
      mode: zoomMode,
      zoomPercent,
      basePageWidth: basePage.width,
      basePageHeight: basePage.height,
      workspaceWidth: workspaceSize.width,
      workspaceHeight: workspaceSize.height,
    });
  }, [basePage, zoomMode, zoomPercent, workspaceSize]);

  const selectedField = useMemo(
    () =>
      selectedFieldId && model ? (findField(model, selectedFieldId)?.field ?? null) : null,
    [model, selectedFieldId],
  );

  const resolveId = useCallback(
    (id: string) => idMapRef.current.get(id) ?? id,
    [],
  );

  const enqueue = useCallback((task: () => Promise<void>) => {
    dirtyRef.current = true;
    setPendingCount((count) => count + 1);
    queueRef.current = queueRef.current
      .then(task)
      .catch(() => undefined)
      .finally(() => setPendingCount((count) => count - 1));
  }, []);

  /** Trusted server state wins after a failed write; view state is kept. */
  const reconcile = useCallback(async () => {
    const result = await getSigningPreviewAction({ signingId });
    if (!result.ok) return;
    const data = result.data as SigningPreviewModel;
    replaceModel(data);
    setSelectedFieldIds((previous) =>
      previous.map(resolveId).filter((id) => findField(data, id) !== null),
    );
  }, [signingId, resolveId, replaceModel]);

  function metricsFor(documentId: string, pageNumber: number): PageMetrics | null {
    const size = pageSizes[`${documentId}:${pageNumber}`];
    if (!size) return null;
    return {
      originalWidth: size.width,
      originalHeight: size.height,
      renderedWidth: pageWidth,
      renderedHeight: (size.height / size.width) * pageWidth,
    };
  }

  /** Trusted write for one placement: signer field or prepared content. */
  function savePlacement(
    documentId: string,
    field: SigningPreviewField,
    existingId: string | undefined,
  ) {
    if (isPreparedContentType(field.fieldType)) {
      return upsertDraftPreparedContentAction({
        signingId,
        contentId: existingId,
        signingDocumentId: documentId,
        signingParticipantId: field.participantId || undefined,
        contentType: field.fieldType,
        pageNumber: field.pageNumber,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
      });
    }
    return upsertDraftSigningFieldAction({
      signingId,
      fieldId: existingId,
      signingDocumentId: documentId,
      signingParticipantId: field.participantId,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      pageNumber: field.pageNumber,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      linkedSignatureDraftFieldId: field.linkedSignatureFieldId
        ? resolveId(field.linkedSignatureFieldId)
        : undefined,
    });
  }

  function persistField(fieldId: string) {
    enqueue(async () => {
      const realId = resolveId(fieldId);
      // A failed create leaves only a local id; nothing to update server-side.
      if (realId.startsWith("local-")) return;
      const located = modelRef.current ? findField(modelRef.current, realId) : null;
      if (!located) return;
      const result = await savePlacement(located.documentId, located.field, realId);
      if (!result.ok) {
        setError(result.error);
        await reconcile();
      }
    });
  }

  function newLocalId(): string {
    localIdSeqRef.current += 1;
    return `local-${localIdSeqRef.current}`;
  }

  function buildLocalField(
    id: string,
    fieldType: DraftFieldType,
    pageNumber: number,
    rect: PdfRect,
    linkedSignatureFieldId: string | null,
  ): SigningPreviewField | null {
    const participant = placementHasParticipant(fieldType)
      ? model?.participants.find((row) => row.id === selectedParticipantId)
      : null;
    if (placementHasParticipant(fieldType) && !participant) return null;
    return {
      id,
      fieldType,
      isRequired: !isPreparedContentType(fieldType),
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
  }

  /** Point on a page (PDF units) for a mouse event over that page. */
  function eventPdfPoint(
    event: ReactMouseEvent<HTMLElement>,
    pageNumber: number,
  ): PasteAnchor | null {
    if (!currentDocument) return null;
    const metrics = metricsFor(currentDocument.id, pageNumber);
    if (!metrics) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = clickToPdfCoordinates(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      metrics,
    );
    return { pageNumber, x: point.x, y: point.y };
  }

  /** The armed Date Signed source, when it is still valid for this participant. */
  function armedDateSource(): SigningPreviewField | null {
    if (!editable || selectedFieldType !== "DATE_SIGNED" || !currentDocument) return null;
    return resolveDateLinkSource(
      currentDocument.fields,
      selectedParticipantId,
      dateLinkSourceId,
    );
  }

  function armDateLink(source: SigningPreviewField) {
    setDateLinkSourceId(source.id);
    setSelectedFieldIds([]);
    setError(null);
    setEditorNotice(
      `Linked to: ${dateLinkSourceDisplay(source)}. Click the page to place the Date Signed. Press Esc to cancel.`,
    );
    const pointer = lastPointerRef.current;
    setDatePreview(pointer ? pointToPageAnchor(pointer.x, pointer.y) : null);
  }

  function disarmDateLink(notice: string | null = null) {
    setDateLinkSourceId("");
    setDatePreview(null);
    setEditorNotice(notice);
  }

  /** Page anchor (PDF units) under a viewport point, or null off-page. */
  function pointToPageAnchor(clientX: number, clientY: number): PasteAnchor | null {
    if (!currentDocument) return null;
    if (workspaceEl) {
      const view = workspaceEl.getBoundingClientRect();
      if (
        clientX < view.left ||
        clientX > view.right ||
        clientY < view.top ||
        clientY > view.bottom
      ) {
        return null;
      }
    }
    for (const [key, element] of Object.entries(pageSurfaceRefs.current)) {
      if (!element) continue;
      const bounds = element.getBoundingClientRect();
      if (
        clientX < bounds.left ||
        clientX > bounds.right ||
        clientY < bounds.top ||
        clientY > bounds.bottom
      ) {
        continue;
      }
      const pageNumber = Number(key);
      const metrics = metricsFor(currentDocument.id, pageNumber);
      if (!metrics) return null;
      const point = clickToPdfCoordinates(
        clientX - bounds.left,
        clientY - bounds.top,
        metrics,
      );
      return { pageNumber, x: point.x, y: point.y };
    }
    return null;
  }

  /** Ghost of the armed Date Signed at the hovered spot (left-anchored). */
  function datePreviewRect(pageNumber: number): PdfRect | null {
    if (!datePreview || datePreview.pageNumber !== pageNumber || !currentDocument) {
      return null;
    }
    if (!armedDateSource()) return null;
    const participant = model?.participants.find(
      (row) => row.id === selectedParticipantId,
    );
    const metrics = metricsFor(currentDocument.id, pageNumber);
    if (!participant || !metrics) return null;
    return newPlacementRect(
      "DATE_SIGNED",
      datePreview,
      defaultDraftFieldSize("DATE_SIGNED", participant),
      { width: metrics.originalWidth, height: metrics.originalHeight },
    );
  }

  function placeFieldAt(
    event: ReactMouseEvent<HTMLDivElement>,
    pageNumber: number,
  ) {
    if (!editable || !currentDocument || !model) return;
    // Paste-placement mode is handled by its capture layer; never place here.
    if (pasteMode) return;
    // A press that began on a field (select, drag, resize, Remove) never places.
    if (pointerStartedOnFieldRef.current) {
      pointerStartedOnFieldRef.current = false;
      return;
    }
    if ((event.target as HTMLElement).closest(".signing-field-overlay")) return;
    const placingLinkedDate =
      selectedFieldType === "DATE_SIGNED" && dateLinkSourceId !== "";
    // With placements selected, a click on empty page area clears the
    // selection, unless a Date Signed is armed and waiting for this click.
    if (selectedFieldIds.length > 0) {
      setSelectedFieldIds([]);
      if (!placingLinkedDate) return;
    }
    const needsParticipant = placementHasParticipant(selectedFieldType);
    if (needsParticipant && !selectedParticipantId) {
      setError("Add a participant before placing fields.");
      return;
    }
    const metrics = metricsFor(currentDocument.id, pageNumber);
    const point = eventPdfPoint(event, pageNumber);
    if (!metrics || !point) return;
    setError(null);

    const page = { width: metrics.originalWidth, height: metrics.originalHeight };
    const participant = model.participants.find(
      (row) => row.id === selectedParticipantId,
    );
    if (needsParticipant && !participant) return;
    const size = isPreparedContentType(selectedFieldType)
      ? defaultPreparedContentSize(selectedFieldType, participant?.fullName ?? "")
      : defaultDraftFieldSize(selectedFieldType, participant!);
    const rect = newPlacementRect(selectedFieldType, point, size, page);

    let linkedSignatureDraftFieldId: string | null = null;
    let linkedSource: SigningPreviewField | null = null;
    if (selectedFieldType === "DATE_SIGNED") {
      if (!dateLinkSourceId) {
        setError(
          "Click the Signature or Initials this Date Signed belongs to (or choose it under Link to), then click where the date goes.",
        );
        return;
      }
      linkedSource = armedDateSource();
      if (!linkedSource) {
        disarmDateLink();
        setError(
          "That Signature or Initials is no longer available for this participant. Click another one.",
        );
        return;
      }
      linkedSignatureDraftFieldId = linkedSource.id;
    }

    const documentId = currentDocument.id;
    const fieldId = newLocalId();
    const field = buildLocalField(
      fieldId,
      selectedFieldType,
      pageNumber,
      rect,
      linkedSignatureDraftFieldId,
    );
    if (!field) return;

    const pairedDate =
      selectedFieldType === "SIGNATURE"
        ? buildLocalField(
            newLocalId(),
            "DATE_SIGNED",
            pageNumber,
            pairedDatePlacement(rect, page),
            fieldId,
          )
        : null;

    updateModel((current) => {
      const withField = addField(current, documentId, field);
      return pairedDate ? addField(withField, documentId, pairedDate) : withField;
    });
    persistNewFields(documentId, pairedDate ? [field, pairedDate] : [field]);
    if (linkedSource) {
      disarmDateLink(`Date Signed linked to ${dateLinkSourceDisplay(linkedSource)}.`);
    }
  }

  async function createField(
    documentId: string,
    local: SigningPreviewField,
  ): Promise<boolean> {
    const result = await savePlacement(documentId, local, undefined);
    if (!result.ok) {
      setError(result.error);
      await reconcile();
      return false;
    }
    const row = result.data as { id: string };
    idMapRef.current.set(local.id, row.id);
    updateModel((current) => replaceFieldId(current, local.id, row.id));
    setSelectedFieldIds((previous) =>
      previous.map((id) => (id === local.id ? row.id : id)),
    );
    return true;
  }

  /** Persist new local fields in order; a Date waits for its Signature's id. */
  function persistNewFields(documentId: string, fields: SigningPreviewField[]) {
    enqueue(async () => {
      for (const local of fields) {
        // The field may have been removed locally before it was persisted.
        const located = modelRef.current ? findField(modelRef.current, local.id) : null;
        if (!located) continue;
        const link = located.field.linkedSignatureFieldId;
        if (link && resolveId(link).startsWith("local-")) continue;
        if (!(await createField(documentId, located.field))) return;
      }
    });
  }

  function pressField(fieldId: string, toggle: boolean) {
    // Date Signed tool: clicking a Signature/Initials picks the Date's source.
    if (
      editable &&
      selectedFieldType === "DATE_SIGNED" &&
      !pasteMode &&
      !toggle &&
      currentDocument
    ) {
      pressRef.current = null;
      const source = resolveDateLinkSource(
        currentDocument.fields,
        selectedParticipantId,
        fieldId,
      );
      if (source) {
        armDateLink(source);
        return;
      }
      const participant = model?.participants.find(
        (row) => row.id === selectedParticipantId,
      );
      setError(
        participant
          ? `Date Signed links only to a Signature or Initials for ${participant.fullName}.`
          : "Choose a participant before linking a Date Signed.",
      );
    }
    const wasSelected = selectedFieldIds.includes(fieldId);
    pressRef.current = { id: fieldId, toggle, wasSelected };
    if (toggle) {
      setSelectedFieldIds((previous) => toggleSelection(previous, fieldId));
    } else if (!wasSelected) {
      setSelectedFieldIds([fieldId]);
    }
  }

  /** Placements that move with a drag of `anchorId` and their page metrics. */
  function dragGroup(anchorId: string) {
    if (!model) return null;
    const located = findField(model, anchorId);
    if (!located) return null;
    const metrics = metricsFor(located.documentId, located.field.pageNumber);
    if (!metrics) return null;
    return {
      located,
      metrics,
      ids: groupMoveIds(model, selectedFieldIds, anchorId),
      page: { width: metrics.originalWidth, height: metrics.originalHeight },
    };
  }

  function dragFieldMove(anchorId: string, deltaPx: { dx: number; dy: number }) {
    const group = dragGroup(anchorId);
    if (!group || group.ids.length < 2 || !model) {
      if (groupDrag) setGroupDrag(null);
      return;
    }
    const { metrics, ids, page } = group;
    const toPt = metrics.originalWidth / metrics.renderedWidth;
    const rects = ids.map((id) => findField(model, id)!.field);
    const clamped = clampGroupDelta(
      rects,
      { dx: deltaPx.dx * toPt, dy: deltaPx.dy * toPt },
      page,
    );
    setGroupDrag({
      ids: ids.filter((id) => id !== anchorId),
      dx: clamped.dx / toPt,
      dy: clamped.dy / toPt,
    });
  }

  function dragFieldEnd(anchorId: string, renderRect: PdfRect | null) {
    setGroupDrag(null);
    const press = pressRef.current;
    pressRef.current = null;
    if (!renderRect) {
      // A plain click on an already-selected placement selects only it.
      if (press && press.id === anchorId && !press.toggle && press.wasSelected) {
        setSelectedFieldIds([anchorId]);
      }
      return;
    }
    const group = dragGroup(anchorId);
    if (!group) return;
    const { located, metrics, ids, page } = group;
    const pdf = renderRectToPdfPlacement(renderRect, metrics);
    const delta = { dx: pdf.x - located.field.x, dy: pdf.y - located.field.y };
    updateModel((current) => moveGroup(current, ids, delta, page));
    for (const id of ids) persistField(id);
  }

  function commitGeometry(fieldId: string, renderRect: PdfRect) {
    if (!model) return;
    const located = findField(model, fieldId);
    if (!located) return;
    const metrics = metricsFor(located.documentId, located.field.pageNumber);
    if (!metrics) return;
    const pdf = renderRectToPdfPlacement(renderRect, metrics);
    const rect = clampRectToPage(
      { x: pdf.x, y: pdf.y, width: pdf.width, height: pdf.height },
      { width: metrics.originalWidth, height: metrics.originalHeight },
    );
    updateModel((current) => moveField(current, fieldId, rect));
    persistField(fieldId);
  }

  /** Remove placements (a Signature takes its Date Signed) via trusted writes. */
  function removeSelectedFields(fieldIds: readonly string[]) {
    if (!model || fieldIds.length === 0) return;
    const ids = expandRemovalIds(model, fieldIds);
    if (ids.length === 0) return;
    setError(null);
    setEditorNotice(null);
    const preparedIds = new Set(
      fieldIds.filter((id) => {
        const located = findField(model, id);
        return located !== null && isPreparedContentType(located.field.fieldType);
      }),
    );
    updateModel((current) => removeFields(current, ids));
    setSelectedFieldIds([]);
    const primary = [...fieldIds];
    enqueue(async () => {
      for (const fieldId of primary) {
        const realId = resolveId(fieldId);
        if (realId.startsWith("local-")) continue;
        const result = preparedIds.has(fieldId)
          ? await removeDraftPreparedContentAction({ signingId, contentId: realId })
          : await removeDraftSigningFieldAction({ signingId, fieldId: realId });
        if (!result.ok) {
          setError(result.error);
          await reconcile();
          return;
        }
        const removed =
          (result.data as { removedFieldIds?: string[] } | undefined)
            ?.removedFieldIds ?? [];
        updateModel((current) => removeFields(current, removed));
      }
    });
  }

  function removeField(fieldId: string) {
    removeSelectedFields([fieldId]);
  }

  /** Copy puts the selection on the clipboard and goes straight to placing it. */
  function copySelection() {
    if (!model || selectedFieldIds.length === 0) return;
    const items = copyPlacements(model, selectedFieldIds);
    setClipboard(items);
    startPasteMode(
      items,
      `Copied ${items.length} placement${items.length === 1 ? "" : "s"}. Click the page where the copy should go. Press Esc to cancel.`,
    );
  }

  function currentDocumentPageSizes(): Record<number, { width: number; height: number }> {
    const sizes: Record<number, { width: number; height: number }> = {};
    if (!currentDocument) return sizes;
    for (let pageNumber = 1; pageNumber <= numPages; pageNumber += 1) {
      const size = pageSizes[`${currentDocument.id}:${pageNumber}`];
      if (size) sizes[pageNumber] = size;
    }
    return sizes;
  }

  /** Paste (button or Ctrl/⌘+V) arms paste-placement mode; the next page click places. */
  function startPasteMode(
    items: PlacementClipboardItem[] | null = clipboard,
    notice = "Click the page where the pasted placements should go. Press Esc to cancel.",
  ) {
    if (!model || !currentDocument || !items || items.length === 0) return;
    setSelectedFieldIds([]);
    setError(null);
    setDateLinkSourceId("");
    setDatePreview(null);
    setPasteMode(true);
    const pointer = lastPointerRef.current;
    setPastePreview(pointer ? pointToPageAnchor(pointer.x, pointer.y) : null);
    setEditorNotice(notice);
  }

  function cancelPasteMode() {
    if (!pasteMode) return;
    setPasteMode(false);
    setPastePreview(null);
    setEditorNotice(null);
  }

  function changeFieldType(next: DraftFieldType) {
    cancelPasteMode();
    if (dateLinkSourceId) disarmDateLink();
    setSelectedFieldType(next);
  }

  function pasteAt(anchor: PasteAnchor) {
    if (!model || !currentDocument || !clipboard || clipboard.length === 0) return;
    const plan = planPaste({
      model,
      documentId: currentDocument.id,
      clipboard,
      pageSizes: currentDocumentPageSizes(),
      anchor,
      newId: newLocalId,
    });
    setError(plan.rejected.length > 0 ? plan.rejected.join(" ") : null);
    if (plan.fields.length === 0) return;
    const documentId = currentDocument.id;
    setPasteMode(false);
    setPastePreview(null);
    updateModel((current) =>
      plan.fields.reduce((next, field) => addField(next, documentId, field), current),
    );
    setSelectedFieldIds(plan.fields.map((field) => field.id));
    setEditorNotice(
      `Pasted ${plan.fields.length} placement${plan.fields.length === 1 ? "" : "s"}.`,
    );
    persistNewFields(documentId, plan.fields);
  }

  /** Ghost rects (one page) for the hovered paste anchor; nothing is created. */
  function pastePreviewRects(pageNumber: number): SigningPreviewField[] {
    if (!pasteMode || !pastePreview || !model || !currentDocument || !clipboard) return [];
    let ghost = 0;
    const plan = planPaste({
      model,
      documentId: currentDocument.id,
      clipboard,
      pageSizes: currentDocumentPageSizes(),
      anchor: pastePreview,
      newId: () => `paste-preview-${(ghost += 1)}`,
    });
    return plan.fields.filter((field) => field.pageNumber === pageNumber);
  }

  function reassignSelectedField(participantId: string) {
    if (!model || !selectedFieldId) return;
    const located = findField(model, selectedFieldId);
    if (!located || located.field.participantId === participantId) return;
    setError(null);

    if (!placementHasParticipant(located.field.fieldType)) return;

    let linkedSignatureDraftFieldId: string | null = null;
    if (located.field.fieldType === "DATE_SIGNED") {
      const document = model.documents.find((row) => row.id === located.documentId);
      const source = document
        ? (preferredSignatureForDate(
            document.fields,
            participantId,
            located.field.pageNumber,
          ) ?? dateSourceOptions(document.fields, participantId)[0] ?? null)
        : null;
      if (!source) {
        setError(
          "Reassign Date Signed only to a participant who already has a Signature or Initials on this document.",
        );
        return;
      }
      linkedSignatureDraftFieldId = source.id;
    }

    const fieldId = selectedFieldId;
    updateModel((current) =>
      reassignField(current, fieldId, participantId, linkedSignatureDraftFieldId),
    );
    persistField(fieldId);
  }

  /** Link the selected Date Signed to another Signature/Initials of its participant. */
  function relinkSelectedDate(sourceId: string) {
    if (!model || !selectedFieldId) return;
    const located = findField(model, selectedFieldId);
    if (!located || located.field.fieldType !== "DATE_SIGNED") return;
    if (located.field.linkedSignatureFieldId === sourceId) return;
    const document = model.documents.find((row) => row.id === located.documentId);
    const source = document
      ? dateSourceOptions(document.fields, located.field.participantId).find(
          (field) => field.id === sourceId,
        )
      : null;
    if (!source) return;
    setError(null);
    const fieldId = selectedFieldId;
    updateModel((current) =>
      reassignField(current, fieldId, located.field.participantId, source.id),
    );
    persistField(fieldId);
  }

  function selectField(fieldId: string, scroll = false) {
    setSelectedFieldIds([fieldId]);
    if (!scroll || !model || !workspaceEl) return;
    const located = findField(model, fieldId);
    const pageEl = located ? pageRefs.current[located.field.pageNumber] : null;
    if (pageEl) scrollElementIntoContainer(workspaceEl, pageEl);
  }

  function goToDocument(documentId: string) {
    cancelPasteMode();
    if (dateLinkSourceId) disarmDateLink();
    setCurrentDocumentId(documentId);
    setSelectedFieldIds([]);
    pageRefs.current = {};
    pageSurfaceRefs.current = {};
    if (workspaceEl) workspaceEl.scrollTop = 0;
  }

  const handleClose = useCallback(() => {
    if (dirtyRef.current && onChanged) {
      dirtyRef.current = false;
      void queueRef.current.then(() => onChanged());
    }
    onClose();
  }, [onChanged, onClose]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (pasteMode) {
          cancelPasteMode();
        } else if (selectedFieldType === "DATE_SIGNED" && dateLinkSourceId) {
          disarmDateLink();
        } else if (selectedFieldIds.length > 0) {
          setSelectedFieldIds([]);
        } else {
          handleClose();
        }
        return;
      }
      if (!editable || isTypingTarget(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedFieldIds.length === 0) return;
        event.preventDefault();
        removeSelectedFields(selectedFieldIds);
      } else if (command && event.key.toLowerCase() === "c") {
        if (selectedFieldIds.length === 0) return;
        event.preventDefault();
        copySelection();
      } else if (command && event.key.toLowerCase() === "v") {
        if (!clipboard || clipboard.length === 0) return;
        event.preventDefault();
        startPasteMode();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!open) return;
    function onPointerMove(event: MouseEvent) {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    }
    window.addEventListener("mousemove", onPointerMove);
    return () => window.removeEventListener("mousemove", onPointerMove);
  }, [open]);

  // Scrolling moves the pages under a still cursor: re-aim the ghost at the
  // cursor (possibly on another page). Scrolling never places or cancels.
  useEffect(() => {
    if (!open || !workspaceEl) return;
    const tracking = pasteMode || (selectedFieldType === "DATE_SIGNED" && dateLinkSourceId);
    if (!tracking) return;
    function onScroll() {
      const pointer = lastPointerRef.current;
      const anchor = pointer ? pointToPageAnchor(pointer.x, pointer.y) : null;
      if (pasteMode) setPastePreview(anchor);
      else setDatePreview(anchor);
    }
    workspaceEl.addEventListener("scroll", onScroll, { passive: true });
    return () => workspaceEl.removeEventListener("scroll", onScroll);
  });
  if (!open) return null;

  const zoomLabel = basePage
    ? `${displayZoomPercent(pageWidth, basePage.width)}%`
    : "—";
  const dateToolActive =
    editable && selectedFieldType === "DATE_SIGNED" && !pasteMode && currentDocument != null;
  const dateLinkCandidateIds = new Set(
    dateToolActive
      ? dateSourceOptions(currentDocument!.fields, selectedParticipantId).map(
          (field) => field.id,
        )
      : [],
  );
  const armedSource = dateToolActive ? armedDateSource() : null;
  const armedSourceId = armedSource?.id ?? null;
  const dateLinkArmed = armedSource !== null;
  const fieldsByPage = new Map<number, SigningPreviewField[]>();
  for (const field of currentDocument?.fields ?? []) {
    const list = fieldsByPage.get(field.pageNumber) ?? [];
    list.push(field);
    fieldsByPage.set(field.pageNumber, list);
  }
  const sortedFields = [...(currentDocument?.fields ?? [])].sort(
    (a, b) => a.pageNumber - b.pageNumber || a.y - b.y || a.x - b.x,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold leading-tight">
            {editable ? "Prepare Documents" : "Preview Signing"}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {editable
              ? "Changes save to Draft preparation only."
              : "Documents and Signing fields exactly as prepared. This does not send or freeze the Signing."}
          </p>
        </div>
        {model ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={documentIndex <= 0}
              onClick={() => goToDocument(documents[documentIndex - 1].id)}
            >
              Previous document
            </Button>
            <select
              aria-label="Document"
              className="h-8 max-w-[16rem] rounded-md border border-input bg-transparent px-2 text-sm"
              value={currentDocumentId ?? ""}
              onChange={(event) => goToDocument(event.target.value)}
              disabled={documents.length === 0}
            >
              {documents.map((document, index) => (
                <option key={document.id} value={document.id}>
                  {index + 1}. {document.displayName}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={documentIndex < 0 || documentIndex >= documents.length - 1}
              onClick={() => goToDocument(documents[documentIndex + 1].id)}
            >
              Next document
            </Button>
          </div>
        ) : null}
        {editable ? (
          <span className="w-16 text-xs text-muted-foreground" aria-live="polite">
            {pendingCount > 0 ? "Saving…" : "Saved"}
          </span>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={handleClose}>
          Close
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_var(--signing-sidebar-width)]"
        style={
          { "--signing-sidebar-width": `${PDF_EDITOR_SIDEBAR_WIDTH}px` } as CSSProperties
        }
      >
        <div className="flex min-h-0 min-w-0 flex-col lg:border-r">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Zoom out"
              disabled={!pdfUrl}
              onClick={() => {
                setZoomMode("custom");
                setZoomPercent(
                  stepZoomPercent(
                    basePage ? displayZoomPercent(pageWidth, basePage.width) : zoomPercent,
                    "out",
                  ),
                );
              }}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="min-w-[3.5rem] text-center text-sm font-medium tabular-nums">
              {zoomLabel}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Zoom in"
              disabled={!pdfUrl}
              onClick={() => {
                setZoomMode("custom");
                setZoomPercent(
                  stepZoomPercent(
                    basePage ? displayZoomPercent(pageWidth, basePage.width) : zoomPercent,
                    "in",
                  ),
                );
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <Button
              type="button"
              size="sm"
              variant={zoomMode === "fit-width" ? "secondary" : "outline"}
              disabled={!pdfUrl}
              onClick={() => setZoomMode("fit-width")}
            >
              Fit Width
            </Button>
            <Button
              type="button"
              size="sm"
              variant={zoomMode === "fit-page" ? "secondary" : "outline"}
              disabled={!pdfUrl}
              onClick={() => setZoomMode("fit-page")}
            >
              Fit Page
            </Button>
            {currentDocument && numPages > 0 ? (
              <span className="ml-auto text-xs text-muted-foreground">
                {numPages} page{numPages === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          {error ? (
            <p className="shrink-0 border-b bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div
            ref={setWorkspaceEl}
            className="isolate min-h-0 flex-1 overflow-auto bg-muted/50"
          >
            {initialLoading ? (
              <p className="p-4 text-sm text-muted-foreground">
                {editable ? "Loading documents…" : "Loading preview…"}
              </p>
            ) : !model ? null : documents.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Add at least one document before{" "}
                {editable ? "preparing fields" : "previewing"}.
              </p>
            ) : currentDocument && !currentDocument.hasSelectedSnapshot ? (
              <p className="p-4 text-sm text-destructive">
                This document has no prepared Draft source snapshot yet. Add or
                re-capture the document before continuing.
              </p>
            ) : currentDocument && pdfUrl ? (
              <div className="flex min-h-full flex-col items-center gap-6 p-6">
                <Document
                  key={currentDocument.id}
                  file={pdfUrl}
                  loading={
                    <p className="text-sm text-muted-foreground">
                      Rendering document…
                    </p>
                  }
                  error={
                    <p className="text-sm text-destructive">
                      Could not load this Signing document.
                    </p>
                  }
                  onLoadSuccess={(pdf) => {
                    const documentId = currentDocument.id;
                    setNumPagesByDocument((previous) =>
                      previous[documentId] === pdf.numPages
                        ? previous
                        : { ...previous, [documentId]: pdf.numPages },
                    );
                  }}
                  className="flex w-max flex-col gap-6"
                >
                  {Array.from({ length: numPages }, (_, index) => {
                    const pageNumber = index + 1;
                    const metrics = metricsFor(currentDocument.id, pageNumber);
                    const pageFields = fieldsByPage.get(pageNumber) ?? [];
                    return (
                      <div
                        key={pageNumber}
                        ref={(element) => {
                          pageRefs.current[pageNumber] = element;
                        }}
                        className="space-y-2"
                      >
                        <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Page {pageNumber}
                        </p>
                        <div
                          ref={(element) => {
                            pageSurfaceRefs.current[pageNumber] = element;
                          }}
                          data-page-surface={pageNumber}
                          className={cn(
                            "relative w-fit border bg-white shadow-md",
                            editable &&
                              (selectedParticipantId ||
                                !placementHasParticipant(selectedFieldType)) &&
                              "cursor-crosshair",
                          )}
                          onMouseDownCapture={(event) => {
                            pointerStartedOnFieldRef.current =
                              (event.target as HTMLElement).closest(
                                ".signing-field-overlay",
                              ) != null;
                          }}
                          onMouseMove={
                            dateLinkArmed
                              ? (event) => setDatePreview(eventPdfPoint(event, pageNumber))
                              : undefined
                          }
                          onMouseLeave={
                            dateLinkArmed ? () => setDatePreview(null) : undefined
                          }
                          onClick={(event) => placeFieldAt(event, pageNumber)}
                        >
                          <Page
                            pageNumber={pageNumber}
                            width={pageWidth}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onLoadSuccess={(page) => {
                              const viewport = page.getViewport({ scale: 1 });
                              const key = `${currentDocument.id}:${pageNumber}`;
                              setPageSizes((previous) =>
                                previous[key]?.width === viewport.width &&
                                previous[key]?.height === viewport.height
                                  ? previous
                                  : {
                                      ...previous,
                                      [key]: {
                                        width: viewport.width,
                                        height: viewport.height,
                                      },
                                    },
                              );
                            }}
                          />
                          {metrics
                            ? pageFields.map((field) => (
                                <SigningFieldOverlay
                                  key={field.id}
                                  field={field}
                                  metrics={metrics}
                                  editable={editable}
                                  selected={selectedFieldIds.includes(field.id)}
                                  showRemove={selectedFieldId === field.id}
                                  offset={
                                    groupDrag?.ids.includes(field.id)
                                      ? { dx: groupDrag.dx, dy: groupDrag.dy }
                                      : null
                                  }
                                  onPress={pressField}
                                  onDragMove={dragFieldMove}
                                  onDragEnd={dragFieldEnd}
                                  onResizeCommit={commitGeometry}
                                  onRemove={removeField}
                                  dateLink={
                                    !dateLinkCandidateIds.has(field.id)
                                      ? null
                                      : field.id === armedSourceId
                                        ? "source"
                                        : "candidate"
                                  }
                                />
                              ))
                            : null}
                          {metrics
                            ? (() => {
                                const ghost = datePreviewRect(pageNumber);
                                if (!ghost) return null;
                                const rect = toRenderRect(ghost, metrics);
                                return (
                                  <div
                                    aria-hidden
                                    data-date-preview
                                    className="pointer-events-none absolute z-20 rounded-sm border-2 border-dashed border-amber-500 bg-amber-100/40"
                                    style={{
                                      left: rect.x,
                                      top: rect.y,
                                      width: rect.width,
                                      height: rect.height,
                                    }}
                                  />
                                );
                              })()
                            : null}
                          {metrics
                            ? pastePreviewRects(pageNumber).map((ghost) => {
                                const rect = toRenderRect(ghost, metrics);
                                return (
                                  <div
                                    key={ghost.id}
                                    aria-hidden
                                    data-paste-preview
                                    className="pointer-events-none absolute z-20 rounded-sm border-2 border-dashed border-sky-500 bg-sky-100/40"
                                    style={{
                                      left: rect.x,
                                      top: rect.y,
                                      width: rect.width,
                                      height: rect.height,
                                    }}
                                  />
                                );
                              })
                            : null}
                          {editable && pasteMode ? (
                            <div
                              data-testid="paste-placement-layer"
                              className="absolute inset-0 z-30 cursor-copy"
                              onMouseDown={(event) => event.stopPropagation()}
                              onMouseMove={(event) =>
                                setPastePreview(eventPdfPoint(event, pageNumber))
                              }
                              onMouseLeave={() => setPastePreview(null)}
                              onClick={(event) => {
                                event.stopPropagation();
                                const anchor = eventPdfPoint(event, pageNumber);
                                if (anchor) pasteAt(anchor);
                              }}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </Document>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="flex min-h-0 flex-col overflow-y-auto border-t p-4 text-sm lg:border-t-0">
          {editable ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{ADOPTION_BOUNDARY_COPY}</p>
              {model ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="prepare-participant">Participant</Label>
                    <select
                      id="prepare-participant"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      value={selectedParticipantId}
                      onChange={(event) => {
                        cancelPasteMode();
                        if (dateLinkSourceId) disarmDateLink();
                        setSelectedParticipantId(event.target.value);
                      }}
                      disabled={
                        model.participants.length === 0 ||
                        !placementHasParticipant(selectedFieldType)
                      }
                    >
                      {model.participants.length === 0 ? (
                        <option value="">Add a participant first</option>
                      ) : (
                        model.participants.map((participant) => (
                          <option key={participant.id} value={participant.id}>
                            {participantOptionLabel(participant)}
                          </option>
                        ))
                      )}
                    </select>
                    {!placementHasParticipant(selectedFieldType) ? (
                      <p className="text-xs text-muted-foreground">
                        A Checkmark is prepared content and belongs to no participant.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="prepare-field-type">Field type</Label>
                    <select
                      id="prepare-field-type"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      value={selectedFieldType}
                      onChange={(event) =>
                        changeFieldType(event.target.value as DraftFieldType)
                      }
                    >
                      <optgroup label="Signing fields">
                        <option value="SIGNATURE">Signature</option>
                        <option value="INITIALS">Initials</option>
                        <option value="DATE_SIGNED">Date Signed</option>
                      </optgroup>
                      <optgroup label="Prepared content">
                        <option value="PRINTED_NAME">Printed Name</option>
                        <option value="CHECKMARK">Checkmark</option>
                      </optgroup>
                    </select>
                  </div>
                  {selectedFieldType === "DATE_SIGNED" && currentDocument ? (
                    <div className="space-y-1">
                      <Label htmlFor="prepare-date-link">Link to</Label>
                      <select
                        id="prepare-date-link"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={armedSourceId ?? ""}
                        onChange={(event) => {
                          const source = resolveDateLinkSource(
                            currentDocument.fields,
                            selectedParticipantId,
                            event.target.value,
                          );
                          if (source) armDateLink(source);
                          else disarmDateLink();
                        }}
                      >
                        <option value="">
                          {dateLinkCandidateIds.size > 0
                            ? "Click a Signature or Initials on the page"
                            : "Place a Signature or Initials first"}
                        </option>
                        {dateSourceOptions(currentDocument.fields, selectedParticipantId).map(
                          (field) => (
                            <option key={field.id} value={field.id}>
                              {dateSourceLabel(field)}
                            </option>
                          ),
                        )}
                      </select>
                      <p className="text-xs text-muted-foreground" data-testid="date-link-status">
                        {armedSource
                          ? `Linked to: ${dateLinkSourceDisplay(armedSource)}. Click the page to place the date.`
                          : "Click the Signature or Initials this date belongs to, then click where the date goes."}{" "}
                        The date shows when that Signature or Initials is applied.
                      </p>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Click the page to place. Drag or resize to adjust. A
                    Signature also places its Date Signed; Initials do not.
                    Printed Name and Checkmark are prepared content: they are
                    printed into the document when it is sent and are not
                    signing actions. Ctrl-click (⌘-click on Mac) selects
                    several; Copy (Ctrl/⌘+C) then click the page to place the
                    copy; Paste (Ctrl/⌘+V) places it again; Delete removes the
                    selection.
                  </p>
                </div>
              ) : null}

              {model ? (
                <div className="space-y-2" data-testid="prepare-selection">
                  <p className="text-sm font-medium" aria-live="polite">
                    {selectedFieldIds.length === 0
                      ? "No placements selected"
                      : `${selectedFieldIds.length} placement${selectedFieldIds.length === 1 ? "" : "s"} selected`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={selectedFieldIds.length === 0}
                      onClick={copySelection}
                    >
                      Copy
                    </Button>
                    {pasteMode ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={cancelPasteMode}
                      >
                        Cancel paste
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!clipboard || clipboard.length === 0}
                        onClick={() => startPasteMode()}
                      >
                        Paste
                      </Button>
                    )}
                    {selectedFieldIds.length > 1 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => removeSelectedFields(selectedFieldIds)}
                      >
                        Remove selected
                      </Button>
                    ) : null}
                  </div>
                  {selectedFieldIds.length > 1 ? (
                    <p className="text-xs text-muted-foreground">
                      Drag any selected placement to move the selected
                      placements on that page together.
                    </p>
                  ) : null}
                  {editorNotice ? (
                    <p className="text-xs text-muted-foreground" role="status">
                      {editorNotice}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {selectedField && model ? (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="font-medium">
                    Selected: {fieldTypeLabel(selectedField.fieldType)}
                  </p>
                  {placementHasParticipant(selectedField.fieldType) ? (
                    <div className="space-y-1">
                      <Label htmlFor="reassign-participant">Participant</Label>
                      <select
                        id="reassign-participant"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={selectedField.participantId}
                        onChange={(event) => reassignSelectedField(event.target.value)}
                      >
                        {model.participants.map((participant) => (
                          <option key={participant.id} value={participant.id}>
                            {participantOptionLabel(participant)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {selectedField.fieldType === "DATE_SIGNED" && currentDocument ? (
                    <div className="space-y-1">
                      <Label htmlFor="relink-date">Linked to</Label>
                      <select
                        id="relink-date"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={selectedField.linkedSignatureFieldId ?? ""}
                        onChange={(event) => relinkSelectedDate(event.target.value)}
                      >
                        {dateSourceOptions(
                          currentDocument.fields,
                          selectedField.participantId,
                        ).map((field) => (
                          <option key={field.id} value={field.id}>
                            {dateSourceLabel(field)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {selectedField.fieldType === "SIGNATURE" ||
                  selectedField.fieldType === "INITIALS" ? (
                    <p className="text-xs text-muted-foreground">
                      Any Date Signed linked to it follows this participant and
                      is removed with it.
                    </p>
                  ) : null}
                  {isPreparedContentType(selectedField.fieldType) ? (
                    <p className="text-xs text-muted-foreground">
                      Prepared content: printed into the document when it is
                      sent. It is not a signing action and adds nothing to any
                      participant&apos;s progress.
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => removeField(selectedField.id)}
                  >
                    Remove field
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={cn("space-y-2", editable && "mt-4 border-t pt-4")}>
            <p className="font-medium">Fields on this document</p>
            {sortedFields.length === 0 ? (
              <p className="text-muted-foreground">
                {editable
                  ? "No Signing fields yet. Choose a participant and field type, then click the page."
                  : "No Signing fields are placed on this document yet."}
              </p>
            ) : (
              <ul className="space-y-1">
                {sortedFields.map((field) => (
                  <li key={`${field.id}-list`}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded px-2 py-1 text-left hover:bg-muted",
                        selectedFieldIds.includes(field.id) && "bg-muted",
                      )}
                      onClick={() => selectField(field.id, true)}
                    >
                      {field.participantFullName ? (
                        <>
                          <span className="font-medium text-foreground">
                            {field.participantFullName}
                          </span>
                          {" · "}
                        </>
                      ) : null}
                      {fieldTypeLabel(field.fieldType)}
                      {" · p."}
                      {field.pageNumber}
                      {field.capacityMode === "REPRESENTATIVE" &&
                      field.representedPartyName
                        ? ` · representing ${field.representedPartyName}`
                        : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
