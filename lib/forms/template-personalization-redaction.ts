/**
 * Removes downloader-personalized overlay text (for example a member footer added by a forms
 * website) from a template PDF. Only text blocks drawn directly in a page's top-level content
 * stream are eligible; the imported form pages (Form XObjects) are never edited. Removal is real:
 * the BT…ET operators and their strings are deleted from the stream and the stream object is
 * rewritten in place, so the text is not merely hidden. A white rectangle replaces each removed
 * block's box. Any match outside an eligible block, or any residual match after redaction, aborts.
 *
 * Patterns are supplied by the caller (kept outside the repository); this module holds no
 * personal data.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
} from "pdf-lib";

export type RedactionBlock = {
  page: number;
  streamRef: string;
  text: string;
  box: { x: number; y: number; width: number; height: number };
};

export type TemplateRedactionReport = {
  pageCount: number;
  removedBlocks: RedactionBlock[];
  /** Matches that are not removable top-level overlay blocks (XObjects, annotations, metadata). */
  blockedMatches: string[];
  unsupported: string[];
};

type Token = { kind: "op" | "operand"; value: string; start: number; end: number };

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set("()<>[]{}/%".split("").map((c) => c.charCodeAt(0)));

/** Minimal PDF content-stream lexer: operators and operand tokens with source offsets. */
export function tokenizeContentStream(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (WHITESPACE.has(c)) { i++; continue; }
    const start = i;
    if (c === 0x25 /* % */) { while (i < n && src[i] !== "\n" && src[i] !== "\r") i++; continue; }
    if (c === 0x28 /* ( */) {
      let depth = 0;
      while (i < n) {
        const ch = src[i];
        if (ch === "\\") { i += 2; continue; }
        if (ch === "(") depth++;
        else if (ch === ")") { depth--; if (depth === 0) { i++; break; } }
        i++;
      }
      tokens.push({ kind: "operand", value: src.slice(start, i), start, end: i });
      continue;
    }
    if (c === 0x3c /* < */) {
      if (src[i + 1] === "<") { i += 2; tokens.push({ kind: "operand", value: "<<", start, end: i }); continue; }
      while (i < n && src[i] !== ">") i++;
      i++;
      tokens.push({ kind: "operand", value: src.slice(start, i), start, end: i });
      continue;
    }
    if (c === 0x3e /* > */ && src[i + 1] === ">") { i += 2; tokens.push({ kind: "operand", value: ">>", start, end: i }); continue; }
    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) { i++; tokens.push({ kind: "operand", value: src[start], start, end: i }); continue; }
    if (c === 0x2f /* / */) {
      i++;
      while (i < n && !WHITESPACE.has(src.charCodeAt(i)) && !DELIMITERS.has(src.charCodeAt(i))) i++;
      tokens.push({ kind: "operand", value: src.slice(start, i), start, end: i });
      continue;
    }
    while (i < n && !WHITESPACE.has(src.charCodeAt(i)) && !DELIMITERS.has(src.charCodeAt(i))) i++;
    if (i === start) i++;
    const word = src.slice(start, i);
    const numeric = /^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) || word === "true" || word === "false" || word === "null";
    tokens.push({ kind: numeric ? "operand" : "op", value: word, start, end: i });
  }
  return tokens;
}

/** Decode a literal `( … )` or hex `< … >` string operand to latin1 text. */
export function decodeStringOperand(token: string): string {
  if (token.startsWith("<")) {
    const hex = token.slice(1, -1).replace(/\s+/g, "");
    let out = "";
    for (let i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2).padEnd(2, "0"), 16));
    return out;
  }
  const body = token.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== "\\") { out += ch; continue; }
    const next = body[++i];
    if (next === undefined) break;
    const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
    if (next in map) { out += map[next]; continue; }
    if (next === "\r" || next === "\n") { if (next === "\r" && body[i + 1] === "\n") i++; continue; }
    if (/[0-7]/.test(next)) {
      let oct = next;
      while (oct.length < 3 && /[0-7]/.test(body[i + 1] ?? "")) oct += body[++i];
      out += String.fromCharCode(parseInt(oct, 8) & 0xff);
      continue;
    }
    out += next;
  }
  return out;
}

type TextBlock = { start: number; end: number; text: string };

/** Top-level BT…ET blocks with the text they show. Throws on inline images. */
export function findTextBlocks(src: string): TextBlock[] {
  const tokens = tokenizeContentStream(src);
  const blocks: TextBlock[] = [];
  let open: { start: number; parts: string[] } | null = null;
  let operands: Token[] = [];
  for (const t of tokens) {
    if (t.kind === "operand") { operands.push(t); continue; }
    if (t.value === "BI") throw new Error("inline image in content stream (unsupported)");
    if (t.value === "BT") open = { start: t.start, parts: [] };
    else if (t.value === "ET" && open) { blocks.push({ start: open.start, end: t.end, text: open.parts.join("") }); open = null; }
    else if (open && (t.value === "Tj" || t.value === "TJ" || t.value === "'" || t.value === '"')) {
      for (const o of operands) if (o.value.startsWith("(") || (o.value.startsWith("<") && o.value !== "<<")) open.parts.push(decodeStringOperand(o.value));
    }
    operands = [];
  }
  return blocks;
}

function decodeStream(stream: PDFRawStream): string {
  return Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function pageContentRefs(doc: PDFDocument, pageIndex: number): PDFRef[] {
  const contents = doc.getPage(pageIndex).node.get(PDFName.of("Contents"));
  if (contents instanceof PDFRef) {
    const resolved = doc.context.lookup(contents);
    if (resolved instanceof PDFArray) return resolved.asArray().filter((r): r is PDFRef => r instanceof PDFRef);
    return [contents];
  }
  if (contents instanceof PDFArray) return contents.asArray().filter((r): r is PDFRef => r instanceof PDFRef);
  return [];
}

function objectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 32) return;
  if (value instanceof PDFString || value instanceof PDFHexString) out.push(value.decodeText(), value.asString());
  else if (value instanceof PDFName) out.push(value.decodeText());
  else if (value instanceof PDFArray) value.asArray().forEach((v) => objectStrings(v, out, depth + 1));
  else if (value instanceof PDFDict) value.entries().forEach(([, v]) => objectStrings(v, out, depth + 1));
}

/** Every string, name and decodable stream in the file, for residual-match checks. */
export function findPatternOccurrences(doc: PDFDocument, patterns: RegExp[], skip = new Set<string>()): string[] {
  const hits: string[] = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (skip.has(ref.toString())) continue;
    const strings: string[] = [];
    if (obj instanceof PDFRawStream) {
      let decoded = "";
      try { decoded = decodeStream(obj); } catch { decoded = Buffer.from(obj.contents).toString("latin1"); }
      strings.push(decoded);
      // Shown text in content streams may be hex-encoded; decode it too.
      try { strings.push(...findTextBlocks(decoded).map((b) => b.text)); } catch { /* not a content stream */ }
      objectStrings(obj.dict, strings);
    } else objectStrings(obj, strings);
    if (strings.some((s) => matchesAny(s, patterns))) hits.push(`object ${ref.toString()}`);
  }
  return hits;
}

function normalizePatterns(patterns: RegExp[]): RegExp[] {
  return patterns.map((p) => new RegExp(p.source, p.flags.replace(/[gy]/g, "")));
}

type TextBox = { str: string; x: number; y: number; width: number; size: number };

async function pageTextBoxes(bytes: Uint8Array): Promise<TextBox[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: Uint8Array.from(bytes), verbosity: 0 }).promise;
  const pages: TextBox[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(
      (content.items as { str?: string; transform?: number[]; width?: number }[])
        .filter((it) => it.str && it.transform)
        .map((it) => ({ str: it.str!, x: it.transform![4], y: it.transform![5], width: it.width ?? 0, size: Math.abs(it.transform![3]) })),
    );
  }
  return pages;
}

export async function extractedTextMatches(bytes: Uint8Array, rawPatterns: RegExp[]): Promise<string[]> {
  const patterns = normalizePatterns(rawPatterns);
  const pages = await pageTextBoxes(bytes);
  const hits: string[] = [];
  pages.forEach((items, i) => items.forEach((it) => { if (matchesAny(it.str, patterns)) hits.push(`page ${i + 1}`); }));
  return hits;
}

/**
 * Remove matching top-level overlay text blocks. Dry run (`apply: false`) returns the report only.
 * Returns `bytes: null` when nothing matched or anything blocks a safe removal.
 */
export async function redactTemplatePersonalization(
  input: Uint8Array,
  options: { patterns: RegExp[]; apply?: boolean; whiteout?: boolean; padding?: number },
): Promise<{ bytes: Uint8Array | null; report: TemplateRedactionReport }> {
  if (options.patterns.length === 0) throw new Error("at least one pattern is required");
  const patterns = normalizePatterns(options.patterns);
  const padding = options.padding ?? 1;
  const doc = await PDFDocument.load(input, { updateMetadata: false });
  const report: TemplateRedactionReport = { pageCount: doc.getPageCount(), removedBlocks: [], blockedMatches: [], unsupported: [] };
  const textBoxes = await pageTextBoxes(input);
  const edits = new Map<string, { ref: PDFRef; stream: PDFRawStream; src: string; blocks: { start: number; end: number; box: RedactionBlock["box"] }[] }>();

  for (let p = 0; p < doc.getPageCount(); p++) {
    for (const ref of pageContentRefs(doc, p)) {
      const stream = doc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const src = decodeStream(stream);
      let blocks: TextBlock[];
      try { blocks = findTextBlocks(src); } catch (e) {
        if (matchesAny(src, patterns)) report.unsupported.push(`page ${p + 1} ${ref.toString()}: ${(e as Error).message}`);
        continue;
      }
      for (const block of blocks.filter((b) => matchesAny(b.text, patterns))) {
        const box = textBoxes[p]?.find((t) => t.str === block.text || t.str.replace(/\s+/g, " ").trim() === block.text.replace(/\s+/g, " ").trim());
        if (!box) { report.unsupported.push(`page ${p + 1} ${ref.toString()}: no rendered position for a matching block`); continue; }
        const rect = { x: box.x - padding, y: box.y - box.size * 0.3 - padding, width: box.width + 2 * padding, height: box.size * 1.3 + 2 * padding };
        const key = ref.toString();
        const entry = edits.get(key) ?? { ref, stream, src, blocks: [] };
        if (!entry.blocks.some((b) => b.start === block.start)) entry.blocks.push({ start: block.start, end: block.end, box: rect });
        edits.set(key, entry);
        report.removedBlocks.push({ page: p + 1, streamRef: key, text: block.text, box: rect });
      }
    }
  }

  // Shared content streams are edited once; anything matching outside those blocks blocks the run.
  const prospective = new Map<string, string>();
  for (const [key, e] of edits) {
    let out = e.src;
    for (const b of [...e.blocks].sort((a, z) => z.start - a.start)) {
      const fill = options.whiteout === false ? "" : `q 1 1 1 rg ${b.box.x.toFixed(3)} ${b.box.y.toFixed(3)} ${b.box.width.toFixed(3)} ${b.box.height.toFixed(3)} re f Q`;
      out = `${out.slice(0, b.start)}${fill}${out.slice(b.end)}`;
    }
    if (matchesAny(out, patterns)) report.blockedMatches.push(`stream ${key}: matching text remains outside removable blocks`);
    prospective.set(key, out);
  }
  report.blockedMatches.push(...findPatternOccurrences(doc, patterns, new Set(edits.keys())));

  if (!options.apply || report.removedBlocks.length === 0 || report.blockedMatches.length || report.unsupported.length) {
    return { bytes: null, report };
  }

  for (const [key, e] of edits) {
    const extraKeys = e.stream.dict.keys().map((k) => k.asString()).filter((k) => !["/Length", "/Filter", "/DecodeParms"].includes(k));
    if (extraKeys.length) throw new Error(`content stream ${key} has unexpected dictionary keys ${extraKeys.join(",")}`);
    // Same object number: no orphaned copy of the original stream remains in the saved file.
    doc.context.assign(e.ref, doc.context.flateStream(Buffer.from(prospective.get(key)!, "latin1")));
  }

  const bytes = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
  const residual = await extractedTextMatches(bytes, patterns);
  const reloaded = await PDFDocument.load(bytes, { updateMetadata: false });
  const rawResidual = findPatternOccurrences(reloaded, patterns);
  if (residual.length || rawResidual.length) {
    throw new Error(`redaction verification failed: extracted=${residual.join(",")} raw=${rawResidual.join(",")}`);
  }
  return { bytes, report };
}
