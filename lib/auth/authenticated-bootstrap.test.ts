import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PROD_SUPABASE_PROJECT_REF,
  assertAppSupabaseTargetAllowed,
} from "../supabase/project-guard.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function applicationSources(relativeDirectory: string): string[] {
  const directory = join(root, relativeDirectory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      return applicationSources(relativePath);
    }
    if (
      ![".ts", ".tsx"].includes(extname(entry.name)) ||
      entry.name.endsWith(".test.ts")
    ) {
      return [];
    }
    return [relativePath];
  });
}

describe("authenticated application bootstrap", () => {
  it("allows the deployed public Supabase URL without browser-only Vercel variables", () => {
    assert.doesNotThrow(() =>
      assertAppSupabaseTargetAllowed(
        `https://${PROD_SUPABASE_PROJECT_REF}.supabase.co`,
        "browser",
      ),
    );
  });

  it("signs in, validates the session and profile, then redirects", () => {
    const action = readRepo("app/auth/actions.ts");
    const signIn = action.indexOf("signInWithPassword");
    const getUser = action.indexOf("supabase.auth.getUser()", signIn);
    const profile = action.indexOf('.from("profiles")', getUser);
    const redirect = action.indexOf('redirect("/")', profile);

    assert.ok(signIn > 0);
    assert.ok(getUser > signIn);
    assert.ok(profile > getUser);
    assert.ok(redirect > profile);
  });

  it("persists refreshed auth cookies in server actions and middleware", () => {
    const serverClient = readRepo("lib/supabase/server.ts");
    const proxyClient = readRepo("lib/supabase/proxy.ts");

    assert.match(serverClient, /cookieStore\.set\(name, value, options\)/);
    assert.match(proxyClient, /supabaseResponse\.cookies\.set\(name, value, options\)/);
    assert.match(proxyClient, /supabase\.auth\.getClaims\(\)/);
  });

  it("resolves active Global Admin access from the authenticated profile", () => {
    const adminNav = readRepo("components/admin-nav-link.tsx");
    assert.match(adminNav, /supabase\.auth\.getUser\(\)/);
    assert.match(adminNav, /app_role, status, onboarding_status/);
    assert.match(adminNav, /profile\.app_role !== "ADMIN"/);
    assert.match(adminNav, /profile\.status !== "ACTIVE"/);
    assert.match(adminNav, /profile\.onboarding_status !== "ACTIVE"/);
  });

  it("does not couple login or initial application rendering to audit writes", () => {
    for (const path of [
      "app/auth/actions.ts",
      "app/page.tsx",
      "components/app-nav.tsx",
      "components/ensure-profile.tsx",
      "components/admin-nav-link.tsx",
      "components/auth-button.tsx",
    ]) {
      assert.doesNotMatch(readRepo(path), /@\/lib\/audit\//, path);
    }
  });

  it("contains no live application query for removed audit, office, or TREC columns", () => {
    const removedColumns = [
      "brokerage_office_id",
      "audit_events.brokerage_office_id",
      "trec_license_type",
      "trec_reported_full_name",
      "trec_license_status",
      "license_verification_source",
      "broker_trec_license_type",
      "broker_license_verification_source",
    ];
    const sources = ["app", "components", "lib"].flatMap(applicationSources);

    for (const path of sources) {
      const source = readRepo(path);
      for (const column of removedColumns) {
        assert.equal(source.includes(column), false, `${path}: ${column}`);
      }
    }
  });
});
