import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  turbopack: {
    resolveAlias: {
      canvas: "./lib/empty-module.ts",
    },
  },
};

export default nextConfig;
