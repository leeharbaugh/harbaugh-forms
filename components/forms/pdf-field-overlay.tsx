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
  onEdit: (field: PlacedPdfField) => void;
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

export function PdfFieldOverlay({
  field,
  metrics,
  isSelected,
  isUpdating,
  onEdit,
  onDragStop,
  onResizeStop,
}: PdfFieldOverlayProps) {
  const suppressClickRef = useRef(false);
  const rect = pdfToRenderRect(field, metrics);
  const label = formatMappingOverlayLabel(field);

  const suppressClick = () => {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, CLICK_SUPPRESS_MS);
  };

  const handleContentClick = () => {
    if (suppressClickRef.current || isUpdating) {
      return;
    }

    onEdit(field);
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
      onDragStart={suppressClick}
      onResizeStart={suppressClick}
      onDragStop={(_event, data) => {
        suppressClick();
        onDragStop(field, data.x, data.y);
      }}
      onResizeStop={(_event, _direction, ref, _delta, position) => {
        suppressClick();
        onResizeStop(
          field,
          position.x,
          position.y,
          ref.offsetWidth,
          ref.offsetHeight,
        );
      }}
      className={cn(
        "z-[2] border-2 bg-sky-400/25 shadow-sm backdrop-blur-[1px]",
        isSelected
          ? "border-amber-500 bg-amber-300/35 ring-2 ring-amber-400/60"
          : "border-sky-600",
        isUpdating && "opacity-70",
      )}
      style={{
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        className="flex h-full w-full cursor-pointer items-start overflow-hidden px-1 py-0.5 text-left text-[10px] font-semibold leading-tight text-sky-950"
        onClick={handleContentClick}
        title="Click to edit field"
      >
        <span className="truncate">{label}</span>
      </button>
    </Rnd>
  );
}
