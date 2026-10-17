import { connection } from "next/server";
import { q, visitorKey } from "@/lib/db";
import { geoOf } from "@/lib/geo";
import { isBotAgent } from "@/lib/bots";

/**
 * Visitors so far: each person counts once a day, however many times they
 * load or refresh. Today's visitors are kept as one-way daily hashes (never an
 * address) with the town they came from, for today's map; each night they're
 * folded into a plain number and deleted.
 */
export async function POST(req: Request) {
  // Programs aren't visitors (the page only sends this after a person does something, but check anyway).
  if (isBotAgent(req.headers.get("user-agent"))) return Response.json({ visits: null }, { headers: { "Cache-Control": "no-store" } });
  const who = visitorKey(req);
  const g = geoOf(req);
  const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const rows = await q("visit", (db) =>
    db.transaction([
      db`INSERT INTO visitors (day, who, city, country, lat, lon) VALUES (${day}::date, ${who}, ${g.city}, ${g.country}, ${g.lat}, ${g.lon})
         ON CONFLICT (day, who) DO UPDATE SET
           city = coalesce(visitors.city, EXCLUDED.city), country = coalesce(visitors.country, EXCLUDED.country),
           lat = coalesce(visitors.lat, EXCLUDED.lat), lon = coalesce(visitors.lon, EXCLUDED.lon)`,
      db`SELECT (count(*) + coalesce((SELECT n FROM counters WHERE name = 'visitors_archived'), 0))::int AS n FROM visitors`,
    ]),
  );
  const n = (rows as unknown as { n: number }[][] | null)?.[1]?.[0]?.n ?? null;
  return Response.json({ visits: n }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  await connection();
  const rows = await q<{ n: number }>("visits read", (db) =>
    db`SELECT (count(*) + coalesce((SELECT n FROM counters WHERE name = 'visitors_archived'), 0))::int AS n FROM visitors`,
  );
  return Response.json({ visits: rows?.[0]?.n ?? 0 }, { headers: { "Cache-Control": "public, s-maxage=30" } });
}
