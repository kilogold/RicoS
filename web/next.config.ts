import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ricos/shared"],
  // LAN origins allowed to hit the dev server (mobile device testing over
  // Wi-Fi). Next blocks cross-origin dev requests by default since 15.x.
  // Extend via NEXT_DEV_ALLOWED_ORIGINS="ip1,ip2,*.local" without a code edit.
  allowedDevOrigins: [
    "10.0.0.108",
    "341f-2606-5f00-9440-4b15-cc7b-3ead-a6dc-8de1.ngrok-free.app",
    "fbea-72-50-90-117.ngrok-free.app",
    "*.local",
    ...(process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []),
  ],
};

export default nextConfig;
