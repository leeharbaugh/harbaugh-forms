"use client";

import {
  type PageMetrics,
  type PlacedPdfField,
  isAcroformImportedMapping,
  isCheckboxPdfField,
  pdfToRenderRect,
} from "@/lib/types/template-pdf-field";
import { AppCheckboxVisual } from "@/components/ui/app-checkbox";
import { CHECKBOX_VISUAL_SIZE_PX } from "@/lib/checkbox-constants";
import { formatMappingOverlayLabel } from "@/lib/types/pdf-field-mapping-editor";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { Rnd } from "react-rnd";

type PdfFieldOverlayProps = {
  field: PlacedPdfField;
  metrics: PageMetrics;
  isSelected: boolean;
  isUpdating: boolean;
  /** When true, selection works but drag/resize are disabled. */
  readOnly?: boolean;
  onSelect: (field: PlacedPdfField) => void;
  onDragStop: (field: PlacedPdfField, x: number, y: number) => void;
  onResizeStop: (
    field: PlacedPdfField,
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

export function PdfFieldOverlay({
  field,
  metrics,
  isSelected,
  isUpdating,
  readOnly = false,
  onSelect,
  onDragStop,
  onResizeStop,
}: PdfFieldOverlayProps) {
  const suppressClickRef = useRef(false);
  const interactionRef = useRef<InteractionState | null>(null);
  const rect = pdfToRenderRect(field, metrics);
  const label = formatMappingOverlayLabel(field);
  const isCheckbox = isCheckboxPdfField(field);
  const isAcroform = isAcroformImportedMapping(field);
  const placementLocked = readOnly || isAcroform || isUpdating;
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

  const suppressClick = () => {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, CLICK_SUPPRESS_MS);
  };

  const handleSelect = () => {
    if (suppressClickRef.current || isUpdating) {
      return;
    }

    onSelect(field);
  };

  const clearInteraction = () => {
    interactionRef.current = null;
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

        onSelect(field);
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
      className={cn(
        "z-[2] border-2 shadow-sm backdrop-blur-[1px] transition-[box-shadow,background-color,border-color]",
        isCheckbox
          ? "border-border bg-transparent"
          : isAcroform
            ? "bg-emerald-400/25"
            : "bg-sky-400/25",
        isSelected
          ? isCheckbox
            ? "border-amber-500 ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900"
            : "border-amber-500 bg-amber-300/40 shadow-md ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900"
          : isCheckbox
            ? "border-border hover:border-muted-foreground"
            : isAcroform
              ? "border-emerald-600 hover:border-emerald-500"
              : "border-sky-600 hover:border-sky-500",
        isUpdating && "opacity-70",
      )}
      style={{
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        className={cn(
          "flex h-full w-full cursor-pointer overflow-hidden text-left leading-tight",
          isCheckbox
            ? "items-center justify-center p-0"
            : "items-start px-1 py-0.5 text-[10px] font-semibold",
          isAcroform ? "text-emerald-950" : "text-sky-950",
        )}
        onClick={handleSelect}
        title={
          isAcroform
            ? `${label} (AcroForm: ${field.pdf_field_name}) — click to select`
            : isCheckbox
              ? `${label} — click to select`
              : "Click to select field"
        }
      >
        {isCheckbox ? (
          <AppCheckboxVisual checked={false} />
        ) : (
          <span className="truncate">{label}</span>
        )}
      </button>
    </Rnd>
  );
}
