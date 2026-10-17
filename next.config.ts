import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Monthly issues were folded into /history.
  async redirects() {
    return [
      { source: "/issues", destination: "/history", permanent: true },
      { source: "/issues/:month", destination: "/history", permanent: true },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
