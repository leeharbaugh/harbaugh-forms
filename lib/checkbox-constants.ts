/** Visible checkbox size used for all on-screen and PDF overlay rendering. */
export const CHECKBOX_VISUAL_SIZE_PX = 14;

/** Checkmark graphic fills ~85% of the visual box (Acrobat-style). */
export const CHECKBOX_CHECKMARK_FILL_RATIO = 0.85;
export const CHECKBOX_CHECKMARK_SIZE_PX = Math.round(
  CHECKBOX_VISUAL_SIZE_PX * CHECKBOX_CHECKMARK_FILL_RATIO,
);

/**
 * Stored mapping width/height for checkbox placements. Rendering ignores saved
 * values and uses CHECKBOX_VISUAL_SIZE_PX instead; keep at 12 to avoid changing
 * existing mapping rows.
 */
export const CHECKBOX_MAPPING_SIZE_PX = 12;
