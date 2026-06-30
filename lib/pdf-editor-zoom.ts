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

/** Scroll a child element into view within a scroll container (never the window). */
export function scrollElementIntoContainer(
  container: HTMLElement,
  element: HTMLElement,
  padding = 8,
): void {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  if (elementRect.top < containerRect.top + padding) {
    container.scrollTop -= containerRect.top + padding - elementRect.top;
  } else if (elementRect.bottom > containerRect.bottom - padding) {
    container.scrollTop += elementRect.bottom - containerRect.bottom + padding;
  }
}

/** Run a callback after layout settles (avoids scroll during click/drag handlers). */
export function afterLayoutSettled(callback: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

export type PdfWorkspaceScrollSnapshot = {
  scrollTop: number;
  scrollLeft: number;
  pageNumber: number | null;
  mappingId: string | null;
};

export function findMostVisiblePageNumber(
  workspace: HTMLElement,
  pageRefs: Record<number, HTMLElement | null>,
): number | null {
  const workspaceRect = workspace.getBoundingClientRect();
  let bestPage: number | null = null;
  let bestVisible = 0;

  for (const [pageKey, element] of Object.entries(pageRefs)) {
    if (!element) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    const visibleTop = Math.max(rect.top, workspaceRect.top);
    const visibleBottom = Math.min(rect.bottom, workspaceRect.bottom);
    const visible = Math.max(0, visibleBottom - visibleTop);

    if (visible > bestVisible) {
      bestVisible = visible;
      bestPage = Number(pageKey);
    }
  }

  return bestPage;
}

export function capturePdfWorkspaceScroll(params: {
  workspace: HTMLElement | null;
  pageRefs: Record<number, HTMLElement | null>;
  selectedMappingId: string | null;
  mappings: Array<{ id: string; page_number: number }>;
}): PdfWorkspaceScrollSnapshot {
  const { workspace, pageRefs, selectedMappingId, mappings } = params;
  const selectedMapping = selectedMappingId
    ? mappings.find((mapping) => mapping.id === selectedMappingId)
    : null;

  let pageNumber = selectedMapping?.page_number ?? null;
  if (!pageNumber && workspace) {
    pageNumber = findMostVisiblePageNumber(workspace, pageRefs);
  }

  return {
    scrollTop: workspace?.scrollTop ?? 0,
    scrollLeft: workspace?.scrollLeft ?? 0,
    pageNumber,
    mappingId: selectedMappingId,
  };
}

type RestorePdfWorkspaceScrollParams = {
  snapshot: PdfWorkspaceScrollSnapshot;
  workspace: HTMLElement | null;
  inventoryList?: HTMLElement | null;
  inventoryItemRefs?: Record<string, HTMLElement | null>;
};

function applyPdfWorkspaceScrollSnapshot({
  snapshot,
  workspace,
  inventoryList,
  inventoryItemRefs,
}: RestorePdfWorkspaceScrollParams): void {
  if (workspace) {
    workspace.scrollTop = snapshot.scrollTop;
    workspace.scrollLeft = snapshot.scrollLeft;
  }

  if (snapshot.mappingId && inventoryList && inventoryItemRefs) {
    const item = inventoryItemRefs[snapshot.mappingId];
    if (item) {
      scrollElementIntoContainer(inventoryList, item);
    }
  }
}

export function restorePdfWorkspaceScroll(
  params: RestorePdfWorkspaceScrollParams,
): void {
  afterLayoutSettled(() => {
    applyPdfWorkspaceScrollSnapshot(params);
  });
}

export function restorePdfWorkspaceScrollWhenReady(
  params: RestorePdfWorkspaceScrollParams & {
    pageRefs: Record<number, HTMLElement | null>;
    isReady: () => boolean;
    maxAttempts?: number;
  },
): void {
  const maxAttempts = params.maxAttempts ?? 30;

  const attemptRestore = (attempt: number) => {
    const pageReady =
      !params.snapshot.pageNumber ||
      params.pageRefs[params.snapshot.pageNumber] != null;

    if ((params.isReady() && pageReady) || attempt >= maxAttempts) {
      applyPdfWorkspaceScrollSnapshot(params);
      return;
    }

    requestAnimationFrame(() => attemptRestore(attempt + 1));
  };

  afterLayoutSettled(() => attemptRestore(0));
}
