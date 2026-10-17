import { isAdmin, q } from "@/lib/db";

/**
 * Apple Health, sent by an iPhone Shortcut automation (Apple has no web
 * access to Health). Only what the Shortcut chooses to send is stored:
 *
 *   POST /api/ingest/health   Authorization: Bearer <ADMIN_SECRET>
 *   {
 *     "date": "2026-10-17",            // optional, defaults to today in Pune
 *     "steps": 8214,
 *     "distanceKm": 6.1,
 *     "activeKcal": 420,
 *     "sleepHours": 7.2,
 *     "workouts": [{ "type": "Running", "start": "2026-10-17T06:40:00+05:30", "minutes": 31, "distanceKm": 5.2, "kcal": 310 }]
 *   }
 *
 * Sending the same day again replaces its numbers, so the Shortcut can run
 * several times a day.
 */
// Shortcuts often sends quantities with their unit attached ("6.1 km", "8,214 steps").
const num = (v: unknown) => {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? parseFloat(v.replace(/,/g, "").replace(/^[^\d.-]+/, ""))
        : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export async function POST(req: Request) {
  if (!isAdmin(req)) return new Response("Not allowed", { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response("Send JSON", { status: 400 });
  }
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const day = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.date) ? body.date.slice(0, 10) : today;

  const data = {
    steps: num(body.steps),
    distanceKm: num(body.distanceKm),
    activeKcal: num(body.activeKcal),
    sleepHours: num(body.sleepHours),
  };
  await q("health day", (db) =>
    db`INSERT INTO health_days (day, data, updated_at) VALUES (${day}, ${JSON.stringify(data)}::jsonb, now())
       ON CONFLICT (day) DO UPDATE SET data = health_days.data || EXCLUDED.data, updated_at = now()`,
  );

  const workouts = Array.isArray(body.workouts) ? body.workouts : [];
  let saved = 0;
  for (const w of workouts.slice(0, 20)) {
    if (!w || typeof w !== "object") continue;
    const o = w as Record<string, unknown>;
    const start = typeof o.start === "string" && !Number.isNaN(Date.parse(o.start)) ? new Date(o.start).toISOString() : null;
    const type = typeof o.type === "string" ? o.type.slice(0, 40) : "Workout";
    if (!start) continue;
    const item = { type, minutes: num(o.minutes), distanceKm: num(o.distanceKm), kcal: num(o.kcal) };
    await q("workout", (db) =>
      db`INSERT INTO events (id, kind, at, data) VALUES (${`health:${start}:${type}`}, 'workout', ${start}, ${JSON.stringify(item)}::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
    );
    saved++;
  }
  return Response.json({ ok: true, day, data, workouts: saved });
}
