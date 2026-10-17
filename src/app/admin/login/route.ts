import { ADMIN_COOKIE, allow, isSiteKey, newSession, visitorKey } from "@/lib/db";

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
  const s = newSession();
  const res = back("");
  res.headers.append("Set-Cookie", `${ADMIN_COOKIE}=${s.value}; Path=/; Max-Age=${s.maxAge}; HttpOnly; Secure; SameSite=Strict`);
  return res;
}
