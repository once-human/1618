import { ADMIN_COOKIE, allow, isSiteKey, kvGet, kvSet, newSession, visitorKey } from "@/lib/db";
import { geoOf } from "@/lib/geo";

/**
 * Log in to /admin with the site key. Guessing is slowed to a crawl: five
 * tries per network per 15 minutes, and 30 an hour across everyone. On
 * success the browser gets a 30-day login cookie the page's scripts can't
 * read and other sites can't send.
 */
export async function POST(req: Request) {
  const back = (q: string) => new Response(null, { status: 303, headers: { Location: `/admin${q}`, "Cache-Control": "no-store" } });
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") return back("");
  const okHere = await allow(`admin-login:${visitorKey(req)}`, 5, 900);
  const okAll = await allow("admin-login:all", 30, 3600);
  if (!okHere || !okAll) return back("?wait=1");

  const form = await req.formData().catch(() => null);
  const key = String(form?.get("key") ?? "").trim();
  if (!isSiteKey(key)) {
    await new Promise((r) => setTimeout(r, 800));
    return back("?wrong=1");
  }
  const s = await newSession();
  // Kept so /admin can show recent logins: when, from which town, on what.
  const ua = req.headers.get("user-agent") ?? "";
  const device = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "a browser";
  const g = geoOf(req);
  const logins = (await kvGet<{ at: string; city: string | null; country: string | null; device: string }[]>("admin:logins"))?.value ?? [];
  await kvSet("admin:logins", [{ at: new Date().toISOString(), city: g.city, country: g.country, device: `${device}, ${browser}` }, ...logins].slice(0, 8));
  const res = back("");
  res.headers.append("Set-Cookie", `${ADMIN_COOKIE}=${s.value}; Path=/; Max-Age=${s.maxAge}; HttpOnly; Secure; SameSite=Strict`);
  return res;
}
