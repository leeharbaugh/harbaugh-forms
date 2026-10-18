"use client";

import { Button } from "@/components/ui/button";
import { acquirePdfWorker, releasePdfWorker } from "@/lib/pdfjs-setup";
import {
  PDF_MIN_PAGE_WIDTH,
  computePdfPageWidth,
  displayZoomPercent,
  stepZoomPercent,
  type PdfZoomMode,
} from "@/lib/pdf-editor-zoom";
import { Minus, Plus } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";

/** Read-only full-screen view of one immutable completed artifact. */
export function CompletedDocumentViewer({
  label,
  viewUrl,
  downloadUrl,
  onClose,
}: {
  label: string;
  viewUrl: string;
  downloadUrl: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [workspaceEl, setWorkspaceEl] = useState<HTMLDivElement | null>(null);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  const [numPages, setNumPages] = useState(0);
  const [basePage, setBasePage] = useState<{ width: number; height: number } | null>(null);
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>("fit-width");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    acquirePdfWorker();
    closeRef.current?.focus();
    return () => releasePdfWorker();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!workspaceEl) return;
    const update = () =>
      setWorkspaceSize({ width: workspaceEl.clientWidth, height: workspaceEl.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(workspaceEl);
    return () => observer.disconnect();
  }, [workspaceEl]);

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

  const currentPercent = basePage ? displayZoomPercent(pageWidth, basePage.width) : zoomPercent;
  const zoom = (direction: "in" | "out") => {
    setZoomMode("custom");
    setZoomPercent(stepZoomPercent(currentPercent, direction));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="completed-document-viewer"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-base font-semibold leading-tight">
            {label}
          </h2>
          <p className="text-xs text-muted-foreground">
            Completed signed document (read-only)
            {numPages ? ` · ${numPages} ${numPages === 1 ? "page" : "pages"}` : ""}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Zoom out"
          disabled={!basePage}
          onClick={() => zoom("out")}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span
          className="min-w-[3.5rem] text-center text-sm font-medium tabular-nums"
          data-testid="completed-viewer-zoom"
        >
          {basePage ? `${currentPercent}%` : "—"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label="Zoom in"
          disabled={!basePage}
          onClick={() => zoom("in")}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant={zoomMode === "fit-width" ? "secondary" : "outline"}
          disabled={!basePage}
          onClick={() => setZoomMode("fit-width")}
        >
          Fit Width
        </Button>
        <Button
          type="button"
          size="sm"
          variant={zoomMode === "fit-page" ? "secondary" : "outline"}
          disabled={!basePage}
          onClick={() => setZoomMode("fit-page")}
        >
          Fit Page
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={downloadUrl} download>
            Download
          </a>
        </Button>
        <Button ref={closeRef} type="button" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <div ref={setWorkspaceEl} className="min-h-0 flex-1 overflow-auto bg-muted/50">
        {failed ? (
          <p className="p-4 text-sm text-destructive" role="alert">
            This completed document could not be shown. Close and try again, or
            contact support if it keeps failing.
          </p>
        ) : (
          <div className="flex min-h-full flex-col items-center p-6">
            <Document
              file={viewUrl}
              loading={<p className="text-sm text-muted-foreground">Loading document…</p>}
              error={null}
              onLoadError={() => setFailed(true)}
              onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
              className="flex w-max flex-col gap-6"
            >
              {Array.from({ length: numPages }, (_, index) => (
                <div
                  key={index + 1}
                  className="w-fit border bg-white shadow-md"
                  data-completed-page={index + 1}
                >
                  <Page
                    pageNumber={index + 1}
                    width={pageWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    onLoadSuccess={(page) => {
                      if (index !== 0) return;
                      const viewport = page.getViewport({ scale: 1 });
                      setBasePage((previous) =>
                        previous?.width === viewport.width && previous?.height === viewport.height
                          ? previous
                          : { width: viewport.width, height: viewport.height },
                      );
                    }}
                  />
                </div>
              ))}
            </Document>
          </div>
        )}
      </div>
    </div>
  );
}
