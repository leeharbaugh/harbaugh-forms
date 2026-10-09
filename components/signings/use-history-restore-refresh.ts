"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

/** Back/Forward count; Strict Mode effect replays do not change it. */
let historyTraversals = 0;
if (typeof window !== "undefined") {
  // `navigate` fires before the router reveals the restored route; popstate
  // (fallback without the Navigation API) only after it.
  const navigation = (window as unknown as { navigation?: EventTarget })
    .navigation;
  if (navigation) {
    navigation.addEventListener("navigate", (event) => {
      if ((event as Event & { navigationType?: string }).navigationType === "traverse") {
        historyTraversals += 1;
      }
    });
  } else {
    window.addEventListener("popstate", () => {
      historyTraversals += 1;
    });
  }
}

/**
 * Pages rendered with server data adopt a fresh payload on every push
 * navigation, but Back/Forward reuses the cached payload (bfcacheId
 * unchanged) and shows the state kept from the last visit. Refresh then.
 * A layout effect queues the refresh ahead of child passive-effect actions,
 * which run one at a time. Returns whether that refresh is in flight.
 */
export function useHistoryRestoreRefresh(refresh: () => Promise<void>): boolean {
  const { bfcacheId } = useRouter();
  const shown = useRef<{ bfcacheId: string; traversals: number } | null>(null);
  const [restoring, setRestoring] = useState(false);
  useLayoutEffect(() => {
    const previous = shown.current;
    shown.current = { bfcacheId, traversals: historyTraversals };
    const restored =
      previous != null &&
      previous.bfcacheId === bfcacheId &&
      previous.traversals !== historyTraversals;
    if (!restored) return;
    setRestoring(true);
    void refresh().finally(() => setRestoring(false));
  }, [bfcacheId, refresh]);
  return restoring;
}
