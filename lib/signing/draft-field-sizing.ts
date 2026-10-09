/**
 * Content-driven default geometry for Draft Signing fields (PDF points).
 *
 * Each default box is sized to the mark the completed-PDF renderer will draw:
 * typed Signature / Initials in Caveat at `typedSignatureFontSize(height)`
 * (shrunk to fit width), Date Signed in Helvetica at `dateSignedFontSize`.
 * Widths are measured with the renderer's own font metrics.
 */
import {
  approximateHelveticaWidth,
  fitTypedSignatureFontSize,
  resolveFieldFontSize,
  typedSignatureFontSize,
} from "@/lib/pdf-text-layout";
import { suggestTypedInitialsFromDisplayName } from "./initials-suggestion";
import type { PreparedContentType } from "./prepared-content-types";
import {
  CAVEAT_ADVANCE_WIDTHS,
  CAVEAT_DESCENT,
  HELVETICA_DATE_ADVANCE_WIDTHS,
} from "./mark-metrics-data";

export type DraftFieldKind = "SIGNATURE" | "INITIALS" | "DATE_SIGNED";

export type DraftMarkSigner = {
  fullName: string;
  capacityMode?: "PERSONAL" | "REPRESENTATIVE" | null;
  capacityWording?: string | null;
};

/** Output shape of `senderLocalDate` (en-CA). */
export const DATE_SIGNED_SAMPLE = "2026-09-28";

const SIGNATURE_FONT_SIZE = 16;
const INITIALS_FONT_SIZE = 11;
const DATE_FONT_SIZE = 9;
const HORIZONTAL_PADDING = 3;
const UNKNOWN_GLYPH_WIDTH = 450;

export const DRAFT_FIELD_WIDTH_BOUNDS: Record<
  DraftFieldKind,
  { min: number; max: number }
> = {
  SIGNATURE: { min: 36, max: 216 },
  INITIALS: { min: 16, max: 48 },
  DATE_SIGNED: { min: 40, max: 96 },
};

/** Width of `text` in Caveat at `size` pt, matching pdf-lib measurement. */
export function caveatTextWidth(text: string, size: number): number {
  let units = 0;
  for (const char of text) {
    units += CAVEAT_ADVANCE_WIDTHS[char] ?? UNKNOWN_GLYPH_WIDTH;
  }
  return (units / 1000) * size;
}

export function caveatDescent(size: number): number {
  return (CAVEAT_DESCENT / 1000) * size;
}

export function helveticaDateWidth(text: string, size: number): number {
  let units = 0;
  for (const char of text) {
    units += HELVETICA_DATE_ADVANCE_WIDTHS[char] ?? 556;
  }
  return (units / 1000) * size;
}

/** Same rule as `drawDateSigned` in the completed-PDF renderer. */
export function dateSignedFontSize(boxHeight: number): number {
  return Math.min(11, Math.max(7, boxHeight * 0.55));
}

/** Smallest whole-point height at which the renderer draws `size` pt. */
function typedHeightForFontSize(size: number): number {
  return Math.ceil(size / 0.7);
}

/**
 * The text the renderer will draw: the approved personal signing name, the
 * frozen representative execution wording, or the suggested initials.
 */
export function expectedDraftMarkText(
  kind: DraftFieldKind,
  signer: DraftMarkSigner,
): string {
  if (kind === "DATE_SIGNED") return DATE_SIGNED_SAMPLE;
  if (kind === "INITIALS") {
    return suggestTypedInitialsFromDisplayName(signer.fullName) || "XX";
  }
  const wording = signer.capacityWording?.trim();
  if (signer.capacityMode === "REPRESENTATIVE" && wording) return wording;
  return signer.fullName.trim();
}

/** Renderer font size for a mark drawn into `box` (typed marks shrink to fit). */
export function draftMarkFontSize(
  kind: DraftFieldKind,
  text: string,
  box: { width: number; height: number },
): number {
  if (kind === "DATE_SIGNED") return dateSignedFontSize(box.height);
  const base = typedSignatureFontSize(box.height);
  return fitTypedSignatureFontSize({
    text,
    boxWidth: box.width,
    boxHeight: box.height,
    measureWidth: (value) => caveatTextWidth(value, base),
  });
}

function clampWidth(kind: DraftFieldKind, width: number): number {
  const { min, max } = DRAFT_FIELD_WIDTH_BOUNDS[kind];
  return Math.min(max, Math.max(min, Math.ceil(width)));
}

/** Default placement size for a new field, derived from its expected mark. */
export function defaultDraftFieldSize(
  kind: DraftFieldKind,
  signer: DraftMarkSigner,
): { width: number; height: number } {
  if (kind === "DATE_SIGNED") {
    const height = Math.ceil(DATE_FONT_SIZE / 0.55);
    const size = dateSignedFontSize(height);
    return {
      width: clampWidth(
        kind,
        helveticaDateWidth(DATE_SIGNED_SAMPLE, size) + 2 * HORIZONTAL_PADDING,
      ),
      height,
    };
  }
  const target = kind === "INITIALS" ? INITIALS_FONT_SIZE : SIGNATURE_FONT_SIZE;
  const height = typedHeightForFontSize(target);
  const size = typedSignatureFontSize(height);
  const text = expectedDraftMarkText(kind, signer);
  return {
    width: clampWidth(
      kind,
      caveatTextWidth(text, size) + 2 * HORIZONTAL_PADDING,
    ),
    height,
  };
}

export const DATE_SIGNED_DEFAULT_SIZE = defaultDraftFieldSize("DATE_SIGNED", {
  fullName: "",
});

/** A checkmark box sized for a typical form checkbox. */
export const CHECKMARK_DEFAULT_SIZE = { width: 12, height: 12 };

const PRINTED_NAME_HEIGHT = 16;
const PRINTED_NAME_WIDTH_BOUNDS = { min: 60, max: 260 };

/** Default box for manager-prepared content (Printed Name sized to the name). */
export function defaultPreparedContentSize(
  type: PreparedContentType,
  fullName: string,
): { width: number; height: number } {
  if (type === "CHECKMARK") return CHECKMARK_DEFAULT_SIZE;
  const size = resolveFieldFontSize({
    configuredFontSize: null,
    boxHeightPdf: PRINTED_NAME_HEIGHT,
    isMultiline: false,
    scale: 1,
  });
  const width = approximateHelveticaWidth(fullName.trim() || "Printed Name", size) * 1.1;
  return {
    width: Math.min(
      PRINTED_NAME_WIDTH_BOUNDS.max,
      Math.max(PRINTED_NAME_WIDTH_BOUNDS.min, Math.ceil(width + 2 * HORIZONTAL_PADDING)),
    ),
    height: PRINTED_NAME_HEIGHT,
  };
}
