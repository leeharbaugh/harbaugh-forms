/**
 * Manager-prepared document content. Placed during Draft preparation and baked
 * into the prepared document version at activation. Never a signer field, a
 * signing action, an adopted mark, or participant evidence; creates no
 * readiness or progress requirement.
 */
export const PREPARED_CONTENT_TYPES = ["PRINTED_NAME", "CHECKMARK"] as const;

export type PreparedContentType = (typeof PREPARED_CONTENT_TYPES)[number];

export function isPreparedContentType(value: unknown): value is PreparedContentType {
  return value === "PRINTED_NAME" || value === "CHECKMARK";
}

/** Printed Name belongs to a participant (it shows their name); Checkmark does not. */
export function preparedContentNeedsParticipant(type: PreparedContentType): boolean {
  return type === "PRINTED_NAME";
}

export function preparedContentTypeLabel(type: PreparedContentType): string {
  return type === "PRINTED_NAME" ? "Printed Name" : "Checkmark";
}
