/**
 * Date Signed annotation helpers (Fill Form).
 * Stores a calendar date formatted for display — not a timezone timestamp.
 */

export const DATE_SIGNED_FORMATS = [
  "MM/DD/YYYY",
  "M/D/YYYY",
  "Month D, YYYY",
] as const;

export type DateSignedFormat = (typeof DATE_SIGNED_FORMATS)[number];

export const DEFAULT_DATE_SIGNED_FORMAT: DateSignedFormat = "MM/DD/YYYY";

export const PACKET_FORM_DATE_FONT_ID = "helvetica";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Local calendar YYYY-MM-DD (browser/user timezone for the default only). */
export function localCalendarDateIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidCalendarDateIso(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === day
  );
}

export function parseCalendarDateIso(value: string): {
  year: number;
  month: number;
  day: number;
} | null {
  if (!isValidCalendarDateIso(value)) return null;
  const [year, month, day] = value.trim().split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

export function formatDateSigned(
  isoDate: string,
  format: DateSignedFormat = DEFAULT_DATE_SIGNED_FORMAT,
): string {
  const parts = parseCalendarDateIso(isoDate);
  if (!parts) {
    throw new Error("Invalid calendar date. Use YYYY-MM-DD.");
  }
  const { year, month, day } = parts;
  switch (format) {
    case "MM/DD/YYYY":
      return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`;
    case "M/D/YYYY":
      return `${month}/${day}/${year}`;
    case "Month D, YYYY":
      return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
    default: {
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}

export function isDateSignedFormat(value: string): value is DateSignedFormat {
  return (DATE_SIGNED_FORMATS as readonly string[]).includes(value);
}

/** Default placement box for a date annotation (PDF points). */
export function defaultDateSignedSize(text: string): {
  width: number;
  height: number;
} {
  const length = Math.max(8, text.trim().length);
  return {
    width: Math.min(200, Math.max(72, length * 7.5)),
    height: 18,
  };
}
