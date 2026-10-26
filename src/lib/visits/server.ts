import "server-only";
import { kvSet, q } from "@/lib/db";
import { geoOf } from "@/lib/geo";
import { deviceName } from "@/lib/ua";
import { isBotAgent, isDatacentreTown, notOurPage } from "@/lib/bots";
import { createHash } from "node:crypto";
import { KEEP_DAYS, MAX_BOT_PAGES, MAX_EVENTS, botName, cleanPath, refHost, isTerminal, type EventRow, type PersonRow, type TrackBatch, type VisitRow } from "./shared";

const TZ = "Asia/Kolkata";
/** The browser sends a site name ("instagram.com"); anything else is dropped. */
const host = (h: unknown) => (typeof h === "string" && /^[a-z0-9.-]{1,80}$/i.test(h) && h.includes(".") ? h.toLowerCase() : null);
const screen = (s: unknown) => (s === "phone" || s === "tablet" || s === "desktop" ? s : null);
const clip = (s: unknown, n: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null);

/** The SHA-256 of a browser's code: what's kept to remember a person, and what /admin shows (12 characters of it). */
export const personHash = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");

/* ---- writing ---- */

/** A batch from a browser: the visit, and whatever happened since the last batch. */
export async function record(req: Request, b: TrackBatch): Promise<boolean> {
  const ua = req.headers.get("user-agent");
  const g = geoOf(req);
  const programUA = isBotAgent(ua);
  const headers = notOurPage(req);
  const farm = isDatacentreTown(g.city);
  const kind = programUA || b.bot || !b.human || headers || farm ? "bot" : "person";
  const reason = programUA
    ? `says it's a program (${botName(ua)})`
    : b.bot
      ? clip(b.bot, 80)
      : headers
        ? headers
        : farm
          ? `from a cloud datacentre town (${g.city})`
          : !b.human
            ? "didn't move, scroll or tap"
            : null;
  const events = b.events
    .filter((e) => Number.isInteger(e.seq) && e.seq >= 0 && e.seq < MAX_EVENTS && ["page", "click", "action"].includes(e.type))
    .slice(0, 100)
    .map((e) => ({
      seq: e.seq,
      // The browser's clock can be off; never in the future, never before the visit.
      at: new Date(Math.min(Date.now(), Number(e.at) || Date.now())).toISOString(),
      type: e.type,
      path: cleanPath(String(e.path ?? "/")),
      detail: clip(e.detail, 200),
      ms: Number.isFinite(e.ms) ? Math.max(0, Math.min(86_400_000, Math.round(e.ms!))) : null,
      scroll: Number.isFinite(e.scroll) ? Math.max(0, Math.min(100, Math.round(e.scroll!))) : null,
    }));

  const rows = await q<{ visitor: string | null }>("track visit", (db) =>
    db`INSERT INTO visits (id, visitor, kind, reason, city, country, device, lang, screen, referrer)
       SELECT ${b.s}, ${b.v}, ${kind}, ${reason}, ${g.city}, ${g.country}, ${programUA ? botName(ua) : deviceName(ua)},
              ${clip(b.lang, 16)}, ${screen(b.screen)}, ${host(b.ref)}
       -- A browser that just asked to be forgotten stays forgotten, even if a batch was still on its way.
       WHERE NOT EXISTS (SELECT 1 FROM kv WHERE key = ${`track:forgot:${b.v}`})
       ON CONFLICT (id) DO UPDATE SET
         last_at = now(),
         -- Once a person, always a person (they moved, then the tab went quiet).
         kind = CASE WHEN visits.kind = 'person' OR EXCLUDED.kind = 'person' THEN 'person' ELSE 'bot' END,
         reason = CASE WHEN visits.kind = 'person' OR EXCLUDED.kind = 'person' THEN NULL ELSE EXCLUDED.reason END,
         referrer = coalesce(visits.referrer, EXCLUDED.referrer)
       RETURNING visitor`,
  );
  // A visit belongs to the browser that started it.
  if (!rows?.length || rows[0].visitor !== b.v) return false;
  if (events.length) {
    await q("track events", (db) =>
      db`INSERT INTO visit_events (visit, seq, at, type, path, detail, ms, scroll)
         SELECT ${b.s}, * FROM unnest(
           ${events.map((e) => e.seq)}::int[], ${events.map((e) => e.at)}::timestamptz[], ${events.map((e) => e.type)}::text[],
           ${events.map((e) => e.path)}::text[], ${events.map((e) => e.detail)}::text[], ${events.map((e) => e.ms)}::int[], ${events.map((e) => e.scroll)}::smallint[])
         ON CONFLICT (visit, seq) DO UPDATE SET ms = coalesce(EXCLUDED.ms, visit_events.ms), scroll = greatest(EXCLUDED.scroll, visit_events.scroll)`,
    );
    await q("track totals", (db) =>
      db`UPDATE visits SET
           pages = (SELECT count(*) FROM visit_events WHERE visit = ${b.s} AND type = 'page'),
           active_ms = (SELECT coalesce(sum(ms), 0) FROM visit_events WHERE visit = ${b.s} AND type = 'page')
         WHERE id = ${b.s}`,
    );
  }
  return true;
}

/** A program asking for a page (from the proxy). One row per program, per country, per day. */
export async function recordBot(req: Request, path: string): Promise<void> {
  const ua = req.headers.get("user-agent");
  const name = botName(ua);
  const g = geoOf(req);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const id = `bot:${day}:${name}:${g.country ?? "-"}`.slice(0, 120);
  const reason = isTerminal(name) ? "a terminal (curl and friends)" : "says it's a program";
  await q("track bot", (db) =>
    db`WITH v AS (
         INSERT INTO visits (id, visitor, kind, reason, city, country, device, referrer, pages)
         VALUES (${id}, NULL, 'bot', ${reason}, ${g.city}, ${g.country}, ${name}, ${refHost(req.headers.get("referer"))}, 1)
         ON CONFLICT (id) DO UPDATE SET last_at = now(), pages = visits.pages + 1
         RETURNING pages
       )
       INSERT INTO visit_events (visit, seq, at, type, path, detail)
       SELECT ${id}, pages - 1, now(), 'page', ${cleanPath(path)}, ${req.method === "GET" ? null : req.method} FROM v WHERE pages <= ${MAX_BOT_PAGES}
       ON CONFLICT DO NOTHING`,
  );
}

/* ---- reading ---- */

type Raw = {
  id: string; visitor: string | null; kind: "person" | "bot"; reason: string | null; started_at: string; last_at: string;
  city: string | null; country: string | null; device: string | null; lang: string | null; screen: string | null; referrer: string | null;
  pages: number; active_ms: number; trail: string[] | null; nth: number | null;
};
const toRow = (r: Raw): VisitRow => ({
  id: r.id, visitor: r.visitor, kind: r.kind, reason: r.reason,
  startedAt: new Date(r.started_at).toISOString(), lastAt: new Date(r.last_at).toISOString(),
  city: r.city, country: r.country, device: r.device, lang: r.lang, screen: r.screen, referrer: r.referrer,
  pages: r.pages, activeMs: r.active_ms, trail: r.trail ?? [], nth: r.nth ?? undefined,
});

/** Visits in the last `hours`, newest first. */
export async function listVisits(hours: number, kind: "person" | "bot" | "all", limit = 400): Promise<VisitRow[]> {
  const h = Math.min(KEEP_DAYS * 24, Math.max(1, hours));
  const rows = await q<Raw>("visits list", (db) =>
    db`SELECT v.*, t.trail,
              CASE WHEN v.visitor IS NULL THEN NULL ELSE
                (SELECT count(*)::int FROM visits o WHERE o.visitor = v.visitor AND o.started_at <= v.started_at) END AS nth
       FROM visits v
       LEFT JOIN LATERAL (
         SELECT array_agg(path ORDER BY seq) AS trail FROM (SELECT path, seq FROM visit_events e WHERE e.visit = v.id AND e.type = 'page' ORDER BY seq LIMIT 40) x
       ) t ON true
       WHERE v.last_at > now() - make_interval(hours => ${h}) AND (${kind} = 'all' OR v.kind = ${kind})
       ORDER BY v.last_at DESC LIMIT ${limit}`,
  );
  return (rows ?? []).map(toRow);
}

/** People (one per browser code) seen in the last `hours`, most recent first, with their totals over the kept 30 days. */
export async function listPeople(hours: number, limit = 300): Promise<PersonRow[]> {
  const h = Math.min(KEEP_DAYS * 24, Math.max(1, hours));
  const rows = await q<{
    id: string; first_at: string; last_at: string; visits: number; pages: number; active_ms: number; places: string[] | null; devices: string[] | null;
    lang: string | null; screen: string | null; referrer: string | null; counted_at: string | null;
  }>("people list", (db) =>
    db`SELECT left(encode(sha256(convert_to(v.visitor, 'UTF8')), 'hex'), 12) AS id,
              min(v.started_at) AS first_at, max(v.last_at) AS last_at, count(*)::int AS visits,
              coalesce(sum(v.pages), 0)::int AS pages, coalesce(sum(v.active_ms), 0)::bigint AS active_ms,
              array_agg(DISTINCT concat_ws('|', coalesce(v.city, ''), coalesce(v.country, ''))) FILTER (WHERE v.city IS NOT NULL OR v.country IS NOT NULL) AS places,
              array_agg(DISTINCT v.device) FILTER (WHERE v.device IS NOT NULL) AS devices,
              (array_agg(v.lang ORDER BY v.last_at DESC) FILTER (WHERE v.lang IS NOT NULL))[1] AS lang,
              (array_agg(v.screen ORDER BY v.last_at DESC) FILTER (WHERE v.screen IS NOT NULL))[1] AS screen,
              (array_agg(v.referrer ORDER BY v.started_at) FILTER (WHERE v.referrer IS NOT NULL))[1] AS referrer,
              min(k.first_at) AS counted_at
       FROM visits v LEFT JOIN known_visitors k ON k.id = encode(sha256(convert_to(v.visitor, 'UTF8')), 'hex')
       WHERE v.kind = 'person' AND v.visitor IS NOT NULL
       GROUP BY v.visitor
       HAVING max(v.last_at) > now() - make_interval(hours => ${h})
       ORDER BY max(v.last_at) DESC LIMIT ${limit}`,
  );
  return (rows ?? []).map((r) => ({
    id: r.id, firstAt: new Date(r.first_at).toISOString(), lastAt: new Date(r.last_at).toISOString(),
    visits: r.visits, pages: r.pages, activeMs: Number(r.active_ms),
    places: (r.places ?? []).map((p) => {
      const [city, country] = p.split("|");
      return { city: city || null, country: country || null };
    }), devices: r.devices ?? [],
    lang: r.lang, screen: r.screen, referrer: r.referrer, countedAt: r.counted_at ? new Date(r.counted_at).toISOString() : null,
  }));
}

/** Every kept visit of one person, newest first, each with its trail. */
export async function personVisits(id: string): Promise<VisitRow[]> {
  if (!/^[a-f0-9]{8,64}$/.test(id)) return [];
  const rows = await q<Raw>("person visits", (db) =>
    db`SELECT v.*, t.trail,
              (row_number() OVER (ORDER BY v.started_at))::int AS nth
       FROM visits v
       LEFT JOIN LATERAL (
         SELECT array_agg(path ORDER BY seq) AS trail FROM (SELECT path, seq FROM visit_events e WHERE e.visit = v.id AND e.type = 'page' ORDER BY seq LIMIT 40) x
       ) t ON true
       WHERE v.kind = 'person' AND v.visitor IS NOT NULL AND encode(sha256(convert_to(v.visitor, 'UTF8')), 'hex') LIKE ${id + "%"}
       ORDER BY v.started_at DESC LIMIT 100`,
  );
  return (rows ?? []).map(toRow);
}

/** Everything that happened in one visit, in order. */
export async function visitEvents(id: string): Promise<EventRow[]> {
  const rows = await q<{ seq: number; at: string; type: EventRow["type"]; path: string; detail: string | null; ms: number | null; scroll: number | null }>(
    "visit events",
    (db) => db`SELECT seq, at, type, path, detail, ms, scroll FROM visit_events WHERE visit = ${id} ORDER BY seq LIMIT ${MAX_EVENTS}`,
  );
  return (rows ?? []).map((r) => ({ ...r, at: new Date(r.at).toISOString() }));
}

export interface VisitSummary {
  /** Last 24 hours. */
  day: { people: number; peopleVisits: number; bots: number; botPages: number; pages: number; countries: number };
  /** One bar per day, oldest first: the last 30 days in full, plus older days from the counts. */
  daily: { day: string; people: number; bots: number }[];
  /** Every country ever, people only. */
  countries: { country: string; visitors: number; visits: number }[];
  /** Last 30 days. */
  pages: { path: string; views: number }[];
  referrers: { referrer: string; visits: number }[];
  devices: { device: string; visits: number }[];
  bots: { name: string; pages: number; days: number }[];
  /** Since the log began. */
  allTime: { visitors: number; visits: number; since: string | null };
}

export async function summary(): Promise<VisitSummary> {
  const [day, daily, countries, pages, refs, devices, bots, all] = await Promise.all([
    q<VisitSummary["day"]>("vs day", (db) =>
      db`SELECT count(DISTINCT visitor) FILTER (WHERE kind = 'person')::int AS people,
                count(*) FILTER (WHERE kind = 'person')::int AS "peopleVisits",
                count(DISTINCT device) FILTER (WHERE kind = 'bot')::int AS bots,
                coalesce(sum(pages) FILTER (WHERE kind = 'bot'), 0)::int AS "botPages",
                coalesce(sum(pages) FILTER (WHERE kind = 'person'), 0)::int AS pages,
                count(DISTINCT country) FILTER (WHERE kind = 'person')::int AS countries
         FROM visits WHERE last_at > now() - interval '24 hours'`,
    ),
    q<{ day: string; people: number; bots: number }>("vs daily", (db) =>
      db`SELECT day::text, sum(people)::int AS people, sum(bots)::int AS bots FROM (
           SELECT (started_at AT TIME ZONE ${TZ})::date AS day,
                  count(DISTINCT visitor) FILTER (WHERE kind = 'person') AS people,
                  count(DISTINCT device) FILTER (WHERE kind = 'bot') AS bots
           FROM visits GROUP BY 1
           UNION ALL
           SELECT day, sum(visitors) FILTER (WHERE kind = 'person'), sum(visitors) FILTER (WHERE kind = 'bot') FROM visit_days GROUP BY day
         ) x WHERE day > (now() AT TIME ZONE ${TZ})::date - 60 GROUP BY day ORDER BY day`,
    ),
    q<{ country: string; visitors: number; visits: number }>("vs countries", (db) =>
      db`SELECT country, sum(visitors)::int AS visitors, sum(visits)::int AS visits FROM (
           SELECT coalesce(country, '') AS country, count(DISTINCT visitor) AS visitors, count(*) AS visits FROM visits WHERE kind = 'person' GROUP BY 1
           UNION ALL
           SELECT country, visitors, visits FROM visit_days WHERE kind = 'person'
         ) x GROUP BY country ORDER BY visitors DESC, visits DESC LIMIT 60`,
    ),
    q<{ path: string; views: number }>("vs pages", (db) =>
      db`SELECT e.path, count(*)::int AS views FROM visit_events e JOIN visits v ON v.id = e.visit
         WHERE e.type = 'page' AND v.kind = 'person' GROUP BY e.path ORDER BY views DESC LIMIT 15`,
    ),
    q<{ referrer: string; visits: number }>("vs refs", (db) =>
      db`SELECT coalesce(referrer, 'direct') AS referrer, count(*)::int AS visits FROM visits WHERE kind = 'person'
         GROUP BY 1 ORDER BY visits DESC LIMIT 10`,
    ),
    q<{ device: string; visits: number }>("vs devices", (db) =>
      db`SELECT coalesce(device, 'Unknown') AS device, count(*)::int AS visits FROM visits WHERE kind = 'person'
         GROUP BY 1 ORDER BY visits DESC LIMIT 8`,
    ),
    q<{ name: string; pages: number; days: number }>("vs bots", (db) =>
      db`SELECT coalesce(device, 'Unknown') AS name, sum(pages)::int AS pages, count(DISTINCT (started_at AT TIME ZONE ${TZ})::date)::int AS days
         FROM visits WHERE kind = 'bot' AND visitor IS NULL GROUP BY 1 ORDER BY pages DESC LIMIT 12`,
    ),
    q<{ visitors: number; visits: number; since: string | null }>("vs all", (db) =>
      db`SELECT (SELECT count(DISTINCT visitor) FROM visits WHERE kind = 'person')::int
                + coalesce((SELECT sum(visitors) FROM visit_days WHERE kind = 'person'), 0)::int AS visitors,
                (SELECT count(*) FROM visits WHERE kind = 'person')::int
                + coalesce((SELECT sum(visits) FROM visit_days WHERE kind = 'person'), 0)::int AS visits,
                least((SELECT min(started_at) FROM visits), (SELECT min(day)::timestamptz FROM visit_days))::text AS since`,
    ),
  ]);
  return {
    day: day?.[0] ?? { people: 0, peopleVisits: 0, bots: 0, botPages: 0, pages: 0, countries: 0 },
    daily: daily ?? [],
    countries: countries ?? [],
    pages: pages ?? [],
    referrers: refs ?? [],
    devices: devices ?? [],
    bots: bots ?? [],
    allTime: all?.[0] ? { ...all[0], since: all[0].since ? new Date(all[0].since).toISOString() : null } : { visitors: 0, visits: 0, since: null },
  };
}

/* ---- the visitor's own record ---- */

/** Everything kept about one browser, for "your visit" on /privacy. */
export async function mine(visitor: string): Promise<{ visits: (VisitRow & { events: EventRow[] })[] }> {
  const rows = await q<Raw>("visits mine", (db) =>
    db`SELECT v.*, NULL::text[] AS trail, NULL::int AS nth FROM visits v WHERE v.visitor = ${visitor} ORDER BY started_at DESC LIMIT 50`,
  );
  const visits = await Promise.all((rows ?? []).map(async (r) => ({ ...toRow(r), events: await visitEvents(r.id) })));
  return { visits };
}

/** "Forget me": every visit from this browser, gone, and nothing more accepted from its code. */
export async function forget(visitor: string): Promise<number> {
  await kvSet(`track:forgot:${visitor}`, { at: new Date().toISOString() });
  // The frozen "already counted" list holds a hash of this code too: gone with the rest.
  await q("visitor unknown", (db) => db`DELETE FROM known_visitors WHERE id = ${personHash(visitor)}`);
  const rows = await q<{ id: string }>("visits forget", (db) => db`DELETE FROM visits WHERE visitor = ${visitor} RETURNING id`);
  return rows?.length ?? 0;
}

/* ---- keeping it small ---- */

/**
 * Once a day: visits older than 30 days are folded into per-day, per-country
 * counts (and per-page view counts), then deleted with all their detail.
 * Whole days only, so a day is never counted twice.
 */
export async function foldOld(): Promise<{ folded: number }> {
  // Codes that asked to be forgotten only need blocking while a batch could still be on its way.
  await q("visits forgot", (db) => db`DELETE FROM kv WHERE key LIKE 'track:forgot:%' AND updated_at < now() - interval '2 days'`);
  // The first day still kept in full, in Pune's calendar.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
  const res = await q<{ n: number }>("visits fold", (db) =>
    db.transaction([
      db`INSERT INTO visit_days (day, country, kind, visitors, visits, pages)
         SELECT (started_at AT TIME ZONE ${TZ})::date, coalesce(country, ''), kind,
                count(DISTINCT coalesce(visitor, device)), count(*), coalesce(sum(pages), 0)
         FROM visits WHERE (started_at AT TIME ZONE ${TZ})::date < ${cutoff}::date
         GROUP BY 1, 2, 3
         ON CONFLICT (day, country, kind) DO UPDATE SET
           visitors = visit_days.visitors + EXCLUDED.visitors, visits = visit_days.visits + EXCLUDED.visits, pages = visit_days.pages + EXCLUDED.pages`,
      db`INSERT INTO visit_day_pages (day, path, kind, views)
         SELECT (v.started_at AT TIME ZONE ${TZ})::date, e.path, v.kind, count(*)
         FROM visits v JOIN visit_events e ON e.visit = v.id AND e.type = 'page'
         WHERE (v.started_at AT TIME ZONE ${TZ})::date < ${cutoff}::date
         GROUP BY 1, 2, 3
         ON CONFLICT (day, path, kind) DO UPDATE SET views = visit_day_pages.views + EXCLUDED.views`,
      db`WITH gone AS (DELETE FROM visits WHERE (started_at AT TIME ZONE ${TZ})::date < ${cutoff}::date RETURNING 1)
         SELECT count(*)::int AS n FROM gone`,
    ]),
  );
  const n = (res as unknown as { n: number }[][] | null)?.[2]?.[0]?.n ?? 0;
  return { folded: n };
}
