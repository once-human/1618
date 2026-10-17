import { connection } from "next/server";
import { isAdmin } from "@/lib/db";
import { searchPlaces } from "@/lib/admin/place";

/**
 * Towns for the place picker in /admin.
 *   ?q=beng            search by name
 *   ?lat=…&lon=…       "where I am now": the nearest town, from the browser's location
 */
export async function GET(req: Request) {
  await connection();
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  try {
    if (q.length >= 2) return Response.json({ results: await searchPlaces(q) });
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      // The town name from BigDataCloud's free reverse lookup, then the geocoder for its time zone.
      const r = (await (
        await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { signal: AbortSignal.timeout(5000) })
      ).json()) as { city?: string; locality?: string; principalSubdivision?: string; countryCode?: string };
      const name = r.city || r.locality;
      if (!name) return Response.json({ results: [] });
      const found = await searchPlaces(name, 10);
      // Prefer the match in the same country, nearest to where the browser says.
      const near = found
        .filter((f) => !r.countryCode || f.cc === r.countryCode)
        .sort((a, b) => Math.hypot(a.lat - lat, a.lon - lon) - Math.hypot(b.lat - lat, b.lon - lon));
      return Response.json({ results: near.slice(0, 1).map((f) => ({ ...f, lat, lon })) });
    }
    return Response.json({ results: [] });
  } catch {
    return Response.json({ results: [], error: "The place lookup isn't answering. Try again?" }, { status: 502 });
  }
}
