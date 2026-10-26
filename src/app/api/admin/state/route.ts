import { connection } from "next/server";
import { isAdmin, kvGet, q } from "@/lib/db";
import { getMusic, getPlace, getPresence } from "@/lib/presence/server";
import { checkSources } from "@/lib/history/sources";
import { heldUntil, recentPlaces } from "@/lib/admin/place";
import { owner, telegramConfigured } from "@/lib/talk/telegram";
import { playedSince } from "@/lib/talk/played";
import { inBed } from "@/lib/presence/asleep";

/** Everything /admin shows, in one go. Admin only, never cached. */
export async function GET(req: Request) {
  await connection();
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

  const [presence, place, held, recent, music, sources, sync, backfill, counts, health, today, total, unverified, threads, posts, shortcuts, logins, me, nights, theme] = await Promise.all([
    getPresence(),
    getPlace(),
    heldUntil(),
    recentPlaces(),
    getMusic().catch(() => null),
    checkSources(),
    kvGet<{ at: string }>("sync:last"),
    kvGet<{ done: boolean }>("backfill:lastfm"),
    q<{ plays: number; first: string | null; pins: number; events: number; plays_today: number }>("admin counts", (db) =>
      db`SELECT (SELECT count(*)::int FROM scrobbles) AS plays,
                (SELECT to_char(to_timestamp(min(uts)) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') FROM scrobbles) AS first,
                (SELECT count(*)::int FROM pins) AS pins,
                (SELECT count(*)::int FROM events) AS events,
                (SELECT count(*)::int FROM scrobbles WHERE to_timestamp(uts) AT TIME ZONE 'Asia/Kolkata' >= ${day}::date) AS plays_today`,
    ),
    q<{ day: string; data: { steps?: number; distanceKm?: number; activeKcal?: number; sleepHours?: number }; updated_at: string }>("admin health", (db) =>
      db`SELECT day::text, data, updated_at FROM health_days ORDER BY day DESC LIMIT 30`,
    ),
    q<{ city: string | null; country: string | null; lat: number | null; lon: number | null; n: number }>("admin visitors", (db) =>
      db`SELECT city, country, round(avg(lat)::numeric, 1)::float AS lat, round(avg(lon)::numeric, 1)::float AS lon, count(*)::int AS n
         FROM visitors WHERE day >= ${day.slice(0, 8) + "01"}::date GROUP BY city, country ORDER BY n DESC`,
    ),
    q<{ n: number }>("admin visitors total", (db) =>
      db`SELECT (count(*) + coalesce((SELECT n FROM counters WHERE name = 'visitors_archived'), 0))::int AS n FROM visitors`,
    ),
    q<{ n: number }>("admin visitors unverified", (db) => db`SELECT n::int AS n FROM counters WHERE name = 'visitors_unverified'`),
    q<{
      id: string; name: string | null; city: string | null; country: string | null; page: string | null; via: string | null; blocked: boolean; admin_read_at: string | null; anon: boolean; ua: string | null; net: string | null; siblings: number;
      created_at: string; last_at: string; n: number; last_side: "visitor" | "me" | null; last_text: string | null; last_at_msg: string | null;
    }>("admin threads", (db) =>
      db`SELECT t.id, t.name, t.city, t.country, t.page, t.via, t.blocked, t.admin_read_at, t.anon, t.ua, t.net, t.created_at, t.last_at,
                (SELECT count(*)::int FROM talk_threads x WHERE x.net = t.net AND x.id <> t.id) AS siblings,
                (SELECT count(*)::int FROM talk_messages m WHERE m.thread = t.id) AS n,
                l.side AS last_side, l.text AS last_text, l.at AS last_at_msg
         FROM talk_threads t
         LEFT JOIN LATERAL (SELECT side, text, at FROM talk_messages m WHERE m.thread = t.id ORDER BY id DESC LIMIT 1) l ON true
         ORDER BY t.last_at DESC LIMIT 100`,
    ),
    q<{ id: number; kind: "song" | "note"; name: string | null; message: string | null; payload: { track?: string; artist?: string; art?: string | null; link?: string; preview?: string | null } | null; hidden: boolean; created_at: string }>(
      "admin posts",
      (db) => db`SELECT id, kind, name, message, payload, hidden, created_at FROM submissions ORDER BY created_at DESC LIMIT 200`,
    ),
    q<{ key: string }>("admin shortcuts", (db) => db`SELECT key FROM kv WHERE key LIKE 'shortcut:%'`),
    kvGet<{ at: string; city: string | null; country: string | null; device: string }[]>("admin:logins"),
    telegramConfigured() ? owner() : Promise.resolve(null),
    q<{ at: string; data: { via?: string; endedAt?: string } }>("admin nights", (db) =>
      db`SELECT at, data FROM events WHERE kind = 'sleep' ORDER BY at DESC LIMIT 14`,
    ),
    kvGet<string>("admin:theme"),
  ]);

  const songs = (posts ?? []).filter((p) => p.kind === "song" && p.payload?.track);
  const played = await playedSince(songs.map((s) => ({ id: s.id, track: s.payload!.track!, artist: s.payload!.artist!, at: new Date(s.created_at).toISOString() }))).catch(
    () => new Map(),
  );
  const c = counts?.[0];

  return Response.json(
    {
      at: new Date().toISOString(),
      theme: theme?.value === "light" ? "light" : "dark",
      place: { ...place, held, recent },
      weather: presence.weather,
      status: presence.status,
      bedtime: {
        // What the site is saying right now (it lets go early if I'm clearly up), and the raw window.
        shown: inBed(presence, Date.now()),
        window: presence.bedtime,
        nights: (nights ?? []).map((n) => ({ at: new Date(n.at).toISOString(), via: n.data?.via ?? null, endedAt: n.data?.endedAt ?? null })),
      },
      github: presence.github,
      music: music?.slice(0, 5) ?? null,
      health: (health ?? []).map((h) => ({ day: h.day, ...h.data, at: new Date(h.updated_at).toISOString() })),
      visitors: { unverified: unverified?.[0]?.n ?? 0, day, places: today ?? [], people: (today ?? []).reduce((a, p) => a + p.n, 0), total: total?.[0]?.n ?? null },
      talk: {
        telegram: { configured: telegramConfigured(), owner: me ? { name: me.name } : null },
        threads: (threads ?? []).map((t) => ({
          id: t.id, name: t.name, city: t.city, country: t.country, page: t.page, via: t.via, blocked: t.blocked,
          createdAt: new Date(t.created_at).toISOString(), lastAt: new Date(t.last_at).toISOString(), count: t.n,
          readAt: t.admin_read_at ? new Date(t.admin_read_at).toISOString() : null,
          anon: t.anon, device: t.ua, network: t.net ? t.net.slice(0, 6) : null, siblings: t.siblings,
          last: t.last_side ? { side: t.last_side, text: t.last_text ?? "", at: new Date(t.last_at_msg!).toISOString() } : null,
        })),
      },
      posts: (posts ?? []).map((p) => ({
        id: p.id, kind: p.kind, name: p.name, message: p.message, song: p.payload, hidden: p.hidden, at: new Date(p.created_at).toISOString(),
        played: played.get(p.id) ?? null,
      })),
      sources,
      store: c ? { ...c, lastSync: sync?.value.at ?? null, backfillDone: !!backfill?.value.done } : null,
      shortcuts: Object.fromEntries(["health", "location", "status", "goodnight"].map((k) => [k, (shortcuts ?? []).some((s) => s.key === `shortcut:${k}`)])),
      logins: logins?.value ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
