import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // This app lives inside the stillcafe repo; keep Turbopack scoped to this folder.
  turbopack: { root: __dirname },
};

export default nextConfig;
