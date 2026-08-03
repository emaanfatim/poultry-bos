import type { NextConfig } from "next";

// See apps/owner-portal/next.config.ts for why this is an env var, not a
// hardcoded localhost URL — same reasoning applies here.
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
