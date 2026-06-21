"use client";

import {
  type PageMetrics,
  pdfToRenderRect,
} from "@/lib/types/template-pdf-field";
import {
  formatPacketFieldOverlayValue,
  isPacketFieldValueEmpty,
  resolveCheckboxCheckedState,
} from "@/lib/types/packet-form-editor";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useRef, useState } from "react";
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
  default_checked: boolean;
};

type PacketFormFieldOverlayProps = {
  field: PacketFormOverlayField;
  metrics: PageMetrics;
  isSelected: boolean;
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

function CheckboxVisual({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-full w-full items-center justify-center",
        checked ? "text-foreground" : "text-muted-foreground/60",
      )}
      aria-hidden
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-sm border-2",
          checked
            ? "border-emerald-700 bg-emerald-600 text-white"
            : "border-muted-foreground/40 bg-background/80",
        )}
        style={{ width: "70%", height: "70%", minWidth: 10, minHeight: 10 }}
      >
        {checked && <Check className="h-[65%] w-[65%] stroke-[3]" />}
      </span>
    </span>
  );
}

export function PacketFormFieldOverlay({
  field,
  metrics,
  isSelected,
  isUpdating,
  onEdit,
  onDragStop,
  onResizeStop,
}: PacketFormFieldOverlayProps) {
  const suppressClickRef = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const rect = pdfToRenderRect(field, metrics);
  const isCheckbox = field.field_type === "CHECKBOX";
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group z-[2] border shadow-sm backdrop-blur-[1px] transition-colors",
        field.hasPlacementOverride
          ? "border-amber-600/80"
          : "border-sky-600/50",
        isSelected &&
          "border-amber-500 bg-amber-300/20 ring-2 ring-amber-400/60",
        hasValue && !isSelected && "bg-white/85 dark:bg-zinc-900/85",
        !hasValue &&
          !isSelected &&
          "border-dashed bg-transparent opacity-70 hover:opacity-100",
        isUpdating && "opacity-70",
      )}
      style={{
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        className={cn(
          "flex h-full w-full cursor-pointer items-center overflow-hidden px-1 py-0.5 text-left text-[10px] leading-tight",
          hasValue || isSelected
            ? "text-foreground"
            : "text-muted-foreground",
          isCheckbox ? "justify-center" : "justify-start",
        )}
        onClick={handleContentClick}
        title="Click to select field"
      >
        {isCheckbox ? (
          <CheckboxVisual checked={isChecked} />
        ) : hasValue ? (
          <span className="truncate font-normal">{valueText}</span>
        ) : showPlaceholder && placeholderText ? (
          <span className="truncate italic opacity-70">{placeholderText}</span>
        ) : null}
      </button>
    </Rnd>
  );
}
