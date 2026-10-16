import "server-only";
import { kvGet, kvSet } from "@/lib/db";

/**
 * Strava: my runs, rides and walks. Turned on by a Strava API app
 * (STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET) and a one-time sign-in at
 * /api/strava/connect. Strava hands out a new refresh token now and then;
 * the latest one is kept in the database so access never lapses.
 * Only activities I've made public are shown on the site.
 */

export interface Activity {
  id: number;
  name: string;
  type: string;
  start: string;
  distanceM: number;
  movingS: number;
  elevationM: number | null;
  url: string;
}

export const stravaConfigured = () => !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);

/** Swap a sign-in code (or a refresh token) for tokens, and keep them. */
export async function stravaExchange(grant: { code: string } | { refresh: string }): Promise<boolean> {
  try {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        ...("code" in grant
          ? { grant_type: "authorization_code", code: grant.code }
          : { grant_type: "refresh_token", refresh_token: grant.refresh }),
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.warn(`[strava] token exchange failed ${res.status}`);
      return false;
    }
    const t = (await res.json()) as { access_token: string; expires_at: number; refresh_token: string };
    await kvSet("strava:token", { access: t.access_token, expiresAt: t.expires_at, refresh: t.refresh_token });
    return true;
  } catch (e) {
    console.warn(`[strava] token error: ${(e as Error).message}`);
    return false;
  }
}

async function accessToken(): Promise<string | null> {
  if (!stravaConfigured()) return null;
  const cached = await kvGet<{ access: string; expiresAt: number; refresh: string }>("strava:token");
  if (cached && cached.value.expiresAt * 1000 > Date.now() + 60_000) return cached.value.access;
  const refresh = cached?.value.refresh ?? process.env.STRAVA_REFRESH_TOKEN;
  if (!refresh) return null;
  if (!(await stravaExchange({ refresh }))) return null;
  return (await kvGet<{ access: string }>("strava:token"))?.value.access ?? null;
}

interface RawActivity {
  id: number;
  name: string;
  sport_type?: string;
  type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  total_elevation_gain?: number;
  visibility?: string;
  private?: boolean;
}

/** Public activities after a unix time, oldest first. */
export async function stravaActivities(after: number): Promise<Activity[] | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[strava] activities failed ${res.status}`);
      return null;
    }
    const list = (await res.json()) as RawActivity[];
    return list
      .filter((a) => !a.private && (a.visibility ?? "everyone") === "everyone")
      .map((a) => ({
        id: a.id,
        name: a.name,
        type: a.sport_type ?? a.type,
        start: a.start_date,
        distanceM: a.distance,
        movingS: a.moving_time,
        elevationM: a.total_elevation_gain ?? null,
        url: `https://www.strava.com/activities/${a.id}`,
      }));
  } catch (e) {
    console.warn(`[strava] activities error: ${(e as Error).message}`);
    return null;
  }
}
