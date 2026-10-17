import "server-only";
import { cacheLife } from "next/cache";
import { norm } from "./match";
import type { ListeningStats } from "./types";

/**
 * Listening history from Last.fm, which keeps every play forever. That makes
 * Last.fm itself the archive: "on repeat this month", when I listen, streaks
 * and "new to me" are all worked out from it, no copy of my own needed.
 */

const API = "https://ws.audioscrobbler.com/2.0/";
const PUNE_OFFSET = 5.5 * 3600; // Asia/Kolkata has no daylight saving

const creds = () => {
  const user = process.env.LASTFM_USER;
  const key = process.env.LASTFM_API_KEY;
  return user && key ? { user, key } : null;
};

async function lfm<T>(method: string, params: Record<string, string | number>): Promise<T | null> {
  const c = creds();
  if (!c) return null;
  const qs = new URLSearchParams({ method, user: c.user, api_key: c.key, format: "json" });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  try {
    const res = await fetch(`${API}?${qs}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      console.warn(`[lastfm] ${method} failed ${res.status}`);
      return null;
    }
    const json = (await res.json()) as T & { error?: number; message?: string };
    if (json.error) {
      console.warn(`[lastfm] ${method} error ${json.error}: ${json.message}`);
      return null;
    }
    return json;
  } catch (e) {
    console.warn(`[lastfm] ${method} error: ${(e as Error).message}`);
    return null;
  }
}

export const trackKey = (artist: string, track: string) => `${norm(track)}|${norm(artist)}`;

/** Pune calendar day ("2026-10-17") and hour (0-23) for a unix time. */
export const puneDay = (uts: number) => new Date((uts + PUNE_OFFSET) * 1000).toISOString().slice(0, 10);
export const puneHour = (uts: number) => Math.floor(((uts + PUNE_OFFSET) % 86400) / 3600);

export interface Scrobble {
  track: string;
  artist: string;
  album: string | null;
  uts: number;
}

interface RecentPage {
  recenttracks?: {
    track?: {
      name: string;
      artist: { "#text": string };
      album?: { "#text": string };
      date?: { uts: string };
      "@attr"?: { nowplaying?: string };
    }[];
    "@attr"?: { totalPages?: string; total?: string };
  };
}

/** Every play between two unix times, newest first (up to `maxPages` × 200). */
export async function scrobbles(from: number, to: number, maxPages = 40): Promise<Scrobble[] | null> {
  const page = (p: number) => lfm<RecentPage>("user.getrecenttracks", { from, to, limit: 200, page: p });
  const first = await page(1);
  if (!first?.recenttracks) return null;
  const pages = Math.min(Number(first.recenttracks["@attr"]?.totalPages ?? 1), maxPages);
  const rest: (RecentPage | null)[] = [];
  // A few pages at a time: Last.fm asks for no more than about five requests a second.
  for (let p = 2; p <= pages; p += 4) {
    const batch = await Promise.all([p, p + 1, p + 2, p + 3].filter((n) => n <= pages).map(page));
    rest.push(...batch);
  }
  const out: Scrobble[] = [];
  for (const r of [first, ...rest]) {
    for (const t of r?.recenttracks?.track ?? []) {
      if (t["@attr"]?.nowplaying === "true" || !t.date) continue;
      out.push({ track: t.name, artist: t.artist["#text"], album: t.album?.["#text"] || null, uts: Number(t.date.uts) });
    }
  }
  return out;
}

/* ---- The last 30 days, summarised (cached; shared by stats and "new to me") ---- */

interface Window {
  /** Plays per Pune hour of day. */
  clock: number[];
  /** Pune days that had at least one play. */
  days: string[];
  /** Per song: plays in the window and the first play in it. */
  songs: Record<string, { n: number; first: number }>;
  total: number;
}

const WINDOW_DAYS = 30;

async function recentWindow(): Promise<Window | null> {
  "use cache: remote";
  cacheLife({ stale: 600, revalidate: 3600, expire: 6 * 3600 });
  const to = Math.floor(Date.now() / 1000);
  const list = await scrobbles(to - WINDOW_DAYS * 86400, to);
  if (!list) {
    cacheLife({ stale: 60, revalidate: 300, expire: 900 });
    return null;
  }
  const clock = new Array<number>(24).fill(0);
  const days = new Set<string>();
  const songs: Window["songs"] = {};
  for (const s of list) {
    clock[puneHour(s.uts)]++;
    days.add(puneDay(s.uts));
    const k = trackKey(s.artist, s.track);
    const cur = songs[k];
    if (cur) {
      cur.n++;
      cur.first = Math.min(cur.first, s.uts);
    } else songs[k] = { n: 1, first: s.uts };
  }
  return { clock, days: [...days], songs, total: list.length };
}

/** Days in a row with at least one play, counting back from today (or yesterday, if nothing yet today). */
function streak(window: Window): { days: number; capped: boolean } {
  const today = puneDay(Math.floor(Date.now() / 1000));
  const set = new Set(window.days);
  const step = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10);
  let d = set.has(today) ? today : step(today);
  let n = 0;
  while (set.has(d) && n < WINDOW_DAYS) {
    n++;
    d = step(d);
  }
  return { days: n, capped: n >= WINDOW_DAYS };
}

/* ---- Top of the month ---- */

interface TopTracks {
  toptracks?: { track?: { name: string; playcount: string; artist: { name: string } }[] };
}
interface TopArtists {
  topartists?: { artist?: { name: string; playcount: string }[] };
}
interface UserInfo {
  user?: { playcount: string; registered?: { unixtime: string } };
}

/**
 * On repeat this month, when I listen, streak and lifetime plays.
 * Cached for an hour; none of it moves faster than that.
 */
export async function getListeningStats(): Promise<ListeningStats | null> {
  "use cache: remote";
  cacheLife({ stale: 600, revalidate: 3600, expire: 6 * 3600 });
  if (!creds()) return null;

  const [tracks, artists, info, window] = await Promise.all([
    lfm<TopTracks>("user.gettoptracks", { period: "1month", limit: 5 }),
    lfm<TopArtists>("user.gettopartists", { period: "1month", limit: 3 }),
    lfm<UserInfo>("user.getinfo", {}),
    recentWindow(),
  ]);

  const s = window ? streak(window) : null;
  return {
    onRepeat: (tracks?.toptracks?.track ?? []).map((t) => ({
      track: t.name,
      artist: t.artist.name,
      plays: Number(t.playcount) || 0,
    })),
    topArtists: (artists?.topartists?.artist ?? []).map((a) => ({ name: a.name, plays: Number(a.playcount) || 0 })),
    clock: window?.clock ?? null,
    windowDays: WINDOW_DAYS,
    windowPlays: window?.total ?? null,
    streakDays: s?.days ?? null,
    streakCapped: s?.capped ?? false,
    totalPlays: info?.user ? Number(info.user.playcount) || null : null,
    since: info?.user?.registered?.unixtime ? new Date(Number(info.user.registered.unixtime) * 1000).toISOString() : null,
    fetchedAt: new Date().toISOString(),
  };
}

/* ---- New to me ---- */

interface TrackInfo {
  track?: { userplaycount?: string };
}

/** All-time plays of one song by me. Cached for a few hours per song. */
async function lifetimePlays(artist: string, track: string): Promise<number | null> {
  "use cache: remote";
  cacheLife({ stale: 3600, revalidate: 6 * 3600, expire: 86400 });
  const r = await lfm<TrackInfo>("track.getinfo", { artist, track, autocorrect: 1, username: creds()?.user ?? "" });
  const n = r?.track?.userplaycount;
  return n != null ? Number(n) : null;
}

const NEW_DAYS = 14;

/**
 * When I first heard a song, if that was in the last two weeks. A song is
 * "new to me" when every play I've ever made of it falls inside the 30-day
 * window, and the earliest of those is under 14 days old.
 */
export async function firstHeard(artist: string, track: string): Promise<string | null> {
  const w = await recentWindow();
  const song = w?.songs[trackKey(artist, track)];
  if (!song) return null;
  const now = Date.now() / 1000;
  if (now - song.first > NEW_DAYS * 86400) return null;
  const lifetime = await lifetimePlays(artist, track);
  // Last.fm's count can include the play in progress, so allow one extra.
  if (lifetime == null || lifetime > song.n + 1) return null;
  return new Date(song.first * 1000).toISOString();
}
