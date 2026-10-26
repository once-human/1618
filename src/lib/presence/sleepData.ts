import "server-only";
import { q } from "@/lib/db";
import { bursts, type Burst, type PastSleep } from "@/lib/presence/sleep";

/** Everything the sleep rules need from the database: the last 40 hours of activity as bursts, and the last nights I said good night. */
export async function sleepInputs(): Promise<{ bursts: Burst[]; past: PastSleep[] }> {
  const [plays, evs, pins, desk, sleeps] = await Promise.all([
    q<{ t: string }>("sleep plays", (db) => db`SELECT uts::text AS t FROM scrobbles WHERE uts > extract(epoch FROM now() - interval '40 hours')`),
    q<{ t: string }>("sleep events", (db) => db`SELECT extract(epoch FROM at)::text AS t FROM events WHERE kind <> 'sleep' AND at > now() - interval '40 hours'`),
    q<{ t: string }>("sleep pins", (db) => db`SELECT extract(epoch FROM saved_at)::text AS t FROM pins WHERE saved_at > now() - interval '40 hours'`),
    q<{ t: string }>("sleep desk", (db) => db`SELECT extract(epoch FROM at)::text AS t FROM desk_samples WHERE at > now() - interval '40 hours' AND data->>'active' = 'true'`),
    q<{ at: string; ended: string | null }>("sleep past", (db) => db`SELECT at::text AS at, data->>'endedAt' AS ended FROM events WHERE kind = 'sleep' ORDER BY at DESC LIMIT 14`),
  ]);
  const pts = [plays, evs, pins, desk].flatMap((r) => (r ?? []).map((x) => Math.round(Number(x.t) * 1000)));
  return {
    bursts: bursts(pts),
    past: (sleeps ?? []).map((s) => ({ at: Date.parse(s.at), endedAt: s.ended ? Date.parse(s.ended) : null })),
  };
}
