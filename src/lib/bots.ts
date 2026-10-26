/**
 * Telling people from programs, for the counts that are meant to be people:
 * today's map, the visitor count and "who's here". Crawlers, link-preview
 * fetchers, uptime checks and automated or headless browsers all say so in
 * their user agent (or, for automated browsers, in navigator.webdriver).
 * In-app browsers (Instagram, Telegram, WhatsApp) are people, so they pass.
 */
export const BOT_UA =
  /bot\/|\bbot\b|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|meta-externalagent|uptime|pingdom|curl\/|wget|python|node-fetch|axios|go-http|java\/|okhttp|phantom|puppeteer|playwright|selenium|scrapy|libwww|httpclient|http-client|reqwest|aiohttp|httpx|bytespider|ahrefs|semrush|mj12|yandex|baidu|sogou|applebot|ia_archiver|monitor|scanner|fetcher|checker|validator|telegrambot|twitterbot|slackbot|discordbot|whatsapp\/|skypeuripreview|\+https?:\/\//i;

export const isBotAgent = (ua: string | null | undefined) => !ua || BOT_UA.test(ua);

/** Small towns that are, in practice, only cloud datacentres: a "visitor" from one is a machine. */
const DATACENTRE_TOWNS = new Set(["council bluffs", "the dalles", "boardman", "moses lake"]);
export const isDatacentreTown = (city: string | null | undefined) => !!city && DATACENTRE_TOWNS.has(city.toLowerCase());

/**
 * What the server can tell from the request alone, with no IP and no
 * fingerprint: a browser's own page script always sends a language and says
 * where the request came from (Sec-Fetch-Site, Origin). Scripts posting
 * straight at the API usually send neither, or send them from somewhere else.
 * Returns why it's not a page of ours, or null.
 */
export function notOurPage(req: Request): string | null {
  const h = req.headers;
  const site = h.get("sec-fetch-site");
  if (site && site !== "same-origin") return "sent from another site";
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (origin) {
    try {
      if (host && new URL(origin).host !== host) return "sent from another site";
    } catch {
      return "sent from another site";
    }
  }
  if (!h.get("accept-language")) return "sends no language, like a script does";
  return null;
}

let reason: string | null | undefined;
/** The few things only a real, GPU-backed, windowed browser has. A score of three or more is a program. */
function weak(): string | null {
  const n = navigator;
  const ua = n.userAgent;
  const desktopChrome = /Chrome\//.test(ua) && !/Mobile|Android|CriOS|EdgA/.test(ua);
  const hits: string[] = [];
  if (!n.languages || !n.languages.length) hits.push("no language");
  if (desktopChrome && !(window as unknown as { chrome?: unknown }).chrome) hits.push("no chrome object");
  if (desktopChrome && n.plugins && n.plugins.length === 0) hits.push("no plugins");
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const r = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    if (/swiftshader|llvmpipe|mesa offscreen|software/i.test(r)) hits.push("software graphics", "software graphics");
  } catch {
    /* no graphics at all is odd, but not proof */
  }
  return hits.length >= 3 ? `looks automated (${[...new Set(hits)].join(", ")})` : null;
}

/** In the browser: why this looks like an automated or headless browser rather than a person, or null. */
export function botReason(): string | null {
  if (typeof navigator === "undefined") return "no browser";
  if (reason !== undefined) return reason;
  reason = navigator.webdriver
    ? "an automated browser (webdriver)"
    : isBotAgent(navigator.userAgent)
      ? "says it's a program"
      : !window.innerWidth || !window.innerHeight || !screen.width
        ? "has no screen"
        : weak();
  return reason;
}
export const isBotBrowser = () => botReason() !== null;

/**
 * Resolves once someone does something only a person does, for long enough to
 * be sure: a tap, a key, a scroll, or the pointer moving through a few
 * different places, after the page has been open for a moment. Events a
 * script makes up (not "trusted") don't count. Programs that load the page,
 * even ones that run its JavaScript, never get here.
 */
export function whenHuman(): Promise<void> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const spots = new Set<string>();
    const events = ["pointermove", "pointerdown", "touchstart", "wheel", "scroll", "keydown"] as const;
    const done = (e: Event) => {
      if (!e.isTrusted) return;
      if (e.type === "pointermove") {
        const m = e as PointerEvent;
        spots.add(`${Math.round(m.clientX / 24)},${Math.round(m.clientY / 24)}`);
        if (spots.size < 3) return; // one nudge isn't a hand
      }
      events.forEach((t) => window.removeEventListener(t, done, true));
      setTimeout(resolve, Math.max(0, 1200 - (performance.now() - t0))); // not in the first moment
    };
    events.forEach((t) => window.addEventListener(t, done, { capture: true, passive: true }));
  });
}
