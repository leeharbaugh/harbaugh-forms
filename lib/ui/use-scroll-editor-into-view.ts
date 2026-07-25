"use client";

import { useEffect, type RefObject } from "react";

/**
 * Scroll an editor panel into view when the user opens Create/Edit
 * (or switches the selected record). Does not scroll when mode is hidden.
 *
 * Dependencies are intentionally limited to mode + selection identity so
 * ordinary typing, save, validation, and nested form updates do not scroll.
 */
export function useScrollEditorIntoView(
  editorRef: RefObject<HTMLElement | null>,
  mode: string,
  selectionKey: string | number | null,
) {
  useEffect(() => {
    if (mode === "hidden") {
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [editorRef, mode, selectionKey]);
}
