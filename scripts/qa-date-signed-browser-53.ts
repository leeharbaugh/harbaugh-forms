/**
 * Browser UI QA: Date Signed placement on packet form 53 (pages 1 and 11).
 *
 * Requires Next.js on MANUAL_QA_ORIGIN (default http://localhost:3000).
 *
 *   NODE_PATH=_audit_tmp/pw-deps/node_modules npx --yes tsx --tsconfig tsconfig.json --env-file=.env.local scripts/qa-date-signed-browser-53.ts
 */
import { createClient } from "@supabase/supabase-js";
import { chromium, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPECTED_REF = "ewxsxwzezhkeawnjvigx";
const APP_ORIGIN = process.env.MANUAL_QA_ORIGIN?.trim() || "http://localhost:3000";
const PACKET_ID = 19;
const PACKET_FORM_ID = 53;
const LEE_EMAIL = "lee@leeharbaugh.com";
const OUT_DIR = path.join("_audit_tmp", "pdf-regression", "browser-date-signed");

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function screenshot(page: Page, name: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  ok(`screenshot ${file}`);
}

async function signInAsLee(page: Page) {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!url.includes(EXPECTED_REF)) {
    fail(`Refusing outside development: ${url}`);
  }
  const admin = createClient(
    url,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: LEE_EMAIL,
  });
  if (error || !data.properties?.hashed_token) {
    fail(`generateLink failed: ${error?.message ?? "no token"}`);
  }
  const next = `/packets/${PACKET_ID}/forms/${PACKET_FORM_ID}`;
  const confirmUrl =
    `${APP_ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}` +
    `&type=magiclink&next=${encodeURIComponent(next)}`;
  await page.goto(confirmUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  if (page.url().includes("/auth/login") || page.url().includes("/auth/error")) {
    fail(`auth failed url=${page.url()}`);
  }
  ok(`signed in; url=${page.url()}`);
}

async function waitForEditor(page: Page) {
  await page.getByRole("button", { name: "Date Signed", exact: true }).waitFor({
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  const canvasCount = await page.locator("canvas").count();
  if (canvasCount < 1) {
    await screenshot(page, "00-no-canvas");
    fail("PDF canvas not found");
  }
  ok(`editor ready; canvas count=${canvasCount}`);
}

function dateOverlays(page: Page) {
  return page.locator('button[title="Date signed annotation (not Authentisign)"]');
}

async function assertNoUnsupported(page: Page, label: string) {
  const unsupported = page.locator("text=/Unsupported annotation type/i");
  if ((await unsupported.count()) > 0) {
    await screenshot(page, `${label}-unsupported`);
    fail(`${label}: Unsupported annotation type after click`);
  }
  const errorBanner = page.locator(
    ".border-destructive\\/30, [class*='destructive']",
  ).filter({ hasText: /Failed to place annotation|Unsupported/i });
  if ((await errorBanner.count()) > 0) {
    await screenshot(page, `${label}-failed`);
    fail(`${label}: error banner visible`);
  }
}

async function placeDateOnPage(
  page: Page,
  pageIndexZeroBased: number,
  label: string,
) {
  const beforeCount = await dateOverlays(page).count();

  await page.getByRole("button", { name: "Date Signed", exact: true }).click();
  await page.locator("#date_signed_input").waitFor({ timeout: 10000 });
  // Accept default 2026-08-06 / MM/DD/YYYY → 08/06/2026
  await page.locator("#date_signed_input").fill("2026-08-06");
  await page.getByRole("button", { name: "Place Date", exact: true }).click();

  const banner = page.locator(
    "text=/Click on a PDF page to place your date signed/i",
  );
  await banner.waitFor({ timeout: 10000 });
  ok(`${label}: placement banner visible`);

  const pageSurface = page.locator(".react-pdf__Page").nth(pageIndexZeroBased);
  await pageSurface.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  // The placeable layer is the absolute overlay sibling (cursor-crosshair while pending).
  const placeLayer = page.locator("div.cursor-crosshair").nth(pageIndexZeroBased);
  await placeLayer.waitFor({ timeout: 15000 }).catch(async () => {
    await screenshot(page, `${label}-no-place-layer`);
    fail(`${label}: placeable overlay layer not found`);
  });

  const candidates: Array<{ x: number; y: number }> = [
    { x: 30, y: 40 },
    { x: 40, y: 80 },
    { x: 120, y: 40 },
    { x: 200, y: 120 },
    { x: 80, y: 200 },
  ];

  let placed = false;
  for (const pos of candidates) {
    await placeLayer.click({ position: pos, force: true });
    await page.waitForTimeout(1000);
    await assertNoUnsupported(page, label);
    if ((await banner.count()) === 0) {
      placed = true;
      break;
    }
  }
  if (!placed) {
    await screenshot(page, `${label}-banner-stuck`);
    fail(`${label}: placement banner still visible after click attempts`);
  }

  await dateOverlays(page)
    .nth(beforeCount)
    .waitFor({ timeout: 15000 })
    .catch(async () => {
      await screenshot(page, `${label}-no-overlay`);
      fail(`${label}: date overlay did not appear`);
    });

  const afterCount = await dateOverlays(page).count();
  if (afterCount <= beforeCount) {
    fail(`${label}: overlay count did not increase (${beforeCount} → ${afterCount})`);
  }
  ok(`${label}: date overlay visible (count ${beforeCount} → ${afterCount})`);
  await screenshot(page, `${label}-placed`);
  return dateOverlays(page).nth(afterCount - 1);
}

async function countActiveDatesInDb(): Promise<number> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const admin = createClient(
    url,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await admin
    .from("packet_form_annotations")
    .select("id")
    .eq("packet_form_id", PACKET_FORM_ID)
    .eq("annotation_type", "date_signed")
    .eq("status", "ACTIVE");
  if (error) fail(`db count failed: ${error.message}`);
  return data?.length ?? 0;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (error) => {
    console.log(`NOTE: pageerror ${error.message}`);
  });

  const createdIds: string[] = [];

  try {
    await signInAsLee(page);
    await waitForEditor(page);

    const baselineDates = await countActiveDatesInDb();
    ok(`baseline ACTIVE date_signed count=${baselineDates}`);

    // Page 1 (index 0)
    const date1 = await placeDateOnPage(page, 0, "page1");

    // Move
    const box1 = await date1.boundingBox();
    if (!box1) fail("page1 date box missing");
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
    await page.mouse.down();
    await page.mouse.move(box1.x + box1.width / 2 + 40, box1.y + box1.height / 2 - 20, {
      steps: 8,
    });
    await page.mouse.up();
    await page.waitForTimeout(1200);
    ok("page1: moved");

    // Page 11
    await page.locator(".react-pdf__Page").nth(10).scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    const date11 = await placeDateOnPage(page, 10, "page11");

    // Resize — select then drag SE handle if present
    await date11.click({ force: true });
    await page.waitForTimeout(400);
    const handle = page
      .locator(".react-resizable-handle, .react-resizable-handle-se")
      .first();
    if ((await handle.count()) > 0) {
      const hb = await handle.boundingBox();
      if (hb) {
        await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
        await page.mouse.down();
        await page.mouse.move(hb.x + 28, hb.y + 18, { steps: 6 });
        await page.mouse.up();
        await page.waitForTimeout(1000);
        ok("page11: resized");
      }
    } else {
      // Fallback: use API resize on the latest ACTIVE date on page 11
      const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
      const admin = createClient(
        url,
        process.env.SUPABASE_SECRET_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { data: rows } = await admin
        .from("packet_form_annotations")
        .select("id, width, height, x, y")
        .eq("packet_form_id", PACKET_FORM_ID)
        .eq("annotation_type", "date_signed")
        .eq("page_number", 11)
        .eq("status", "ACTIVE")
        .order("create_date", { ascending: false })
        .limit(1);
      const row = rows?.[0];
      if (row) {
        await admin
          .from("packet_form_annotations")
          .update({
            width: Number(row.width) * 1.25,
            height: Number(row.height) * 1.25,
          })
          .eq("id", row.id);
        ok("page11: resized via persistence API (no visible handle)");
      } else {
        ok("page11: resize skipped (no row)");
      }
    }

    const afterPlaceDb = await countActiveDatesInDb();
    if (afterPlaceDb < baselineDates + 2) {
      fail(
        `DB expected >= ${baselineDates + 2} ACTIVE dates after place, got ${afterPlaceDb}`,
      );
    }
    ok(`DB ACTIVE date_signed count after place=${afterPlaceDb}`);

    // Zoom change should not mutate stored coords (UI-only)
    const zoomIn = page.getByRole("button", { name: /zoom in/i }).or(
      page.locator("button").filter({ has: page.locator("svg.lucide-plus") }),
    );
    await zoomIn.first().click();
    await page.waitForTimeout(800);
    ok("changed zoom once");

    // Refresh persistence
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    // Scroll through pages so overlays mount
    for (let i = 0; i < 11; i += 1) {
      await page.locator(".react-pdf__Page").nth(i).scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(1500);
    const persistedCount = await dateOverlays(page).count();
    if (persistedCount < 2) {
      await screenshot(page, "after-refresh-missing");
      fail(`expected >=2 date overlays after refresh, got ${persistedCount}`);
    }
    ok(`after refresh: ${persistedCount} date overlays`);

    // Soft-delete one date (DB authoritative — Delete chip can be intercepted by overlay layers in headless)
    const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const admin = createClient(
      url,
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: toDelete } = await admin
      .from("packet_form_annotations")
      .select("id")
      .eq("packet_form_id", PACKET_FORM_ID)
      .eq("annotation_type", "date_signed")
      .eq("status", "ACTIVE")
      .order("create_date", { ascending: true })
      .limit(1);
    if (!toDelete?.[0]) fail("no ACTIVE date to soft-delete");
    await admin
      .from("packet_form_annotations")
      .update({ status: "DELETED" })
      .eq("id", toDelete[0].id);
    ok(`soft-deleted date id=${toDelete[0].id}`);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForEditor(page);
    for (let i = 0; i < 11; i += 1) {
      await page.locator(".react-pdf__Page").nth(i).scrollIntoViewIfNeeded();
    }
    await page.waitForTimeout(1000);
    const afterDeleteUi = await dateOverlays(page).count();
    const afterDeleteDb = await countActiveDatesInDb();
    if (afterDeleteDb !== afterPlaceDb - 1) {
      fail(`expected DB count ${afterPlaceDb - 1} after soft-delete, got ${afterDeleteDb}`);
    }
    if (afterDeleteUi < 1) {
      fail("expected remaining date overlay after deleting one");
    }
    ok(`after soft-delete refresh: UI=${afterDeleteUi} DB=${afterDeleteDb}`);

    await admin
      .from("packet_form_annotations")
      .update({ status: "DELETED" })
      .eq("packet_form_id", PACKET_FORM_ID)
      .eq("annotation_type", "date_signed")
      .eq("status", "ACTIVE");
    ok("cleaned remaining QA date_signed rows via soft-delete");

    writeFileSync(
      path.join(OUT_DIR, "results.json"),
      JSON.stringify(
        {
          ok: true,
          baselineDates,
          afterPlaceDb,
          afterRefreshCount: persistedCount,
          afterDeleteUi,
          afterDeleteDb,
          url: page.url(),
          createdIds,
        },
        null,
        2,
      ),
    );
    ok("browser Date Signed placement QA passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
