import assert from "node:assert/strict";
import { describe, it } from "node:test";
import config from "../next.config";

type Rule = { source: string; headers: Array<{ key: string; value: string }> };

/** Next.js applies every matching rule in order; the last one wins per header key. */
async function effectiveHeaders(path: string, nodeEnv = "production") {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = nodeEnv;
  try {
    const rules = (await config.headers!()) as Rule[];
    const result = new Map<string, string>();
    for (const rule of rules) {
      if (!matches(rule.source, path)) continue;
      for (const header of rule.headers) result.set(header.key.toLowerCase(), header.value);
    }
    return result;
  } finally {
    env.NODE_ENV = previous;
  }
}

/** The config only uses `/:path*` and `/<prefix>/:path*` sources. */
function matches(source: string, path: string): boolean {
  if (source === "/:path*") return true;
  const prefix = source.replace(/\/:path\*$/, "");
  return path === prefix || path.startsWith(`${prefix}/`);
}

describe("security headers (H-1)", () => {
  it("only uses source patterns the matcher above models", async () => {
    const rules = (await config.headers!()) as Rule[];
    for (const rule of rules) assert.match(rule.source, /^\/(?:[a-z-]+\/)*:path\*$/, rule.source);
    assert.equal(rules[0].source, "/:path*", "the site-wide rule must come first");
  });

  it("sends nosniff and denies framing on workspace, auth, admin and API routes", async () => {
    for (const path of ["/", "/auth/login", "/auth/confirm", "/packets/12", "/forms/53/editor", "/signings/abc", "/admin/users", "/settings", "/api/internal/signing-worker", "/pdf.worker.min.mjs"]) {
      const headers = await effectiveHeaders(path);
      assert.equal(headers.get("x-content-type-options"), "nosniff", path);
      assert.equal(headers.get("x-frame-options"), "DENY", path);
      assert.equal(headers.get("content-security-policy"), "frame-ancestors 'none'", path);
    }
  });

  it("keeps the full /sign CSP, which also denies framing", async () => {
    for (const path of ["/sign/abc", "/sign/ceremony", "/sign/package/artifact/x"]) {
      const headers = await effectiveHeaders(path);
      const csp = headers.get("content-security-policy") ?? "";
      assert.match(csp, /^default-src 'none'; script-src 'self' 'unsafe-inline'; /, path);
      assert.match(csp, /frame-ancestors 'none'/, path);
      assert.doesNotMatch(csp, /unsafe-eval/, path);
      assert.equal(headers.get("x-content-type-options"), "nosniff", path);
      assert.equal(headers.get("x-frame-options"), "DENY", path);
      assert.equal(headers.get("referrer-policy"), "no-referrer", path);
      assert.equal(headers.get("cache-control"), "no-store", path);
    }
    assert.match((await effectiveHeaders("/sign/abc", "development")).get("content-security-policy") ?? "", /'unsafe-eval'/);
  });

  it("denies framing of the participant exchange APIs without changing their other headers", async () => {
    const headers = await effectiveHeaders("/api/sign/entry-exchange");
    assert.equal(headers.get("content-security-policy"), "frame-ancestors 'none'");
    assert.equal(headers.get("x-content-type-options"), "nosniff");
    assert.equal(headers.get("referrer-policy"), "no-referrer");
    assert.equal(headers.get("cache-control"), "no-store");
  });

  it("leaves the private workspace cache headers in place", async () => {
    const headers = await effectiveHeaders("/packets/12");
    assert.equal(headers.get("cache-control"), "no-store, no-cache, must-revalidate, private");
    assert.equal(headers.get("pragma"), "no-cache");
  });
});
