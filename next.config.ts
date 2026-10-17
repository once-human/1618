import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // `curl -L onkaryaglewad.in`: terminals get the live status as text.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/",
          has: [{ type: "header", key: "user-agent", value: "(curl|Wget|HTTPie|xh)/.*" }],
          destination: "/api/curl",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
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
