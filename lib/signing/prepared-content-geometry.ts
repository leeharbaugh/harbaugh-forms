/**
 * Shared geometry for manager-prepared content, used by the PDF baker and the
 * editor overlay so the Draft view matches what activation bakes in.
 */
import {
  PDF_TEXT_PADDING_X,
  layoutTextInBox,
  resolveFieldFontSize,
} from "@/lib/pdf-text-layout";

/** Font size for a single-line Printed Name that fits the box width. */
export function printedNameFontSize(options: {
  text: string;
  width: number;
  height: number;
  measureWidth: (text: string, size: number) => number;
}): number {
  const base = resolveFieldFontSize({
    configuredFontSize: null,
    boxHeightPdf: options.height,
    isMultiline: false,
    scale: 1,
  });
  const layout = layoutTextInBox({
    text: options.text,
    boxWidth: options.width,
    boxHeight: options.height,
    fontSize: base,
    isMultiline: false,
    measureWidth: (value) => options.measureWidth(value, base),
  });
  const innerWidth = Math.max(1, options.width - PDF_TEXT_PADDING_X * 2);
  const measured = options.measureWidth(options.text, layout.fontSize);
  return measured > innerWidth && measured > 0
    ? layout.fontSize * (innerWidth / measured)
    : layout.fontSize;
}

/** Top of the Printed Name text line (PDF units from the page top): vertically centred. */
export function printedNameTextTop(box: { y: number; height: number }, size: number): number {
  return box.y + Math.max(0, (box.height - size) / 2);
}

/** Checkmark stroke points in box-relative [0..1] coordinates from the top-left. */
export const CHECKMARK_POINTS: readonly [number, number][] = [
  [0.18, 0.55],
  [0.42, 0.8],
  [0.84, 0.2],
];

/** Stroke width for a checkmark drawn in a square of side `side`. */
export function checkmarkThickness(side: number): number {
  return Math.max(1, side * 0.12);
}
