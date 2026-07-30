import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALLOW_PRODUCTION_APP_ENV,
  DEV_SUPABASE_PROJECT_REF,
  PROD_SUPABASE_PROJECT_REF,
  assertAppSupabaseTargetAllowed,
  detectAppSupabaseRuntime,
  extractSupabaseProjectRef,
} from "./project-guard.ts";

describe("extractSupabaseProjectRef", () => {
  it("parses project refs from supabase URLs", () => {
    assert.equal(
      extractSupabaseProjectRef(
        `https://${DEV_SUPABASE_PROJECT_REF}.supabase.co`,
      ),
      DEV_SUPABASE_PROJECT_REF,
    );
    assert.equal(
      extractSupabaseProjectRef(
        `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co/`,
      ),
      PROD_SUPABASE_PROJECT_REF,
    );
    assert.equal(extractSupabaseProjectRef("not-a-url"), null);
  });
});

describe("assertAppSupabaseTargetAllowed", () => {
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalAllow = process.env[ALLOW_PRODUCTION_APP_ENV];

  function restoreEnv() {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }
    if (originalAllow === undefined) {
      delete process.env[ALLOW_PRODUCTION_APP_ENV];
    } else {
      process.env[ALLOW_PRODUCTION_APP_ENV] = originalAllow;
    }
  }

  it("allows development URLs everywhere", () => {
    delete process.env.VERCEL_ENV;
    delete process.env[ALLOW_PRODUCTION_APP_ENV];
    assert.doesNotThrow(() =>
      assertAppSupabaseTargetAllowed(
        `https://${DEV_SUPABASE_PROJECT_REF}.supabase.co`,
      ),
    );
    restoreEnv();
  });

  it("rejects production URLs for local/feature processes", () => {
    delete process.env.VERCEL_ENV;
    delete process.env[ALLOW_PRODUCTION_APP_ENV];
    assert.throws(
      () =>
        assertAppSupabaseTargetAllowed(
          `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co`,
          "server",
        ),
      /production Supabase project/,
    );
    restoreEnv();
  });

  it("allows production URLs on Vercel Production", () => {
    process.env.VERCEL_ENV = "production";
    delete process.env[ALLOW_PRODUCTION_APP_ENV];
    assert.doesNotThrow(() =>
      assertAppSupabaseTargetAllowed(
        `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co`,
        "server",
      ),
    );
    restoreEnv();
  });

  it("rejects production URLs on Vercel Preview", () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env[ALLOW_PRODUCTION_APP_ENV];
    assert.throws(
      () =>
        assertAppSupabaseTargetAllowed(
          `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co`,
          "server",
        ),
      /production Supabase project/,
    );
    restoreEnv();
  });

  it("allows the production public URL in browser runtime", () => {
    delete process.env.VERCEL_ENV;
    delete process.env[ALLOW_PRODUCTION_APP_ENV];
    assert.doesNotThrow(() =>
      assertAppSupabaseTargetAllowed(
        `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co`,
        "browser",
      ),
    );
    restoreEnv();
  });

  it("does not require server-only Vercel variables in a browser", () => {
    delete process.env.VERCEL_ENV;
    delete process.env[ALLOW_PRODUCTION_APP_ENV];
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    });
    try {
      assert.equal(detectAppSupabaseRuntime(), "browser");
      assert.doesNotThrow(() =>
        assertAppSupabaseTargetAllowed(
          `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co`,
        ),
      );
    } finally {
      Reflect.deleteProperty(globalThis, "window");
      restoreEnv();
    }
  });
});

describe("detectAppSupabaseRuntime", () => {
  it("detects the Node test process as server runtime", () => {
    assert.equal(detectAppSupabaseRuntime(), "server");
  });
});
