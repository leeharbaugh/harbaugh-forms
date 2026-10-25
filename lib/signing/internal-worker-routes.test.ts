import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { DEVICE_HANDOFF_LOCK_COOKIE_NAME } from "./device-handoff-lock";
import {
  isInternalSigningWorkerPath,
  SIGNING_CRON_WORKER_PATH,
  SIGNING_WORKER_PATH,
} from "./internal-worker-routes";

const NOT_EXEMPT = [
  "/api/internal",
  "/api/internal/",
  "/api/internal/cron",
  "/api/internal/cron/signing-worker/",
  "/api/internal/cron/signing-worker/extra",
  "/api/internal/signing-worker/",
  "/api/internal/signing-worker/run",
  "/api/internal/signing-workers",
  "/API/internal/signing-worker",
  "/api/internal/other",
  "/api/sign/entry-exchange",
  "/signings",
  "/admin/signing-controls",
  "/",
];

describe("internal Signing worker routes", () => {
  it("matches exactly the Cron and worker paths", () => {
    assert.equal(isInternalSigningWorkerPath(SIGNING_CRON_WORKER_PATH), true);
    assert.equal(isInternalSigningWorkerPath(SIGNING_WORKER_PATH), true);
    for (const path of NOT_EXEMPT) {
      assert.equal(isInternalSigningWorkerPath(path), false, path);
    }
  });

  it("names the same paths as the route files and the Vercel Cron schedule", () => {
    const root = process.cwd();
    const crons = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")).crons as { path: string }[];
    assert.deepEqual(crons.map((c) => c.path), [SIGNING_CRON_WORKER_PATH]);
    readFileSync(join(root, "app", SIGNING_CRON_WORKER_PATH, "route.ts"), "utf8");
    readFileSync(join(root, "app", SIGNING_WORKER_PATH, "route.ts"), "utf8");
  });

  it("exempts them before any session or cookie handling in the proxy", () => {
    const proxy = readFileSync(join(process.cwd(), "lib/supabase/proxy.ts"), "utf8");
    const exemption = proxy.indexOf("if (isInternalSigningWorkerPath(path))");
    assert.ok(exemption > 0);
    assert.ok(exemption < proxy.indexOf("DEVICE_HANDOFF_LOCK_COOKIE_NAME)"));
    assert.ok(exemption < proxy.indexOf("createServerClient("));
    assert.ok(exemption < proxy.indexOf('url.pathname = "/auth/login"'));
  });
});

describe("proxy behavior for internal Signing worker routes", () => {
  const saved: Record<string, string | undefined> = {};
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  let updateSession: (request: NextRequest) => Promise<Response>;

  before(async () => {
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) saved[key] = process.env[key];
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ewxsxwzezhkeawnjvigx.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_only";
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("no network in tests");
    }) as typeof fetch;
    ({ updateSession } = await import("../supabase/proxy"));
  });

  after(() => {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("passes the exact paths to their handlers without a login redirect or session work", async () => {
    for (const [method, path] of [
      ["GET", SIGNING_CRON_WORKER_PATH],
      ["POST", SIGNING_CRON_WORKER_PATH],
      ["POST", SIGNING_WORKER_PATH],
      ["GET", SIGNING_WORKER_PATH],
    ] as const) {
      fetchCalls = 0;
      const request = new NextRequest(`https://forms.example.test${path}`, {
        method,
        headers: { cookie: `sb-ewxsxwzezhkeawnjvigx-auth-token=stale; ${DEVICE_HANDOFF_LOCK_COOKIE_NAME}=1` },
      });
      const response = await updateSession(request);
      assert.equal(response.headers.get("location"), null, `${method} ${path}`);
      assert.equal(response.headers.get("x-middleware-next"), "1", `${method} ${path}`);
      assert.equal(response.headers.get("set-cookie"), null, `${method} ${path}`);
      assert.equal(fetchCalls, 0, `${method} ${path}`);
    }
  });

  it("still sends every other unauthenticated request, including near-miss paths, to login", async () => {
    for (const path of NOT_EXEMPT.filter((p) => !p.startsWith("/api/sign/"))) {
      const response = await updateSession(new NextRequest(`https://forms.example.test${path}`));
      const location = response.headers.get("location");
      assert.ok(location, path);
      assert.match(new URL(location).pathname, /^\/auth\/login\/?$/, path);
    }
  });
});
