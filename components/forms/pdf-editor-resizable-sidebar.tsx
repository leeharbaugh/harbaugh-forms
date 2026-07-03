"use client";

import { cn } from "@/lib/utils";
import { useCallback, useRef } from "react";

type PdfEditorResizableSidebarProps = {
  width: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
  children: React.ReactNode;
};

export function PdfEditorResizableSidebar({
  width,
  minWidth,
  maxWidth,
  onWidthChange,
  children,
}: PdfEditorResizableSidebarProps) {
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  const handleResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragStateRef.current = {
        startX: event.clientX,
        startWidth: width,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dragState = dragStateRef.current;
        if (!dragState) {
          return;
        }

        const delta = dragState.startX - moveEvent.clientX;
        const nextWidth = Math.min(
          maxWidth,
          Math.max(minWidth, dragState.startWidth + delta),
        );
        onWidthChange(nextWidth);
      };

      const handleMouseUp = () => {
        dragStateRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [maxWidth, minWidth, onWidthChange, width],
  );

  return (
    <aside
      className="relative flex min-h-0 shrink-0 flex-col border-l bg-card"
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        className={cn(
          "absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize",
          "bg-transparent hover:bg-primary/20 active:bg-primary/30",
        )}
        onMouseDown={handleResizeStart}
      />
      {children}
    </aside>
  );
}
