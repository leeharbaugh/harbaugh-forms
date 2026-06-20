"use client";

import "@/lib/pdfjs-setup";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import {
  PacketFormFieldOverlay,
  type PacketFormOverlayField,
} from "@/components/packets/packet-form-field-overlay";
import { PacketFormFieldValueDialog } from "@/components/packets/packet-form-field-value-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  loadPacketFormEditorData,
  resetFieldInstanceMappingPlacement,
  saveFieldInstanceValue,
  upsertFieldInstanceMappingPlacement,
} from "@/lib/packet-form-editor";
import { createClient } from "@/lib/supabase/client";
import { formatFormReference } from "@/lib/types/form";
import {
  formatPacketFieldDisplayValue,
  packetFormFieldViewToOverlayField,
  type PacketFormFieldView,
} from "@/lib/types/packet-form-editor";
import {
  type PageMetrics,
  pdfToRenderRect,
  renderRectToPdfPlacement,
} from "@/lib/types/template-pdf-field";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Document, Page } from "react-pdf";

type PacketFormEditorProps = {
  packetId: number;
  packetFormId: number;
};

type PartialPageMetrics = Partial<PageMetrics>;

export function PacketFormEditor({
  packetId,
  packetFormId,
}: PacketFormEditorProps) {
  const [documentName, setDocumentName] = useState("");
  const [formId, setFormId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState<PacketFormFieldView[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageMetrics, setPageMetrics] = useState<
    Record<number, PartialPageMetrics>
  >({});
  const [editingFieldView, setEditingFieldView] =
    useState<PacketFormFieldView | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingValue, setIsSavingValue] = useState(false);
  const [isResettingPlacement, setIsResettingPlacement] = useState(false);
  const [updatingMappingId, setUpdatingMappingId] = useState<string | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [updateLayoutError, setUpdateLayoutError] = useState<string | null>(
    null,
  );

  const pageWidth = 820;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    const supabase = createClient();

    try {
      const data = await loadPacketFormEditorData(supabase, packetFormId);

      if (data.packetForm.packet_id !== packetId) {
        throw new Error("Packet form does not belong to this packet.");
      }

      setDocumentName(data.packetForm.document_name);
      setFormId(data.packetForm.form_id);
      setFormName(data.packetForm.forms?.form_name ?? "");
      setFields(data.fields);
      setPdfUrl(data.pdfUrl);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Failed to load packet form editor.",
      );
      setFields([]);
      setPdfUrl(null);
    }

    setIsLoading(false);
  }, [packetFormId, packetId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const fieldsByPage = useMemo(() => {
    const grouped: Record<number, PacketFormOverlayField[]> = {};

    for (const fieldView of fields) {
      const overlayField = packetFormFieldViewToOverlayField(fieldView);
      if (!grouped[overlayField.page_number]) {
        grouped[overlayField.page_number] = [];
      }
      grouped[overlayField.page_number].push(overlayField);
    }

    return grouped;
  }, [fields]);

  const updatePageMetrics = (
    pageNumber: number,
    patch: PartialPageMetrics,
  ) => {
    setPageMetrics((current) => ({
      ...current,
      [pageNumber]: {
        ...current[pageNumber],
        ...patch,
      },
    }));
  };

  const findFieldViewByMappingId = (mappingId: string) =>
    fields.find((fieldView) => fieldView.mapping.id === mappingId) ?? null;

  const openValueDialog = (overlayField: PacketFormOverlayField) => {
    const fieldView = findFieldViewByMappingId(overlayField.id);
    if (!fieldView) {
      return;
    }

    setEditingFieldView(fieldView);
    setEditValue(fieldView.displayValue);
    setSaveError(null);
  };

  const closeValueDialog = () => {
    if (isSavingValue || isResettingPlacement) {
      return;
    }

    setEditingFieldView(null);
    setEditValue("");
    setSaveError(null);
  };

  const handleSaveValue = async () => {
    if (!editingFieldView) {
      return;
    }

    setIsSavingValue(true);
    setSaveError(null);

    const supabase = createClient();

    try {
      await saveFieldInstanceValue(
        supabase,
        editingFieldView.instance.id,
        editValue,
        "manual_override",
      );
      setIsSavingValue(false);
      closeValueDialog();
      await loadData();
    } catch (error) {
      setIsSavingValue(false);
      setSaveError(
        error instanceof Error ? error.message : "Failed to save field value.",
      );
    }
  };

  const handleResetPlacement = async () => {
    if (!editingFieldView?.hasPlacementOverride) {
      return;
    }

    setIsResettingPlacement(true);
    setSaveError(null);

    const supabase = createClient();

    try {
      await resetFieldInstanceMappingPlacement(
        supabase,
        packetFormId,
        editingFieldView.mapping.id,
      );
      setIsResettingPlacement(false);
      closeValueDialog();
      await loadData();
    } catch (error) {
      setIsResettingPlacement(false);
      setSaveError(
        error instanceof Error
          ? error.message
          : "Failed to reset placement override.",
      );
    }
  };

  const updateFieldViewInState = (
    mappingId: string,
    updater: (fieldView: PacketFormFieldView) => PacketFormFieldView,
  ) => {
    setFields((current) =>
      current.map((fieldView) =>
        fieldView.mapping.id === mappingId ? updater(fieldView) : fieldView,
      ),
    );
  };

  const persistPlacementOverride = async (
    fieldView: PacketFormFieldView,
    placement: {
      page_number: number;
      x: number;
      y: number;
      width: number;
      height: number;
      page_width: number;
      page_height: number;
      font_size: number | null;
      alignment: string | null;
    },
  ) => {
    setUpdatingMappingId(fieldView.mapping.id);
    setUpdateLayoutError(null);

    const supabase = createClient();

    try {
      await upsertFieldInstanceMappingPlacement(supabase, {
        packetId,
        packetFormId,
        fieldId: fieldView.mapping.field_id,
        fieldInstanceId: fieldView.instance.id,
        formFieldMappingId: fieldView.mapping.id,
        placement,
      });
      await loadData();
    } catch (error) {
      setUpdateLayoutError(
        error instanceof Error
          ? error.message
          : "Failed to save placement override.",
      );
      await loadData();
    } finally {
      setUpdatingMappingId(null);
    }
  };

  const handleOverlayDragStop = (
    overlayField: PacketFormOverlayField,
    metrics: PageMetrics,
    x: number,
    y: number,
  ) => {
    const fieldView = findFieldViewByMappingId(overlayField.id);
    if (!fieldView) {
      return;
    }

    const rect = pdfToRenderRect(overlayField, metrics);
    const placement = renderRectToPdfPlacement(
      { x, y, width: rect.width, height: rect.height },
      metrics,
      overlayField,
    );

    updateFieldViewInState(fieldView.mapping.id, (current) => ({
      ...current,
      hasPlacementOverride: true,
      placement: {
        ...current.placement,
        page_number: overlayField.page_number,
        x: placement.x,
        y: placement.y,
        page_width: placement.page_width,
        page_height: placement.page_height,
        source: "packet_override",
      },
    }));

    void persistPlacementOverride(fieldView, {
      page_number: overlayField.page_number,
      x: placement.x,
      y: placement.y,
      width: overlayField.width ?? placement.width,
      height: overlayField.height ?? placement.height,
      page_width: placement.page_width,
      page_height: placement.page_height,
      font_size: fieldView.placement.font_size,
      alignment: fieldView.placement.alignment,
    });
  };

  const handleOverlayResizeStop = (
    overlayField: PacketFormOverlayField,
    metrics: PageMetrics,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const fieldView = findFieldViewByMappingId(overlayField.id);
    if (!fieldView) {
      return;
    }

    const placement = renderRectToPdfPlacement(
      { x, y, width, height },
      metrics,
      overlayField,
    );

    updateFieldViewInState(fieldView.mapping.id, (current) => ({
      ...current,
      hasPlacementOverride: true,
      placement: {
        ...current.placement,
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        page_width: placement.page_width,
        page_height: placement.page_height,
        source: "packet_override",
      },
    }));

    void persistPlacementOverride(fieldView, {
      page_number: overlayField.page_number,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      page_width: placement.page_width,
      page_height: placement.page_height,
      font_size: fieldView.placement.font_size,
      alignment: fieldView.placement.alignment,
    });
  };

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        Loading packet form editor...
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" asChild>
          <Link href={`/packets/${packetId}`}>Back to packet</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {documentName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Packet form editor · {formName}
              {formId != null ? ` (${formatFormReference(formId)})` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/packets/${packetId}`}>Back to packet</Link>
            </Button>
            {formId != null && (
              <Button variant="outline" asChild>
                <Link href={`/forms/${formId}/editor`}>Edit template</Link>
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
            <p className="font-medium">This packet form only</p>
            <p className="mt-1 text-emerald-900/90 dark:text-emerald-100/90">
              Value edits and drag/resize placement overrides apply to this
              packet form instance only.
            </p>
          </div>
          <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
            <p className="font-medium">Template placement</p>
            <p className="mt-1 text-sky-900/90 dark:text-sky-100/90">
              Use{" "}
              {formId != null ? (
                <Link
                  href={`/forms/${formId}/editor`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  Edit template
                </Link>
              ) : (
                "the PDF Field Editor"
              )}{" "}
              to change default field positions for all future packets.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Populated PDF</CardTitle>
            <CardDescription>
              Green overlays use template placement. Amber overlays use a
              packet-specific placement override. Click to edit values; drag or
              resize to override placement for this packet form.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {updateLayoutError && (
              <p className="mb-4 text-sm text-destructive">{updateLayoutError}</p>
            )}
            {!pdfUrl ? (
              <p className="text-sm text-muted-foreground">
                No PDF is available for this packet form yet.
              </p>
            ) : (
              <Document
                file={pdfUrl}
                onLoadSuccess={({ numPages: loadedPages }) =>
                  setNumPages(loadedPages)
                }
                loading={
                  <p className="text-sm text-muted-foreground">Loading PDF...</p>
                }
                error={
                  <p className="text-sm text-destructive">
                    Failed to render the PDF.
                  </p>
                }
                className="flex flex-col gap-8"
              >
                {Array.from({ length: numPages }, (_, index) => {
                  const pageNumber = index + 1;
                  const pageFields = fieldsByPage[pageNumber] ?? [];
                  const metrics = pageMetrics[pageNumber];

                  return (
                    <div key={pageNumber} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Page {pageNumber}
                      </p>
                      <div className="relative inline-block border bg-muted/20 shadow-sm">
                        <Page
                          pageNumber={pageNumber}
                          width={pageWidth}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          onLoadSuccess={(page) => {
                            const viewport = page.getViewport({ scale: 1 });
                            updatePageMetrics(pageNumber, {
                              originalWidth: viewport.width,
                              originalHeight: viewport.height,
                            });
                          }}
                          onRenderSuccess={({ width, height }) => {
                            updatePageMetrics(pageNumber, {
                              renderedWidth: width,
                              renderedHeight: height,
                            });
                          }}
                        />

                        {metrics?.renderedWidth &&
                          metrics.renderedHeight &&
                          metrics.originalWidth &&
                          metrics.originalHeight && (
                            <div
                              className="absolute left-0 top-0"
                              style={{
                                width: metrics.renderedWidth,
                                height: metrics.renderedHeight,
                              }}
                            >
                              {pageFields.map((overlayField) => (
                                <PacketFormFieldOverlay
                                  key={overlayField.id}
                                  field={overlayField}
                                  metrics={metrics as PageMetrics}
                                  isUpdating={
                                    updatingMappingId === overlayField.id
                                  }
                                  onEdit={openValueDialog}
                                  onDragStop={(field, x, y) =>
                                    handleOverlayDragStop(
                                      field,
                                      metrics as PageMetrics,
                                      x,
                                      y,
                                    )
                                  }
                                  onResizeStop={(
                                    field,
                                    x,
                                    y,
                                    width,
                                    height,
                                  ) =>
                                    handleOverlayResizeStop(
                                      field,
                                      metrics as PageMetrics,
                                      x,
                                      y,
                                      width,
                                      height,
                                    )
                                  }
                                />
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })}
              </Document>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Field values</CardTitle>
            <CardDescription>
              {fields.length} template placement{fields.length === 1 ? "" : "s"} on
              this form.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No template placements found for this form.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {fields.map((fieldView) => {
                  const field = fieldView.instance.fields;
                  return (
                    <div
                      key={fieldView.mapping.id}
                      className="flex flex-col gap-2 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {field?.field_key ?? "Field"}
                        </span>
                        {fieldView.hasPlacementOverride && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                            Placement override
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground">
                        {formatPacketFieldDisplayValue(
                          fieldView.displayValue,
                          fieldView.field_type,
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Page {fieldView.placement.page_number}
                        {fieldView.mapping.occurrence_index != null
                          ? ` · #${fieldView.mapping.occurrence_index}`
                          : ""}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-fit"
                        onClick={() =>
                          openValueDialog(
                            packetFormFieldViewToOverlayField(fieldView),
                          )
                        }
                      >
                        Edit value
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PacketFormFieldValueDialog
        open={editingFieldView != null}
        fieldView={editingFieldView}
        value={editValue}
        onChange={setEditValue}
        onSubmit={() => void handleSaveValue()}
        onResetPlacement={() => void handleResetPlacement()}
        onCancel={closeValueDialog}
        isSubmitting={isSavingValue}
        isResettingPlacement={isResettingPlacement}
        error={saveError}
      />
    </div>
  );
}
