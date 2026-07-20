"use client";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { PdfEditorResizableSidebar } from "@/components/forms/pdf-editor-resizable-sidebar";
import { PdfFieldOverlay } from "@/components/forms/pdf-field-overlay";
import { Button } from "@/components/ui/button";
import {
  clearPrivateFormDefault,
  loadFormDefaultsPage,
  saveOrganizationFormDefault,
  savePrivateFormDefault,
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
  type DefaultsFieldValueDraft,
} from "@/lib/types/field-default-management";
import { formatFilledFromLabel } from "@/lib/types/field-provenance-labels";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  filledFromLine: string;
  defaultIfBlankLine: string;
  defaultSourceLine: string;
  legacyProtected: boolean;
  canClearFormScoped: boolean;
  canEditPersonal: boolean;
  canEditOrganization: boolean;
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
  const [editingCard, setEditingCard] = useState<SetupCard | null>(null);
  const [editScope, setEditScope] = useState<"PRIVATE" | "ORGANIZATION">(
    "PRIVATE",
  );
  const [editDraft, setEditDraft] = useState<DefaultsFieldValueDraft>({
    textValue: "",
    checked: null,
  });
  const [clearTarget, setClearTarget] = useState<SetupCard | null>(null);
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
      const filledFrom =
        fieldRow?.filledFromLabel ||
        formatFilledFromLabel({
          source_type: null,
          source_path: null,
        });
      const copy = buildMySetupFieldCardCopy({
        fieldLabel:
          fieldRow?.fieldLabel ||
          mapping.field_label ||
          mapping.mapping_name ||
          mapping.field_key ||
          "Field",
        fieldKey: fieldRow?.fieldKey || mapping.field_key || "—",
        pageNumber: mapping.page_number,
        filledFrom,
        defaultDisplay: fieldRow?.effectiveDisplay ?? "None",
        sourceLabel: fieldRow?.effectiveSourceLabel ?? "None",
        showFieldKey: defaults.showFieldKey,
      });
      const canEditPersonal =
        !!fieldRow &&
        defaults.canEditPrivate &&
        fieldRow.editorKind !== "unsupported";
      const canEditOrganization =
        !!fieldRow &&
        defaults.canEditOrganization &&
        !!defaults.selectedOrganizationId &&
        fieldRow.editorKind !== "unsupported";
      return {
        mappingId: mapping.id,
        pageNumber: mapping.page_number,
        fieldId: mapping.field_id,
        fieldRow,
        title: copy.title,
        fieldKey: copy.fieldKey,
        pageLine: copy.pageLine,
        filledFromLine: copy.filledFromLine,
        defaultIfBlankLine: copy.defaultIfBlankLine,
        defaultSourceLine: copy.defaultSourceLine,
        legacyProtected: fieldRow?.legacyPersonalProtected ?? false,
        canClearFormScoped:
          !!fieldRow?.canClearFormScopedPersonal && defaults.canEditPrivate,
        canEditPersonal,
        canEditOrganization,
      };
    });
  }, [
    mappings,
    defaultsByFieldId,
    defaults.showFieldKey,
    defaults.canEditPrivate,
    defaults.canEditOrganization,
    defaults.selectedOrganizationId,
  ]);

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
      setClearTarget(null);
      await reloadDefaults();
    });
  }

  function openDefaultEdit(card: SetupCard) {
    if (!card.fieldRow) {
      return;
    }
    const initialScope: "PRIVATE" | "ORGANIZATION" = card.canEditPersonal
      ? "PRIVATE"
      : card.canEditOrganization
        ? "ORGANIZATION"
        : "PRIVATE";
    setEditingCard(card);
    setEditScope(initialScope);
    setEditDraft(
      initialScope === "ORGANIZATION"
        ? card.fieldRow.organizationDraft
        : card.fieldRow.privateDraft,
    );
    setError(null);
    setMessage(null);
  }

  function handleSaveDefault() {
    if (!editingCard?.fieldId || !editingCard.fieldRow) {
      return;
    }
    const fieldId = editingCard.fieldId;
    const label = editingCard.fieldRow.fieldLabel;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      if (editScope === "ORGANIZATION") {
        const organizationId = defaults.selectedOrganizationId;
        if (!organizationId) {
          setError("Select an organization before saving an Organization default.");
          return;
        }
        const result = await saveOrganizationFormDefault({
          formId,
          fieldId,
          organizationId,
          draft: editDraft,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(`Saved Organization default for ${label}.`);
      } else {
        const result = await savePrivateFormDefault({
          formId,
          fieldId,
          draft: editDraft,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(`Saved Personal default for ${label}.`);
      }
      setEditingCard(null);
      await reloadDefaults();
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Map Fields
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
            <h2 className="text-sm font-semibold">Fields</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {cards.length === 1
                ? "1 mapped field on this form."
                : `${cards.length} mapped fields on this form.`}{" "}
              Defaults apply when the automatic source is blank. Legacy
              all-forms Personal defaults are protected from form-level Clear.
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
                              Filled from:{" "}
                            </span>
                            {card.filledFromLine}
                          </div>
                          <div>
                            <span className="font-medium text-foreground/80">
                              Default if blank:{" "}
                            </span>
                            {card.defaultIfBlankLine === "None"
                              ? ""
                              : card.defaultIfBlankLine}
                          </div>
                          <div>
                            <span className="font-medium text-foreground/80">
                              Default source:{" "}
                            </span>
                            {card.defaultSourceLine}
                          </div>
                        </dl>
                      </button>
                      {card.legacyProtected ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Applies to all forms — form-level Clear is disabled.
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {card.canEditPersonal || card.canEditOrganization ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => openDefaultEdit(card)}
                          >
                            Edit
                          </Button>
                        ) : null}
                        {card.canClearFormScoped ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => setClearTarget(card)}
                          >
                            Clear personal default
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </PdfEditorResizableSidebar>
      </div>

      {editingCard?.fieldRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="default-edit-title"
            className="w-full max-w-md rounded-lg border bg-card p-4 shadow-lg"
          >
            <h2 id="default-edit-title" className="text-base font-semibold">
              Edit default — {editingCard.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Preference defaults apply when the automatic source is blank.
              Saving creates or updates a form-specific default. Legacy
              all-forms Personal defaults are not modified.
            </p>
            {editingCard.canEditPersonal && editingCard.canEditOrganization ? (
              <div className="mt-4 space-y-2">
                <Label htmlFor="edit-default-scope">Write target</Label>
                <select
                  id="edit-default-scope"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editScope}
                  onChange={(event) => {
                    const next =
                      event.target.value === "ORGANIZATION"
                        ? "ORGANIZATION"
                        : "PRIVATE";
                    setEditScope(next);
                    if (!editingCard.fieldRow) {
                      return;
                    }
                    setEditDraft(
                      next === "ORGANIZATION"
                        ? editingCard.fieldRow.organizationDraft
                        : editingCard.fieldRow.privateDraft,
                    );
                  }}
                >
                  <option value="PRIVATE">My default</option>
                  <option value="ORGANIZATION">
                    Organization default
                    {defaults.selectedOrganizationName
                      ? ` (${defaults.selectedOrganizationName})`
                      : ""}
                  </option>
                </select>
              </div>
            ) : (
              <p className="mt-3 text-xs font-medium text-foreground">
                Writing:{" "}
                {editScope === "ORGANIZATION"
                  ? `Organization default${
                      defaults.selectedOrganizationName
                        ? ` (${defaults.selectedOrganizationName})`
                        : ""
                    }`
                  : "My default (Personal)"}
              </p>
            )}
            {editingCard.fieldRow.editorKind === "checkbox" ? (
              <div className="mt-4 space-y-2">
                <Label htmlFor="edit-default-checked">Default if blank</Label>
                <select
                  id="edit-default-checked"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={
                    editDraft.checked === true
                      ? "checked"
                      : editDraft.checked === false
                        ? "unchecked"
                        : ""
                  }
                  onChange={(event) => {
                    const value = event.target.value;
                    setEditDraft({
                      textValue: "",
                      checked:
                        value === "checked"
                          ? true
                          : value === "unchecked"
                            ? false
                            : null,
                    });
                  }}
                >
                  <option value="">Choose checked or unchecked…</option>
                  <option value="checked">Checked</option>
                  <option value="unchecked">Unchecked</option>
                </select>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <Label htmlFor="edit-default-text">Default if blank</Label>
                <Input
                  id="edit-default-text"
                  value={editDraft.textValue}
                  onChange={(event) =>
                    setEditDraft({
                      textValue: event.target.value,
                      checked: null,
                    })
                  }
                  autoComplete="off"
                />
              </div>
            )}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setEditingCard(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isPending}
                onClick={() => handleSaveDefault()}
              >
                {isPending
                  ? "Saving…"
                  : editScope === "ORGANIZATION"
                    ? "Save Organization default"
                    : "Save Personal default"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!clearTarget}
        title="Clear personal default?"
        message={
          clearTarget
            ? `Remove the form-specific Personal default for ${clearTarget.title}? Legacy all-forms defaults are not affected.`
            : undefined
        }
        confirmLabel="Clear default"
        variant="destructive"
        isConfirming={isPending}
        onConfirm={() => {
          if (!clearTarget?.fieldId || !clearTarget.fieldRow) {
            return;
          }
          handleClearFormScoped(
            clearTarget.fieldId,
            clearTarget.fieldRow.fieldLabel,
          );
        }}
        onCancel={() => setClearTarget(null)}
      />
    </div>
  );
}
