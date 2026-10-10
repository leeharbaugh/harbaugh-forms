"use client";

import { Button } from "@/components/ui/button";
import { acquirePdfWorker, releasePdfWorker } from "@/lib/pdfjs-setup";
import type {
  CeremonyDocumentView,
  CeremonyFieldView,
} from "@/lib/signing/ceremony-context";
import {
  ceremonyDocumentUrl,
  ceremonyFieldRenderRect,
  ceremonyTargetAccessibleName,
  ceremonyTargetLabel,
  isParticipantActionableField,
  type CeremonyActionableField,
  type CeremonyPageMetrics,
} from "@/lib/signing/ceremony-field-view";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";

/** The `/sign` CSP has no 'unsafe-eval'; never let pdf.js probe for it. */
const PDF_OPTIONS = { isEvalSupported: false } as const;

const ZOOM_LEVELS = [1, 1.25, 1.5, 2] as const;
const MIN_PAGE_WIDTH = 280;
const PAGE_GUTTER_PX = 24;

const CAVEAT_FONT_FACE =
  "@font-face{font-family:HarbaughCaveat;src:url(/fonts/Caveat-Regular.ttf) format('truetype');font-display:swap}";

export type CeremonyFocusRequest = { fieldId: string; nonce: number };

/**
 * Participant view of the exact prepared PDFs the package revision froze,
 * with this participant's own Signature / Initials targets drawn at their
 * stored PDF coordinates. Other participants' fields are never sent to the
 * browser, so they cannot be shown or acted on here.
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const targetRefs = useRef(new Map<string, HTMLElement>());
  const handledFocusNonce = useRef<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [numPagesByDocument, setNumPagesByDocument] = useState<Record<string, number>>({});
  const [pageSizes, setPageSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [loadFailed, setLoadFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    acquirePdfWorker();
    return () => releasePdfWorker();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setContainerWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const currentDocument =
    documents.find((document) => document.revisionDocumentId === currentDocumentId) ??
    documents[0] ??
    null;
  const documentId = currentDocument?.revisionDocumentId ?? null;
  const numPages = documentId ? (numPagesByDocument[documentId] ?? 0) : 0;
  const zoom = ZOOM_LEVELS[zoomIndex];
  const fitWidth = Math.max(MIN_PAGE_WIDTH, containerWidth - PAGE_GUTTER_PX * 2);
  const pageWidth = Math.floor(fitWidth * zoom);
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
  }, [focusRequest, pending, renderedPageCount, documentId]);

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

  if (!currentDocument || !file || !documentId) {
    return (
      <p className="text-sm text-muted-foreground">
        This Signing has no documents to show.
      </p>
    );
  }

  const documentName = currentDocument.displayName;

  return (
    <div className="space-y-3" data-testid="ceremony-document-viewer">
      <style>{CAVEAT_FONT_FACE}</style>

      <nav aria-label="Documents in this Signing" className="flex flex-wrap gap-2">
        {documents.map((document, index) => {
          const selected = document.revisionDocumentId === documentId;
          return (
            <Button
              key={document.revisionDocumentId}
              type="button"
              size="sm"
              variant={selected ? "default" : "outline"}
              aria-current={selected ? "true" : undefined}
              data-ceremony-document={document.revisionDocumentId}
              onClick={() => {
                if (!selected) {
                  onSelectDocument(document.revisionDocumentId);
                  onReviewActivity();
                }
              }}
            >
              <span className="max-w-[16rem] truncate">
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          Document {documents.indexOf(currentDocument) + 1} of {documents.length}
          {numPages ? ` · ${numPages} ${numPages === 1 ? "page" : "pages"}` : ""}
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Zoom out"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
          >
            <Minus className="size-4" aria-hidden />
          </Button>
          <span className="w-16 text-center tabular-nums" aria-live="polite">
            {zoomIndex === 0 ? "Fit" : `${Math.round(zoom * 100)}%`}
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Zoom in"
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            onClick={() =>
              setZoomIndex((index) => Math.min(ZOOM_LEVELS.length - 1, index + 1))
            }
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="overflow-x-auto rounded-md border bg-muted/40"
        role="region"
        aria-label={`${documentName} document pages`}
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
            className="flex w-max min-w-full flex-col items-center gap-6 px-6 py-6"
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
                            onPlace={onPlace}
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

function CeremonyFieldTarget({
  field,
  metrics,
  documentName,
  signatureText,
  initialsText,
  canSign,
  canInitial,
  pending,
  onPlace,
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
  onPlace: (field: CeremonyActionableField) => void;
  setRef: (fieldId: string, element: HTMLElement | null) => void;
}) {
  const rect = ceremonyFieldRenderRect(field, metrics);
  const position = {
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
  };
  const markFontPx = Math.max(10, Math.min(rect.height * 0.75, 40));

  if (!isParticipantActionableField(field)) {
    // Date Signed: written by the server with its Signature; never a control.
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
        className="absolute box-border flex items-end overflow-hidden rounded-sm border border-emerald-600 bg-emerald-50/30 px-1 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1"
        style={position}
        data-ceremony-target={field.fieldId}
        data-placed="true"
        aria-label={`${field.fieldType === "SIGNATURE" ? "Signed" : "Initialed"}: page ${field.pageNumber} of ${documentName}`}
        role="note"
      >
        <span
          className="truncate leading-none text-foreground"
          style={{ fontFamily: "HarbaughCaveat, cursive", fontSize: markFontPx }}
        >
          {markText ?? "✓"}
        </span>
      </div>
    );
  }

  const markReady = field.fieldType === "SIGNATURE" ? canSign : canInitial;
  const label = ceremonyTargetLabel(field);
  return (
    <button
      ref={(element) => setRef(field.fieldId, element)}
      type="button"
      className={cn(
        "absolute box-border flex items-center justify-center overflow-hidden rounded-sm border-2 border-dashed px-1 font-semibold text-sky-900 shadow-sm transition-colors",
        "outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-1",
        markReady
          ? "border-sky-600 bg-yellow-200/80 hover:bg-yellow-300/90"
          : "cursor-not-allowed border-slate-400 bg-slate-100/80 text-slate-600",
      )}
      style={{ ...position, fontSize: Math.max(10, Math.min(rect.height * 0.5, 16)) }}
      data-ceremony-target={field.fieldId}
      data-placed="false"
      data-field-type={field.fieldType}
      aria-label={ceremonyTargetAccessibleName(field, documentName)}
      title={
        markReady
          ? undefined
          : field.fieldType === "SIGNATURE"
            ? "Adopt your signature first"
            : "Adopt your initials first"
      }
      disabled={!markReady || pending}
      onClick={() => onPlace(field)}
    >
      <span className="truncate leading-none">
        {label}
        {field.isRequired ? "" : " (optional)"}
      </span>
    </button>
  );
}
