import type { NextConfig } from "next";

const PRIVATE_WORKSPACE_NO_STORE = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
  { key: "Pragma", value: "no-cache" },
] as const;

const nextConfig: NextConfig = {
  cacheComponents: true,
  turbopack: {
    resolveAlias: {
      canvas: "./lib/empty-module.ts",
    },
  },
  async headers() {
    // React needs eval() only in development (debug call stacks); never in production.
    const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
    return [
      {
        // Every response: no MIME sniffing and no framing by any origin. The app
        // never frames its own pages (PDFs render with pdf.js, not iframes).
        // Must stay first: a later rule that sets Content-Security-Policy (the
        // /sign rule) replaces this one, since the last matching rule wins per key.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        // Signing entry/package bootstrap pages: path holds nonsecret public ids
        // only. Fragment secrets never appear in request path/query.
        source: "/sign/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            // Next.js App Router without per-request nonces requires
            // script-src 'unsafe-inline' for framework bootstrap/hydration.
            // Keep first-party only; no third-party script hosts.
            key: "Content-Security-Policy",
            value: [
              "default-src 'none'",
              `script-src 'self' 'unsafe-inline'${devEval}`,
              "connect-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self'",
              "base-uri 'none'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
      {
        source: "/api/sign/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // Authenticated workspace pages that may precede an in-person handoff must
      // not be restored from HTTP cache / bfcache with private content visible.
      // Static public assets under /_next/static are unaffected.
      {
        source: "/packets/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
      {
        source: "/contacts/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
      {
        source: "/properties/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
      {
        source: "/forms/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
      {
        source: "/collections/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
      {
        source: "/signings/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
      {
        source: "/settings/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
      {
        source: "/admin/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
      {
        source: "/representation-agreements/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
      {
        source: "/form-field-mappings/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
      {
        source: "/protected/:path*",
        headers: [...PRIVATE_WORKSPACE_NO_STORE],
      },
    ];
  },
};

export default nextConfig;
