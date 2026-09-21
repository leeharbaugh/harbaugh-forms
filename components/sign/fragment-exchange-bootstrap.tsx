"use client";

/**
 * Minimal fragment-secret bootstrap for Native Signing email links.
 * Reads `#secret`, clears it from the address bar immediately, POSTs to exchange.
 * Never logs or persists the secret.
 */
import { useEffect, useState } from "react";

type ExchangeKind = "entry" | "completed-package";

const EXCHANGE_PATH: Record<ExchangeKind, string> = {
  entry: "/api/sign/entry-exchange",
  "completed-package": "/api/sign/completed-package-exchange",
};

const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

/** Keep in sync with SIGNING_EXTERNAL_ACCESS_UNAVAILABLE_MESSAGE (no server import). */
const UNAVAILABLE_MESSAGE =
  "Signing access is currently unavailable. Please request a new link from the sender.";

export function FragmentExchangeBootstrap({
  publicId,
  kind,
}: {
  publicId: string;
  kind: ExchangeKind;
}) {
  const [message, setMessage] = useState("Opening your Signing link…");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const hash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );

      if (!hash || !SECRET_RE.test(hash)) {
        if (!cancelled) setMessage(UNAVAILABLE_MESSAGE);
        return;
      }

      let secret: string | null = hash;
      try {
        const response = await fetch(EXCHANGE_PATH[kind], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ publicId, secret }),
        });
        secret = null;
        if (!response.ok) {
          if (!cancelled) setMessage(UNAVAILABLE_MESSAGE);
          return;
        }
        const payload = (await response.json()) as {
          ok?: boolean;
          redirectTo?: string;
        };
        if (payload.ok && typeof payload.redirectTo === "string") {
          window.location.replace(payload.redirectTo);
          return;
        }
        if (!cancelled) setMessage(UNAVAILABLE_MESSAGE);
      } catch {
        secret = null;
        if (!cancelled) setMessage(UNAVAILABLE_MESSAGE);
      } finally {
        secret = null;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [kind, publicId]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="text-sm text-muted-foreground" role="status">
        {message}
      </p>
    </main>
  );
}
