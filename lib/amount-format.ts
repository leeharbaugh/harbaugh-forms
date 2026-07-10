/** Strip to digits only (whole-number amounts). */
export function normalizeAmountDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Format a whole-number amount with comma separators (no currency symbol).
 * Examples: "450000" → "450,000", "1000000" → "1,000,000"
 *
 * Intermediate typing states stay natural: empty stays empty; leading zeros
 * collapse once another digit is present.
 */
export function formatWholeNumberAmount(value: string): string {
  const digits = normalizeAmountDigits(value);
  if (!digits) {
    return "";
  }

  const normalized = digits.replace(/^0+(?=\d)/, "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format an amount input for storage and display.
 * Defaults to whole-number comma formatting (no "$").
 * If the raw value includes a decimal point, keeps up to two fractional digits
 * and still comma-formats the integer part.
 */
export function formatAmountInput(value: string): string {
  const raw = value.replace(/[^\d.]/g, "");
  if (!raw) {
    return "";
  }

  const firstDot = raw.indexOf(".");
  if (firstDot === -1) {
    return formatWholeNumberAmount(raw);
  }

  const intRaw = raw.slice(0, firstDot);
  const fracRaw = raw.slice(firstDot + 1).replace(/\D/g, "").slice(0, 2);
  const intFormatted = formatWholeNumberAmount(intRaw === "" ? "0" : intRaw);

  // Preserve a trailing decimal while the user is still typing fractional digits.
  if (raw.endsWith(".") && fracRaw === "") {
    return `${intFormatted}.`;
  }

  return `${intFormatted}.${fracRaw}`;
}
