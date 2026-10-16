import { isAdmin, kvSet } from "@/lib/db";
import type { Place } from "@/lib/presence/server";

/**
 * Where I am, for the weather and the clock. City level only: coordinates are
 * rounded to about 10 km, so the site never knows more than the town.
 *
 *   POST /api/location   Authorization: Bearer <ADMIN_SECRET>
 *   { "city": "Bengaluru" }                       — looked up by name, or
 *   { "city": "Bengaluru", "lat": 12.97, "lon": 77.59 }  — from the phone's location
 *
 * The /admin form posts here too.
 */
const round = (n: number) => Math.round(n * 10) / 10;

async function lookup(city: string): Promise<Place | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(5000) },
    );
    const r = ((await res.json()) as { results?: { name: string; latitude: number; longitude: number; timezone: string }[] }).results?.[0];
    return r ? { city: r.name, lat: round(r.latitude), lon: round(r.longitude), tz: r.timezone } : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return new Response("Not allowed", { status: 401 });
  const isForm = (req.headers.get("content-type") ?? "").includes("form");
  let body: Record<string, unknown> = {};
  try {
    body = isForm ? Object.fromEntries((await req.formData()).entries()) : await req.json();
  } catch {
    return new Response("Send { city }", { status: 400 });
  }
  const city = typeof body.city === "string" ? body.city.trim().slice(0, 60) : "";
  if (!city) return new Response("Send { city }", { status: 400 });

  // The name decides the place and its time zone; phone coordinates (rounded) refine the weather.
  const found = await lookup(city);
  if (!found) return new Response(`Couldn't find "${city}"`, { status: 404 });
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const place: Place = {
    ...found,
    ...(Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 ? { lat: round(lat), lon: round(lon) } : {}),
    setAt: new Date().toISOString(),
  };
  await kvSet("location", place);

  if (isForm) {
    const key = new URL(req.url).searchParams.get("key") ?? "";
    return Response.redirect(new URL(`/admin?key=${encodeURIComponent(key)}`, req.url), 303);
  }
  return Response.json({ ok: true, place: { city: place.city, tz: place.tz } });
}
