/** Human-readable PDF filename for folder saves (preserves spaces). */
export function sanitizeHumanPdfFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const withoutExtension = trimmed.replace(/\.pdf$/i, "");
  const sanitized = withoutExtension
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const safeBase = sanitized || "form";
  return `${safeBase}.pdf`;
}

export function buildSortablePacketFormFileName(
  index: number,
  documentName: string,
  contactNames?: string | null,
): string {
  const order = String(index + 1).padStart(2, "0");
  const baseName = documentName.trim() || "Form";
  const contactSuffix =
    contactNames?.trim() && contactNames !== "Unnamed packet"
      ? ` - ${contactNames.trim()}`
      : "";
  return sanitizeHumanPdfFileName(`${order} - ${baseName}${contactSuffix}`);
}
