"use client";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { PdfEditorResizableSidebar } from "@/components/forms/pdf-editor-resizable-sidebar";
import { PdfFieldOverlay } from "@/components/forms/pdf-field-overlay";
import { Button } from "@/components/ui/button";
import {
  clearPrivateFormDefault,
  loadFormDefaultsPage,
  type FormDefaultsFieldRow,
  type FormDefaultsPageData,
} from "@/lib/field-defaults-management";
import { createFormSignedUrlWithFallback } from "@/lib/storage-path-resolve";
import { sortPlacedPdfFields } from "@/lib/pdf-field-sort";
import { createClient } from "@/lib/supabase/client";
import { type Form, formatFormReference } from "@/lib/types/form";
import {
  FORM_FIELD_MAPPING_SELECT,
  type FormFieldMapping,
} from "@/lib/types/form-field-mapping";
import {
  DEFAULTS_PRECEDENCE_NOTICE,
  buildMySetupFieldCardCopy,
} from "@/lib/types/field-default-management";
import {
  type PageMetrics,
  type PlacedPdfField,
  formFieldMappingToPlacedPdfField,
} from "@/lib/types/template-pdf-field";
import { cn } from "@/lib/utils";
import { usePdfEditorSession } from "@/lib/use-pdf-editor-session";
import {
  PDF_MIN_PAGE_WIDTH,
  type PdfZoomMode,
  afterLayoutSettled,
  computePdfPageWidth,
  displayZoomPercent,
  scrollElementIntoContainer,
  stepZoomPercent,
} from "@/lib/pdf-editor-zoom";
import { usePdfEditorSidebarWidth } from "@/lib/use-pdf-editor-sidebar-width";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Document, Page } from "react-pdf";

type PdfMySetupEditorProps = {
  formId: number;
  initialDefaults: FormDefaultsPageData;
};

type PartialPageMetrics = Partial<PageMetrics>;

type SetupCard = {
  mappingId: string;
  pageNumber: number;
  fieldId: string | null;
  fieldRow: FormDefaultsFieldRow | null;
  title: string;
  fieldKey: string | null;
  pageLine: string;
  mappingLine: string;
  defaultLine: string;
  sourceLine: string;
  legacyProtected: boolean;
  canClearFormScoped: boolean;
};

export function PdfMySetupEditor({
  formId,
  initialDefaults,
}: PdfMySetupEditorProps) {
  const [defaults, setDefaults] = useState(initialDefaults);
  const [template, setTemplate] = useState<Form | null>(null);
  const [mappings, setMappings] = useState<PlacedPdfField[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageMetrics, setPageMetrics] = useState<
    Record<number, PartialPageMetrics>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const pdfWorkspaceRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const cardListRef = useRef<HTMLDivElement>(null);
  const cardItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  const [basePageWidth, setBasePageWidth] = useState<number | null>(null);
  const [basePageHeight, setBasePageHeight] = useState<number | null>(null);
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>("fit-width");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [useComfortableDefault, setUseComfortableDefault] = useState(true);
  const {
    beginLoadRequest,
    prepareFullScreenLoad,
    isPdfRenderReady,
    documentKey,
  } = usePdfEditorSession(pdfUrl, isLoading);
  const {
    width: sidebarWidth,
    setWidth: setSidebarWidth,
    minWidth: sidebarMinWidth,
    maxWidth: sidebarMaxWidth,
  } = usePdfEditorSidebarWidth();

  const defaultsByFieldId = useMemo(() => {
    const map = new Map<string, FormDefaultsFieldRow>();
    for (const field of defaults.fields) {
      map.set(field.fieldId, field);
    }
    return map;
  }, [defaults.fields]);

  const cards: SetupCard[] = useMemo(() => {
    return mappings.map((mapping) => {
      const fieldRow = mapping.field_id
        ? (defaultsByFieldId.get(mapping.field_id) ?? null)
        : null;
      const copy = buildMySetupFieldCardCopy({
        fieldLabel:
          fieldRow?.fieldLabel ||
          mapping.field_label ||
          mapping.mapping_name ||
          mapping.field_key ||
          "Field",
        fieldKey: fieldRow?.fieldKey || mapping.field_key || "—",
        pageNumber: mapping.page_number,
        mappingSummary:
          mapping.mapping_name?.trim() ||
          fieldRow?.mappingSummary ||
          "Mapped field",
        defaultDisplay: fieldRow?.effectiveDisplay ?? "None",
        sourceLabel: fieldRow?.effectiveSourceLabel ?? "None",
        showFieldKey: defaults.showFieldKey,
      });
      return {
        mappingId: mapping.id,
        pageNumber: mapping.page_number,
        fieldId: mapping.field_id,
        fieldRow,
        title: copy.title,
        fieldKey: copy.fieldKey,
        pageLine: copy.pageLine,
        mappingLine: copy.mappingLine,
        defaultLine: copy.defaultLine,
        sourceLine: copy.sourceLine,
        legacyProtected: fieldRow?.legacyPersonalProtected ?? false,
        canClearFormScoped:
          !!fieldRow?.canClearFormScopedPersonal && defaults.canEditPrivate,
      };
    });
  }, [mappings, defaultsByFieldId, defaults.showFieldKey, defaults.canEditPrivate]);

  useEffect(() => {
    const element = pdfWorkspaceRef.current;
    if (!element) {
      return;
    }
    const updateWorkspaceSize = () => {
      setWorkspaceSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };
    updateWorkspaceSize();
    const observer = new ResizeObserver(updateWorkspaceSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pdfUrl, isLoading]);

  const pageWidth = useMemo(() => {
    if (!basePageWidth || !basePageHeight) {
      return PDF_MIN_PAGE_WIDTH;
    }
    return computePdfPageWidth({
      mode: zoomMode,
      zoomPercent,
      basePageWidth,
      basePageHeight,
      workspaceWidth: workspaceSize.width,
      workspaceHeight: workspaceSize.height,
      comfortableClamp: useComfortableDefault && zoomMode === "fit-width",
    });
  }, [
    basePageWidth,
    basePageHeight,
    workspaceSize.width,
    workspaceSize.height,
    zoomMode,
    zoomPercent,
    useComfortableDefault,
  ]);

  const currentZoomLabel = useMemo(() => {
    if (!basePageWidth) {
      return "—";
    }
    return `${displayZoomPercent(pageWidth, basePageWidth)}%`;
  }, [basePageWidth, pageWidth]);

  const scrollPdfPageIntoView = useCallback((pageNumber: number) => {
    const page = pageRefs.current[pageNumber];
    const workspace = pdfWorkspaceRef.current;
    if (!page || !workspace) {
      return;
    }
    scrollElementIntoContainer(page, workspace);
  }, []);

  const scrollCardIntoView = useCallback((mappingId: string) => {
    const card = cardItemRefs.current[mappingId];
    const list = cardListRef.current;
    if (!card || !list) {
      return;
    }
    scrollElementIntoContainer(card, list);
  }, []);

  const selectFromOverlay = useCallback(
    (mapping: PlacedPdfField) => {
      setSelectedMappingId(mapping.id);
      afterLayoutSettled(() => {
        scrollCardIntoView(mapping.id);
      });
    },
    [scrollCardIntoView],
  );

  const selectFromCard = useCallback(
    (mappingId: string, pageNumber: number) => {
      setSelectedMappingId(mappingId);
      afterLayoutSettled(() => {
        scrollPdfPageIntoView(pageNumber);
      });
    },
    [scrollPdfPageIntoView],
  );

  const loadPdfAndMappings = useCallback(async () => {
    const request = beginLoadRequest();
    setIsLoading(true);
    prepareFullScreenLoad();
    setPdfUrl(null);
    setNumPages(0);
    setPageMetrics({});
    setBasePageWidth(null);
    setBasePageHeight(null);
    setLoadError(null);

    const supabase = createClient();
    const [templateResult, mappingsResult] = await Promise.all([
      supabase
        .from("forms")
        .select("*")
        .eq("id", formId)
        .eq("status", "ACTIVE")
        .single(),
      supabase
        .from("form_field_mappings")
        .select(FORM_FIELD_MAPPING_SELECT)
        .eq("form_id", formId)
        .eq("status", "ACTIVE")
        .order("page_number", { ascending: true })
        .order("occurrence_index", { ascending: true }),
    ]);

    if (!request.isCurrent()) {
      return;
    }

    if (templateResult.error || !templateResult.data) {
      setLoadError(templateResult.error?.message ?? "Form template not found.");
      setTemplate(null);
      setMappings([]);
      setIsLoading(false);
      return;
    }

    setTemplate(templateResult.data as Form);

    if (mappingsResult.error) {
      setLoadError(mappingsResult.error.message);
      setMappings([]);
    } else {
      const rows = (mappingsResult.data as FormFieldMapping[]) ?? [];
      setMappings(
        sortPlacedPdfFields(
          rows.map((row) => formFieldMappingToPlacedPdfField(row)),
        ),
      );
    }

    try {
      const form = templateResult.data as Form;
      const { signedUrl } = await createFormSignedUrlWithFallback(supabase, {
        formId: form.id,
        path: form.source_storage_path,
        formCode: form.form_code,
        scope: form.scope,
        ownerUserId: form.owner_user_id,
      });
      if (!request.isCurrent()) {
        return;
      }
      setPdfUrl(signedUrl);
    } catch (signedError) {
      if (!request.isCurrent()) {
        return;
      }
      setLoadError(
        signedError instanceof Error
          ? signedError.message
          : "Failed to load PDF.",
      );
      setPdfUrl(null);
    }

    setIsLoading(false);
  }, [beginLoadRequest, formId, prepareFullScreenLoad]);

  useEffect(() => {
    void loadPdfAndMappings();
  }, [loadPdfAndMappings]);

  async function reloadDefaults() {
    const result = await loadFormDefaultsPage({
      formId,
      organizationId: defaults.selectedOrganizationId,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDefaults(result.data);
  }

  function handleClearFormScoped(fieldId: string, fieldLabel: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await clearPrivateFormDefault({ formId, fieldId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.data.cleared) {
        setMessage(`No form-specific Personal default to clear for ${fieldLabel}.`);
      } else {
        setMessage(`Cleared form-specific Personal default for ${fieldLabel}.`);
      }
      await reloadDefaults();
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            My setup
          </p>
          <h1 className="truncate text-lg font-semibold">
            {template
              ? `${template.form_name} (${formatFormReference(template.id)})`
              : `${defaults.formName} (${defaults.formCode})`}
          </h1>
          <p className="text-xs text-muted-foreground">
            {DEFAULTS_PRECEDENCE_NOTICE}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {defaults.actor.isActiveAdmin ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/forms/${formId}/editor`}>Edit Global Template</Link>
            </Button>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <Link href="/forms">Back to templates</Link>
          </Button>
        </div>
      </div>

      {(loadError || error || message) && (
        <div className="shrink-0 space-y-1 border-b px-4 py-2">
          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setUseComfortableDefault(false);
                setZoomMode("fit-width");
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Fit width</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setUseComfortableDefault(false);
                const current =
                  basePageWidth != null
                    ? displayZoomPercent(pageWidth, basePageWidth)
                    : zoomPercent;
                setZoomMode("custom");
                setZoomPercent(stepZoomPercent(current, "out"));
              }}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="min-w-[3.5rem] text-center text-xs tabular-nums">
              {currentZoomLabel}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setUseComfortableDefault(false);
                const current =
                  basePageWidth != null
                    ? displayZoomPercent(pageWidth, basePageWidth)
                    : zoomPercent;
                setZoomMode("custom");
                setZoomPercent(stepZoomPercent(current, "in"));
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                setUseComfortableDefault(false);
                setZoomMode("fit-page");
              }}
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Fit page</span>
            </Button>
          </div>

          <div
            ref={pdfWorkspaceRef}
            className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4"
          >
            {isLoading || !pdfUrl ? (
              <p className="text-sm text-muted-foreground">Loading PDF…</p>
            ) : (
              <div className={cn(!isPdfRenderReady && "invisible")}>
                <Document
                  key={documentKey}
                  file={pdfUrl}
                  onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
                  loading={
                    <p className="text-sm text-muted-foreground">Rendering…</p>
                  }
                  error={
                    <p className="text-sm text-destructive">
                      Failed to render PDF.
                    </p>
                  }
                >
                  {Array.from({ length: numPages }, (_, index) => {
                    const pageNumber = index + 1;
                    const metrics = pageMetrics[pageNumber];
                    const pageMappings = mappings.filter(
                      (mapping) => mapping.page_number === pageNumber,
                    );
                    return (
                      <div
                        key={pageNumber}
                        ref={(element) => {
                          pageRefs.current[pageNumber] = element;
                        }}
                        className="relative mx-auto mb-4"
                        style={{ width: pageWidth }}
                      >
                        <Page
                          pageNumber={pageNumber}
                          width={pageWidth}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          onLoadSuccess={(page) => {
                            const viewport = page.getViewport({ scale: 1 });
                            setPageMetrics((current) => ({
                              ...current,
                              [pageNumber]: {
                                ...current[pageNumber],
                                originalWidth: viewport.width,
                                originalHeight: viewport.height,
                              },
                            }));
                            if (pageNumber === 1) {
                              setBasePageWidth(viewport.width);
                              setBasePageHeight(viewport.height);
                            }
                          }}
                          onRenderSuccess={({ width, height }) => {
                            setPageMetrics((current) => ({
                              ...current,
                              [pageNumber]: {
                                ...current[pageNumber],
                                renderedWidth: width,
                                renderedHeight: height,
                              },
                            }));
                          }}
                        />
                        {metrics?.renderedWidth &&
                          metrics.renderedHeight &&
                          metrics.originalWidth &&
                          metrics.originalHeight && (
                            <div
                              className="absolute inset-0"
                              style={{
                                width: metrics.renderedWidth,
                                height: metrics.renderedHeight,
                              }}
                            >
                              {pageMappings.map((mapping) => (
                                <PdfFieldOverlay
                                  key={mapping.id}
                                  field={mapping}
                                  metrics={metrics as PageMetrics}
                                  isSelected={selectedMappingId === mapping.id}
                                  isUpdating={false}
                                  readOnly
                                  onSelect={selectFromOverlay}
                                  onDragStop={() => {
                                    /* My setup never persists Global placements */
                                  }}
                                  onResizeStop={() => {
                                    /* My setup never persists Global placements */
                                  }}
                                />
                              ))}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </Document>
              </div>
            )}
          </div>
        </div>

        <PdfEditorResizableSidebar
          width={sidebarWidth}
          minWidth={sidebarMinWidth}
          maxWidth={sidebarMaxWidth}
          onWidthChange={setSidebarWidth}
        >
          <div className="shrink-0 border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Field defaults</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {cards.length === 1
                ? "1 mapped field on this form."
                : `${cards.length} mapped fields on this form.`}{" "}
              Legacy Personal values that apply to all forms are labeled and
              protected from form-level Clear.
            </p>
          </div>
          <div
            ref={cardListRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          >
            {cards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No mapped fields on this form yet.
              </p>
            ) : (
              <div className="space-y-2">
                {cards.map((card) => {
                  const isSelected = selectedMappingId === card.mappingId;
                  return (
                    <div
                      key={card.mappingId}
                      ref={(element) => {
                        cardItemRefs.current[card.mappingId] = element;
                      }}
                      className={cn(
                        "rounded-md border p-3 text-sm transition-colors",
                        isSelected &&
                          "bg-amber-50 ring-2 ring-inset ring-amber-400 dark:bg-amber-950/30",
                      )}
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() =>
                          selectFromCard(card.mappingId, card.pageNumber)
                        }
                      >
                        <div className="font-medium">{card.title}</div>
                        {card.fieldKey ? (
                          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                            {card.fieldKey}
                          </div>
                        ) : null}
                        <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <div>{card.pageLine}</div>
                          <div>
                            <span className="font-medium text-foreground/80">
                              Mapping:{" "}
                            </span>
                            {card.mappingLine}
                          </div>
                          <div>
                            <span className="font-medium text-foreground/80">
                              Default:{" "}
                            </span>
                            {card.defaultLine}
                          </div>
                          <div>
                            <span className="font-medium text-foreground/80">
                              Source:{" "}
                            </span>
                            {card.sourceLine}
                          </div>
                        </dl>
                      </button>
                      {card.legacyProtected ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Applies to all forms — form-level Clear is disabled.
                        </p>
                      ) : null}
                      {card.canClearFormScoped ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          disabled={isPending}
                          onClick={() => {
                            if (!card.fieldId || !card.fieldRow) {
                              return;
                            }
                            handleClearFormScoped(
                              card.fieldId,
                              card.fieldRow.fieldLabel,
                            );
                          }}
                        >
                          Clear personal default
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </PdfEditorResizableSidebar>
      </div>
    </div>
  );
}
