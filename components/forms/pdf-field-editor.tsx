"use client";

import "@/lib/pdfjs-setup";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { PdfFieldEditDialog } from "@/components/forms/pdf-field-edit-dialog";
import { PdfFieldInventoryPanel } from "@/components/forms/pdf-field-inventory-panel";
import { PdfFieldOverlay } from "@/components/forms/pdf-field-overlay";
import { PdfFieldPlacementDialog } from "@/components/forms/pdf-field-placement-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createActiveField } from "@/lib/field-catalog";
import { getFormPdfSignedUrl } from "@/lib/form-storage";
import { extractPdfFieldInventory } from "@/lib/pdf-field-extract";
import {
  applyPdfFieldInventory,
  type ApplyPdfFieldInventoryResult,
} from "@/lib/pdf-field-inventory";
import { createClient } from "@/lib/supabase/client";
import { type Form, formatFormReference } from "@/lib/types/form";
import {
  FORM_FIELD_MAPPING_SELECT,
  type FormFieldMapping,
} from "@/lib/types/form-field-mapping";
import type { Field } from "@/lib/types/field";
import {
  emptyFieldInput,
  fieldToInput,
  normalizeFieldInput,
  validateFieldInput,
  type FieldInput,
} from "@/lib/types/field";
import { formatFieldSourceSaveError, emptyFieldSourceInput } from "@/lib/types/field-source";
import {
  formatMappingOverlayLabel,
  emptyPdfMappingEditorInput,
  mappingInputForPlacement,
  normalizePdfMappingEditorInput,
  placedPdfFieldToMappingInput,
  templatePlacementSidebarDetails,
  type PdfMappingEditorInput,
  validatePdfMappingEditorInput,
  validatePdfPlacementInput,
} from "@/lib/types/pdf-field-mapping-editor";
import {
  type PageMetrics,
  type PendingPdfPlacement,
  type PlacedPdfField,
  clampPdfPlacementToPage,
  clickToPdfCoordinates,
  formFieldMappingToPlacedPdfField,
  getDefaultFieldDimensions,
  pdfToRenderRect,
  renderRectToPdfPlacement,
} from "@/lib/types/template-pdf-field";
import { cn } from "@/lib/utils";
import {
  PDF_EDITOR_SIDEBAR_WIDTH,
  PDF_MIN_PAGE_WIDTH,
  type PdfZoomMode,
  afterLayoutSettled,
  computePdfPageWidth,
  displayZoomPercent,
  scrollElementIntoContainer,
  stepZoomPercent,
} from "@/lib/pdf-editor-zoom";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import type { PdfFieldInventoryResult } from "@/lib/pdf-field-extract";

type PdfFieldEditorProps = {
  formId: number;
};

type PartialPageMetrics = Partial<PageMetrics>;

const PLACEMENT_EPSILON = 0.5;

function mappingLayoutMatches(
  mapping: PlacedPdfField,
  updates: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  },
): boolean {
  const nextWidth = updates.width ?? mapping.width ?? 0;
  const nextHeight = updates.height ?? mapping.height ?? 0;
  const currentWidth = mapping.width ?? 0;
  const currentHeight = mapping.height ?? 0;

  return (
    Math.abs(updates.x - mapping.x_position) <= PLACEMENT_EPSILON &&
    Math.abs(updates.y - mapping.y_position) <= PLACEMENT_EPSILON &&
    Math.abs(nextWidth - currentWidth) <= PLACEMENT_EPSILON &&
    Math.abs(nextHeight - currentHeight) <= PLACEMENT_EPSILON
  );
}

async function resolveFieldId(
  supabase: ReturnType<typeof createClient>,
  normalized: ReturnType<typeof normalizePdfMappingEditorInput>,
): Promise<string> {
  if (normalized.field_selection_mode === "existing") {
    if (!normalized.field_id) {
      throw new Error("A catalog field is required.");
    }
    return normalized.field_id;
  }

  if (!normalized.quick_create) {
    throw new Error("Quick-create field details are required.");
  }

  const created = await createActiveField(supabase, {
    field_key: normalized.quick_create.field_key,
    field_name: normalized.quick_create.field_name ?? normalized.quick_create.field_key,
    field_label: normalized.quick_create.field_label ?? "",
    field_data_type: normalized.quick_create.field_data_type,
    field_widget_type: normalized.quick_create.field_widget_type,
    default_value: "",
    default_checked: false,
    required: false,
    notes: "",
    ...emptyFieldSourceInput(),
  });

  return created.id;
}

export function PdfFieldEditor({ formId }: PdfFieldEditorProps) {
  const [template, setTemplate] = useState<Form | null>(null);
  const [catalogFields, setCatalogFields] = useState<Field[]>([]);
  const [mappings, setMappings] = useState<PlacedPdfField[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageMetrics, setPageMetrics] = useState<
    Record<number, PartialPageMetrics>
  >({});
  const [pendingPlacement, setPendingPlacement] =
    useState<PendingPdfPlacement | null>(null);
  const [placementValue, setPlacementValue] = useState<PdfMappingEditorInput>(
    emptyPdfMappingEditorInput(),
  );
  const [editingMapping, setEditingMapping] = useState<PlacedPdfField | null>(
    null,
  );
  const [editValue, setEditValue] = useState<PdfMappingEditorInput>(
    emptyPdfMappingEditorInput(),
  );
  const [editFieldValue, setEditFieldValue] = useState<FieldInput>(
    emptyFieldInput(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [updatingMappingId, setUpdatingMappingId] = useState<string | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [updateLayoutError, setUpdateLayoutError] = useState<string | null>(
    null,
  );
  const [inventory, setInventory] = useState<PdfFieldInventoryResult | null>(
    null,
  );
  const [inventoryApplyResult, setInventoryApplyResult] =
    useState<ApplyPdfFieldInventoryResult | null>(null);
  const [isExtractingInventory, setIsExtractingInventory] = useState(false);
  const [isApplyingInventory, setIsApplyingInventory] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(
    null,
  );
  const pdfWorkspaceRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const inventoryListRef = useRef<HTMLDivElement>(null);
  const inventoryItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });
  const [basePageWidth, setBasePageWidth] = useState<number | null>(null);
  const [basePageHeight, setBasePageHeight] = useState<number | null>(null);
  const [zoomMode, setZoomMode] = useState<PdfZoomMode>("fit-width");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [useComfortableDefault, setUseComfortableDefault] = useState(true);

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

  const handleFitWidth = () => {
    setUseComfortableDefault(false);
    setZoomMode("fit-width");
  };

  const handleFitPage = () => {
    setUseComfortableDefault(false);
    setZoomMode("fit-page");
  };

  const handleZoomIn = () => {
    setUseComfortableDefault(false);
    const current =
      basePageWidth != null
        ? displayZoomPercent(pageWidth, basePageWidth)
        : zoomPercent;
    setZoomMode("custom");
    setZoomPercent(stepZoomPercent(current, "in"));
  };

  const handleZoomOut = () => {
    setUseComfortableDefault(false);
    const current =
      basePageWidth != null
        ? displayZoomPercent(pageWidth, basePageWidth)
        : zoomPercent;
    setZoomMode("custom");
    setZoomPercent(stepZoomPercent(current, "out"));
  };

  const setBasePageDimensions = (
    pageNumber: number,
    width: number,
    height: number,
  ) => {
    if (pageNumber !== 1) {
      return;
    }

    setBasePageWidth(width);
    setBasePageHeight(height);
  };

  const loadData = useCallback(
    async (options?: { showFullScreenLoading?: boolean }) => {
      const showFullScreenLoading = options?.showFullScreenLoading ?? false;
      if (showFullScreenLoading) {
        setIsLoading(true);
      }
      setLoadError(null);

    const supabase = createClient();

    const [templateResult, mappingsResult, catalogResult] = await Promise.all([
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
      supabase
        .from("fields")
        .select("*")
        .in("status", ["ACTIVE", "INACTIVE"])
        .order("field_key", { ascending: true }),
    ]);

    if (templateResult.error || !templateResult.data) {
      setLoadError(templateResult.error?.message ?? "Form template not found.");
      setTemplate(null);
      setMappings([]);
      setCatalogFields([]);
      setPdfUrl(null);
      setIsLoading(false);
      return;
    }

    const nextTemplate = templateResult.data as Form;
    setTemplate(nextTemplate);

    if (mappingsResult.error) {
      setLoadError(mappingsResult.error.message);
      setMappings([]);
    } else {
      const rows = (mappingsResult.data as FormFieldMapping[]) ?? [];
      setMappings(rows.map((row) => formFieldMappingToPlacedPdfField(row)));
    }

    if (catalogResult.error) {
      setLoadError(catalogResult.error.message);
      setCatalogFields([]);
    } else {
      setCatalogFields((catalogResult.data as Field[]) ?? []);
    }

    try {
      const signedUrl = await getFormPdfSignedUrl(
        supabase,
        nextTemplate.source_storage_path,
      );
      setPdfUrl(signedUrl);
    } catch (urlError) {
      setLoadError(
        urlError instanceof Error
          ? urlError.message
          : "Failed to load the template PDF.",
      );
      setPdfUrl(null);
    }

    setIsLoading(false);
  }, [formId]);

  useEffect(() => {
    void loadData({ showFullScreenLoading: true });
  }, [loadData]);

  const handleExtractInventory = async () => {
    if (!pdfUrl) {
      return;
    }

    setIsExtractingInventory(true);
    setInventoryError(null);
    setInventoryApplyResult(null);

    try {
      const result = await extractPdfFieldInventory(pdfUrl);
      setInventory(result);
    } catch (error) {
      setInventory(null);
      setInventoryError(
        error instanceof Error
          ? error.message
          : "Failed to extract PDF field inventory.",
      );
    } finally {
      setIsExtractingInventory(false);
    }
  };

  const handleApplyInventory = async () => {
    if (!inventory || inventory.items.length === 0) {
      return;
    }

    setIsApplyingInventory(true);
    setInventoryError(null);

    const supabase = createClient();

    try {
      const result = await applyPdfFieldInventory(
        supabase,
        formId,
        inventory.items,
      );
      setInventoryApplyResult(result);
      await loadData();
    } catch (error) {
      setInventoryError(
        error instanceof Error
          ? error.message
          : "Failed to apply PDF field inventory.",
      );
    } finally {
      setIsApplyingInventory(false);
    }
  };

  const mappingsByPage = useMemo(() => {
    const grouped: Record<number, PlacedPdfField[]> = {};

    for (const mapping of mappings) {
      if (!grouped[mapping.page_number]) {
        grouped[mapping.page_number] = [];
      }
      grouped[mapping.page_number].push(mapping);
    }

    return grouped;
  }, [mappings]);

  const sortPlacedPdfFields = useCallback((rows: PlacedPdfField[]) => {
    return [...rows].sort((a, b) => {
      if (a.page_number !== b.page_number) {
        return a.page_number - b.page_number;
      }

      const aOccurrence = a.occurrence_index ?? 0;
      const bOccurrence = b.occurrence_index ?? 0;
      if (aOccurrence !== bOccurrence) {
        return aOccurrence - bOccurrence;
      }

      return a.id.localeCompare(b.id);
    });
  }, []);

  const scrollInventoryItemIntoView = useCallback((mappingId: string) => {
    const container = inventoryListRef.current;
    const item = inventoryItemRefs.current[mappingId];
    if (!container || !item) {
      return;
    }

    scrollElementIntoContainer(container, item);
  }, []);

  const scrollPdfPageIntoView = useCallback((pageNumber: number) => {
    const workspace = pdfWorkspaceRef.current;
    const pageElement = pageRefs.current[pageNumber];
    if (!workspace || !pageElement) {
      return;
    }

    scrollElementIntoContainer(workspace, pageElement, 16);
  }, []);

  const restorePdfViewerAfterPlacement = useCallback(
    (pageNumber: number, mappingId: string, scrollTop: number) => {
      afterLayoutSettled(() => {
        const workspace = pdfWorkspaceRef.current;
        if (workspace) {
          workspace.scrollTop = scrollTop;
        }
        scrollPdfPageIntoView(pageNumber);
        scrollInventoryItemIntoView(mappingId);
      });
    },
    [scrollInventoryItemIntoView, scrollPdfPageIntoView],
  );

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

  const openPlacementDialog = (
    pageNumber: number,
    clickX: number,
    clickY: number,
  ) => {
    const metrics = pageMetrics[pageNumber];
    if (
      !metrics?.renderedWidth ||
      !metrics.renderedHeight ||
      !metrics.originalWidth ||
      !metrics.originalHeight
    ) {
      return;
    }

    const { x, y } = clickToPdfCoordinates(clickX, clickY, metrics as PageMetrics);

    setPendingPlacement({
      pageNumber,
      xPosition: x,
      yPosition: y,
    });
    setPlacementValue(mappingInputForPlacement(pageNumber, x, y));
    setSaveError(null);
  };

  const closePlacementDialog = () => {
    if (isSaving) return;
    setPendingPlacement(null);
    setSaveError(null);
    setPlacementValue(emptyPdfMappingEditorInput());
  };

  const handleSavePlacement = async () => {
    if (!pendingPlacement) return;

    const validationError = validatePdfMappingEditorInput(placementValue);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    const normalized = normalizePdfMappingEditorInput(placementValue);
    const metrics = pageMetrics[pendingPlacement.pageNumber];
    const placementPageNumber = pendingPlacement.pageNumber;
    const workspaceScrollTop = pdfWorkspaceRef.current?.scrollTop ?? 0;
    setIsSaving(true);
    setSaveError(null);

    const supabase = createClient();

    try {
      const fieldId = await resolveFieldId(supabase, normalized);

      const { data, error } = await supabase
        .from("form_field_mappings")
        .insert({
          form_id: formId,
          field_id: fieldId,
          page_width: metrics?.originalWidth ?? null,
          page_height: metrics?.originalHeight ?? null,
          ...normalized.mapping,
        })
        .select(FORM_FIELD_MAPPING_SELECT)
        .single();

      if (error) {
        setSaveError(error.message);
        setIsSaving(false);
        return;
      }

      const newMapping = formFieldMappingToPlacedPdfField(
        data as FormFieldMapping,
      );

      setMappings((current) =>
        sortPlacedPdfFields([...current, newMapping]),
      );

      if (normalized.field_selection_mode === "quick_create") {
        const { data: catalogData, error: catalogError } = await supabase
          .from("fields")
          .select("*")
          .in("status", ["ACTIVE", "INACTIVE"])
          .order("field_key", { ascending: true });

        if (!catalogError && catalogData) {
          setCatalogFields(catalogData as Field[]);
        }
      }

      setSelectedMappingId(newMapping.id);
      setIsSaving(false);
      closePlacementDialog();
      restorePdfViewerAfterPlacement(
        placementPageNumber,
        newMapping.id,
        workspaceScrollTop,
      );
    } catch (placementError) {
      setSaveError(
        placementError instanceof Error
          ? placementError.message
          : "Failed to save template placement.",
      );
      setIsSaving(false);
    }
  };

  const handleDeleteMapping = async (mapping: PlacedPdfField) => {
    const confirmed = window.confirm(
      `Delete template placement for ${formatMappingOverlayLabel(mapping)} on this form?`,
    );

    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setIsDeletingId(mapping.id);

    const supabase = createClient();
    const { error } = await supabase
      .from("form_field_mappings")
      .update({ status: "DELETED" })
      .eq("id", mapping.id)
      .eq("status", "ACTIVE");

    setIsDeletingId(null);

    if (error) {
      setDeleteError(error.message);
      return;
    }

    if (editingMapping?.id === mapping.id) {
      closeEditDialog();
    }

    if (selectedMappingId === mapping.id) {
      setSelectedMappingId(null);
    }

    await loadData();
  };

  const selectMappingFromOverlay = useCallback(
    (mapping: PlacedPdfField) => {
      setSelectedMappingId(mapping.id);
      afterLayoutSettled(() => {
        scrollInventoryItemIntoView(mapping.id);
      });
    },
    [scrollInventoryItemIntoView],
  );

  const selectMappingFromInventory = useCallback(
    (mapping: PlacedPdfField) => {
      setSelectedMappingId(mapping.id);
      afterLayoutSettled(() => {
        scrollPdfPageIntoView(mapping.page_number);
      });
    },
    [scrollPdfPageIntoView],
  );

  const openEditDialog = (mapping: PlacedPdfField) => {
    setSelectedMappingId(mapping.id);
    setEditingMapping(mapping);
    setEditValue(placedPdfFieldToMappingInput(mapping));
    const catalogField = catalogFields.find((field) => field.id === mapping.field_id);
    setEditFieldValue(
      catalogField ? fieldToInput(catalogField) : emptyFieldInput(),
    );
    setEditError(null);
  };

  const closeEditDialog = () => {
    if (isEditing || isDeleting) return;
    setEditingMapping(null);
    setEditError(null);
    setEditValue(emptyPdfMappingEditorInput());
    setEditFieldValue(emptyFieldInput());
  };

  const handleSaveEdit = async () => {
    if (!editingMapping) return;

    const placementValidationError = validatePdfPlacementInput(editValue);
    const fieldValidationError = validateFieldInput(editFieldValue);
    const validationError = placementValidationError ?? fieldValidationError;
    if (validationError) {
      setEditError(validationError);
      return;
    }

    const normalizedPlacement = normalizePdfMappingEditorInput(editValue);
    const normalizedField = normalizeFieldInput(editFieldValue);
    setIsEditing(true);
    setEditError(null);

    const supabase = createClient();

    try {
      const { data: mappingData, error: mappingError } = await supabase
        .from("form_field_mappings")
        .update({
          ...normalizedPlacement.mapping,
        })
        .eq("id", editingMapping.id)
        .eq("status", "ACTIVE")
        .select(FORM_FIELD_MAPPING_SELECT)
        .single();

      if (mappingError) {
        setIsEditing(false);
        setEditError(mappingError.message);
        return;
      }

      const { error: fieldError } = await supabase
        .from("fields")
        .update(normalizedField)
        .eq("id", editingMapping.field_id)
        .eq("status", "ACTIVE");

      setIsEditing(false);

      if (fieldError) {
        setEditError(formatFieldSourceSaveError(fieldError.message));
        return;
      }

      const updatedMapping = formFieldMappingToPlacedPdfField(
        mappingData as FormFieldMapping,
      );
      setMappings((current) =>
        current.map((item) =>
          item.id === updatedMapping.id ? updatedMapping : item,
        ),
      );
      closeEditDialog();
      await loadData();
    } catch (editSaveError) {
      setIsEditing(false);
      setEditError(
        editSaveError instanceof Error
          ? editSaveError.message
          : "Failed to update template placement.",
      );
    }
  };

  const handleDeleteFromDialog = async () => {
    if (!editingMapping) return;

    setIsDeleting(true);
    setEditError(null);

    try {
      await handleDeleteMapping(editingMapping);
    } finally {
      setIsDeleting(false);
    }
  };

  const updateMappingInState = (
    mappingId: string,
    updates: Partial<PlacedPdfField>,
  ) => {
    setMappings((current) =>
      current.map((mapping) =>
        mapping.id === mappingId ? { ...mapping, ...updates } : mapping,
      ),
    );
  };

  const persistMappingLayout = async (
    mapping: PlacedPdfField,
    updates: {
      x: number;
      y: number;
      width?: number;
      height?: number;
      page_width: number;
      page_height: number;
    },
  ) => {
    if (mappingLayoutMatches(mapping, updates)) {
      return;
    }

    setUpdatingMappingId(mapping.id);
    setUpdateLayoutError(null);
    updateMappingInState(mapping.id, {
      x_position: updates.x,
      y_position: updates.y,
      width: updates.width ?? mapping.width,
      height: updates.height ?? mapping.height,
      page_width: updates.page_width,
      page_height: updates.page_height,
    });

    const supabase = createClient();
    const { error } = await supabase
      .from("form_field_mappings")
      .update(updates)
      .eq("id", mapping.id)
      .eq("status", "ACTIVE");

    setUpdatingMappingId(null);

    if (error) {
      setUpdateLayoutError(error.message);
      await loadData();
    }
  };

  const handleOverlayDragStop = (
    mapping: PlacedPdfField,
    metrics: PageMetrics,
    x: number,
    y: number,
  ) => {
    const rect = pdfToRenderRect(mapping, metrics);
    const placement = renderRectToPdfPlacement(
      { x, y, width: rect.width, height: rect.height },
      metrics,
      mapping,
    );

    void persistMappingLayout(mapping, {
      x: placement.x,
      y: placement.y,
      page_width: placement.page_width,
      page_height: placement.page_height,
    });
  };

  const handleOverlayResizeStop = (
    mapping: PlacedPdfField,
    metrics: PageMetrics,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    const placement = renderRectToPdfPlacement(
      { x, y, width, height },
      metrics,
      mapping,
    );

    void persistMappingLayout(mapping, {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      page_width: placement.page_width,
      page_height: placement.page_height,
    });
  };

  const moveMappingToPage = useCallback(
    async (mapping: PlacedPdfField, newPageNumber: number) => {
      if (
        !Number.isInteger(newPageNumber) ||
        newPageNumber < 1 ||
        newPageNumber > numPages ||
        newPageNumber === mapping.page_number
      ) {
        return;
      }

      const targetMetrics = pageMetrics[newPageNumber];
      const pageWidth =
        targetMetrics?.originalWidth ??
        basePageWidth ??
        mapping.page_width ??
        612;
      const pageHeight =
        targetMetrics?.originalHeight ??
        basePageHeight ??
        mapping.page_height ??
        792;

      const defaults = getDefaultFieldDimensions(mapping.field_type);
      const width = mapping.width ?? defaults.width;
      const height = mapping.height ?? defaults.height;
      const clamped = clampPdfPlacementToPage({
        x: mapping.x_position,
        y: mapping.y_position,
        width,
        height,
        page_width: pageWidth,
        page_height: pageHeight,
      });

      const updates = {
        page_number: newPageNumber,
        x: clamped.x,
        y: clamped.y,
        width: clamped.width,
        height: clamped.height,
        page_width: pageWidth,
        page_height: pageHeight,
      };

      setUpdatingMappingId(mapping.id);
      setUpdateLayoutError(null);
      updateMappingInState(mapping.id, {
        page_number: newPageNumber,
        x_position: clamped.x,
        y_position: clamped.y,
        width: clamped.width,
        height: clamped.height,
        page_width: pageWidth,
        page_height: pageHeight,
      });

      const supabase = createClient();
      const { data, error } = await supabase
        .from("form_field_mappings")
        .update(updates)
        .eq("id", mapping.id)
        .eq("status", "ACTIVE")
        .select(FORM_FIELD_MAPPING_SELECT)
        .single();

      setUpdatingMappingId(null);

      if (error) {
        setUpdateLayoutError(error.message);
        await loadData();
        return;
      }

      const updatedMapping = formFieldMappingToPlacedPdfField(
        data as FormFieldMapping,
      );
      setMappings((current) =>
        current.map((item) =>
          item.id === updatedMapping.id ? updatedMapping : item,
        ),
      );
      setSelectedMappingId(updatedMapping.id);
      afterLayoutSettled(() => {
        scrollPdfPageIntoView(newPageNumber);
      });
    },
    [
      numPages,
      pageMetrics,
      basePageWidth,
      basePageHeight,
      loadData,
      scrollPdfPageIntoView,
    ],
  );

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Loading PDF field mapping editor...</p>
    );
  }

  if (loadError || !template) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          {loadError ?? "Form template not found."}
        </p>
        <Button variant="outline" asChild>
          <Link href="/forms">Back to forms</Link>
        </Button>
      </div>
    );
  }

  const placementMetrics = pendingPlacement
    ? pageMetrics[pendingPlacement.pageNumber]
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-4 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            PDF Field Mapping Editor
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {template.form_name} ({formatFormReference(template.id)}) · template
            placements only
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/forms">Back to forms</Link>
          </Button>
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `minmax(0, 1fr) ${PDF_EDITOR_SIDEBAR_WIDTH}px`,
        }}
      >
        <div className="flex min-h-0 min-w-0 flex-col border-r">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={!pdfUrl}
              aria-label="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="min-w-[3.5rem] text-center text-sm font-medium tabular-nums">
              {currentZoomLabel}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={!pdfUrl}
              aria-label="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <Button
              type="button"
              variant={zoomMode === "fit-width" ? "secondary" : "outline"}
              size="sm"
              onClick={handleFitWidth}
              disabled={!pdfUrl}
            >
              Fit Width
            </Button>
            <Button
              type="button"
              variant={zoomMode === "fit-page" ? "secondary" : "outline"}
              size="sm"
              onClick={handleFitPage}
              disabled={!pdfUrl}
            >
              Fit Page
            </Button>
            <p className="hidden text-xs text-muted-foreground lg:block">
              Click the PDF to place fields. Click overlays or list rows to
              select.
            </p>
          </div>

          <div
            ref={pdfWorkspaceRef}
            className="isolate min-h-0 flex-1 overflow-auto bg-muted/50"
          >
            {updateLayoutError && (
              <p className="p-4 text-sm text-destructive">{updateLayoutError}</p>
            )}
            {!pdfUrl ? (
              <p className="p-4 text-sm text-muted-foreground">
                No PDF preview available for this template.
              </p>
            ) : (
              <div className="flex min-h-full flex-col items-center gap-8 p-6">
                <Document
                  file={pdfUrl}
                  onLoadSuccess={({ numPages: loadedPages }) =>
                    setNumPages(loadedPages)
                  }
                  loading={
                    <p className="text-sm text-muted-foreground">
                      Loading PDF...
                    </p>
                  }
                  error={
                    <p className="text-sm text-destructive">
                      Failed to render the PDF.
                    </p>
                  }
                  className="flex w-max flex-col gap-8"
                >
                  {Array.from({ length: numPages }, (_, index) => {
                    const pageNumber = index + 1;
                    const pageMappings = mappingsByPage[pageNumber] ?? [];
                    const metrics = pageMetrics[pageNumber];

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
                        <div className="relative w-fit border bg-white shadow-md dark:bg-zinc-900">
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
                              setBasePageDimensions(
                                pageNumber,
                                viewport.width,
                                viewport.height,
                              );
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
                                className="absolute left-0 top-0 overflow-hidden"
                                style={{
                                  width: metrics.renderedWidth,
                                  height: metrics.renderedHeight,
                                }}
                              >
                                <button
                                  type="button"
                                  className="absolute inset-0 z-[1] cursor-crosshair bg-transparent"
                                  aria-label={`Place field on page ${pageNumber}`}
                                  onClick={(event) => {
                                    const rect =
                                      event.currentTarget.getBoundingClientRect();
                                    openPlacementDialog(
                                      pageNumber,
                                      event.clientX - rect.left,
                                      event.clientY - rect.top,
                                    );
                                  }}
                                />

                                {pageMappings.map((mapping) => (
                                  <PdfFieldOverlay
                                    key={mapping.id}
                                    field={mapping}
                                    metrics={metrics as PageMetrics}
                                    isSelected={selectedMappingId === mapping.id}
                                    isUpdating={
                                      updatingMappingId === mapping.id
                                    }
                                    onSelect={selectMappingFromOverlay}
                                    onDragStop={(overlayMapping, x, y) =>
                                      handleOverlayDragStop(
                                        overlayMapping,
                                        metrics as PageMetrics,
                                        x,
                                        y,
                                      )
                                    }
                                    onResizeStop={(
                                      overlayMapping,
                                      x,
                                      y,
                                      width,
                                      height,
                                    ) =>
                                      handleOverlayResizeStop(
                                        overlayMapping,
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
              </div>
            )}
          </div>
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col border-l bg-card">
          <PdfFieldInventoryPanel
            inventory={inventory}
            applyResult={inventoryApplyResult}
            isExtracting={isExtractingInventory}
            isApplying={isApplyingInventory}
            error={inventoryError}
            onExtract={() => void handleExtractInventory()}
            onApply={() => void handleApplyInventory()}
          />
          <div className="shrink-0 border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Template placements</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {mappings.length} active placement
              {mappings.length === 1 ? "" : "s"} on this form.
            </p>
          </div>
          <div
            ref={inventoryListRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          >
            {deleteError && (
              <p className="mb-3 text-sm text-destructive">{deleteError}</p>
            )}

            {mappings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No fields placed yet. Click the PDF to add template placement.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {mappings.map((mapping) => {
                  const details = templatePlacementSidebarDetails(mapping);
                  const isSelected = selectedMappingId === mapping.id;

                  return (
                    <div
                      key={mapping.id}
                      ref={(element) => {
                        inventoryItemRefs.current[mapping.id] = element;
                      }}
                      className={cn(
                        "flex flex-col gap-2 p-3 text-sm transition-colors",
                        isSelected &&
                          "bg-amber-50 ring-2 ring-inset ring-amber-400 dark:bg-amber-950/30",
                      )}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        className="flex cursor-pointer flex-col gap-2 text-left"
                        onClick={() => selectMappingFromInventory(mapping)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            selectMappingFromInventory(mapping);
                          }
                        }}
                      >
                        <div className="font-medium">
                          {formatMappingOverlayLabel(mapping)}
                        </div>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <dt>Field key</dt>
                          <dd className="font-mono">{details.field_key}</dd>
                          <dt>Label</dt>
                          <dd>{details.field_label}</dd>
                          <dt>Page</dt>
                          {isSelected ? (
                            <dd className="col-span-1">
                              <div
                                className="space-y-2"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    disabled={
                                      updatingMappingId === mapping.id ||
                                      mapping.page_number <= 1 ||
                                      numPages < 1
                                    }
                                    aria-label="Move to previous page"
                                    onClick={() =>
                                      void moveMappingToPage(
                                        mapping,
                                        mapping.page_number - 1,
                                      )
                                    }
                                  >
                                    <ChevronLeft className="h-4 w-4" />
                                  </Button>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={numPages || 1}
                                    key={`${mapping.id}-${mapping.page_number}`}
                                    defaultValue={mapping.page_number}
                                    disabled={
                                      updatingMappingId === mapping.id ||
                                      numPages < 1
                                    }
                                    className="h-8 w-16 px-2 text-center tabular-nums"
                                    aria-label="Page number"
                                    onBlur={(event) => {
                                      const nextPage = Number(
                                        event.target.value,
                                      );
                                      if (
                                        Number.isInteger(nextPage) &&
                                        nextPage !== mapping.page_number
                                      ) {
                                        void moveMappingToPage(mapping, nextPage);
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.currentTarget.blur();
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    disabled={
                                      updatingMappingId === mapping.id ||
                                      mapping.page_number >= numPages ||
                                      numPages < 1
                                    }
                                    aria-label="Move to next page"
                                    onClick={() =>
                                      void moveMappingToPage(
                                        mapping,
                                        mapping.page_number + 1,
                                      )
                                    }
                                  >
                                    <ChevronRight className="h-4 w-4" />
                                  </Button>
                                </div>
                                {numPages > 0 && (
                                  <p className="text-[11px] text-muted-foreground">
                                    of {numPages} page
                                    {numPages === 1 ? "" : "s"}
                                  </p>
                                )}
                              </div>
                            </dd>
                          ) : (
                            <dd>{details.page_number}</dd>
                          )}
                          <dt>Mapping name</dt>
                          <dd>{details.mapping_name ?? "—"}</dd>
                          <dt>Occurrence</dt>
                          <dd>{details.occurrence_index ?? 0}</dd>
                        </dl>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(mapping)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isDeletingId === mapping.id}
                          onClick={() => void handleDeleteMapping(mapping)}
                        >
                          {isDeletingId === mapping.id
                            ? "Removing..."
                            : "Remove from this form"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      <PdfFieldPlacementDialog
        open={pendingPlacement != null}
        placement={pendingPlacement}
        value={placementValue}
        onChange={setPlacementValue}
        onSubmit={() => void handleSavePlacement()}
        onCancel={closePlacementDialog}
        isSubmitting={isSaving}
        error={saveError}
        catalogFields={catalogFields}
        pageWidth={placementMetrics?.originalWidth ?? null}
        pageHeight={placementMetrics?.originalHeight ?? null}
      />

      <PdfFieldEditDialog
        open={editingMapping != null}
        mapping={editingMapping}
        placementValue={editValue}
        fieldValue={editFieldValue}
        onPlacementChange={setEditValue}
        onFieldChange={setEditFieldValue}
        onSubmit={() => void handleSaveEdit()}
        onDelete={() => void handleDeleteFromDialog()}
        onCancel={closeEditDialog}
        isSubmitting={isEditing}
        isDeleting={isDeleting}
        error={editError}
      />
    </div>
  );
}
