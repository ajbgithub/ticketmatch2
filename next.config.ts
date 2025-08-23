// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ✅ Allow production builds to succeed even if ESLint errors exist.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
