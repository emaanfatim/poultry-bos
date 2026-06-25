import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/i18n", "@repo/types"],
};

export default nextConfig;
