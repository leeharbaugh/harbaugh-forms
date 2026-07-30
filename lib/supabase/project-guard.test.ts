import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALLOW_PRODUCTION_APP_ENV,
  DEV_SUPABASE_PROJECT_REF,
  PROD_SUPABASE_PROJECT_REF,
  assertAppSupabaseTargetAllowed,
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
        ),
      /production Supabase project/,
    );
    restoreEnv();
  });
});
