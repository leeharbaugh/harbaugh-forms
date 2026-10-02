/**
 * Browser QA: admin pages hydrate without React errors (React #418).
 *
 * Disposable development admin only (own organization + user, cleaned up in
 * `finally`). Run against a local server whose process timezone differs from
 * the browser's, the way Vercel (UTC) differs from agents' browsers:
 *
 *   npm run build:validate (NATIVE_SIGNING_ENABLED=false)
 *   TZ=UTC NATIVE_SIGNING_ENABLED=false npx next start -p 3300
 *     (serve with the same NATIVE_SIGNING_ENABLED as the build; a mismatch
 *     makes the prerendered nav shell disagree with request-time renders)
 *   PLAYWRIGHT_BROWSERS_PATH=... NODE_PATH=_audit_tmp/pw-deps/node_modules \
 *     npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-admin-hydration-browser.ts
 *
 * Fails on any browser console error/warning or page error on hard load,
 * reload, direct URL entry, client-side navigation, and back/forward.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { randomUUID } from "node:crypto";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const ORIGIN = process.env.QA_ORIGIN?.trim() || "http://localhost:3300";
const BROWSER_TZ = process.env.QA_BROWSER_TZ?.trim() || "America/Chicago";
const ROUTES = ["/admin/users", "/admin/organizations", "/admin/audit"] as const;

let failures = 0;
const ok = (message: string) => console.log(`OK: ${message}`);
const bad = (message: string) => {
  failures += 1;
  console.log(`FAIL: ${message}`);
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url.includes(EXPECTED_REF)) throw new Error(`Refusing outside development: ${url}`);
  const admin = createClient(url, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const email = `admin-hydration-qa-${stamp}@example.com`;
  let userId = "";
  let organizationId = "";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: BROWSER_TZ });
  const page = await context.newPage();
  const latencyMs = Number(process.env.QA_LATENCY_MS || 0);
  if (latencyMs > 0) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: latencyMs,
      downloadThroughput: 200 * 1024,
      uploadThroughput: 100 * 1024,
    });
  }
  let phase = "setup";
  const issues: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      issues.push(`[${phase}] console.${message.type()}: ${message.text().slice(0, 1500)}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`[${phase}] pageerror: ${error.message.slice(0, 1500)}`));

  async function settle(p: Page) {
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.waitForTimeout(500);
  }

  function check(label: string) {
    const mine = issues.filter((issue) => issue.startsWith(`[${label}]`));
    if (mine.length === 0) ok(`${label}: no console errors/warnings or page errors`);
    else {
      bad(`${label}: ${mine.length} browser issue(s)`);
      mine.forEach((issue) => console.log(`  ${issue}`));
    }
  }

  try {
    const { data: org } = await admin
      .from("organizations")
      .insert({ name: `Admin Hydration QA ${stamp}`, status: "ACTIVE" })
      .select("id")
      .single();
    organizationId = org!.id as string;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: `AdminHydration-${randomUUID()}!aA1`,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(error?.message ?? "createUser");
    userId = created.user.id;
    await admin.from("profiles").upsert({
      id: userId,
      email,
      status: "ACTIVE",
      app_role: "ADMIN",
      onboarding_status: "ACTIVE",
      display_name: "Admin Hydration QA",
      first_name: "Admin",
      last_name: "Hydration",
      primary_organization_id: organizationId,
      must_change_password: false,
    });
    await admin.from("organization_members").insert({
      organization_id: organizationId,
      user_id: userId,
      membership_role: "MEMBER",
      status: "ACTIVE",
    });

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link.properties?.hashed_token) throw new Error("generateLink failed");
    await page.goto(
      `${ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent("/")}`,
      { waitUntil: "domcontentloaded" },
    );
    await settle(page);
    if (new URL(page.url()).pathname !== "/") throw new Error(`sign-in landed on ${page.url()}`);
    ok(`signed in as disposable dev admin (browser timezone ${BROWSER_TZ})`);
    issues.length = 0;

    for (const route of ROUTES) {
      phase = `hard load ${route}`;
      const res = await page.goto(`${ORIGIN}${route}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      if (res?.status() !== 200 || new URL(page.url()).pathname !== route) {
        bad(`${route}: HTTP ${res?.status()} at ${new URL(page.url()).pathname}`);
      }
      check(phase);

      phase = `reload ${route}`;
      await page.reload({ waitUntil: "domcontentloaded" });
      await settle(page);
      check(phase);
    }

    phase = "hard load /admin/users/[id]";
    await page.goto(`${ORIGIN}/admin/users/${userId}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const detailText = await page.locator("body").innerText();
    if (/\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2}:\d{2} [AP]M C[DS]T/.test(detailText)) {
      ok("user detail shows Central-time timestamps with zone label");
    } else {
      bad("user detail timestamps missing explicit Central-time format");
    }
    check(phase);

    phase = "direct /admin";
    await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded" });
    await settle(page);
    if (new URL(page.url()).pathname === "/admin/users") ok("/admin redirects to /admin/users");
    else bad(`/admin landed on ${new URL(page.url()).pathname}`);
    check(phase);

    await page.evaluate(() => ((window as unknown as { __noReload?: boolean }).__noReload = true));
    for (const route of ["/admin/organizations", "/admin/audit", "/admin/users"]) {
      phase = `client nav ${route}`;
      await page.locator(`a[href="${route}"]:visible`).first().click();
      await page.waitForURL((u) => u.pathname === route, { timeout: 30000 });
      await settle(page);
      const kept = await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload === true);
      if (!kept) bad(`${phase}: full document reload`);
      check(phase);
    }

    phase = "back/forward";
    await page.goBack({ waitUntil: "domcontentloaded" });
    await settle(page);
    const back = new URL(page.url()).pathname;
    await page.goForward({ waitUntil: "domcontentloaded" });
    await settle(page);
    const forward = new URL(page.url()).pathname;
    if (back === "/admin/audit" && forward === "/admin/users") ok("back/forward between admin routes");
    else bad(`back/forward landed on ${back} then ${forward}`);
    check(phase);
  } finally {
    await browser.close();
    if (userId) {
      await admin.from("organization_members").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    console.log("Cleanup complete.");
  }

  console.log(failures === 0 ? "ADMIN HYDRATION QA PASSED" : `ADMIN HYDRATION QA FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
