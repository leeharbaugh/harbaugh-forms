/**
 * Presentation of the stored electronic-records disclosure. The stored
 * `body_text` is the evidence (its SHA-256 is what consent records); this only
 * lays it out. Blocks are separated by blank lines. A block whose first line is
 * short and has no ending punctuation is a section heading; lines starting
 * with "- " are list items.
 */

export type DisclosureBlock = {
  heading: string | null;
  paragraphs: string[];
  bullets: string[];
};

const HEADING_MAX_LENGTH = 60;

function isHeadingLine(line: string): boolean {
  return (
    line.length > 0 &&
    line.length <= HEADING_MAX_LENGTH &&
    !line.startsWith("- ") &&
    !/[.:;,!?)"]$/.test(line)
  );
}

export function parseDisclosureBlocks(bodyText: string): DisclosureBlock[] {
  return bodyText
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines) => {
      const heading = lines.length > 1 && isHeadingLine(lines[0]) ? lines[0] : null;
      const rest = heading ? lines.slice(1) : lines;
      return {
        heading,
        paragraphs: rest.filter((line) => !line.startsWith("- ")),
        bullets: rest.filter((line) => line.startsWith("- ")).map((line) => line.slice(2)),
      };
    });
}

/** The exact stored text, labeled with its version and fingerprint, for download or print. */
export function disclosureDownloadText(disclosure: {
  title: string;
  versionKey: string;
  contentSha256: string;
  bodyText: string;
}): string {
  return [
    disclosure.title,
    `Version: ${disclosure.versionKey}`,
    `SHA-256: ${disclosure.contentSha256}`,
    "",
    disclosure.bodyText,
    "",
  ].join("\n");
}

export function disclosureDownloadFilename(versionKey: string): string {
  return `${versionKey.replace(/[^\w.-]+/g, "-")}.txt`;
}

/** The affirmative consent statement shown next to the (unchecked) checkbox. */
export const CONSENT_ACKNOWLEDGEMENT =
  "I have read this disclosure, I can view it on this device, and I agree to use electronic records and electronic signatures for this Signing.";
