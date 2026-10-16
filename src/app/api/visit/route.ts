import { connection } from "next/server";
import { q } from "@/lib/db";

/** A plain hit counter: every page load adds one. Nothing about the visitor is kept. */
export async function POST() {
  const rows = await q<{ n: string }>("visit", (db) =>
    db`INSERT INTO counters (name, n) VALUES ('visits', 1)
       ON CONFLICT (name) DO UPDATE SET n = counters.n + 1 RETURNING n`,
  );
  return Response.json({ visits: rows?.[0] ? Number(rows[0].n) : null }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  await connection();
  const rows = await q<{ n: string }>("visits read", (db) => db`SELECT n FROM counters WHERE name = 'visits'`);
  return Response.json({ visits: rows?.[0] ? Number(rows[0].n) : 0 }, { headers: { "Cache-Control": "public, s-maxage=30" } });
}
