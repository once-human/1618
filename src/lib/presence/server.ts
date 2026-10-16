import "server-only";
import { cacheLife } from "next/cache";
import type { Presence, Track } from "./types";

const GH_USER = "once-human";
const TIMEOUT = 5000;
const PUNE = { lat: 18.5204, lon: 73.8567 };

function ghHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "1618-portfolio",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function getJson<T>(url: string, headers?: HeadersInit): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ---------------- GitHub ---------------- */

interface GhEvent {
  type: string;
  repo: { name: string };
  created_at: string;
  payload: {
    ref_type?: string;
    action?: string;
  };
}

const ACTION: Record<string, string> = {
  PushEvent: "Pushed to",
  CreateEvent: "Created",
  ReleaseEvent: "Released",
  PullRequestEvent: "Opened a PR on",
  IssuesEvent: "Opened an issue on",
  PublicEvent: "Open-sourced",
};

export async function getGithub(): Promise<Pick<Presence, "github" | "repos">> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });

  const [events, repos] = await Promise.all([
    getJson<GhEvent[]>(`https://api.github.com/users/${GH_USER}/events/public?per_page=30`, ghHeaders()),
    getJson<{ name: string; pushed_at: string }[]>(
      `https://api.github.com/users/${GH_USER}/repos?sort=pushed&per_page=100`,
      ghHeaders(),
    ),
  ]);

  // The events feed can lag by hours, while repo `pushed_at` is near real-time.
  // Use whichever is newer.
  const ev = events?.find((e) => e.type in ACTION) ?? null;
  const newest = repos?.[0] ?? null; // already sorted by pushed_at desc
  const repoWins = newest && (!ev || new Date(newest.pushed_at) > new Date(ev.created_at));

  let activity: Presence["github"] = null;
  if (repoWins && newest) {
    activity = {
      repo: newest.name,
      url: `https://github.com/${GH_USER}/${newest.name}`,
      action: "Pushed to",
      message: null,
      at: newest.pushed_at,
    };
  } else if (ev) {
    activity = {
      repo: ev.repo.name.split("/")[1],
      url: `https://github.com/${ev.repo.name}`,
      action: ACTION[ev.type],
      message: null,
      at: ev.created_at,
    };
  }

  // Push events no longer carry commit messages, so read the latest commit directly.
  if (activity && activity.action === "Pushed to") {
    const commits = await getJson<{ commit: { message: string } }[]>(
      `https://api.github.com/repos/${GH_USER}/${activity.repo}/commits?per_page=1`,
      ghHeaders(),
    );
    const line = commits?.[0]?.commit.message.split("\n")[0]?.trim() ?? null;
    activity.message = line && line.length > 90 ? `${line.slice(0, 87)}…` : line;
  }

  return {
    github: activity,
    repos: Object.fromEntries((repos ?? []).map((r) => [r.name.toLowerCase(), r.pushed_at])),
  };
}

/* ---------------- Last.fm ---------------- */

interface LfmResponse {
  recenttracks?: {
    track?: {
      name: string;
      url: string;
      artist: { "#text": string };
      album?: { "#text": string };
      image?: { size: string; "#text": string }[];
      date?: { uts: string };
      "@attr"?: { nowplaying?: string };
    }[];
  };
}

/** Last.fm's grey star placeholder, served when a track has no artwork. */
const LFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

export async function getMusic(): Promise<Presence["music"]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 600 });

  const user = process.env.LASTFM_USER;
  const key = process.env.LASTFM_API_KEY;
  if (!user || !key) return null;

  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
    user,
  )}&api_key=${key}&format=json&limit=12`;
  const data = await getJson<LfmResponse>(url);
  const list = data?.recenttracks?.track;
  if (!list) return null;

  return list.map((t): Track => {
    const img = t.image?.find((i) => i.size === "extralarge")?.["#text"] || t.image?.at(-1)?.["#text"] || "";
    return {
      track: t.name,
      artist: t.artist["#text"],
      album: t.album?.["#text"] || null,
      url: t.url,
      image: img && !img.includes(LFM_PLACEHOLDER) ? img : null,
      nowPlaying: t["@attr"]?.nowplaying === "true",
      at: t.date ? new Date(Number(t.date.uts) * 1000).toISOString() : null,
    };
  });
}

/* ---------------- Weather ---------------- */

const WMO: [number[], string][] = [
  [[0], "clear"],
  [[1, 2], "partly cloudy"],
  [[3], "overcast"],
  [[45, 48], "foggy"],
  [[51, 53, 55, 56, 57], "drizzle"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "raining"],
  [[95, 96, 99], "thunderstorms"],
];

export async function getWeather(): Promise<Presence["weather"]> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 7200 });

  const data = await getJson<{ current?: { temperature_2m: number; weather_code: number } }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${PUNE.lat}&longitude=${PUNE.lon}&current=temperature_2m,weather_code&timezone=Asia%2FKolkata`,
  );
  const c = data?.current;
  if (!c) return null;
  const label = WMO.find(([codes]) => codes.includes(c.weather_code))?.[1] ?? "";
  return { tempC: Math.round(c.temperature_2m), label };
}

export async function getPresence(): Promise<Presence> {
  const [gh, music, weather] = await Promise.all([getGithub(), getMusic(), getWeather()]);
  return { ...gh, music, weather, fetchedAt: new Date().toISOString() };
}
