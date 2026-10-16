import { connection } from "next/server";
import { q, visitorKey } from "@/lib/db";

/**
 * Visitors so far: each person counts once a day, however many times they
 * load or refresh. Today's visitors are kept as one-way daily hashes (never an
 * address); each night they're folded into a plain number and deleted.
 */
export async function POST(req: Request) {
  const who = visitorKey(req);
  const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const rows = await q("visit", (db) =>
    db.transaction([
      db`INSERT INTO visitors (day, who) VALUES (${day}::date, ${who}) ON CONFLICT DO NOTHING`,
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
