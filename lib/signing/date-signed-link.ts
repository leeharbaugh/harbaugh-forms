/**
 * Date Signed linkage. A Date Signed shows the server acceptance time of one
 * linked source field: a Signature or an Initials for the same participant on
 * the same Signing revision. A Signature auto-pairs a Date Signed when placed;
 * Initials never do — the manager links a Date Signed to Initials on purpose.
 */
export const DATE_SIGNED_SOURCE_TYPES: readonly string[] = ["SIGNATURE", "INITIALS"];

export function isDateSignedSourceType(fieldType: unknown): boolean {
  return typeof fieldType === "string" && DATE_SIGNED_SOURCE_TYPES.includes(fieldType);
}
