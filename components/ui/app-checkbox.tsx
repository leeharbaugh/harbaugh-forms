"use client";

/**
 * Custom checkbox rendering for the whole app — no native browser check indicator.
 * 14×14 white box, 1px neutral border, black SVG checkmark (~85% of box).
 * Use AppCheckbox for interactive controls and AppCheckboxVisual for read-only
 * PDF overlays and static previews.
 */

import * as React from "react";

import {
  CHECKBOX_CHECKMARK_SIZE_PX,
  CHECKBOX_VISUAL_SIZE_PX,
} from "@/lib/checkbox-constants";
import { cn } from "@/lib/utils";

export const APP_CHECKBOX_SIZE_PX = CHECKBOX_VISUAL_SIZE_PX;

export const appCheckboxSizeStyle: React.CSSProperties = {
  width: APP_CHECKBOX_SIZE_PX,
  height: APP_CHECKBOX_SIZE_PX,
  minWidth: APP_CHECKBOX_SIZE_PX,
  minHeight: APP_CHECKBOX_SIZE_PX,
  maxWidth: APP_CHECKBOX_SIZE_PX,
  maxHeight: APP_CHECKBOX_SIZE_PX,
};

/** Tailwind helper matching APP_CHECKBOX_SIZE_PX. Applied after className to win conflicts. */
export const APP_CHECKBOX_SIZE_CLASS = "h-3.5 w-3.5 shrink-0";

/** Bold checkmark path — Acrobat / printed-form style, not a browser glyph. */
export function AppCheckboxCheckmark({
  className,
  sizePx = CHECKBOX_CHECKMARK_SIZE_PX,
}: {
  className?: string;
  sizePx?: number;
}) {
  return (
    <svg
      width={sizePx}
      height={sizePx}
      viewBox="0 0 24 24"
      className={cn("block shrink-0", className)}
      aria-hidden
    >
      <path
        d="M5.5 12.5 L10 17 L18.5 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function appCheckboxBoxClassName(options?: {
  disabled?: boolean;
}): string {
  return cn(
    "inline-flex items-center justify-center rounded-[2px] border border-neutral-400 bg-white box-border p-0",
    APP_CHECKBOX_SIZE_CLASS,
    options?.disabled && "opacity-50",
  );
}

type AppCheckboxFaceProps = {
  checked: boolean;
  disabled?: boolean;
  className?: string;
};

/** Shared square + optional checkmark — used by interactive and read-only checkboxes. */
export function AppCheckboxFace({
  checked,
  disabled = false,
  className,
}: AppCheckboxFaceProps) {
  return (
    <span
      className={cn(appCheckboxBoxClassName({ disabled }), className)}
      style={appCheckboxSizeStyle}
      aria-hidden
    >
      {checked ? (
        <AppCheckboxCheckmark className="text-black" />
      ) : null}
    </span>
  );
}

type AppCheckboxVisualProps = {
  checked: boolean;
  disabled?: boolean;
  className?: string;
};

/** Read-only checkbox for PDF overlays and static previews. */
export function AppCheckboxVisual({
  checked,
  disabled = false,
  className,
}: AppCheckboxVisualProps) {
  return (
    <AppCheckboxFace
      checked={checked}
      disabled={disabled}
      className={className}
    />
  );
}

type AppCheckboxProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "checked" | "defaultChecked" | "onChange" | "role" | "type"
> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

const AppCheckbox = React.forwardRef<HTMLButtonElement, AppCheckboxProps>(
  (
    {
      className,
      style,
      checked: checkedProp,
      defaultChecked = false,
      onCheckedChange,
      disabled,
      onClick,
      ...props
    },
    ref,
  ) => {
    const isControlled = checkedProp !== undefined;
    const [uncontrolledChecked, setUncontrolledChecked] =
      React.useState(defaultChecked);
    const checked = isControlled ? checkedProp : uncontrolledChecked;

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || disabled) {
        return;
      }

      const nextChecked = !checked;
      if (!isControlled) {
        setUncontrolledChecked(nextChecked);
      }
      onCheckedChange?.(nextChecked);
    };

    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        className={cn(
          "inline-flex shrink-0 appearance-none border-0 bg-transparent p-0 shadow-none outline-none",
          "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed",
          className,
        )}
        style={style}
        onClick={handleClick}
        {...props}
      >
        <AppCheckboxFace checked={checked} disabled={disabled} />
      </button>
    );
  },
);
AppCheckbox.displayName = "AppCheckbox";

export { AppCheckbox };
