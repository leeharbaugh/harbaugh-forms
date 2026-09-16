import type { NextConfig } from "next";

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
    ];
  },
};

export default nextConfig;
