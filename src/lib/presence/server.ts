import "server-only";
import { cacheLife } from "next/cache";
import { after } from "next/server";
import type { Presence, Track } from "./types";
import { projects } from "@/content/projects";
import { ACCEPT, baseTitle, matchScore, norm, splitArtists, stripRelease, type ItunesResult } from "./match";

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

/**
 * Recent listening, newest first, one row per song (its latest play).
 * Deliberately not cached here: the route caches it for a few seconds at the
 * edge, so "playing" flips over almost as soon as the song changes.
 */
export async function getMusic(): Promise<Track[] | null> {
  const user = process.env.LASTFM_USER;
  const key = process.env.LASTFM_API_KEY;
  if (!user || !key) return null;

  // Fetch plenty of history so that, after collapsing repeats, ten different songs remain.
  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
    user,
  )}&api_key=${key}&format=json&limit=50`;
  const data = await getJson<LfmResponse>(url);
  const list = data?.recenttracks?.track;
  if (!list) return null;

  const seen = new Set<string>();
  const unique = list.filter((t) => {
    const id = `${norm(t.name)}|${norm(t.artist["#text"])}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const rows = unique.slice(0, 10);

  // Look songs up on Apple a few at a time (Apple rate-limits bursts), newest
  // first so the playing song is matched before anything else. Anything not
  // matched within the time budget finishes after the response and shows up
  // on the next refresh, so a slow lookup never holds the list back.
  const apple: (AppleSong | null | undefined)[] = new Array(rows.length);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const i = next++;
      apple[i] = await appleSong(rows[i].artist["#text"], rows[i].name, rows[i].album?.["#text"] || null);
    }
  };
  const all = Promise.all([worker(), worker(), worker()]);
  await Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
  after(() => all);

  return rows.map((t, i): Track => {
    // Last.fm's "large" (174px) is the fallback cover when Apple has no match.
    const lfm = t.image?.find((x) => x.size === "large")?.["#text"] || "";
    const artist = t.artist["#text"];
    return {
      track: t.name,
      artist,
      album: t.album?.["#text"] || null,
      url:
        apple[i]?.link ??
        `https://music.apple.com/in/search?term=${encodeURIComponent(`${artist} ${t.name}`)}`,
      image: apple[i]?.art ?? (lfm && !lfm.includes(LFM_PLACEHOLDER) ? lfm : null),
      nowPlaying: t["@attr"]?.nowplaying === "true",
      at: t.date ? new Date(Number(t.date.uts) * 1000).toISOString() : null,
    };
  });
}

/* ---------------- Apple Music lookup (iTunes Search, no key needed) ---------------- */

export interface AppleSong {
  art: string | null;
  link: string;
}



async function itunes(term: string, country: string, limit: number) {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}&country=${country}`,
      { signal: AbortSignal.timeout(TIMEOUT) },
    );
    if (!res.ok) return { ok: false, results: [] as ItunesResult[] };
    const data = (await res.json()) as { results?: ItunesResult[] };
    return { ok: true, results: data.results ?? [] };
  } catch {
    return { ok: false, results: [] as ItunesResult[] };
  }
}

/**
 * The song on Apple Music: its cover (96px, a 48px slot on retina) and its own
 * page. Runs several searches (title + artist, title + every artist, title +
 * album, title alone, then the US store), scores every candidate with
 * matchScore, and keeps the best one only if it clears ACCEPT. No cover is
 * better than the wrong cover.
 *
 * A match is cached for weeks. A miss is cached for hours, and a failed
 * request (usually Apple rate-limiting) for only a couple of minutes.
 */
export async function appleSong(artist: string, track: string, album: string | null): Promise<AppleSong | null> {
  "use cache";

  const artists = splitArtists(artist);
  const title = baseTitle(track);
  if (!artists.length || !norm(title)) {
    cacheLife("weeks");
    return null;
  }

  const attempts: [string, string, number][] = [
    [`${title} ${artists[0]}`, "in", 25],
    ...(artists.length > 1 ? [[`${title} ${artists.join(" ")}`, "in", 25] as [string, string, number]] : []),
    ...(album && norm(stripRelease(album)) !== norm(title)
      ? [[`${title} ${stripRelease(album)}`, "in", 25] as [string, string, number]]
      : []),
    [title, "in", 50],
    [`${title} ${artists[0]}`, "us", 25],
  ];

  let failed = false;
  let best: { r: ItunesResult; score: number } | null = null;
  for (const [term, country, limit] of attempts) {
    const { ok, results } = await itunes(term, country, limit);
    if (!ok) {
      failed = true;
      continue;
    }
    for (const r of results) {
      if (!r.trackViewUrl) continue;
      const score = matchScore(r, track, artists, album);
      if (score >= ACCEPT && (!best || score > best.score)) best = { r, score };
    }
    if (best && best.score >= 0.95) break; // certain enough; stop searching
  }

  if (best) {
    cacheLife("weeks");
    return {
      art: best.r.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/96x96bb.jpg") ?? null,
      link: best.r.trackViewUrl!.replace(/[?&]uo=\d+/, ""),
    };
  }

  if (failed) cacheLife({ stale: 30, revalidate: 120, expire: 600 });
  else cacheLife({ stale: 300, revalidate: 6 * 3600, expire: 86400 });
  return null;
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

/** Only the repos the site actually shows, so the response stays small. */
const SHOWN_REPOS = new Set(projects.flatMap((p) => (p.repo ? [p.repo.toLowerCase()] : [])));

export async function getPresence(): Promise<Presence> {
  const [gh, weather] = await Promise.all([getGithub(), getWeather()]);
  const repos = Object.fromEntries(Object.entries(gh.repos).filter(([name]) => SHOWN_REPOS.has(name)));
  return { github: gh.github, repos, weather, fetchedAt: new Date().toISOString() };
}
