import { connection } from "next/server";
import { q } from "@/lib/db";

/** Today's visitors (Pune's day), by town: for the map on /now. Only towns and counts. */
export async function GET() {
  await connection();
  const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const rows = await q<{ city: string | null; country: string | null; lat: number | null; lon: number | null; n: number }>(
    "visitors today",
    (db) =>
      db`SELECT city, country, round(avg(lat)::numeric, 1)::float AS lat, round(avg(lon)::numeric, 1)::float AS lon, count(*)::int AS n
         FROM visitors WHERE day = ${day}::date
         GROUP BY city, country ORDER BY n DESC, city LIMIT 200`,
  );
  const places = (rows ?? []).map((r) => ({ ...r, lat: r.lat == null ? null : Number(r.lat), lon: r.lon == null ? null : Number(r.lon) }));
  return Response.json(
    { day, people: places.reduce((a, p) => a + p.n, 0), places },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
