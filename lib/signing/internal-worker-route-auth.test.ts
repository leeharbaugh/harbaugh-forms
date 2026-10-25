import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, before, describe, it } from "node:test";

// Next.js aliases `server-only` to this empty module for server code; plain Node has no such package.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "server-only" ? "next/dist/compiled/server-only/empty.js" : specifier, context);
  },
});

const CRON = "cron-secret-for-tests-0123456789abcdef";
const WORKER = "worker-secret-for-tests-0123456789abcd";
const ORIGIN = "https://forms.example.test";

type Handler = (request: Request) => Promise<Response>;
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let fetchCalls = 0;
let cronGet: Handler;
let cronPost: () => Promise<Response>;
let workerPost: Handler;
let workerGet: () => Promise<Response>;

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in saved)) saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://ewxsxwzezhkeawnjvigx.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test_only",
  CRON_SECRET: CRON,
  SIGNING_WORKER_SECRET: WORKER,
  NATIVE_SIGNING_ENABLED: undefined,
  SIGNING_WORK_SUSPENDED: undefined,
  VERCEL_ENV: undefined,
};

async function expectUnauthorized(response: Response, label: string) {
  assert.equal(response.status, 401, label);
  assert.equal(response.headers.get("location"), null, label);
  assert.deepEqual(await response.json(), { error: "Unauthorized" }, label);
}

async function expectStatus(response: Response, status: string, label: string) {
  assert.equal(response.status, 503, label);
  const body = (await response.json()) as { status?: string; processed?: unknown[]; processedCount?: number };
  assert.equal(body.status, status, label);
  assert.equal(body.processedCount ?? body.processed?.length ?? 0, 0, label);
}

const cron = (headers: Record<string, string> = {}) =>
  cronGet(new Request(`${ORIGIN}/api/internal/cron/signing-worker`, { headers }));
const worker = (headers: Record<string, string> = {}) =>
  workerPost(
    new Request(`${ORIGIN}/api/internal/signing-worker`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: "{}",
    }),
  );

describe("internal Signing worker route authentication", () => {
  before(async () => {
    setEnv(baseEnv);
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("no network in tests");
    }) as typeof fetch;
    ({ GET: cronGet, POST: cronPost } = await import("../../app/api/internal/cron/signing-worker/route"));
    ({ POST: workerPost, GET: workerGet } = await import("../../app/api/internal/signing-worker/route"));
  });

  after(() => {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("Cron route: missing, wrong, or misplaced secrets get 401", async () => {
    setEnv(baseEnv);
    await expectUnauthorized(await cron(), "no Authorization header");
    await expectUnauthorized(await cron({ authorization: "Bearer wrong" }), "wrong secret");
    await expectUnauthorized(await cron({ authorization: `Bearer ${WORKER}` }), "worker secret as Cron bearer");
    await expectUnauthorized(await cron({ authorization: CRON }), "no Bearer prefix");
    await expectUnauthorized(await cron({ authorization: `Basic ${CRON}` }), "wrong scheme");
    await expectUnauthorized(await cron({ "x-signing-worker-secret": CRON }), "Cron secret in the worker header");
    setEnv({ CRON_SECRET: undefined });
    await expectUnauthorized(await cron({ authorization: "Bearer " }), "server secret unset, empty bearer");
    await expectUnauthorized(await cron({ authorization: `Bearer ${CRON}` }), "server secret unset");
    setEnv({ CRON_SECRET: "   " });
    await expectUnauthorized(await cron({ authorization: "Bearer    " }), "server secret blank");
    assert.equal(fetchCalls, 0);
  });

  it("Cron route: the correct secret reaches the worker, which honors feature-off and suspension", async () => {
    setEnv(baseEnv);
    await expectStatus(await cron({ authorization: `Bearer ${CRON}` }), "FEATURE_DISABLED", "feature off");
    setEnv({ NATIVE_SIGNING_ENABLED: "true", SIGNING_WORK_SUSPENDED: "true" });
    await expectStatus(await cron({ authorization: `Bearer ${CRON}` }), "SUSPENDED", "work suspended");
    assert.equal((await cronPost()).status, 405);
    assert.equal(fetchCalls, 0);
  });

  it("worker route: missing, wrong, or misplaced secrets get 401", async () => {
    setEnv(baseEnv);
    await expectUnauthorized(await worker(), "no secret header");
    await expectUnauthorized(await worker({ "x-signing-worker-secret": "wrong" }), "wrong secret");
    await expectUnauthorized(await worker({ "x-signing-worker-secret": "" }), "empty secret");
    await expectUnauthorized(await worker({ "x-signing-worker-secret": CRON }), "Cron secret as worker secret");
    await expectUnauthorized(await worker({ authorization: `Bearer ${WORKER}` }), "worker secret as a bearer");
    setEnv({ SIGNING_WORKER_SECRET: undefined });
    await expectUnauthorized(await worker({ "x-signing-worker-secret": WORKER }), "server secret unset");
    assert.equal(fetchCalls, 0);
  });

  it("worker route: the correct secret reaches the worker, which honors feature-off and suspension", async () => {
    setEnv(baseEnv);
    await expectStatus(await worker({ "x-signing-worker-secret": WORKER }), "FEATURE_DISABLED", "feature off");
    setEnv({ NATIVE_SIGNING_ENABLED: "true", SIGNING_WORK_SUSPENDED: "true" });
    await expectStatus(await worker({ "x-signing-worker-secret": WORKER }), "SUSPENDED", "work suspended");
    assert.equal((await workerGet()).status, 405);
    assert.equal(fetchCalls, 0);
  });
});
