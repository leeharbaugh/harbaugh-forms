/**
 * Remove downloader-personalized overlay text from a template PDF (local files only; no database
 * or Storage access).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/redact-template-personalization.ts \
 *     --in original.pdf --patterns private-patterns.json [--out redacted.pdf] [--no-whiteout]
 *
 * The patterns file (kept outside the repository) is a JSON array of regular-expression sources.
 * Without --out it is a dry run. Output never prints the matched text.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { redactTemplatePersonalization } from "@/lib/forms/template-personalization-redaction";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const mask = (s: string) => `${s.slice(0, 3)}… (${s.length} chars)`;

async function main() {
  const input = arg("--in");
  const patternsFile = arg("--patterns");
  const output = arg("--out");
  if (!input || !patternsFile) throw new Error("--in and --patterns are required");
  const sources = JSON.parse(readFileSync(patternsFile, "utf8").replace(/^\uFEFF/, "")) as string[];
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("patterns file must be a non-empty JSON array");
  const bytes = readFileSync(input);
  console.log(`input sha256=${sha256(bytes)} bytes=${bytes.length}`);

  const { bytes: out, report } = await redactTemplatePersonalization(bytes, {
    patterns: sources.map((s) => new RegExp(s, "i")),
    apply: Boolean(output),
    whiteout: !process.argv.includes("--no-whiteout"),
  });
  console.log(`pages=${report.pageCount} removable blocks=${report.removedBlocks.length} blocked=${report.blockedMatches.length} unsupported=${report.unsupported.length}`);
  for (const b of report.removedBlocks) {
    console.log(`  page ${b.page} ${b.streamRef} ${b.mode} text=${mask(b.text)} box=[${b.box.x.toFixed(1)}, ${b.box.y.toFixed(1)}, ${b.box.width.toFixed(1)} x ${b.box.height.toFixed(1)}]`);
  }
  report.blockedMatches.forEach((m) => console.log(`  BLOCKED ${m}`));
  report.unsupported.forEach((m) => console.log(`  UNSUPPORTED ${m}`));
  if (!output) { console.log("dry run: no file written"); return; }
  if (!out) { console.log("NOT WRITTEN: nothing removable, or a blocked/unsupported match"); process.exit(2); }
  writeFileSync(output, out);
  console.log(`output sha256=${sha256(out)} bytes=${out.length} (verified: no pattern in extracted text or raw objects)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
