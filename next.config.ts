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
    return [
      {
        // Participant entry URLs carry a bearer credential as a path segment,
        // so these responses must never leak a referrer or be cached.
        source: "/sign/:path*",
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
