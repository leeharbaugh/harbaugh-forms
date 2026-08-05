/** Browser-safe Caveat font loader for typed packet-form signatures. */

export async function loadCaveatSignatureFontBytes(): Promise<Uint8Array | null> {
  try {
    const response = await fetch("/fonts/Caveat-Regular.ttf");
    if (!response.ok) {
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}
