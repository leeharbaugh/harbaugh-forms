/**
 * Server-only Caveat font loader for typed packet-form signatures.
 *
 * NEVER import this module from Client Components or any file that is part of
 * the browser bundle. Browser downloads must use `lib/signature-font.ts`
 * (fetch of `/fonts/Caveat-Regular.ttf`) instead.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadCaveatSignatureFontBytesServer(): Promise<Uint8Array | null> {
  try {
    const fontPath = path.join(
      process.cwd(),
      "public",
      "fonts",
      "Caveat-Regular.ttf",
    );
    const buffer = await readFile(fontPath);
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}
