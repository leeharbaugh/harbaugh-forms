"use client";

import { Button } from "@/components/ui/button";
import {
  computePdfPageWidth,
  displayZoomPercent,
  PDF_MIN_PAGE_WIDTH,
  stepZoomPercent,
  type PdfZoomMode,
} from "@/lib/pdf-editor-zoom";
import { acquirePdfWorker, releasePdfWorker } from "@/lib/pdfjs-setup";
import { appliedMarkLayout } from "@/lib/signing/applied-mark-layout";
import type {
  CeremonyDocumentView,
  CeremonyFieldView,
} from "@/lib/signing/ceremony-context";
import {
  ceremonyDocumentUrl,
  ceremonyFieldRenderRect,
  ceremonyGuidanceText,
  ceremonyTargetAccessibleName,
  ceremonyTargetLabel,
  isParticipantActionableField,
  type CeremonyActionableField,
  type CeremonyPageMetrics,
} from "@/lib/signing/ceremony-field-view";
import { cn } from "@/lib/utils";
import { Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";

/** The `/sign` CSP has no 'unsafe-eval'; never let pdf.js probe for it. */
const PDF_OPTIONS = { isEvalSupported: false } as const;

const WORKSPACE_PADDING_PX = 40;

const CAVEAT_FONT_FACE =
  "@font-face{font-family:HarbaughCaveat;src:url(/fonts/Caveat-Regular.ttf) format('truetype');font-display:swap}";

/**
 * Scroll to and emphasize one of this participant's fields. `guide` adds the
 * "Click here to sign" hint; it never applies a mark.
 */
export type CeremonyFocusRequest = { fieldId: string; nonce: number; guide: boolean };

/**
 * Participant view of the exact prepared PDFs the package revision froze,
 * with this participant's own Signature / Initials targets drawn at their
 * stored PDF coordinates. Other participants' fields are never sent to the
 * browser, so they cannot be shown or acted on here.
 *
 * Fills its parent: the shell gives the document most of the viewport, and
 * zoom uses the same Fit Width / Fit Page model as Prepare Documents.
 *
 * Browser-only (pdf.js needs DOMMatrix, canvas and a worker): the ceremony
 * shell loads this through `next/dynamic` with `ssr: false`.
 */
export default function CeremonyDocumentViewer({
  documents,
  fields,
  currentDocumentId,
  onSelectDocument,
  focusRequest,
  signatureText,
  initialsText,
  canSign,
  canInitial,
  pending,
  onPlace,
  onReviewActivity,
}: {
  documents: readonly CeremonyDocumentView[];
  fields: readonly CeremonyFieldView[];
  currentDocumentId: string;
  onSelectDocument: (revisionDocumentId: string) => void;
  focusRequest: CeremonyFocusRequest | null;
  signatureText: string | null;
  initialsText: string | null;
  canSign: boolean;
  canInitial: boolean;
  pending: boolean;
  onPlace: (field: CeremonyActionableField) => void;
  onReviewActivity: () => void;
}) {
  const [workspaceEl, setWorkspaceEl] = useState<HTMLDivElement | null>(null);
  const targetRefs = useRef(new Map<string, HTMLElement>());
  const handledFocusNonce = useRef<number | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>("fit-width");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [dismissedGuideNonce, setDismissedGuideNonce] = useState<number | null>(null);
  const [numPagesByDocument, setNumPagesByDocument] = useState<Record<string, number>>({});
  const [pageSizes, setPageSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [loadFailed, setLoadFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    acquirePdfWorker();
    return () => releasePdfWorker();
  }, []);

  useEffect(() => {
    if (!workspaceEl) return;
    const update = () =>
      setWorkspaceSize((previous) =>
        previous.width === workspaceEl.clientWidth &&
        previous.height === workspaceEl.clientHeight
          ? previous
          : { width: workspaceEl.clientWidth, height: workspaceEl.clientHeight },
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(workspaceEl);
    return () => observer.disconnect();
  }, [workspaceEl]);

  const currentDocument =
    documents.find((document) => document.revisionDocumentId === currentDocumentId) ??
    documents[0] ??
    null;
  const documentId = currentDocument?.revisionDocumentId ?? null;
  const numPages = documentId ? (numPagesByDocument[documentId] ?? 0) : 0;
  const basePage = documentId ? pageSizes[`${documentId}:1`] : undefined;
  const pageWidth = basePage
    ? computePdfPageWidth({
        mode: zoomMode,
        zoomPercent,
        basePageWidth: basePage.width,
        basePageHeight: basePage.height,
        workspaceWidth: workspaceSize.width,
        workspaceHeight: workspaceSize.height,
        padding: WORKSPACE_PADDING_PX,
      })
    : Math.max(PDF_MIN_PAGE_WIDTH, workspaceSize.width - WORKSPACE_PADDING_PX);
  const currentZoomPercent = basePage ? displayZoomPercent(pageWidth, basePage.width) : null;
  const file = useMemo(
    () => (documentId ? ceremonyDocumentUrl(documentId) : null),
    [documentId],
  );

  const fieldsByPage = useMemo(() => {
    const byPage = new Map<number, CeremonyFieldView[]>();
    for (const field of fields) {
      if (field.revisionDocumentId !== documentId) continue;
      const list = byPage.get(field.pageNumber) ?? [];
      list.push(field);
      byPage.set(field.pageNumber, list);
    }
    return byPage;
  }, [fields, documentId]);

  const renderedPageCount = documentId
    ? Object.keys(pageSizes).filter((key) => key.startsWith(`${documentId}:`)).length
    : 0;

  useEffect(() => {
    // Targets are disabled while a placement is pending and cannot take focus.
    if (!focusRequest || pending || handledFocusNonce.current === focusRequest.nonce) return;
    const target = targetRefs.current.get(focusRequest.fieldId);
    if (!target) return;
    handledFocusNonce.current = focusRequest.nonce;
    target.scrollIntoView({ block: "center", inline: "center" });
    target.focus({ preventScroll: true });
  }, [focusRequest, pending, renderedPageCount, documentId, pageWidth]);

  const highlightedFieldId = focusRequest?.fieldId ?? null;
  const guidedFieldId =
    focusRequest?.guide && dismissedGuideNonce !== focusRequest.nonce
      ? focusRequest.fieldId
      : null;

  function dismissGuide() {
    if (focusRequest) setDismissedGuideNonce(focusRequest.nonce);
  }

  function metricsFor(pageNumber: number): CeremonyPageMetrics | null {
    if (!documentId) return null;
    const size = pageSizes[`${documentId}:${pageNumber}`];
    if (!size) return null;
    return {
      originalWidth: size.width,
      originalHeight: size.height,
      renderedWidth: pageWidth,
      renderedHeight: (size.height / size.width) * pageWidth,
    };
  }

  function setTargetRef(fieldId: string, element: HTMLElement | null) {
    if (element) targetRefs.current.set(fieldId, element);
    else targetRefs.current.delete(fieldId);
  }

  function zoomBy(direction: "in" | "out") {
    setZoomMode("custom");
    setZoomPercent(stepZoomPercent(currentZoomPercent ?? zoomPercent, direction));
  }

  if (!currentDocument || !file || !documentId) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        This Signing has no documents to show.
      </p>
    );
  }

  const documentName = currentDocument.displayName;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="ceremony-document-viewer">
      <style>{CAVEAT_FONT_FACE}</style>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/30 px-2 py-1.5">
        <nav
          aria-label="Documents in this Signing"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        >
          {documents.map((document, index) => {
            const selected = document.revisionDocumentId === documentId;
            return (
              <Button
                key={document.revisionDocumentId}
                type="button"
                size="sm"
                variant={selected ? "default" : "outline"}
                className="shrink-0"
                aria-current={selected ? "true" : undefined}
                data-ceremony-document={document.revisionDocumentId}
                onClick={() => {
                  if (!selected) {
                    dismissGuide();
                    onSelectDocument(document.revisionDocumentId);
                    onReviewActivity();
                  }
                }}
              >
                <span className="max-w-[14rem] truncate">
                  {index + 1}. {document.displayName}
                </span>
                {document.assignedFieldCount > 0 ? (
                  <span className="ml-1 text-xs opacity-80">
                    ({document.acceptedFieldCount}/{document.assignedFieldCount})
                  </span>
                ) : null}
              </Button>
            );
          })}
        </nav>

        <div className="flex items-center gap-1 text-sm">
          <p className="mr-1 text-xs text-muted-foreground" aria-live="polite">
            Document {documents.indexOf(currentDocument) + 1} of {documents.length}
            {numPages ? ` · ${numPages} ${numPages === 1 ? "page" : "pages"}` : ""}
          </p>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="Zoom out"
            disabled={!basePage}
            onClick={() => zoomBy("out")}
          >
            <Minus className="size-4" aria-hidden />
          </Button>
          <span
            className="w-12 text-center text-xs font-medium tabular-nums"
            aria-live="polite"
            data-testid="ceremony-zoom"
          >
            {currentZoomPercent === null ? "…" : `${currentZoomPercent}%`}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="size-8"
            aria-label="Zoom in"
            disabled={!basePage}
            onClick={() => zoomBy("in")}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant={zoomMode === "fit-width" ? "secondary" : "outline"}
            aria-pressed={zoomMode === "fit-width"}
            onClick={() => setZoomMode("fit-width")}
          >
            Fit Width
          </Button>
          <Button
            type="button"
            size="sm"
            variant={zoomMode === "fit-page" ? "secondary" : "outline"}
            aria-pressed={zoomMode === "fit-page"}
            onClick={() => setZoomMode("fit-page")}
          >
            Fit Page
          </Button>
        </div>
      </div>

      <div
        ref={setWorkspaceEl}
        className="isolate min-h-0 flex-1 overflow-auto bg-muted/50"
        role="region"
        aria-label={`${documentName} document pages`}
        data-testid="ceremony-workspace"
      >
        {loadFailed[documentId] ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            This document could not be loaded. Reload the page to try again; if it
            keeps failing, contact the sending agent.
          </p>
        ) : (
          <Document
            key={documentId}
            file={file}
            options={PDF_OPTIONS}
            loading={
              <p className="p-4 text-sm text-muted-foreground">Loading document…</p>
            }
            error={
              <p role="alert" className="p-4 text-sm text-destructive">
                This document could not be loaded.
              </p>
            }
            onLoadSuccess={(pdf) =>
              setNumPagesByDocument((previous) =>
                previous[documentId] === pdf.numPages
                  ? previous
                  : { ...previous, [documentId]: pdf.numPages },
              )
            }
            onLoadError={() =>
              setLoadFailed((previous) => ({ ...previous, [documentId]: true }))
            }
            className="flex w-max min-w-full flex-col items-center gap-4 px-5 py-4"
          >
            {Array.from({ length: numPages }, (_, index) => {
              const pageNumber = index + 1;
              const metrics = metricsFor(pageNumber);
              const pageFields = fieldsByPage.get(pageNumber) ?? [];
              return (
                <section
                  key={pageNumber}
                  aria-label={`Page ${pageNumber} of ${numPages}`}
                  data-ceremony-page={pageNumber}
                  className="space-y-1"
                >
                  <p className="text-center text-xs font-medium text-muted-foreground">
                    Page {pageNumber} of {numPages}
                  </p>
                  <div className="relative w-fit bg-white shadow-md">
                    <Page
                      pageNumber={pageNumber}
                      width={pageWidth}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      onLoadSuccess={(page) => {
                        const viewport = page.getViewport({ scale: 1 });
                        const key = `${documentId}:${pageNumber}`;
                        setPageSizes((previous) =>
                          previous[key]?.width === viewport.width &&
                          previous[key]?.height === viewport.height
                            ? previous
                            : {
                                ...previous,
                                [key]: { width: viewport.width, height: viewport.height },
                              },
                        );
                      }}
                    />
                    {metrics
                      ? pageFields.map((field) => (
                          <CeremonyFieldTarget
                            key={field.fieldId}
                            field={field}
                            metrics={metrics}
                            documentName={documentName}
                            signatureText={signatureText}
                            initialsText={initialsText}
                            canSign={canSign}
                            canInitial={canInitial}
                            pending={pending}
                            highlighted={field.fieldId === highlightedFieldId}
                            guided={field.fieldId === guidedFieldId}
                            onPlace={(target) => {
                              dismissGuide();
                              onPlace(target);
                            }}
                            onDismissGuide={dismissGuide}
                            setRef={setTargetRef}
                          />
                        ))
                      : null}
                  </div>
                </section>
              );
            })}
          </Document>
        )}
      </div>
    </div>
  );
}

/**
 * The applied mark in the field's own PDF-point coordinates, laid out by the
 * same rules finalization draws with, so it scales with the page at any zoom.
 */
function AppliedMarkText({
  kind,
  text,
  field,
}: {
  kind: "SIGNATURE" | "INITIALS" | "DATE_SIGNED";
  text: string;
  field: Pick<CeremonyFieldView, "width" | "height">;
}) {
  const layout = appliedMarkLayout(kind, text, field);
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-foreground"
      viewBox={`0 0 ${field.width} ${field.height}`}
      preserveAspectRatio="none"
      aria-hidden
      data-applied-mark={kind}
    >
      <text
        x={layout.x}
        y={layout.baseline}
        fontSize={layout.fontSize}
        fontFamily={kind === "DATE_SIGNED" ? "Helvetica, Arial, sans-serif" : "HarbaughCaveat, cursive"}
        textLength={layout.textWidth > 0 ? layout.textWidth : undefined}
        lengthAdjust="spacingAndGlyphs"
        textRendering="geometricPrecision"
        fill="currentColor"
      >
        {text.trim()}
      </text>
    </svg>
  );
}

function CeremonyFieldTarget({
  field,
  metrics,
  documentName,
  signatureText,
  initialsText,
  canSign,
  canInitial,
  pending,
  highlighted,
  guided,
  onPlace,
  onDismissGuide,
  setRef,
}: {
  field: CeremonyFieldView;
  metrics: CeremonyPageMetrics;
  documentName: string;
  signatureText: string | null;
  initialsText: string | null;
  canSign: boolean;
  canInitial: boolean;
  pending: boolean;
  highlighted: boolean;
  guided: boolean;
  onPlace: (field: CeremonyActionableField) => void;
  onDismissGuide: () => void;
  setRef: (fieldId: string, element: HTMLElement | null) => void;
}) {
  const rect = ceremonyFieldRenderRect(field, metrics);
  const position = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  };
  if (!isParticipantActionableField(field)) {
    // Date Signed: written by the server with its Signature; never a control.
    if (field.placementId && field.renderedSenderLocalDate) {
      return (
        <div
          className="pointer-events-none absolute box-border rounded-sm border border-emerald-600/60 bg-white/70"
          style={position}
          data-ceremony-date-field={field.fieldId}
          data-placed="true"
          aria-label={`Date signed ${field.renderedSenderLocalDate}`}
          role="note"
        >
          <AppliedMarkText kind="DATE_SIGNED" text={field.renderedSenderLocalDate} field={field} />
        </div>
      );
    }
    return (
      <div
        className={cn(
          "pointer-events-none absolute box-border flex items-center overflow-hidden rounded-sm border px-1",
          field.placementId
            ? "border-emerald-600/60 bg-white/70"
            : "border-dashed border-amber-500/70 bg-amber-50/40",
        )}
        style={position}
        data-ceremony-date-field={field.fieldId}
        data-placed={field.placementId ? "true" : "false"}
        aria-label={
          field.placementId
            ? `Date signed ${field.renderedSenderLocalDate ?? ""}`.trim()
            : "Date signed, filled in automatically when you sign"
        }
        role="note"
      >
        <span
          className={cn(
            "truncate leading-none",
            field.placementId ? "text-foreground" : "text-[10px] text-amber-800/80",
          )}
          style={field.placementId ? { fontSize: Math.max(9, rect.height * 0.6) } : undefined}
        >
          {field.placementId ? field.renderedSenderLocalDate : "Date (automatic)"}
        </span>
      </div>
    );
  }

  if (field.placementId) {
    const markText =
      field.fieldType === "SIGNATURE" ? signatureText : initialsText;
    return (
      <div
        ref={(element) => setRef(field.fieldId, element)}
        tabIndex={-1}
        className={cn(
          "absolute box-border rounded-sm border border-emerald-600 bg-emerald-50/30 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1",
          highlighted && "ring-4 ring-emerald-500/60 ring-offset-2",
        )}
        style={position}
        data-ceremony-target={field.fieldId}
        data-placed="true"
        data-highlighted={highlighted ? "true" : undefined}
        aria-label={`${field.fieldType === "SIGNATURE" ? "Signed" : "Initialed"}: page ${field.pageNumber} of ${documentName}`}
        role="note"
      >
        <AppliedMarkText kind={field.fieldType} text={markText ?? "✓"} field={field} />
      </div>
    );
  }

  const markReady = field.fieldType === "SIGNATURE" ? canSign : canInitial;
  const label = ceremonyTargetLabel(field);
  const hintAbove = rect.y >= 36;
  return (
    <>
      <button
        ref={(element) => setRef(field.fieldId, element)}
        type="button"
        className={cn(
          "absolute box-border flex items-center justify-center overflow-hidden rounded-sm border-2 border-dashed px-1 font-semibold text-sky-900 shadow-sm transition-colors",
          "outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
          markReady
            ? "border-sky-600 bg-yellow-200/80 hover:bg-yellow-300/90"
            : "cursor-not-allowed border-slate-400 bg-slate-100/80 text-slate-600",
          highlighted && "ring-4 ring-sky-500/70 ring-offset-2",
        )}
        style={{ ...position, fontSize: Math.max(10, Math.min(rect.height * 0.5, 16)) }}
        data-ceremony-target={field.fieldId}
        data-placed="false"
        data-field-type={field.fieldType}
        data-highlighted={highlighted ? "true" : undefined}
        aria-label={ceremonyTargetAccessibleName(field, documentName)}
        title={markReady ? undefined : "Start signing first"}
        disabled={!markReady || pending}
        onClick={() => onPlace(field)}
      >
        <span className="truncate leading-none">
          {label}
          {field.isRequired ? "" : " (optional)"}
        </span>
      </button>
      {guided && markReady ? (
        <div
          role="status"
          data-testid="ceremony-guidance"
          data-field-id={field.fieldId}
          className="absolute z-10 flex items-center gap-1 whitespace-nowrap rounded-md bg-sky-700 py-0.5 pl-2 pr-0.5 text-xs font-medium text-white shadow-md"
          style={{
            left: rect.x,
            top: hintAbove ? rect.y - 30 : rect.y + rect.height + 6,
          }}
        >
          {ceremonyGuidanceText(field)}
          <button
            type="button"
            aria-label="Dismiss hint"
            className="rounded p-0.5 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
            onClick={onDismissGuide}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : null}
    </>
  );
}
