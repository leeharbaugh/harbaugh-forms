"use client";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import {
  PacketFormFieldOverlay,
  type PacketFormOverlayField,
} from "@/components/packets/packet-form-field-overlay";
import { PacketFormFieldsSidebar } from "@/components/packets/packet-form-fields-sidebar";
import { Button } from "@/components/ui/button";
import {
  loadPacketFormEditorData,
  refreshPacketFormFieldValues,
  resetFieldInstanceMappingPlacement,
  revertPacketFormFieldValue,
  saveFieldInstanceValue,
  saveFieldInstanceValues,
  upsertFieldInstanceMappingPlacement,
} from "@/lib/packet-form-editor";
import type { FieldResolutionDiagnostic } from "@/lib/field-resolver";
import {
  PDF_EDITOR_SIDEBAR_WIDTH,
  PDF_MIN_PAGE_WIDTH,
  type PdfWorkspaceScrollSnapshot,
  type PdfZoomMode,
  afterLayoutSettled,
  capturePdfWorkspaceScroll,
  computePdfPageWidth,
  displayZoomPercent,
  restorePdfWorkspaceScrollWhenReady,
  scrollElementIntoContainer,
  stepZoomPercent,
} from "@/lib/pdf-editor-zoom";
import { downloadFilledPacketFormPdf } from "@/lib/packet-form-download";
import { sortGroupedPdfFields } from "@/lib/pdf-field-sort";
import { createClient } from "@/lib/supabase/client";
import { formatFormReference } from "@/lib/types/form";
import type { FieldInstanceWithField } from "@/lib/types/field-instance";
import {
  applyDraftValuesToFieldViews,
  buildDraftValuesFromFieldViews,
  getDirtyFieldInstanceIds,
  getPacketFormFieldSelectionKey,
  packetFormFieldViewToOverlayField,
  resolveCheckboxCheckedState,
  type PacketFormFieldView,
} from "@/lib/types/packet-form-editor";
import {
  type PageMetrics,
  pdfToRenderRect,
  renderRectToPdfPlacementForField,
} from "@/lib/types/template-pdf-field";
import { cn } from "@/lib/utils";
import { usePdfEditorSession } from "@/lib/use-pdf-editor-session";
import { Minus, Plus, Download, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [packetFormRecordId, setPacketFormRecordId] = useState(packetFormId);
  const [documentName, setDocumentName] = useState("");
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [formId, setFormId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState<PacketFormFieldView[]>([]);
  const [draftValuesByInstanceId, setDraftValuesByInstanceId] = useState<
    Record<string, string>
  >({});
  const [savedValuesByInstanceId, setSavedValuesByInstanceId] = useState<
    Record<string, string>
  >({});
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageMetrics, setPageMetrics] = useState<
    Record<number, PartialPageMetrics>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [isResettingPlacementId, setIsResettingPlacementId] = useState<
    string | null
  >(null);
  const [isRevertingInstanceId, setIsRevertingInstanceId] = useState<
    string | null
  >(null);
  const [isRefreshingValues, setIsRefreshingValues] = useState(false);
  const [updatingMappingId, setUpdatingMappingId] = useState<string | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [updateLayoutError, setUpdateLayoutError] = useState<string | null>(
    null,
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [hasPacketProperty, setHasPacketProperty] = useState(false);
  const [fieldResolutionDiagnostics, setFieldResolutionDiagnostics] = useState<
    FieldResolutionDiagnostic[] | null
  >(null);
  const [showResolutionDiagnostics, setShowResolutionDiagnostics] =
    useState(false);
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(
    null,
  );
  const [editingSelectionKey, setEditingSelectionKey] = useState<string | null>(
    null,
  );
  const [inlineEditValue, setInlineEditValue] = useState("");
  const [isSavingInlineValueId, setIsSavingInlineValueId] = useState<
    string | null
  >(null);
  const pdfWorkspaceRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const sidebarListRef = useRef<HTMLDivElement>(null);
  const sidebarFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScrollRestoreRef = useRef<PdfWorkspaceScrollSnapshot | null>(
    null,
  );
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
      const request = beginLoadRequest();

      if (showFullScreenLoading) {
        setIsLoading(true);
        prepareFullScreenLoad();
        setPdfUrl(null);
        setNumPages(0);
        setPageMetrics({});
        setBasePageWidth(null);
        setBasePageHeight(null);
      }
      setLoadError(null);

      const supabase = createClient();

      try {
        const data = await loadPacketFormEditorData(supabase, packetFormId);

        if (!request.isCurrent()) {
          return;
        }

        if (data.packetForm.packet_id !== packetId) {
          throw new Error("Packet form does not belong to this packet.");
        }

        setDocumentName(data.packetForm.document_name);
        setStoragePath(data.packetForm.storage_path);
        setPacketFormRecordId(data.packetForm.id);
        setFormId(data.packetForm.form_id);
        setFormName(data.packetForm.forms?.form_name ?? "");
        setFields(data.fields);
        const valueState = buildDraftValuesFromFieldViews(data.fields);
        setDraftValuesByInstanceId(valueState);
        setSavedValuesByInstanceId(valueState);
        if (showFullScreenLoading) {
          setPdfUrl(data.pdfUrl);
        }
        setPropertyId(data.propertyId);
        setHasPacketProperty(data.hasPacketProperty);
        setFieldResolutionDiagnostics(data.fieldResolutionDiagnostics);
      } catch (error) {
        if (!request.isCurrent()) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : "Failed to load packet form editor.",
        );
        setFields([]);
        setPdfUrl(null);
        setPropertyId(null);
        setHasPacketProperty(false);
        setFieldResolutionDiagnostics(null);
      } finally {
        if (request.isCurrent() && showFullScreenLoading) {
          setIsLoading(false);
        }
      }
    },
    [packetFormId, packetId, beginLoadRequest, prepareFullScreenLoad],
  );

  const fieldsWithDraftValues = useMemo(
    () => applyDraftValuesToFieldViews(fields, draftValuesByInstanceId),
    [fields, draftValuesByInstanceId],
  );

  const captureWorkspaceScroll = useCallback((): PdfWorkspaceScrollSnapshot => {
    return capturePdfWorkspaceScroll({
      workspace: pdfWorkspaceRef.current,
      pageRefs: pageRefs.current,
      selectedMappingId: selectedFieldKey,
      mappings: fieldsWithDraftValues.map((fieldView) => ({
        id: getPacketFormFieldSelectionKey(fieldView),
        page_number: fieldView.placement.page_number,
      })),
    });
  }, [selectedFieldKey, fieldsWithDraftValues]);

  const queueWorkspaceScrollRestore = useCallback(
    (snapshot?: PdfWorkspaceScrollSnapshot) => {
      pendingScrollRestoreRef.current = snapshot ?? captureWorkspaceScroll();
    },
    [captureWorkspaceScroll],
  );

  const applyPendingWorkspaceScrollRestore = useCallback(() => {
    const snapshot = pendingScrollRestoreRef.current;
    if (!snapshot) {
      return;
    }

    pendingScrollRestoreRef.current = null;
    restorePdfWorkspaceScrollWhenReady({
      snapshot,
      workspace: pdfWorkspaceRef.current,
      pageRefs: pageRefs.current,
      inventoryList: sidebarListRef.current,
      inventoryItemRefs: sidebarFieldRefs.current,
      isReady: () => isPdfRenderReady && numPages > 0,
    });
  }, [isPdfRenderReady, numPages]);

  const refreshEditorFields = useCallback(
    async (options?: { preserveScroll?: boolean }) => {
      if (options?.preserveScroll) {
        queueWorkspaceScrollRestore();
      }

      const supabase = createClient();
      const data = await loadPacketFormEditorData(supabase, packetFormId);

      if (data.packetForm.packet_id !== packetId) {
        throw new Error("Packet form does not belong to this packet.");
      }

      setFields(data.fields);
      const valueState = buildDraftValuesFromFieldViews(data.fields);
      setDraftValuesByInstanceId(valueState);
      setSavedValuesByInstanceId(valueState);
      setPropertyId(data.propertyId);
      setHasPacketProperty(data.hasPacketProperty);
      setFieldResolutionDiagnostics(data.fieldResolutionDiagnostics);
    },
    [packetFormId, packetId, queueWorkspaceScrollRestore],
  );

  useEffect(() => {
    if (!pendingScrollRestoreRef.current) {
      return;
    }

    applyPendingWorkspaceScrollRestore();
  }, [
    fields,
    isPdfRenderReady,
    numPages,
    applyPendingWorkspaceScrollRestore,
  ]);

  useEffect(() => {
    void loadData({ showFullScreenLoading: true });
  }, [loadData]);

  const fieldsByPage = useMemo(() => {
    const grouped: Record<number, PacketFormOverlayField[]> = {};

    for (const fieldView of fieldsWithDraftValues) {
      const overlayField = packetFormFieldViewToOverlayField(fieldView);
      if (!grouped[overlayField.page_number]) {
        grouped[overlayField.page_number] = [];
      }
      grouped[overlayField.page_number].push(overlayField);
    }

    return sortGroupedPdfFields(grouped, (overlayField) => ({
      page_number: overlayField.page_number,
      y: overlayField.y_position,
      x: overlayField.x_position,
      occurrence_index: overlayField.occurrence_index,
      labelOrKey:
        overlayField.field_label?.trim() ||
        overlayField.field_key?.trim() ||
        overlayField.id,
    }));
  }, [fieldsWithDraftValues]);

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
    fieldsWithDraftValues.find(
      (fieldView) => fieldView.mapping.id === mappingId,
    ) ?? null;

  const handleDraftChange = (instanceId: string, value: string) => {
    setDraftValuesByInstanceId((current) => ({
      ...current,
      [instanceId]: value,
    }));
    setSaveError(null);
  };

  const applySavedFieldInstanceValue = useCallback(
    (instanceId: string, value: string) => {
      setSavedValuesByInstanceId((current) => ({
        ...current,
        [instanceId]: value,
      }));

      setFields((current) =>
        current.map((fieldView) =>
          fieldView.instance.id === instanceId
            ? {
                ...fieldView,
                displayValue: value,
                instance: {
                  ...fieldView.instance,
                  value,
                  is_override: true,
                  source: "manual_override",
                },
              }
            : fieldView,
        ),
      );
    },
    [],
  );

  const persistInlineFieldValue = useCallback(
    async (overlayField: PacketFormOverlayField, value: string) => {
      const instanceId = overlayField.field_instance_id;
      const savedValue = savedValuesByInstanceId[instanceId] ?? "";

      handleDraftChange(instanceId, value);

      if (value === savedValue) {
        return;
      }

      setIsSavingInlineValueId(instanceId);
      setSaveError(null);

      const supabase = createClient();

      try {
        await saveFieldInstanceValue(supabase, instanceId, value);
        applySavedFieldInstanceValue(instanceId, value);
      } catch (error) {
        handleDraftChange(instanceId, savedValue);
        setSaveError(
          error instanceof Error
            ? error.message
            : "Failed to save field value.",
        );
      } finally {
        setIsSavingInlineValueId(null);
      }
    },
    [applySavedFieldInstanceValue, savedValuesByInstanceId],
  );

  const commitInlineEdit = useCallback(
    async (overlayField: PacketFormOverlayField) => {
      const value =
        draftValuesByInstanceId[overlayField.field_instance_id] ??
        inlineEditValue;

      setEditingSelectionKey(null);
      setInlineEditValue("");
      await persistInlineFieldValue(overlayField, value);
    },
    [draftValuesByInstanceId, inlineEditValue, persistInlineFieldValue],
  );

  const cancelInlineEdit = useCallback(
    (overlayField: PacketFormOverlayField) => {
      const instanceId = overlayField.field_instance_id;
      const savedValue = savedValuesByInstanceId[instanceId] ?? "";

      handleDraftChange(instanceId, savedValue);
      setEditingSelectionKey(null);
      setInlineEditValue("");
    },
    [savedValuesByInstanceId],
  );

  const finishInlineEditForSelectionKey = useCallback(
    async (nextSelectionKey: string | null) => {
      if (!editingSelectionKey || editingSelectionKey === nextSelectionKey) {
        return;
      }

      const editingFieldView = fieldsWithDraftValues.find(
        (fieldView) =>
          getPacketFormFieldSelectionKey(fieldView) === editingSelectionKey,
      );

      if (!editingFieldView) {
        setEditingSelectionKey(null);
        setInlineEditValue("");
        return;
      }

      await commitInlineEdit(
        packetFormFieldViewToOverlayField(editingFieldView),
      );
    },
    [commitInlineEdit, editingSelectionKey, fieldsWithDraftValues],
  );

  const handleStartInlineEdit = useCallback(
    (overlayField: PacketFormOverlayField) => {
      void finishInlineEditForSelectionKey(overlayField.selectionKey);

      const currentValue =
        draftValuesByInstanceId[overlayField.field_instance_id] ??
        overlayField.displayValue;

      setEditingSelectionKey(overlayField.selectionKey);
      setInlineEditValue(currentValue);
    },
    [draftValuesByInstanceId, finishInlineEditForSelectionKey],
  );

  const handleInlineEditChange = useCallback(
    (overlayField: PacketFormOverlayField, value: string) => {
      setInlineEditValue(value);
      handleDraftChange(overlayField.field_instance_id, value);
    },
    [],
  );

  const handleInlineEditSave = useCallback(
    async (overlayField: PacketFormOverlayField) => {
      if (editingSelectionKey !== overlayField.selectionKey) {
        return;
      }

      await commitInlineEdit(overlayField);
    },
    [commitInlineEdit, editingSelectionKey],
  );

  const handleInlineEditCancel = useCallback(
    (overlayField: PacketFormOverlayField) => {
      if (editingSelectionKey !== overlayField.selectionKey) {
        return;
      }

      cancelInlineEdit(overlayField);
    },
    [cancelInlineEdit, editingSelectionKey],
  );

  const handleCheckboxToggle = useCallback(
    async (overlayField: PacketFormOverlayField) => {
      const currentChecked = resolveCheckboxCheckedState(
        draftValuesByInstanceId[overlayField.field_instance_id] ??
          overlayField.displayValue,
        overlayField.default_checked,
      );
      const nextValue = currentChecked ? "false" : "true";

      await persistInlineFieldValue(overlayField, nextValue);
    },
    [draftValuesByInstanceId, persistInlineFieldValue],
  );

  const applyRevertedInstance = (updated: FieldInstanceWithField) => {
    const revertedValue = updated.value ?? "";
    const instanceId = updated.id;

    setDraftValuesByInstanceId((current) => ({
      ...current,
      [instanceId]: revertedValue,
    }));
    setSavedValuesByInstanceId((current) => ({
      ...current,
      [instanceId]: revertedValue,
    }));
    setFields((current) =>
      current.map((fieldView) =>
        fieldView.instance.id === instanceId
          ? {
              ...fieldView,
              displayValue: revertedValue,
              instance: {
                ...fieldView.instance,
                ...updated,
                fields: updated.fields ?? fieldView.instance.fields,
              },
            }
          : fieldView,
      ),
    );
  };

  const scrollSidebarFieldIntoView = useCallback((selectionKey: string) => {
    const sidebarRow = sidebarFieldRefs.current[selectionKey];
    if (!sidebarRow) {
      return;
    }

    sidebarRow.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, []);

  const scrollPdfPageIntoView = useCallback((pageNumber: number) => {
    const workspace = pdfWorkspaceRef.current;
    const pageElement = pageRefs.current[pageNumber];
    if (!workspace || !pageElement) {
      return;
    }

    scrollElementIntoContainer(workspace, pageElement, 16);
  }, []);

  const selectFieldFromSidebar = useCallback(
    (fieldView: PacketFormFieldView) => {
      const selectionKey = getPacketFormFieldSelectionKey(fieldView);
      void finishInlineEditForSelectionKey(selectionKey);
      setSelectedFieldKey(selectionKey);
      afterLayoutSettled(() => {
        scrollPdfPageIntoView(fieldView.placement.page_number);
      });
    },
    [finishInlineEditForSelectionKey, scrollPdfPageIntoView],
  );

  const selectFieldFromOverlay = useCallback(
    (overlayField: PacketFormOverlayField) => {
      const selectionKey = overlayField.selectionKey;

      if (process.env.NODE_ENV === "development") {
        console.log("[PacketFormEditor] PDF overlay click", {
          selectionKey,
          sidebarRefExists: Boolean(sidebarFieldRefs.current[selectionKey]),
          fieldKey: overlayField.field_key || null,
          fieldLabel: overlayField.field_label || null,
        });
      }

      void finishInlineEditForSelectionKey(selectionKey);
      setSelectedFieldKey(selectionKey);
      afterLayoutSettled(() => {
        scrollSidebarFieldIntoView(selectionKey);
      });
    },
    [finishInlineEditForSelectionKey, scrollSidebarFieldIntoView],
  );

  const handleDownloadPdf = async () => {
    if (!storagePath || formId == null) {
      setDownloadError("No PDF is available to download for this form.");
      return;
    }

    setIsDownloadingPdf(true);
    setDownloadError(null);

    try {
      const supabase = createClient();
      await downloadFilledPacketFormPdf(
        supabase,
        {
          id: packetFormRecordId,
          packet_id: packetId,
          form_id: formId,
          document_name: documentName,
          storage_path: storagePath,
        },
        { fields: fieldsWithDraftValues },
      );
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Failed to download PDF.",
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleSaveChanges = async () => {
    const dirtyInstanceIds = getDirtyFieldInstanceIds(
      draftValuesByInstanceId,
      savedValuesByInstanceId,
    );

    if (dirtyInstanceIds.length === 0) {
      return;
    }

    setIsSavingChanges(true);
    setSaveError(null);

    const supabase = createClient();

    try {
      await saveFieldInstanceValues(
        supabase,
        dirtyInstanceIds.map((instanceId) => ({
          fieldInstanceId: instanceId,
          value: draftValuesByInstanceId[instanceId] ?? "",
        })),
      );

      setSavedValuesByInstanceId((current) => {
        const next = { ...current };
        for (const instanceId of dirtyInstanceIds) {
          next[instanceId] = draftValuesByInstanceId[instanceId] ?? "";
        }
        return next;
      });

      setFields((current) =>
        current.map((fieldView) => {
          if (!dirtyInstanceIds.includes(fieldView.instance.id)) {
            return fieldView;
          }

          const savedValue = draftValuesByInstanceId[fieldView.instance.id] ?? "";
          return {
            ...fieldView,
            displayValue: savedValue,
            instance: {
              ...fieldView.instance,
              value: savedValue,
              is_override: true,
            },
          };
        }),
      );
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Failed to save field values.",
      );
    } finally {
      setIsSavingChanges(false);
    }
  };

  const handleResetPlacement = async (fieldView: PacketFormFieldView) => {
    if (!fieldView.hasPlacementOverride) {
      return;
    }

    setIsResettingPlacementId(fieldView.mapping.id);
    setSaveError(null);

    const supabase = createClient();

    try {
      await resetFieldInstanceMappingPlacement(
        supabase,
        packetFormId,
        fieldView.mapping.id,
      );
      const preservedSelectionKey = getPacketFormFieldSelectionKey(fieldView);
      await refreshEditorFields({ preserveScroll: true });
      setSelectedFieldKey(preservedSelectionKey);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Failed to reset placement override.",
      );
    } finally {
      setIsResettingPlacementId(null);
    }
  };

  const handleRevertToDefault = async (fieldView: PacketFormFieldView) => {
    const instanceId = fieldView.instance.id;

    setIsRevertingInstanceId(instanceId);
    setSaveError(null);

    const supabase = createClient();

    try {
      const updated = await revertPacketFormFieldValue(supabase, {
        packetId,
        packetFormId,
        fieldInstanceId: instanceId,
      });
      applyRevertedInstance(updated);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Failed to revert field value.",
      );
    } finally {
      setIsRevertingInstanceId(null);
    }
  };

  const handleRefreshValues = async () => {
    setIsRefreshingValues(true);
    setRefreshError(null);

    const supabase = createClient();

    try {
      await refreshPacketFormFieldValues(supabase, packetFormId);
      const preservedSelectionKey = selectedFieldKey;
      await refreshEditorFields({ preserveScroll: true });
      if (preservedSelectionKey) {
        setSelectedFieldKey(preservedSelectionKey);
      }
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : "Failed to refresh field values.",
      );
    } finally {
      setIsRefreshingValues(false);
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
        fieldId: fieldView.mapping.field_id ?? fieldView.instance.field_id,
        fieldInstanceId: fieldView.instance.id,
        formFieldMappingId: fieldView.mapping.id,
        placement,
      });
    } catch (error) {
      setUpdateLayoutError(
        error instanceof Error
          ? error.message
          : "Failed to save placement override.",
      );
      await refreshEditorFields({ preserveScroll: true });
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
    const placement = renderRectToPdfPlacementForField(
      overlayField,
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

    const placement = renderRectToPdfPlacementForField(
      overlayField,
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

  const isDevelopment = process.env.NODE_ENV === "development";
  const propertyResolutionWarning =
    propertyId == null
      ? "This packet has no property selected, so property fields cannot be resolved."
      : !hasPacketProperty
        ? "This packet has a property ID but the property record could not be loaded."
        : null;

  if (isLoading) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Loading packet form editor...
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" asChild>
          <Link href={`/packets/${packetId}`}>Back to packet</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b bg-background px-4 py-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {documentName}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {formName}
            {formId != null ? ` (${formatFormReference(formId)})` : ""} · fill
            form · packet only
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleDownloadPdf()}
            disabled={!pdfUrl || isDownloadingPdf || formId == null}
          >
            <Download
              className={cn("mr-1.5 h-4 w-4", isDownloadingPdf && "animate-pulse")}
            />
            {isDownloadingPdf ? "Preparing..." : "Download PDF"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/packets/${packetId}`}>Back to packet</Link>
          </Button>
          {formId != null && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/forms/${formId}/editor`}>Edit template</Link>
            </Button>
          )}
        </div>
      </div>

      {downloadError && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {downloadError}
        </div>
      )}

      {propertyResolutionWarning && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          {propertyResolutionWarning}
        </div>
      )}

      {isDevelopment && fieldResolutionDiagnostics && (
        <div className="border-b bg-muted/20 px-4 py-2">
          <button
            type="button"
            className="text-left text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowResolutionDiagnostics((current) => !current)}
          >
            {showResolutionDiagnostics ? "Hide" : "Show"} field resolution
            diagnostics ({fieldResolutionDiagnostics.length})
          </button>
          {showResolutionDiagnostics && (
            <div className="mt-2 max-h-64 overflow-auto rounded-md border bg-background">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="px-2 py-1 font-medium">field_key</th>
                    <th className="px-2 py-1 font-medium">source_type</th>
                    <th className="px-2 py-1 font-medium">source_path</th>
                    <th className="px-2 py-1 font-medium">resolved value</th>
                    <th className="px-2 py-1 font-medium">resolver source</th>
                    <th className="px-2 py-1 font-medium">packet.property</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldResolutionDiagnostics.map((row) => (
                    <tr key={row.field_key} className="border-t align-top">
                      <td className="px-2 py-1 font-mono">{row.field_key}</td>
                      <td className="px-2 py-1">{row.source_type ?? "—"}</td>
                      <td className="px-2 py-1">{row.source_path ?? "—"}</td>
                      <td className="px-2 py-1">
                        {row.resolved_value.trim() || "—"}
                      </td>
                      <td className="px-2 py-1">{row.resolver_source}</td>
                      <td className="px-2 py-1">
                        {row.packet_property_exists ? "yes" : "no"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRefreshValues()}
              disabled={isRefreshingValues}
            >
              <RefreshCw
                className={cn(
                  "mr-1.5 h-4 w-4",
                  isRefreshingValues && "animate-spin",
                )}
              />
              {isRefreshingValues ? "Refreshing..." : "Refresh values"}
            </Button>
            <p className="hidden text-xs text-muted-foreground lg:block">
              Edit values in the sidebar. Click overlays to select fields. Drag
              or resize to override placement for this packet form.
            </p>
          </div>

          <div
            ref={pdfWorkspaceRef}
            className="isolate min-h-0 flex-1 overflow-auto bg-muted/50"
          >
            {updateLayoutError && (
              <p className="p-4 text-sm text-destructive">{updateLayoutError}</p>
            )}
            {refreshError && (
              <p className="p-4 text-sm text-destructive">{refreshError}</p>
            )}
            {!pdfUrl ? (
              <p className="p-4 text-sm text-muted-foreground">
                {isLoading
                  ? "Loading PDF..."
                  : "No PDF is available for this packet form yet."}
              </p>
            ) : !isPdfRenderReady ? (
              <p className="p-4 text-sm text-muted-foreground">Loading PDF...</p>
            ) : (
              <div className="flex min-h-full flex-col items-center gap-8 p-6">
                <Document
                  key={`${documentKey}-${pdfUrl}`}
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
                    const pageFields = fieldsByPage[pageNumber] ?? [];
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
                                {pageFields.map((overlayField) => (
                                  <PacketFormFieldOverlay
                                    key={overlayField.id}
                                    field={overlayField}
                                    metrics={metrics as PageMetrics}
                                    isSelected={
                                      selectedFieldKey ===
                                      overlayField.selectionKey
                                    }
                                    isUpdating={
                                      updatingMappingId === overlayField.id
                                    }
                                    isInlineEditing={
                                      editingSelectionKey ===
                                      overlayField.selectionKey
                                    }
                                    inlineEditValue={inlineEditValue}
                                    isSavingValue={
                                      isSavingInlineValueId ===
                                      overlayField.field_instance_id
                                    }
                                    onSelect={selectFieldFromOverlay}
                                    onStartInlineEdit={handleStartInlineEdit}
                                    onInlineEditChange={handleInlineEditChange}
                                    onInlineEditSave={(field) =>
                                      void handleInlineEditSave(field)
                                    }
                                    onInlineEditCancel={handleInlineEditCancel}
                                    onCheckboxToggle={(field) =>
                                      void handleCheckboxToggle(field)
                                    }
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
              </div>
            )}
          </div>
        </div>

        <PacketFormFieldsSidebar
          fields={fields}
          draftValuesByInstanceId={draftValuesByInstanceId}
          savedValuesByInstanceId={savedValuesByInstanceId}
          selectedFieldKey={selectedFieldKey}
          isSaving={isSavingChanges}
          isResettingPlacementId={isResettingPlacementId}
          isRevertingInstanceId={isRevertingInstanceId}
          saveError={saveError}
          onDraftChange={handleDraftChange}
          onSelectField={selectFieldFromSidebar}
          listRef={sidebarListRef}
          onSaveChanges={() => void handleSaveChanges()}
          onResetPlacement={(fieldView) => void handleResetPlacement(fieldView)}
          onRevertToDefault={(fieldView) => void handleRevertToDefault(fieldView)}
          fieldRefs={sidebarFieldRefs}
        />
      </div>
    </div>
  );
}
