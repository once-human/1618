import { connection } from "next/server";
import { q, visitorKey } from "@/lib/db";
import { personHash } from "@/lib/visits/server";
import { ID } from "@/lib/visits/shared";
import { geoOf } from "@/lib/geo";
import { isBotAgent, isDatacentreTown, notOurPage } from "@/lib/bots";
import { allow } from "@/lib/db";

/**
 * Visitors so far: each person counts once, ever. The daily-changing hash of a connection (never an address)
 * is all the server keeps, so it can't follow anyone from one day to the next. The "once" is the browser's
 * doing: after it's been counted it remembers that in its own storage and doesn't ask again.
 * known_visitors is frozen: the people already counted before this change (as hashes of their log code), so
 * they're not counted a second time when they return. Nothing is added to it any more.
 * A browser that asked not to be tracked keeps no flag, so it's counted once a day.
 * The month's rows are kept with the town they came from, for the map; each month they're folded into a
 * plain number and deleted.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { v?: unknown } | null;
  const code = typeof body?.v === "string" && ID.test(body.v) ? body.v : null;
  // Programs aren't visitors (the page only sends this after a person does something, but check anyway).
  if (isBotAgent(req.headers.get("user-agent"))) return Response.json({ visits: null }, { headers: { "Cache-Control": "no-store" } });
  const g = geoOf(req);
  // Not from one of our pages, or from a datacentre town: a machine, not a visitor.
  if (notOurPage(req) || isDatacentreTown(g.city)) return Response.json({ visits: null }, { headers: { "Cache-Control": "no-store" } });
  const who = visitorKey(req);
  if (!(await allow(`visit:${who}`, 12, 3600))) return Response.json({ visits: null }, { headers: { "Cache-Control": "no-store" } });
  const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  // Counted before this change? Then not again.
  const legacy = code ? ((await q("visit known", (db) => db`SELECT 1 FROM known_visitors WHERE id = ${personHash(code)}`))?.length ?? 0) > 0 : false;
  const rows = await q("visit", (db) =>
    db.transaction([
      legacy
        ? db`SELECT 1`
        : db`INSERT INTO visitors (day, who, city, country, lat, lon) VALUES (${day}::date, ${who}, ${g.city}, ${g.country}, ${g.lat}, ${g.lon})
         ON CONFLICT (day, who) DO UPDATE SET
           city = coalesce(visitors.city, EXCLUDED.city), country = coalesce(visitors.country, EXCLUDED.country),
           lat = coalesce(visitors.lat, EXCLUDED.lat), lon = coalesce(visitors.lon, EXCLUDED.lon)`,
      db`SELECT (count(*) + coalesce((SELECT n FROM counters WHERE name = 'visitors_archived'), 0))::int AS n FROM visitors`,
    ]),
  );
  const n = (rows as unknown as { n: number }[][] | null)?.[1]?.[0]?.n ?? null;
  return Response.json({ visits: n, counted: n != null }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  await connection();
  const rows = await q<{ n: number }>("visits read", (db) =>
    db`SELECT (count(*) + coalesce((SELECT n FROM counters WHERE name = 'visitors_archived'), 0))::int AS n FROM visitors`,
  );
  return Response.json({ visits: rows?.[0]?.n ?? 0 }, { headers: { "Cache-Control": "public, s-maxage=30" } });
}
