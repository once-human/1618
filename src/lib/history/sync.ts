import "server-only";
import { kvGet, kvSet, q } from "@/lib/db";
import { scrobbles, trackKey, type Scrobble } from "@/lib/presence/lastfm";
import { archivePins, getSaved } from "@/lib/presence/pinterest";
import { appleSong } from "@/lib/presence/server";
import { stravaActivities } from "./strava";

/**
 * The history store: a copy of everything the live sources show, kept for
 * good. Each sync pulls only what's new; Last.fm's older history is
 * backfilled a few thousand plays at a time until it reaches the very first
 * scrobble. Syncs run from the daily job, from an optional GitHub Actions
 * schedule, and whenever someone visits the site (at most every few minutes).
 */

const GH_USER = "once-human";
const MIN_GAP_MS = 5 * 60_000;
const BACKFILL_PAGES = 15; // × 200 plays per run

export interface SyncReport {
  ran: boolean;
  newPlays?: number;
  backfilled?: number;
  backfillDone?: boolean;
  pins?: number;
  code?: number;
  activities?: number;
  lengths?: number;
  ms?: number;
  skipped?: string;
}

async function storePlays(list: Scrobble[]): Promise<number> {
  if (!list.length) return 0;
  let added = 0;
  // Chunks keep each statement comfortably small.
  for (let i = 0; i < list.length; i += 1000) {
    const chunk = list.slice(i, i + 1000);
    const rows = await q<{ n: number }>("scrobbles insert", (db) =>
      db`WITH ins AS (
           INSERT INTO scrobbles (uts, track_key, track, artist, album)
           SELECT * FROM unnest(
             ${chunk.map((s) => s.uts)}::bigint[],
             ${chunk.map((s) => trackKey(s.artist, s.track))}::text[],
             ${chunk.map((s) => s.track)}::text[],
             ${chunk.map((s) => s.artist)}::text[],
             ${chunk.map((s) => s.album)}::text[]
           )
           ON CONFLICT DO NOTHING RETURNING 1
         ) SELECT count(*)::int AS n FROM ins`,
    );
    added += rows?.[0]?.n ?? 0;
  }
  return added;
}

/** New plays since the newest one stored. */
async function syncNewPlays(): Promise<number> {
  const rows = await q<{ max: string | null }>("scrobbles max", (db) => db`SELECT max(uts)::text AS max FROM scrobbles`);
  if (!rows) return 0;
  const newest = rows[0]?.max ? Number(rows[0].max) : null;
  const now = Math.floor(Date.now() / 1000);
  // First ever run: start with the last 30 days; the backfill does the rest.
  const list = await scrobbles(newest ? newest + 1 : now - 30 * 86400, now, newest ? 10 : 30);
  return list ? storePlays(list) : 0;
}

/** Older history, one batch per run, until Last.fm has nothing earlier. */
async function backfill(): Promise<{ added: number; done: boolean }> {
  const state = await kvGet<{ done: boolean }>("backfill:lastfm");
  if (state?.value.done) return { added: 0, done: true };
  const rows = await q<{ min: string | null }>("scrobbles min", (db) => db`SELECT min(uts)::text AS min FROM scrobbles`);
  const oldest = rows?.[0]?.min ? Number(rows[0].min) : null;
  if (!oldest) return { added: 0, done: false };
  const list = await scrobbles(1, oldest - 1, BACKFILL_PAGES);
  if (!list) return { added: 0, done: false };
  const added = await storePlays(list);
  const done = list.length < BACKFILL_PAGES * 200;
  if (done) await kvSet("backfill:lastfm", { done: true, at: new Date().toISOString() });
  return { added, done };
}

interface GhEvent {
  id: string;
  type: string;
  repo: { name: string };
  created_at: string;
  payload: { size?: number; ref?: string };
}

/** Public pushes. GitHub only keeps 90 days of events, so the store is the long memory. */
async function syncCode(): Promise<number> {
  try {
    const res = await fetch(`https://api.github.com/users/${GH_USER}/events/public?per_page=100`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "1618-portfolio",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return 0;
    const events = ((await res.json()) as GhEvent[]).filter((e) => e.type === "PushEvent");
    if (!events.length) return 0;
    const rows = await q<{ n: number }>("code insert", (db) =>
      db`WITH ins AS (
           INSERT INTO events (id, kind, at, data)
           SELECT * FROM unnest(
             ${events.map((e) => `gh:${e.id}`)}::text[],
             ${events.map(() => "code")}::text[],
             ${events.map((e) => e.created_at)}::timestamptz[],
             ${events.map((e) =>
               JSON.stringify({
                 repo: e.repo.name.split("/")[1],
                 url: `https://github.com/${e.repo.name}`,
                 branch: e.payload.ref?.replace("refs/heads/", "") ?? null,
                 commits: e.payload.size ?? null,
               }),
             )}::jsonb[]
           )
           ON CONFLICT DO NOTHING RETURNING 1
         ) SELECT count(*)::int AS n FROM ins`,
    );
    return rows?.[0]?.n ?? 0;
  } catch {
    return 0;
  }
}

async function syncActivities(): Promise<number> {
  const latest = await q<{ at: string | null }>("activity max", (db) =>
    db`SELECT max(at) AS at FROM events WHERE kind = 'activity'`,
  );
  const after = latest?.[0]?.at ? Math.floor(Date.parse(latest[0].at) / 1000) : 0;
  const list = await stravaActivities(after);
  if (!list?.length) return 0;
  const rows = await q<{ n: number }>("activity insert", (db) =>
    db`WITH ins AS (
         INSERT INTO events (id, kind, at, data)
         SELECT * FROM unnest(
           ${list.map((a) => `strava:${a.id}`)}::text[],
           ${list.map(() => "activity")}::text[],
           ${list.map((a) => a.start)}::timestamptz[],
           ${list.map((a) => JSON.stringify(a))}::jsonb[]
         )
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data RETURNING 1
       ) SELECT count(*)::int AS n FROM ins`,
  );
  return rows?.[0]?.n ?? 0;
}

/**
 * Song lengths, for "minutes listened". Last.fm doesn't know them, so the
 * most-played songs without one are looked up on Apple, a few per run.
 */
async function syncLengths(): Promise<number> {
  const todo = await q<{ track_key: string; track: string; artist: string; album: string | null }>("lengths todo", (db) =>
    db`SELECT s.track_key, min(s.track) AS track, min(s.artist) AS artist, min(s.album) AS album
       FROM scrobbles s LEFT JOIN track_meta m ON m.track_key = s.track_key
       WHERE m.track_key IS NULL
       GROUP BY s.track_key ORDER BY count(*) DESC LIMIT 12`,
  );
  if (!todo?.length) return 0;
  const found = await Promise.all(
    todo.map((t) => appleSong(t.artist, t.track, t.album, 2).catch(() => null)),
  );
  await q("lengths insert", (db) =>
    db`INSERT INTO track_meta (track_key, duration_ms, image, link)
       SELECT * FROM unnest(
         ${todo.map((t) => t.track_key)}::text[],
         ${found.map((f) => f?.durationMs ?? null)}::int[],
         ${found.map((f) => f?.art ?? null)}::text[],
         ${found.map((f) => f?.link ?? null)}::text[]
       )
       ON CONFLICT (track_key) DO UPDATE SET duration_ms = EXCLUDED.duration_ms, image = EXCLUDED.image, link = EXCLUDED.link, updated_at = now()`,
  );
  return found.filter((f) => f?.durationMs).length;
}

/** Run every sync, unless one ran in the last few minutes (pass force to override). */
export async function runSync({ force = false } = {}): Promise<SyncReport> {
  const last = await kvGet<{ at: string }>("sync:last");
  if (!force && last && Date.now() - Date.parse(last.value.at) < MIN_GAP_MS) {
    return { ran: false, skipped: "ran recently" };
  }
  await kvSet("sync:last", { at: new Date().toISOString() });
  const t0 = Date.now();
  const [newPlays, code, activities, pins] = await Promise.all([
    syncNewPlays(),
    syncCode(),
    syncActivities(),
    getSaved(4)
      .then(async (s) => {
        await archivePins(s.pins);
        return s.pins.length;
      })
      .catch(() => 0),
  ]);
  const [back, lengths] = await Promise.all([backfill(), syncLengths()]);
  const report: SyncReport = {
    ran: true,
    newPlays,
    backfilled: back.added,
    backfillDone: back.done,
    pins,
    code,
    activities,
    lengths,
    ms: Date.now() - t0,
  };
  console.info(`[sync] ${JSON.stringify(report)}`);
  return report;
}
