/**
 * Generic external Signing access unavailable response.
 * Clears participant/package/device-handoff cookies; authority remains server-side.
 */
import { NextResponse } from "next/server";
import { buildClearedSigningCeremonyCookieAttributes } from "@/lib/signing/browser-sessions";
import { buildClearedCompletedPackageCookieAttributes } from "@/lib/signing/completed-package-sessions";
import {
  buildClearedDeviceHandoffActiveCookieAttributes,
  buildClearedDeviceHandoffLockCookieAttributes,
} from "@/lib/signing/device-handoff-lock";
import { buildClearedSigningEntryCookieAttributes } from "@/lib/signing/entry-sessions";
import { SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE } from "@/lib/signing/external-access";
import { buildClearedSigningHandoffCookieAttributes } from "@/lib/signing/in-person-handoff";

export async function GET(): Promise<NextResponse> {
  const response = new NextResponse(SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE, {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
  response.cookies.set(buildClearedSigningEntryCookieAttributes());
  response.cookies.set(buildClearedSigningCeremonyCookieAttributes());
  response.cookies.set(buildClearedSigningHandoffCookieAttributes());
  response.cookies.set(buildClearedCompletedPackageCookieAttributes());
  // Device lock cookies are agent-workspace state; clear them so an epoch bump
  // during handoff cannot trap the agent behind proxy redirects forever.
  response.cookies.set(buildClearedDeviceHandoffLockCookieAttributes());
  response.cookies.set(buildClearedDeviceHandoffActiveCookieAttributes());
  return response;
}
