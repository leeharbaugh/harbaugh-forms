/**
 * Browser QA: Logout → Login account switch must not stick on "Logging in...".
 *
 *   PLAYWRIGHT_BROWSERS_PATH=... NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-auth-account-switch-browser.ts
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { createRuntimeNoiseGuard } from "./qa-runtime-noise.ts";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const PRODUCTION_REF = "eetonalyyyssvkyfdoxh";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";

class QaFailure extends Error {}
function fail(message: string): never {
  throw new QaFailure(message);
}
function ok(message: string) {
  console.log(`OK: ${message}`);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  if (!url.includes(EXPECTED_REF) || url.includes(PRODUCTION_REF)) fail(`Refusing outside development: ${url}`);
  const admin = createClient(url, (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stamp = Date.now();
  const password = `SwitchQa-${randomUUID()}!aA1`;
  const users: { id: string; email: string; label: string }[] = [];

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const noise = createRuntimeNoiseGuard();
  noise.watch(page, "switch");

  async function createUser(label: string) {
    const email = `switch-qa-${label}-${stamp}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) fail(error?.message ?? "user");
    await admin.from("profiles").upsert({
      id: data.user.id,
      email,
      status: "ACTIVE",
      app_role: "USER",
      onboarding_status: "ACTIVE",
      display_name: `Switch ${label}`,
      first_name: label,
      must_change_password: false,
    });
    users.push({ id: data.user.id, email, label });
    return { id: data.user.id, email, label };
  }

  async function magicLogin(email: string) {
    const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error || !link.properties?.hashed_token) fail("generateLink failed");
    await page.goto(
      `${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent("/")}`,
      { waitUntil: "networkidle" },
    );
    if (page.url().includes("/auth/")) fail(`auth failed: ${page.url()}`);
  }

  async function logoutViaUi() {
    await page.getByRole("button", { name: "Logout" }).click();
    await page.waitForURL(/\/auth\/login/, { timeout: 30000 });
  }

  async function assertLoginIdle(context: string) {
    const button = page.getByRole("button", { name: /^Login$|^Logging in\.\.\.$/ });
    await button.waitFor({ timeout: 15000 });
    const text = (await button.innerText()).trim();
    if (text !== "Login") fail(`${context}: button reads "${text}" before submit`);
    if (await button.isDisabled()) fail(`${context}: Login disabled before submit`);
  }

  async function passwordLogin(email: string, context: string) {
    await assertLoginIdle(context);
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await assertLoginIdle(`${context} after typing`);
    await page.getByRole("button", { name: "Login" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/auth/login"), { timeout: 60000 });
    if (page.url().includes("/auth/login")) fail(`${context}: stayed on login`);
  }

  try {
    const a = await createUser("Ada");
    const b = await createUser("Bea");
    ok("created disposable users Ada and Bea");

    await magicLogin(a.email);
    ok("Ada signed in (magic link)");

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await logoutViaUi();
      await assertLoginIdle(`cycle ${cycle} after logout`);
      await passwordLogin(b.email, `cycle ${cycle} Bea`);
      ok(`cycle ${cycle}: Ada→logout→Bea without reload`);

      await logoutViaUi();
      await assertLoginIdle(`cycle ${cycle} after Bea logout`);
      await passwordLogin(a.email, `cycle ${cycle} Ada`);
      ok(`cycle ${cycle}: Bea→logout→Ada without reload`);
    }

    // Soft back/forward: leave login pending-free after history nav.
    await logoutViaUi();
    await assertLoginIdle("before back/forward");
    await page.goBack({ waitUntil: "networkidle" }).catch(() => undefined);
    await page.goForward({ waitUntil: "networkidle" }).catch(() => undefined);
    if (!page.url().includes("/auth/login")) {
      await page.goto(`${APP_ORIGIN}/auth/login`, { waitUntil: "networkidle" });
    }
    await assertLoginIdle("after back/forward to login");
    ok("login stays idle after history navigation");

    const issues = noise.issues();
    if (issues.length > 0) fail(`unexpected runtime noise:\n${issues.join("\n")}`);
    ok("no browser console errors/warnings, page errors, or server ERROR/WARN lines");
    console.log("\nAccount-switch browser QA: all checks passed.");
  } finally {
    await browser.close();
    for (const user of users) {
      await admin.from("profiles").delete().eq("id", user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
    console.log("Cleanup complete.");
  }
}

main().catch((error) => {
  console.error(error instanceof QaFailure ? `FAIL: ${error.message}` : error);
  process.exit(1);
});
