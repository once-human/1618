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
  async headers() {
    // Admin on top of that: never indexed, never says where it was.
    const lock = [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    // Everywhere: the browser basics. (No script-level CSP: Next's inline bootstrapping needs nonces,
    // which would make every page dynamic. These cover framing, sniffing, plugins and form hijacking.)
    const site = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    return [
      { source: "/:path*", headers: site },
      { source: "/admin", headers: lock },
      { source: "/admin/:path*", headers: lock },
      { source: "/api/admin/:path*", headers: lock },
    ];
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
