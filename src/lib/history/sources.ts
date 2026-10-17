import "server-only";
import { cacheLife } from "next/cache";
import { kvGet, q } from "@/lib/db";
import { stravaConfigured } from "./strava";
import { HERE_KEY, HERE_URL } from "@/lib/presence/here-config";

/**
 * Is every live source answering? Each is asked directly (not from a cache),
 * timed, and summarised in a line. Cached for a minute so the page can't be
 * used to hammer anyone.
 */
export interface SourceCheck {
  name: string;
  what: string;
  ok: boolean | null;
  ms: number | null;
  detail: string;
}

async function timed(fn: () => Promise<string>): Promise<{ ok: boolean; ms: number; detail: string }> {
  const t = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - t, detail };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, detail: (e as Error).message.slice(0, 120) };
  }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`answered ${res.status}`);
  return (await res.json()) as T;
}

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)} days ago`;
};

export async function checkSources(): Promise<{ checks: SourceCheck[]; checkedAt: string }> {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 60, expire: 300 });
  const user = process.env.LASTFM_USER;
  const key = process.env.LASTFM_API_KEY;
  const gh = { headers: { "User-Agent": "1618-portfolio", Accept: "application/vnd.github+json" } };

  const [lastfm, apple, deezer, pin, rss, github, weather, db, sync, health, here] = await Promise.all([
    user && key
      ? timed(async () => {
          const d = await json<{ recenttracks: { track: { name: string; date?: { uts: string }; "@attr"?: { nowplaying?: string } }[] } }>(
            `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${user}&api_key=${key}&format=json&limit=1`,
          );
          const t = d.recenttracks.track[0];
          return t?.["@attr"]?.nowplaying ? "playing right now" : t?.date ? `last play ${ago(new Date(Number(t.date.uts) * 1000).toISOString())}` : "no plays";
        })
      : null,
    timed(async () => {
      const d = await json<{ resultCount: number }>("https://itunes.apple.com/search?term=fred+again&entity=song&limit=1&country=in");
      return d.resultCount ? "search answering" : "empty answer";
    }),
    timed(async () => {
      const d = await json<{ total?: number }>("https://api.deezer.com/search?q=fred+again&limit=1");
      return d.total ? "search answering" : "empty answer";
    }),
    timed(async () => {
      const d = await json<{ data?: { pins?: unknown[] } }>("https://widgets.pinterest.com/v3/pidgets/users/onkaryaglewad/pins/", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; 1618-portfolio)" },
      });
      return `${d.data?.pins?.length ?? 0} recent pins`;
    }),
    timed(async () => {
      const res = await fetch("https://www.pinterest.com/onkaryaglewad/feed.rss", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; 1618-portfolio)" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      const n = ((await res.text()).match(/<item>/g) ?? []).length;
      return `${n} items`;
    }),
    timed(async () => {
      // The rate-limit endpoint is free to call; it says whether GitHub is answering us without spending anything.
      const d = await json<{ resources: { core: { remaining: number } } }>("https://api.github.com/rate_limit", gh);
      if (d.resources.core.remaining <= 0) throw new Error("busy, back within the hour");
      return "answering";
    }),
    timed(async () => {
      const d = await json<{ current?: { temperature_2m: number } }>(
        "https://api.open-meteo.com/v1/forecast?latitude=18.52&longitude=73.86&current=temperature_2m",
      );
      return Number.isFinite(d.current?.temperature_2m) ? "answering" : "empty answer";
    }),
    timed(async () => {
      const r = await q<{ plays: number }>("status db", (db) => db`SELECT count(*)::int AS plays FROM scrobbles`);
      if (!r) throw new Error("not reachable");
      return `${r[0].plays.toLocaleString("en-IN")} plays stored`;
    }),
    kvGet<{ at: string }>("sync:last"),
    q<{ day: string }>("status health", (db) => db`SELECT max(day)::text AS day FROM health_days`),
    timed(async () => {
      // The realtime service that carries "N people here" sits on a small Supabase project.
      const res = await fetch(`${HERE_URL}/auth/v1/health`, { headers: { apikey: HERE_KEY }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(res.status === 540 ? "paused" : `answered ${res.status}`);
      return "answering";
    }),
  ]);

  const checks: SourceCheck[] = [
    { name: "Last.fm", what: "listening", ...(lastfm ?? { ok: null, ms: null, detail: "not set up" }) },
    { name: "Apple Music", what: "covers, links, previews", ...apple },
    { name: "Deezer", what: "fallback song lookup", ...deezer },
    { name: "Pinterest widget", what: "pins and boards", ...pin },
    { name: "Pinterest RSS", what: "save times", ...rss },
    { name: "GitHub", what: "code activity", ...github },
    { name: "Open-Meteo", what: "weather where I am", ...weather },
    { name: "History store", what: "Neon Postgres", ...db },
    { name: "Realtime", what: "who's here right now", ...here },
    {
      name: "Sync",
      what: "copies new data into the store",
      ok: sync ? Date.now() - Date.parse(sync.value.at) < 26 * 3600_000 : null,
      ms: null,
      detail: sync ? `last ran ${ago(sync.value.at)}` : "hasn't run yet",
    },
    {
      name: "Strava",
      what: "runs and rides",
      ok: stravaConfigured() ? true : null,
      ms: null,
      detail: stravaConfigured() ? "connected" : "not connected yet",
    },
    {
      name: "Apple Health",
      what: "steps and workouts, via a Shortcut",
      ok: health?.[0]?.day ? true : null,
      ms: null,
      detail: health?.[0]?.day ? `last sent for ${health[0].day}` : "nothing sent yet",
    },
  ];
  return { checks, checkedAt: new Date().toISOString() };
}
