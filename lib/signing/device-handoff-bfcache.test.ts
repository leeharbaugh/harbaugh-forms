import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildClearedDeviceHandoffActiveCookieAttributes,
  buildDeviceHandoffActiveCookieAttributes,
  buildDeviceHandoffLockCookieAttributes,
  DEVICE_HANDOFF_ACTIVE_COOKIE_NAME,
  DEVICE_HANDOFF_LOCK_COOKIE_NAME,
  isPathAllowedDuringDeviceHandoffLock,
} from "./device-handoff-lock";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("Device handoff bfcache / history isolation", () => {
  it("keeps the lock secret HttpOnly and the active flag readable", () => {
    const lock = buildDeviceHandoffLockCookieAttributes({
      rawLockToken: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    });
    assert.equal(lock.name, DEVICE_HANDOFF_LOCK_COOKIE_NAME);
    assert.equal(lock.httpOnly, true);
    assert.equal(lock.path, "/");

    const active = buildDeviceHandoffActiveCookieAttributes();
    assert.equal(active.name, DEVICE_HANDOFF_ACTIVE_COOKIE_NAME);
    assert.equal(active.httpOnly, false);
    assert.equal(active.value, "1");
    assert.equal(active.path, "/");

    const cleared = buildClearedDeviceHandoffActiveCookieAttributes();
    assert.equal(cleared.maxAge, 0);
  });

  it("allows only sign/auth paths while the device lock is active", () => {
    assert.equal(isPathAllowedDuringDeviceHandoffLock("/sign/return-to-agent"), true);
    assert.equal(isPathAllowedDuringDeviceHandoffLock("/sign/ceremony"), true);
    assert.equal(isPathAllowedDuringDeviceHandoffLock("/sign"), true);
    assert.equal(isPathAllowedDuringDeviceHandoffLock("/auth/login"), true);
    assert.equal(isPathAllowedDuringDeviceHandoffLock("/packets"), false);
    assert.equal(isPathAllowedDuringDeviceHandoffLock("/contacts"), false);
    assert.equal(isPathAllowedDuringDeviceHandoffLock("/admin/users"), false);
    assert.equal(isPathAllowedDuringDeviceHandoffLock("/signings"), false);
    assert.equal(isPathAllowedDuringDeviceHandoffLock("/signings/abc"), false);
  });

  it("sets private workspace Cache-Control no-store headers", () => {
    const nextConfig = read("next.config.ts");
    assert.match(nextConfig, /source: "\/packets\/:path\*"/);
    assert.match(nextConfig, /source: "\/contacts\/:path\*"/);
    assert.match(nextConfig, /source: "\/signings\/:path\*"/);
    assert.match(
      nextConfig,
      /no-store, no-cache, must-revalidate, private/,
    );
  });

  it("installs a pageshow bfcache guard that replaces into Return-to-Agent", () => {
    const guard = read("components/device-handoff-bfcache-guard.tsx");
    assert.match(guard, /pageshow/);
    assert.match(guard, /event\.persisted/);
    assert.match(guard, /DEVICE_HANDOFF_ACTIVE_COOKIE_NAME/);
    assert.match(guard, /location\.replace/);
    assert.match(guard, /\/sign\/return-to-agent/);
    assert.match(read("app/layout.tsx"), /DeviceHandoffBfcacheGuard/);
  });

  it("replaces history when entering handoff and when unlocking", () => {
    assert.match(
      read("components/signings/signing-dashboard-page.tsx"),
      /location\.replace\(data\.handoffPath\)/,
    );
    assert.doesNotMatch(
      read("components/signings/signing-dashboard-page.tsx"),
      /location\.assign\(data\.handoffPath\)/,
    );
    assert.match(
      read("components/sign/return-to-agent-form.tsx"),
      /location\.replace\(redirectPath\)/,
    );
    assert.match(
      read("lib/signing/ceremony-agent-actions.ts"),
      /buildDeviceHandoffActiveCookieAttributes/,
    );
    assert.match(
      read("lib/signing/ceremony-agent-actions.ts"),
      /buildClearedDeviceHandoffActiveCookieAttributes/,
    );
  });

  it("proxy redirects locked workspace requests with no-store", () => {
    const proxy = read("lib/supabase/proxy.ts");
    assert.match(proxy, /DEVICE_HANDOFF_LOCK_COOKIE_NAME/);
    assert.match(proxy, /\/sign\/return-to-agent/);
    assert.match(proxy, /Cache-Control/);
    assert.match(proxy, /no-store/);
  });
});
