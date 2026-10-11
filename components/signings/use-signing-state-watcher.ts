"use client";

import type { SigningDashboard } from "@/lib/signing/dashboard";
import { useEffect, useRef } from "react";

export const SIGNING_STATE_POLL_MS = 20_000;
/** Focus and visibility often fire together when a tab is revealed. */
const MIN_REFRESH_GAP_MS = 3_000;

/** Ended outcomes worth stating, especially when they happened elsewhere. */
export function signingOutcomeMessage(
  dashboard: Pick<SigningDashboard, "signing" | "participants">,
  notice: string | null,
): { title: string; body: string } | null {
  const state = dashboard.signing.lifecycleState;
  if (state === "DECLINED") {
    const names = dashboard.participants
      .filter((participant) => participant.participantStatus === "DECLINED")
      .map((participant) => participant.fullName);
    return {
      title: names.length
        ? `This Signing was declined by ${formatNameList(names)}.`
        : "This Signing was declined.",
      body: "It has ended for every participant. To continue, prepare and send a new Signing.",
    };
  }
  if (state === "CANCELLED" && !notice) {
    return {
      title: "This Signing was cancelled.",
      body: "It has ended for every participant. To continue, prepare and send a new Signing.",
    };
  }
  return null;
}

function formatNameList(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Only an In Progress Signing changes without this manager acting. */
export function shouldWatchSigningState(lifecycleState: string): boolean {
  return lifecycleState === "IN_PROGRESS";
}

/**
 * Keeps a long-open Signing page current with changes made elsewhere: a
 * participant finishing or declining, finalization, another manager's Cancel.
 * It only calls `refresh`, which re-reads the authorized dashboard from the
 * server; nothing observed in the browser is treated as Signing state.
 *
 * Polls while the tab is visible, refreshes when the tab is revealed or
 * focused, never overlaps refreshes, and stops once `active` turns false.
 */
export function useSigningStateWatcher(options: {
  active: boolean;
  refresh: () => Promise<void>;
  intervalMs?: number;
}) {
  const { active, refresh, intervalMs = SIGNING_STATE_POLL_MS } = options;
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let inFlight = false;
    let lastStartedAt = 0;

    const run = (force: boolean) => {
      if (stopped || inFlight || document.visibilityState !== "visible") return;
      if (!force && Date.now() - lastStartedAt < MIN_REFRESH_GAP_MS) return;
      inFlight = true;
      lastStartedAt = Date.now();
      refreshRef
        .current()
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    };

    const timer = window.setInterval(() => run(true), intervalMs);
    const onReveal = () => {
      if (document.visibilityState === "visible") run(false);
    };
    const onFocus = () => run(false);
    document.addEventListener("visibilitychange", onReveal);
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onReveal);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, intervalMs]);
}
