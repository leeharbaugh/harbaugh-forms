"use client";

import {
  type PageMetrics,
  type PlacedPdfField,
  pdfToRenderRect,
} from "@/lib/types/template-pdf-field";
import { formatMappingOverlayLabel } from "@/lib/types/pdf-field-mapping-editor";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { Rnd } from "react-rnd";

type PdfFieldOverlayProps = {
  field: PlacedPdfField;
  metrics: PageMetrics;
  isSelected: boolean;
  isUpdating: boolean;
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
  onSelect,
  onDragStop,
  onResizeStop,
}: PdfFieldOverlayProps) {
  const suppressClickRef = useRef(false);
  const interactionRef = useRef<InteractionState | null>(null);
  const rect = pdfToRenderRect(field, metrics);
  const label = formatMappingOverlayLabel(field);

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
      minWidth={MIN_OVERLAY_SIZE}
      minHeight={MIN_OVERLAY_SIZE}
      enableResizing={
        isUpdating
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
      disableDragging={isUpdating}
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
        "z-[2] border-2 bg-sky-400/25 shadow-sm backdrop-blur-[1px] transition-[box-shadow,background-color,border-color]",
        isSelected
          ? "border-amber-500 bg-amber-300/40 shadow-md ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-zinc-900"
          : "border-sky-600 hover:border-sky-500",
        isUpdating && "opacity-70",
      )}
      style={{
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        className="flex h-full w-full cursor-pointer items-start overflow-hidden px-1 py-0.5 text-left text-[10px] font-semibold leading-tight text-sky-950"
        onClick={handleSelect}
        title="Click to select field"
      >
        <span className="truncate">{label}</span>
      </button>
    </Rnd>
  );
}
