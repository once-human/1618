/**
 * Where a request comes from, at city level, from the headers Vercel adds.
 * Coordinates are rounded to about 10 km. Nothing finer is ever used.
 */
export interface Geo {
  city: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
}

const round = (v: string | null) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};

export function geoOf(req: Request): Geo {
  const h = req.headers;
  let city = h.get("x-vercel-ip-city");
  try {
    city = city ? decodeURIComponent(city) : null;
  } catch {
    /* keep as sent */
  }
  return {
    city: city?.slice(0, 60) || null,
    country: h.get("x-vercel-ip-country")?.slice(0, 2) || null,
    lat: round(h.get("x-vercel-ip-latitude")),
    lon: round(h.get("x-vercel-ip-longitude")),
  };
}

const regions = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

/** "Berlin, Germany", or just the country, or "somewhere". */
export function placeName(city: string | null | undefined, country: string | null | undefined): string {
  let c = country ?? null;
  try {
    c = country ? (regions?.of(country) ?? country) : null;
  } catch {
    /* unknown code */
  }
  if (city && c) return `${city}, ${c}`;
  return city || c || "somewhere";
}
