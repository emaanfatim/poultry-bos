import type { NextConfig } from "next";

// In local dev, the API runs on the same machine, so localhost:4000 works.
// On Railway (or any host where the API is a separate service/container),
// set API_URL to that service's address — e.g. its Railway private
// networking URL, http://api.railway.internal:4000 — so this rewrite
// still reaches it.
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
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
