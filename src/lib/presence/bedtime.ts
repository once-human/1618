import "server-only";
import { kvDelete, kvGet, kvSet, q } from "@/lib/db";
import type { Bedtime } from "@/lib/presence/types";
import { nightOf } from "@/lib/presence/asleep";

/**
 * "Hey Siri, good night": the moment I went to bed. The site says so for
 * seven hours, then quietly stops. Saying "good morning" (or doing something after the first two hours) ends it sooner.
 *
 * The history keeps one bedtime per night (noon to noon, so 23:30 and 01:00
 * are the same night), at the last time I went to bed that night:
 * - Good night again while still in bed just moves the time.
 * - Good night again after getting up carries on the same night.
 * - In bed for under ten minutes isn't sleep: that bedtime is dropped (or,
 *   if I'd already slept earlier that night, the night goes back to that).
 */
export const BED_HOURS = 7;
/** Shorter than this, it wasn't sleep. */
export const MIN_SLEEP_MS = 10 * 60_000;

interface Stored extends Bedtime {
  /** The history row for this night. */
  id: string;
  /** When this stretch in bed began (saying it again while in bed doesn't restart it). */
  stretchAt?: string;
  /** When I got up, if I said so ("I'm up"). */
  endedAt?: string | null;
  /** The night's earlier sleep, if I'd got up from one before this: where the night goes back to if this one's too short. */
  prev?: { at: string; until: string; endedAt: string | null } | null;
}
type Row = { via: Bedtime["via"]; endedAt?: string };

const plain = ({ at, until, via }: Stored): Bedtime => ({ at, until, via });

/** Tonight's bedtime, while it still counts. */
export async function getBedtime(): Promise<Bedtime | null> {
  const row = await kvGet<Stored>("bedtime");
  if (!row || Date.parse(row.value.until) <= Date.now()) return null;
  return plain(row.value);
}

/** The last bedtime recorded, even long finished (for /status and /admin). */
export async function lastBedtime(): Promise<Bedtime | null> {
  const row = await kvGet<Stored>("bedtime");
  return row ? plain(row.value) : null;
}

/** Went to bed just now. Null if the database couldn't be reached. */
export async function goToBed(via: Bedtime["via"]): Promise<Bedtime | null> {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const cur = (await kvGet<Stored>("bedtime"))?.value;
  const same = !!cur && nightOf(Date.parse(cur.at)) === nightOf(now);
  const inBed = same && Date.parse(cur.until) > now;

  const bed: Stored = {
    id: same ? cur.id : `sleep:${now}`,
    at,
    until: new Date(now + BED_HOURS * 3600_000).toISOString(),
    via,
    stretchAt: inBed ? (cur.stretchAt ?? cur.at) : at,
    endedAt: null,
    // Back to bed after getting up: the earlier sleep is what the night falls back to.
    prev: inBed ? (cur.prev ?? null) : same ? { at: cur.at, until: cur.until, endedAt: cur.endedAt ?? null } : null,
  };

  // The history row first: if the database can't be reached, nothing is half-saved and the caller hears so.
  const saved = await q("bedtime", (db) =>
    db`INSERT INTO events (id, kind, at, data) VALUES (${bed.id}, 'sleep', ${at}, ${JSON.stringify({ via } satisfies Row)}::jsonb)
       ON CONFLICT (id) DO UPDATE SET at = EXCLUDED.at, data = EXCLUDED.data`,
  );
  if (!saved) return null;
  await kvSet("bedtime", bed);
  return plain(bed);
}

/** "I'm up": stop showing it now. Under ten minutes in bed isn't sleep, and isn't kept. */
export async function endBedtime(): Promise<boolean> {
  const cur = (await kvGet<Stored>("bedtime"))?.value;
  const now = Date.now();
  if (!cur || Date.parse(cur.until) <= now) return false;
  const up = new Date(now).toISOString();
  const short = now - Date.parse(cur.stretchAt ?? cur.at) < MIN_SLEEP_MS;

  if (short && !cur.prev) {
    // The only time in bed tonight, and it lasted minutes: forget it.
    await q("bedtime drop", (db) => db`DELETE FROM events WHERE id = ${cur.id} AND kind = 'sleep'`);
    await kvDelete("bedtime");
    return true;
  }
  if (short && cur.prev) {
    // A too-short second try: the night goes back to the sleep before it.
    const { at, until, endedAt } = cur.prev;
    const row: Row = endedAt ? { via: cur.via, endedAt } : { via: cur.via };
    await q("bedtime back", (db) => db`UPDATE events SET at = ${at}, data = ${JSON.stringify(row)}::jsonb WHERE id = ${cur.id}`);
    await kvSet("bedtime", { ...cur, at, until, endedAt, prev: null } satisfies Stored);
    return true;
  }
  await q("bedtime end", (db) => db`UPDATE events SET data = ${JSON.stringify({ via: cur.via, endedAt: up } satisfies Row)}::jsonb WHERE id = ${cur.id}`);
  await kvSet("bedtime", { ...cur, until: up, endedAt: up } satisfies Stored);
  return true;
}
