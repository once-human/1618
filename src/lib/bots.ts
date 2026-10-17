/**
 * Telling people from programs, for the counts that are meant to be people:
 * today's map, the visitor count and "who's here". Crawlers, link-preview
 * fetchers, uptime checks and automated or headless browsers all say so in
 * their user agent (or, for automated browsers, in navigator.webdriver).
 * In-app browsers (Instagram, Telegram, WhatsApp) are people, so they pass.
 */
export const BOT_UA =
  /bot\/|\bbot\b|crawl|spider|slurp|headless|lighthouse|pagespeed|facebookexternalhit|uptime|pingdom|curl\/|wget|python|node-fetch|axios|go-http|java\/|okhttp|phantom|puppeteer|playwright|selenium|telegrambot|twitterbot|slackbot|discordbot|whatsapp\/|skypeuripreview/i;

export const isBotAgent = (ua: string | null | undefined) => !ua || BOT_UA.test(ua);

/** In the browser: is this an automated or headless browser rather than a person? */
export function isBotBrowser(): boolean {
  if (typeof navigator === "undefined") return true;
  return !!navigator.webdriver || isBotAgent(navigator.userAgent);
}

/**
 * Resolves once someone does something only a person does: moves the
 * pointer, touches, scrolls, or presses a key. Programs that load the page
 * (even ones that run its JavaScript) don't, so they're never counted.
 */
export function whenHuman(): Promise<void> {
  return new Promise((resolve) => {
    const events = ["pointermove", "pointerdown", "touchstart", "wheel", "scroll", "keydown"] as const;
    const done = (e: Event) => {
      if (!e.isTrusted) return;
      events.forEach((t) => window.removeEventListener(t, done, true));
      resolve();
    };
    events.forEach((t) => window.addEventListener(t, done, { capture: true, passive: true }));
  });
}
