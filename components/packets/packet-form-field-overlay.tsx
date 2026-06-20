"use client";

import {
  type PageMetrics,
  pdfToRenderRect,
} from "@/lib/types/template-pdf-field";
import { formatPacketFieldDisplayValue } from "@/lib/types/packet-form-editor";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { Rnd } from "react-rnd";

export type PacketFormOverlayField = {
  id: string;
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
  is_required: boolean;
  hasPlacementOverride: boolean;
  displayValue: string;
};

type PacketFormFieldOverlayProps = {
  field: PacketFormOverlayField;
  metrics: PageMetrics;
  isUpdating: boolean;
  onEdit: (field: PacketFormOverlayField) => void;
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

export function PacketFormFieldOverlay({
  field,
  metrics,
  isUpdating,
  onEdit,
  onDragStop,
  onResizeStop,
}: PacketFormFieldOverlayProps) {
  const suppressClickRef = useRef(false);
  const rect = pdfToRenderRect(field, metrics);
  const label = field.field_label?.trim() || field.field_key;
  const valueText = formatPacketFieldDisplayValue(
    field.displayValue,
    field.field_type,
  );

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
        "z-20 border-2 shadow-sm backdrop-blur-[1px]",
        field.hasPlacementOverride
          ? "border-amber-600 bg-amber-400/25"
          : "border-emerald-600 bg-emerald-400/20",
        isUpdating && "opacity-70",
      )}
      style={{
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        className={cn(
          "flex h-full w-full cursor-pointer flex-col items-start overflow-hidden px-1 py-0.5 text-left text-[10px] leading-tight",
          field.hasPlacementOverride ? "text-amber-950" : "text-emerald-950",
        )}
        onClick={handleContentClick}
        title="Click to edit value"
      >
        <span className="truncate font-semibold">{label}</span>
        <span className="truncate">{valueText}</span>
      </button>
    </Rnd>
  );
}
