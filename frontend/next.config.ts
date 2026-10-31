import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Django routes end in a slash; without this Next 308-redirects /api/x/ to /api/x and the API 404s.
  skipTrailingSlashRedirect: true,
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  // Same-origin API in every environment: the browser never sees the Django host.
  async rewrites() {
    const api = process.env.API_URL ?? "http://localhost:8000";
    // :path* drops the trailing slash Django requires, so match the slashed form first.
    return [
      { source: "/api/:path*/", destination: `${api}/api/:path*/` },
      { source: "/api/:path*", destination: `${api}/api/:path*` },
    ];
  },
};

export default nextConfig;
