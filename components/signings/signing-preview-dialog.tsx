"use client";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSigningPreviewAction } from "@/lib/signing/preview-actions";
import type {
  SigningPreviewDocument,
  SigningPreviewField,
  SigningPreviewModel,
} from "@/lib/signing/preview";
import { acquirePdfWorker, releasePdfWorker } from "@/lib/pdfjs-setup";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Document, Page } from "react-pdf";

function fieldTypeLabel(type: SigningPreviewField["fieldType"]): string {
  switch (type) {
    case "SIGNATURE":
      return "Signature";
    case "INITIALS":
      return "Initials";
    case "DATE_SIGNED":
      return "Date Signed";
  }
}

function fieldTypeVariant(
  type: SigningPreviewField["fieldType"],
): "info" | "secondary" | "outline" {
  switch (type) {
    case "SIGNATURE":
      return "info";
    case "INITIALS":
      return "secondary";
    case "DATE_SIGNED":
      return "outline";
  }
}

function SigningFieldOverlay({
  field,
  pageWidth,
  pageHeight,
  renderedWidth,
  renderedHeight,
}: {
  field: SigningPreviewField;
  pageWidth: number;
  pageHeight: number;
  renderedWidth: number;
  renderedHeight: number;
}) {
  const left = (field.x / pageWidth) * renderedWidth;
  const top = (field.y / pageHeight) * renderedHeight;
  const width = (field.width / pageWidth) * renderedWidth;
  const height = (field.height / pageHeight) * renderedHeight;

  return (
    <div
      className={cn(
        "pointer-events-none absolute box-border rounded border-2 bg-background/80 px-1 py-0.5 shadow-sm",
        field.fieldType === "SIGNATURE" && "border-sky-600",
        field.fieldType === "INITIALS" && "border-emerald-600",
        field.fieldType === "DATE_SIGNED" && "border-amber-600",
      )}
      style={{
        left,
        top,
        width: Math.max(width, 48),
        height: Math.max(height, 24),
      }}
      title={
        field.capacityMode === "REPRESENTATIVE" && field.representedPartyName
          ? `${field.participantFullName} · ${fieldTypeLabel(field.fieldType)} · representing ${field.representedPartyName}`
          : `${field.participantFullName} · ${fieldTypeLabel(field.fieldType)}`
      }
    >
      <div className="flex h-full flex-col justify-center gap-0.5 overflow-hidden">
        <span className="truncate text-[10px] font-semibold leading-tight">
          {field.participantFullName}
        </span>
        <span className="truncate text-[9px] leading-tight text-muted-foreground">
          {fieldTypeLabel(field.fieldType)}
          {field.isRequired ? " · required" : ""}
        </span>
      </div>
    </div>
  );
}

export function SigningPreviewDialog({
  open,
  signingId,
  onClose,
}: {
  open: boolean;
  signingId: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [model, setModel] = useState<SigningPreviewModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentIndex, setDocumentIndex] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const renderedWidth = 720;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getSigningPreviewAction({ signingId });
    if (!result.ok) {
      setError(result.error);
      setModel(null);
      setLoading(false);
      return;
    }
    const data = result.data as SigningPreviewModel;
    setModel(data);
    setDocumentIndex(0);
    setPageNumber(1);
    setPageCount(1);
    setPageSize(null);
    setLoading(false);
  }, [signingId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    acquirePdfWorker();
    return () => {
      releasePdfWorker();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const currentDocument: SigningPreviewDocument | null =
    model?.documents[documentIndex] ?? null;

  const pdfUrl = useMemo(() => {
    if (!currentDocument?.hasSelectedSnapshot) return null;
    return `/signings/${signingId}/preview/document/${currentDocument.id}`;
  }, [currentDocument, signingId]);

  const pageFields = useMemo(() => {
    if (!currentDocument) return [];
    return currentDocument.fields.filter(
      (field) => field.pageNumber === pageNumber,
    );
  }, [currentDocument, pageNumber]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <Card className="flex h-full w-full max-w-5xl flex-col overflow-hidden">
        <CardHeader className="shrink-0 space-y-2 border-b border-border pb-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <CardTitle id={titleId}>Preview Signing</CardTitle>
              <CardDescription>
                Inspect documents and Signing fields exactly as prepared. This
                does not send or freeze the Signing.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
          {model ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={documentIndex <= 0}
                onClick={() => {
                  setDocumentIndex((value) => Math.max(0, value - 1));
                  setPageNumber(1);
                  setPageSize(null);
                }}
              >
                Previous document
              </Button>
              <span className="text-muted-foreground">
                Document {model.documents.length === 0 ? 0 : documentIndex + 1}{" "}
                of {model.documents.length}
                {currentDocument ? ` · ${currentDocument.displayName}` : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  model.documents.length === 0 ||
                  documentIndex >= model.documents.length - 1
                }
                onClick={() => {
                  setDocumentIndex((value) =>
                    Math.min(model.documents.length - 1, value + 1),
                  );
                  setPageNumber(1);
                  setPageSize(null);
                }}
              >
                Next document
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!loading && !error && model && model.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add at least one document before previewing.
            </p>
          ) : null}
          {!loading && currentDocument && !currentDocument.hasSelectedSnapshot ? (
            <p className="text-sm text-destructive">
              This document has no prepared Draft source snapshot yet. Add or
              re-capture the document before previewing.
            </p>
          ) : null}
          {!loading && currentDocument?.hasSelectedSnapshot && pdfUrl ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
                >
                  Previous page
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {pageNumber} of {pageCount}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pageNumber >= pageCount}
                  onClick={() =>
                    setPageNumber((value) => Math.min(pageCount, value + 1))
                  }
                >
                  Next page
                </Button>
                <div className="flex flex-wrap gap-1">
                  {(["SIGNATURE", "INITIALS", "DATE_SIGNED"] as const).map(
                    (type) => (
                      <Badge key={type} variant={fieldTypeVariant(type)}>
                        {fieldTypeLabel(type)}
                      </Badge>
                    ),
                  )}
                </div>
              </div>

              <div className="relative inline-block max-w-full overflow-auto rounded border border-border bg-muted/20">
                <Document
                  file={pdfUrl}
                  loading={
                    <p className="p-4 text-sm text-muted-foreground">
                      Rendering document…
                    </p>
                  }
                  error={
                    <p className="p-4 text-sm text-destructive">
                      Could not load this Signing document preview.
                    </p>
                  }
                  onLoadSuccess={(pdf) => {
                    setPageCount(pdf.numPages);
                    setPageNumber((value) =>
                      Math.min(Math.max(1, value), pdf.numPages),
                    );
                  }}
                >
                  <div className="relative">
                    <Page
                      pageNumber={pageNumber}
                      width={renderedWidth}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      onLoadSuccess={(page) => {
                        const viewport = page.getViewport({ scale: 1 });
                        setPageSize({
                          width: viewport.width,
                          height: viewport.height,
                        });
                      }}
                    />
                    {pageSize
                      ? pageFields.map((field) => (
                          <SigningFieldOverlay
                            key={field.id}
                            field={field}
                            pageWidth={pageSize.width}
                            pageHeight={pageSize.height}
                            renderedWidth={renderedWidth}
                            renderedHeight={
                              (pageSize.height / pageSize.width) * renderedWidth
                            }
                          />
                        ))
                      : null}
                  </div>
                </Document>
              </div>

              {currentDocument.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Signing fields are placed on this document yet. Use Add
                  default fields on the preparation panel, then return here to
                  verify placements.
                </p>
              ) : pageFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No Signing fields on this page. Try another page or document.
                </p>
              ) : (
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {pageFields.map((field) => (
                    <li key={`${field.id}-list`}>
                      <span className="font-medium text-foreground">
                        {field.participantFullName}
                      </span>
                      {" · "}
                      {fieldTypeLabel(field.fieldType)}
                      {field.isRequired ? " · required" : ""}
                      {field.capacityMode === "REPRESENTATIVE" &&
                      field.representedPartyName
                        ? ` · representing ${field.representedPartyName}`
                        : null}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Placement editing is not available in this preview yet. Adjust
                fields from Prepare Signing (Add default fields) before Send.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
