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
        // Talk from a terminal: curl -L -d "hi" onkaryaglewad.in/talk
        {
          source: "/talk",
          has: [{ type: "header", key: "user-agent", value: "(curl|Wget|HTTPie|xh)/.*" }],
          destination: "/api/talk/cli",
        },
        {
          source: "/talk/:code([a-f0-9]{32})",
          has: [{ type: "header", key: "user-agent", value: "(curl|Wget|HTTPie|xh)/.*" }],
          destination: "/api/talk/cli?t=:code",
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
