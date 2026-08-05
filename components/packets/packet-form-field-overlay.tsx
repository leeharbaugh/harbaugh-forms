"use client";

import {
  type PageMetrics,
  isCheckboxPdfField,
  pdfToRenderRect,
} from "@/lib/types/template-pdf-field";
import { CHECKBOX_VISUAL_SIZE_PX } from "@/lib/checkbox-constants";
import {
  formatPacketFieldOverlayValue,
  isPacketFieldValueEmpty,
  resolveCheckboxCheckedState,
  type PacketFieldEditorControl,
} from "@/lib/types/packet-form-editor";
import {
  PDF_TEXT_LINE_HEIGHT_RATIO,
  PDF_TEXT_PADDING_X,
  PDF_TEXT_PADDING_Y,
  approximateHelveticaWidth,
  layoutTextInBox,
  resolveFieldFontSize,
} from "@/lib/pdf-text-layout";
import { toDateInputValue } from "@/components/packets/packet-form-field-value-input";
import { formatAmountInput } from "@/lib/amount-format";
import { formatPhoneInput } from "@/lib/phone-format";
import { AppCheckboxVisual } from "@/components/ui/app-checkbox";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";

export type PacketFormOverlayField = {
  id: string;
  selectionKey: string;
  field_instance_id: string;
  field_id: string;
  field_key: string;
  field_label: string | null;
  field_type: import("@/lib/types/template-pdf-field").TemplatePdfFieldType;
  page_number: number;
  x_position: number;
  y_position: number;
  width: number | null;
  height: number | null;
  page_width: number | null;
  page_height: number | null;
  font_size: number;
  is_multiline: boolean;
  mask_background: boolean;
  is_required: boolean;
  hasPlacementOverride: boolean;
  displayValue: string;
  default_checked: boolean;
  editorControl: PacketFieldEditorControl;
  occurrence_index: number | null;
};

type PacketFormFieldOverlayProps = {
  field: PacketFormOverlayField;
  metrics: PageMetrics;
  isSelected: boolean;
  isUpdating: boolean;
  isInlineEditing: boolean;
  inlineEditValue: string;
  isSavingValue: boolean;
  onSelect: (field: PacketFormOverlayField) => void;
  onStartInlineEdit: (field: PacketFormOverlayField) => void;
  onInlineEditChange: (field: PacketFormOverlayField, value: string) => void;
  onInlineEditSave: (field: PacketFormOverlayField) => void;
  onInlineEditCancel: (field: PacketFormOverlayField) => void;
  onCheckboxToggle: (field: PacketFormOverlayField) => void;
  onDragStop: (field: PacketFormOverlayField, x: number, y: number) => void;
  onResizeStop: (
    field: PacketFormOverlayField,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
};

const MIN_OVERLAY_SIZE = 12;
const CLICK_SUPPRESS_MS = 150;
const DRAG_MOVE_THRESHOLD_PX = 3;

type InteractionState = {
  mode: "drag" | "resize";
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

function isInlineEditableField(field: PacketFormOverlayField): boolean {
  if (field.field_type === "SIGNATURE_PLACEHOLDER") {
    return false;
  }

  if (field.field_type === "INITIAL_PLACEHOLDER") {
    return false;
  }

  return field.editorControl !== "checkbox";
}

function overlayFontSizePx(
  field: PacketFormOverlayField,
  metrics: PageMetrics,
  rectHeight: number,
  displayText: string,
): number {
  const originalHeight = field.page_height ?? metrics.originalHeight;
  const scale =
    originalHeight > 0 ? metrics.renderedHeight / originalHeight : 1;
  const boxHeightPdf =
    field.height != null && field.height > 0
      ? field.height
      : rectHeight / Math.max(scale, 0.001);

  const basePdf = resolveFieldFontSize({
    configuredFontSize: field.font_size,
    boxHeightPdf,
    isMultiline: field.is_multiline,
    scale: 1,
  });

  if (!field.is_multiline || !displayText.trim()) {
    return basePdf * scale;
  }

  const widthPdf =
    field.width != null && field.width > 0
      ? field.width
      : metrics.renderedWidth / Math.max(scale, 0.001);

  const layout = layoutTextInBox({
    text: displayText,
    boxWidth: widthPdf,
    boxHeight: boxHeightPdf,
    fontSize: basePdf,
    isMultiline: true,
    measureWidth: (text) => approximateHelveticaWidth(text, basePdf),
  });

  return layout.fontSize * scale;
}

export function PacketFormFieldOverlay({
  field,
  metrics,
  isSelected,
  isUpdating,
  isInlineEditing,
  inlineEditValue,
  isSavingValue,
  onSelect,
  onStartInlineEdit,
  onInlineEditChange,
  onInlineEditSave,
  onInlineEditCancel,
  onCheckboxToggle,
  onDragStop,
  onResizeStop,
}: PacketFormFieldOverlayProps) {
  const suppressClickRef = useRef(false);
  const cancelInlineEditRef = useRef(false);
  const inlineInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const rect = pdfToRenderRect(field, metrics);
  const isCheckbox = isCheckboxPdfField(field);
  const isSignature = field.field_type === "SIGNATURE_PLACEHOLDER";
  const isInitial = field.field_type === "INITIAL_PLACEHOLDER";
  const isChecked = resolveCheckboxCheckedState(
    field.displayValue,
    field.default_checked,
  );
  const hasValue = !isPacketFieldValueEmpty(
    field.displayValue,
    field.field_type,
    field.default_checked,
  );
  const valueText =
    field.editorControl === "currency"
      ? formatAmountInput(field.displayValue)
      : formatPacketFieldOverlayValue(field.displayValue, field.field_type);
  const layoutText = isInlineEditing ? inlineEditValue : valueText;
  const originalHeight = field.page_height ?? metrics.originalHeight;
  const zoomScale =
    originalHeight > 0 ? metrics.renderedHeight / originalHeight : 1;
  const fontPx = overlayFontSizePx(field, metrics, rect.height, layoutText);
  const showPlaceholder = (isSelected || isHovered) && !hasValue;
  const placeholderText = isSignature
    ? "Signature"
    : isInitial
      ? "Initials"
      : isCheckbox
        ? ""
        : "Empty";
  const placementLocked = isUpdating || isInlineEditing || isSavingValue;
  const opaqueMask = field.mask_background === true;

  useEffect(() => {
    if (!isInlineEditing) {
      return;
    }

    inlineInputRef.current?.focus();
    if (inlineInputRef.current && "select" in inlineInputRef.current) {
      inlineInputRef.current.select();
    }
  }, [isInlineEditing]);

  const suppressClick = () => {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, CLICK_SUPPRESS_MS);
  };

  const handleSelect = () => {
    if (suppressClickRef.current || isUpdating || isSavingValue) {
      return;
    }

    onSelect(field);
  };

  const handleContentClick = () => {
    if (suppressClickRef.current || isUpdating || isSavingValue || isInlineEditing) {
      return;
    }

    if (isCheckbox) {
      onSelect(field);
      onCheckboxToggle(field);
      return;
    }

    if (!isInlineEditableField(field)) {
      handleSelect();
      return;
    }

    if (isSelected) {
      onStartInlineEdit(field);
      return;
    }

    handleSelect();
  };

  const handleDoubleClick = () => {
    if (
      suppressClickRef.current ||
      isUpdating ||
      isSavingValue ||
      isInlineEditing ||
      !isInlineEditableField(field)
    ) {
      return;
    }

    onSelect(field);
    onStartInlineEdit(field);
  };

  const handleInlineBlur = () => {
    if (cancelInlineEditRef.current) {
      cancelInlineEditRef.current = false;
      return;
    }

    onInlineEditSave(field);
  };

  const handleInlineKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    event.stopPropagation();

    if (event.key === "Enter" && !field.is_multiline) {
      event.preventDefault();
      onInlineEditSave(field);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEditRef.current = true;
      onInlineEditCancel(field);
    }
  };

  const clearInteraction = () => {
    interactionRef.current = null;
  };

  const overlayResizeEnabled = placementLocked
    ? false
    : isCheckbox
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
        };

  const inputType =
    field.editorControl === "date"
      ? "date"
      : field.editorControl === "phone"
        ? "tel"
        : "text";
  const inputMode =
    field.editorControl === "currency"
      ? "decimal"
      : field.editorControl === "number"
        ? "numeric"
        : field.editorControl === "phone"
          ? "tel"
          : undefined;
  const inputValue =
    field.editorControl === "date"
      ? toDateInputValue(inlineEditValue)
      : field.editorControl === "phone"
        ? formatPhoneInput(inlineEditValue)
        : field.editorControl === "currency"
          ? formatAmountInput(inlineEditValue)
          : inlineEditValue;

  const textStyle: React.CSSProperties = {
    fontSize: `${fontPx}px`,
    lineHeight: field.is_multiline ? PDF_TEXT_LINE_HEIGHT_RATIO : 1,
    paddingLeft: PDF_TEXT_PADDING_X * zoomScale,
    paddingRight: PDF_TEXT_PADDING_X * zoomScale,
    paddingTop: PDF_TEXT_PADDING_Y * zoomScale,
    paddingBottom: PDF_TEXT_PADDING_Y * zoomScale,
  };

  return (
    <Rnd
      bounds="parent"
      size={{ width: rect.width, height: rect.height }}
      position={{ x: rect.left, y: rect.top }}
      minWidth={isCheckbox ? CHECKBOX_VISUAL_SIZE_PX : MIN_OVERLAY_SIZE}
      minHeight={isCheckbox ? CHECKBOX_VISUAL_SIZE_PX : MIN_OVERLAY_SIZE}
      maxWidth={isCheckbox ? rect.width : undefined}
      maxHeight={isCheckbox ? rect.height : undefined}
      enableResizing={overlayResizeEnabled}
      disableDragging={placementLocked}
      onDragStart={(_event, data) => {
        interactionRef.current = {
          mode: "drag",
          startX: data.x,
          startY: data.y,
          startWidth: rect.width,
          startHeight: rect.height,
        };
      }}
      onResizeStart={() => {
        interactionRef.current = {
          mode: "resize",
          startX: rect.left,
          startY: rect.top,
          startWidth: rect.width,
          startHeight: rect.height,
        };
      }}
      onDragStop={(_event, data) => {
        const interaction = interactionRef.current;
        clearInteraction();

        if (interaction?.mode !== "drag") {
          return;
        }

        const moved =
          Math.abs(data.x - interaction.startX) > DRAG_MOVE_THRESHOLD_PX ||
          Math.abs(data.y - interaction.startY) > DRAG_MOVE_THRESHOLD_PX;

        if (moved) {
          suppressClick();
          onDragStop(field, data.x, data.y);
          return;
        }

        handleContentClick();
      }}
      onResizeStop={(_event, _direction, ref, _delta, position) => {
        const interaction = interactionRef.current;
        const width = ref.offsetWidth;
        const height = ref.offsetHeight;
        clearInteraction();

        if (interaction?.mode !== "resize") {
          return;
        }

        const resized =
          Math.abs(width - interaction.startWidth) > DRAG_MOVE_THRESHOLD_PX ||
          Math.abs(height - interaction.startHeight) > DRAG_MOVE_THRESHOLD_PX ||
          Math.abs(position.x - interaction.startX) > DRAG_MOVE_THRESHOLD_PX ||
          Math.abs(position.y - interaction.startY) > DRAG_MOVE_THRESHOLD_PX;

        if (resized) {
          suppressClick();
          onResizeStop(field, position.x, position.y, width, height);
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group z-[2] border shadow-sm backdrop-blur-[1px] transition-[box-shadow,background-color,border-color]",
        isCheckbox
          ? "border-border bg-transparent"
          : field.hasPlacementOverride
            ? "border-amber-600/80"
            : "border-sky-600/50",
        isSelected
          ? isCheckbox
            ? "border-amber-500 ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900"
            : "border-amber-500 bg-amber-300/40 shadow-md ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900"
          : isCheckbox
            ? "border-border hover:border-muted-foreground"
            : opaqueMask
              ? "bg-white dark:bg-zinc-950"
              : hasValue
                ? "bg-white/85 dark:bg-zinc-900/85"
                : "border-dashed bg-transparent opacity-70 hover:opacity-100",
        (isUpdating || isSavingValue) && "opacity-70",
        isInlineEditing &&
          (opaqueMask ? "z-[3] bg-white dark:bg-zinc-950" : "z-[3] bg-white dark:bg-zinc-900"),
      )}
      style={{
        boxSizing: "border-box",
      }}
    >
      {isInlineEditing ? (
        field.is_multiline ? (
          <textarea
            ref={inlineInputRef as React.RefObject<HTMLTextAreaElement>}
            value={inputValue}
            disabled={isSavingValue}
            onChange={(event) => onInlineEditChange(field, event.target.value)}
            onBlur={handleInlineBlur}
            onKeyDown={handleInlineKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className="h-full w-full resize-none border-0 bg-transparent text-left text-foreground outline-none ring-0 focus:ring-0"
            style={{
              ...textStyle,
              overflow: "hidden",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              alignItems: "flex-start",
            }}
            aria-label={field.field_label ?? field.field_key ?? "Field value"}
          />
        ) : (
          <input
            ref={inlineInputRef as React.RefObject<HTMLInputElement>}
            type={inputType}
            inputMode={inputMode}
            value={inputValue}
            disabled={isSavingValue}
            onChange={(event) =>
              onInlineEditChange(
                field,
                field.editorControl === "phone"
                  ? formatPhoneInput(event.target.value)
                  : field.editorControl === "currency"
                    ? formatAmountInput(event.target.value)
                    : event.target.value,
              )
            }
            onBlur={handleInlineBlur}
            onKeyDown={handleInlineKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className="h-full w-full border-0 bg-transparent text-left text-foreground outline-none ring-0 focus:ring-0"
            style={textStyle}
            aria-label={field.field_label ?? field.field_key ?? "Field value"}
          />
        )
      ) : (
        <button
          type="button"
          className={cn(
            "flex h-full w-full cursor-pointer overflow-hidden text-left",
            hasValue || isSelected
              ? "text-foreground"
              : "text-muted-foreground",
            isCheckbox
              ? "items-center justify-center border-transparent bg-transparent p-0 shadow-none"
              : field.is_multiline
                ? "items-start justify-start"
                : "items-center justify-start",
          )}
          style={isCheckbox ? undefined : textStyle}
          onClick={handleContentClick}
          onDoubleClick={handleDoubleClick}
          title={
            isCheckbox
              ? "Click to toggle"
              : isInlineEditableField(field)
                ? "Click to select, double-click to edit"
                : "Click to select field"
          }
        >
          {isCheckbox ? (
            <AppCheckboxVisual checked={isChecked} />
          ) : hasValue ? (
            <span
              className={cn(
                "block w-full font-normal",
                field.is_multiline
                  ? "whitespace-pre-wrap break-words"
                  : "truncate whitespace-nowrap",
              )}
            >
              {valueText}
            </span>
          ) : showPlaceholder && placeholderText ? (
            <span className="truncate italic opacity-70">{placeholderText}</span>
          ) : null}
        </button>
      )}
    </Rnd>
  );
}
