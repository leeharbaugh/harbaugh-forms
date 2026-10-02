import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

/** Browser PDF viewer entry points: need DOMMatrix, canvas, and workers. */
const BROWSER_VIEWER_MODULES = ["react-pdf", "pdfjs-dist", "lib/pdfjs-setup"];

function routeEntries(directory: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(join(root, directory))) {
    const path = join(directory, name);
    if (statSync(join(root, path)).isDirectory()) {
      entries.push(...routeEntries(path));
    } else if (/^(page|layout|route)\.tsx?$/.test(name)) {
      entries.push(path);
    }
  }
  return entries;
}

function resolveLocal(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = specifier.slice(2);
  else if (specifier.startsWith(".")) base = join(dirname(fromFile), specifier);
  else return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    const path = join(root, candidate);
    if (existsSync(path) && statSync(path).isFile()) return relative(root, path);
  }
  return null;
}

/**
 * Static value imports only: `import type` is erased and `import()` inside
 * `next/dynamic(..., { ssr: false })` is a client-only chunk boundary.
 */
function staticImports(source: string): string[] {
  const specifiers: string[] = [];
  const pattern =
    /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\sfrom\s*)?["']([^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) {
    if (!match[1]) specifiers.push(match[2]);
  }
  return specifiers;
}

/** Files reachable from `entries` whose static imports hit a browser viewer module. */
function serverGraphViewerImports(entries: string[]): string[] {
  const seen = new Set<string>();
  const offenders: string[] = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of staticImports(read(file))) {
      const normalized = specifier.replace(/^@\//, "");
      if (BROWSER_VIEWER_MODULES.some((name) => normalized === name || normalized.startsWith(`${name}/`))) {
        offenders.push(`${file} -> ${specifier}`);
      }
      const local = resolveLocal(file, specifier);
      if (local && /\.(ts|tsx)$/.test(local)) queue.push(local);
    }
  }
  return offenders;
}

describe("Browser PDF viewer / server module boundary", () => {
  const entries = routeEntries("app");

  it("keeps the browser PDF viewer out of every route's server-rendered graph", () => {
    assert.ok(entries.includes(join("app", "signings", "[signingId]", "page.tsx")));
    assert.ok(entries.includes(join("app", "sign", "ceremony", "page.tsx")));
    assert.deepEqual(serverGraphViewerImports(entries), []);
  });

  it("detects a static viewer import (guards the graph walk itself)", () => {
    const offenders = serverGraphViewerImports([
      join("components", "signings", "signing-preview-dialog.tsx"),
    ]);
    assert.ok(offenders.some((line) => line.endsWith("-> react-pdf")));
  });

  it("loads Prepare Documents client-only and only once it is first opened", () => {
    const dashboard = read("components/signings/signing-dashboard-page.tsx");
    assert.doesNotMatch(dashboard, /^import .*signing-preview-dialog/m);
    assert.match(
      dashboard,
      /dynamic\(\s*\(\) =>\s*import\("@\/components\/signings\/signing-preview-dialog"\)[\s\S]*?\{ ssr: false \}/,
    );
    assert.match(dashboard, /\{workspaceMounted \? \(\s*<SigningPreviewDialog/);
  });
});
