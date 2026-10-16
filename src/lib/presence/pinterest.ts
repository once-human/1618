import "server-only";
import { cacheLife } from "next/cache";
import type { Saved, SavedBoard, SavedPin } from "./types";

export const PINTEREST_USER = "onkaryaglewad";
const PROFILE = `https://www.pinterest.com/${PINTEREST_USER}/`;
const TIMEOUT = 6000;
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; 1618-portfolio)", Accept: "*/*" };

async function get(url: string, label: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) {
      console.warn(`[saved] ${label} failed ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn(`[saved] ${label} error: ${(e as Error).message}`);
    return null;
  }
}

/** Pin id from any pin URL: ".../pin/123456/" -> "123456". */
const pinId = (url: string) => url.match(/\/pin\/(\d+)/)?.[1] ?? null;

/** Ask Pinterest's image CDN for a crisp size of the same image. */
const sized = (url: string, size: "474x" | "736x") => url.replace(/\/(\d+x|originals)\//, `/${size}/`);

/* ---- Widget feed: images, sizes, colours and boards ---- */

interface WidgetPin {
  id: string;
  description?: string;
  dominant_color?: string;
  images?: Record<string, { url: string; width: number; height: number }>;
  board?: { name?: string; url?: string };
}

async function widgetPins(): Promise<WidgetPin[] | null> {
  const text = await get(`https://widgets.pinterest.com/v3/pidgets/users/${PINTEREST_USER}/pins/`, "widget");
  if (!text) return null;
  try {
    const json = JSON.parse(text) as { data?: { pins?: WidgetPin[] } };
    return json.data?.pins ?? null;
  } catch {
    console.warn("[saved] widget returned something that isn't JSON");
    return null;
  }
}

/* ---- RSS feed: when each pin was saved ---- */

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

interface RssPin {
  id: string;
  title: string;
  image: string | null;
  at: string | null;
}

async function rssPins(): Promise<RssPin[] | null> {
  const xml = await get(`${PROFILE}feed.rss`, "rss");
  if (!xml) return null;
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const field = (item: string, tag: string) => decode(item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "").trim();
  return items
    .map((item) => {
      const link = field(item, "link") || field(item, "guid");
      const id = pinId(link);
      const img = field(item, "description").match(/https:\/\/i\.pinimg\.com\/[^"'\s<>]+/)?.[0] ?? null;
      const date = field(item, "pubDate");
      return id ? { id, title: field(item, "title"), image: img, at: date ? new Date(date).toISOString() : null } : null;
    })
    .filter((p): p is RssPin => p !== null);
}

/**
 * My latest Pinterest saves and the boards they went to. Combines the widget
 * feed (images, sizes, boards) with the RSS feed (save times), matched by pin
 * id, so it still works if either one is unavailable. Secret boards never
 * appear: neither feed includes them. Shared runtime cache for 10 minutes.
 */
export async function getSaved(): Promise<Saved> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 600, expire: 86400 });

  const [widget, rss] = await Promise.all([widgetPins(), rssPins()]);
  const times = new Map((rss ?? []).map((p) => [p.id, p.at]));

  let pins: SavedPin[] = [];
  if (widget?.length) {
    pins = widget.flatMap((p) => {
      const img = p.images?.["564x"] ?? p.images?.["474x"] ?? p.images?.["237x"] ?? Object.values(p.images ?? {})[0];
      if (!img) return [];
      return [
        {
          id: p.id,
          url: `https://www.pinterest.com/pin/${p.id}/`,
          image: sized(img.url, "736x"),
          imageSmall: sized(img.url, "474x"),
          width: img.width,
          height: img.height,
          color: p.dominant_color ?? null,
          title: (p.description ?? "").trim() || null,
          board: p.board?.name ?? null,
          boardUrl: p.board?.url ? `https://www.pinterest.com${p.board.url}` : null,
          at: times.get(p.id) ?? null,
        },
      ];
    });
  } else if (rss?.length) {
    // Fallback: RSS alone has no sizes or boards; assume a portrait pin.
    pins = rss.flatMap((p) =>
      p.image
        ? [
            {
              id: p.id,
              url: `https://www.pinterest.com/pin/${p.id}/`,
              image: sized(p.image, "736x"),
              imageSmall: sized(p.image, "474x"),
              width: 4,
              height: 5,
              color: null,
              title: p.title || null,
              board: null,
              boardUrl: null,
              at: p.at,
            },
          ]
        : [],
    );
  }

  // Boards I've saved to recently, most recent first.
  const boards = new Map<string, SavedBoard>();
  for (const p of pins) {
    if (!p.board || !p.boardUrl) continue;
    const b = boards.get(p.boardUrl) ?? { name: p.board, url: p.boardUrl, recent: 0, lastSaved: null };
    b.recent++;
    if (p.at && (!b.lastSaved || p.at > b.lastSaved)) b.lastSaved = p.at;
    boards.set(p.boardUrl, b);
  }

  if (!pins.length) console.warn("[saved] no pins from either source");

  return {
    profile: PROFILE,
    pins: pins.slice(0, 12),
    boards: [...boards.values()].sort((a, b) => (b.lastSaved ?? "").localeCompare(a.lastSaved ?? "")),
    fetchedAt: new Date().toISOString(),
  };
}
