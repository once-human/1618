import "server-only";
import { kvGet, kvSet, q } from "@/lib/db";
import { scrobbles, trackKey, type Scrobble } from "@/lib/presence/lastfm";
import { archivePins, getSaved } from "@/lib/presence/pinterest";
import { appleSong, ghEvents } from "@/lib/presence/server";
import { mightBeSeveral, nameKey, parseCredit, splitCredit } from "./credits";

/**
 * The history store: a copy of everything the live sources show, kept for
 * good. Each sync pulls only what's new; Last.fm's older history is
 * backfilled a few thousand plays at a time until it reaches the very first
 * scrobble. Syncs run from the daily job, from an optional GitHub Actions
 * schedule, and whenever someone visits the site (at most every few minutes).
 */

const MIN_GAP_MS = 5 * 60_000;
const BACKFILL_PAGES = 15; // × 200 plays per run

export interface SyncReport {
  ran: boolean;
  newPlays?: number;
  backfilled?: number;
  backfillDone?: boolean;
  pins?: number;
  code?: number;
  lengths?: number;
  credits?: number;
  canon?: number;
  ms?: number;
  skipped?: string;
}

/** Credits known to be one act even though they contain "&", "x", etc. */
async function singleActs(): Promise<(s: string) => boolean> {
  const rows = await q<{ credit: string }>("singles", (db) => db`SELECT credit FROM artist_credits WHERE single`);
  const set = new Set((rows ?? []).map((r) => nameKey(r.credit)));
  return (s: string) => set.has(nameKey(s));
}

async function storePlays(list: Scrobble[]): Promise<number> {
  if (!list.length) return 0;
  const isSingle = await singleActs();
  const parsed = list.map((s) => parseCredit(s.track, s.artist, isSingle));
  let added = 0;
  // Chunks keep each statement comfortably small.
  for (let i = 0; i < list.length; i += 1000) {
    const chunk = list.slice(i, i + 1000);
    const pc = parsed.slice(i, i + 1000);
    const rows = await q<{ n: number }>("scrobbles insert", (db) =>
      db`WITH ins AS (
           INSERT INTO scrobbles (uts, track_key, track, artist, album, title, credit, artists, artist_keys, song_key)
           SELECT u, tk, tr, ar, al, ti, cr, string_to_array(arts, chr(31)), string_to_array(ks, chr(31)), sk FROM unnest(
             ${chunk.map((s) => s.uts)}::bigint[],
             ${chunk.map((s) => trackKey(s.artist, s.track))}::text[],
             ${chunk.map((s) => s.track)}::text[],
             ${chunk.map((s) => s.artist)}::text[],
             ${chunk.map((s) => s.album)}::text[],
             ${pc.map((c) => c.title)}::text[],
             ${pc.map((c) => c.credit)}::text[],
             ${pc.map((c) => c.artists.join("\u001f"))}::text[],
             ${pc.map((c) => c.keys.join("\u001f"))}::text[],
             ${pc.map((c) => c.songKey)}::text[]
           ) AS t(u, tk, tr, ar, al, ti, cr, arts, ks, sk)
           ON CONFLICT DO NOTHING RETURNING 1
         ) SELECT count(*)::int AS n FROM ins`,
    );
    added += rows?.[0]?.n ?? 0;
  }
  return added;
}

/**
 * Work out clean titles and individual artists for plays that don't have
 * them yet (older rows, or rows whose credit was just re-checked).
 */
async function canonicalise(): Promise<number> {
  const rows = await q<{ uts: string; track_key: string; track: string; artist: string }>("canon todo", (db) =>
    db`SELECT uts::text, track_key, track, artist FROM scrobbles WHERE song_key IS NULL LIMIT 3000`,
  );
  if (!rows?.length) return 0;
  const isSingle = await singleActs();
  const pc = rows.map((r) => parseCredit(r.track, r.artist, isSingle));
  await q("canon update", (db) =>
    db`UPDATE scrobbles s SET title = t.ti, credit = t.cr,
         artists = string_to_array(t.arts, chr(31)), artist_keys = string_to_array(t.ks, chr(31)), song_key = t.sk
       FROM unnest(
         ${rows.map((r) => r.uts)}::bigint[],
         ${rows.map((r) => r.track_key)}::text[],
         ${pc.map((c) => c.title)}::text[],
         ${pc.map((c) => c.credit)}::text[],
         ${pc.map((c) => c.artists.join("\u001f"))}::text[],
         ${pc.map((c) => c.keys.join("\u001f"))}::text[],
         ${pc.map((c) => c.songKey)}::text[]
       ) AS t(u, tk, ti, cr, arts, ks, sk)
       WHERE s.uts = t.u AND s.track_key = t.tk`,
  );
  return rows.length;
}

/**
 * Is "A & B" one act or two? Two, if I've ever played A or B on their own.
 * Otherwise ask Apple Music whether an artist by that exact name exists
 * (a duo like "Harlow & Vine" does; a one-off collaboration doesn't).
 * A few credits per run; each answer is rechecked weekly.
 */
async function verifyCredits(): Promise<number> {
  const todo = await q<{ artist: string }>("credits todo", (db) =>
    db`SELECT DISTINCT s.artist FROM scrobbles s
       LEFT JOIN artist_credits c ON c.credit = s.artist
       WHERE c.credit IS NULL OR c.checked_at < now() - interval '7 days'
       LIMIT 40`,
  );
  const candidates = (todo ?? []).map((r) => r.artist).filter(mightBeSeveral).slice(0, 8);
  let changed = 0;
  for (const credit of candidates) {
    const parts = splitCredit(credit);
    const alone = await q<{ n: number }>("credit parts alone", (db) =>
      db`SELECT count(*)::int AS n FROM scrobbles WHERE lower(artist) = ANY(${parts.map((p) => p.toLowerCase())}::text[])`,
    );
    let single = false;
    if ((alone?.[0]?.n ?? 0) === 0) {
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(credit)}&entity=musicArtist&limit=5&country=in`,
          { signal: AbortSignal.timeout(5000) },
        );
        const found = ((await res.json()) as { results?: { artistName: string }[] }).results ?? [];
        single = found.some((a) => nameKey(a.artistName) === nameKey(credit));
      } catch {
        continue; // try again next run
      }
    }
    const prev = await q<{ single: boolean }>("credit prev", (db) => db`SELECT single FROM artist_credits WHERE credit = ${credit}`);
    await q("credit save", (db) =>
      db`INSERT INTO artist_credits (credit, single, checked_at) VALUES (${credit}, ${single}, now())
         ON CONFLICT (credit) DO UPDATE SET single = EXCLUDED.single, checked_at = now()`,
    );
    if (prev?.[0]?.single !== undefined ? prev[0].single !== single : single) {
      // The answer changed how this credit splits: redo its plays.
      await q("credit redo", (db) => db`UPDATE scrobbles SET song_key = NULL WHERE artist = ${credit}`);
      changed++;
    }
  }
  return changed;
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

/** Public pushes. GitHub only keeps 90 days of events, so the store is the long memory. */
async function syncCode(): Promise<number> {
  const events = ((await ghEvents().catch(() => null)) ?? []).filter((e) => e.type === "PushEvent");
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
    todo.map((t) => appleSong(t.artist, t.track, t.album, 3).catch(() => null)),
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
  const [newPlays, code, pins] = await Promise.all([
    syncNewPlays(),
    syncCode(),
    getSaved(4)
      .then(async (s) => {
        await archivePins(s.pins);
        return s.pins.length;
      })
      .catch(() => 0),
  ]);
  const [back, lengths, credits] = await Promise.all([backfill(), syncLengths(), verifyCredits()]);
  const canon = await canonicalise();
  const report: SyncReport = {
    ran: true,
    newPlays,
    backfilled: back.added,
    backfillDone: back.done,
    pins,
    code,
    lengths,
    credits,
    canon,
    ms: Date.now() - t0,
  };
  console.info(`[sync] ${JSON.stringify(report)}`);
  return report;
}
