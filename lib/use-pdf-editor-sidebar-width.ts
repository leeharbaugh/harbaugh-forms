"use client";

import {
  PDF_EDITOR_SIDEBAR_WIDTH,
  PDF_EDITOR_SIDEBAR_WIDTH_MAX,
  PDF_EDITOR_SIDEBAR_WIDTH_MIN,
  PDF_EDITOR_SIDEBAR_WIDTH_STORAGE_KEY,
} from "@/lib/pdf-editor-zoom";
import { useCallback, useEffect, useState } from "react";

function clampSidebarWidth(width: number): number {
  return Math.min(
    PDF_EDITOR_SIDEBAR_WIDTH_MAX,
    Math.max(PDF_EDITOR_SIDEBAR_WIDTH_MIN, Math.round(width)),
  );
}

function readStoredSidebarWidth(): number {
  if (typeof window === "undefined") {
    return PDF_EDITOR_SIDEBAR_WIDTH;
  }

  const stored = window.localStorage.getItem(PDF_EDITOR_SIDEBAR_WIDTH_STORAGE_KEY);
  if (!stored) {
    return PDF_EDITOR_SIDEBAR_WIDTH;
  }

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) {
    return PDF_EDITOR_SIDEBAR_WIDTH;
  }

  return clampSidebarWidth(parsed);
}

export function usePdfEditorSidebarWidth() {
  const [width, setWidthState] = useState(PDF_EDITOR_SIDEBAR_WIDTH);

  useEffect(() => {
    setWidthState(readStoredSidebarWidth());
  }, []);

  const setWidth = useCallback((nextWidth: number) => {
    const clamped = clampSidebarWidth(nextWidth);
    setWidthState(clamped);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        PDF_EDITOR_SIDEBAR_WIDTH_STORAGE_KEY,
        String(clamped),
      );
    }
  }, []);

  return { width, setWidth, minWidth: PDF_EDITOR_SIDEBAR_WIDTH_MIN, maxWidth: PDF_EDITOR_SIDEBAR_WIDTH_MAX };
}
