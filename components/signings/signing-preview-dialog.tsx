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
import { Label } from "@/components/ui/label";
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
import { acquirePdfWorker, releasePdfWorker } from "@/lib/pdfjs-setup";
import {
  clickToPdfCoordinates,
  renderRectToPdfPlacement,
  type PageMetrics,
} from "@/lib/types/template-pdf-field";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { Rnd } from "react-rnd";

export type SigningDocumentWorkspaceMode = "preview" | "prepare";

type FieldType = SigningPreviewField["fieldType"];

const DEFAULT_SIZES: Record<FieldType, { width: number; height: number }> = {
  SIGNATURE: { width: 160, height: 40 },
  INITIALS: { width: 80, height: 40 },
  DATE_SIGNED: { width: 100, height: 24 },
};

function fieldTypeLabel(type: FieldType): string {
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
  type: FieldType,
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

function fieldCompactLabel(field: SigningPreviewField): string {
  return `${field.participantFullName} — ${fieldTypeLabel(field.fieldType)}`;
}

function SigningFieldOverlay({
  field,
  metrics,
  editable,
  selected,
  busy,
  onSelect,
  onMoveOrResize,
  onRemove,
}: {
  field: SigningPreviewField;
  metrics: PageMetrics;
  editable: boolean;
  selected: boolean;
  busy: boolean;
  onSelect: (fieldId: string) => void;
  onMoveOrResize: (
    field: SigningPreviewField,
    rect: { x: number; y: number; width: number; height: number },
  ) => void;
  onRemove: (fieldId: string) => void;
}) {
  const left = (field.x / metrics.originalWidth) * metrics.renderedWidth;
  const top = (field.y / metrics.originalHeight) * metrics.renderedHeight;
  const width = (field.width / metrics.originalWidth) * metrics.renderedWidth;
  const height =
    (field.height / metrics.originalHeight) * metrics.renderedHeight;

  const title =
    field.capacityMode === "REPRESENTATIVE" && field.representedPartyName
      ? `${fieldCompactLabel(field)} · representing ${field.representedPartyName}`
      : fieldCompactLabel(field);

  if (!editable) {
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
        title={title}
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
      size={{ width: Math.max(width, 48), height: Math.max(height, 24) }}
      position={{ x: left, y: top }}
      minWidth={48}
      minHeight={20}
      disableDragging={busy}
      enableResizing={
        busy
          ? false
          : {
              top: true,
              right: true,
              bottom: true,
              left: true,
              topRight: true,
              bottomRight: true,
              bottomLeft: true,
              topLeft: true,
            }
      }
      className={cn(
        "absolute box-border rounded border-2 bg-background/85 px-1 py-0.5 shadow-sm",
        field.fieldType === "SIGNATURE" && "border-sky-600",
        field.fieldType === "INITIALS" && "border-emerald-600",
        field.fieldType === "DATE_SIGNED" && "border-amber-600",
        selected && "ring-2 ring-offset-1 ring-foreground/40",
      )}
      onClick={(event: MouseEvent) => {
        event.stopPropagation();
        onSelect(field.id);
      }}
      onDragStop={(_event, data) => {
        onMoveOrResize(field, {
          x: data.x,
          y: data.y,
          width: Math.max(width, 48),
          height: Math.max(height, 24),
        });
      }}
      onResizeStop={(_event, _dir, ref, _delta, position) => {
        onMoveOrResize(field, {
          x: position.x,
          y: position.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        });
      }}
      title={title}
    >
      <div className="flex h-full items-start justify-between gap-1 overflow-hidden">
        <span className="truncate text-[10px] font-semibold leading-tight">
          {fieldCompactLabel(field)}
        </span>
        {selected ? (
          <button
            type="button"
            className="shrink-0 text-[10px] text-destructive underline"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
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
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentIndex, setDocumentIndex] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [selectedFieldType, setSelectedFieldType] =
    useState<FieldType>("SIGNATURE");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const placingRef = useRef(false);
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
    setSelectedParticipantId((previous) => {
      if (previous && data.participants.some((row) => row.id === previous)) {
        return previous;
      }
      return data.participants[0]?.id ?? "";
    });
    setDocumentIndex((previous) => {
      if (initialDocumentId) {
        const index = data.documents.findIndex(
          (document) => document.id === initialDocumentId,
        );
        if (index >= 0) return index;
      }
      if (previous < data.documents.length) return previous;
      return 0;
    });
    setPageNumber(1);
    setPageCount(1);
    setPageSize(null);
    setSelectedFieldId(null);
    setLoading(false);
  }, [signingId, initialDocumentId]);

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

  const metrics: PageMetrics | null = pageSize
    ? {
        originalWidth: pageSize.width,
        originalHeight: pageSize.height,
        renderedWidth,
        renderedHeight: (pageSize.height / pageSize.width) * renderedWidth,
      }
    : null;

  async function persistFieldPlacement(
    field: SigningPreviewField,
    pdf: { x: number; y: number; width: number; height: number },
  ) {
    if (!currentDocument) return;
    setBusy(true);
    setError(null);
    const result = await upsertDraftSigningFieldAction({
      signingId,
      fieldId: field.id,
      signingDocumentId: currentDocument.id,
      signingParticipantId: field.participantId,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      pageNumber: field.pageNumber,
      x: pdf.x,
      y: pdf.y,
      width: pdf.width,
      height: pdf.height,
      linkedSignatureDraftFieldId: field.linkedSignatureFieldId ?? undefined,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      await load();
      if (onChanged) await onChanged();
    }
    setBusy(false);
  }

  async function placeFieldAt(clientX: number, clientY: number, pageEl: HTMLElement) {
    if (!editable || !currentDocument || !metrics || !selectedParticipantId) {
      return;
    }
    if (placingRef.current || busy) return;
    placingRef.current = true;
    setBusy(true);
    setError(null);

    const rect = pageEl.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    const pdfPoint = clickToPdfCoordinates(clickX, clickY, metrics);
    const size = DEFAULT_SIZES[selectedFieldType];
    const x = Math.max(0, pdfPoint.x - size.width / 2);
    const y = Math.max(0, pdfPoint.y - size.height / 2);

    let linkedSignatureDraftFieldId: string | undefined;
    if (selectedFieldType === "DATE_SIGNED") {
      const signatures = currentDocument.fields.filter(
        (field) =>
          field.fieldType === "SIGNATURE" &&
          field.participantId === selectedParticipantId,
      );
      const preferred =
        signatures.find((field) => field.pageNumber === pageNumber) ??
        signatures[signatures.length - 1];
      if (!preferred) {
        setError(
          "Place a Signature for this participant before adding Date Signed.",
        );
        setBusy(false);
        placingRef.current = false;
        return;
      }
      linkedSignatureDraftFieldId = preferred.id;
    }

    const result = await upsertDraftSigningFieldAction({
      signingId,
      signingDocumentId: currentDocument.id,
      signingParticipantId: selectedParticipantId,
      fieldType: selectedFieldType,
      pageNumber,
      x,
      y,
      width: size.width,
      height: size.height,
      linkedSignatureDraftFieldId,
    });

    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      placingRef.current = false;
      return;
    }

    // Signature placement also creates a linked Date Signed to the right when
    // the architecture requires linkage and none exists yet for this signature.
    if (selectedFieldType === "SIGNATURE") {
      const signatureId = (result.data as { id?: string } | undefined)?.id;
      if (signatureId) {
        await upsertDraftSigningFieldAction({
          signingId,
          signingDocumentId: currentDocument.id,
          signingParticipantId: selectedParticipantId,
          fieldType: "DATE_SIGNED",
          linkedSignatureDraftFieldId: signatureId,
          pageNumber,
          x: x + size.width + 12,
          y,
          width: DEFAULT_SIZES.DATE_SIGNED.width,
          height: DEFAULT_SIZES.DATE_SIGNED.height,
        });
      }
    }

    await load();
    if (onChanged) await onChanged();
    setBusy(false);
    placingRef.current = false;
  }

  async function removeField(fieldId: string) {
    setBusy(true);
    setError(null);
    const result = await removeDraftSigningFieldAction({
      signingId,
      fieldId,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      setSelectedFieldId(null);
      await load();
      if (onChanged) await onChanged();
    }
    setBusy(false);
  }

  async function reassignSelectedField(participantId: string) {
    if (!selectedFieldId || !currentDocument || !model) return;
    const field = currentDocument.fields.find((row) => row.id === selectedFieldId);
    if (!field) return;
    setBusy(true);
    setError(null);

    let linkedSignatureDraftFieldId = field.linkedSignatureFieldId ?? undefined;
    if (field.fieldType === "DATE_SIGNED") {
      const signatures = currentDocument.fields.filter(
        (row) =>
          row.fieldType === "SIGNATURE" && row.participantId === participantId,
      );
      const preferred = signatures[signatures.length - 1];
      if (!preferred) {
        setError(
          "Reassign Date Signed only to a participant who already has a Signature.",
        );
        setBusy(false);
        return;
      }
      linkedSignatureDraftFieldId = preferred.id;
    }

    const result = await upsertDraftSigningFieldAction({
      signingId,
      fieldId: field.id,
      signingDocumentId: currentDocument.id,
      signingParticipantId: participantId,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      pageNumber: field.pageNumber,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      linkedSignatureDraftFieldId,
    });
    if (!result.ok) {
      setError(result.error);
    } else {
      await load();
      if (onChanged) await onChanged();
    }
    setBusy(false);
  }

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
              <CardTitle id={titleId}>
                {editable ? "Prepare Documents" : "Preview Signing"}
              </CardTitle>
              <CardDescription>
                {editable
                  ? "Place Signature, Initials, and Date Signed fields on the prepared documents. Changes save to Draft preparation only."
                  : "Inspect documents and Signing fields exactly as prepared. This does not send or freeze the Signing."}
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
                  setSelectedFieldId(null);
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
                  setSelectedFieldId(null);
                }}
              >
                Next document
              </Button>
            </div>
          ) : null}
          {editable && model ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="prepare-participant">Participant</Label>
                <select
                  id="prepare-participant"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={selectedParticipantId}
                  onChange={(event) =>
                    setSelectedParticipantId(event.target.value)
                  }
                  disabled={busy || model.participants.length === 0}
                >
                  {model.participants.length === 0 ? (
                    <option value="">Add a participant first</option>
                  ) : (
                    model.participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.fullName}
                        {participant.capacityMode === "REPRESENTATIVE" &&
                        participant.representedPartyName
                          ? ` (for ${participant.representedPartyName})`
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
                    setSelectedFieldType(event.target.value as FieldType)
                  }
                  disabled={busy}
                >
                  <option value="SIGNATURE">Signature</option>
                  <option value="INITIALS">Initials</option>
                  <option value="DATE_SIGNED">Date Signed</option>
                </select>
              </div>
            </div>
          ) : null}
          {editable && selectedFieldId && model ? (
            <div className="space-y-1">
              <Label htmlFor="reassign-participant">
                Reassign selected field
              </Label>
              <select
                id="reassign-participant"
                className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={
                  currentDocument?.fields.find(
                    (field) => field.id === selectedFieldId,
                  )?.participantId ?? ""
                }
                onChange={(event) =>
                  void reassignSelectedField(event.target.value)
                }
                disabled={busy}
              >
                {model.participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.fullName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              {editable ? "Loading documents…" : "Loading preview…"}
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {!loading && !error && model && model.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add at least one document before{" "}
              {editable ? "preparing fields" : "previewing"}.
            </p>
          ) : null}
          {!loading &&
          currentDocument &&
          !currentDocument.hasSelectedSnapshot ? (
            <p className="text-sm text-destructive">
              This document has no prepared Draft source snapshot yet. Add or
              re-capture the document before continuing.
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

              {editable ? (
                <p className="text-xs text-muted-foreground">
                  Choose a participant and field type, then click the PDF to
                  place. Drag or resize a placement to adjust. Signature also
                  places a linked Date Signed.
                </p>
              ) : null}

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
                      Could not load this Signing document.
                    </p>
                  }
                  onLoadSuccess={(pdf) => {
                    setPageCount(pdf.numPages);
                    setPageNumber((value) =>
                      Math.min(Math.max(1, value), pdf.numPages),
                    );
                  }}
                >
                  <div
                    className={cn(
                      "relative",
                      editable && selectedParticipantId
                        ? "cursor-crosshair"
                        : null,
                    )}
                    onClick={(event) => {
                      if (!editable) return;
                      const target = event.currentTarget;
                      void placeFieldAt(
                        event.clientX,
                        event.clientY,
                        target,
                      );
                    }}
                  >
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
                    {metrics
                      ? pageFields.map((field) => (
                          <SigningFieldOverlay
                            key={field.id}
                            field={field}
                            metrics={metrics}
                            editable={editable}
                            selected={selectedFieldId === field.id}
                            busy={busy}
                            onSelect={setSelectedFieldId}
                            onMoveOrResize={(moved, rect) => {
                              const pdf = renderRectToPdfPlacement(
                                rect,
                                metrics,
                              );
                              void persistFieldPlacement(moved, pdf);
                            }}
                            onRemove={(fieldId) => void removeField(fieldId)}
                          />
                        ))
                      : null}
                  </div>
                </Document>
              </div>

              {currentDocument.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {editable
                    ? "No Signing fields on this document yet. Place Signature, Initials, or Date Signed above."
                    : "No Signing fields are placed on this document yet."}
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
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
