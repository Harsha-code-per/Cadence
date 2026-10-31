import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Django routes end in a slash; without this Next 308-redirects /api/x/ to /api/x and the API 404s.
  skipTrailingSlashRedirect: true,
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  // Same-origin API in every environment: the browser never sees the Django host.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_URL ?? "http://localhost:8000"}/api/:path*` }];
  },
};

export default nextConfig;
