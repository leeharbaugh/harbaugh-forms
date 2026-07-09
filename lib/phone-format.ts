const MAX_PHONE_DIGITS = 10;

/** Strip non-numeric characters, drop a leading US country code, and cap at 10 digits. */
export function normalizePhoneDigits(value: string): string {
  let digits = value.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  return digits.slice(0, MAX_PHONE_DIGITS);
}

/** Format up to 10 digits as XXX-XXX-XXXX while typing. */
export function formatUSPhoneNumber(digits: string): string {
  const normalized = normalizePhoneDigits(digits);

  if (normalized.length === 0) {
    return "";
  }

  if (normalized.length <= 3) {
    return normalized;
  }

  if (normalized.length <= 6) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  }

  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

/** Normalize and format a phone input value for storage and display. */
export function formatPhoneInput(value: string): string {
  return formatUSPhoneNumber(value);
}
