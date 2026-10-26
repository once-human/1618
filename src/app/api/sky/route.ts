import { connection } from "next/server";

const LATS = Array.from({ length: 10 }, (_, i) => -60 + i * 15); // -60 … 75
const LONS = Array.from({ length: 24 }, (_, i) => -180 + i * 15); // -180 … 165

/**
 * Cloud cover over the whole planet, on a coarse grid, for the globe on /now.
 * Fetched here, once for everyone, and kept for half an hour, so visitors never
 * talk to the weather service themselves. If it fails the globe simply has no clouds.
 */
export async function GET() {
  await connection();
  const pts = LATS.flatMap((la) => LONS.map((lo) => [la, lo] as const));
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map((p) => p[0]).join(",")}&longitude=${pts.map((p) => p[1]).join(",")}&current=cloud_cover`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const json: unknown = await res.json();
    const arr = Array.isArray(json) ? json : [json];
    const cover = arr.map((o) => {
      const v = (o as { current?: { cloud_cover?: number } }).current?.cloud_cover;
      return typeof v === "number" ? Math.max(0, Math.min(100, Math.round(v))) : 0;
    });
    if (cover.length !== pts.length) throw new Error("unexpected shape");
    return Response.json({ lats: LATS, lons: LONS, cover, at: new Date().toISOString() }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
  } catch {
    return Response.json({ error: "no sky" }, { status: 502, headers: { "Cache-Control": "public, s-maxage=120" } });
  }
}
