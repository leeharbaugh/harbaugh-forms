/**
 * Shared PDF / Fill Form text layout: wrapping, font sizing, and padding.
 * Used by browser overlays and pdf-lib generation so preview and download agree.
 */

export const PDF_TEXT_PADDING_X = 2;
export const PDF_TEXT_PADDING_Y = 2;
export const PDF_TEXT_LINE_HEIGHT_RATIO = 1.2;
export const PDF_FONT_SIZE_MIN = 6;
export const PDF_FONT_SIZE_MAX_SINGLE = 22;
export const PDF_FONT_SIZE_MAX_MULTILINE = 14;
/** Floor when shrinking multiline text to fit more lines (never go unreadably small). */
export const PDF_MULTILINE_SHRINK_FLOOR = 7;

export type TextWidthMeasurer = (text: string) => number;

/**
 * Split on explicit newlines first, then wrap each paragraph to maxWidth.
 * Oversized tokens are broken character-by-character so they never exceed the box.
 */
export function wrapTextToLines(
  text: string,
  maxWidth: number,
  measureWidth: TextWidthMeasurer,
): string[] {
  const usableWidth = Math.max(1, maxWidth);
  const paragraphs = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(/(\s+)/);
    let current = "";

    const pushCurrent = () => {
      if (current.length > 0) {
        lines.push(current);
        current = "";
      }
    };

    for (const token of words) {
      if (!token) continue;

      const candidate = current + token;
      if (measureWidth(candidate) <= usableWidth) {
        current = candidate;
        continue;
      }

      pushCurrent();

      if (measureWidth(token) <= usableWidth) {
        current = token.trimStart();
        continue;
      }

      // Hard-break oversized tokens.
      let chunk = "";
      for (const ch of token) {
        const next = chunk + ch;
        if (chunk && measureWidth(next) > usableWidth) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      current = chunk;
    }

    pushCurrent();
  }

  return lines.length > 0 ? lines : [""];
}

export function clampFontSize(
  size: number,
  isMultiline: boolean,
): number {
  const max = isMultiline ? PDF_FONT_SIZE_MAX_MULTILINE : PDF_FONT_SIZE_MAX_SINGLE;
  return Math.min(max, Math.max(PDF_FONT_SIZE_MIN, size));
}

/**
 * Derive a readable CSS/PDF point size from placement box height when no
 * explicit size is meaningful, then apply zoom/coordinate scale.
 */
export function resolveFieldFontSize(params: {
  configuredFontSize: number | null | undefined;
  boxHeightPdf: number;
  isMultiline: boolean;
  /** renderedHeight / originalHeight for overlays; usually 1 for pdf-lib page space */
  scale: number;
}): number {
  const configured = params.configuredFontSize;
  const hasExplicit =
    configured != null && Number.isFinite(configured) && configured > 0;

  let base: number;
  if (hasExplicit) {
    base = configured as number;
  } else if (params.isMultiline) {
    base = Math.min(11, Math.max(PDF_MULTILINE_SHRINK_FLOOR, params.boxHeightPdf * 0.22));
  } else {
    // Fill most of a single-line box height (padding accounted for by caller).
    base = Math.max(PDF_FONT_SIZE_MIN, params.boxHeightPdf * 0.72);
  }

  // Clamp in PDF point space first, then scale for overlay CSS pixels.
  // Clamping after scale incorrectly caps high-zoom preview sizes at PDF maxes.
  const clamped = clampFontSize(base, params.isMultiline);
  const scale =
    Number.isFinite(params.scale) && params.scale > 0 ? params.scale : 1;
  return clamped * scale;
}

/**
 * Shared typed-signature font size in the annotation's coordinate space
 * (PDF points / unscaled page units). Overlay multiplies by zoom scale.
 */
export function typedSignatureFontSize(boxHeight: number): number {
  const height = Number.isFinite(boxHeight) && boxHeight > 0 ? boxHeight : 36;
  return Math.min(height * 0.85, Math.max(10, height * 0.7));
}

/** Fit signature text into width when a width measurer is available (PDF path). */
export function fitTypedSignatureFontSize(params: {
  text: string;
  boxWidth: number;
  boxHeight: number;
  measureWidth: TextWidthMeasurer;
}): number {
  const base = typedSignatureFontSize(params.boxHeight);
  const text = params.text.trim();
  if (!text || params.boxWidth <= 0) {
    return Math.max(PDF_FONT_SIZE_MIN, base);
  }
  const measured = params.measureWidth(text);
  if (measured <= params.boxWidth || measured <= 0) {
    return Math.max(PDF_FONT_SIZE_MIN, base);
  }
  return Math.max(PDF_FONT_SIZE_MIN, base * (params.boxWidth / measured));
}

export function multilineLineHeight(fontSize: number): number {
  return fontSize * PDF_TEXT_LINE_HEIGHT_RATIO;
}

/**
 * Fit lines into the vertical box. Optionally shrink font slightly (down to
 * PDF_MULTILINE_SHRINK_FLOOR) before clipping overflow lines.
 */
export function layoutTextInBox(params: {
  text: string;
  boxWidth: number;
  boxHeight: number;
  fontSize: number;
  isMultiline: boolean;
  measureWidth: TextWidthMeasurer;
}): {
  fontSize: number;
  lineHeight: number;
  lines: string[];
  clipped: boolean;
} {
  const innerWidth = Math.max(1, params.boxWidth - PDF_TEXT_PADDING_X * 2);
  const innerHeight = Math.max(1, params.boxHeight - PDF_TEXT_PADDING_Y * 2);

  if (!params.isMultiline) {
    const fontSize = Math.min(
      params.fontSize,
      Math.max(PDF_FONT_SIZE_MIN, innerHeight * 0.95),
    );
    // Single-line: keep one visual line; do not wrap (truncate by not drawing overflow in PDF).
    const raw = String(params.text).replace(/\s+/g, " ").trim();
    return {
      fontSize,
      lineHeight: fontSize,
      lines: raw ? [raw] : [],
      clipped: false,
    };
  }

  let fontSize = params.fontSize;
  let lines = wrapTextToLines(params.text, innerWidth, params.measureWidth);
  let lineHeight = multilineLineHeight(fontSize);
  let maxLines = Math.max(1, Math.floor(innerHeight / lineHeight));

  while (
    lines.length > maxLines &&
    fontSize > PDF_MULTILINE_SHRINK_FLOOR + 0.01
  ) {
    fontSize = Math.max(PDF_MULTILINE_SHRINK_FLOOR, fontSize - 0.5);
    lineHeight = multilineLineHeight(fontSize);
    maxLines = Math.max(1, Math.floor(innerHeight / lineHeight));
    lines = wrapTextToLines(params.text, innerWidth, params.measureWidth);
  }

  const clipped = lines.length > maxLines;
  return {
    fontSize,
    lineHeight,
    lines: lines.slice(0, maxLines),
    clipped,
  };
}

/** Approximate browser canvas measure using average glyph width heuristic for tests. */
export function approximateHelveticaWidth(text: string, fontSize: number): number {
  // Rough average advance ~0.5em for Helvetica-like metrics in tests.
  return text.length * fontSize * 0.5;
}
