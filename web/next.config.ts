import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ricos/shared"],
  // LAN origins allowed to hit the dev server (mobile device testing over
  // Wi-Fi). Next blocks cross-origin dev requests by default since 15.x.
  // Extend via NEXT_DEV_ALLOWED_ORIGINS="ip1,ip2,*.local" without a code edit.
  allowedDevOrigins: [
    "10.0.0.93",
    "*.local",
    ...(process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []),
  ],
};

export default nextConfig;
