"use client";

import type { PageMetrics } from "@/lib/types/template-pdf-field";
import type { PacketFormAnnotation } from "@/lib/types/packet-form-annotation";
import { typedSignatureFontSize } from "@/lib/pdf-text-layout";
import { cn } from "@/lib/utils";
import { useRef } from "react";
import { Rnd } from "react-rnd";

type PacketFormAnnotationOverlayProps = {
  annotation: PacketFormAnnotation;
  metrics: PageMetrics;
  pageWidthPdf: number;
  pageHeightPdf: number;
  isSelected: boolean;
  isUpdating: boolean;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onDragStop: (id: string, x: number, y: number) => void;
  onResizeStop: (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
  onDelete: (id: string) => void;
};

const DRAG_MOVE_THRESHOLD_PX = 3;

/**
 * Shared Fill Form annotation overlay (typed signature + date signed).
 * Geometry/zoom behavior is shared; rendering branches on annotation_type.
 */
export function PacketFormAnnotationOverlay({
  annotation,
  metrics,
  pageWidthPdf,
  pageHeightPdf,
  isSelected,
  isUpdating,
  readOnly,
  onSelect,
  onDragStop,
  onResizeStop,
  onDelete,
}: PacketFormAnnotationOverlayProps) {
  const startRef = useRef<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );

  const isDate = annotation.annotation_type === "date_signed";
  const scaleX = metrics.renderedWidth / pageWidthPdf;
  const scaleY = metrics.renderedHeight / pageHeightPdf;
  const left = annotation.x * scaleX;
  const top = annotation.y * scaleY;
  const width = annotation.width * scaleX;
  const height = annotation.height * scaleY;
  const fontPx = typedSignatureFontSize(annotation.height) * scaleY;

  return (
    <Rnd
      bounds="parent"
      size={{ width, height }}
      position={{ x: left, y: top }}
      minWidth={isDate ? 40 : 48}
      minHeight={isDate ? 12 : 20}
      lockAspectRatio
      disableDragging={readOnly || isUpdating}
      enableResizing={
        readOnly || isUpdating
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
      onDragStart={(_e, data) => {
        startRef.current = { x: data.x, y: data.y, w: width, h: height };
      }}
      onResizeStart={() => {
        startRef.current = { x: left, y: top, w: width, h: height };
      }}
      onDragStop={(_e, data) => {
        const start = startRef.current;
        startRef.current = null;
        if (!start) return;
        const moved =
          Math.abs(data.x - start.x) > DRAG_MOVE_THRESHOLD_PX ||
          Math.abs(data.y - start.y) > DRAG_MOVE_THRESHOLD_PX;
        if (moved) {
          onDragStop(annotation.id, data.x, data.y);
        } else {
          onSelect(annotation.id);
        }
      }}
      onResizeStop={(_e, _dir, ref, _delta, position) => {
        startRef.current = null;
        onResizeStop(
          annotation.id,
          position.x,
          position.y,
          ref.offsetWidth,
          ref.offsetHeight,
        );
      }}
      className={cn(
        "z-[4] border bg-transparent shadow-sm",
        isDate
          ? "border-sky-500/70"
          : "border-violet-500/70",
        isSelected &&
          (isDate
            ? "ring-2 ring-sky-400 ring-offset-1"
            : "ring-2 ring-violet-400 ring-offset-1"),
        isUpdating && "opacity-70",
      )}
    >
      <button
        type="button"
        className="flex h-full w-full cursor-pointer items-end overflow-hidden px-0.5 pb-0.5 text-left"
        style={{
          fontFamily: isDate
            ? 'Helvetica, Arial, "Helvetica Neue", sans-serif'
            : '"Caveat", "Segoe Script", "Comic Sans MS", cursive',
          fontSize: `${fontPx}px`,
          lineHeight: 1,
          color: isDate ? "#000000" : "#12124a",
        }}
        onClick={() => onSelect(annotation.id)}
        title={
          isDate
            ? "Date signed annotation (not Authentisign)"
            : "Typed signature annotation (not Authentisign)"
        }
      >
        <span className="block w-full truncate whitespace-nowrap">
          {annotation.text_value}
        </span>
      </button>
      {isSelected && !readOnly && (
        <button
          type="button"
          className="absolute -right-2 -top-2 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground shadow"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(annotation.id);
          }}
        >
          Delete
        </button>
      )}
    </Rnd>
  );
}

/** @deprecated Use PacketFormAnnotationOverlay */
export const PacketFormSignatureOverlay = PacketFormAnnotationOverlay;
