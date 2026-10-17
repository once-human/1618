import "server-only";
import { kvGet, kvSet } from "@/lib/db";
import type { Place } from "@/lib/presence/server";

/**
 * Where I am: one place, city level. Set from /admin (picked from a list,
 * so it's exactly the right town) or by my phone's shortcut. While it's
 * held, the phone can't change it (for when I'd rather the site didn't
 * follow me around).
 */
export interface Hold {
  until: number | null; // null = until I let go
  setAt: string;
}

const round = (n: number) => Math.round(n * 10) / 10;

export async function heldUntil(): Promise<Hold | null> {
  const h = (await kvGet<Hold>("location:hold"))?.value ?? null;
  return h && (h.until === null || h.until > Date.now()) ? h : null;
}

export async function hold(hours: number | null): Promise<Hold> {
  const h = { until: hours ? Date.now() + hours * 3600_000 : null, setAt: new Date().toISOString() };
  await kvSet("location:hold", h);
  return h;
}

export const letGo = () => kvSet("location:hold", { until: 0, setAt: new Date().toISOString() });

export interface RecentPlace {
  city: string;
  country: string | null;
  lat: number;
  lon: number;
  tz: string;
}

export async function recentPlaces(): Promise<RecentPlace[]> {
  return (await kvGet<RecentPlace[]>("location:recent"))?.value ?? [];
}

export async function savePlace(p: { city: string; lat: number; lon: number; tz: string; country?: string | null }): Promise<Place> {
  const place: Place = { city: p.city.slice(0, 60), lat: round(p.lat), lon: round(p.lon), tz: p.tz, setAt: new Date().toISOString() };
  await kvSet("location", place);
  const recent = (await recentPlaces()).filter((r) => !(r.city === place.city && r.tz === place.tz));
  await kvSet("location:recent", [{ city: place.city, country: p.country ?? null, lat: place.lat, lon: place.lon, tz: place.tz }, ...recent].slice(0, 8));
  return place;
}

/** Look a town up by name (Open-Meteo's free geocoder). */
export async function searchPlaces(name: string, count = 8) {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=${count}&language=en&format=json`,
    { signal: AbortSignal.timeout(5000) },
  );
  const d = (await res.json()) as {
    results?: { name: string; latitude: number; longitude: number; timezone: string; country?: string; country_code?: string; admin1?: string; population?: number }[];
  };
  return (d.results ?? []).map((r) => ({
    city: r.name,
    region: r.admin1 ?? null,
    country: r.country ?? null,
    cc: r.country_code ?? null,
    lat: r.latitude,
    lon: r.longitude,
    tz: r.timezone,
    population: r.population ?? null,
  }));
}
