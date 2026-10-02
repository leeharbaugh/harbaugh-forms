import type { CeremonyFieldView } from "./ceremony-context";

/**
 * Date Signed shown beside each applied Signature in the ceremony.
 *
 * The date is recorded on the linked DATE_SIGNED placement, never on the
 * Signature placement, so it must be read through `linkedSignatureFieldId`.
 */
export function linkedDateSignedBySignatureField(
  fields: readonly CeremonyFieldView[],
): Map<string, string> {
  const dates = new Map<string, string>();
  for (const field of fields) {
    if (
      field.fieldType === "DATE_SIGNED" &&
      field.linkedSignatureFieldId &&
      field.placementId &&
      field.renderedSenderLocalDate
    ) {
      dates.set(field.linkedSignatureFieldId, field.renderedSenderLocalDate);
    }
  }
  return dates;
}
