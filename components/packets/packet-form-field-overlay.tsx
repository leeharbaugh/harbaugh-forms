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
} from "@/lib/types/packet-form-editor";
import { AppCheckboxVisual } from "@/components/ui/app-checkbox";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";
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
  is_required: boolean;
  hasPlacementOverride: boolean;
  displayValue: string;
  default_checked: boolean;
};

type PacketFormFieldOverlayProps = {
  field: PacketFormOverlayField;
  metrics: PageMetrics;
  isSelected: boolean;
  isUpdating: boolean;
  onSelect: (field: PacketFormOverlayField) => void;
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

export function PacketFormFieldOverlay({
  field,
  metrics,
  isSelected,
  isUpdating,
  onSelect,
  onDragStop,
  onResizeStop,
}: PacketFormFieldOverlayProps) {
  const suppressClickRef = useRef(false);
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
  const valueText = formatPacketFieldOverlayValue(
    field.displayValue,
    field.field_type,
  );
  const showPlaceholder = (isSelected || isHovered) && !hasValue;
  const placeholderText = isSignature
    ? "Signature"
    : isInitial
      ? "Initials"
      : isCheckbox
        ? ""
        : "Empty";

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

  const overlayResizeEnabled = isUpdating
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
            : hasValue
              ? "bg-white/85 dark:bg-zinc-900/85"
              : "border-dashed bg-transparent opacity-70 hover:opacity-100",
        isUpdating && "opacity-70",
      )}
      style={{
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        className={cn(
          "flex h-full w-full cursor-pointer items-center overflow-hidden text-left text-[10px] leading-tight",
          !isCheckbox && "px-1 py-0.5",
          hasValue || isSelected
            ? "text-foreground"
            : "text-muted-foreground",
          isCheckbox
            ? "justify-center border-transparent bg-transparent p-0 shadow-none"
            : "justify-start",
        )}
        onClick={handleSelect}
        title="Click to select field"
      >
        {isCheckbox ? (
          <AppCheckboxVisual checked={isChecked} />
        ) : hasValue ? (
          <span className="truncate font-normal">{valueText}</span>
        ) : showPlaceholder && placeholderText ? (
          <span className="truncate italic opacity-70">{placeholderText}</span>
        ) : null}
      </button>
    </Rnd>
  );
}
