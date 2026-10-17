import { isAdmin } from "@/lib/db";
import { heldUntil, savePlace, searchPlaces } from "@/lib/admin/place";

/**
 * Where I am, for the weather and the clock. City level only: coordinates are
 * rounded to about 10 km, so the site never knows more than the town.
 *
 *   POST /api/location   Authorization: Bearer <ADMIN_SECRET>
 *   { "city": "Bengaluru" }                       — looked up by name, or
 *   { "city": "Bengaluru", "lat": 12.97, "lon": 77.59 }  — from the phone's location
 *
 * While a place is held in /admin, these updates are ignored.
 */
export async function POST(req: Request) {
  if (!(await isAdmin(req))) return new Response("Not allowed", { status: 401 });
  let body: Record<string, unknown> = {};
  try {
    body = (req.headers.get("content-type") ?? "").includes("form") ? Object.fromEntries((await req.formData()).entries()) : await req.json();
  } catch {
    return new Response("Send { city }", { status: 400 });
  }
  // While I'm holding a place in /admin, my phone's updates are politely ignored.
  const held = await heldUntil();
  if (held) return Response.json({ ok: true, held: true });

  const city = typeof body.city === "string" ? body.city.trim().slice(0, 60) : "";
  if (!city) return new Response("Send { city }", { status: 400 });
  // The name decides the place and its time zone; phone coordinates (rounded) refine the weather.
  const found = (await searchPlaces(city, 1).catch(() => []))[0];
  if (!found) return new Response(`Couldn't find "${city}"`, { status: 404 });
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const near = Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0;
  const place = await savePlace({ city: found.city, tz: found.tz, country: found.cc, lat: near ? lat : found.lat, lon: near ? lon : found.lon });
  return Response.json({ ok: true, place: { city: place.city, tz: place.tz } });
}
