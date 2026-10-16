import "server-only";
import { cacheLife } from "next/cache";
import type { PinterestBoard, PinterestProfile, Saved, SavedPin } from "./types";

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

interface WidgetUser {
  full_name?: string;
  image_small_url?: string;
  about?: string;
  follower_count?: number;
  pin_count?: number;
}

async function widget(): Promise<{ pins: WidgetPin[]; user: WidgetUser | null } | null> {
  const text = await get(`https://widgets.pinterest.com/v3/pidgets/users/${PINTEREST_USER}/pins/`, "widget");
  if (!text) return null;
  try {
    const json = JSON.parse(text) as { data?: { pins?: WidgetPin[]; user?: WidgetUser } };
    return { pins: json.data?.pins ?? [], user: json.data?.user ?? null };
  } catch {
    console.warn("[saved] widget returned something that isn't JSON");
    return null;
  }
}

/* ---- Profile page data: profile, every board, created pins ---- */

/**
 * The same public JSON Pinterest's own profile page loads. Unofficial, so every
 * field is optional and every caller has a fallback.
 */
async function resource<T>(name: string, options: Record<string, unknown>): Promise<T | null> {
  const data = encodeURIComponent(JSON.stringify({ options, context: {} }));
  const url = `https://www.pinterest.com/resource/${name}/get/?source_url=${encodeURIComponent(`/${PINTEREST_USER}/`)}&data=${data}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) {
      console.warn(`[saved] ${name} failed ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { resource_response?: { data?: T } };
    return json.resource_response?.data ?? null;
  } catch (e) {
    console.warn(`[saved] ${name} error: ${(e as Error).message}`);
    return null;
  }
}

interface RawUser {
  full_name?: string;
  username?: string;
  about?: string;
  image_xlarge_url?: string;
  image_large_url?: string;
  image_medium_url?: string;
  follower_count?: number;
  following_count?: number;
  pin_count?: number;
}

interface RawBoard {
  name?: string;
  url?: string;
  privacy?: string;
  pin_count?: number;
  image_cover_hd_url?: string;
  image_cover_url?: string;
  cover_images?: Record<string, { url?: string }>;
  board_order_modified_at?: string;
  last_pinned_at?: string;
}

interface RawPin extends WidgetPin {
  created_at?: string;
}

const iso = (s?: string) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** A pin from either feed, in the shape the page uses. */
function toPin(p: RawPin, at: string | null): SavedPin | null {
  const img = p.images?.["564x"] ?? p.images?.["474x"] ?? p.images?.["236x"] ?? p.images?.["237x"] ?? Object.values(p.images ?? {})[0];
  if (!img?.url) return null;
  return {
    id: p.id,
    url: `https://www.pinterest.com/pin/${p.id}/`,
    image: sized(img.url, "736x"),
    imageSmall: sized(img.url, "474x"),
    width: img.width || 4,
    height: img.height || 5,
    color: p.dominant_color ?? null,
    title: decode(p.description ?? "").trim() || null,
    board: p.board?.name ?? null,
    boardUrl: p.board?.url ? `https://www.pinterest.com${p.board.url}` : null,
    at,
  };
}

/**
 * Profile, every public board and created pins, from the profile page data.
 * Cached for 30 minutes: these change far less often than saves.
 */
async function profileData(): Promise<{ user: RawUser | null; boards: RawBoard[] | null; created: RawPin[] | null }> {
  "use cache: remote";
  cacheLife({ stale: 300, revalidate: 1800, expire: 86400 });

  const [user, boards, created] = await Promise.all([
    resource<RawUser>("UserResource", { username: PINTEREST_USER, field_set_key: "profile" }),
    resource<RawBoard[]>("BoardsResource", {
      username: PINTEREST_USER,
      page_size: 100,
      privacy_filter: "all",
      sort: "last_pinned_to",
      field_set_key: "profile_grid_item",
    }),
    resource<RawPin[]>("UserActivityPinsResource", { username: PINTEREST_USER, field_set_key: "grid_item" }),
  ]);
  console.info(
    `[saved] profile data: user=${user ? Object.keys(user).length + " fields" : "none"}, boards=${boards?.length ?? "none"}, created=${created?.length ?? "none"}`,
  );
  return { user, boards, created };
}

/* ---- RSS feed: when each pin was saved ---- */

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
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
 * My Pinterest, as the page shows it: profile, every public board, pins I
 * created, and the latest saves.
 *
 * The latest saves combine the widget feed (images, sizes, boards) with the
 * RSS feed (save times), matched by pin id, and are cached for 10 minutes.
 * Profile, boards and created pins come from the profile page data and are
 * cached for 30. Whenever a source fails, the rest is built from whatever did
 * load. Secret boards never appear: none of these sources include them.
 */
export async function getSaved(): Promise<Saved> {
  "use cache: remote";
  cacheLife({ stale: 60, revalidate: 600, expire: 86400 });

  const [w, rss, page] = await Promise.all([widget(), rssPins(), profileData()]);
  const times = new Map((rss ?? []).map((p) => [p.id, p.at]));

  // Latest saves
  let pins: SavedPin[] = (w?.pins ?? []).flatMap((p) => toPin(p, times.get(p.id) ?? null) ?? []);
  if (!pins.length && rss?.length) {
    pins = rss.flatMap((p) =>
      p.image
        ? [{
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
          }]
        : [],
    );
  }

  // Profile, falling back to the widget's smaller user record
  const u = page.user;
  const wu = w?.user;
  const profile: PinterestProfile = {
    name: u?.full_name || wu?.full_name || PINTEREST_USER,
    username: u?.username || PINTEREST_USER,
    url: PROFILE,
    avatar: (u?.image_xlarge_url || u?.image_large_url || u?.image_medium_url || wu?.image_small_url) ?? null,
    about: (u?.about || wu?.about)?.trim() || null,
    followers: u?.follower_count ?? wu?.follower_count ?? null,
    following: u?.following_count ?? null,
    pinCount: u?.pin_count ?? wu?.pin_count ?? null,
  };

  // Boards: the full public list when available, else the boards seen in recent saves
  const latestIn = new Map<string, SavedPin>();
  for (const p of pins) if (p.boardUrl && !latestIn.has(p.boardUrl)) latestIn.set(p.boardUrl, p);

  let boards: PinterestBoard[];
  if (page.boards?.length) {
    boards = page.boards
      .filter((b) => b.name && b.url && (b.privacy ?? "public") === "public")
      .map((b) => {
        const url = `https://www.pinterest.com${b.url}`;
        const recent = latestIn.get(url);
        const cover = b.image_cover_hd_url || b.image_cover_url || Object.values(b.cover_images ?? {})[0]?.url || recent?.image || null;
        return {
          name: b.name!,
          url,
          pinCount: b.pin_count ?? null,
          cover: cover ? sized(cover, "474x") : null,
          color: recent?.color ?? null,
          updated: iso(b.last_pinned_at) ?? iso(b.board_order_modified_at) ?? recent?.at ?? null,
        };
      });
  } else {
    boards = [...latestIn.values()].map((p) => ({
      name: p.board!,
      url: p.boardUrl!,
      pinCount: null,
      cover: p.imageSmall,
      color: p.color,
      updated: p.at,
    }));
  }
  boards.sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));

  const created = (page.created ?? []).flatMap((p) => toPin(p, iso(p.created_at)) ?? []);

  if (!pins.length) console.warn("[saved] no recent pins from either feed");

  return { profile, boards, created: created.slice(0, 8), pins: pins.slice(0, 12), fetchedAt: new Date().toISOString() };
}
