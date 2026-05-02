import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright sometimes uses 127.0.0.1 — explicitly allow it as a dev origin
  // so client-side code hydrates instead of being blocked as cross-origin.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
