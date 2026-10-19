import "server-only";
import { kvGet, kvSet, q } from "@/lib/db";
import type { Bedtime } from "@/lib/presence/types";

/**
 * "Hey Siri, good night": the moment I went to bed. The site says so for
 * five hours, then quietly stops (I'm not going to say good morning). Every
 * bedtime is also kept in the history store, so the timeline remembers it.
 */
export const BED_HOURS = 5;
/** Saying it again soon after (or a shortcut retry) moves the same bedtime, rather than adding another. */
const AGAIN_MS = 30 * 60_000;

type Stored = Bedtime & { id: string };
const plain = ({ at, until, via }: Stored): Bedtime => ({ at, until, via });

/** Tonight's bedtime, while it still counts. */
export async function getBedtime(): Promise<Bedtime | null> {
  const row = await kvGet<Stored>("bedtime");
  if (!row || Date.parse(row.value.until) <= Date.now()) return null;
  return plain(row.value);
}

/** The last bedtime ever recorded, even long finished (for /status and /admin). */
export async function lastBedtime(): Promise<Bedtime | null> {
  const row = await kvGet<Stored>("bedtime");
  if (!row) return null;
  return plain(row.value);
}

export async function goToBed(via: Bedtime["via"]): Promise<Bedtime> {
  const now = Date.now();
  const cur = (await kvGet<Stored>("bedtime"))?.value;
  const again = cur && Date.parse(cur.until) > now && now - Date.parse(cur.at) < AGAIN_MS;
  const bed: Stored = {
    id: again ? cur.id : `sleep:${now}`,
    at: new Date(now).toISOString(),
    until: new Date(now + BED_HOURS * 3600_000).toISOString(),
    via,
  };
  await kvSet("bedtime", bed);
  await q("bedtime", (db) =>
    db`INSERT INTO events (id, kind, at, data) VALUES (${bed.id}, 'sleep', ${bed.at}, ${JSON.stringify({ via })}::jsonb)
       ON CONFLICT (id) DO UPDATE SET at = EXCLUDED.at, data = EXCLUDED.data`,
  );
  return plain(bed);
}

/** "I'm up": stop showing it now. The history keeps the bedtime, with when it ended. */
export async function endBedtime(): Promise<boolean> {
  const cur = (await kvGet<Stored>("bedtime"))?.value;
  if (!cur || Date.parse(cur.until) <= Date.now()) return false;
  const until = new Date().toISOString();
  await kvSet("bedtime", { ...cur, until });
  await q("bedtime end", (db) =>
    db`UPDATE events SET data = data || ${JSON.stringify({ endedAt: until })}::jsonb WHERE id = ${cur.id}`,
  );
  return true;
}
