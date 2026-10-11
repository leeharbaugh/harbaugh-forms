/** Width of the docked Your fields column (Tailwind `20rem`). */
export const CEREMONY_FIELDS_PANEL_WIDTH_PX = 320;

/** Narrowest document column we accept beside a docked Your fields panel. */
export const CEREMONY_MIN_DOCUMENT_WIDTH_PX = 704;

export const CEREMONY_DOCK_MIN_WIDTH_PX =
  CEREMONY_FIELDS_PANEL_WIDTH_PX + CEREMONY_MIN_DOCUMENT_WIDTH_PX;

export type CeremonyFieldsPanelMode = "docked" | "drawer";

/**
 * Docked vs drawer from the shell's own measured width (not a viewport media
 * query), so the panel and its toggle can never disagree and leave a range
 * where the panel is neither on screen nor reachable.
 */
export function ceremonyFieldsPanelMode(shellWidth: number): CeremonyFieldsPanelMode {
  return Number.isFinite(shellWidth) && shellWidth >= CEREMONY_DOCK_MIN_WIDTH_PX
    ? "docked"
    : "drawer";
}
