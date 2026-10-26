import type { NextFetchEvent, NextRequest } from "next/server";
import { isBotAgent } from "@/lib/bots";
import { recordBot } from "@/lib/visits/server";

/**
 * Programs (crawlers, link previews, curl) don't run the page's JavaScript,
 * so the visitor log sees them here instead. The matcher below only lets in
 * requests whose user agent looks like a program, or that have none, so
 * people's page loads never pass through this at all.
 */
export function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!isBotAgent(req.headers.get("user-agent"))) return;
  event.waitUntil(recordBot(req, req.nextUrl.pathname).catch(() => {}));
}

// Pages only: not the API, Next's files, /admin, or anything with a file extension.
// (These have to be written out: Next reads them before the code runs.)
export const config = {
  matcher: [
    {
      source: "/((?!api|_next|admin|.*\\..*).*)",
      has: [
        {
          type: "header",
          key: "user-agent",
          value:
            ".*([Bb]ot|[Cc]rawl|[Ss]pider|[Ss]lurp|[Hh]eadless|[Ll]ighthouse|[Pp]age[Ss]peed|facebookexternalhit|meta-externalagent|[Uu]ptime|[Pp]ingdom|curl/|[Ww]get|[Pp]ython|node-fetch|axios|[Gg]o-http|Java/|okhttp|[Pp]hantom|[Pp]uppeteer|[Pp]laywright|[Ss]elenium|WhatsApp/|[Ss]kype|HTTPie|xh/|[Pp]review|[Aa]nthropic|[Pp]erplexity|[Ss]crapy|libwww|[Hh]ttp[Cc]lient|[Hh]ttp-client|[Rr]eqwest|aiohttp|httpx|[Bb]ytespider|[Aa]hrefs|[Ss]emrush|MJ12|[Yy]andex|[Bb]aidu|[Ss]ogou|[Aa]pplebot|ia_archiver|[Mm]onitor|[Ss]canner|[Ff]etcher|[Cc]hecker|[Vv]alidator|\\+http).*",
        },
      ],
    },
    { source: "/((?!api|_next|admin|.*\\..*).*)", missing: [{ type: "header", key: "user-agent" }] },
  ],
};
