/**
 * Client-safe text for the Draft "Added from the source Packet" notice.
 * Entries are read defensively (a name string or an entry with `fullName`)
 * and anything else is dropped, so an object is never stringified into the
 * notice.
 */

/** Display name of one notice entry, or null when it has none. */
export function autoAddNoticeEntryName(entry: unknown): string | null {
  const raw =
    typeof entry === "string"
      ? entry
      : entry && typeof entry === "object" && "fullName" in entry
        ? (entry as { fullName: unknown }).fullName
        : null;
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name === "" ? null : name;
}

/** "A", "A and B", "A, B and C". */
export function joinDisplayNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Full notice sentence, or null when no entry has a name to show. */
export function formatAutoAddNotice(entries: readonly unknown[]): string | null {
  const names = entries
    .map(autoAddNoticeEntryName)
    .filter((name): name is string => name !== null);
  return names.length === 0
    ? null
    : `Added from the source Packet: ${joinDisplayNames(names)}.`;
}
