import "server-only";
import { getBedtime } from "@/lib/presence/bedtime";
import { cacheLife, cacheTag } from "next/cache";
import { after } from "next/server";
import sharp from "sharp";
import type { ManualStatus, Presence, Track } from "./types";
import { kvGet, kvSet, q } from "@/lib/db";
import { firstHeard, trackKey } from "./lastfm";
import { healthToday } from "@/lib/history/query";
import { parseCredit } from "@/lib/history/credits";
import { projects } from "@/content/projects";
import { ACCEPT, baseTitle, matchScore, nameSim, norm, splitArtists, stripRelease, type ItunesResult } from "./match";

const GH_USER = "once-human";
const TIMEOUT = 5000;
const PUNE = { lat: 18.5204, lon: 73.8567 };

export function ghHeaders(): HeadersInit {
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

export interface PublicEvent extends GhEvent {
  id: string;
  payload: GhEvent["payload"] & { size?: number; ref?: string };
}

/**
 * My public GitHub events, fetched once every ten minutes and shared by
 * everything that needs them (presence, the timeline, the history sync).
 * GitHub allows 60 unauthenticated requests an hour, so sharing matters.
 */
export async function ghEvents(): Promise<PublicEvent[] | null> {
  "use cache: remote";
  cacheLife({ stale: 120, revalidate: 600, expire: 3600 });
  cacheTag("github");
  return getJson<PublicEvent[]>(`https://api.github.com/users/${GH_USER}/events/public?per_page=100`, ghHeaders());
}

export async function getGithub(): Promise<Pick<Presence, "github" | "repos">> {
  "use cache: remote";
  cacheLife({ stale: 120, revalidate: 600, expire: 3600 });
  // A GitHub webhook can mark this stale the moment I push (see /api/hooks/github).
  cacheTag("github");

  const [events, repos] = await Promise.all([
    ghEvents(),
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
  const heard: (string | null | undefined)[] = new Array(rows.length);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const i = next++;
      const artist = rows[i].artist["#text"];
      [apple[i], heard[i]] = await Promise.all([
        appleSong(artist, rows[i].name, rows[i].album?.["#text"] || null, APPLE_SHAPE),
        firstHeard(artist, rows[i].name).catch(() => null),
      ]);
    }
  };
  const all = Promise.all([worker(), worker(), worker()]);
  await Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
  after(() => all);

  const tracks = rows.map((t, i): Track => {
    // Last.fm's "large" (174px) is the fallback cover when Apple has no match.
    const lfm = t.image?.find((x) => x.size === "large")?.["#text"] || "";
    const artist = t.artist["#text"];
    // Shown clean: "Song (feat. X) [Mixed]" by "A & B" becomes "Song" by "A, B & X".
    const clean = parseCredit(t.name, artist);
    return {
      track: clean.title,
      artist: clean.credit || artist,
      album: t.album?.["#text"] || null,
      url:
        apple[i]?.link ??
        `https://music.apple.com/in/search?term=${encodeURIComponent(`${artist} ${t.name}`)}`,
      image: apple[i]?.art ?? (lfm && !lfm.includes(LFM_PLACEHOLDER) ? lfm : null),
      preview: apple[i]?.preview ?? null,
      durationMs: apple[i]?.durationMs ?? null,
      tint: apple[i]?.tint ?? null,
      nowPlaying: t["@attr"]?.nowplaying === "true",
      startedAt: null,
      at: t.date ? new Date(Number(t.date.uts) * 1000).toISOString() : null,
      firstHeard: heard[i] ?? null,
      fire: null,
    };
  });

  const playing = tracks[0]?.nowPlaying ? tracks[0] : null;
  if (playing) await trackPlaying(playing, tracks[1] ?? null);
  return tracks;
}

/**
 * Neither Apple Music nor Last.fm says when the current song started or
 * whether it's paused. So the site remembers when it first saw each song
 * playing. That gives an approximate position in the song, and once the song
 * has run well past its own length it can't still be playing: it was paused
 * or stopped, so it's shown as last played instead.
 */
async function trackPlaying(t: Track, previous: Track | null) {
  const key = trackKey(t.artist, t.track);
  const [seen, fire] = await Promise.all([
    kvGet<{ key: string; since: string }>("now-playing"),
    q<{ n: number }>("fire read", (db) => db`SELECT n FROM reactions WHERE track_key = ${key}`),
  ]);
  t.fire = fire?.[0]?.n ?? 0;

  let since = seen?.value.key === key ? seen.value.since : null;
  if (!since) {
    // A scrobble's time is when that song started. If the previous song ran
    // straight into this one, this one started when that one ended, which is
    // closer to the truth than "now" when nobody was on the site at the time.
    const now = Date.now();
    const handoff =
      previous?.at && previous.durationMs ? Date.parse(previous.at) + previous.durationMs : null;
    const start = handoff && handoff <= now && now - handoff < 20 * 60_000 ? handoff : now;
    since = new Date(start).toISOString();
    const value = { key, since };
    after(() => kvSet("now-playing", value));
  }
  t.startedAt = since;

  const elapsed = Date.now() - Date.parse(since);
  if (t.durationMs && elapsed > t.durationMs + 60_000) {
    t.nowPlaying = false;
    t.at = new Date(Date.parse(since) + t.durationMs).toISOString();
    t.startedAt = null;
  }
}

/* ---------------- Apple Music lookup (iTunes Search, no key needed) ---------------- */

export interface AppleSong {
  art: string | null;
  link: string;
  preview: string | null;
  durationMs: number | null;
  /** The cover's dominant colour. */
  tint: string | null;
}

/**
 * Songs Apple's search can't find, filled in by hand: tracks that only exist
 * inside a DJ mix album, whose songs the public API doesn't list. The cover
 * and link are the mix album's own. Matched on the title and the version.
 */
const CURATED: { has: string[]; art: string; link: string; preview: string | null }[] = [
  {
    // "No Love (Fred again.. Remix) [Mixed]", from Fred again.. Rooftop Live (Arun's Roof, London)
    has: ["no love", "fred again remix"],
    art: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/ad/cb/84/adcb843c-6a14-4338-b058-498ab420b289/cc6771fb-1913-4ddf-83cb-e806f7759a3a.jpg/100x100bb.jpg",
    link: "https://music.apple.com/in/album/fred-again-rooftop-live-aruns-roof-london-dj-mix-dj-mix/1767527509",
    // Apple has no clip of the remix itself: this is the clip of the original song, which is the same song underneath.
    preview: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/69/b6/cc/69b6cc4e-3606-74e4-f361-25a327f50063/mzaf_15989864170927854996.plus.aac.p.m4a",
  },
];

/** Bump when AppleSong gains fields, so weeks-old cached lookups are redone. */
const APPLE_SHAPE = 4;

/** The dominant colour of a cover image, as #rrggbb. */
async function coverTint(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return null;
    const { dominant } = await sharp(Buffer.from(await res.arrayBuffer())).stats();
    return `#${[dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}



async function fetchJson<T>(url: string, label: string): Promise<{ ok: boolean; data: T | null }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) {
      console.warn(`[music] ${label} failed ${res.status}: ${url}`);
      return { ok: false, data: null };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (e) {
    console.warn(`[music] ${label} error: ${(e as Error).message}`);
    return { ok: false, data: null };
  }
}

const ITUNES = "https://itunes.apple.com";
const appleArt = (url?: string) => url?.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/96x96bb.jpg") ?? null;
const appleLink = (url: string) => url.replace(/[?&]uo=\d+/, "");

/** Apple song search. */
async function searchSongs(term: string, country: string, limit: number) {
  const r = await fetchJson<{ results?: ItunesResult[] }>(
    `${ITUNES}/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}&country=${country}`,
    "apple search",
  );
  return { ok: r.ok, results: r.data?.results ?? [] };
}

/** Every song Apple lists for an artist (up to 200), found by artist name. */
async function artistSongs(name: string) {
  const found = await fetchJson<{ results?: { artistId: number; artistName: string }[] }>(
    `${ITUNES}/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=5&country=in`,
    "apple artist",
  );
  if (!found.ok) return { ok: false, results: [] as ItunesResult[] };
  const artist = found.data?.results?.find((a) => nameSim(a.artistName, name) >= 0.9);
  if (!artist) return { ok: true, results: [] as ItunesResult[] };
  const songs = await fetchJson<{ results?: (ItunesResult & { wrapperType?: string })[] }>(
    `${ITUNES}/lookup?id=${artist.artistId}&entity=song&limit=200&country=in&sort=recent`,
    "apple lookup",
  );
  return { ok: songs.ok, results: (songs.data?.results ?? []).filter((r) => r.wrapperType === "track") };
}

interface DeezerTrack {
  title: string;
  link: string;
  preview?: string;
  duration?: number;
  artist: { name: string };
  album: { title: string; cover_medium?: string };
}

/** Deezer catalog search, shaped like an Apple result so it scores the same way. */
async function deezer(query: string) {
  const r = await fetchJson<{ data?: DeezerTrack[] }>(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`,
    "deezer",
  );
  return {
    ok: r.ok,
    results: (r.data?.data ?? []).map((t) => ({
      trackName: t.title,
      artistName: t.artist.name,
      collectionName: t.album.title,
      // Deezer serves any size from the same path; 96px matches Apple's.
      artworkUrl100: t.album.cover_medium?.replace(/\/\d+x\d+-/, "/96x96-"),
      trackViewUrl: t.link,
      previewUrl: t.preview || undefined,
      trackTimeMillis: t.duration ? t.duration * 1000 : undefined,
    })),
  };
}

/** The Apple Music link for a song found on another service, via song.link. */
async function appleLinkFor(url: string): Promise<string | null> {
  const r = await fetchJson<{ linksByPlatform?: { appleMusic?: { url: string } } }>(
    `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}&userCountry=IN`,
    "song.link",
  );
  return r.data?.linksByPlatform?.appleMusic?.url ?? null;
}

type Candidate = { r: ItunesResult; score: number };

/**
 * The song on Apple Music: its cover and its own page.
 *
 * Candidates come from three places, cheapest first, and every one is scored
 * by matchScore; the best is kept only if it clears ACCEPT, because no cover
 * is better than the wrong cover:
 *   1. Apple song search (title + artist, title + all artists, title + album,
 *      title alone, then the US store)
 *   2. Apple artist catalog: each credited artist's songs, which finds tracks
 *      the search engine tokenises badly (a one-word title split into several)
 *   3. Deezer's catalog, turned into the Apple Music link with song.link
 *
 * Stored in Vercel's shared runtime cache: a match for weeks, a clean miss for
 * hours, a failed request (usually rate-limiting) for a couple of minutes.
 */
export async function appleSong(
  artist: string,
  track: string,
  album: string | null,
  shape: number,
): Promise<AppleSong | null> {
  "use cache: remote";
  void shape; // part of the cache key only

  const flat = norm(track);
  const hand = CURATED.find((c) => c.has.every((w) => flat.includes(w)));
  if (hand) {
    cacheLife("weeks");
    return { art: appleArt(hand.art), link: hand.link, preview: hand.preview, durationMs: null, tint: await coverTint(hand.art) };
  }

  const artists = splitArtists(artist);
  const title = baseTitle(track);
  if (!artists.length || !norm(title)) {
    cacheLife("weeks");
    return null;
  }

  let failed = false;
  let best: Candidate | null = null;
  const seen: Candidate[] = [];
  const consider = (results: ItunesResult[]) => {
    for (const r of results) {
      if (!r.trackViewUrl) continue;
      const score = matchScore(r, track, artists, album);
      if (score > 0) seen.push({ r, score });
      if (score >= ACCEPT && (!best || score > best.score)) best = { r, score };
    }
  };
  const sure = () => (best as Candidate | null)?.score !== undefined && (best as Candidate | null)!.score >= 0.95;

  // 1. Apple song search
  const searches: [string, string, number][] = [
    [`${title} ${artists[0]}`, "in", 25],
    ...(artists.length > 1 ? [[`${title} ${artists.join(" ")}`, "in", 25] as [string, string, number]] : []),
    ...(album && norm(stripRelease(album)) !== norm(title)
      ? [[`${title} ${stripRelease(album)}`, "in", 25] as [string, string, number]]
      : []),
    [title, "in", 50],
    [`${title} ${artists[0]}`, "us", 25],
  ];
  for (const [term, country, limit] of searches) {
    const { ok, results } = await searchSongs(term, country, limit);
    if (!ok) failed = true;
    consider(results);
    if (sure()) break;
  }

  // 2. Apple artist catalog
  if (!sure()) {
    for (const name of artists.slice(0, 2)) {
      const { ok, results } = await artistSongs(name);
      if (!ok) failed = true;
      consider(results);
      if (sure()) break;
    }
  }

  const apple = best as Candidate | null;
  if (apple) {
    cacheLife("weeks");
    const art = appleArt(apple.r.artworkUrl100);
    return {
      art,
      link: appleLink(apple.r.trackViewUrl!),
      preview: apple.r.previewUrl ?? null,
      durationMs: apple.r.trackTimeMillis ?? null,
      tint: await coverTint(art),
    };
  }

  // 3. Deezer, then song.link for the Apple Music page
  for (const q of [`artist:"${artists[0]}" track:"${title}"`, `${title} ${artists[0]}`]) {
    const { ok, results } = await deezer(q);
    if (!ok) failed = true;
    consider(results);
    if (best) break;
  }
  const dz = best as Candidate | null;
  if (dz) {
    const link = await appleLinkFor(dz.r.trackViewUrl!);
    if (link) cacheLife("weeks");
    else cacheLife({ stale: 300, revalidate: 6 * 3600, expire: 86400 });
    return {
      art: dz.r.artworkUrl100 ?? null,
      link: link ?? `https://music.apple.com/in/search?term=${encodeURIComponent(`${artist} ${track}`)}`,
      preview: dz.r.previewUrl ?? null,
      durationMs: dz.r.trackTimeMillis ?? null,
      tint: await coverTint(dz.r.artworkUrl100 ?? null),
    };
  }

  console.info(
    `[music] no match for "${track}" by "${artist}" (failed=${failed}); closest: ${seen
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((c) => `"${c.r.trackName}" by "${c.r.artistName}" = ${c.score.toFixed(2)}`)
      .join("; ") || "none"}`,
  );
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

/** Weather at a place. Shared across every server instance; one call per place every 15 minutes. */
export async function getWeather(lat: number, lon: number): Promise<Presence["weather"]> {
  "use cache: remote";
  cacheLife({ stale: 300, revalidate: 900, expire: 7200 });

  type Forecast = {
    current?: { temperature_2m: number; weather_code: number; cloud_cover?: number; precipitation?: number };
    daily?: { sunrise?: number[]; sunset?: number[] };
  };
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,cloud_cover,precipitation&daily=sunrise,sunset&forecast_days=2&timezone=auto&timeformat=unixtime`;
  let data: Forecast | null = null;
  for (let attempt = 0; attempt < 2 && !data?.current; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
      if (res.ok) data = (await res.json()) as Forecast;
      else console.warn(`[weather] Open-Meteo answered ${res.status}`);
    } catch (e) {
      console.warn(`[weather] ${(e as Error).message}`);
    }
  }
  const c = data?.current;
  if (!c) {
    // A miss is only remembered for a minute, so one bad moment can't blank the weather for hours.
    cacheLife({ stale: 30, revalidate: 60, expire: 120 });
    return null;
  }
  const label = WMO.find(([codes]) => codes.includes(c.weather_code))?.[1] ?? "";
  const code = c.weather_code;
  return {
    tempC: Math.round(c.temperature_2m),
    label,
    // For the sky on /now
    cloud: c.cloud_cover ?? null,
    rain: (c.precipitation ?? 0) > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95,
    sun: (data?.daily?.sunrise ?? []).map((r, i) => ({ rise: r * 1000, set: (data?.daily?.sunset?.[i] ?? 0) * 1000 })),
  };
}

/** Only the repos the site actually shows, so the response stays small. */
const SHOWN_REPOS = new Set(projects.flatMap((p) => (p.repo ? [p.repo.toLowerCase()] : [])));

/** The status I set from my phone, unless it has expired. */
export async function getStatus(): Promise<ManualStatus | null> {
  const row = await kvGet<ManualStatus>("status");
  if (!row || Date.parse(row.value.until) < Date.now()) return null;
  return row.value;
}

export interface Place {
  city: string;
  lat: number;
  lon: number;
  tz: string;
  setAt?: string;
}

const PUNE_PLACE: Place = { city: "Pune", lat: PUNE.lat, lon: PUNE.lon, tz: "Asia/Kolkata" };

/** Where I am, at city level: set from my phone or /admin, Pune until then. */
export async function getPlace(): Promise<Place> {
  const row = await kvGet<Place>("location");
  return row?.value ?? PUNE_PLACE;
}

export async function getPresence(): Promise<Presence> {
  const place = await getPlace();
  const [gh, weather, status, health, bedtime] = await Promise.all([
    getGithub(),
    getWeather(place.lat, place.lon),
    getStatus(),
    healthToday(),
    getBedtime(),
  ]);
  const repos = Object.fromEntries(Object.entries(gh.repos).filter(([name]) => SHOWN_REPOS.has(name)));
  return {
    github: gh.github,
    repos,
    place: { city: place.city, tz: place.tz },
    weather,
    status,
    bedtime,
    health: health ? { steps: health.steps, distanceKm: health.distanceKm, activeKcal: health.activeKcal, sleepHours: health.sleepHours, at: health.at } : null,
    fetchedAt: new Date().toISOString(),
  };
}
