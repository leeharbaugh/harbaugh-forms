/** Browser-safe Caveat font loader for typed packet-form signatures. */

/** TrueType / OpenType sfnt version tags (big-endian). */
export function looksLikeSfntFont(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === "OTTO" || tag === "true" || tag === "typ1") return true;
  // Classic TrueType: 0x00010000
  return (
    bytes[0] === 0x00 &&
    bytes[1] === 0x01 &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x00
  );
}

export async function loadCaveatSignatureFontBytes(): Promise<Uint8Array | null> {
  try {
    const response = await fetch("/fonts/Caveat-Regular.ttf");
    if (!response.ok) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Auth proxy used to redirect unauthenticated /fonts/*.ttf to HTML login.
    // Reject non-font payloads so pdf-lib does not try to embed HTML.
    if (!looksLikeSfntFont(bytes)) {
      console.error(
        "Caveat font fetch did not return a TrueType/OpenType file; refusing to embed.",
      );
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}
