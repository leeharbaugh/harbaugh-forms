export type PdfZoomMode = "fit-width" | "fit-page" | "custom";

export const PDF_ZOOM_MIN = 50;
export const PDF_ZOOM_MAX = 300;
export const PDF_ZOOM_STEP = 1.25;
export const PDF_WORKSPACE_PADDING = 48;
export const PDF_EDITOR_SIDEBAR_WIDTH = 360;
export const PDF_MIN_PAGE_WIDTH = 280;

export function computePdfPageWidth(params: {
  mode: PdfZoomMode;
  zoomPercent: number;
  basePageWidth: number;
  basePageHeight: number;
  workspaceWidth: number;
  workspaceHeight: number;
  padding?: number;
  comfortableClamp?: boolean;
}): number {
  const padding = params.padding ?? PDF_WORKSPACE_PADDING;
  const {
    mode,
    zoomPercent,
    basePageWidth,
    basePageHeight,
    workspaceWidth,
    workspaceHeight,
  } = params;

  if (basePageWidth <= 0) {
    return PDF_MIN_PAGE_WIDTH;
  }

  if (mode === "fit-width" && workspaceWidth > 0) {
    const fitWidth = Math.floor(workspaceWidth - padding);
    if (params.comfortableClamp) {
      const minWidth = basePageWidth;
      const maxWidth = Math.floor(basePageWidth * 1.25);
      return Math.max(minWidth, Math.min(fitWidth, maxWidth));
    }
    return Math.max(PDF_MIN_PAGE_WIDTH, fitWidth);
  }

  if (
    mode === "fit-page" &&
    workspaceWidth > 0 &&
    workspaceHeight > 0 &&
    basePageHeight > 0
  ) {
    const scaleW = (workspaceWidth - padding) / basePageWidth;
    const scaleH = (workspaceHeight - padding) / basePageHeight;
    return Math.max(
      PDF_MIN_PAGE_WIDTH,
      Math.floor(basePageWidth * Math.min(scaleW, scaleH)),
    );
  }

  const clampedZoom = Math.max(
    PDF_ZOOM_MIN,
    Math.min(PDF_ZOOM_MAX, zoomPercent),
  );
  return Math.max(
    PDF_MIN_PAGE_WIDTH,
    Math.floor(basePageWidth * (clampedZoom / 100)),
  );
}

export function displayZoomPercent(
  pageWidth: number,
  basePageWidth: number,
): number {
  if (basePageWidth <= 0) {
    return 100;
  }

  return Math.round((pageWidth / basePageWidth) * 100);
}

export function clampCustomZoomPercent(zoomPercent: number): number {
  return Math.max(PDF_ZOOM_MIN, Math.min(PDF_ZOOM_MAX, Math.round(zoomPercent)));
}

export function stepZoomPercent(
  currentPercent: number,
  direction: "in" | "out",
): number {
  const factor = direction === "in" ? PDF_ZOOM_STEP : 1 / PDF_ZOOM_STEP;
  return clampCustomZoomPercent(currentPercent * factor);
}
