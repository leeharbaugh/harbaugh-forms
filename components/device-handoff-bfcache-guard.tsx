"use client";

import {
  DEVICE_HANDOFF_ACTIVE_COOKIE_NAME,
  isPathAllowedDuringDeviceHandoffLock,
} from "@/lib/signing/device-handoff-lock";
import { useEffect } from "react";

const RETURN_TO_AGENT_PATH = "/sign/return-to-agent";

function hasDeviceHandoffActiveFlag(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => {
      const trimmed = part.trim();
      return (
        trimmed === `${DEVICE_HANDOFF_ACTIVE_COOKIE_NAME}=1` ||
        trimmed.startsWith(`${DEVICE_HANDOFF_ACTIVE_COOKIE_NAME}=1;`)
      );
    });
}

function leaveRestoredWorkspaceIfLocked() {
  if (!hasDeviceHandoffActiveFlag()) return;
  const path = window.location.pathname;
  if (isPathAllowedDuringDeviceHandoffLock(path)) return;
  // Replace so Back does not re-enter the restored workspace entry.
  window.location.replace(RETURN_TO_AGENT_PATH);
}

/**
 * Shared-device bfcache / history guard for authenticated workspace pages.
 *
 * The HttpOnly lock cookie cannot be read here. The readable companion flag
 * (`hf_device_handoff_active`) is only a signal to leave a restored page
 * immediately; proxy/server lock validation remains authoritative.
 *
 * On bfcache restore (`pageshow` with `persisted`), private workspace pages
 * also force a full navigation so a fresh server request can redirect.
 */
export function DeviceHandoffBfcacheGuard() {
  useEffect(() => {
    leaveRestoredWorkspaceIfLocked();

    function onPageShow(event: PageTransitionEvent) {
      if (hasDeviceHandoffActiveFlag()) {
        leaveRestoredWorkspaceIfLocked();
        return;
      }
      if (!event.persisted) return;
      const path = window.location.pathname;
      if (isPathAllowedDuringDeviceHandoffLock(path)) return;
      // Force a network navigation; proxy applies the authoritative lock check.
      window.location.replace(window.location.href);
    }

    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
