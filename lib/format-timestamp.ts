/**
 * Deterministic timestamp display for SSR-rendered UI.
 *
 * Server (Vercel, UTC) and browser must produce identical text for the initial
 * hydration tree, so the zone is fixed rather than taken from the runtime, and
 * the string is assembled from parts so ICU spacing differences between Node
 * and browsers (e.g. U+202F before AM/PM) cannot leak into the output.
 */

export const DISPLAY_TIME_ZONE = "America/Chicago";

const EMPTY = "—";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

/** e.g. "10/1/2026, 9:16:05 PM CDT"; "—" for empty input. */
export function formatTimestamp(
  value: string | null | undefined,
  options: { invalid?: "empty" | "raw" } = {},
): string {
  if (!value) {
    return EMPTY;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return options.invalid === "raw" ? value : EMPTY;
  }
  const parts = partsFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("month")}/${part("day")}/${part("year")}, ${part("hour")}:${part("minute")}:${part("second")} ${part("dayPeriod")} ${part("timeZoneName")}`;
}
