/**
 * The visitor log, shared by the browser, the server and /admin.
 * See db/schema.sql for what's stored, and /privacy for what that means.
 */

/** Full detail is kept this long; after that, only country-level daily counts. */
export const KEEP_DAYS = 30;
/** A visit ends after this long with nothing happening; the next page starts a new one. */
export const IDLE_MS = 30 * 60_000;
/** At most this many events per visit, and pages per program per day. */
export const MAX_EVENTS = 500;
export const MAX_BOT_PAGES = 300;

export const ID = /^[a-f0-9]{32}$/;

export type EventType = "page" | "click" | "action";
export interface TrackEvent {
  seq: number;
  at: number;
  type: EventType;
  path: string;
  detail?: string | null;
  ms?: number | null;
  scroll?: number | null;
}

export interface TrackBatch {
  /** The browser's own random code (kept in localStorage). */
  v: string;
  /** This visit. */
  s: string;
  /** Has a person done anything yet (moved, scrolled, tapped, typed)? */
  human: boolean;
  /** Set by the page when it can tell it's being driven by a program. */
  bot?: string | null;
  /** Where they came from: a site name only. Sent with the first batch. */
  ref?: string | null;
  lang?: string | null;
  screen?: "phone" | "tablet" | "desktop" | null;
  events: TrackEvent[];
}

/** What /admin and "your visit" on /privacy show. */
export interface VisitRow {
  id: string;
  visitor: string | null;
  kind: "person" | "bot";
  reason: string | null;
  startedAt: string;
  lastAt: string;
  city: string | null;
  country: string | null;
  device: string | null;
  lang: string | null;
  screen: string | null;
  referrer: string | null;
  pages: number;
  activeMs: number;
  /** Pages in order, as a short trail: "/ → /now → /talk". */
  trail: string[];
  /** For people: which visit of theirs this is, in the last 30 days (1 = first). */
  nth?: number;
}

/** One person (one browser's code), for /admin → privacy → People. */
export interface PersonRow {
  /** First 12 characters of the SHA-256 of their code: stable, and not the code. */
  id: string;
  firstAt: string;
  lastAt: string;
  /** Visits kept in full (the last 30 days). */
  visits: number;
  pages: number;
  activeMs: number;
  places: { city: string | null; country: string | null }[];
  devices: string[];
  lang: string | null;
  screen: string | null;
  /** Where their first kept visit came from. */
  referrer: string | null;
  /** When they were first counted as a visitor (can be older than the kept log). */
  countedAt: string | null;
}

export interface EventRow {
  seq: number;
  at: string;
  type: EventType;
  path: string;
  detail: string | null;
  ms: number | null;
  scroll: number | null;
}

/** "Googlebot", "ChatGPT", "curl"… from a program's user agent. */
export function botName(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (!s) return "No user agent";
  const known: [RegExp, string][] = [
    [/Googlebot/i, "Googlebot"],
    [/Google-InspectionTool/i, "Google Search Console"],
    [/GoogleOther|Google-Extended/i, "Google (other)"],
    [/bingbot/i, "Bingbot"],
    [/DuckDuckBot/i, "DuckDuckGo"],
    [/YandexBot/i, "Yandex"],
    [/Baiduspider/i, "Baidu"],
    [/Applebot/i, "Applebot"],
    [/GPTBot|ChatGPT-User|OAI-SearchBot/i, "OpenAI"],
    [/ClaudeBot|Claude-User|Claude-SearchBot|anthropic/i, "Anthropic"],
    [/PerplexityBot|Perplexity-User/i, "Perplexity"],
    [/CCBot/i, "Common Crawl"],
    [/Bytespider/i, "ByteDance"],
    [/AhrefsBot/i, "Ahrefs"],
    [/SemrushBot/i, "Semrush"],
    [/MJ12bot/i, "Majestic"],
    [/DotBot/i, "Moz"],
    [/PetalBot/i, "Petal (Huawei)"],
    [/facebookexternalhit|meta-externalagent|facebookcatalog/i, "Facebook / Instagram preview"],
    [/Twitterbot/i, "X preview"],
    [/LinkedInBot/i, "LinkedIn preview"],
    [/Slackbot/i, "Slack preview"],
    [/Discordbot/i, "Discord preview"],
    [/TelegramBot/i, "Telegram preview"],
    [/WhatsApp/i, "WhatsApp preview"],
    [/SkypeUriPreview/i, "Skype preview"],
    [/Pinterestbot|Pinterest\//i, "Pinterest"],
    [/redditbot/i, "Reddit preview"],
    [/Lighthouse|PageSpeed|Chrome-Lighthouse/i, "Lighthouse"],
    [/vercel/i, "Vercel"],
    [/UptimeRobot|Pingdom|uptime/i, "Uptime check"],
    [/HeadlessChrome/i, "Headless Chrome"],
    [/Puppeteer|Playwright|Selenium|PhantomJS/i, "Automated browser"],
    [/curl\//i, "curl"],
    [/Wget/i, "Wget"],
    [/HTTPie|xh\//i, "HTTPie"],
    [/python|aiohttp/i, "Python script"],
    [/node-fetch|axios|undici|node\//i, "Node script"],
    [/Go-http-client/i, "Go program"],
    [/okhttp|Java\//i, "Java program"],
  ];
  for (const [re, name] of known) if (re.test(s)) return name;
  const first = s.split(/[\s;(]/)[0]?.split("/")[0];
  return first ? first.slice(0, 40) : "Unknown program";
}

/** Terminal tools are people at a keyboard, really; they're shown apart from crawlers. */
export const isTerminal = (name: string) => ["curl", "Wget", "HTTPie"].includes(name);

/** "/now", without the query string or anything after #, capped. */
export const cleanPath = (p: string) => (p.split(/[?#]/)[0] || "/").slice(0, 200);

/** A site name from a referrer: "instagram.com", never the full address. */
export function refHost(ref: string | null | undefined, self?: string): string | null {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^(www|m|l|lm)\./, "");
    if (self && h === self.replace(/^www\./, "")) return null;
    return h.slice(0, 80) || null;
  } catch {
    return null;
  }
}
