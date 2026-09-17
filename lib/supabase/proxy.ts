import {
  DEVICE_HANDOFF_LOCK_COOKIE_NAME,
  isPathAllowedDuringDeviceHandoffLock,
} from "@/lib/signing/device-handoff-lock";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const path = request.nextUrl.pathname;
  const deviceLockCookie = request.cookies.get(DEVICE_HANDOFF_LOCK_COOKIE_NAME);
  if (
    deviceLockCookie?.value &&
    !isPathAllowedDuringDeviceHandoffLock(path)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign/return-to-agent";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this Contact in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase Contact, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Force password change before any non-auth application route.
  if (user) {
    const allowedWhileForced =
      path.startsWith("/auth") ||
      path.startsWith("/login");
    if (!allowedWhileForced) {
      const userId = typeof user.sub === "string" ? user.sub : null;
      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("status, onboarding_status, must_change_password")
          .eq("id", userId)
          .maybeSingle();
        const eligible = profile?.status === "ACTIVE" &&
          (profile.onboarding_status === "ACTIVE" || profile.onboarding_status === "INVITED");
        if (!eligible) {
          await supabase.auth.signOut();
          const url = request.nextUrl.clone();
          url.pathname = "/auth/login";
          url.search = "error=inactive_account";
          const response = NextResponse.redirect(url);
          supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
          return response;
        }
        if (!allowedWhileForced && profile.must_change_password === true) {
          const url = request.nextUrl.clone();
          url.pathname = "/auth/change-password";
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
