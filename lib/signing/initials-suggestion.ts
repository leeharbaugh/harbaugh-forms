/**
 * Suggested typed initials from a displayed Signing name. Pure (no server
 * dependencies) so the ceremony and Prepare Documents share one algorithm.
 */

const NAME_PREFIX_TOKENS = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mx",
  "dr",
  "prof",
  "sir",
  "dame",
]);

const NAME_SUFFIX_TOKENS = new Set([
  "jr",
  "sr",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
  "esq",
  "phd",
  "md",
  "jd",
]);

function normalizeNameToken(token: string): string {
  return token.replace(/\.$/, "").toLowerCase();
}

function firstUnicodeLetter(segment: string): string | null {
  const match = segment.match(/\p{L}/u);
  return match ? match[0]!.toUpperCase() : null;
}

/**
 * Suggested typed initials from the displayed Signing name (editable by the
 * participant; not validated for equality on adoption).
 */
export function suggestTypedInitialsFromDisplayName(displayName: string): string {
  try {
    const collapsed = displayName.trim().replace(/\s+/g, " ");
    if (!collapsed) return "";

    const initials: string[] = [];
    for (const token of collapsed.split(" ")) {
      const trimmed = token.trim();
      if (!trimmed) continue;

      const normalized = normalizeNameToken(trimmed);
      if (NAME_PREFIX_TOKENS.has(normalized)) continue;
      if (NAME_SUFFIX_TOKENS.has(normalized)) continue;

      const segments = trimmed.split("-");
      for (const segment of segments) {
        const letter = firstUnicodeLetter(segment);
        if (letter) initials.push(letter);
      }
    }
    return initials.join("");
  } catch {
    return "";
  }
}
