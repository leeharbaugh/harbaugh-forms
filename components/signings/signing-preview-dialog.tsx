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
import type { SigningDraftFieldRow } from "@/lib/signing/draft-fields";
import {
  DRAFT_FIELD_DEFAULT_SIZES,
  addField,
  clampRectToPage,
  dragExceededThreshold,
  findField,
  moveField,
  pairedDatePlacement,
  preferredSignatureForDate,
  reassignField,
  removalIds,
  removeFields,
  replaceFieldId,
  type DraftFieldType,
  type PdfRect,
} from "@/lib/signing/draft-field-editor-state";
import { getSigningPreviewAction } from "@/lib/signing/preview-actions";
import type {
  SigningPreviewDocument,
  SigningPreviewField,
  SigningPreviewModel,
} from "@/lib/signing/preview";
import {
  removeDraftSigningFieldAction,
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

function fieldTypeLabel(type: DraftFieldType): string {
  switch (type) {
    case "SIGNATURE":
      return "Signature";
    case "INITIALS":
      return "Initials";
    case "DATE_SIGNED":
      return "Date Signed";
  }
}

function fieldCompactLabel(field: SigningPreviewField): string {
  return `${field.participantFullName} — ${fieldTypeLabel(field.fieldType)}`;
}

function fieldTitle(field: SigningPreviewField): string {
  return field.capacityMode === "REPRESENTATIVE" && field.representedPartyName
    ? `${fieldCompactLabel(field)} · representing ${field.representedPartyName}`
    : fieldCompactLabel(field);
}

function toRenderRect(field: SigningPreviewField, metrics: PageMetrics): PdfRect {
  return {
    x: (field.x / metrics.originalWidth) * metrics.renderedWidth,
    y: (field.y / metrics.originalHeight) * metrics.renderedHeight,
    width: Math.max(
      (field.width / metrics.originalWidth) * metrics.renderedWidth,
      24,
    ),
    height: Math.max(
      (field.height / metrics.originalHeight) * metrics.renderedHeight,
      16,
    ),
  };
}

const FIELD_BORDER: Record<DraftFieldType, string> = {
  SIGNATURE: "border-sky-600",
  INITIALS: "border-emerald-600",
  DATE_SIGNED: "border-amber-600",
};

function SigningFieldOverlay({
  field,
  metrics,
  editable,
  selected,
  onSelect,
  onCommit,
  onRemove,
}: {
  field: SigningPreviewField;
  metrics: PageMetrics;
  editable: boolean;
  selected: boolean;
  onSelect: (fieldId: string) => void;
  onCommit: (fieldId: string, renderRect: PdfRect) => void;
  onRemove: (fieldId: string) => void;
}) {
  const rect = toRenderRect(field, metrics);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  if (!editable) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute box-border rounded border-2 bg-background/80 px-1 py-0.5 shadow-sm",
          FIELD_BORDER[field.fieldType],
        )}
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        title={fieldTitle(field)}
      >
        <div className="flex h-full flex-col justify-center overflow-hidden">
          <span className="truncate text-[10px] font-semibold leading-tight">
            {fieldCompactLabel(field)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Rnd
      bounds="parent"
      size={{ width: rect.width, height: rect.height }}
      position={{ x: rect.x, y: rect.y }}
      minWidth={24}
      minHeight={16}
      cancel=".signing-field-remove"
      className={cn(
        "signing-field-overlay absolute box-border rounded border-2 bg-background/85 px-1 py-0.5 shadow-sm",
        FIELD_BORDER[field.fieldType],
        selected && "z-10 ring-2 ring-foreground/50 ring-offset-1",
      )}
      onMouseDown={(event: MouseEvent) => {
        event.stopPropagation();
        onSelect(field.id);
      }}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
      }}
      onDragStart={(_event, data) => {
        dragStartRef.current = { x: data.x, y: data.y };
      }}
      onDragStop={(_event, data) => {
        const start = dragStartRef.current ?? { x: rect.x, y: rect.y };
        dragStartRef.current = null;
        // react-draggable reports a drag stop on every click; only real
        // movement persists.
        if (!dragExceededThreshold(start, { x: data.x, y: data.y })) return;
        onCommit(field.id, {
          x: data.x,
          y: data.y,
          width: rect.width,
          height: rect.height,
        });
      }}
      onResizeStart={() => onSelect(field.id)}
      onResizeStop={(_event, _dir, ref, _delta, position) => {
        onCommit(field.id, {
          x: position.x,
          y: position.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        });
      }}
      title={fieldTitle(field)}
    >
      <div className="flex h-full items-start justify-between gap-1 overflow-hidden">
        <span className="truncate text-[10px] font-semibold leading-tight">
          {fieldCompactLabel(field)}
        </span>
        {selected ? (
          <button
            type="button"
            className="signing-field-remove shrink-0 rounded px-0.5 text-[10px] text-destructive underline"
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
      </div>
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
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
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
    setSelectedFieldId(null);
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
    setSelectedFieldId((previous) =>
      previous && findField(data, resolveId(previous)) ? resolveId(previous) : null,
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

  function persistField(fieldId: string) {
    enqueue(async () => {
      const realId = resolveId(fieldId);
      // A failed create leaves only a local id; nothing to update server-side.
      if (realId.startsWith("local-")) return;
      const located = modelRef.current ? findField(modelRef.current, realId) : null;
      if (!located) return;
      const { field, documentId } = located;
      const result = await upsertDraftSigningFieldAction({
        signingId,
        fieldId: realId,
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
    const participant = model?.participants.find(
      (row) => row.id === selectedParticipantId,
    );
    if (!participant) return null;
    return {
      id,
      fieldType,
      isRequired: true,
      pageNumber,
      ...rect,
      participantId: participant.id,
      participantFullName: participant.fullName,
      capacityMode: participant.capacityMode,
      representedPartyName: participant.representedPartyName,
      capacityLabel: null,
      linkedSignatureFieldId,
    };
  }

  function placeFieldAt(
    event: ReactMouseEvent<HTMLDivElement>,
    pageNumber: number,
  ) {
    if (!editable || !currentDocument || !model) return;
    // A press that began on a field (select, drag, resize, Remove) never places.
    if (pointerStartedOnFieldRef.current) {
      pointerStartedOnFieldRef.current = false;
      return;
    }
    if ((event.target as HTMLElement).closest(".signing-field-overlay")) return;
    if (!selectedParticipantId) {
      setError("Add a participant before placing fields.");
      return;
    }
    const metrics = metricsFor(currentDocument.id, pageNumber);
    if (!metrics) return;
    setError(null);

    const bounds = event.currentTarget.getBoundingClientRect();
    const point = clickToPdfCoordinates(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      metrics,
    );
    const page = { width: metrics.originalWidth, height: metrics.originalHeight };
    const size = DRAFT_FIELD_DEFAULT_SIZES[selectedFieldType];
    const rect = clampRectToPage(
      {
        x: point.x - size.width / 2,
        y: point.y - size.height / 2,
        ...size,
      },
      page,
    );

    let linkedSignatureDraftFieldId: string | null = null;
    if (selectedFieldType === "DATE_SIGNED") {
      const signature = preferredSignatureForDate(
        currentDocument.fields,
        selectedParticipantId,
        pageNumber,
      );
      if (!signature) {
        setError(
          "Place a Signature for this participant before adding Date Signed.",
        );
        return;
      }
      linkedSignatureDraftFieldId = signature.id;
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
    setSelectedFieldId(fieldId);

    const create = async (local: SigningPreviewField): Promise<boolean> => {
      const result = await upsertDraftSigningFieldAction({
        signingId,
        signingDocumentId: documentId,
        signingParticipantId: local.participantId,
        fieldType: local.fieldType,
        pageNumber: local.pageNumber,
        x: local.x,
        y: local.y,
        width: local.width,
        height: local.height,
        linkedSignatureDraftFieldId: local.linkedSignatureFieldId
          ? resolveId(local.linkedSignatureFieldId)
          : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        await reconcile();
        return false;
      }
      const row = result.data as SigningDraftFieldRow;
      idMapRef.current.set(local.id, row.id);
      updateModel((current) => replaceFieldId(current, local.id, row.id));
      setSelectedFieldId((previous) => (previous === local.id ? row.id : previous));
      return true;
    };

    enqueue(async () => {
      // The field may have been removed locally before it was persisted.
      const stillPresent = (id: string) =>
        modelRef.current ? findField(modelRef.current, id) !== null : false;
      if (!stillPresent(fieldId)) return;
      const latest = findField(modelRef.current!, fieldId)!.field;
      const created = await create(latest);
      if (!created || !pairedDate || !stillPresent(pairedDate.id)) return;
      await create(findField(modelRef.current!, pairedDate.id)!.field);
    });
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

  function removeField(fieldId: string) {
    if (!model) return;
    const ids = removalIds(model, fieldId);
    if (ids.length === 0) return;
    setError(null);
    updateModel((current) => removeFields(current, ids));
    setSelectedFieldId(null);
    enqueue(async () => {
      const realId = resolveId(fieldId);
      if (realId.startsWith("local-")) return;
      const result = await removeDraftSigningFieldAction({
        signingId,
        fieldId: realId,
      });
      if (!result.ok) {
        setError(result.error);
        await reconcile();
        return;
      }
      const removed =
        (result.data as { removedFieldIds?: string[] } | undefined)
          ?.removedFieldIds ?? [];
      updateModel((current) => removeFields(current, removed));
    });
  }

  function reassignSelectedField(participantId: string) {
    if (!model || !selectedFieldId) return;
    const located = findField(model, selectedFieldId);
    if (!located || located.field.participantId === participantId) return;
    setError(null);

    let linkedSignatureDraftFieldId: string | null = null;
    if (located.field.fieldType === "DATE_SIGNED") {
      const document = model.documents.find((row) => row.id === located.documentId);
      const signature = document
        ? preferredSignatureForDate(
            document.fields,
            participantId,
            located.field.pageNumber,
          )
        : null;
      if (!signature) {
        setError(
          "Reassign Date Signed only to a participant who already has a Signature on this document.",
        );
        return;
      }
      linkedSignatureDraftFieldId = signature.id;
    }

    const fieldId = selectedFieldId;
    updateModel((current) =>
      reassignField(current, fieldId, participantId, linkedSignatureDraftFieldId),
    );
    persistField(fieldId);
  }

  function selectField(fieldId: string, scroll = false) {
    setSelectedFieldId(fieldId);
    if (!scroll || !model || !workspaceEl) return;
    const located = findField(model, fieldId);
    const pageEl = located ? pageRefs.current[located.field.pageNumber] : null;
    if (pageEl) scrollElementIntoContainer(workspaceEl, pageEl);
  }

  function goToDocument(documentId: string) {
    setCurrentDocumentId(documentId);
    setSelectedFieldId(null);
    pageRefs.current = {};
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
      const target = event.target as HTMLElement | null;
      const typing =
        target?.closest("input, select, textarea, [contenteditable=true]") != null;
      if (event.key === "Escape") {
        if (selectedFieldId) {
          setSelectedFieldId(null);
        } else {
          handleClose();
        }
        return;
      }
      if (
        editable &&
        !typing &&
        selectedFieldId &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        removeField(selectedFieldId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!open) return null;

  const zoomLabel = basePage
    ? `${displayZoomPercent(pageWidth, basePage.width)}%`
    : "—";
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
                          className={cn(
                            "relative w-fit border bg-white shadow-md",
                            editable && selectedParticipantId && "cursor-crosshair",
                          )}
                          onMouseDownCapture={(event) => {
                            pointerStartedOnFieldRef.current =
                              (event.target as HTMLElement).closest(
                                ".signing-field-overlay",
                              ) != null;
                          }}
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
                                  selected={selectedFieldId === field.id}
                                  onSelect={(id) => selectField(id)}
                                  onCommit={commitGeometry}
                                  onRemove={removeField}
                                />
                              ))
                            : null}
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
                      onChange={(event) => setSelectedParticipantId(event.target.value)}
                      disabled={model.participants.length === 0}
                    >
                      {model.participants.length === 0 ? (
                        <option value="">Add a participant first</option>
                      ) : (
                        model.participants.map((participant) => (
                          <option key={participant.id} value={participant.id}>
                            {participant.fullName}
                            {participant.capacityMode === "REPRESENTATIVE" &&
                            participant.representedPartyName
                              ? ` (representing ${participant.representedPartyName})`
                              : ""}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="prepare-field-type">Field type</Label>
                    <select
                      id="prepare-field-type"
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                      value={selectedFieldType}
                      onChange={(event) =>
                        setSelectedFieldType(event.target.value as DraftFieldType)
                      }
                    >
                      <option value="SIGNATURE">Signature</option>
                      <option value="INITIALS">Initials</option>
                      <option value="DATE_SIGNED">Date Signed</option>
                    </select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click the page to place. Drag or resize to adjust. A
                    Signature also places its Date Signed.
                  </p>
                </div>
              ) : null}

              {selectedField && model ? (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="font-medium">
                    Selected: {fieldTypeLabel(selectedField.fieldType)}
                  </p>
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
                          {participant.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedField.fieldType === "SIGNATURE" ? (
                    <p className="text-xs text-muted-foreground">
                      Its Date Signed follows this participant and is removed
                      with it.
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
                        selectedFieldId === field.id && "bg-muted",
                      )}
                      onClick={() => selectField(field.id, true)}
                    >
                      <span className="font-medium text-foreground">
                        {field.participantFullName}
                      </span>
                      {" · "}
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
