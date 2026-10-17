import "server-only";
import { cacheLife } from "next/cache";
import { q } from "@/lib/db";
import type { SavedPin } from "@/lib/presence/types";

/**
 * Questions asked of the history store: any time range summarised, and the
 * year so far in the style of an annual music recap, kept live.
 */

/** Songs with no known length count as 3½ minutes. */
const DEFAULT_MS = 210_000;
const TZ = "Asia/Kolkata";

export interface RangeSummary {
  from: string;
  to: string;
  music: {
    plays: number;
    songs: number;
    artists: number;
    /** Estimated from song lengths; `known` is the share of plays with a real length. */
    minutes: number;
    known: number;
    /** Songs and artists heard for the very first time in this stretch. */
    newSongs: number;
    newArtists: number;
    topTracks: { track: string; artist: string; plays: number; image: string | null; url: string | null }[];
    topArtists: { name: string; plays: number }[];
    topAlbums: { album: string; artist: string; plays: number; image: string | null }[];
    byDay: { day: string; plays: number }[];
    clock: number[];
  };
  pins: { count: number; palette: string[]; boards: { name: string; url: string; count: number }[]; picks: SavedPin[] };
  code: { pushes: number; commits: number; repos: { name: string; pushes: number }[] };
  activity: { count: number; km: number; minutes: number; byType: { type: string; count: number; km: number }[] };
  health: { days: number; steps: number | null; avgSteps: number | null; avgSleep: number | null };
}

export async function summarise(from: Date, to: Date): Promise<RangeSummary> {
  const f = Math.floor(from.getTime() / 1000);
  const t = Math.floor(to.getTime() / 1000);
  const fi = from.toISOString();
  const ti = to.toISOString();

  const [totals, tracks, artists, albums, days, clock, pins, pinCount, code, acts, health, fresh] = await Promise.all([
    q<{ plays: number; songs: number; artists: number; ms: string | null; known: number | null }>("sum totals", (db) =>
      db`SELECT count(*)::int AS plays, count(DISTINCT coalesce(s.song_key, s.track_key))::int AS songs,
                (SELECT count(DISTINCT a.k)::int FROM scrobbles s2,
                   unnest(coalesce(s2.artist_keys, ARRAY[lower(s2.artist)])) AS a(k)
                  WHERE s2.uts >= ${f} AND s2.uts < ${t}) AS artists,
                sum(coalesce(m.duration_ms, ${DEFAULT_MS}))::text AS ms,
                avg(CASE WHEN m.duration_ms IS NULL THEN 0 ELSE 1 END)::float AS known
         FROM scrobbles s LEFT JOIN track_meta m ON m.track_key = s.track_key
         WHERE s.uts >= ${f} AND s.uts < ${t}`,
    ),
    // Songs: every version and credit order of a song counts as one song.
    q<{ track: string; artist: string; plays: number; image: string | null; link: string | null }>("sum tracks", (db) =>
      db`SELECT mode() WITHIN GROUP (ORDER BY coalesce(s.title, s.track)) AS track,
                mode() WITHIN GROUP (ORDER BY coalesce(s.credit, s.artist)) AS artist,
                count(*)::int AS plays, max(m.image) AS image, max(m.link) AS link
         FROM scrobbles s LEFT JOIN track_meta m ON m.track_key = s.track_key
         WHERE s.uts >= ${f} AND s.uts < ${t}
         GROUP BY coalesce(s.song_key, s.track_key) ORDER BY plays DESC, max(s.uts) DESC LIMIT 10`,
    ),
    // Artists: each play counts once for every artist on it, featured ones included.
    q<{ name: string; plays: number }>("sum artists", (db) =>
      db`SELECT mode() WITHIN GROUP (ORDER BY a.name) AS name, count(*)::int AS plays
         FROM scrobbles s,
              unnest(coalesce(s.artist_keys, ARRAY[lower(s.artist)]), coalesce(s.artists, ARRAY[s.artist])) AS a(k, name)
         WHERE s.uts >= ${f} AND s.uts < ${t}
         GROUP BY a.k ORDER BY plays DESC, max(s.uts) DESC LIMIT 10`,
    ),
    q<{ album: string; artist: string; plays: number; image: string | null }>("sum albums", (db) =>
      db`SELECT mode() WITHIN GROUP (ORDER BY regexp_replace(s.album, '\s+-\s+(Single|EP)$', '', 'i')) AS album,
                mode() WITHIN GROUP (ORDER BY coalesce(s.artists[1], s.artist)) AS artist,
                count(*)::int AS plays, max(m.image) AS image
         FROM scrobbles s LEFT JOIN track_meta m ON m.track_key = s.track_key
         WHERE s.uts >= ${f} AND s.uts < ${t} AND coalesce(s.album, '') <> ''
         GROUP BY lower(regexp_replace(s.album, '\s+-\s+(Single|EP)$', '', 'i')), coalesce(s.artist_keys[1], lower(s.artist))
         ORDER BY plays DESC LIMIT 5`,
    ),
    q<{ day: string; plays: number }>("sum days", (db) =>
      db`SELECT to_char(to_timestamp(uts) AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day, count(*)::int AS plays
         FROM scrobbles WHERE uts >= ${f} AND uts < ${t} GROUP BY day ORDER BY day`,
    ),
    q<{ h: number; plays: number }>("sum clock", (db) =>
      db`SELECT extract(hour FROM to_timestamp(uts) AT TIME ZONE ${TZ})::int AS h, count(*)::int AS plays
         FROM scrobbles WHERE uts >= ${f} AND uts < ${t} GROUP BY h`,
    ),
    q<{ data: SavedPin }>("sum pins", (db) =>
      db`SELECT data FROM pins WHERE saved_at >= ${fi} AND saved_at < ${ti} ORDER BY saved_at DESC LIMIT 400`,
    ),
    q<{ n: number }>("sum pin count", (db) =>
      db`SELECT count(*)::int AS n FROM pins WHERE saved_at >= ${fi} AND saved_at < ${ti}`,
    ),
    q<{ repo: string; pushes: number; commits: number }>("sum code", (db) =>
      db`SELECT data->>'repo' AS repo, count(*)::int AS pushes, coalesce(sum((data->>'commits')::int), 0)::int AS commits
         FROM events WHERE kind = 'code' AND at >= ${fi} AND at < ${ti}
         GROUP BY repo ORDER BY pushes DESC`,
    ),
    q<{ type: string; count: number; m: number; s: number }>("sum activity", (db) =>
      db`SELECT coalesce(data->>'type', 'Workout') AS type, count(*)::int AS count,
                coalesce(sum((data->>'distanceM')::float), sum((data->>'distanceKm')::float * 1000), 0)::float AS m,
                coalesce(sum((data->>'movingS')::float), sum((data->>'minutes')::float * 60), 0)::float AS s
         FROM events WHERE kind IN ('activity', 'workout') AND at >= ${fi} AND at < ${ti}
         GROUP BY type ORDER BY count DESC`,
    ),
    q<{ days: number; steps: number | null; avg_steps: number | null; avg_sleep: number | null }>("sum health", (db) =>
      db`SELECT count(*)::int AS days, sum((data->>'steps')::float)::int AS steps,
                avg((data->>'steps')::float)::int AS avg_steps, avg((data->>'sleepHours')::float)::float AS avg_sleep
         FROM health_days WHERE day >= ${fi.slice(0, 10)}::date AND day < ${ti.slice(0, 10)}::date`,
    ),
    q<{ songs: number; artists: number }>("sum new", (db) =>
      db`SELECT
           (SELECT count(*)::int FROM (SELECT min(uts) AS m FROM scrobbles GROUP BY coalesce(song_key, track_key)) x
              WHERE m >= ${f} AND m < ${t}) AS songs,
           (SELECT count(*)::int FROM (SELECT min(s.uts) AS m FROM scrobbles s,
              unnest(coalesce(s.artist_keys, ARRAY[lower(s.artist)])) AS a(k) GROUP BY a.k) y
              WHERE m >= ${f} AND m < ${t}) AS artists`,
    ),
  ]);

  const tot = totals?.[0];
  const hours = new Array<number>(24).fill(0);
  for (const r of clock ?? []) hours[r.h] = r.plays;

  const pinList = (pins ?? []).map((r) => r.data);
  const boards = new Map<string, { name: string; url: string; count: number }>();
  for (const p of pinList) {
    if (!p.board || !p.boardUrl) continue;
    const b = boards.get(p.boardUrl) ?? { name: p.board, url: p.boardUrl, count: 0 };
    b.count++;
    boards.set(p.boardUrl, b);
  }

  return {
    from: fi,
    to: ti,
    music: {
      plays: tot?.plays ?? 0,
      songs: tot?.songs ?? 0,
      artists: tot?.artists ?? 0,
      minutes: tot?.ms ? Math.round(Number(tot.ms) / 60000) : 0,
      known: tot?.known ?? 0,
      newSongs: fresh?.[0]?.songs ?? 0,
      newArtists: fresh?.[0]?.artists ?? 0,
      topTracks: (tracks ?? []).map((r) => ({ track: r.track, artist: r.artist, plays: r.plays, image: r.image, url: r.link })),
      topArtists: artists ?? [],
      topAlbums: albums ?? [],
      byDay: days ?? [],
      clock: hours,
    },
    pins: {
      count: pinCount?.[0]?.n ?? 0,
      palette: pinList.flatMap((p) => (p.color ? [p.color] : [])).slice(0, 48),
      boards: [...boards.values()].sort((a, b) => b.count - a.count).slice(0, 6),
      picks: pinList.slice(0, 8).map((p) => ({ ...p, title: p.title ? p.title.slice(0, 140) : null })),
    },
    code: {
      pushes: (code ?? []).reduce((s, r) => s + r.pushes, 0),
      commits: (code ?? []).reduce((s, r) => s + r.commits, 0),
      repos: (code ?? []).map((r) => ({ name: r.repo, pushes: r.pushes })).slice(0, 8),
    },
    activity: {
      count: (acts ?? []).reduce((s, r) => s + r.count, 0),
      km: Math.round((acts ?? []).reduce((s, r) => s + r.m, 0) / 100) / 10,
      minutes: Math.round((acts ?? []).reduce((s, r) => s + r.s, 0) / 60),
      byType: (acts ?? []).map((r) => ({ type: r.type, count: r.count, km: Math.round(r.m / 100) / 10 })),
    },
    health: {
      days: health?.[0]?.days ?? 0,
      steps: health?.[0]?.steps ?? null,
      avgSteps: health?.[0]?.avg_steps ?? null,
      avgSleep: health?.[0]?.avg_sleep != null ? Math.round(health[0].avg_sleep * 10) / 10 : null,
    },
  };
}

/* ---- Named ranges in Pune time ---- */

const OFFSET = 5.5 * 3600_000;
const puneDate = (d = new Date()) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
const atPune = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - OFFSET);

export type RangeName = "today" | "week" | "month" | "year" | "all";

/**
 * "week" = the last 7 days, "month" = a calendar month (default: this one),
 * "year" = a calendar year (default: this one), "all" = everything.
 */
export function resolveRange(name: string, at?: string | null): { from: Date; to: Date; label: string } | null {
  const now = new Date();
  if (name === "today") return { from: atPune(puneDate()), to: roundToFive(now), label: "Today" };
  if (name === "week") {
    const to = roundToFive(now);
    return { from: new Date(to.getTime() - 7 * 86400_000), to, label: "The last 7 days" };
  }
  if (name === "month") {
    const m = at && /^\d{4}-\d{2}$/.test(at) ? at : puneDate().slice(0, 7);
    const next = new Date(`${m}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const label = new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    return { from: atPune(`${m}-01`), to: atPune(next.toISOString().slice(0, 10)), label };
  }
  if (name === "year") {
    const y = at && /^\d{4}$/.test(at) ? at : puneDate().slice(0, 4);
    return { from: atPune(`${y}-01-01`), to: atPune(`${Number(y) + 1}-01-01`), label: y };
  }
  if (name === "all") return { from: new Date(0), to: roundToFive(now), label: "Everything" };
  return null;
}

/** Round a "now"-ish time to five minutes, so live ranges share one cached answer. */
export const roundToFive = (d: Date) => new Date(Math.ceil(d.getTime() / 300_000) * 300_000);

/** A range summary, cached: a few minutes for ranges that include now, a day for the past. */
export async function cachedSummary(fromIso: string, toIso: string): Promise<RangeSummary> {
  "use cache: remote";
  const s = await summarise(new Date(fromIso), new Date(Math.min(Date.parse(toIso), Date.now())));
  const live = Date.parse(toIso) > Date.now() - 3600_000;
  const empty = !s.music.plays && !s.pins.count && !s.code.pushes;
  // An empty answer may just mean the store hasn't caught up yet: ask again soon.
  if (live || empty) cacheLife({ stale: 60, revalidate: empty ? 300 : 600, expire: 3600 });
  else cacheLife("days");
  return s;
}

/* ---- The year so far (annual-recap style, refreshed through the day) ---- */

export interface Replay {
  year: string;
  summary: RangeSummary;
  byMonth: { month: string; plays: number; topArtist: string | null; topTrack: string | null }[];
  busiestDay: { day: string; plays: number } | null;
  longestStreak: number;
  firstPlay: { track: string; artist: string; at: string } | null;
  /** How far back the store goes; the recap is only as complete as this. */
  storeFrom: string | null;
  generatedAt: string;
}

export async function getReplay(year?: string): Promise<Replay> {
  "use cache: remote";
  const range = resolveRange("year", year)!;
  const y = range.label;
  const f = Math.floor(range.from.getTime() / 1000);
  const t = Math.floor(range.to.getTime() / 1000);

  const [summary, months, first, oldest] = await Promise.all([
    summarise(range.from, new Date(Math.min(range.to.getTime(), Date.now()))),
    q<{ month: string; plays: number; top_artist: string | null; top_track: string | null }>("replay months", (db) =>
      db`WITH m AS (
           SELECT to_char(to_timestamp(uts) AT TIME ZONE ${TZ}, 'YYYY-MM') AS month, s.*
           FROM scrobbles s WHERE uts >= ${f} AND uts < ${t}
         ),
         ta AS (SELECT DISTINCT ON (month) month, name AS artist FROM (
           SELECT month, mode() WITHIN GROUP (ORDER BY a.name) AS name, count(*) n
           FROM m, unnest(coalesce(m.artist_keys, ARRAY[lower(m.artist)]), coalesce(m.artists, ARRAY[m.artist])) AS a(k, name)
           GROUP BY month, a.k) x ORDER BY month, n DESC),
         tt AS (SELECT DISTINCT ON (month) month, track FROM (
           SELECT month, mode() WITHIN GROUP (ORDER BY coalesce(title, track)) AS track, count(*) n
           FROM m GROUP BY month, coalesce(song_key, track_key)) y ORDER BY month, n DESC)
         SELECT m.month, count(*)::int AS plays, max(ta.artist) AS top_artist, max(tt.track) AS top_track
         FROM m LEFT JOIN ta USING (month) LEFT JOIN tt USING (month)
         GROUP BY m.month ORDER BY m.month`,
    ),
    q<{ track: string; artist: string; uts: string }>("replay first", (db) =>
      db`SELECT coalesce(title, track) AS track, coalesce(credit, artist) AS artist, uts::text
         FROM scrobbles WHERE uts >= ${f} AND uts < ${t} ORDER BY uts ASC LIMIT 1`,
    ),
    q<{ min: string | null }>("store from", (db) => db`SELECT min(uts)::text AS min FROM scrobbles`),
  ]);

  const days = summary.music.byDay;
  const busiest = days.reduce<{ day: string; plays: number } | null>((b, d) => (!b || d.plays > b.plays ? d : b), null);
  // Longest run of consecutive days with plays.
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of days) {
    const ts = Date.parse(`${d.day}T00:00:00Z`);
    run = prev !== null && ts - prev === 86400_000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = ts;
  }

  // Refreshed a few times a day; an empty recap (store still filling) is retried within minutes.
  if (summary.music.plays) cacheLife({ stale: 1800, revalidate: 3 * 3600, expire: 86400 });
  else cacheLife({ stale: 60, revalidate: 300, expire: 900 });

  return {
    year: y,
    summary,
    byMonth: (months ?? []).map((m) => ({ month: m.month, plays: m.plays, topArtist: m.top_artist, topTrack: m.top_track })),
    busiestDay: busiest,
    longestStreak: longest,
    firstPlay: first?.[0]
      ? { track: first[0].track, artist: first[0].artist, at: new Date(Number(first[0].uts) * 1000).toISOString() }
      : null,
    storeFrom: oldest?.[0]?.min ? new Date(Number(oldest[0].min) * 1000).toISOString() : null,
    generatedAt: new Date().toISOString(),
  };
}

/** Today's numbers from Apple Health, if the Shortcut has sent any. */
export async function healthToday(): Promise<{ day: string; steps: number | null; sleepHours: number | null } | null> {
  const day = puneDate();
  const rows = await q<{ data: { steps?: number | null; sleepHours?: number | null } }>("health today", (db) =>
    db`SELECT data FROM health_days WHERE day = ${day}::date`,
  );
  const d = rows?.[0]?.data;
  return d ? { day, steps: d.steps ?? null, sleepHours: d.sleepHours ?? null } : null;
}

/* ---- At a glance: every period side by side ---- */

export interface Overview {
  periods: { key: RangeName; label: string; summary: RangeSummary }[];
  generatedAt: string;
}

/** Today, the last 7 days, this month, this year and all time, together. Cached ten minutes. */
export async function getOverview(): Promise<Overview> {
  "use cache: remote";
  const names: [RangeName, string][] = [
    ["today", "Today"],
    ["week", "7 days"],
    ["month", "This month"],
    ["year", "This year"],
    ["all", "All time"],
  ];
  const periods = await Promise.all(
    names.map(async ([key, label]) => {
      const r = resolveRange(key)!;
      return { key, label, summary: await summarise(r.from, new Date(Math.min(r.to.getTime(), Date.now()))) };
    }),
  );
  const empty = !periods[4].summary.music.plays;
  cacheLife(empty ? { stale: 60, revalidate: 300, expire: 900 } : { stale: 300, revalidate: 600, expire: 3600 });
  return { periods, generatedAt: new Date().toISOString() };
}
