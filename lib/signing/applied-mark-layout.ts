/**
 * Where an applied mark's text sits inside its stored field box, in PDF points
 * from the box's top-left. The ceremony overlay draws from this, and the
 * completed-PDF renderer uses the same font-size and placement rules, so the
 * participant sees the whole mark exactly as finalization will draw it.
 */
import {
  caveatTextWidth,
  draftMarkFontSize,
  helveticaDateWidth,
  type DraftFieldKind,
} from "./draft-field-sizing";

export type AppliedMarkLayout = {
  fontSize: number;
  /** Left edge of the text. */
  x: number;
  /** Text baseline, from the box top. */
  baseline: number;
  textWidth: number;
};

export function appliedMarkLayout(
  kind: DraftFieldKind,
  text: string,
  box: { width: number; height: number },
): AppliedMarkLayout {
  const value = text.trim();
  const fontSize = draftMarkFontSize(kind, value, box);
  const baseline = fontSize + 1;
  if (kind === "DATE_SIGNED") {
    const textWidth = helveticaDateWidth(value, fontSize);
    return { fontSize, x: Math.max(0, (box.width - textWidth) / 2), baseline, textWidth };
  }
  return { fontSize, x: 0, baseline, textWidth: caveatTextWidth(value, fontSize) };
}
